import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc'
import { ptyManager } from './ptyManager'
import { createMainWindow } from './windowManager'

// keep the whole app from going down over one bad IPC call (e.g. a native
// node-pty error from a process that exited mid-request); log and continue
// instead of crashing every window.
process.on('uncaughtException', (error) => {
  console.error('[main] uncaught exception:', error)
})

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  ptyManager.killAll()
})
