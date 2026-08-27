import { BrowserWindow, dialog, ipcMain } from 'electron'
import { ptyManager } from './ptyManager'
import { agentTemplateStore } from './agentStore'
import { workspaceStore } from './workspaceStore'
import { instanceManager } from './instanceManager'
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

  ipcMain.handle('workspace:get', () => workspaceStore.get())

  ipcMain.handle('workspace:choose', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return workspaceStore.get()
    }
    const folder = result.filePaths[0]
    workspaceStore.set(folder)
    return folder
  })

  ipcMain.handle('instances:list', () => instanceManager.list())

  ipcMain.handle('instances:create', (event, templateId: string) => {
    const cwd = workspaceStore.get()
    if (!cwd) {
      throw new Error('작업 폴더를 먼저 지정해주세요.')
    }
    return instanceManager.create(templateId, cwd, event.sender)
  })

  ipcMain.handle('instances:remove', (_event, instanceId: string) =>
    instanceManager.remove(instanceId)
  )
}
