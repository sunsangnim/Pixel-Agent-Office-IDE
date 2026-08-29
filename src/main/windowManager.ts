import { join } from 'path'
import { BrowserWindow, shell } from 'electron'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

function baseWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false
  }
}

function loadRendererView(win: BrowserWindow, view?: string): void {
  const search = view ? `view=${view}` : undefined
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${search ? `?${search}` : ''}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), search ? { search } : undefined)
  }
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1050,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences()
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererView(mainWindow)
  return mainWindow
}

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 680,
    show: false,
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    webPreferences: baseWebPreferences()
  })

  settingsWindow.on('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  loadRendererView(settingsWindow, 'settings')
}
