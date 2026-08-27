import { strict as assert } from 'node:assert'
import path from 'node:path'
import type { WebContents } from 'electron'
import { ptyManager } from '../src/main/ptyManager'

interface RecordedEvent {
  channel: string
  payload: unknown
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 7000,
  intervalMs = 25
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

async function main(): Promise<void> {
  const events: RecordedEvent[] = []
  const sender = {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => events.push({ channel, payload })
  } as unknown as WebContents

  const fixture = path.join(process.cwd(), 'scripts', 'fixtures', 'fake-agent.cjs')
  const ptyId = ptyManager.spawn(
    {
      command: process.execPath,
      args: [fixture],
      cwd: process.cwd(),
      adapterId: 'generic'
    },
    sender
  )

  try {
    await waitFor(() => events.some((event) => event.channel === 'pty:data'))
    ptyManager.sendPrompt(ptyId, 'smoke test')
    await waitFor(() => ptyManager.getBuffer(ptyId).includes('task complete'))
    assert.match(ptyManager.getBuffer(ptyId), /working: smoke test/)
    console.log('PASS PTY fake CLI smoke test')
  } finally {
    ptyManager.killAll()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

