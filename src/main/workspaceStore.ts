import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'

interface WorkspaceSchema {
  workFolder: string | null
}

function getStorePath(): string {
  return join(app.getPath('userData'), 'workspace.json')
}

export const workspaceStore = {
  get(): string | null {
    const defaultWorkFolder = app.getPath('home')
    const path = getStorePath()
    if (!existsSync(path)) return defaultWorkFolder
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as WorkspaceSchema
      return parsed.workFolder ?? defaultWorkFolder
    } catch {
      return defaultWorkFolder
    }
  },

  set(workFolder: string): void {
    const path = getStorePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ workFolder } satisfies WorkspaceSchema, null, 2), 'utf-8')
  }
}
