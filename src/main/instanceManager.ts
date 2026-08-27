import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import { ptyManager } from './ptyManager'
import { agentTemplateStore } from './agentStore'
import type { AgentInstance } from '../shared/types'
import { ORCHESTRATION_POLICY } from '../shared/orchestrationPolicy'

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
      { command: template.command, args: template.args, cwd, env: template.env },
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
      presence: 'deskIdle'
    }
    this.instances.set(instance.instanceId, instance)
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
