import { strict as assert } from 'node:assert'
import path from 'node:path'
import fs from 'node:fs'
import { PNG } from 'pngjs'
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
import { MEETING_SEATS, TEAM_DESKS, routeFor, type OfficeGameActor } from '../src/renderer/src/game/officeWorld'
import { OFFICE_COLLISIONS, findOfficePath } from '../src/renderer/src/game/navigation'
import { intersectsAabb, pushApart, resolveAxisSeparated } from '../src/renderer/src/game/collisionResolution'
import { parseOfficeLayout } from '../src/renderer/src/game/layoutPersistence'
import {
  FURNITURE_FOOTPRINTS, OFFICE_GRID_COLUMNS, OFFICE_GRID_ROWS, OFFICE_WALL_COLLISIONS,
  furnitureCollision, rotatedFootprint, snapFurniturePoint
} from '../src/renderer/src/game/officeGrid'
import { ActorStateMachine, actionForPresence } from '../src/renderer/src/game/actorStateMachine'
import { OFFICE_OBJECTS, objectById } from '../src/renderer/src/game/officeObjects'
import { parseOfficeWorldSave, upsertSavedActor } from '../src/renderer/src/game/worldPersistence'

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

  assert.equal(TEAM_DESKS.length, 3)
  assert.ok(TEAM_DESKS.every((team) => team.length === 5))
  assert.equal(new Set(TEAM_DESKS.flat().map((point) => `${point.x}:${point.y}`)).size, 15)
  assert.equal(new Set(MEETING_SEATS.map((point) => `${point.x}:${point.y}`)).size, 8)
  const arrivingActor: OfficeGameActor = {
    profileId: 'test', instanceId: null, displayName: 'test', color: '#fff', rosterIndex: 1,
    slotIndex: 0, teamIndex: 0, presence: 'arriving'
  }
  assert.equal(routeFor(arrivingActor, 0).length, 3)
  assert.deepEqual(routeFor({ ...arrivingActor, presence: 'meeting' }, 0).at(-1), MEETING_SEATS[0])
  assert.deepEqual(routeFor({ ...arrivingActor, presence: 'pantry' }, 0).at(-1), { x: 220, y: 155 })
  assert.deepEqual(routeFor({ ...arrivingActor, presence: 'pantry' }, 1).at(-1), { x: 65, y: 150 })
  const navigationPath = findOfficePath({ x: 50, y: 350 }, { x: 700, y: 350 })
  assert.ok(navigationPath.length >= 1)
  assert.ok(navigationPath.every((point) => !OFFICE_COLLISIONS.some((rect) =>
    point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height
  )))
  assert.equal(intersectsAabb({ x: 0, y: 0, width: 20, height: 20 }, { x: 10, y: 10, width: 5, height: 5 }), true)
  assert.equal(intersectsAabb({ x: 0, y: 0, width: 5, height: 5 }, { x: 10, y: 10, width: 5, height: 5 }), false)
  const slide = resolveAxisSeparated({ x: 0, y: 0 }, { x: 10, y: 10 }, [{ x: 8, y: -20, width: 10, height: 40 }], 2, 2)
  assert.equal(slide.x, 0)
  assert.equal(slide.y, 10)
  const [pushedA, pushedB] = pushApart({ id: 'a', x: 0, y: 0, radius: 10 }, { id: 'b', x: 5, y: 0, radius: 10 })
  assert.ok(Math.abs(Math.hypot(pushedB.x - pushedA.x, pushedB.y - pushedA.y) - 20) < 0.001)
  assert.deepEqual(parseOfficeLayout('{"desk":{"x":10,"y":20},"bad":{"x":"x"}}'), { desk: { x: 10, y: 20 } })
  assert.deepEqual(parseOfficeLayout('{"sofa":{"x":30,"y":40,"rotation":90}}'), { sofa: { x: 30, y: 40, rotation: 90 } })
  assert.equal(OFFICE_GRID_COLUMNS, 60)
  assert.equal(OFFICE_GRID_ROWS, 40)
  assert.deepEqual(FURNITURE_FOOTPRINTS[15], { columns: 1, rows: 2 })
  assert.deepEqual(rotatedFootprint(15, 90), { columns: 2, rows: 1 })
  assert.deepEqual(snapFurniturePoint({ x: 103, y: 99 }, FURNITURE_FOOTPRINTS[15]), { x: 104, y: 96 })
  assert.deepEqual(furnitureCollision({ x: 104, y: 96 }, FURNITURE_FOOTPRINTS[15]), { x: 96, y: 80, width: 16, height: 32 })
  const throughPantryDoor = findOfficePath({ x: 240, y: 240 }, { x: 240, y: 160 }, OFFICE_WALL_COLLISIONS)
  assert.ok(throughPantryDoor.every((point) => !OFFICE_WALL_COLLISIONS.some((wall) =>
    point.x > wall.x && point.x < wall.x + wall.width && point.y > wall.y && point.y < wall.y + wall.height
  )))
  const stateMachine = new ActorStateMachine('deskIdle')
  stateMachine.startWalking(20, 2)
  assert.equal(stateMachine.current.facing, 'right')
  stateMachine.requestPresence('pantry')
  stateMachine.arrive(0)
  assert.equal(stateMachine.current.action, 'eating')
  assert.equal(stateMachine.current.actionLocked, true)
  assert.equal(stateMachine.requestPresence('working'), false)
  assert.equal(stateMachine.completeAction(), 'working')
  assert.equal(actionForPresence('meeting', 0), 'sitting')
  assert.equal(actionForPresence('pantry', 0), 'eating')
  assert.equal(actionForPresence('pantry', 1), 'drinking')
  assert.equal(OFFICE_OBJECTS.filter((object) => object.type === 'desk').length, 15)
  assert.equal(OFFICE_OBJECTS.filter((object) => object.id.startsWith('meeting-chair-')).length, 8)
  assert.deepEqual(objectById('representative-sofa')?.snapPoint, { x: 895, y: 458 })
  const savedWorld = upsertSavedActor(parseOfficeWorldSave(null), {
    profileId: 'test', x: 32, y: 48, presence: 'deskIdle', updatedAt: 1
  })
  assert.equal(parseOfficeWorldSave(JSON.stringify(savedWorld)).actors[0].x, 32)
  assert.deepEqual(parseOfficeWorldSave('broken'), { version: 1, actors: [] })
  const ceoSheet = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'ceo-animation-sheet-v2.png'))
  assert.equal(ceoSheet.toString('ascii', 1, 4), 'PNG')
  assert.ok(ceoSheet.readUInt32BE(16) / 8 >= 48)
  assert.ok(ceoSheet.readUInt32BE(20) / 6 >= 64)
  assert.ok(ceoSheet[25] === 4 || ceoSheet[25] === 6 || ceoSheet.includes(Buffer.from('tRNS')))
  for (const atlasName of [
    'claude-team-animation-atlas-v1.png',
    'codex-team-animation-atlas-v1.png',
    'antigravity-team-animation-atlas-v1.png',
    'roster-row-4-animation-atlas-v1.png'
  ]) {
    const teamAtlas = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', atlasName))
    assert.equal(teamAtlas.toString('ascii', 1, 4), 'PNG')
    assert.ok(teamAtlas.readUInt32BE(16) / 5 >= 128)
    assert.ok(teamAtlas.readUInt32BE(20) / 4 >= 128)
    assert.ok(teamAtlas[25] === 4 || teamAtlas[25] === 6 || teamAtlas.includes(Buffer.from('tRNS')))
    const decoded = PNG.sync.read(teamAtlas)
    assert.equal(decoded.data[3], 0)
    let transparentPixels = 0
    for (let index = 3; index < decoded.data.length; index += 4) {
      if (decoded.data[index] === 0) transparentPixels += 1
    }
    assert.ok(transparentPixels / (decoded.width * decoded.height) > 0.45)
  }
  const architecture = PNG.sync.read(fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'office-architecture-background-v1.png')))
  assert.ok(Math.abs(architecture.width / architecture.height - 1.5) < 0.01)
  const furnitureDirectory = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'furniture')
  const furnitureAssets = fs.readdirSync(furnitureDirectory).filter((file) => file.endsWith('.png'))
  assert.equal(furnitureAssets.length, 12)
  furnitureAssets.forEach((file) => {
    const furniture = PNG.sync.read(fs.readFileSync(path.join(furnitureDirectory, file)))
    assert.ok(furniture.width >= 128 && furniture.height >= 128)
    for (let x = 0; x < furniture.width; x += 1) {
      assert.equal(furniture.data[x * 4 + 3], 0)
      assert.equal(furniture.data[((furniture.height - 1) * furniture.width + x) * 4 + 3], 0)
    }
    for (let y = 0; y < furniture.height; y += 1) {
      assert.equal(furniture.data[(y * furniture.width) * 4 + 3], 0)
      assert.equal(furniture.data[(y * furniture.width + furniture.width - 1) * 4 + 3], 0)
    }
  })
  const floorDirectory = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'floors')
  const floorAssets = fs.readdirSync(floorDirectory).filter((file) => file.endsWith('.png'))
  assert.equal(floorAssets.length, 4)
  floorAssets.forEach((file) => {
    const floor = PNG.sync.read(fs.readFileSync(path.join(floorDirectory, file)))
    assert.deepEqual([floor.width, floor.height], [64, 64])
    for (let index = 0; index < 64; index += 1) {
      const left = (index * 64) * 4
      const right = (index * 64 + 63) * 4
      const top = index * 4
      const bottom = (63 * 64 + index) * 4
      assert.deepEqual([...floor.data.subarray(left, left + 4)], [...floor.data.subarray(right, right + 4)])
      assert.deepEqual([...floor.data.subarray(top, top + 4)], [...floor.data.subarray(bottom, bottom + 4)])
    }
  })
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
