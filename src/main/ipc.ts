import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ptyManager } from './ptyManager'
import { agentTemplateStore } from './agentStore'
import { workspaceStore } from './workspaceStore'
import { instanceManager } from './instanceManager'
import { openSettingsWindow } from './windowManager'
import { taskWorkspaceManager } from './taskWorkspaceManager'
import { diffAgainstBase, mergeDeskBranch } from './gitWorktreeManager'
import { buildAgentProfiles } from '../shared/agentProfiles'
import type {
  AgentTemplateInput,
  AgentTemplatePatch,
  GitDiffResult,
  GitMergeResult,
  PtySpawnOptions,
  PtySpawnResult
} from '../shared/types'

function broadcastTemplatesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('templates:changed')
  }
}

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

  ipcMain.on('pty:send-prompt', (_event, ptyId: string, prompt: string) => {
    ptyManager.sendPrompt(ptyId, prompt)
  })

  ipcMain.on('pty:resize', (_event, ptyId: string, cols: number, rows: number) => {
    ptyManager.resize(ptyId, cols, rows)
  })

  ipcMain.on('pty:kill', (_event, ptyId: string) => {
    ptyManager.kill(ptyId)
  })

  ipcMain.handle('pty:buffer', (_event, ptyId: string) => ptyManager.getBuffer(ptyId))

  ipcMain.handle('templates:list', () => agentTemplateStore.list())

  ipcMain.handle('templates:create', (_event, input: AgentTemplateInput) => {
    const result = agentTemplateStore.create(input)
    broadcastTemplatesChanged()
    return result
  })

  ipcMain.handle('templates:update', (_event, id: string, patch: AgentTemplatePatch) => {
    const result = agentTemplateStore.update(id, patch)
    broadcastTemplatesChanged()
    return result
  })

  ipcMain.handle('templates:remove', (_event, id: string) => {
    const result = agentTemplateStore.remove(id)
    broadcastTemplatesChanged()
    return result
  })

  ipcMain.on('settings:open', () => openSettingsWindow())

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

  ipcMain.handle('tasks:prepare', (_event, request: string) => {
    const workspace = workspaceStore.get()
    if (!workspace) throw new Error('작업 폴더를 먼저 지정해주세요.')
    const privateTaskRoot = join(app.getPath('userData'), 'private-tasks')
    return taskWorkspaceManager.prepare(privateTaskRoot, request)
  })

  ipcMain.handle('tasks:read-spec', (_event, specPath: string) => {
    const privateTaskRoot = join(app.getPath('userData'), 'private-tasks')
    const resolved = join(specPath)
    if (!resolved.startsWith(privateTaskRoot) || !existsSync(resolved)) {
      throw new Error('접근할 수 없는 문서 경로입니다.')
    }
    return readFileSync(resolved, 'utf-8')
  })

  ipcMain.handle('instances:list', () => instanceManager.list())

  ipcMain.handle('profiles:list', () => buildAgentProfiles(agentTemplateStore.list()))
  ipcMain.handle('runs:list', () => instanceManager.listRuns())

  ipcMain.handle('instances:create', (event, templateId: string) => {
    const cwd = workspaceStore.get()
    if (!cwd) {
      throw new Error('작업 폴더를 먼저 지정해주세요.')
    }
    return instanceManager.create(templateId, cwd, event.sender)
  })

  ipcMain.handle('runs:create', async (event, templateId: string) => {
    const cwd = workspaceStore.get()
    if (!cwd) throw new Error('작업 폴더를 먼저 지정해주세요.')
    await instanceManager.create(templateId, cwd, event.sender)
    return instanceManager.listRuns()
  })

  ipcMain.handle('instances:create-child', (event, parentInstanceId: string) =>
    instanceManager.createChild(parentInstanceId, event.sender)
  )
  ipcMain.handle('runs:create-child', async (event, parentRunId: string) => {
    await instanceManager.createChild(parentRunId, event.sender)
    return instanceManager.listRuns()
  })

  ipcMain.handle('instances:restart', (event, instanceId: string) =>
    instanceManager.restart(instanceId, event.sender)
  )
  ipcMain.handle('runs:restart', async (event, runId: string) => {
    await instanceManager.restart(runId, event.sender)
    return instanceManager.listRuns()
  })

  ipcMain.handle('instances:remove', (_event, instanceId: string) =>
    instanceManager.remove(instanceId)
  )
  ipcMain.handle('runs:remove', async (_event, runId: string) => {
    await instanceManager.remove(runId)
    return instanceManager.listRuns()
  })

  ipcMain.handle('git:diff', async (_event, runId: string): Promise<GitDiffResult> => {
    const run = instanceManager.getRun(runId)
    if (!run || !run.worktreeBranch || !run.baseSha) {
      return { branch: run?.worktreeBranch ?? null, baseSha: run?.baseSha ?? null, files: [], error: 'Git 저장소가 아니어서 diff를 표시할 수 없습니다.' }
    }
    const result = await diffAgainstBase(run.cwd, run.baseSha)
    return { ...result, branch: run.worktreeBranch }
  })

  ipcMain.handle('git:merge', async (_event, runId: string): Promise<GitMergeResult> => {
    const run = instanceManager.getRun(runId)
    if (!run || !run.worktreeBranch) {
      return { ok: false, message: 'Git 저장소가 아니어서 병합할 수 없습니다.' }
    }
    return mergeDeskBranch(run.repoRoot, run.cwd, run.worktreeBranch)
  })
}
