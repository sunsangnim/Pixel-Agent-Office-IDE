import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app, screen } from 'electron'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

function getStorePath(): string {
  return join(app.getPath('userData'), 'window-bounds.json')
}

/** A saved position is only worth restoring if it still lands on a display
 *  that's actually connected right now - otherwise (an external monitor was
 *  unplugged, say) the window would open off-screen with no way to drag it
 *  back into view. */
function isOnScreen(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    )
  })
}

export const windowBoundsStore = {
  get(): WindowBounds | null {
    const path = getStorePath()
    if (!existsSync(path)) return null
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<WindowBounds>
      if (
        typeof parsed.x !== 'number' || typeof parsed.y !== 'number' ||
        typeof parsed.width !== 'number' || typeof parsed.height !== 'number'
      ) {
        return null
      }
      const bounds = parsed as WindowBounds
      return isOnScreen(bounds) ? bounds : null
    } catch {
      return null
    }
  },

  set(bounds: WindowBounds): void {
    const path = getStorePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(bounds, null, 2), 'utf-8')
  }
}
