import { join } from 'path'
import { BrowserWindow, screen, shell } from 'electron'
import { windowBoundsStore } from './windowBoundsStore'

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

function defaultWindowBounds(): { x?: number; y?: number; width: number; height: number } {
  const width = 1680
  const height = 960
  // Only used the very first time the app runs (no saved position yet).
  // Prefer a second monitor if one's connected, centered on it - Electron
  // doesn't order getAllDisplays() by "primary first", so pick by id
  // instead of index. Falls back to Electron's own default placement when
  // there's only the one display.
  const primaryDisplay = screen.getPrimaryDisplay()
  const targetDisplay = screen.getAllDisplays().find((d) => d.id !== primaryDisplay.id)
  const position = targetDisplay
    ? {
        x: targetDisplay.workArea.x + Math.max(0, Math.round((targetDisplay.workArea.width - width) / 2)),
        y: targetDisplay.workArea.y + Math.max(0, Math.round((targetDisplay.workArea.height - height) / 2))
      }
    : undefined
  return { ...position, width, height }
}

export function createMainWindow(): BrowserWindow {
  const saved = windowBoundsStore.get()
  const bounds = saved ?? defaultWindowBounds()

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences()
  })

  // Persisted on every move/resize (not just on close) so a window killed
  // outside a normal quit - a crash, a forced process kill - still reopens
  // wherever it last settled instead of losing the whole session's changes.
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  const persistBounds = (): void => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized() || mainWindow.isMinimized()) return
      windowBoundsStore.set(mainWindow.getBounds())
    }, 400)
  }
  mainWindow.on('resize', persistBounds)
  mainWindow.on('move', persistBounds)

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
