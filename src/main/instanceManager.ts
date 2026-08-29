import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import { ptyManager } from './ptyManager'
import { agentTemplateStore } from './agentStore'
import type { AgentInstance, AgentRun } from '../shared/types'
import { ORCHESTRATION_POLICY } from '../shared/orchestrationPolicy'
import { adapterIdForTemplate } from './cliAdapters'
import { buildAgentProfiles } from '../shared/agentProfiles'
import { ensureDeskWorktree, removeDeskWorktree } from './gitWorktreeManager'

class InstanceManager {
  private runs = new Map<string, AgentRun>()

  listRuns(): AgentRun[] {
    return Array.from(this.runs.values())
  }

  getRun(runId: string): AgentRun | undefined {
    return this.runs.get(runId)
  }

  private profiles() {
    return buildAgentProfiles(agentTemplateStore.list())
  }

  /** Compatibility projection while renderer callers migrate to profiles+runs. */
  list(): AgentInstance[] {
    return this.listRuns().flatMap((run) => {
      const profile = this.profiles().find((candidate) => candidate.profileId === run.profileId)
      if (!profile) return []
      return [{
        instanceId: run.runId,
        templateId: run.templateId,
        cwd: run.cwd,
        repoRoot: run.repoRoot,
        worktreeBranch: run.worktreeBranch,
        ptyId: run.ptyId,
        rank: profile.rank,
        slotIndex: profile.slotIndex,
        parentInstanceId: run.parentRunId,
        presence: run.presence,
        profileId: run.profileId
      }]
    })
  }

  async create(templateId: string, repoRoot: string, sender: WebContents): Promise<AgentInstance[]> {
    const template = agentTemplateStore.list().find((candidate) => candidate.id === templateId)
    if (!template) throw new Error(`Unknown agent template: ${templateId}`)
    if (this.runs.size >= ORCHESTRATION_POLICY.maxConcurrentRuns) {
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
    const usedSlots = new Set(team.map((instance) => instance.slotIndex))
    const slotIndex = Array.from({ length: maxTeamSize }, (_, index) => index).find(
      (index) => !usedSlots.has(index)
    )
    if (slotIndex === undefined) throw new Error(`${template.name} 팀에 빈 좌석이 없습니다.`)
    const profile = this.profiles().find(
      (candidate) => candidate.templateId === templateId && candidate.slotIndex === slotIndex
    )
    if (!profile) throw new Error(`${template.name} 팀의 좌석 프로필을 찾을 수 없습니다.`)

    const deskKey = `${templateId}-${slotIndex}`
    const worktree = await ensureDeskWorktree(repoRoot, deskKey).catch(() => null)
    const cwd = worktree?.path ?? repoRoot

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
    const run: AgentRun = {
      runId: randomUUID(),
      profileId: profile.profileId,
      templateId,
      cwd,
      repoRoot,
      worktreeBranch: worktree?.branch ?? null,
      baseSha: worktree?.baseSha ?? null,
      ptyId,
      parentRunId: leader?.instanceId ?? null,
      presence: 'deskIdle'
    }
    this.runs.set(run.runId, run)
    return this.list()
  }

  async createChild(parentInstanceId: string, sender: WebContents): Promise<AgentInstance[]> {
    const parent = this.runs.get(parentInstanceId)
    if (!parent) throw new Error('하위 세션을 생성할 팀장 세션을 찾을 수 없습니다.')
    const profile = this.profiles().find((candidate) => candidate.profileId === parent.profileId)
    if (profile?.rank !== 'teamLead') throw new Error('하위 세션은 팀장만 생성할 수 있습니다.')
    return this.create(parent.templateId, parent.repoRoot, sender)
  }

  async restart(instanceId: string, sender: WebContents): Promise<AgentInstance[]> {
    const run = this.runs.get(instanceId)
    if (!run) throw new Error('재시작할 에이전트 세션을 찾을 수 없습니다.')
    const template = agentTemplateStore.list().find((candidate) => candidate.id === run.templateId)
    if (!template) throw new Error(`Unknown agent template: ${run.templateId}`)

    ptyManager.kill(run.ptyId)
    const ptyId = ptyManager.spawn(
      {
        command: template.command,
        args: template.args,
        cwd: run.cwd,
        env: template.env,
        adapterId: adapterIdForTemplate(template.id)
      },
      sender
    )
    this.runs.set(instanceId, { ...run, ptyId, presence: 'deskIdle' })
    return this.list()
  }

  async remove(instanceId: string): Promise<AgentInstance[]> {
    const run = this.runs.get(instanceId)
    if (!run) return this.list()
    const profile = this.profiles().find((candidate) => candidate.profileId === run.profileId)
    const removals = profile?.rank === 'teamLead'
      ? this.listRuns().filter((candidate) => candidate.templateId === run.templateId)
      : [run]
    for (const target of removals) {
      ptyManager.kill(target.ptyId)
      this.runs.delete(target.runId)
      if (target.worktreeBranch) {
        await removeDeskWorktree(target.repoRoot, target.cwd).catch(() => {})
      }
    }
    return this.list()
  }
}

export const instanceManager = new InstanceManager()
