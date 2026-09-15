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
      "export * from './src/renderer/src/game/worldPersistence'",
      "export * from './src/renderer/src/game/characterGait'",
      "export * from './src/renderer/src/lib/officePresence'"
    ].join('\n'), resolveDir: process.cwd(), loader: 'ts'
  },
  outfile: outputFile, bundle: true, platform: 'node', format: 'cjs',
  alias: { phaser: path.join(__dirname, 'fixtures', 'phaser-scene.cjs') },
  loader: { '.png': 'empty' }, define: { 'import.meta.glob': 'emptyAssetGlob' },
  banner: { js: 'function emptyAssetGlob() { return {} }' }, logLevel: 'silent'
})
const {
  OfficeScene, IdleActivity, ActorStateMachine, CharacterGait, actionForPresence, resolveOfficePresence,
  findOfficePath, hasOfficeLineOfSight, isOfficePositionWalkable, routeFor, WAYPOINTS,
  DEFAULT_LAYOUT_SEED, actorCollisionRect, OFFICE_WALL_COLLISIONS,
  OFFICE_REPRESENTATIVE_SAVE_KEY, parseRepresentativePosition
} = require(outputFile)

const storage = new Map()
global.localStorage = {
  setItem: (key, value) => storage.set(key, value), getItem: (key) => storage.get(key) ?? null,
  removeItem: (key) => storage.delete(key)
}

function objectDouble(x = 0, y = 0) {
  const data = new Map()
  const object = {
    x, y, depth: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5, visible: true, playCount: 0,
    texture: { setFilter() {} }, events: new Map(),
    anims: {
      isPlaying: false, paused: false,
      pause() { this.paused = true }, resume() { this.paused = false }
    },
    setPosition(x, y) { this.x = x; this.y = y; return this },
    setY(y) { this.y = y; return this },
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this },
    setOrigin(x, y = x) { this.originX = x; this.originY = y; return this },
    setDepth(depth) { this.depth = depth; return this },
    setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this },
    setSize(width, height) { return this.setDisplaySize(width, height) },
    setVisible(visible) { this.visible = visible; return this },
    setText(text) { this.text = text; return this },
    setFrame(frame) { this.frame = frame; return this },
    setTexture(key, frame) { this.textureKey = key; this.frame = frame; return this },
    setCrop(x, y, width, height) { this.crop = x === undefined ? null : { x, y, width, height }; return this },
    on(event, handler) { this.events.set(event, handler); return this },
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
  for (const name of ['setPadding', 'setTint', 'setStrokeStyle', 'setFillStyle', 'setInteractive', 'setAlpha']) {
    object[name] = function () { return this }
  }
  return object
}

