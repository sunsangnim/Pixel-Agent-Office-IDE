import { randomUUID } from 'crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname, join, relative, isAbsolute } from 'path'
import { execFile } from 'child_process'
import type { AgentInstance, ProjectRepository, TaskCommand, TaskDispatch, TaskWorkspace, TrackedTask } from '../shared/types'
import { WorkspaceFiles } from './workspaceFiles'
import { taskGitPolicy } from '../shared/taskGitPolicy'

export async function taskGitContext(cwd: string): Promise<string> {
  const run = (args: string[]) => new Promise<string>((resolve) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 8000, maxBuffer: 128 * 1024 }, (error, stdout) =>
      resolve(error ? '(Git 정보 없음 또는 조회 실패)' : stdout.trim() || '(없음)'))
  })
  const [branch, commits, changes] = await Promise.all([
    run(['branch', '--show-current']), run(['log', '-12', '--format=%h %s']), run(['status', '--short'])
  ])
  return `브랜치: ${branch}\n최근 커밋:\n${commits}\n미커밋 변경:\n${changes}`
}

/** Durable task state is independent of Electron windows and CLI conversations. */
export class TaskRecoveryStore {
  private tasks: TrackedTask[]
  private file: string

  constructor(private readonly files: WorkspaceFiles) {
    this.file = files.path('.runtime/task-recovery.json')
    if (!existsSync(this.file)) this.tasks = []
    else {
      const saved = JSON.parse(readFileSync(this.file, 'utf8'))
      if (saved.version !== 1 || !Array.isArray(saved.tasks)) throw new Error('작업 인수인계 상태 파일을 읽을 수 없습니다.')
      this.tasks = saved.tasks
      for (const task of this.tasks) {
        if (typeof task.taskId !== 'string' || !Array.isArray(task.commands) ||
          !['planning', 'review', 'execution', 'completed', 'cancelled'].includes(task.stage)) throw new Error('작업 인수인계 상태가 올바르지 않습니다.')
        this.validatePaths(task)
      }
    }
  }

  list(): TrackedTask[] { return structuredClone(this.tasks) }
  get(taskId: string): TrackedTask {
    const task = this.tasks.find(item => item.taskId === taskId)
    if (!task) throw new Error('저장된 작업을 찾을 수 없습니다.')
    this.validatePaths(task)
    return task
  }

  private validatePaths(task: TrackedTask): void {
    const root = this.files.path(task.rootPath)
    this.files.path(task.projectPath)
    if (task.sourceProjectPath) this.files.path(task.sourceProjectPath)
    for (const document of [task.specPath, task.phasesPath, task.readmePath, task.developmentLogPath]) {
      const rel = relative(root, this.files.path(document))
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('작업 문서가 해당 작업 폴더 밖에 있습니다.')
    }
    for (const command of task.commands) this.files.path(command.cwd)
  }

  private save(): void {
    const target = this.files.path(this.file)
    mkdirSync(dirname(target), { recursive: true })
    const temporary = this.files.path(`${target}.tmp`)
    writeFileSync(temporary, JSON.stringify({ version: 1, tasks: this.tasks }, null, 2), 'utf8')
    renameSync(temporary, target)
  }

  private record(task: TrackedTask, title: string, text: string): void {
    const file = this.files.path(task.developmentLogPath)
    if (!existsSync(file)) throw new Error(`개발 기록이 없습니다: ${task.developmentLogPath}`)
    appendFileSync(file, `\n## ${new Date().toISOString()} · ${title}\n\n${text}\n`, 'utf8')
    task.updatedAt = new Date().toISOString()
  }

  register(workspace: TaskWorkspace, request: string, projectPath: string,
    details: Pick<TrackedTask, 'sourceId' | 'sourceProjectPath' | 'repository'> = {}): void {
    const task: TrackedTask = { ...workspace, request, projectPath: this.files.path(projectPath),
      stage: 'planning', mode: 'simple', commands: [], updatedAt: new Date().toISOString(), ...details }
    this.validatePaths(task)
    this.tasks.push(task)
    this.record(task, '작업 등록', request)
    this.save()
  }

  setRepository(taskId: string, repository: ProjectRepository): void {
    this.get(taskId).repository = repository
    this.save()
  }

