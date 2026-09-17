import { strict as assert } from 'node:assert'
import path from 'node:path'
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { verifyStaffWalkSheets } from './verify-staff-walk-sheets'
import type { WebContents } from 'electron'
import { getCliAdapter, adapterIdForTemplate } from '../src/main/cliAdapters'
import { ptyManager } from '../src/main/ptyManager'
import { BUILT_IN_AGENT_PROFILES } from '../src/shared/agentProfiles'
import { MAX_TEAM_CAPACITY, ORCHESTRATION_POLICY } from '../src/shared/orchestrationPolicy'
import type { AgentRuntimeState, AgentStatePayload, CliAdapterId } from '../src/shared/types'
import { planTask } from '../src/renderer/src/lib/taskRouter'
import { isMeetingEndCommand, isMeetingStartCommand } from '../src/renderer/src/lib/meetingCommands'
import { isWorkingTime } from '../src/renderer/src/hooks/useOfficeClock'
import { getCorporateRosterCell, CORPORATE_ROSTER_SIZE } from '../src/renderer/src/lib/corporateRoster'
import { presenceForRuntime, readStoredJson } from '../src/renderer/src/lib/meetingCheckpoint'
import { CHAT_HISTORY_KEY, readChatHistory, saveChatHistory, userChatMessage } from '../src/renderer/src/lib/chatHistory'
import { MEETING_SEATS, TEAM_DESKS, routeFor, type OfficeGameActor } from '../src/renderer/src/game/officeWorld'
import { OFFICE_COLLISIONS, findOfficePath } from '../src/renderer/src/game/navigation'
import { intersectsAabb, pushApart, resolveAxisSeparated } from '../src/renderer/src/game/collisionResolution'
import { parseOfficeLayout } from '../src/renderer/src/game/layoutPersistence'
import {
  FURNITURE_FOOTPRINTS, OFFICE_FLOOR_REGION, OFFICE_GRID_COLUMNS, OFFICE_GRID_ROWS, OFFICE_WALL_COLLISIONS,
  furnitureCollision, rotatedFootprint, snapFurniturePoint
} from '../src/renderer/src/game/officeGrid'
import { ActorStateMachine, actionForPresence } from '../src/renderer/src/game/actorStateMachine'
import { OFFICE_OBJECTS, objectById } from '../src/renderer/src/game/officeObjects'
import { parseOfficeWorldSave, upsertSavedActor } from '../src/renderer/src/game/worldPersistence'
import {
  CHARACTER_FRAME_HEIGHT, CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_PADDING,
  measureCharacterSheet, measureSeatedSheet, type CharacterSheetKey
} from '../src/renderer/src/game/characterFrames'
import { STAFF_SEATED_SHEETS } from '../src/renderer/src/game/staffWalkSheets'

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
  // Dispose the fixture PTY as well as its child. On Windows a child exiting
  // alone can leave ConPTY worker sockets alive during Node shutdown.
  ptyManager.kill(ptyId)
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
  assert.equal(MAX_TEAM_CAPACITY - 1, 4)

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
  const chatStorage = new Map<string, string>()
  const chatStore = { getItem: (key: string) => chatStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { chatStorage.set(key, value) } }
  const meetingMessage = userChatMessage('회의하자')
  saveChatHistory(chatStore, [meetingMessage, userChatMessage('첫 줄\n둘째 줄'), userChatMessage('회의 종료')])
  assert.deepEqual(readChatHistory(chatStore).map(message => message.text), ['회의하자', '첫 줄\n둘째 줄', '회의 종료'])
  assert.equal(readChatHistory(chatStore)[0].id, meetingMessage.id, 'reload retains message identity and order')
  chatStorage.set(CHAT_HISTORY_KEY, 'broken')
  assert.deepEqual(readChatHistory(chatStore), [])
  chatStorage.set(CHAT_HISTORY_KEY, JSON.stringify([null, {}, { kind: 'other' }, meetingMessage]))
  assert.deepEqual(readChatHistory(chatStore), [meetingMessage])
  saveChatHistory(chatStore, Array.from({ length: 305 }, (_, index) => userChatMessage(String(index))))
  assert.equal(readChatHistory(chatStore).length, 300)
  assert.equal(readChatHistory(chatStore)[0].text, '5')
  assert.doesNotThrow(() => saveChatHistory({ setItem: () => { throw new Error('Quota exceeded') } }, [meetingMessage]))
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
    const file = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'characters', `corporate-roster-row-${row}-v1.png`)
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
  assert.deepEqual(TEAM_DESKS.map((team) => team.length), [1, 1, 2])
  assert.equal(new Set(TEAM_DESKS.flat().map((point) => `${point.x}:${point.y}`)).size, 4)
  assert.equal(new Set(MEETING_SEATS.map((point) => `${point.x}:${point.y}`)).size, 8)
  const arrivingActor: OfficeGameActor = {
    profileId: 'test', instanceId: null, displayName: 'test', color: '#fff', rosterIndex: 1,
    slotIndex: 0, teamIndex: 0, presence: 'arriving'
  }
  assert.equal(routeFor(arrivingActor, 0).length, 2)
  assert.deepEqual(routeFor({ ...arrivingActor, presence: 'meeting' }, 0).at(-1), MEETING_SEATS[0])
  assert.deepEqual(routeFor({ ...arrivingActor, presence: 'pantry' }, 0).at(-1), { x: 220, y: 175 })
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
  assert.equal(OFFICE_GRID_ROWS, 60)
  assert.deepEqual(FURNITURE_FOOTPRINTS[15], { columns: 2, rows: 4 })
  assert.deepEqual(rotatedFootprint(15, 90), { columns: 4, rows: 2 })
  assert.deepEqual(snapFurniturePoint({ x: 103, y: 99 }, FURNITURE_FOOTPRINTS[15]), { x: 96, y: 96 })
  assert.deepEqual(furnitureCollision({ x: 96, y: 96 }, FURNITURE_FOOTPRINTS[15]), { x: 80, y: 64, width: 32, height: 64 })
  assert.deepEqual(OFFICE_FLOOR_REGION, { x: 480, y: 480, width: 928, height: 928 })
  const throughPantryDoor = findOfficePath({ x: 240, y: 240 }, { x: 240, y: 160 }, OFFICE_WALL_COLLISIONS)
  assert.ok(throughPantryDoor.every((point) => !OFFICE_WALL_COLLISIONS.some((wall) =>
    point.x > wall.x && point.x < wall.x + wall.width && point.y > wall.y && point.y < wall.y + wall.height
  )))
  const architectureBlocks = (x: number, y: number): boolean => OFFICE_WALL_COLLISIONS.some((wall) =>
    x >= wall.x && x < wall.x + wall.width && y >= wall.y && y < wall.y + wall.height)
  assert.equal(architectureBlocks(816, 208), false, 'elevator lower corridor must stay fully open')
  assert.equal(architectureBlocks(704, 704), true, 'representative room left wall must block movement')
  assert.equal(architectureBlocks(720, 704), false, 'representative room must include its widened interior')
  assert.equal(architectureBlocks(832, 640), false, 'representative room top opening must stay open')
  const stateMachine = new ActorStateMachine('deskIdle')
  stateMachine.startWalking(20, 2)
  assert.equal(stateMachine.current.facing, 'right')
  stateMachine.requestPresence('pantry')
  stateMachine.arrive(0)
  assert.equal(stateMachine.current.action, 'eating')
  assert.equal(stateMachine.current.actionLocked, true)
  assert.equal(stateMachine.requestPresence('working'), true)
  assert.equal(stateMachine.current.actionLocked, false)
  stateMachine.requestPresence('pantry')
  stateMachine.arrive(0)
  assert.equal(stateMachine.requestPresence('deskIdle'), false)
  assert.equal(stateMachine.completeAction(), 'deskIdle')
  assert.equal(actionForPresence('meeting', 0), 'sitting')
  assert.equal(actionForPresence('pantry', 0), 'eating')
  assert.equal(actionForPresence('pantry', 1), 'drinking')
  assert.equal(OFFICE_OBJECTS.filter((object) => object.type === 'desk').length, 4)
  assert.equal(OFFICE_OBJECTS.filter((object) => object.id.startsWith('meeting-chair-')).length, 8)
  assert.deepEqual(objectById('representative-sofa')?.snapPoint, { x: 895, y: 458 })
  const savedWorld = upsertSavedActor(parseOfficeWorldSave(null), {
    profileId: 'test', x: 32, y: 48, presence: 'deskIdle', updatedAt: 1
  })
  assert.equal(parseOfficeWorldSave(JSON.stringify(savedWorld)).actors[0].x, 32)
  assert.deepEqual(parseOfficeWorldSave('broken'), { version: 1, actors: [] })
  const ceoSheet = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'characters', 'ceo-walk-cycle-v3.png'))
  assert.equal(ceoSheet.toString('ascii', 1, 4), 'PNG')
  assert.ok(ceoSheet.readUInt32BE(16) / 4 >= 48)
  assert.ok(ceoSheet.readUInt32BE(20) / 4 >= 64)
  assert.ok(ceoSheet[25] === 4 || ceoSheet[25] === 6 || ceoSheet.includes(Buffer.from('tRNS')))
  for (const atlasName of [
    'claude-team-animation-atlas-v1.png',
    'codex-team-animation-atlas-v1.png',
    'antigravity-team-animation-atlas-v1.png',
    'roster-row-4-animation-atlas-v1.png'
  ]) {
    const teamAtlas = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'characters', atlasName))
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
  const furnitureDirectory = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'furniture')
  const furnitureAssets = fs.readdirSync(furnitureDirectory).filter((file) => file.endsWith('.png'))
  assert.equal(furnitureAssets.length, 13)
  furnitureAssets.forEach((file) => {
    const furniture = PNG.sync.read(fs.readFileSync(path.join(furnitureDirectory, file)))
    assert.ok(furniture.width >= 32 && furniture.height >= 32)
    for (let x = 0; x < furniture.width; x += 1) {
      assert.equal(furniture.data[x * 4 + 3], 0)
      assert.equal(furniture.data[((furniture.height - 1) * furniture.width + x) * 4 + 3], 0)
    }
    for (let y = 0; y < furniture.height; y += 1) {
      assert.equal(furniture.data[(y * furniture.width) * 4 + 3], 0)
      assert.equal(furniture.data[(y * furniture.width + furniture.width - 1) * 4 + 3], 0)
    }
  })
  const directionalFurnitureDirectory = path.join(furnitureDirectory, 'directional')
  const directionalFurnitureAssets = fs.readdirSync(directionalFurnitureDirectory).filter((file) => file.endsWith('.png'))
  assert.equal(directionalFurnitureAssets.length, 52)
  for (const direction of ['front', 'right', 'back', 'left']) {
    assert.equal(directionalFurnitureAssets.filter((file) => file.includes(`-${direction}-v1.png`)).length, 13)
  }
  directionalFurnitureAssets.forEach((file) => {
    const furniture = PNG.sync.read(fs.readFileSync(path.join(directionalFurnitureDirectory, file)))
    assert.ok(furniture.width >= 32 && furniture.height >= 32)
    assert.equal(furniture.data[3], 0)
    assert.equal(furniture.data[(furniture.width - 1) * 4 + 3], 0)
    assert.equal(furniture.data[((furniture.height - 1) * furniture.width) * 4 + 3], 0)
    assert.equal(furniture.data[(furniture.width * furniture.height - 1) * 4 + 3], 0)
  })
  const floorDirectory = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'floors')
  const floorAssets = fs.readdirSync(floorDirectory).filter((file) => file.endsWith('.png'))
  assert.equal(floorAssets.length, 7)
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