function createScene(saved = DEFAULT_LAYOUT_SEED) {
  const scene = new OfficeScene()
  scene.add = { sprite: objectDouble, image: objectDouble, circle: objectDouble, rectangle: objectDouble, text: objectDouble, container: objectDouble }
  scene.input = { events: new Map(), setDraggable() {}, on(event, handler) { this.events.set(event, handler) } }
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
  scene.layoutSave = JSON.parse(JSON.stringify(saved))
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

// Exercise real actor updates: finishing an edit can reuse the existing route,
// while a fresh scene must compose its actor after physically reaching the seat.
for (const frontId of ['chair-0-0', 'desk-0-0']) {
  stable.setLayoutEditing(true)
  stable.selectFurniture(frontId)
  const depths = [...stable.furniture.values()].map(({ id, image }) => [id, image.depth])
  const saved = JSON.parse(storage.get('pixel-office-layout-v1'))
  const beforeFinish = [view.route, view.container.x, view.container.y, view.sprite.playCount]
  stable.setLayoutEditing(false)
  assert.deepEqual([view.route, view.container.x, view.container.y, view.sprite.playCount], beforeFinish,
    'a layer-only edit must not restart movement or animation')
  const restored = createScene(saved)
  snapshot(restored, [lead])
  advance(restored, 35)
  for (const candidate of [stable, restored]) {
    const seated = candidate.actors.get(lead.profileId)
    assert.equal(seated.settled, true)
    snapshot(candidate, [{ ...lead, presence: 'working' }])
    advance(candidate, 1)
    assert.deepEqual([...candidate.furniture.values()].map(({ id, image }) => [id, image.depth]), depths,
      'finish, reload, arrival, and starting work preserve the exact furniture depths')
    const deskDepth = candidate.furniture.get('desk-0-0').image.depth
    const chairDepth = candidate.furniture.get('chair-0-0').image.depth
    assert.ok(seated.container.depth < chairDepth, 'the lower body stays behind the backrest after reordering')
    const headDepth = seated.seatedForeground.visible ? seated.seatedForeground.depth : seated.container.depth
    assert.ok(headDepth > deskDepth, 'the seated head remains visible above the monitor after reordering')
  }
}
console.log('PASS selected layers after edit completion, reload, real seat arrival, and starting work')

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
assert.equal(parkedActor.overlay.destroyed, true, 'leaving employees also remove names and status overlays')
assert.equal(parkedActor.seatedForeground.destroyed, true, 'leaving employees cannot leave a floating head')
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

function representativeScene(position) {
  storage.delete(OFFICE_REPRESENTATIVE_SAVE_KEY)
  if (position) storage.set(OFFICE_REPRESENTATIVE_SAVE_KEY, JSON.stringify(position))
  const scene = createScene()
  scene.createRepresentativeActor()
  return scene
}
function floorClick(scene, point, { button = 'left', over = [], event = {} } = {}) {
  scene.input.events.get('pointerdown')({ worldX: point.x, worldY: point.y, event,
    leftButtonDown: () => button === 'left' }, over)
}
const position = (sprite) => ({ x: sprite.x, y: sprite.y })
const player = representativeScene()
const ceo = player.representativeSprite
assert.ok(isOfficePositionWalkable(ceo, player.collisionRects()), 'the representative starts on free floor, outside its desk')
assert.equal(ceo.originY, 1, 'clicks and collisions use the feet')
const initialPosition = position(ceo)
const officeGoal = { x: 480, y: 600 }
floorClick(player, officeGoal)
assert.deepEqual(position(ceo), initialPosition, 'a click plans a route without teleporting')
assert.ok(player.representativeRoute.length > 1, 'leaving the room requires a route through its doorway')
let lastPosition = position(ceo)
advance(player, 12, () => {
  assert.ok(isOfficePositionWalkable(ceo, player.collisionRects()), 'every step avoids walls and furniture')
  assert.ok(Math.hypot(ceo.x - lastPosition.x, ceo.y - lastPosition.y) <= 2.01, 'movement remains speed limited')
  assert.ok(player.representativeLabel.y < ceo.y - ceo.displayHeight, 'the nameplate follows above the head')
  lastPosition = position(ceo)
})
assert.deepEqual(position(ceo), officeGoal)
assert.equal(ceo.anims.isPlaying, false)
assert.equal(player.representativeDestination.visible, false)
assert.ok(ceo.depth > player.maxFurnitureDepth())
const restoredPlayer = createScene()
restoredPlayer.createRepresentativeActor()
assert.deepEqual(position(restoredPlayer.representativeSprite), officeGoal, 'arrival survives a scene reload')
assert.equal(parseRepresentativePosition('{bad'), null)
assert.equal(parseRepresentativePosition('{"x":"bad","y":12}'), null)
console.log('PASS representative floor click, doorway routing, body collisions, arrival, nameplate, and saved position')

const controls = representativeScene({ x: 480, y: 600 })
const controlled = controls.representativeSprite
floorClick(controls, { x: 400, y: 600 })
advance(controls, 0.1)
assert.match(controlled.frame, /^ceo-walk-left-/)
assert.equal(controlled.flipX, false)
floorClick(controls, { x: 640, y: 600 })
advance(controls, 0.1)
assert.match(controlled.frame, /^ceo-walk-left-/)
assert.equal(controlled.flipX, true, 'rightward motion mirrors the left-facing walk')
const destination = { ...controls.representativeGoal }
for (const options of [{ button: 'right' }, { over: [{}] }, { event: { shiftKey: true } }]) {
  floorClick(controls, { x: 600, y: 560 }, options)
  assert.deepEqual(controls.representativeGoal, destination, 'selection and modified clicks do not move the representative')
}
floorClick(controls, { x: 4, y: 4 })
assert.deepEqual(controls.representativeGoal, destination, 'a wall click leaves the valid destination unchanged')
controls.setLayoutEditing(true)
const pausedPosition = position(controlled)
const pausedPose = controlled.frame
floorClick(controls, { x: 600, y: 560 })
advance(controls, 2)
assert.deepEqual(position(controlled), pausedPosition)
assert.equal(controlled.frame, pausedPose, 'editing freezes the exact step pose')
assert.deepEqual(controls.representativeGoal, destination)
assert.equal(controlled.anims.paused, true)
controls.setLayoutEditing(false)
advance(controls, 3)
assert.deepEqual(position(controlled), destination, 'finishing editing resumes the pending destination')
floorClick(controls, { x: 640, y: 560 })
advance(controls, 0.1)
assert.match(controlled.frame, /^ceo-walk-up-/)
floorClick(controls, { x: 640, y: 600 })
advance(controls, 0.05)
assert.match(controlled.frame, /^ceo-walk-down-/)
advance(controls, 0.1)
assert.equal(controlled.frame, 'ceo-idle-0', 'arrival switches from walking to a standing pose')
controls.stopRepresentativeMovement()
controls.collisionRects = () => [{ x: 500, y: 0, width: 16, height: 960 }]
assert.equal(controls.moveRepresentativeTo({ x: 400, y: 600 }), false, 'disconnected destinations are rejected')
console.log('PASS representative retargeting, four directions, ignored clicks, editor pause/resume, and unreachable goals')

const playerTraffic = representativeScene({ x: 200, y: 400 })
playerTraffic.collisionRects = () => [
  { x: 300, y: 0, width: 16, height: 380 }, { x: 300, y: 420, width: 16, height: 540 }
]
playerTraffic.actorDestination = () => ({ point: { x: 316, y: 400 }, seated: false })
playerTraffic.worldSave.actors = [{ profileId: 'blocker', x: 316, y: 400 }]
snapshot(playerTraffic, [actor('blocker')])
floorClick(playerTraffic, { x: 420, y: 400 })
const walkingPlayer = playerTraffic.representativeSprite
advance(playerTraffic, 4, () => {
  assert.ok(isOfficePositionWalkable(walkingPlayer, [actorCollisionRect({ x: 316, y: 400 })]), 'the representative cannot cross a stationary employee')
})
assert.equal(walkingPlayer.anims.isPlaying, false, 'a blocked representative does not walk in place')
assert.deepEqual(playerTraffic.representativeGoal, { x: 420, y: 400 })
snapshot(playerTraffic, [actor('blocker', 0, 'offDuty')])
advance(playerTraffic, 5)
assert.deepEqual(position(walkingPlayer), { x: 420, y: 400 }, 'movement resumes when the employee clears the passage')
console.log('PASS representative waits for employees and resumes after the passage clears')

function seatingScene(rotation = 0, frame = 12) {
  storage.delete(OFFICE_REPRESENTATIVE_SAVE_KEY)
  storage.set(OFFICE_REPRESENTATIVE_SAVE_KEY, JSON.stringify({ x: 480, y: 600 }))
  const scene = createScene({
    'chair-0-0': { x: 400, y: 480, rotation, frame, zOrder: 1 },
    'custom-chair': { x: 560, y: 480, frame: 12, zOrder: 2 }
  })
  scene.createRepresentativeActor()
  return scene
}
function chairClick(scene, id, { button = 'left', event = {} } = {}) {
  const chair = scene.furniture.get(id).image
  chair.events.get('pointerdown')({ event, leftButtonDown: () => button === 'left', rightButtonDown: () => button === 'right' })
  floorClick(scene, position(chair), { button, event, over: [chair] })
}
for (const [rotation, direction] of [[0, 'front'], [90, 'right'], [180, 'back'], [270, 'left']]) {
  const sitting = seatingScene(rotation, 12 + (rotation / 90) % 3)
  const sprite = sitting.representativeSprite
  const before = position(sprite)
  const depths = [...sitting.furniture.values()].map(({ image }) => image.depth)
  chairClick(sitting, 'chair-0-0')
  assert.deepEqual(position(sprite), before, 'clicking a distant chair must first walk there')
  assert.equal(sitting.representativeChairTarget, 'chair-0-0')
  advance(sitting, 4, () => {
    if (!sitting.representativeSeat) assert.ok(isOfficePositionWalkable(sprite, sitting.collisionRects()))
  })
  assert.equal(sitting.representativeSeat?.chairId, 'chair-0-0')
  assert.equal(sprite.frame, `ceo-sit-${direction}`)
  assert.equal(sprite.textureKey, 'ceo-seated-sheet-frames')
  assert.equal(sprite.anims.isPlaying, false)
  assert.equal(sitting.representativeGoal, null)
  assert.equal(sitting.representativeDestination.visible, false)
  assert.deepEqual([...sitting.furniture.values()].map(({ image }) => image.depth), depths, 'sitting never reorders furniture')
  const seatedPosition = position(sprite)
  chairClick(sitting, 'chair-0-0')
  floorClick(sitting, { x: 4, y: 4 })
  advance(sitting, 0.2)
  assert.deepEqual(position(sprite), seatedPosition, 'reclicking the same seat or a wall does not stand up')
  const saved = parseRepresentativePosition(storage.get(OFFICE_REPRESENTATIVE_SAVE_KEY))
  assert.ok(isOfficePositionWalkable(saved, sitting.collisionRects()), 'reload position is free floor beside the chair')
  floorClick(sitting, { x: 480, y: 600 })
  assert.equal(sitting.representativeSeat, null)
  assert.equal(sprite.textureKey, 'ceo-animation-sheet-frames')
  advance(sitting, 4)
  assert.deepEqual(position(sprite), before, 'floor click stands up and finishes the requested walk')
}
console.log('PASS chair clicks, real approach, all chair rotations/types, static seated poses, standing, and safe reload position')

// Reproduce the reported composition: an edited desk in front of a back-facing
// chair used to hide the seated CEO's head behind its monitor.
for (const rotation of [0, 90, 180, 270]) {
  const composition = seatingScene(rotation)
  composition.addFurniture('desk-0-0', 10, 400, 432, 144, 72)
  composition.setLayoutEditing(true)
  composition.selectFurniture('desk-0-0')
  const layout = JSON.parse(storage.get('pixel-office-layout-v1'))
  composition.setLayoutEditing(false)
  for (const candidate of [composition, createScene(layout)]) {
    if (!candidate.representativeSprite) candidate.createRepresentativeActor()
    const depths = [...candidate.furniture.values()].map(({ id, image }) => [id, image.depth])
    assert.equal(candidate.sitRepresentativeOn('chair-0-0'), true)
    advance(candidate, 10)
    const body = candidate.representativeSprite
    const head = candidate.representativeSeatedForeground
    const chair = candidate.furniture.get('chair-0-0').image
    const desk = candidate.furniture.get('desk-0-0').image
    assert.equal(head.visible, true, 'the seated head needs a visible pass above the foreground desk')
    assert.ok(head.depth > desk.depth, 'the monitor cannot cover the head')
    assert.equal(body.depth < chair.depth, rotation === 180, 'backrest still covers the lower body in the back pose')
    assert.deepEqual(position(head), position(body), 'the two parts retain identical placement')
    assert.equal(head.frame, body.frame, 'the parts show the same facing')
    assert.equal(head.crop.y, 0)
    assert.equal(head.crop.height, body.crop.y, 'crop regions meet without a missing or doubled strip')
    assert.equal(head.crop.height + body.crop.height, 360, 'all source pixels remain represented')
    assert.ok(Math.abs((body.y - body.displayHeight + head.crop.height / 3) -
      (chair.y - chair.displayHeight / 2)) < 0.5, 'the head pass ends above the backrest')
    assert.deepEqual([...candidate.furniture.values()].map(({ id, image }) => [id, image.depth]), depths)
    assert.ok(candidate.representativeLabel.depth > head.depth)
    assert.equal(candidate.moveRepresentativeTo({ x: 480, y: 600 }), true)
    assert.equal(head.visible, false, 'standing removes the seated foreground pass')
    assert.equal(body.crop, null, 'walking renders the entire character again')
    advance(candidate, 5)
  }
}
console.log('PASS seated head visibility above edited desks, backrest occlusion, all facings, reload, and uncropped walking')

const seats = seatingScene()
for (const options of [{ button: 'right' }, { event: { shiftKey: true } }, { event: { ctrlKey: true } }]) {
  chairClick(seats, 'chair-0-0', options)
  assert.equal(seats.representativeChairTarget, null)
}
chairClick(seats, 'chair-0-0')
advance(seats, 0.2)
chairClick(seats, 'custom-chair')
advance(seats, 4)
assert.equal(seats.representativeSeat?.chairId, 'custom-chair', 'latest chair click replaces a pending destination')
chairClick(seats, 'chair-0-0')
advance(seats, 4)
assert.equal(seats.representativeSeat?.chairId, 'chair-0-0', 'a seated player can switch chairs')
seats.setLayoutEditing(true)
assert.equal(seats.representativeSeat, null, 'entering the editor stands up before moving furniture')
chairClick(seats, 'custom-chair')
assert.equal(seats.representativeChairTarget, null, 'editing selects a chair instead of sitting')
seats.setLayoutEditing(false)
chairClick(seats, 'custom-chair')
seats.setLayoutEditing(true)
seats.furniture.get('custom-chair').image.setPosition(560, 560)
seats.refreshNavigationLayout()
seats.setLayoutEditing(false)
advance(seats, 4)
assert.equal(seats.representativeSeat?.chairId, 'custom-chair')
assert.equal(seats.representativeSprite.y, 582, 'pending seating follows the edited chair position')
seats.setLayoutEditing(true)
seats.setLayoutEditing(false)
chairClick(seats, 'chair-0-0')
seats.furniture.delete('chair-0-0')
seats.refreshNavigationLayout()
advance(seats, 4)
assert.equal(seats.representativeSeat, null)
assert.equal(seats.representativeChairTarget, null, 'deleting the destination safely cancels seating')
console.log('PASS modified clicks, switching seats, edit selection, moved chairs, and deleted destinations')

const occupiedSeat = seatingScene()
snapshot(occupiedSeat, [actor('owner')])
assert.equal(occupiedSeat.sitRepresentativeOn('chair-0-0'), false, 'a worker walking to a chair reserves it')
advance(occupiedSeat, 15)
assert.equal(occupiedSeat.sitRepresentativeOn('chair-0-0'), false, 'an occupied chair rejects seating')
snapshot(occupiedSeat, [actor('owner', 0, 'offDuty')])
assert.equal(occupiedSeat.sitRepresentativeOn('chair-0-0'), true)
advance(occupiedSeat, 4)
snapshot(occupiedSeat, [actor('returning-owner')])
advance(occupiedSeat, 15)
const returningOwner = occupiedSeat.actors.get('returning-owner')
assert.equal(returningOwner.blocked, true, 'a returning worker waits while the representative owns the seat')
assert.notDeepEqual(position(returningOwner.container), { x: 400, y: 480 })
floorClick(occupiedSeat, { x: 480, y: 600 })
advance(occupiedSeat, 12)
assert.equal(returningOwner.settled, true, 'a worker can sit after the representative leaves')
assert.deepEqual(position(returningOwner.container), { x: 400, y: 480 })

const inaccessible = seatingScene()
// Enclose the chair with other furniture; the final seat step cannot ignore it.
for (const [id, x, y] of [['north', 400, 416], ['south', 400, 544], ['west', 336, 480], ['east', 464, 480]]) {
  inaccessible.addFurniture(id, 12, x, y, 64, 64)
}
assert.equal(inaccessible.sitRepresentativeOn('chair-0-0'), false, 'a chair enclosed by furniture is unreachable')
assert.equal(inaccessible.representativeChairTarget, null)
console.log('PASS occupied/reserved seats, returning employee waiting and resuming, and inaccessible chairs')

for (const [id, saved] of Object.entries(DEFAULT_LAYOUT_SEED).filter(([, saved]) =>
  saved.frame === 12 && saved.y < 336)) {
  const meetingSeat = representativeScene({ x: 480, y: 600 })
  assert.equal(meetingSeat.sitRepresentativeOn(id), true, `default meeting chair ${id} must be reachable under its table`)
  advance(meetingSeat, 15)
  assert.equal(meetingSeat.representativeSeat?.chairId, id)
  assert.deepEqual(position(meetingSeat.representativeSprite), { x: saved.x, y: saved.y + 22 })
  meetingSeat.representativeLabel.setDisplaySize(110, 24)
  meetingSeat.updateRepresentativeLabelPosition()
  assert.ok(meetingSeat.representativeLabel.y >= 32, 'the name remains inside the canvas for the northern seats')
  if (saved.y === 112) assert.ok(Math.abs(meetingSeat.representativeLabel.x - saved.x) > 104,
    'the name beside a northern seat must clear the head')
  assert.equal(meetingSeat.moveRepresentativeTo({ x: 480, y: 600 }), true)
  advance(meetingSeat, 15)
  assert.deepEqual(position(meetingSeat.representativeSprite), { x: 480, y: 600 })
}
console.log('PASS all five real meeting chairs: approach beneath overlapping tables and leave through the doorway')

const gait = new CharacterGait('ceo')
assert.equal(gait.advance(-1, 0).frame, 'ceo-walk-left-0')
const stridePoses = Array.from({ length: 4 }, () => gait.advance(-16, 0).frame)
assert.equal(new Set(stridePoses).size, 4, 'one stride uses four alternating poses without repeated holds')
for (let index = 0; index < 40; index += 1) {
  const pose = gait.advance(-2, 2 + (index % 2 ? 1e-10 : -1e-10))
  assert.match(pose.frame, /^ceo-walk-left-/, 'a diagonal cannot flicker between facing rows')
}
assert.match(gait.advance(0, -3).frame, /^ceo-walk-up-/, 'a clear turn changes facing')
const settledPose = gait.stop()
assert.match(settledPose.frame, /^ceo-walk-up-/, 'stopping retains the last facing instead of snapping to the camera')
assert.deepEqual(gait.advance(0, 0), settledPose, 'standing still never cycles walking poses')
const posesByFrameRate = [30, 60, 144].map((fps) => {
  const gait = new CharacterGait('ceo')
  let pose
  for (let frame = 0; frame < fps; frame += 1) pose = gait.advance(96 / fps, 0)
  return pose
})
assert.deepEqual(posesByFrameRate[0], posesByFrameRate[1])
assert.deepEqual(posesByFrameRate[1], posesByFrameRate[2], 'equal travel distances produce the same step at different frame rates')
console.log('PASS distance-driven strides, diagonal facing stability, and stopped orientation')

// Every employee skin uses the same distance-driven four-phase gait as the
// representative, including side views, waiting, and resuming after editing.
for (let team = 0; team < 3; team += 1) {
  for (let slot = 0; slot < 5; slot += 1) {
    const walking = createScene()
    walking.collisionRects = () => []
    walking.actorDestination = () => ({ point: { x: 500, y: 700 }, seated: false })
    const employee = actor(`walk-${team}-${slot}`, team, 'deskIdle', slot)
    walking.worldSave.actors = [{ profileId: employee.profileId, x: 500, y: 400 }]
    snapshot(walking, [employee])
    const view = walking.actors.get(employee.profileId)
    const variant = team === 0 && slot === 0 ? 4 : slot
    const prefix = `actor-${team}-${variant}`
    const poses = new Set()
    for (let step = 0; step < 4; step += 1) {
      advance(walking, 16 / 120)
      poses.add(view.sprite.frame)
      assert.match(view.sprite.frame, new RegExp(`^${prefix}-walk-down-[0-3]$`))
      assert.equal(view.sprite.flipX, false, 'front arms alternate without mirroring the head')
    }
    assert.equal(poses.size, 4, 'employees need both opposite contact poses and passing poses')
    walking.setLayoutEditing(true)
    const paused = { point: position(view.container), frame: view.sprite.frame }
    advance(walking, 0.2)
    assert.deepEqual({ point: position(view.container), frame: view.sprite.frame }, paused)
    walking.setLayoutEditing(false)
    advance(walking, 0.1)
    assert.notDeepEqual(position(view.container), paused.point)
    view.route = [{ x: view.container.x - 200, y: view.container.y }]
    view.routeIndex = 0
    advance(walking, 0.1)
    assert.match(view.sprite.frame, new RegExp(`^${prefix}-walk-left-[0-3]$`))
    assert.equal(view.sprite.flipX, false)
    view.route = [{ x: view.container.x + 200, y: view.container.y }]
    advance(walking, 0.1)
    assert.equal(view.sprite.flipX, true, 'rightward motion mirrors only the side-facing sheet')
    view.route = [{ x: view.container.x, y: view.container.y - 200 }]
    advance(walking, 0.1)
    assert.match(view.sprite.frame, new RegExp(`^${prefix}-walk-up-[0-3]$`))
    walking.blockActor(view, true)
    const stopped = view.sprite.frame
    advance(walking, 0.2)
    assert.equal(view.sprite.frame, stopped, 'waiting never cycles walking poses')
  }
}
console.log('PASS all 15 employee slots: four-phase walks, four directions, editor pause/resume, and blocked idle')

for (let team = 0; team < 3; team++) {
  for (let slot = 0; slot < 5; slot++) {
    const chairId = `chair-${team}-${slot}`
    const deskId = `desk-${team}-${slot}`
    const seated = createScene({
      [chairId]: { frame: 12, x: 400, y: 480, rotation: 180, zOrder: 1 },
      [deskId]: { frame: 10, x: 400, y: 432, zOrder: 2 }
    })
    const employee = actor(`sitter-${team}-${slot}`, team, 'deskIdle', slot)
    seated.worldSave.actors = [{ profileId: employee.profileId, x: 480, y: 600 }]
    snapshot(seated, [employee])
    const view = seated.actors.get(employee.profileId)
    advance(seated, 8)
    assert.equal(view.settled, true)
    assert.equal(view.sprite.textureKey, `staff-seated-${team}-frames`)
    const prefix = `actor-${team}-${team === 0 && slot === 0 ? 4 : slot}-sit-`
    const approach = { ...view.approachPoint }
    const depths = [...seated.furniture.values()].map(({ image }) => image.depth)
    for (const presence of ['working', 'requestingHelp', 'error', 'deskIdle']) {
      snapshot(seated, [{ ...employee, presence }])
      assert.equal(view.sprite.frame, prefix + 'back')
      assert.deepEqual(position(view.container), { x: 400, y: 480 }, 'work/help/error remain in the same seat')
      assert.deepEqual(view.approachPoint, approach, 'presence updates preserve the safe exit tile')
      assert.equal(view.seatedForeground.visible, true)
      assert.ok(view.seatedForeground.depth > seated.furniture.get(deskId).image.depth)
      assert.ok(view.overlay.depth > view.seatedForeground.depth)
    }
    for (const [rotation, direction] of [[0, 'front'], [90, 'left'], [180, 'back'], [270, 'left']]) {
      seated.setLayoutEditing(true)
      seated.furniture.get(chairId).image.setData('furnitureRotation', rotation)
      seated.refreshNavigationLayout()
      seated.setLayoutEditing(false)
      assert.equal(view.sprite.frame, prefix + direction)
      assert.equal(view.sprite.flipX, rotation === 90)
      assert.equal(view.seatedForeground.frame, view.sprite.frame)
      assert.equal(view.seatedForeground.flipX, view.sprite.flipX)
      assert.equal(view.container.depth < seated.furniture.get(chairId).image.depth, rotation === 180)
    }
    assert.deepEqual([...seated.furniture.values()].map(({ image }) => image.depth), depths)
    let selected = null
    seated.actorSelectHandler = (id) => { selected = id }
    view.seatedForeground.events.get('pointerdown')()
    assert.equal(selected, employee.profileId, 'clicking the visible seated head still selects its agent')
    snapshot(seated, [{ ...employee, presence: 'pantry' }])
    assert.equal(view.seatedForeground.visible, false)
    assert.equal(view.sprite.crop, null)
    assert.match(view.sprite.textureKey, /^staff-walk-/)
    assert.ok(isOfficePositionWalkable(view.container, seated.collisionRects()))
    advance(seated, 0.1)
    assert.deepEqual(position(view.overlay), position(view.container), 'names follow the moving agent')
    snapshot(seated, [{ ...employee, presence: 'offDuty' }])
    assert.equal(view.seatedForeground.destroyed, true)
    assert.equal(view.overlay.destroyed, true)
  }
}
console.log('PASS all 15 employees: actual sitting, four chair directions, work/help/error, safe standing, selection, and cleanup')

const meeting = createScene()
const attendees = Array.from({ length: 5 }, (_, index) => actor(`meeting-${index}`, index % 3, 'meeting', index))
snapshot(meeting, attendees)
advance(meeting, 25)
for (const view of meeting.actors.values()) {
  assert.equal(view.settled, true)
  assert.equal(view.seatedGoal, true, 'every real meeting chair supports the shared seat approach')
  assert.match(view.sprite.frame, /-sit-(front|back|left)$/)
  assert.deepEqual(position(view.container), position(meeting.furniture.get(view.chairId).image))
}
assert.equal(new Set([...meeting.actors.values()].map((view) => view.chairId)).size, 5)
console.log('PASS five simultaneous meeting attendees use distinct real chairs and seated poses')
