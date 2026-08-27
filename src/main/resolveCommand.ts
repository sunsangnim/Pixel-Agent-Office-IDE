import { existsSync } from 'fs'
import { delimiter, extname, isAbsolute, join } from 'path'

/**
 * node-pty's Windows backend (ConPTY) does not do the PATH/PATHEXT executable
 * search that a real shell does, so a bare command like "claude" or "codex"
 * (no extension) fails with "File not found" even though `where claude`
 * resolves it. Do that PATHEXT search ourselves before handing off to node-pty.
 */
export function resolveCommand(command: string): string {
  if (process.platform !== 'win32') return command
  if (isAbsolute(command) && existsSync(command)) return command

  const pathExt = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
  const dirs = (process.env.PATH ?? '').split(delimiter)
  const hasExt = extname(command) !== ''

  for (const dir of dirs) {
    if (hasExt) {
      const full = join(dir, command)
      if (existsSync(full)) return full
      continue
    }
    for (const ext of pathExt) {
      const full = join(dir, command + ext)
      if (existsSync(full)) return full
    }
  }

  return command
}
