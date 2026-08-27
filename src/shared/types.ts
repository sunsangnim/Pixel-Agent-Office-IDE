export interface PtySpawnOptions {
  command?: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
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
}

export type AgentTemplateInput = Omit<AgentTemplate, 'id'>
export type AgentTemplatePatch = Partial<AgentTemplateInput>

export interface AgentTemplateApi {
  list(): Promise<AgentTemplate[]>
  create(input: AgentTemplateInput): Promise<AgentTemplate[]>
  update(id: string, patch: AgentTemplatePatch): Promise<AgentTemplate[]>
  remove(id: string): Promise<AgentTemplate[]>
}

export type DeskStatus = 'idle' | 'running' | 'error'

export interface AgentInstance {
  instanceId: string
  templateId: string
  cwd: string
  ptyId: string
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

export interface PreloadApi {
  pty: PtyApi
  templates: AgentTemplateApi
  workspace: WorkspaceApi
  instances: AgentInstanceApi
}
