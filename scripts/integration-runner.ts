import { strict as assert } from 'node:assert'
import path from 'node:path'
import type { WebContents } from 'electron'
import { getCliAdapter, adapterIdForTemplate } from '../src/main/cliAdapters'
import { ptyManager } from '../src/main/ptyManager'
import { BUILT_IN_AGENT_PROFILES } from '../src/shared/agentProfiles'
import { ORCHESTRATION_POLICY } from '../src/shared/orchestrationPolicy'
import type { AgentRuntimeState, AgentStatePayload, CliAdapterId } from '../src/shared/types'
import { planTask } from '../src/renderer/src/lib/taskRouter'

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
  assert.equal(BUILT_IN_AGENT_PROFILES.length, 12)
  assert.equal(new Set(BUILT_IN_AGENT_PROFILES.map((profile) => profile.profileId)).size, 12)
  assert.equal(BUILT_IN_AGENT_PROFILES.filter((profile) => profile.rank === 'teamLead').length, 3)
  assert.equal(BUILT_IN_AGENT_PROFILES.filter((profile) => profile.rank === 'subAgent').length, 9)
  assert.equal(ORCHESTRATION_POLICY.maxChildrenPerLead, 3)

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
  console.log('PASS routing, 12 profiles, and orchestration policy')
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
