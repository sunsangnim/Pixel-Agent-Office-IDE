import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import { WorkspaceFiles } from './workspaceFiles'

interface WorkspaceSchema {
  workFolder: string | null
}

function getStorePath(): string {
  return join(app.getPath('userData'), 'workspace.json')
}

export function workspaceFiles(): WorkspaceFiles {
  const files = new WorkspaceFiles(join(app.getPath('desktop'), '오피스 IDE 작업실'))
  files.ensure()
  return files
}

export const workspaceStore = {
  get(): string {
    const files = workspaceFiles()
    const defaultWorkFolder = files.path(join('프로젝트', '기본 작업'))
    const path = getStorePath()
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as WorkspaceSchema
      if (parsed.workFolder) {
        const folder = files.path(parsed.workFolder)
        if (statSync(folder).isDirectory()) return folder
      }
    } catch { /* Replace missing or external workspaces with the dedicated project. */ }
    this.set(defaultWorkFolder)
    return defaultWorkFolder
  },

  set(workFolder: string): void {
    workFolder = workspaceFiles().path(workFolder)
    if (!existsSync(workFolder) || !statSync(workFolder).isDirectory()) throw new Error('작업 폴더를 찾을 수 없습니다.')
    const path = getStorePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ workFolder } satisfies WorkspaceSchema, null, 2), 'utf-8')
  }
}
