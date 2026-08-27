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
  onData(callback: (payload: PtyDataPayload) => void): () => void
  onExit(callback: (payload: PtyExitPayload) => void): () => void
}

export interface PreloadApi {
  pty: PtyApi
}
