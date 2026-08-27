import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentInstance,
  AgentStatePayload,
  AgentTemplate,
  AgentTemplateInput,
  AgentTemplatePatch,
  PreloadApi,
  PtyDataPayload,
  PtyExitPayload,
  PtySpawnOptions,
  PtySpawnResult
} from '../shared/types'

const api: PreloadApi = {
  pty: {
    spawn: (options: PtySpawnOptions): Promise<PtySpawnResult> => ipcRenderer.invoke('pty:spawn', options),
    write: (ptyId: string, data: string): void => {
      ipcRenderer.send('pty:write', ptyId, data)
    },
    sendPrompt: (ptyId: string, prompt: string): void => {
      ipcRenderer.send('pty:send-prompt', ptyId, prompt)
    },
    resize: (ptyId: string, cols: number, rows: number): void => {
      ipcRenderer.send('pty:resize', ptyId, cols, rows)
    },
    kill: (ptyId: string): void => {
      ipcRenderer.send('pty:kill', ptyId)
    },
    getBuffer: (ptyId: string): Promise<string> => ipcRenderer.invoke('pty:buffer', ptyId),
    onData: (callback: (payload: PtyDataPayload) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PtyDataPayload): void => callback(payload)
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    },
    onExit: (callback: (payload: PtyExitPayload) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: PtyExitPayload): void => callback(payload)
      ipcRenderer.on('pty:exit', listener)
      return () => ipcRenderer.removeListener('pty:exit', listener)
    },
    onState: (callback: (payload: AgentStatePayload) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AgentStatePayload): void => callback(payload)
      ipcRenderer.on('agent:state', listener)
      return () => ipcRenderer.removeListener('agent:state', listener)
    }
  },
  templates: {
    list: (): Promise<AgentTemplate[]> => ipcRenderer.invoke('templates:list'),
    create: (input: AgentTemplateInput): Promise<AgentTemplate[]> =>
      ipcRenderer.invoke('templates:create', input),
    update: (id: string, patch: AgentTemplatePatch): Promise<AgentTemplate[]> =>
      ipcRenderer.invoke('templates:update', id, patch),
    remove: (id: string): Promise<AgentTemplate[]> => ipcRenderer.invoke('templates:remove', id),
    onChanged: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('templates:changed', listener)
      return () => ipcRenderer.removeListener('templates:changed', listener)
    }
  },
  workspace: {
    getWorkFolder: (): Promise<string | null> => ipcRenderer.invoke('workspace:get'),
    chooseWorkFolder: (): Promise<string | null> => ipcRenderer.invoke('workspace:choose')
  },
  tasks: {
    prepare: (request: string) => ipcRenderer.invoke('tasks:prepare', request)
  },
  instances: {
    list: (): Promise<AgentInstance[]> => ipcRenderer.invoke('instances:list'),
    create: (templateId: string): Promise<AgentInstance[]> =>
      ipcRenderer.invoke('instances:create', templateId),
    createChild: (parentInstanceId: string): Promise<AgentInstance[]> =>
      ipcRenderer.invoke('instances:create-child', parentInstanceId),
    restart: (instanceId: string): Promise<AgentInstance[]> =>
      ipcRenderer.invoke('instances:restart', instanceId),
    remove: (instanceId: string): Promise<AgentInstance[]> =>
      ipcRenderer.invoke('instances:remove', instanceId)
  },
  system: {
    openSettings: (): void => {
      ipcRenderer.send('settings:open')
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error contextIsolation is always on, this is a defensive fallback
  window.api = api
}
