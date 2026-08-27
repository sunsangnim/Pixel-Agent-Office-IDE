import { ipcMain } from 'electron'
import { ptyManager } from './ptyManager'
import { agentTemplateStore } from './agentStore'
import type {
  AgentTemplateInput,
  AgentTemplatePatch,
  PtySpawnOptions,
  PtySpawnResult
} from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('pty:spawn', (event, options: PtySpawnOptions = {}): PtySpawnResult => {
    const command = options.command ?? (process.platform === 'win32' ? 'powershell.exe' : 'bash')
    const cwd = options.cwd ?? process.cwd()
    const ptyId = ptyManager.spawn({ ...options, command, cwd }, event.sender)
    return { ptyId }
  })

  ipcMain.on('pty:write', (_event, ptyId: string, data: string) => {
    ptyManager.write(ptyId, data)
  })

  ipcMain.on('pty:resize', (_event, ptyId: string, cols: number, rows: number) => {
    ptyManager.resize(ptyId, cols, rows)
  })

  ipcMain.on('pty:kill', (_event, ptyId: string) => {
    ptyManager.kill(ptyId)
  })

  ipcMain.handle('templates:list', () => agentTemplateStore.list())

  ipcMain.handle('templates:create', (_event, input: AgentTemplateInput) =>
    agentTemplateStore.create(input)
  )

  ipcMain.handle('templates:update', (_event, id: string, patch: AgentTemplatePatch) =>
    agentTemplateStore.update(id, patch)
  )

  ipcMain.handle('templates:remove', (_event, id: string) => agentTemplateStore.remove(id))
}
