const assert = require('node:assert/strict')
const path = require('node:path')
const { buildSync } = require('esbuild')

const outputFile = path.join(process.cwd(), 'out', 'movement-runner.cjs')
buildSync({
  stdin: {
    contents: [
      "export { OfficeScene } from './src/renderer/src/game/OfficeScene'",
      "export * from './src/renderer/src/game/navigation'",
      "export * from './src/renderer/src/game/officeWorld'",
      "export * from './src/renderer/src/game/officeGrid'",
      "export * from './src/renderer/src/game/layoutPersistence'",
      "export * from './src/renderer/src/game/idleActivity'",
      "export * from './src/renderer/src/game/actorStateMachine'",
      "export * from './src/renderer/src/lib/officePresence'"
    ].join('\n'), resolveDir: process.cwd(), loader: 'ts'
  },
  outfile: outputFile, bundle: true, platform: 'node', format: 'cjs',
  alias: { phaser: path.join(__dirname, 'fixtures', 'phaser-scene.cjs') },
  loader: { '.png': 'empty' }, define: { 'import.meta.glob': 'emptyAssetGlob' },
  banner: { js: 'function emptyAssetGlob() { return {} }' }, logLevel: 'silent'
})
const {
  OfficeScene, IdleActivity, ActorStateMachine, actionForPresence, resolveOfficePresence,
  findOfficePath, hasOfficeLineOfSight, isOfficePositionWalkable, routeFor, WAYPOINTS,
  DEFAULT_LAYOUT_SEED
} = require(outputFile)

const storage = new Map()
global.localStorage = {
  setItem: (key, value) => storage.set(key, value), getItem: (key) => storage.get(key) ?? null,
  removeItem: (key) => storage.delete(key)
}

function objectDouble(x = 0, y = 0) {
  const data = new Map()
  const object = {
    x, y, depth: 0, scaleX: 1, scaleY: 1, visible: true, playCount: 0,
    anims: {
      isPlaying: false, paused: false,
      pause() { this.paused = true }, resume() { this.paused = false }
    },
    setPosition(x, y) { this.x = x; this.y = y; return this },
    setY(y) { this.y = y; return this },
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this },
    setDepth(depth) { this.depth = depth; return this },
    setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this },
    setSize(width, height) { return this.setDisplaySize(width, height) },
    setVisible(visible) { this.visible = visible; return this },
    setText(text) { this.text = text; return this },
    setFrame(frame) { this.frame = frame; return this },
    setFlipX(flipX) { this.flipX = flipX; return this },
    setData(key, value) {
      if (typeof key === 'object') Object.entries(key).forEach(([name, entry]) => data.set(name, entry))
      else data.set(key, value)
      return this
    },
    getData(key) { return data.get(key) },
    play(key, ignorePlaying) {
      if (!ignorePlaying || !this.anims.isPlaying || this.animation !== key) this.playCount += 1
      this.animation = key; this.anims.isPlaying = true; return this
    },
    stop() { this.anims.isPlaying = false; return this },
    destroy() { this.destroyed = true }
  }
  for (const name of ['setOrigin', 'setPadding', 'setTint', 'setStrokeStyle', 'setFillStyle', 'setInteractive', 'setAlpha', 'on']) {
    object[name] = function () { return this }
  }
  return object
}

function createScene() {
  const scene = new OfficeScene()
  scene.add = { sprite: objectDouble, image: objectDouble, rectangle: objectDouble, text: objectDouble, container: objectDouble }
  scene.input = { setDraggable() {} }
  scene.sys = { isActive: () => true }
  scene.reportDeskCounts = () => {}
  scene.mockTweens = []
  scene.tweens = {
    add(config) {
      const tween = {
        config, end: scene.simulationTimeMs + (config.duration * 2 + (config.hold ?? 0)) * ((config.repeat ?? 0) + 1),
        stopped: false, paused: false,
        stop() { this.stopped = true }, pause() { this.paused = true }, resume() { this.paused = false }
      }
      scene.mockTweens.push(tween)
      return tween
    }
  }
  scene.layoutSave = JSON.parse(JSON.stringify(DEFAULT_LAYOUT_SEED))
  scene.zOrderById = new Map(Object.entries(scene.layoutSave).map(([id, value]) => [id, value.zOrder]))
  scene.nextZOrder = Math.max(...scene.zOrderById.values()) + 1
  for (const [id, saved] of Object.entries(scene.layoutSave)) {
    const frame = saved.frame ?? (id.startsWith('chair-') ? 12 : 10)
    scene.addFurniture(id, frame, saved.x, saved.y, saved.width ?? 64, saved.height ?? 64)
  }
  scene.navigationLayoutKey = scene.furnitureNavigationKey()
  return scene
}

function actor(profileId = 'test', teamIndex = 0, presence = 'deskIdle', slotIndex = 0) {
  return { profileId, instanceId: null, displayName: profileId, color: '#fff', rosterIndex: teamIndex * 5 + slotIndex + 1,
    teamIndex, slotIndex, presence }
}

