import { randomUUID } from 'crypto'
import { BrowserWindow, type WebContents } from 'electron'
import { TaskRecoveryStore } from './taskRecoveryStore'
import { workspaceFiles } from './workspaceStore'
import { instanceManager } from './instanceManager'
import { ptyManager } from './ptyManager'
import { taskWorkspaceManager } from './taskWorkspaceManager'
import { TASK_DOCUMENTS_FOLDER } from '../shared/workspaceLayout'
import { meetingPlanningRequest, pendingMeetingQuestions, validateMeetingDraft, type MeetingDraft } from '../shared/meetingNotes'
import type { AgentInstance, TaskCommand, TaskDispatch, TaskRestoreResult, TaskWorkspace, TrackedTask } from '../shared/types'

class TaskRecovery {
  readonly bootId = randomUUID()
  private saved?: TaskRecoveryStore
  private resuming = new Map<string, Promise<string[]>>()
  private meetingPlans = new Map<string, Promise<TaskRestoreResult>>()
  private pendingChecks = new Set<string>()
  private bindings = new Map<string, { taskId: string; commandId: string; ptyId: string }>()
  private timer?: ReturnType<typeof setInterval>

  private store(): TaskRecoveryStore { return this.saved ??= new TaskRecoveryStore(workspaceFiles()) }
  list(): TrackedTask[] { return this.store().list() }
  hasActiveCommand(ptyId: string): boolean {
    return [...this.bindings.values()].some(binding => binding.ptyId === ptyId &&
      this.store().get(binding.taskId).commands.some(command => command.id === binding.commandId && ['queued', 'running'].includes(command.status)))
  }
  private broadcast(): void {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('tasks:changed', this.list())
  }

  start(): void {
    if (this.timer) return
    ptyManager.onPromptLifecycle(event => {
      const binding = this.bindings.get(event.promptId)
      if (!binding) return
      try {
        if (this.store().get(binding.taskId).commands.find(command => command.id === binding.commandId)?.attemptId !== event.promptId) return
        if (event.state === 'started') this.store().setStatus(binding.taskId, binding.commandId, 'running', '')
        else if (event.state === 'interrupted') this.store().setStatus(binding.taskId, binding.commandId, 'interrupted', event.reason ?? 'CLI 중단')
        else void this.check(binding.taskId, binding.commandId)
        this.broadcast()
      } catch (error) { console.error('Task checkpoint failed:', error) }
    })
    this.timer = setInterval(() => {
      try {
        for (const binding of this.bindings.values()) {
          void this.check(binding.taskId, binding.commandId)
        }
      } catch (error) { console.error('Task recovery polling failed:', error) }
    }, 1500)
    this.timer.unref()
  }

  private async check(taskId: string, commandId: string): Promise<void> {
    if (this.pendingChecks.has(commandId)) return
    this.pendingChecks.add(commandId)
    try {
      if (await this.store().acceptReceipt(taskId, commandId)) {
        for (const [attempt, binding] of this.bindings) if (binding.commandId === commandId) this.bindings.delete(attempt)
        this.broadcast()
      }
    }
    catch (error) { console.error('Task completion record failed:', error) }
    finally { this.pendingChecks.delete(commandId) }
  }

  register(workspace: TaskWorkspace, request: string, projectPath: string): void {
    this.store().register(workspace, request, projectPath)
    this.broadcast()
  }

  async planMeeting(draft: MeetingDraft, sender: WebContents): Promise<TaskRestoreResult> {
    validateMeetingDraft(draft)
    if (!draft.endedAt || !draft.entries.length || pendingMeetingQuestions(draft).length) throw new Error('회의를 마치고 세 에이전트의 답변을 받은 뒤 SRS를 작성할 수 있습니다.')
    const active = this.meetingPlans.get(draft.meetingId)
    if (active) return active
    const projectPath = workspaceFiles().path(draft.projectPath)
    let task = this.list().find(item => item.sourceId === draft.meetingId)
    if (task && task.projectPath !== projectPath) throw new Error('회의 프로젝트가 변경되었습니다.')
    if (!task) {
      if (this.list().some(item => item.projectPath === projectPath && ['planning', 'review'].includes(item.stage))) throw new Error('기존 기획을 승인하거나 취소한 뒤 회의 SRS 작성을 다시 눌러주세요. 회의 내용은 보관됩니다.')
      const request = meetingPlanningRequest(draft)
      const workspace = taskWorkspaceManager.prepare(workspaceFiles().path(TASK_DOCUMENTS_FOLDER), request)
      this.store().register(workspace, request, projectPath, draft.meetingId)
      task = this.store().get(workspace.taskId)
      this.broadcast()
    }
    const taskId = task.taskId
    const pending = (async () => {
      const notices = await this.restoreTasks(sender, projectPath, taskId)
      return { bootId: this.bootId, tasks: this.list(), instances: instanceManager.list(), notices }
    })()
    this.meetingPlans.set(draft.meetingId, pending)
    try { return await pending } finally { this.meetingPlans.delete(draft.meetingId) }
  }