function verifyCharacterFeet(): void {
  // Source-pixel shoe baselines measured independently from the runtime crops.
  // Uniform height / 4 slicing loses 30–64 pixels from the first team row.
  const sheets: Array<{ key: CharacterSheetKey; file: string; feet: number[][] }> = [
    { key: 'claude-team-animation-atlas', file: 'claude-team-animation-atlas-v1.png', feet: [
      [343, 342, 342, 342, 342], [609, 610, 609, 611, 611], [866, 865, 865, 865, 865]
    ] },
    { key: 'codex-team-animation-atlas', file: 'codex-team-animation-atlas-v1.png', feet: [
      [369, 369, 369, 369, 369], [675, 675, 675, 675, 675], [954, 953, 954, 953, 954]
    ] },
    { key: 'antigravity-team-animation-atlas', file: 'antigravity-team-animation-atlas-v1.png', feet: [
      [310, 309, 309, 309, 309], [583, 583, 583, 582, 583], [833, 833, 833, 833, 833]
    ] },
    { key: 'ceo-animation-sheet', file: 'ceo-walk-cycle-v3.png', feet: [
      [312, 312, 312, 312], [616, 616, 616, 616],
      [919, 919, 919, 919], [1215, 1215, 1215, 1215]
    ] },
    { key: 'ceo-seated-sheet', file: 'ceo-seated-v1.png', feet: [
      [599, 599], [1180, 1180]
    ] }
  ]
  for (const { key, file, feet } of sheets) {
    const png = PNG.sync.read(fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/assets/pixel-office/characters', file)))
    const frames = measureCharacterSheet(png.data, png.width, key)
    if (key === 'ceo-animation-sheet') {
      const scales = frames.filter(({ row }) => row < 4).map(({ source, destination }) => destination.height / source.height)
      assert.ok(Math.max(...scales) - Math.min(...scales) < 0.007,
        'representative idle/walking poses must share one scale without resizing the body between steps')
      // Inspect the actual front-walk artwork, not just frame names. The old
      // sheet always raised the viewer-left hand even as its frame advanced.
      const handHeightDifference = (column: number): number => {
        const { source } = frames.find((frame) => frame.row === 1 && frame.column === column)!
        const hands = [{ y: 0, count: 0 }, { y: 0, count: 0 }]
        for (let y = Math.floor(source.y + source.height * 0.53); y < source.y + source.height * 0.82; y += 1) {
          for (let x = source.x; x < source.x + source.width; x += 1) {
            const index = (y * png.width + x) * 4
            const [r, g, b, a] = png.data.subarray(index, index + 4)
            if (a <= 127 || r <= 140 || g <= 70 || g >= 220 || b >= 180 || r <= g * 1.1) continue
            const hand = hands[x < source.x + source.width / 2 ? 0 : 1]
            hand.y += y
            hand.count += 1
          }
        }
        assert.ok(hands.every((hand) => hand.count > 100), 'both hands must remain visible')
        return hands[0].y / hands[0].count - hands[1].y / hands[1].count
      }
      assert.ok(handHeightDifference(0) < -8, 'first contact brings the viewer-left hand forward')
      assert.ok(handHeightDifference(2) > 8, 'opposite contact brings the viewer-right hand forward')
    }
    feet.forEach((columns, row) => columns.forEach((footY, column) => {
      const { source, destination } = frames.find((frame) => frame.row === row && frame.column === column)!
      const label = `${key} column ${column} row ${row}`
      assert.ok(source.y <= footY && source.y + source.height > footY, `${label}: missing shoes`)
      let shoePixels = 0
      for (let x = source.x; x < source.x + source.width; x += 1) {
        if (png.data[(footY * png.width + x) * 4 + 3] > 127) shoePixels += 1
      }
      assert.ok(shoePixels > 2, `${label}: shoe baseline must contain actual art`)
      assert.equal(destination.y + destination.height, CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING, `${label}: stable ground line`)
      assert.ok(destination.x >= CHARACTER_FRAME_PADDING && destination.y >= CHARACTER_FRAME_PADDING)
      assert.ok(destination.x + destination.width <= CHARACTER_FRAME_WIDTH - CHARACTER_FRAME_PADDING)
      assert.ok(Math.abs(destination.width / source.width - destination.height / source.height) < 0.02, `${label}: preserve proportions`)
    }))
  }
  console.log('PASS complete character shoes, stable alignment (65 poses including seated CEO), and alternating representative arms')
}

function verifyStaffSeatedSheets(): void {
  for (const { team, file } of STAFF_SEATED_SHEETS) {
    const png = PNG.sync.read(fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/assets/pixel-office/characters/seated-v1', file)))
    const frames = measureSeatedSheet(png.data, png.width, png.height)
    assert.equal(frames.length, 15)
    for (const { row, column, source, destination } of frames) {
      const label = `team ${team}, person ${column}, seated row ${row}`
      assert.ok(source.width > 100 && source.height > 200, `${label}: complete body, not a stray fragment`)
      assert.equal(destination.y + destination.height, CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING)
      if (row < 2) {
        let samples = 0, opaque = 0
        for (let y = Math.floor(source.y + source.height * 0.53); y < source.y + source.height * 0.67; y++) {
          for (let x = Math.floor(source.x + source.width * 0.44); x < source.x + source.width * 0.56; x++) {
            samples++
            if (png.data[(y * png.width + x) * 4 + 3] > 225) opaque++
          }
        }
        assert.ok(opaque / samples > 0.98, `${label}: torso must not become transparent`)
      }
    }
    for (let column = 0; column < 5; column++) {
      const scales = frames.filter((frame) => frame.column === column).map(({ source, destination }) => destination.height / source.height)
      assert.ok(Math.max(...scales) - Math.min(...scales) < 0.01, 'all facings of one person share a scale')
    }
  }
  console.log('PASS all 15 employee seated skins: 45 complete poses, opaque torsos, and consistent directional scale')
}

async function main(): Promise<void> {
  verifyCharacterFeet()
  verifyStaffWalkSheets()
  verifyStaffSeatedSheets()
  if (process.argv.includes('--character-frames')) return
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
  .then(() => { process.exitCode = 0 })
  .catch((error) => {
    console.error(error)
    ptyManager.killAll()
    process.exitCode = 1
  })
