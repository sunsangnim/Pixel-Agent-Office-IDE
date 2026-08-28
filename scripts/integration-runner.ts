import { strict as assert } from 'node:assert'
import path from 'node:path'
import fs from 'node:fs'
import type { WebContents } from 'electron'
import { getCliAdapter, adapterIdForTemplate } from '../src/main/cliAdapters'
import { ptyManager } from '../src/main/ptyManager'
import { BUILT_IN_AGENT_PROFILES } from '../src/shared/agentProfiles'
import { ORCHESTRATION_POLICY } from '../src/shared/orchestrationPolicy'
import type { AgentRuntimeState, AgentStatePayload, CliAdapterId } from '../src/shared/types'
import { planTask } from '../src/renderer/src/lib/taskRouter'
import { isMeetingEndCommand, isMeetingStartCommand } from '../src/renderer/src/lib/meetingCommands'
import { isWorkingTime } from '../src/renderer/src/hooks/useOfficeClock'
import { getCorporateRosterCell, CORPORATE_ROSTER_SIZE } from '../src/renderer/src/lib/corporateRoster'
import { presenceForRuntime, readStoredJson } from '../src/renderer/src/lib/meetingCheckpoint'

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

function statesFor(events: RecordedEvent[], ptyId: string): AgentRuntimeState[] {
  return events
    .filter((event) => event.channel === 'agent:state')
    .map((event) => event.payload as AgentStatePayload)
    .filter((payload) => payload.ptyId === ptyId)
    .map((payload) => payload.state)
}

async function waitForState(
  events: RecordedEvent[],
  ptyId: string,
  state: AgentRuntimeState,
  timeoutMs = 7000
): Promise<void> {
  await waitFor(() => statesFor(events, ptyId).includes(state), timeoutMs)
}

async function stopPty(events: RecordedEvent[], ptyId: string): Promise<void> {
  ptyManager.write(ptyId, 'exit\r')
  try {
    await waitFor(
      () =>
        events.some(
          (event) => event.channel === 'pty:exit' && (event.payload as { ptyId: string }).ptyId === ptyId
        ),
      2000
    )
  } catch {
    ptyManager.kill(ptyId)
  }
}

function verifyRoutingAndProfiles(): void {
  assert.equal(BUILT_IN_AGENT_PROFILES.length, 15)
  assert.equal(new Set(BUILT_IN_AGENT_PROFILES.map((profile) => profile.profileId)).size, 15)
  assert.equal(BUILT_IN_AGENT_PROFILES.filter((profile) => profile.rank === 'teamLead').length, 3)
  assert.equal(BUILT_IN_AGENT_PROFILES.filter((profile) => profile.rank === 'subAgent').length, 12)
  assert.equal(ORCHESTRATION_POLICY.maxChildrenPerLead, 4)

  assert.deepEqual(planTask('간단한 버그 고쳐').templateIds, ['claude-code'])
  assert.deepEqual(planTask('@코덱스 애니메이션 고쳐').templateIds, ['codex-cli'])
  assert.deepEqual(planTask('@Codex 테스트 고쳐').templateIds, ['codex-cli'])
  assert.deepEqual(planTask('@안티그래피 이미지 만들어').templateIds, ['antigravity-cli'])
  assert.deepEqual(planTask('@claude 기능 만들어').templateIds, ['claude-code'])
  assert.deepEqual(planTask('전체 기능을 병렬로 통합 테스트해').templateIds, [
    'claude-code',
    'codex-cli',
    'antigravity-cli'
  ])
  assert.equal(adapterIdForTemplate('claude-code'), 'claude')
  assert.equal(adapterIdForTemplate('codex-cli'), 'codex')
  assert.equal(adapterIdForTemplate('antigravity-cli'), 'antigravity')
  assert.equal(isMeetingStartCommand('회의하자'), true)
  assert.equal(isMeetingStartCommand('다 모여'), true)
  assert.equal(isMeetingEndCommand('회의 종료'), true)
  assert.equal(isWorkingTime(new Date(2026, 7, 28, 8, 0)), true)
  assert.equal(isWorkingTime(new Date(2026, 7, 28, 16, 59)), true)
  assert.equal(isWorkingTime(new Date(2026, 7, 28, 17, 0)), false)
  console.log('PASS routing, 15 profiles, and orchestration policy')
}