  async dispatch(request: TaskDispatch): Promise<void> {
    const instances = instanceManager.list()
    const commands = this.store().enqueue(request, instances)
    this.broadcast()
    for (const command of commands) {
      const instance = instances.find(item => item.profileId === command.profileId)!
      await this.deliver(request.taskId, command, instance)
    }
  }

  private async deliver(taskId: string, command: TaskCommand, instance: AgentInstance): Promise<void> {
    try {
      const prompt = await this.store().prompt(taskId, command)
      if (this.store().get(taskId).stage === 'cancelled') return
      this.bindings.set(command.attemptId, { taskId, commandId: command.id, ptyId: instance.ptyId })
      ptyManager.sendPrompt(instance.ptyId, prompt, command.attemptId)
    } catch (error) {
      this.store().setStatus(taskId, command.id, 'interrupted', String(error))
      throw error
    }
  }

  approve(taskId: string): void { this.store().approve(taskId); this.broadcast() }
  cancel(taskId: string): void {
    const pending = new Set(this.store().get(taskId).commands.filter(command => ['queued', 'running', 'interrupted'].includes(command.status)).map(command => command.attemptId))
    this.store().cancel(taskId)
    for (const [attempt, binding] of this.bindings) if (binding.taskId === taskId) {
      if (pending.has(attempt)) ptyManager.cancelPrompt(binding.ptyId)
      this.bindings.delete(attempt)
    }
    this.broadcast()
  }

  /** Reports and diff comments belong to the same documented task as their session. */
  async dispatchRelated(ptyId: string, prompt: string): Promise<boolean> {
    const instance = instanceManager.list().find(item => item.ptyId === ptyId)
    if (!instance) return false
    const task = this.list().reverse().find(item => item.projectPath === instance.repoRoot && ['execution', 'completed'].includes(item.stage) &&
      item.commands.some(command => command.profileId === instance.profileId))
    if (!task) return false
    await this.dispatch({ taskId: task.taskId, stage: 'execution', assignments: [{ instanceId: instance.instanceId, prompt, role: '추가 지시·결과 취합' }] })
    return true
  }

  async ensureProject(instanceIds: string[], projectPath: string, sender: WebContents): Promise<AgentInstance[]> {
    const targets = instanceIds.map(id => {
      const instance = instanceManager.list().find(item => item.instanceId === id)
      if (!instance) throw new Error('프로젝트를 맡길 세션을 찾을 수 없습니다.')
      return instance
    })
    for (const target of targets) await this.ensureInstance({ projectPath }, target, sender, false)
    return instanceManager.list()
  }

  private async ensureInstance(task: Pick<TrackedTask, 'projectPath'>, command: Pick<TaskCommand, 'profileId' | 'templateId'> & { cwd?: string }, sender: WebContents, restoreCwd = true): Promise<AgentInstance> {
    for (let attempt = 0; attempt < 7; attempt++) {
      const existing = instanceManager.list().find(item => item.profileId === command.profileId)
      if (existing) {
        if (existing.repoRoot !== task.projectPath) {
          const team = instanceManager.list().filter(item => item.templateId === existing.templateId)
          const states = ptyManager.getStates()
          if (team.some(item => states.some(state => state.ptyId === item.ptyId && ['working', 'waiting'].includes(state.state)) ||
            this.list().some(saved => saved.commands.some(work => work.profileId === item.profileId &&
              this.bindings.has(work.attemptId) && ['queued', 'running'].includes(work.status))))) {
            throw new Error('이 캐릭터는 다른 프로젝트를 작업 중입니다. 해당 작업이 끝난 뒤 프로젝트를 전환해주세요.')
          }
          for (const item of team) instanceManager.detach(item.instanceId)
          continue
        }
        if (restoreCwd && command.cwd && workspaceFiles().path(existing.cwd) !== workspaceFiles().path(command.cwd)) throw new Error('저장된 작업본 위치가 달라 인수인계를 중단했습니다.')
        if (!ptyManager.getStates().some(state => state.ptyId === existing.ptyId)) {
          return (await instanceManager.restart(existing.instanceId, sender)).find(item => item.profileId === command.profileId)!
        }
        return existing
      }
      await instanceManager.create(command.templateId, task.projectPath, sender)
    }
    throw new Error('인수인계할 캐릭터의 자리를 찾을 수 없습니다.')
  }

