export interface PtySpawnOptions {
  command?: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
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
  resize(ptyId: string, cols: number, rows: number): void
  kill(ptyId: string): void
  getBuffer(ptyId: string): Promise<string>
  onData(callback: (payload: PtyDataPayload) => void): () => void
  onExit(callback: (payload: PtyExitPayload) => void): () => void
}

export interface AgentTemplate {
  id: string
  name: string
  command: string
  args: string[]
  color: string
  env?: Record<string, string>
  loginArgs?: string[]
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
  | 'deskIdle'
  | 'pantry'
  | 'meeting'
  | 'working'
  | 'requestingHelp'
  | 'error'

export interface OrchestrationPolicy {
  maxChildrenPerLead: number
  maxConcurrentRuns: number
  maxDepth: number
  simpleTaskMaxAgents: number
  cancelChildrenWithParent: boolean
  idleProcessTimeoutMs: number
}

export interface AgentInstance {
  instanceId: string
  templateId: string
  cwd: string
  ptyId: string
  rank: AgentRank
  slotIndex: number
  parentInstanceId: string | null
  presence: OfficePresence
}

export interface WorkspaceApi {
  getWorkFolder(): Promise<string | null>
  chooseWorkFolder(): Promise<string | null>
}

export interface AgentInstanceApi {
  list(): Promise<AgentInstance[]>
  create(templateId: string): Promise<AgentInstance[]>
  remove(instanceId: string): Promise<AgentInstance[]>
}

export interface SystemApi {
  openSettings(): void
}

export interface PreloadApi {
  pty: PtyApi
  templates: AgentTemplateApi
  workspace: WorkspaceApi
  instances: AgentInstanceApi
  system: SystemApi
}