function verifyAdapters(): void {
  const adapterCases: Array<[CliAdapterId, string]> = [
    ['claude', '{"type":"result"}'],
    ['codex', '{"type":"turn.completed"}']
  ]
  for (const [adapterId, output] of adapterCases) {
    assert.equal(getCliAdapter(adapterId).inspectOutput(output)?.state, 'completed')
  }
  assert.equal(getCliAdapter('generic').inspectOutput('fatal error: test')?.state, 'error')
  assert.equal(getCliAdapter('generic').inspectOutput('allow? y/n')?.state, 'waiting')
  assert.equal(getCliAdapter('generic').serializePrompt('hello'), 'hello\r')
  console.log('PASS CLI adapter signals and prompt serialization')
}

function verifyLivingOfficeAndRoster(): void {
  assert.equal(presenceForRuntime('working'), 'working')
  assert.equal(presenceForRuntime('waiting'), 'requestingHelp')
  assert.equal(presenceForRuntime('error'), 'error')
  assert.equal(presenceForRuntime('exited'), 'offDuty')
  assert.deepEqual(readStoredJson('{"ok":true}', {}), { ok: true })
  assert.deepEqual(readStoredJson('broken', []), [])

  assert.equal(CORPORATE_ROSTER_SIZE, 20)
  assert.deepEqual(getCorporateRosterCell(0), { index: 0, row: 0, column: 0, position: '0%' })
  assert.deepEqual(getCorporateRosterCell(19), { index: 19, row: 3, column: 4, position: '100%' })
  assert.equal(getCorporateRosterCell(99).index, 19)

  const rows = [1, 2, 3, 4].map((row) => {
    const file = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', `corporate-roster-row-${row}-v1.png`)
    const png = fs.readFileSync(file)
    assert.equal(png.toString('ascii', 1, 4), 'PNG')
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    const colorType = png[25]
    assert.ok(colorType === 4 || colorType === 6 || png.includes(Buffer.from('tRNS')))
    return { width, height }
  })
  assert.ok(rows.every((row) => row.width > 0 && row.height > 0))
  console.log('PASS living-office checkpoint policy and 20-character roster assets')
}

function spawnFixture(sender: WebContents, adapterId: CliAdapterId): string {
  return ptyManager.spawn(
    {
      command: process.execPath,
      args: [path.join(process.cwd(), 'scripts', 'fixtures', 'fake-agent.cjs')],
      cwd: process.cwd(),
      adapterId
    },
    sender
  )
}

async function main(): Promise<void> {
  const events: RecordedEvent[] = []
  const sender = {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => events.push({ channel, payload })
  } as unknown as WebContents

  verifyRoutingAndProfiles()
  verifyAdapters()
  verifyLivingOfficeAndRoster()

  const ptyId = spawnFixture(sender, 'generic')

  try {
    await waitFor(() => ptyManager.getBuffer(ptyId).includes('fake agent ready'))
    ptyManager.sendPrompt(ptyId, 'smoke test')
    await waitForState(events, ptyId, 'completed')
    assert.match(ptyManager.getBuffer(ptyId), /working: smoke test/)
    assert.ok(statesFor(events, ptyId).includes('working'))
    console.log('PASS PTY working → completed lifecycle')
  } finally {
    await stopPty(events, ptyId)
  }

  const failedId = spawnFixture(sender, 'generic')
  const healthyId = spawnFixture(sender, 'codex')
  try {
    await Promise.all([
      waitFor(() => ptyManager.getBuffer(failedId).includes('fake agent ready')),
      waitFor(() => ptyManager.getBuffer(healthyId).includes('fake agent ready'))
    ])
    ptyManager.sendPrompt(failedId, 'fail this task')
    ptyManager.sendPrompt(healthyId, 'continue independently')
    await Promise.all([
      waitForState(events, failedId, 'error'),
      waitForState(events, healthyId, 'completed')
    ])
    assert.ok(!statesFor(events, healthyId).includes('error'))
    console.log('PASS PTY error detection and session isolation')
  } finally {
    await Promise.all([stopPty(events, failedId), stopPty(events, healthyId)])
    ptyManager.killAll()
  }
}

main()
  .then(() => setTimeout(() => process.exit(0), 250))
  .catch((error) => {
    console.error(error)
    ptyManager.killAll()
    setTimeout(() => process.exit(1), 250)
  })