  async restore(_sender: WebContents): Promise<TaskRestoreResult> {
    this.start()
    // Startup only lists saved metadata. No agent, task document, or Git read.
    return { bootId: this.bootId, instances: instanceManager.list(), tasks: this.list(), notices: [] }
  }

  async resume(projectPath: string, sender: WebContents): Promise<TaskRestoreResult> {
    projectPath = workspaceFiles().path(projectPath)
    let pending = this.resuming.get(projectPath)
    if (!pending) {
      pending = this.restoreTasks(sender, projectPath)
      this.resuming.set(projectPath, pending)
    }
    try {
      const notices = await pending
      return { bootId: this.bootId, instances: instanceManager.list(), tasks: this.list(), notices }
    } finally { this.resuming.delete(projectPath) }
  }

  private async restoreTasks(sender: WebContents, projectPath: string, taskId?: string): Promise<string[]> {
    const notices: string[] = []
    const selected = () => this.list().filter(task => task.projectPath === projectPath && (!taskId || task.taskId === taskId) && !['completed', 'cancelled'].includes(task.stage))
    // A receipt may have been written immediately before the old process closed.
    for (const task of selected()) for (const command of task.commands) await this.check(task.taskId, command.id)
    for (const task of selected()) {
      try {
        let commands = task.commands.filter(command => ['queued', 'running', 'interrupted'].includes(command.status))
        if (task.stage === 'review') {
          for (const command of task.commands.filter(item => item.stage === 'planning')) await this.ensureInstance(task, command, sender)
          notices.push(`“${task.title}” 기획은 승인 대기 상태로 복원했습니다.`)
          continue
        }
        if (!commands.length) {
          const previous = task.commands.filter(command => command.stage === 'planning')
          const targets = previous.length ? [...new Map(previous.map(command => [command.profileId, command])).values()] :
            [{ profileId: 'claude-code:lead', templateId: 'claude-code' }]
          const assignments = []
          for (const target of targets) {
            const instance = await this.ensureInstance(task, target, sender)
            assignments.push({ instanceId: instance.instanceId, role: task.stage === 'planning' ? '기획 이어가기' : '승인된 구현 이어가기',
              prompt: task.stage === 'planning' ? '요청에 맞게 통합 SRS와 Phase를 구체화하세요. 구현은 하지 마세요.' : '승인된 통합 SRS와 Phase의 미완료 업무를 구현하고 검증하세요.' })
          }
          commands = this.store().enqueue({ taskId: task.taskId, stage: task.stage === 'planning' ? 'planning' : 'execution', assignments }, instanceManager.list())
        }
        for (const old of commands) {
          const binding = this.bindings.get(old.attemptId)
          if (binding && ptyManager.getStates().some(item => item.ptyId === binding.ptyId) &&
            ['queued', 'running'].includes(old.status)) continue
          const instance = await this.ensureInstance(task, old, sender)
          const command = this.store().resume(task.taskId, old.id)
          await this.deliver(task.taskId, command, instance)
        }
        notices.push(`“${task.title}” 작업을 새 세션에 인수인계했습니다. SRS·개발 기록·Git 확인 후 이어갑니다.`)
      } catch (error) { notices.push(`“${task.title}” 인수인계 대기: ${String(error)}`) }
    }
    this.broadcast()
    if (!notices.length) notices.push('선택한 프로젝트에 이어갈 미완료 작업이 없습니다.')
    return notices
  }

  checkpoint(): void {
    for (const task of this.list()) for (const command of task.commands) {
      if (['queued', 'running'].includes(command.status)) this.store().setStatus(task.taskId, command.id, 'interrupted', 'IDE 종료. 프로젝트를 선택하면 새 세션이 문서·커밋을 확인한 뒤 이어갑니다.')
    }
  }
}

export const taskRecovery = new TaskRecovery()
