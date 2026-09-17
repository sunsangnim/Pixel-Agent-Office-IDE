import { appendFileSync, existsSync, renameSync, statSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'

const MAX_LOG_BYTES = 2 * 1024 * 1024

function logPath(): string {
  return join(app.getPath('userData'), 'error.log')
}

/** Renderer crashes (an uncaught error, a rejected promise, a React render
 *  throw) otherwise vanish the moment devtools isn't open to see them - this
 *  is the only record of them. Rotated once so it can't grow without bound
 *  across a long-running session. */
export function logRendererError(context: string, message: string): void {
  const path = logPath()
  try {
    if (existsSync(path) && statSync(path).size > MAX_LOG_BYTES) {
      renameSync(path, `${path}.1`)
    }
    appendFileSync(path, `[${new Date().toISOString()}] ${context}: ${message}\n`, 'utf8')
  } catch {
    // Logging must never itself crash the app - if the disk write fails, the
    // error is still visible in devtools console via the normal throw.
  }
}
