export interface PtySpawnOptions {
  command?: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
  adapterId?: CliAdapterId
}

export type CliAdapterId = 'claude' | 'codex' | 'antigravity' | 'generic'
export type AgentRuntimeState =
  | 'starting'
  | 'ready'
  | 'working'
  | 'waiting'
  | 'completed'
  | 'error'
  | 'exited'

export interface AgentStatePayload {
  ptyId: string
  adapterId: CliAdapterId
  state: AgentRuntimeState
  reason?: string
  timestamp: number
}

export interface PtySpawnResult {
  ptyId: string
}

export interface PtyDataPayload {
  ptyId: string
  data: string
}

export interface PtyExitPayload {
  ptyId: string
  exitCode: number
  signal?: number
}

export interface PtyApi {
  spawn(options: PtySpawnOptions): Promise<PtySpawnResult>
  write(ptyId: string, data: string): void
  sendPrompt(ptyId: string, prompt: string): void
  resize(ptyId: string, cols: number, rows: number): void
  kill(ptyId: string): void
  getBuffer(ptyId: string): Promise<string>
  getStates(): Promise<AgentStatePayload[]>
  cancelPrompt(ptyId: string): void
  onData(callback: (payload: PtyDataPayload) => void): () => void
  onExit(callback: (payload: PtyExitPayload) => void): () => void
  onState(callback: (payload: AgentStatePayload) => void): () => void
}

export interface AgentTemplate {
  id: string
  name: string
  command: string
  args: string[]
  color: string
  env?: Record<string, string>
  loginArgs?: string[]
  leadTitle?: string
}

export type AgentTemplateInput = Omit<AgentTemplate, 'id'>
export type AgentTemplatePatch = Partial<AgentTemplateInput>

export interface AgentTemplateApi {
  list(): Promise<AgentTemplate[]>
  create(input: AgentTemplateInput): Promise<AgentTemplate[]>
  update(id: string, patch: AgentTemplatePatch): Promise<AgentTemplate[]>
  remove(id: string): Promise<AgentTemplate[]>
  onChanged(callback: () => void): () => void
}

export type DeskStatus = 'idle' | 'running' | 'error'

export type AgentRank = 'teamLead' | 'subAgent'
export type OfficePresence =
  | 'offDuty'
  | 'arriving'
  | 'deskIdle'
  | 'pantryDoor'
  | 'pantry'
  | 'meetingDoor'
  | 'meeting'
  | 'representativeVisit'
  | 'working'
  | 'requestingHelp'
  | 'error'

export type OfficeDoorState = 'closed' | 'opening' | 'open' | 'closing'

export interface OrchestrationPolicy {
  maxConcurrentRuns: number
  maxDepth: number
  simpleTaskMaxAgents: number
  cancelChildrenWithParent: boolean
  idleProcessTimeoutMs: number
}

export interface TeamCapacityApi {
  list(): Promise<Record<string, number>>
  /** Pushes live desk-per-team counts from the office interior editor - this
   *  is the actual source of truth for seat capacity, not a manual setting. */
  report(counts: Record<string, number>): void
  /** Whether removing one more desk from this team would still leave enough
   *  seats for its currently running sessions. */
  canRemoveDesk(templateId: string): Promise<boolean>
  onChanged(callback: () => void): () => void
}

export interface AgentProfile {
  profileId: string
  templateId: string
  rank: AgentRank
  slotIndex: number
  displayName: string
}

export interface AgentRun {
  runId: string
  profileId: string
  templateId: string
  cwd: string
  repoRoot: string
  worktreeBranch: string | null
  baseSha: string | null
  ptyId: string
  parentRunId: string | null
  presence: OfficePresence
}

export interface AgentInstance {
  instanceId: string
  templateId: string
  cwd: string
  repoRoot: string
  worktreeBranch: string | null
  ptyId: string
  rank: AgentRank
  slotIndex: number
  parentInstanceId: string | null
  presence: OfficePresence
  profileId: string
}

export interface AgentProfileApi {
  list(): Promise<AgentProfile[]>
}

export interface AgentRunApi {
  list(): Promise<AgentRun[]>
  create(templateId: string): Promise<AgentRun[]>
  createChild(parentRunId: string): Promise<AgentRun[]>
  restart(runId: string): Promise<AgentRun[]>
  remove(runId: string): Promise<AgentRun[]>
}

export interface WorkspaceApi {
  getWorkFolder(): Promise<string | null>
  chooseWorkFolder(): Promise<string | null>
  listFiles(path?: string, query?: string): Promise<WorkspaceListing>
  previewFile(path: string): Promise<string>
  openFolder(path?: string): Promise<void>
  revealFile(path: string): Promise<void>
  createFolder(parent: string, name: string): Promise<string>
}

