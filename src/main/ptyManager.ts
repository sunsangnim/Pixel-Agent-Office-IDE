import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import type { WebContents } from 'electron'
import { resolveCommand } from './resolveCommand'
import type { PtySpawnOptions } from '../shared/types'
import type { AgentRuntimeState, AgentStatePayload } from '../shared/types'
import { getCliAdapter } from './cliAdapters'
import type { CliAdapter } from './cliAdapters'

const MAX_BUFFER_LENGTH = 200_000
const FORCE_KILL_GRACE_MS = 3000

/**
 * node-pty's graceful kill() can leave slow-shutdown console apps (Claude
 * Code's TUI in particular) alive for minutes on Windows. Force-kill the
 * whole process tree if it hasn't exited on its own after a short grace
 * period, so removing a desk actually frees the process promptly.
 */
function forceKillWindowsTree(pid: number): void {
  if (process.platform !== 'win32') return
  setTimeout(() => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {
      // ignore errors: the process may have already exited gracefully
    })
  }, FORCE_KILL_GRACE_MS)
}

interface PtyEntry {
  proc: IPty
  sender: WebContents
  buffer: string
  adapter: CliAdapter
  state: AgentRuntimeState
  taskActive: boolean
  completionTimer?: ReturnType<typeof setTimeout>
}

class PtyManager {
  private ptys = new Map<string, PtyEntry>()

  spawn(options: Required<Pick<PtySpawnOptions, 'command' | 'cwd'>> & PtySpawnOptions, sender: WebContents): string {
    const ptyId = randomUUID()
    const adapter = getCliAdapter(options.adapterId)
    const proc = pty.spawn(resolveCommand(options.command), options.args ?? [], {
      name: 'xterm-color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd,
      env: { ...process.env, ...options.env } as Record<string, string>
    })

    proc.onData((data) => {
      const entry = this.ptys.get(ptyId)
      if (entry) {
        entry.buffer = (entry.buffer + data).slice(-MAX_BUFFER_LENGTH)
        const signal = entry.adapter.inspectOutput(data)
        if (signal) this.emitState(ptyId, entry, signal.state, signal.reason)
        else if (entry.taskActive) this.emitState(ptyId, entry, 'working')
        if (entry.taskActive && entry.state !== 'waiting' && entry.state !== 'error') {
          clearTimeout(entry.completionTimer)
          entry.completionTimer = setTimeout(() => {
            const current = this.ptys.get(ptyId)
            if (!current?.taskActive || current.state === 'waiting' || current.state === 'error') return
            current.taskActive = false
            this.emitState(ptyId, current, 'completed', '출력 유휴 상태로 작업 완료 판정')
          }, entry.adapter.completionIdleMs)
        }
      }
      if (!sender.isDestroyed()) {
        sender.send('pty:data', { ptyId, data })
      }
    })

    proc.onExit(({ exitCode, signal }) => {
      const entry = this.ptys.get(ptyId)
      if (entry) {
        clearTimeout(entry.completionTimer)
        this.emitState(
          ptyId,
          entry,
          exitCode === 0 ? 'exited' : 'error',
          exitCode === 0 ? 'CLI 프로세스 종료' : `CLI 종료 코드 ${exitCode}`
        )
      }
      if (!sender.isDestroyed()) {
        sender.send('pty:exit', { ptyId, exitCode, signal })
      }
      this.ptys.delete(ptyId)
    })

    const entry: PtyEntry = {
      proc,
      sender,
      buffer: '',
      adapter,
      state: 'starting',
      taskActive: false
    }
    this.ptys.set(ptyId, entry)
    this.emitState(ptyId, entry, 'starting', `${adapter.displayName} 시작 중`)
    return ptyId
  }

  private emitState(
    ptyId: string,
    entry: PtyEntry,
    state: AgentRuntimeState,
    reason?: string
  ): void {
    if (entry.state === state && !reason) return
    entry.state = state
    if (state === 'completed' || state === 'error' || state === 'exited') entry.taskActive = false
    if (entry.sender.isDestroyed()) return
    const payload: AgentStatePayload = {
      ptyId,
      adapterId: entry.adapter.id,
      state,
      reason,
      timestamp: Date.now()
    }
    entry.sender.send('agent:state', payload)
  }

  getBuffer(ptyId: string): string {
    return this.ptys.get(ptyId)?.buffer ?? ''
  }

  write(ptyId: string, data: string): void {
    const entry = this.ptys.get(ptyId)
    if (!entry) return
    try {
      entry.proc.write(data)
    } catch {
      // the process may have exited between the write request and this call
    }
  }

  sendPrompt(ptyId: string, prompt: string): void {
    const entry = this.ptys.get(ptyId)
    if (!entry) return
    clearTimeout(entry.completionTimer)
    entry.taskActive = true
    this.emitState(ptyId, entry, 'working', '프롬프트 전달')
    try {
      entry.proc.write(entry.adapter.serializePrompt(prompt))
    } catch (error) {
      this.emitState(
        ptyId,
        entry,
        'error',
        error instanceof Error ? error.message : '프롬프트 전송 실패'
      )
    }
  }

  resize(ptyId: string, cols: number, rows: number): void {
    const entry = this.ptys.get(ptyId)
    if (!entry) return
    try {
      entry.proc.resize(cols, rows)
    } catch {
      // the process may have exited between the resize request and this call
      // (e.g. a short-lived login command finishing right as the terminal
      // view mounts and fires its first ResizeObserver callback)
    }
  }

  kill(ptyId: string): void {
    const entry = this.ptys.get(ptyId)
    if (!entry) return
    forceKillWindowsTree(entry.proc.pid)
    clearTimeout(entry.completionTimer)
    try {
      entry.proc.kill()
    } catch {
      // already exited
    }
    this.ptys.delete(ptyId)
  }

  killAll(): void {
    for (const { proc, completionTimer } of this.ptys.values()) {
      clearTimeout(completionTimer)
      forceKillWindowsTree(proc.pid)
      try {
        proc.kill()
      } catch {
        // already exited
      }
    }
    this.ptys.clear()
  }
}

export const ptyManager = new PtyManager()
