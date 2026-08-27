import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import { ptyManager } from './ptyManager'
import { agentTemplateStore } from './agentStore'
import type { AgentInstance } from '../shared/types'
import { ORCHESTRATION_POLICY } from '../shared/orchestrationPolicy'
import { adapterIdForTemplate } from './cliAdapters'
import { BUILT_IN_AGENT_PROFILES } from '../shared/agentProfiles'

class InstanceManager {
  private instances = new Map<string, AgentInstance>()

  list(): AgentInstance[] {
    return Array.from(this.instances.values())
  }

  create(templateId: string, cwd: string, sender: WebContents): AgentInstance[] {
    const template = agentTemplateStore.list().find((t) => t.id === templateId)
    if (!template) {
      throw new Error(`Unknown agent template: ${templateId}`)
    }

    if (this.instances.size >= ORCHESTRATION_POLICY.maxConcurrentRuns) {
      throw new Error(`동시 실행 한도(${ORCHESTRATION_POLICY.maxConcurrentRuns}개)에 도달했습니다.`)
    }

    const team = this.list()
      .filter((instance) => instance.templateId === templateId)
      .sort((a, b) => a.slotIndex - b.slotIndex)
    const maxTeamSize = ORCHESTRATION_POLICY.maxChildrenPerLead + 1
    if (team.length >= maxTeamSize) {
      throw new Error(`${template.name} 팀은 최대 ${maxTeamSize}개 세션까지 실행할 수 있습니다.`)
    }

    const leader = team.find((instance) => instance.rank === 'teamLead')
    const rank = leader ? 'subAgent' : 'teamLead'
    const usedSlots = new Set(team.map((instance) => instance.slotIndex))
    const slotIndex = Array.from({ length: maxTeamSize }, (_, index) => index).find(
      (index) => !usedSlots.has(index)
    )
    if (slotIndex === undefined) throw new Error(`${template.name} 팀에 빈 좌석이 없습니다.`)

    const ptyId = ptyManager.spawn(
      {
        command: template.command,
        args: template.args,
        cwd,
        env: template.env,
        adapterId: adapterIdForTemplate(template.id)
      },
      sender
    )

    const instance: AgentInstance = {
      instanceId: randomUUID(),
      templateId,
      cwd,
      ptyId,
      rank,
      slotIndex,
      parentInstanceId: leader?.instanceId ?? null,
      presence: 'deskIdle',
      profileId:
        BUILT_IN_AGENT_PROFILES.find(
          (profile) => profile.templateId === templateId && profile.slotIndex === slotIndex
        )?.profileId ?? `${templateId}:runtime-${slotIndex}`
    }
    this.instances.set(instance.instanceId, instance)
    return this.list()
  }

  createChild(parentInstanceId: string, sender: WebContents): AgentInstance[] {
    const parent = this.instances.get(parentInstanceId)
    if (!parent) throw new Error('하위 세션을 생성할 팀장 세션을 찾을 수 없습니다.')
    if (parent.rank !== 'teamLead') throw new Error('하위 세션은 팀장만 생성할 수 있습니다.')
    return this.create(parent.templateId, parent.cwd, sender)
  }

  restart(instanceId: string, sender: WebContents): AgentInstance[] {
    const instance = this.instances.get(instanceId)
    if (!instance) throw new Error('재시작할 에이전트 세션을 찾을 수 없습니다.')
    const template = agentTemplateStore.list().find((candidate) => candidate.id === instance.templateId)
    if (!template) throw new Error(`Unknown agent template: ${instance.templateId}`)

    ptyManager.kill(instance.ptyId)
    const ptyId = ptyManager.spawn(
      {
        command: template.command,
        args: template.args,
        cwd: instance.cwd,
        env: template.env,
        adapterId: adapterIdForTemplate(template.id)
      },
      sender
    )
    this.instances.set(instanceId, { ...instance, ptyId, presence: 'deskIdle' })
    return this.list()
  }

  remove(instanceId: string): AgentInstance[] {
    const instance = this.instances.get(instanceId)
    if (instance) {
      const removals = instance.rank === 'teamLead'
        ? this.list().filter((candidate) => candidate.templateId === instance.templateId)
        : [instance]
      for (const target of removals) {
        ptyManager.kill(target.ptyId)
        this.instances.delete(target.instanceId)
      }
    }
    return this.list()
  }
}

export const instanceManager = new InstanceManager()