  enqueue(request: TaskDispatch, instances: AgentInstance[]): TaskCommand[] {
    const task = this.get(request.taskId)
    if (task.repository && !task.repository.ready) throw new Error('작업의 GitHub 비공개 저장소 준비를 먼저 완료해주세요.')
    if (task.stage === 'cancelled') throw new Error('취소된 작업입니다.')
    if (request.stage === 'execution' && !['execution', 'completed'].includes(task.stage)) throw new Error('기획 승인 후 작업을 실행할 수 있습니다.')
    if (request.stage === 'planning' && !['planning', 'review'].includes(task.stage)) throw new Error('이미 승인된 작업입니다.')
    const commands = request.assignments.map(assignment => {
      const instance = instances.find(item => item.instanceId === assignment.instanceId)
      if (!instance) throw new Error('작업할 세션을 찾을 수 없습니다.')
      if (this.files.path(instance.repoRoot) !== task.projectPath) throw new Error('선택한 프로젝트와 세션의 작업 폴더가 다릅니다.')
      if (task.commands.some(command => command.profileId === instance.profileId && ['queued', 'running', 'interrupted'].includes(command.status))) {
        throw new Error('해당 세션의 이전 작업을 완료하거나 취소해주세요.')
      }
      return { id: randomUUID(), attemptId: randomUUID(), profileId: instance.profileId,
        templateId: instance.templateId, cwd: this.files.path(instance.cwd), prompt: assignment.prompt,
        role: assignment.role, stage: request.stage, status: 'queued' as const, startedAt: new Date().toISOString() }
    })
    if (!commands.length || new Set(commands.map(command => command.profileId)).size !== commands.length) throw new Error('작업 대상이 없거나 중복되었습니다.')
    if (request.stage === 'execution' && !task.gitCoordinatorProfileId) {
      task.gitCoordinatorProfileId = commands.find(command => command.profileId === 'claude-code:lead')?.profileId ??
        commands.find(command => instances.some(instance => instance.profileId === command.profileId && instance.rank === 'teamLead'))?.profileId ?? commands[0].profileId
    }
    task.stage = request.stage
    task.mode = request.mode ?? task.mode
    task.commands.push(...commands)
    this.record(task, request.stage === 'planning' ? '기획 요청' : '명령 시작', commands.map(command => `- ${command.profileId}: ${command.role}`).join('\n'))
    this.save()
    return commands
  }

  approve(taskId: string): void {
    const task = this.get(taskId)
    if (task.stage !== 'review') throw new Error('완료된 기획을 확인한 뒤 승인해주세요.')
    task.stage = 'execution'
    this.record(task, '기획 승인', '사용자가 기획을 승인했습니다. 구현을 진행할 수 있습니다.')
    this.save()
  }

  cancel(taskId: string): void {
    const task = this.get(taskId)
    if (task.stage === 'cancelled') return
    task.stage = 'cancelled'
    task.commands.forEach(command => { if (command.status !== 'completed') command.status = 'cancelled' })
    this.record(task, '작업 취소', '자동 인수인계 대상에서 제외합니다.')
    this.save()
  }

  setStatus(taskId: string, commandId: string, status: 'running' | 'interrupted', reason: string): void {
    const task = this.get(taskId)
    const command = task.commands.find(item => item.id === commandId)
    if (!command || ['completed', 'cancelled'].includes(command.status) || task.stage === 'cancelled') return
    if (command.status === status) return
    command.status = status
    if (status === 'interrupted') this.record(task, '작업 중단 · 인수인계 대기', `${command.role}\n\n${reason}\n완료된 것으로 처리하지 않습니다. 다음 세션이 문서와 실제 변경을 확인해야 합니다.`)
    this.save()
  }

  receiptPath(task: TrackedTask, command: TaskCommand): string {
    if (!/^[\da-f-]{36}$/.test(command.id) || !/^[\da-f-]{36}$/.test(command.attemptId)) throw new Error('잘못된 작업 식별자입니다.')
    return this.files.path(join(task.rootPath, '.runtime', `${command.id}-${command.attemptId}.json`))
  }

  resume(taskId: string, commandId: string): TaskCommand {
    const task = this.get(taskId)
    for (const document of [task.specPath, task.developmentLogPath, task.phasesPath]) {
      if (!existsSync(this.files.path(document))) throw new Error(`인수인계 문서가 없습니다: ${document}`)
    }
    const command = task.commands.find(item => item.id === commandId)!
    command.attemptId = randomUUID()
    command.status = 'queued'
    command.recovered = true
    command.startedAt = new Date().toISOString()
    this.record(task, '새 세션 인수인계', `${command.profileId}: 통합 SRS, 개발 기록, 최근 커밋과 미커밋 변경을 확인한 후 ${command.role} 이어가기`)
    this.save()
    return command
  }

