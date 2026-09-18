import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc'
import { ptyManager } from './ptyManager'
import { createMainWindow } from './windowManager'
import { taskRecovery } from './taskRecovery'
import { initAutoUpdater } from './autoUpdater'

// keep the whole app from going down over one bad IPC call (e.g. a native
// node-pty error from a process that exited mid-request); log and continue
// instead of crashing every window.
process.on('uncaughtException', (error) => {
  console.error('[main] uncaught exception:', error)
})

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()
  initAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  try { taskRecovery.checkpoint() } catch (error) { console.error('작업 인수인계 저장 실패:', error) }
  ptyManager.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  try { taskRecovery.checkpoint() } catch (error) { console.error('작업 인수인계 저장 실패:', error) }
  ptyManager.killAll()
})