export interface WorkspaceEntry {
  name: string
  /** Path relative to the dedicated workspace root. */
  path: string
  directory: boolean
  size: number
  modifiedAt: number
}

export interface WorkspaceListing {
  root: string
  path: string
  entries: WorkspaceEntry[]
  truncated: boolean
}

export interface TaskWorkspace {
  taskId: string
  title: string
  rootPath: string
  specPath: string
  phasesPath: string
  readmePath: string
  developmentLogPath: string
}

export type TaskStage = 'planning' | 'review' | 'execution' | 'completed' | 'cancelled'
export interface ProjectRepository {
  name: string
  featureBranch?: string
  owner?: string
  url?: string
  ready: boolean
}
export interface TaskCommand {
  id: string
  attemptId: string
  profileId: string
  templateId: string
  cwd: string
  prompt: string
  role: string
  stage: 'planning' | 'execution'
  status: 'queued' | 'running' | 'interrupted' | 'completed' | 'cancelled'
  startedAt: string
  summary?: string
  recovered?: boolean
}
export interface TrackedTask extends TaskWorkspace {
  sourceId?: string
  gitCoordinatorProfileId?: string
  sourceProjectPath?: string
  repository?: ProjectRepository
  request: string
  projectPath: string
  stage: TaskStage
  mode: 'manual' | 'simple' | 'complex'
  commands: TaskCommand[]
  updatedAt: string
}
export interface TaskDispatch {
  taskId: string
  stage: 'planning' | 'execution'
  mode?: TrackedTask['mode']
  assignments: { instanceId: string; prompt: string; role: string }[]
}
export interface TaskRestoreResult {
  bootId: string
  tasks: TrackedTask[]
  instances: AgentInstance[]
  notices: string[]
}

export interface TaskApi {
  planMeeting(draft: import('./meetingNotes').MeetingDraft): Promise<TaskRestoreResult>
  prepare(request: string): Promise<TrackedTask>
  readSpec(specPath: string): Promise<string>
  dispatch(request: TaskDispatch): Promise<void>
  approve(taskId: string): Promise<void>
  cancel(taskId: string): Promise<void>
  restore(): Promise<TaskRestoreResult>
  resume(projectPath: string): Promise<TaskRestoreResult>
  list(): Promise<TrackedTask[]>
  onChanged(callback: (tasks: TrackedTask[]) => void): () => void
}

export interface MeetingReplyEvent {
  meetingId: string
  questionId: string
  templateId: string
  entry?: import('./meetingNotes').MeetingEntry
  error?: string
  instances: AgentInstance[]
}

export interface MeetingApi {
  ask(draft: import('./meetingNotes').MeetingDraft, questionId: string): Promise<void>
  onReply(callback: (event: MeetingReplyEvent) => void): () => void
}

export type GitDiffLineType = 'context' | 'add' | 'del'

export interface GitDiffLine {
  type: GitDiffLineType
  text: string
  oldLine?: number
  newLine?: number
}

export interface GitDiffHunk {
  header: string
  lines: GitDiffLine[]
}

export type GitDiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface GitDiffFile {
  path: string
  status: GitDiffFileStatus
  hunks: GitDiffHunk[]
}

export interface GitDiffResult {
  branch: string | null
  baseSha: string | null
  files: GitDiffFile[]
  error?: string
}

export interface GitMergeResult {
  ok: boolean
  message: string
}

export interface GitApi {
  diff(runId: string): Promise<GitDiffResult>
  merge(runId: string): Promise<GitMergeResult>
}

export interface AgentInstanceApi {
  list(): Promise<AgentInstance[]>
  ensureProject(instanceIds: string[]): Promise<AgentInstance[]>
  create(templateId: string): Promise<AgentInstance[]>
  createChild(parentInstanceId: string): Promise<AgentInstance[]>
  restart(instanceId: string): Promise<AgentInstance[]>
  remove(instanceId: string): Promise<AgentInstance[]>
}

export interface SystemApi {
  openSettings(): void
  getBootId(): Promise<string>
}

export interface PreloadApi {
  meetings: MeetingApi
  pty: PtyApi
  templates: AgentTemplateApi
  workspace: WorkspaceApi
  tasks: TaskApi
  instances: AgentInstanceApi
  profiles: AgentProfileApi
  runs: AgentRunApi
  system: SystemApi
  git: GitApi
  teamCapacity: TeamCapacityApi
}