  async prompt(taskId: string, command: TaskCommand): Promise<string> {
    const task = this.get(taskId)
    const receipt = this.receiptPath(task, command)
    mkdirSync(dirname(receipt), { recursive: true })
    const git = await taskGitContext(command.cwd)
    return `[${command.recovered ? '새 세션 작업 인수인계' : '작업 및 개발 기록 규칙'}]\n작업 위치: ${command.cwd}\n통합 SRS: ${task.specPath}\n개발 기록: ${task.developmentLogPath}\nPhase: ${task.phasesPath}\n\n` +
      `프로젝트 저장소: ${task.projectPath}\n${task.repository?.url ? `GitHub 비공개 저장소: ${task.repository.url}\n` : ''}코드는 이 프로젝트의 작업본에서만 수정하세요. IDE나 다른 작업의 저장소를 사용하지 마세요.\n\n` +
      `작업 전에 반드시 통합 SRS → 개발 기록 → git log 및 git status/git diff 순서로 읽고 현재 업무와 완료/미완료 범위를 먼저 정리하세요. 필요하면 관련 커밋을 git show로 확인하세요. 이전 세션 대화는 사용하지 않습니다. 기존 미커밋 변경을 보존하고 이미 끝난 작업을 반복하지 마세요.\n${git}\n\n` +
      `${command.stage === 'planning' ? '기획 단계입니다. 문서 작성까지만 진행하고 구현은 사용자 승인을 기다리세요.' : '사용자 승인을 받은 구현 단계입니다. 남은 작업을 이어서 수행하세요.'}\n\n` +
      `각 명령·작업(테스트 포함)이 끝날 때마다 ${task.developmentLogPath}에 수행 내용, 변경 파일, 검증 명령과 결과, 관련 커밋, 미커밋 변경, 남은 일과 다음 단계를 추가하세요. 기록을 덮어쓰거나 마지막까지 미루지 마세요.\n` +
      `이번 지시를 마치면 개발 기록을 먼저 갱신하고 ${receipt}에 아래 JSON을 저장하세요. 실제 검증으로 완료를 확인한 경우에만 outcome을 completed로 쓰세요. 미완료는 incomplete, 막힘은 blocked입니다. 이 파일이 없으면 IDE는 작업이 끝났다고 판단하지 않습니다.\n` +
      JSON.stringify({ commandId: command.id, attemptId: command.attemptId, outcome: 'completed', summary: '수행 결과', changedFiles: [], checks: [], nextSteps: [], reviewed: { srs: true, developmentLog: true, git: true } }) +
      `\n작업실 밖에는 파일을 생성하거나 수정하지 마세요.\n\n[원래 요청]\n${task.request}\n\n[이번 지시]\n${command.prompt}` +
      (command.stage === 'execution' ? `\n\n${taskGitPolicy(task.taskId, task.repository?.featureBranch, task.gitCoordinatorProfileId)}` : '')
  }

  async acceptReceipt(taskId: string, commandId: string): Promise<boolean> {
    const task = this.get(taskId)
    const command = task.commands.find(item => item.id === commandId)!
    if (['completed', 'cancelled'].includes(command.status) || task.stage === 'cancelled') return false
    const receipt = this.receiptPath(task, command)
    if (!existsSync(receipt) || statSync(receipt).size > 128 * 1024) return false
    let result
    try { result = JSON.parse(readFileSync(receipt, 'utf8')) } catch { return false }
    if (result.commandId !== command.id || result.attemptId !== command.attemptId ||
      !['completed', 'incomplete', 'blocked'].includes(result.outcome) || typeof result.summary !== 'string' ||
      ![result.changedFiles, result.checks, result.nextSteps].every(value => Array.isArray(value) && value.every(item => typeof item === 'string')) ||
      !['srs', 'developmentLog', 'git'].every(key => result.reviewed?.[key] === true)) return false
    const log = this.files.path(task.developmentLogPath)
    if (!existsSync(log) || statSync(log).mtimeMs < Date.parse(command.startedAt)) return false
    const attempt = command.attemptId
    const git = await taskGitContext(command.cwd)
    if (command.attemptId !== attempt || (task as TrackedTask).stage === 'cancelled' || command.status === 'completed') return false
    this.record(task, `${command.role} · ${result.outcome === 'completed' ? '완료' : '미완료'}`,
      `${result.summary}\n\n변경 파일:\n${result.changedFiles.join('\n') || '(없음)'}\n\n검증:\n${result.checks.join('\n') || '(보고 없음)'}\n\n남은 일:\n${result.nextSteps.join('\n') || '(보고 없음)'}\n\n${git}`)
    command.summary = result.summary
    command.status = result.outcome === 'completed' ? 'completed' : 'interrupted'
    // Rotate an incomplete receipt so polling cannot append the same report repeatedly.
    if (result.outcome !== 'completed') command.attemptId = randomUUID()
    const current = task.commands.filter(item => item.stage === command.stage)
    if (current.length && current.every(item => item.status === 'completed')) task.stage = command.stage === 'planning' ? 'review' : 'completed'
    this.save()
    return true
  }
}
