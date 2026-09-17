import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, statSync } from 'fs'
import { ptyManager } from './ptyManager'
import { agentTemplateStore } from './agentStore'
import { workspaceFiles, workspaceStore } from './workspaceStore'
import { instanceManager } from './instanceManager'
import { openSettingsWindow } from './windowManager'
import { taskRecovery } from './taskRecovery'
import { meetingDiscussion } from './meetingDiscussion'
import type { MeetingDraft } from '../shared/meetingNotes'
import { diffAgainstBase, mergeDeskBranch } from './gitWorktreeManager'
import { mergeTaskFeature } from './taskFeatureWorktree'
import { teamCapacityStore } from './teamCapacityStore'
import { buildAgentProfiles } from '../shared/agentProfiles'
import { TASK_DOCUMENTS_FOLDER, WORKSPACE_FOLDERS } from '../shared/workspaceLayout'
import type {
  AgentTemplateInput,
  AgentTemplatePatch,
  GitDiffResult,
  GitMergeResult,
  PtySpawnOptions,
  PtySpawnResult,
  TaskDispatch
} from '../shared/types'

function broadcastTemplatesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('templates:changed')
  }
}

function broadcastTeamCapacityChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('team-capacity:changed')
  }
}

export function registerIpcHandlers(): void {
  taskRecovery.start()
  ipcMain.handle('app:boot-id', () => taskRecovery.bootId)
  ipcMain.handle('pty:spawn', (event, options: PtySpawnOptions = {}): PtySpawnResult => {
    const command = options.command ?? (process.platform === 'win32' ? 'powershell.exe' : 'bash')
    const cwd = workspaceFiles().path(options.cwd ?? workspaceStore.get())
    const ptyId = ptyManager.spawn({ ...options, command, cwd }, event.sender)
    return { ptyId }
  })

  ipcMain.on('pty:write', (_event, ptyId: string, data: string) => {
    ptyManager.write(ptyId, data)
  })

  ipcMain.on('pty:send-prompt', async (event, ptyId: string, prompt: string) => {
    try {
      if (await taskRecovery.dispatchRelated(ptyId, prompt)) return
      const files = workspaceFiles()
      ptyManager.sendPrompt(ptyId, `[작업실 규칙]\n작업실: ${files.root}\n파일 생성·수정과 명령 실행은 이 작업실 안에서만 수행하세요. 폴더 밖 파일은 수정하지 마세요. IDE 자체의 필수 파일은 ${files.path(WORKSPACE_FOLDERS.required)} 아래 에셋·애니메이션·기존 작업으로 분류합니다. 가구·캐릭터·커피 등의 원본은 ${files.path(WORKSPACE_FOLDERS.assets)}, 애니메이션은 ${files.path(WORKSPACE_FOLDERS.animations)}, 이전 작업 자료는 ${files.path(WORKSPACE_FOLDERS.previous)}에 보관하며 임의로 덮어쓰지 마세요. 이번에 의뢰받은 작업의 SRS·PRD·PHASES·보고서는 ${files.path(TASK_DOCUMENTS_FOLDER)} 아래 작업별 폴더에 저장하세요. ${files.path(WORKSPACE_FOLDERS.outputs)}에는 사용자가 오피스에서 의뢰한 작업의 결과만 작업별 폴더에 저장하세요. IDE 자체 리소스를 산출물에 섞지 마세요.\n\n${prompt}`)
    } catch (error) {
      event.sender.send('agent:state', { ptyId, adapterId: 'generic', state: 'error', reason: String(error), timestamp: Date.now() })
    }
  })

  ipcMain.on('pty:resize', (_event, ptyId: string, cols: number, rows: number) => {
    ptyManager.resize(ptyId, cols, rows)
  })

  ipcMain.on('pty:kill', (_event, ptyId: string) => {
    ptyManager.kill(ptyId)
  })

  ipcMain.handle('pty:buffer', (_event, ptyId: string) => ptyManager.getBuffer(ptyId))
  ipcMain.handle('pty:states', () => ptyManager.getStates())
  ipcMain.on('pty:cancel-prompt', (_event, ptyId: string) => ptyManager.cancelPrompt(ptyId))

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

  ipcMain.handle('workspace:list-files', (_event, path = '', query = '') => workspaceFiles().list(path, query))
  ipcMain.handle('workspace:preview-file', (_event, path: string) => workspaceFiles().preview(path))
  ipcMain.handle('workspace:create-folder', (_event, parent: string, name: string) => workspaceFiles().createFolder(parent, name))
  ipcMain.handle('workspace:open-folder', async (_event, path = '') => {
    const folder = workspaceFiles().path(path)
    if (!statSync(folder).isDirectory()) throw new Error('폴더를 선택해주세요.')
    const error = await shell.openPath(folder)
    if (error) throw new Error(error)
  })
  ipcMain.handle('workspace:reveal-file', (_event, path: string) => {
    const file = workspaceFiles().path(path)
    if (!existsSync(file)) throw new Error('파일을 찾을 수 없습니다.')
    shell.showItemInFolder(file)
  })

  ipcMain.handle('workspace:choose', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '전용 작업실 안의 프로젝트 폴더 선택',
      defaultPath: workspaceFiles().path('프로젝트'),
      properties: ['openDirectory', 'createDirectory']
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return workspaceStore.get()
    }
    const folder = result.filePaths[0]
    workspaceStore.set(folder)
    return folder
  })

  ipcMain.handle('tasks:prepare', async (_event, request: string) => {
    const task = await taskRecovery.prepare(request)
    workspaceStore.set(task.projectPath)
    return task
  })

  ipcMain.handle('tasks:list', () => taskRecovery.list())
  ipcMain.handle('tasks:plan-meeting', async (event, draft: MeetingDraft) => {
    const result = await taskRecovery.planMeeting(draft, event.sender)
    const task = result.tasks.find(item => item.sourceId === draft.meetingId)
    if (task) workspaceStore.set(task.projectPath)
    return result
  })
  ipcMain.handle('meetings:ask', (event, draft: MeetingDraft, questionId: string) => meetingDiscussion.ask(draft, questionId, event.sender))
  ipcMain.handle('tasks:restore', event => taskRecovery.restore(event.sender))
  ipcMain.handle('tasks:resume', (event, projectPath: string) => {
    workspaceStore.set(projectPath)
    return taskRecovery.resume(projectPath, event.sender)
  })
  ipcMain.handle('tasks:dispatch', (_event, request: TaskDispatch) => taskRecovery.dispatch(request))
  ipcMain.handle('tasks:approve', (_event, taskId: string) => taskRecovery.approve(taskId))
  ipcMain.handle('tasks:cancel', (_event, taskId: string) => taskRecovery.cancel(taskId))

  ipcMain.handle('tasks:read-spec', (_event, specPath: string) => {
    return workspaceFiles().preview(specPath)
  })

  ipcMain.handle('instances:list', () => instanceManager.list())
  ipcMain.handle('instances:ensure-project', (event, instanceIds: string[]) =>
    taskRecovery.ensureProject(instanceIds, workspaceStore.get(), event.sender)
  )

  ipcMain.handle('profiles:list', () =>
    buildAgentProfiles(agentTemplateStore.list(), teamCapacityStore.getAll())
  )
  ipcMain.handle('runs:list', () => instanceManager.listRuns())

  ipcMain.handle('team-capacity:list', () => teamCapacityStore.getAll())

  function activeCountFor(templateId: string): number {
    return instanceManager.listRuns().filter((run) => run.templateId === templateId).length
  }

  ipcMain.on('team-capacity:report', (_event, counts: Record<string, number>) => {
    // Never let a report drop a team's capacity below sessions already running
    // in it - the interior editor already blocks the desk deletion that would
    // cause this, but a stale/racing report shouldn't orphan a live session's
    // card regardless.
    const clamped = Object.fromEntries(
      Object.entries(counts).map(([templateId, count]) => [
        templateId,
        Math.max(count, activeCountFor(templateId))
      ])
    )
    if (teamCapacityStore.merge(clamped)) broadcastTeamCapacityChanged()
  })

  ipcMain.handle('team-capacity:can-remove-desk', (_event, templateId: string) => {
    const currentCapacity = teamCapacityStore.get(templateId)
    return currentCapacity - 1 >= activeCountFor(templateId)
  })

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
    if (run.worktreeBranch.startsWith('feature/')) {
      const task = taskRecovery.list().find(item => item.projectPath === run.repoRoot && item.repository?.featureBranch === run.worktreeBranch)
      if (!task || task.stage !== 'completed' || !task.repository?.url) {
        return { ok: false, message: '모든 Phase와 검증이 최종 완료된 뒤 main에 병합할 수 있습니다.' }
      }
      try {
        return { ok: true, message: await mergeTaskFeature(workspaceFiles(), run.repoRoot, run.cwd, run.worktreeBranch, task.repository.url) }
      } catch (error) { return { ok: false, message: String(error) } }
    }
    return mergeDeskBranch(run.repoRoot, run.cwd, run.worktreeBranch)
  })
}