function snapshot(scene, actors) {
  scene.updateSnapshot({ now: scene.simulationTimeMs, meetingActive: actors.some((actor) => actor.presence === 'meeting'), elevatorOpen: false, actors })
}

function advance(scene, seconds, observe = () => {}) {
  const frames = Math.ceil(seconds * 60)
  for (let frame = 0; frame < frames; frame += 1) {
    scene.update(0, 1000 / 60)
    for (const tween of scene.mockTweens) {
      if (!tween.stopped && !tween.paused && tween.end <= scene.simulationTimeMs) {
        tween.stopped = true
        tween.config.onComplete?.()
      }
    }
    if (frame % 60 === 0 && scene.snapshot) snapshot(scene, scene.snapshot.actors)
    observe()
  }
}

// Navigation uses a full body, rejects disconnected goals, and validates each
// smoothed segment. A narrow gap that fits a point must not pass this test.
const gap = [{ x: 400, y: 0, width: 16, height: 200 }, { x: 400, y: 216, width: 16, height: 744 }]
assert.deepEqual(findOfficePath({ x: 200, y: 208 }, { x: 600, y: 208 }, gap), [])
const obstacle = [{ x: 300, y: 250, width: 100, height: 160 }]
const from = { x: 200, y: 320 }
const to = { x: 500, y: 320 }
const pathAround = findOfficePath(from, to, obstacle)
assert.ok(pathAround.length > 1)
let previous = from
for (const point of pathAround) {
  assert.ok(hasOfficeLineOfSight(previous, point, obstacle))
  previous = point
}
assert.deepEqual(pathAround.at(-1), to)
assert.deepEqual(routeFor(actor('inside', 0, 'pantry'), 0, { x: 140, y: 200 }), [{ x: 220, y: 175 }])
assert.ok(!routeFor(actor('arriving', 0, 'arriving'), 0, { x: 400, y: 500 }).some((p) => p === WAYPOINTS.elevatorInside))
console.log('PASS body clearance, unreachable goals, safe smoothing, and room/arrival routes')

const profiles = [
  { profileId: 'lead', rank: 'teamLead', slotIndex: 0 },
  { profileId: 'child', rank: 'subAgent', slotIndex: 1 }
]
assert.deepEqual(resolveOfficePresence(profiles, [], {}, false, new Set()), { lead: 'deskIdle', child: 'offDuty' })
const instance = { profileId: 'lead', ptyId: 'pty' }
assert.equal(resolveOfficePresence(profiles, [instance], { pty: { state: 'completed' } }, false, new Set()).lead, 'deskIdle')
assert.equal(resolveOfficePresence(profiles, [instance], { pty: { state: 'working' } }, false, new Set()).lead, 'working')
assert.equal(resolveOfficePresence(profiles, [instance], { pty: { state: 'waiting' } }, true, new Set()).lead, 'requestingHelp')
assert.equal(resolveOfficePresence(profiles, [], {}, true, new Set()).lead, 'meeting')
assert.equal(resolveOfficePresence(profiles, [], {}, true, new Set(['lead'])).lead, 'offDuty')
const routine = new IdleActivity(() => 0)
assert.equal(routine.update('deskIdle', 0, 'deskIdle', true), 'deskIdle')
assert.equal(routine.update('deskIdle', 59_999, 'deskIdle', true), 'deskIdle')
assert.equal(routine.update('deskIdle', 60_000, 'deskIdle', true), 'pantry')
assert.equal(routine.update('deskIdle', 80_000, null, true), 'pantry', 'rest time starts on arrival, not departure')
assert.equal(routine.update('deskIdle', 81_000, 'pantry', true), 'pantry')
assert.equal(routine.update('deskIdle', 88_999, 'pantry', true), 'pantry')
assert.equal(routine.update('deskIdle', 89_000, 'pantry', true), 'deskIdle')
assert.equal(routine.awayFromDesk, true, 'return trip retains the visitor slot')
assert.equal(routine.update('working', 89_001, null, true), 'working')
assert.equal(routine.awayFromDesk, false)
const machine = new ActorStateMachine('pantry')
machine.arrive(0)
assert.equal(machine.requestPresence('working'), true, 'work interrupts a finite break action')
assert.equal(machine.current.actionLocked, false)
machine.startWalking(0, 0)
assert.equal(machine.current.action, 'idle')
assert.equal(actionForPresence('pantryDoor', 0), 'idle')
console.log('PASS explicit states, infrequent random breaks, arrival-based rest, and command priority')

const stable = createScene()
const lead = actor()
snapshot(stable, [lead])
const view = stable.actors.get('test')
const route = view.route
advance(stable, 0.5)
snapshot(stable, [lead])
assert.equal(view.route, route, 'unchanged snapshots must preserve route identity and progress')
advance(stable, 35)
assert.equal(view.settled, true, 'default office route reaches the real seat')
assert.equal(view.blocked, false)
assert.equal(view.sprite.anims.isPlaying, false)
const parked = [view.container.x, view.container.y, view.container.depth, view.sprite.y, view.sprite.playCount, stable.mockTweens.length]
advance(stable, 10)
assert.deepEqual([view.container.x, view.container.y, view.container.depth, view.sprite.y, view.sprite.playCount, stable.mockTweens.length], parked)
console.log('PASS uninterrupted routes, exact arrival, static idle pose, and stable seated depth')

