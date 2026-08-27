import { contextBridge } from 'electron'

// Phase 2에서 pty/agents/fs API가 여기에 추가됩니다.
const api = {}

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
