import { randomUUID } from 'crypto'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import type { WebContents } from 'electron'
import type { PtySpawnOptions } from '../shared/types'

const MAX_BUFFER_LENGTH = 200_000

interface PtyEntry {
  proc: IPty
  sender: WebContents
  buffer: string
}

class PtyManager {
  private ptys = new Map<string, PtyEntry>()

  spawn(options: Required<Pick<PtySpawnOptions, 'command' | 'cwd'>> & PtySpawnOptions, sender: WebContents): string {
    const ptyId = randomUUID()
    const proc = pty.spawn(options.command, options.args ?? [], {
      name: 'xterm-color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd,
      env: process.env as Record<string, string>
    })

    proc.onData((data) => {
      const entry = this.ptys.get(ptyId)
      if (entry) {
        entry.buffer = (entry.buffer + data).slice(-MAX_BUFFER_LENGTH)
      }
      if (!sender.isDestroyed()) {
        sender.send('pty:data', { ptyId, data })
      }
    })

    proc.onExit(({ exitCode, signal }) => {
      if (!sender.isDestroyed()) {
        sender.send('pty:exit', { ptyId, exitCode, signal })
      }
      this.ptys.delete(ptyId)
    })

    this.ptys.set(ptyId, { proc, sender, buffer: '' })
    return ptyId
  }

  getBuffer(ptyId: string): string {
    return this.ptys.get(ptyId)?.buffer ?? ''
  }

  write(ptyId: string, data: string): void {
    this.ptys.get(ptyId)?.proc.write(data)
  }

  resize(ptyId: string, cols: number, rows: number): void {
    this.ptys.get(ptyId)?.proc.resize(cols, rows)
  }

  kill(ptyId: string): void {
    this.ptys.get(ptyId)?.proc.kill()
    this.ptys.delete(ptyId)
  }

  killAll(): void {
    for (const { proc } of this.ptys.values()) {
      proc.kill()
    }
    this.ptys.clear()
  }
}

export const ptyManager = new PtyManager()