const blocked = createScene()
blocked.collisionRects = () => [{ x: 600, y: 0, width: 16, height: 960 }]
snapshot(blocked, [actor('blocked')])
const trapped = blocked.actors.get('blocked')
assert.equal(trapped.blocked, true)
const trappedPosition = [trapped.container.x, trapped.container.y]
advance(blocked, 10)
assert.deepEqual([trapped.container.x, trapped.container.y], trappedPosition)
assert.equal(trapped.sprite.anims.isPlaying, false)
console.log('PASS blocked characters wait without walking or repeated route replacement')

const traffic = createScene()
traffic.collisionRects = () => [
  { x: 300, y: 0, width: 16, height: 380 }, { x: 300, y: 420, width: 16, height: 540 }
]
traffic.actorDestination = (candidate) => ({
  point: candidate.profileId === 'parked' ? { x: 316, y: 400 } : { x: 420, y: 400 }, seated: false
})
traffic.worldSave.actors = [
  { profileId: 'traveler', x: 200, y: 400 }, { profileId: 'parked', x: 316, y: 400 }
]
snapshot(traffic, [actor('traveler'), actor('parked', 1)])
advance(traffic, 4)
const traveler = traffic.actors.get('traveler')
const parkedActor = traffic.actors.get('parked')
assert.equal(traveler.blocked, true)
assert.equal(traveler.sprite.anims.isPlaying, false, 'blocked traffic stops the walking animation')
assert.deepEqual([parkedActor.container.x, parkedActor.container.y], [316, 400], 'traffic cannot push a stationary actor around')
snapshot(traffic, [actor('traveler'), actor('parked', 1, 'offDuty')])
advance(traffic, 5)
assert.equal(traveler.settled, true, 'a cleared passage resumes movement without a new command')
assert.equal(parkedActor.container.destroyed, true)
console.log('PASS traffic waiting, stationary actors, off-duty cleanup, and clear-passage retry')

const editing = createScene()
snapshot(editing, [lead])
advance(editing, 1)
const edited = editing.actors.get('test')
editing.setLayoutEditing(true)
const frozen = [edited.container.x, edited.container.y, editing.simulationTimeMs]
snapshot(editing, [{ ...lead, presence: 'working' }])
advance(editing, 5)
assert.deepEqual([edited.container.x, edited.container.y, editing.simulationTimeMs], frozen)
editing.setLayoutEditing(false)
advance(editing, 30)
assert.equal(edited.actor.presence, 'working')
assert.equal(edited.settled, true)
assert.equal(edited.sprite.anims.isPlaying, false)
const chair = editing.furniture.get('chair-0-0').image
chair.setPosition(chair.x + 64, chair.y + 96)
editing.saveFurnitureLayout()
snapshot(editing, [{ ...lead, presence: 'working' }])
advance(editing, 15)
assert.equal(edited.settled, true)
assert.deepEqual([edited.container.x, edited.container.y], [chair.x, chair.y])
console.log('PASS edit pause, pending commands, changed chair goals, and work standing still')

const crowd = createScene()
const employees = [actor('claude', 0), actor('codex', 1), actor('antigravity', 2), actor('assistant', 2, 'deskIdle', 1)]
snapshot(crowd, employees)
for (const member of crowd.actors.values()) member.idleActivity = new IdleActivity(() => 0)
advance(crowd, 45)
for (const member of crowd.actors.values()) assert.equal(member.settled, true, member.actor.profileId + ' must reach its desk')
let visited = false
let returned = false
advance(crowd, 120, () => {
  const active = [...crowd.actors.values()].filter((member) => member.idleActivity.awayFromDesk)
  assert.ok(active.length <= 1, 'occasional visits must not send the whole office to the pantry')
  if (active.some((member) => member.actor.presence === 'pantry' && member.settled)) visited = true
  if (visited && [...crowd.actors.values()].some((member) => member.idleActivity.awayFromDesk && member.actor.presence === 'deskIdle')) returned = true
})
assert.equal(visited, true, 'a character reaches the pantry')
assert.equal(returned, true, 'the visit has a return route')
snapshot(crowd, employees.map((employee) => ({ ...employee, presence: 'meeting' })))
advance(crowd, 45)
for (const member of crowd.actors.values()) {
  assert.equal(member.actor.presence, 'meeting')
  assert.equal(member.settled, true, member.actor.profileId + ' must settle for the requested meeting')
  assert.equal(member.sprite.anims.isPlaying, false)
}
console.log('PASS four-person arrivals, occasional pantry visits/returns, and an explicit meeting')
