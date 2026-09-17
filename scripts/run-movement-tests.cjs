const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { PNG } = require('pngjs')
const { buildSync } = require('esbuild')

const outputFile = path.join(process.cwd(), 'out', 'movement-runner.cjs')
buildSync({
  stdin: {
    contents: [
      "export { OfficeScene } from './src/renderer/src/game/OfficeScene'",
      "export * from './src/renderer/src/game/navigation'",
      "export * from './src/renderer/src/game/officeWorld'",
      "export * from './src/renderer/src/game/officeGrid'",
      "export * from './src/renderer/src/game/furnitureBounds'",
      "export * from './src/renderer/src/game/characterFrames'",
      "export * from './src/renderer/src/game/seatAnchors'",
      "export * from './src/renderer/src/game/representativeWorkAnimation'",
      "export * from './src/renderer/src/game/staffWorkAnimation'",
      "export * from './src/renderer/src/game/layoutPersistence'",
      "export * from './src/renderer/src/game/idleActivity'",
      "export * from './src/renderer/src/game/actorStateMachine'",
      "export * from './src/renderer/src/game/worldPersistence'",
      "export * from './src/renderer/src/game/characterGait'",
      "export * from './src/renderer/src/game/staffWalkSheets'",
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
  OFFICE_REPRESENTATIVE_SAVE_KEY, parseRepresentativePosition, measureFurnitureBounds,
  STAFF_PANTRY_SHEETS, measureWalkSheet, measureSeatedSheet, measureCharacterSheet, measurePantrySheet, seatedFrameAnchor, CHAIR_SEAT_ANCHORS,
  REPRESENTATIVE_WORK_TEXTURE, REPRESENTATIVE_WORK_CYCLE_MS, REPRESENTATIVE_WORK_FRAME_WIDTH,
  REPRESENTATIVE_WORK_FRAME_PADDING, representativeWorkPixels, representativeWorkPoseAt, workHandPixels, measureStaffWorkSheet, staffWorkTexture
} = require(outputFile)
const seatedRenderer = require('./fixtures/seated-renderer.cjs').createSeatedRenderer({ measureSeatedSheet, measureCharacterSheet, seatedFrameAnchor, measureStaffWorkSheet })
const installSeatedRenderer = seatedRenderer.install

const storage = new Map()
global.localStorage = {
  setItem: (key, value) => storage.set(key, value), getItem: (key) => storage.get(key) ?? null,
  removeItem: (key) => storage.delete(key)
}

function objectDouble(x = 0, y = 0, textureKey) {
  const data = new Map()
  const object = {
    x, y, depth: 0, scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5, visible: true, playCount: 0,
    texture: { key: textureKey, setFilter() {} }, events: new Map(),
    anims: {
      isPlaying: false, paused: false,
      pause() { this.paused = true }, resume() { this.paused = false }
    },
    setPosition(x, y) { this.x = x; this.y = y; return this },
    setY(y) { this.y = y; return this },
    setAngle(angle) { this.angle = angle; return this },
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this },
    setOrigin(x, y = x) { this.originX = x; this.originY = y; return this },
    setDepth(depth) { this.depth = depth; return this },
    setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this },
    setSize(width, height) { return this.setDisplaySize(width, height) },
    setVisible(visible) { this.visible = visible; return this },
    setText(text) {
      this.text = text
      const lines = text.split('\n')
      this.displayWidth = Math.max(...lines.map(line => Array.from(line).reduce((width, c) => width + (c.charCodeAt(0) > 255 ? 12 : 7), 0)))
      this.displayHeight = lines.length * 18
      return this
    },
    setFrame(frame) { this.frame = frame; return this },
    setTexture(key, frame) { this.textureKey = key; this.texture.key = key; this.frame = frame; return this },
    setCrop(x, y, width, height) { this.crop = x === undefined ? null : { x, y, width, height }; return this },
    on(event, handler) { this.events.set(event, handler); return this },
    once(event, handler) { this.events.set(event, handler); return this },
    setFlipX(flipX) { this.flipX = flipX; return this },
    setFlipY(flipY) { this.flipY = flipY; return this },
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
    destroy() { this.destroyed = true; this.events.get('destroy')?.() }
  }
  for (const name of ['setPadding', 'setTint', 'setStrokeStyle', 'setFillStyle', 'setInteractive', 'setAlpha']) {
    object[name] = function () { return this }
  }
  return object
}

const furnitureDirectory = path.join(process.cwd(), 'src/renderer/src/assets/pixel-office/furniture')
const furnitureFiles = fs.readdirSync(furnitureDirectory)
const textureBounds = new Map()
function furnitureTextureBounds(image) {
  const key = image.texture.key
  if (!textureBounds.has(key)) {
    const file = key.startsWith('furniture-directional-')
      ? `directional/${key.slice('furniture-directional-'.length)}-v1.png`
      : furnitureFiles.find((file) => file.startsWith(key.slice('furniture-'.length) + '-v'))
    assert.ok(file, `missing furniture fixture: ${key}`)
    const png = key.includes('office-chair') ? seatedRenderer.furniturePixels(image)
      : PNG.sync.read(fs.readFileSync(path.join(furnitureDirectory, file)))
    textureBounds.set(key, measureFurnitureBounds(png.data, png.width, png.height))
  }
  return textureBounds.get(key)
}

function createScene(saved = DEFAULT_LAYOUT_SEED) {
  const scene = new OfficeScene()
  scene.furnitureTextureBounds = furnitureTextureBounds
  installSeatedRenderer(scene)
  scene.add = { sprite: objectDouble, image: objectDouble, circle: objectDouble, rectangle: objectDouble,
    text: (x, y, text) => objectDouble(x, y).setText(text), container: objectDouble }
  scene.input = { events: new Map(), setDraggable() {}, on(event, handler) { this.events.set(event, handler) } }
  scene.sys = { isActive: () => true }
  scene.reportDeskCounts = () => {}
  scene.mockTweens = []
  scene.tweens = {
    add(config) {
      const tween = {
        config, end: scene.simulationTimeMs + (config.delay ?? 0) +
          (config.duration * 2 + (config.hold ?? 0)) * ((config.repeat ?? 0) + 1) +
          (config.repeatDelay ?? 0) * (config.repeat ?? 0),
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
    const headDepth = seated.seatedForeground.visible ? seated.seatedForeground.depth : seated.container.depth
    assert.ok(headDepth > deskDepth, 'the seated head remains visible above the monitor after reordering')
    assertSeatedLayers(candidate, candidate.furniture.get('chair-0-0').image, seated.sprite, headDepth)
  }
}

function assertSeatedLayers(scene, chair, sprite, bodyDepth) {
  if (scene.furnitureRotation(chair) === 180) {
    assert.ok(chair.depth > bodyDepth, 'the original backrest must be in front of the seated person')
  } else {
    assert.ok(bodyDepth > chair.depth)
  }
}

function assertSeatContact(scene, chair, sprite, foot) {
  const direction = ['front', 'right', 'back', 'left'][scene.furnitureRotation(chair) / 90]
  const seat = CHAIR_SEAT_ANCHORS[direction]
  const anchor = scene.seatedFrameAnchor(sprite)
  const actual = {
    x: foot.x + ((sprite.flipX ? 1 - anchor.x / 312 : anchor.x / 312) - 0.5) * sprite.displayWidth,
    y: foot.y - sprite.displayHeight + anchor.y / 360 * sprite.displayHeight
  }
  assert.ok(Math.abs(actual.x - (chair.x + (seat.x - 0.5) * chair.displayWidth)) < 0.01,
    'the pelvis must stay centered on the cushion, including mirrored side views')
  assert.ok(Math.abs(actual.y - (chair.y + (seat.y - 0.5) * chair.displayHeight)) < 0.01,
    'the pelvis must touch the cushion without floating or sinking')
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


assert.equal(STAFF_PANTRY_SHEETS.length, 15)
for (const { id, file } of STAFF_PANTRY_SHEETS) {
  const directory = path.join(process.cwd(), 'src/renderer/src/assets/pixel-office/characters')
  const png = PNG.sync.read(fs.readFileSync(path.join(directory, 'pantry-v1', file)))
  const frames = measurePantrySheet(png.data, png.width, png.height)
  const walk = PNG.sync.read(fs.readFileSync(path.join(directory, 'walk-v6', 'staff-' + id + '-walk-v6.png')))
  const idle = measureWalkSheet(walk.data, walk.width, walk.height)[0]
  assert.equal(frames.length, 12, id + ' has both six-pose actions')
  assert.equal(png.data[3], 0, id + ' has a transparent background')
  const hashes = new Set()
  for (const { source, destination, region } of frames) {
    assert.ok(source.x > region.x && source.y > region.y, id + ' has top/left gutters')
    assert.ok(source.x + source.width < region.x + region.width && source.y + source.height < region.y + region.height,
      id + ' keeps shoes and adjacent rows inside each frame')
    assert.equal(destination.y + destination.height, 354, id + ' has stable feet')
    assert.ok(Math.abs(destination.height - idle.destination.height) < 36, id + ' stays close to walking body height')
    const hash = require('node:crypto').createHash('sha256')
    for (let y = source.y; y < source.y + source.height; y++) {
      hash.update(png.data.subarray((y * png.width + source.x) * 4, (y * png.width + source.x + source.width) * 4))
    }
    hashes.add(hash.digest('hex'))
  }
  assert.equal(hashes.size, 12, id + ' has twelve distinct poses')
  const heights = frames.map(frame => frame.destination.height)
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 16, id + ' does not pulse during consumption')
}
console.log('PASS all fifteen employee pantry sheets: distinct poses, transparent gutters, planted feet and body scale')

for (let team = 0; team < 3; team++) for (let variant = 0; variant < 5; variant++) {
  for (const [index, action, word] of [[0, 'eating', '간식'], [1, 'drinking', '커피']]) {
    const id = team + '-' + variant
    const pantry = createScene()
    // Claude's lead uses skin 0-4. Its navy skin remains available on slot 5.
    const slot = team === 0 && variant === 0 ? 5 : variant
    const resting = actor('pantry-' + id, team, 'pantry', slot)
    resting.rosterIndex = 19 // Deliberately unrelated: select skin from team/slot.
    const prefix = Array.from({ length: index }, (_, i) => actor('absent-' + i, i, 'offDuty'))
    const roster = [...prefix, resting]
    pantry.worldSave.actors = [{ profileId: resting.profileId, x: 224, y: 288 }]
    snapshot(pantry, roster)
    const view = pantry.actors.get(resting.profileId)
    assert.equal(view.pantryAction, undefined, 'walk before consuming')
    assert.equal(view.bubble.text, word + (index ? ' 마시러 가는 중' : ' 먹으러 가는 중'))
    assert.equal(view.speechPanel.visible, true)
    for (let step = 0; step < 200 && !view.pantryAction; step++) advance(pantry, 0.05)
    assert.equal(view.settled, true, id + ' reaches the pantry')
    assert.equal(view.stateMachine.current.action, action)
    assert.equal(view.sprite.texture.key, 'staff-pantry-' + id + '-frames')
    assert.equal(view.sprite.frame, 'actor-' + id + '-' + action + '-0')
    assert.equal(view.sprite.flipX, false)
    assert.equal(view.bubble.text, word + (index ? ' 마시는 중' : ' 먹는 중'))
    const running = view.pantryAction
    const seen = new Set([running.pose])
    advance(pantry, 0.9, () => seen.add(view.pantryAction.pose))
    assert.equal(view.pantryAction, running, 'polling preserves the action object')
    const frozen = { ...running }
    pantry.setLayoutEditing(true)
    advance(pantry, 3)
    assert.deepEqual(view.pantryAction, frozen, 'editor freezes simulation-time playback')
    pantry.setLayoutEditing(false)
    assert.equal(view.pantryAction, running, 'editor resumes the same action')
    const position = { x: view.container.x, y: view.container.y }
    advance(pantry, 6, () => {
      if (view.pantryAction) seen.add(view.pantryAction.pose)
      assert.equal(view.container.x, position.x)
      assert.equal(view.container.y, position.y)
    })
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5])
    assert.equal(view.pantryAction, undefined)
    assert.equal(view.sprite.texture.key, 'staff-walk-' + id + '-frames')
    assert.equal(view.sprite.frame, 'actor-' + id + '-idle-0')
    assert.equal(view.stateMachine.current.actionLocked, false)
    assert.equal(view.bubble.visible, false, 'no completion remark')
    assert.equal(view.speechPanel.visible, false)
    snapshot(pantry, roster)
    assert.equal(view.pantryAction, undefined, 'unchanged presence does not restart a completed action')
    pantry.startActionAnimation(view, resting)
    snapshot(pantry, [...prefix, { ...resting, presence: 'working' }])
    assert.equal(view.pantryAction, undefined, 'work interrupts immediately')
    assert.equal(view.sprite.texture.key, 'staff-walk-' + id + '-frames')
    assert.equal(view.bubble.text, '업무 중')
    snapshot(pantry, [])
    assert.equal(view.container.destroyed, true)
    assert.equal(view.overlay.destroyed, true)
  }
}
console.log('PASS all thirty employee skin/action combinations, approach/active speech, completion, pause/resume and work interruption')

for (const presence of ['meeting', 'error', 'requestingHelp', 'offDuty']) {
  const scene = createScene()
  const resting = actor('interrupt', 0, 'pantry')
  scene.worldSave.actors = [{ profileId: resting.profileId, x: 220, y: 175 }]
  snapshot(scene, [resting])
  const view = scene.actors.get(resting.profileId)
  assert.ok(view.pantryAction)
  assert.equal(view.sprite.texture.key, 'staff-pantry-0-4-frames', 'Claude lead retains her existing skin')
  advance(scene, 0.9)
  snapshot(scene, [{ ...resting, presence }])
  assert.equal(view.pantryAction, undefined, presence + ' interrupts the action')
  advance(scene, 1)
  assert.notEqual(view.sprite.texture.key, 'staff-pantry-0-4-frames', 'no delayed phase overwrites the next state')
  if (presence === 'offDuty') assert.equal(view.overlay.destroyed, true)
}
console.log('PASS meeting/help/error/off-duty priority and Claude lead identity during breaks')

const pantryPixels = PNG.sync.read(fs.readFileSync(path.join(process.cwd(),
  'src/renderer/src/assets/pixel-office/characters/ceo-pantry-actions-v1.png')))
const pantryFrames = measurePantrySheet(pantryPixels.data, pantryPixels.width, pantryPixels.height)
assert.equal(pantryFrames.length, 12)
const poseHashes = new Set()
for (const { source: crop, destination, region } of pantryFrames) {
  assert.ok(crop.x > region.x && crop.y > region.y, 'each pose has a transparent gutter above and to the left')
  assert.ok(crop.x + crop.width < region.x + region.width && crop.y + crop.height < region.y + region.height,
    'neither shoes nor neighboring poses are cut into the frame')
  assert.equal(destination.y + destination.height, 354, 'all twelve poses share the original padded ground line')
  const hash = require('node:crypto').createHash('sha256')
  for (let y = crop.y; y < crop.y + crop.height; y++) {
    hash.update(pantryPixels.data.subarray((y * pantryPixels.width + crop.x) * 4, (y * pantryPixels.width + crop.x + crop.width) * 4))
  }
  poseHashes.add(hash.digest('hex'))
}
assert.equal(poseHashes.size, 12, 'each action phase contains distinct authored pixels')
const pantryScales = pantryFrames.map(frame => frame.destination.height / frame.source.height)
assert.ok(Math.max(...pantryScales) - Math.min(...pantryScales) < 0.007, 'poses use one scale without pulsing between phases')
const pantryHeights = pantryFrames.map(frame => frame.destination.height)
assert.ok(Math.max(...pantryHeights) - Math.min(...pantryHeights) <= 8, 'the planted body stays the same height')
const bubblePixels = PNG.sync.read(fs.readFileSync(path.join(process.cwd(),
  'src/renderer/src/assets/pixel-office/ui/speech-bubble-v1.png')))
assert.equal(bubblePixels.data[3], 0, 'the speech sprite has a transparent background')
const bubbleCenter = (Math.floor(bubblePixels.height * 0.4) * bubblePixels.width + Math.floor(bubblePixels.width / 2)) * 4
assert.ok(bubblePixels.data[bubbleCenter + 3] > 240, 'the text area stays opaque over the scene')
assert.ok(bubblePixels.data[bubbleCenter] > 200 && bubblePixels.data[bubbleCenter + 1] > 200, 'the text area is light ivory')
console.log('PASS twelve distinct pantry poses, transparent gutters, stable scale/feet, and opaque speech interior')

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
assert.ok(ceo.depth > player.furniture.get('desk-0-0').image.depth, 'walking south of a desk renders in front of it')
assert.ok(ceo.depth < player.furniture.get('desk-2-1').image.depth, 'walking north of a desk renders behind it')
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
// Stay below the enlarged chair's edge while testing a straight northward step.
floorClick(controls, { x: 640, y: 580 })
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
function furnitureClick(scene, id, { button = 'left', event = {} } = {}) {
  const image = scene.furniture.get(id).image
  image.events.get('pointerdown')({ event, leftButtonDown: () => button === 'left', rightButtonDown: () => button === 'right' })
  floorClick(scene, position(image), { button, event, over: [image] })
}
const chairClick = furnitureClick

function awaitRepresentativeBreak(scene) {
  const sprite = scene.representativeSprite
  let previous = position(sprite)
  for (let i = 0; i < 900 && !scene.representativePantryAction; i++) {
    advance(scene, 0.05, () => {
      assert.ok(isOfficePositionWalkable(sprite, [...scene.collisionRects(), ...scene.actorObstacles(undefined, false)]),
        'every pantry approach step respects furniture, walls and employees')
      assert.ok(Math.hypot(sprite.x - previous.x, sprite.y - previous.y) <= 2.5,
        `no teleport to the pantry (at most a 2px step plus arrival snap): ${JSON.stringify(previous)} -> ${JSON.stringify(position(sprite))}`)
      previous = position(sprite)
    })
  }
  assert.ok(scene.representativePantryAction, 'a reachable pantry click starts its action after arrival')
}

for (const frame of [0, 1, 2]) {
  const scene = representativeScene({ x: 160, y: 288 })
  const furniture = [...scene.furniture.values()].find(item => item.frame === frame)
  const sprite = scene.representativeSprite
  const initial = position(sprite)
  furniture.image.events.get('pointerover')()
  assert.match(scene.pantryHint.text, frame === 0 ? /커피/ : /간식/)
  furniture.image.events.get('pointerout')()
  assert.equal(scene.pantryHint.visible, false)
  furnitureClick(scene, furniture.id)
  assert.deepEqual(position(sprite), initial)
  assert.equal(scene.representativePantryAction, undefined, 'walk before showing a drink or snack')
  assert.equal(scene.representativePantryTarget, furniture.id)
  assert.equal(scene.representativeLabel.text, '김태호 대표', 'action text never alters the name')
  assert.match(scene.representativeSpeech.text, frame === 0 ? /커피 마시러 가는 중/ : /간식 먹으러 가는 중/)
  assert.equal(scene.representativeSpeechBubble.visible, true)
  awaitRepresentativeBreak(scene)
  assert.equal(scene.representativeGoal, null)
  assert.equal(scene.representativeDestination.visible, false)
  assert.equal(sprite.texture.key, 'ceo-pantry-sheet-frames')
  assert.match(sprite.frame, frame === 0 ? /^ceo-drinking-/ : /^ceo-eating-/)
  assert.match(scene.representativeSpeech.text, frame === 0 ? /커피 마시는 중/ : /간식 먹는 중/)
  const action = scene.representativePantryAction
  furnitureClick(scene, furniture.id)
  assert.equal(scene.representativePantryAction, action, 'repeated clicks do not restart consumption')
  floorClick(scene, { x: 4, y: 4 })
  assert.equal(scene.representativePantryAction, action, 'an invalid floor command preserves the current break')
  const frames = new Set([sprite.frame])
  const feet = position(sprite)
  advance(scene, 4.5, () => {
    if (scene.representativePantryAction) frames.add(sprite.frame)
    assert.deepEqual(position(sprite), feet, 'articulated poses never move the collision body')
  })
  assert.equal(frames.size, 6, 'all six distinct authored poses play, including both sips/bites and recovery')
  assert.equal(scene.representativePantryAction, undefined)
  assert.equal(sprite.texture.key, 'ceo-animation-sheet-frames')
  assert.equal(sprite.frame, 'ceo-idle-0')
  assert.equal(scene.representativePantryTarget, null)
  assert.equal(scene.representativeLabel.text, '김태호 대표')
  assert.equal(scene.representativeSpeechBubble.visible, false, 'completion immediately hides the bubble without a reaction')
  assert.equal(scene.representativeSpeech.visible, false)
  advance(scene, 2)
  assert.equal(scene.representativeSpeechBubble.visible, false)
  assert.equal(scene.representativeSpeech.visible, false)
}
console.log('PASS representative coffee machine, snack cabinet, refrigerator, approach, props, hints, repeat clicks, and completion')

const pantryControls = representativeScene({ x: 160, y: 288 })
const coffee = [...pantryControls.furniture.values()].find(item => item.frame === 0)
const snack = [...pantryControls.furniture.values()].find(item => item.frame === 2)
for (const options of [{ button: 'right' }, ...['shiftKey', 'ctrlKey', 'metaKey', 'altKey'].map(key => ({ event: { [key]: true } }))]) {
  furnitureClick(pantryControls, coffee.id, options)
  assert.equal(pantryControls.representativePantryTarget, null)
}
furnitureClick(pantryControls, coffee.id)
awaitRepresentativeBreak(pantryControls)
const replacedCoffee = pantryControls.representativePantryAction
furnitureClick(pantryControls, snack.id)
assert.notEqual(pantryControls.representativePantryAction, replacedCoffee)
assert.equal(pantryControls.representativePantryTarget, snack.id)
awaitRepresentativeBreak(pantryControls)
floorClick(pantryControls, { x: 160, y: 288 })
assert.equal(pantryControls.representativePantryAction, undefined)
assert.equal(pantryControls.representativeSprite.texture.key, 'ceo-animation-sheet-frames')
assert.equal(pantryControls.representativeSpeechBubble.visible, false)
assert.equal(pantryControls.representativePantryTarget, null)
advance(pantryControls, 3)
furnitureClick(pantryControls, coffee.id)
awaitRepresentativeBreak(pantryControls)
pantryControls.setLayoutEditing(true)
assert.equal(pantryControls.representativePantryAction, undefined)
assert.equal(pantryControls.representativeSpeechBubble.visible, false)
furnitureClick(pantryControls, snack.id)
assert.equal(pantryControls.representativePantryTarget, null, 'editing selects furniture without taking a break')
assert.equal(pantryControls.selectedFurniture.id, snack.id)
pantryControls.setLayoutEditing(false)
advance(pantryControls, 7)
assert.equal(pantryControls.representativePantryAction, undefined, 'editing does not resume a stale pantry action')
assert.equal(pantryControls.representativeSpeechBubble.visible, false, 'no delayed completion reaction survives interruption')
floorClick(pantryControls, { x: 160, y: 288 })
advance(pantryControls, 3)
furnitureClick(pantryControls, coffee.id)
assert.ok(pantryControls.representativeGoal)
pantryControls.setLayoutEditing(true)
assert.equal(pantryControls.representativeGoal, null, 'editing also cancels a pending pantry visit')
console.log('PASS representative pantry command replacement, modifiers, movement interruption, and editing cancellation')

const pantrySeat = seatingScene()
pantrySeat.addFurniture('test-coffee', 0, 600, 640, 64, 64)
furnitureClick(pantrySeat, 'chair-0-0')
advance(pantrySeat, 4)
assert.ok(pantrySeat.representativeSeat)
furnitureClick(pantrySeat, 'test-coffee')
assert.equal(pantrySeat.representativeSeat, null, 'a pantry click safely stands up from a chair')
awaitRepresentativeBreak(pantrySeat)
furnitureClick(pantrySeat, 'chair-0-0')
assert.equal(pantrySeat.representativePantryAction, undefined)
assert.equal(pantrySeat.representativeSpeechBubble.visible, false)
advance(pantrySeat, 8)
assert.equal(pantrySeat.representativeSeat?.chairId, 'chair-0-0')
console.log('PASS representative seated departure to pantry and chair interruption of consumption')

const livePantry = representativeScene({ x: 480, y: 600 })
const liveCoffee = [...livePantry.furniture.values()].find(item => item.frame === 0)
furnitureClick(livePantry, liveCoffee.id)
liveCoffee.image.setPosition(640, 640)
livePantry.refreshNavigationLayout()
awaitRepresentativeBreak(livePantry)
assert.ok(livePantry.representativeSprite.y > 600, 'the route follows the relocated coffee machine')
livePantry.furniture.delete(liveCoffee.id)
advance(livePantry, 0.05)
assert.equal(livePantry.representativePantryAction, undefined, 'removing an active target cancels consumption')
assert.equal(livePantry.representativeSpeechBubble.visible, false)
const liveSnack = [...livePantry.furniture.values()].find(item => item.frame === 2)
furnitureClick(livePantry, liveSnack.id)
livePantry.furniture.delete(liveSnack.id)
livePantry.refreshNavigationLayout()
advance(livePantry, 0.05)
assert.equal(livePantry.representativeGoal, null)
assert.equal(livePantry.representativePantryTarget, null)
const blockedPantry = representativeScene({ x: 160, y: 288 })
const blockedCoffee = [...blockedPantry.furniture.values()].find(item => item.frame === 0)
const originalCollisions = blockedPantry.collisionRects.bind(blockedPantry)
blockedPantry.collisionRects = (...args) => [...originalCollisions(...args), { x: 0, y: 232, width: 960, height: 16 }]
furnitureClick(blockedPantry, blockedCoffee.id)
assert.equal(blockedPantry.representativePantryTarget, null)
assert.equal(blockedPantry.representativePantryAction, undefined)
assert.match(blockedPantry.pantryHint.text, /갈 수 없어요/)
console.log('PASS representative live furniture destinations, removal during approach/action, and unreachable feedback')

const busyPantry = representativeScene({ x: 160, y: 288 })
const busyCoffee = [...busyPantry.furniture.values()].find(item => item.frame === 0)
const busyApproach = busyPantry.representativePantryApproach(busyCoffee, busyPantry.representativeSprite)
busyPantry.actorObstacles = () => [actorCollisionRect(busyApproach)]
furnitureClick(busyPantry, busyCoffee.id)
const pendingRoute = busyPantry.representativeRoute
furnitureClick(busyPantry, busyCoffee.id)
assert.equal(busyPantry.representativeRoute, pendingRoute, 'repeated clicks preserve the approach in progress')
awaitRepresentativeBreak(busyPantry)
assert.ok(isOfficePositionWalkable(busyPantry.representativeSprite, busyPantry.actorObstacles()),
  'use another reachable spot when an employee occupies the closest service position')
console.log('PASS representative pantry approach around an occupied service position')

const speechLayout = representativeScene({ x: 480, y: 600 })
for (const point of [{ x: 24, y: 144 }, { x: 936, y: 144 }, { x: 480, y: 144 },
  { x: 16, y: 400 }, { x: 480, y: 600 }, { x: 944, y: 800 }]) {
  speechLayout.representativeSprite.setPosition(point.x, point.y)
  speechLayout.showRepresentativeSpeech('커피 마시러 가는 중')
  speechLayout.updateRepresentativeDepth()
  const bubble = speechLayout.representativeSpeechBubble
  const text = speechLayout.representativeSpeech
  const label = speechLayout.representativeLabel
  assert.equal(label.text, '김태호 대표')
  assert.equal(label.x, point.x, 'the name stays centered over the head even at the north/side edges')
  assert.equal(label.y, point.y - speechLayout.representativeSprite.displayHeight - 6)
  const namePosition = position(label)
  const below = label.y - label.displayHeight - 4 - bubble.displayHeight < 8
  if (below) {
    assert.ok(bubble.y - bubble.displayHeight >= point.y + 8, 'insufficient headroom puts speech below the feet, never beside the head')
  } else {
    assert.ok(bubble.y <= label.y - label.displayHeight - 4, 'available headroom puts speech above the name')
  }
  assert.equal(bubble.flipY, below, 'the tail points toward the character on both vertical sides')
  assert.ok(bubble.y - bubble.displayHeight >= 8, 'speech never clips above the world')
  assert.ok(bubble.x - bubble.displayWidth / 2 >= 8 && bubble.x + bubble.displayWidth / 2 <= 952,
    'the whole speech panel remains inside either horizontal edge')
  assert.ok(text.x - text.displayWidth / 2 > bubble.x - bubble.displayWidth / 2 + 8 &&
    text.x + text.displayWidth / 2 < bubble.x + bubble.displayWidth / 2 - 8, 'Korean text fits the bubble interior')
  assert.ok(text.y > bubble.y - bubble.displayHeight + (below ? 12 : 8) && text.y < bubble.y - (below ? 8 : 12),
    'upright text avoids the outline and the upward/downward tail')
  assert.ok(bubble.depth > label.depth && text.depth > bubble.depth, 'text renders above the opaque bubble')
  speechLayout.hideRepresentativeSpeech()
  speechLayout.updateRepresentativeLabelPosition()
  assert.deepEqual(position(label), namePosition, 'showing or hiding speech never displaces the name')
}
speechLayout.showRepresentativeSpeech('커피 마시는 중')
speechLayout.setLayoutEditing(true)
assert.equal(speechLayout.representativeSpeechBubble.visible, false, 'editing hides active speech')
console.log('PASS fixed above-head names, above/below speech, tail orientation, text fit, depth, and editor cancellation')

for (const y of [110, 500]) {
  const employee = stable.actors.get('test')
  employee.container.setPosition(48, y)
  stable.restoreActorStandingPose(employee)
  stable.setActorSpeech(employee, '커피 마시는 중')
  stable.updateActorOverlayPosition(employee)
  const head = employee.container.y + employee.sprite.y - employee.sprite.displayHeight * employee.sprite.originY
  assert.equal(employee.label.x, employee.sprite.x, 'employee names are also centered above the head')
  assert.equal(employee.overlay.y + employee.label.y, head - 6)
  const bubbleTop = employee.overlay.y + employee.speechPanel.y - employee.speechPanel.displayHeight
  if (y === 110) assert.ok(bubbleTop >= employee.container.y, 'employee speech moves below the character at the north edge')
  else assert.ok(bubbleTop + employee.speechPanel.displayHeight <= employee.overlay.y + employee.label.y - employee.label.displayHeight)
}

for (const frame of [0, 2]) for (let pose = 0; pose < 6; pose++) {
  const scene = representativeScene({ x: frame === 0 ? 48 : 144, y: 144 })
  const furniture = [...scene.furniture.values()].find(item => item.frame === frame)
  furnitureClick(scene, furniture.id)
  awaitRepresentativeBreak(scene)
  while (scene.representativePantryAction.pose < pose) advance(scene, 0.05)
  floorClick(scene, { x: 160, y: 288 })
  assert.equal(scene.representativePantryAction, undefined, `pose ${pose} cancels immediately`)
  advance(scene, 6, () => {
    assert.notEqual(scene.representativeSprite.texture.key, 'ceo-pantry-sheet-frames', 'no stale phase can overwrite the walking sprite')
    assert.equal(scene.representativeSpeechBubble.visible, false, 'no stale completion message after interruption')
  })
}
console.log('PASS immediate interruption of every coffee and cookie pose without delayed sprites or speech')

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
    assertSeatedLayers(candidate, chair, body, head.depth)
    assert.deepEqual(position(head), position(body), 'the two parts retain identical placement')
    assert.equal(body.visible, false, 'the foreground replaces the body without double drawing')
    assert.equal(head.crop, null, 'the torso is never cut horizontally at the backrest')
    assert.equal(head.texture.key, REPRESENTATIVE_WORK_TEXTURE, 'only the representative at a desk gets the working pose')
    assert.ok(head.frame.startsWith(`ceo-work-${body.frame.slice('ceo-sit-'.length)}-`))
    const seatPosition = position(body)
    const workFrames = new Set()
    advance(candidate, 2.1, () => {
      workFrames.add(head.frame)
      assert.deepEqual(position(body), seatPosition, 'hand motion cannot shift the seat contact')
      assert.deepEqual(position(head), seatPosition, 'working foreground stays attached to the seat')
      assertSeatedLayers(candidate, chair, body, head.depth)
    })
    assert.equal(workFrames.size, 5, 'both hands tap, recover, and pause')
    assert.deepEqual([...candidate.furniture.values()].map(({ id, image }) => [id, image.depth]), depths)
    assert.ok(candidate.representativeLabel.depth > head.depth)
    assertSeatContact(candidate, chair, body, body)
    assert.equal(candidate.moveRepresentativeTo({ x: 480, y: 600 }), true)
    assert.equal(head.visible, false, 'standing removes the seated foreground pass')
    assert.equal(body.crop, null, 'walking renders the entire character again')
    assert.equal(body.visible, true, 'standing restores the original sprite')
    advance(candidate, 5)
  }
}
console.log('PASS desk/person/backrest order, unchanged chairs, all facings, reload, and visible walking')

assert.equal(representativeWorkPoseAt(0), 0)
assert.equal(representativeWorkPoseAt(90), 1)
assert.equal(representativeWorkPoseAt(360), 3)
assert.equal(representativeWorkPoseAt(1700), 0, 'typing pauses between bursts')
assert.equal(representativeWorkPoseAt(REPRESENTATIVE_WORK_CYCLE_MS + 90), 1)
for (const direction of ['front', 'back', 'left', 'right']) {
  const width = REPRESENTATIVE_WORK_FRAME_WIDTH
  const padding = REPRESENTATIVE_WORK_FRAME_PADDING
  const source = seatedRenderer.workFrame(direction)
  const previousPose = seatedRenderer.workFrame(direction, 'v1')
  const head = seatedRenderer.characterFrame('ceo-seated-sheet-frames', `ceo-sit-${direction}`).source.image.data
  const handCenter = pixels => {
    let totalX = 0, totalY = 0, count = 0
    for (let y = 100; y < 250; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (y < 174 && x >= padding && x < padding + 312 && head[(y * 312 + x - padding) * 4 + 3] > 0) continue
      if (pixels[i + 3] > 127 && pixels[i] > 180 && pixels[i + 1] > 90 && pixels[i + 2] < 150 &&
        pixels[i] > pixels[i + 1] * 1.2) { totalX += x; totalY += y; count++ }
    }
    assert.ok(count > 10, 'both poses retain visible skin on the hands')
    return { x: totalX / count, y: totalY / count, count }
  }
  const beforeReach = handCenter(previousPose)
  const afterReach = handCenter(source)
  const movement = direction === 'back' ? beforeReach.y - afterReach.y
    : direction === 'front' ? afterReach.y - beforeReach.y
      : direction === 'left' ? beforeReach.x - afterReach.x : afterReach.x - beforeReach.x
  assert.ok(movement > 10, `${direction}: the authored wrists reach clearly farther toward the keyboard`)
  const original = new Uint8ClampedArray(source)
  assert.deepEqual(representativeWorkPixels(source, width, 360, direction, 0, head), source, 'pauses keep the hands over the keyboard')
  for (let y = 0; y < 360; y++) {
    assert.ok(source[(y * width) * 4 + 3] < 128 && source[(y * width + width - 1) * 4 + 3] < 128,
      'the wider work frame must not cut off the extended fingertips')
  }
  const poses = new Set()
  for (let pose = 1; pose < 5; pose += 1) {
    const output = representativeWorkPixels(source, width, 360, direction, pose, head)
    assert.notDeepEqual(output, source, `${direction} hands visibly move`)
    assert.deepEqual(output.slice(0, 100 * width * 4), source.slice(0, 100 * width * 4), 'no hair outlines are copied above the head')
    let changedHeadPixels = 0
    for (let y = 0; y < 174; y++) for (let x = 0; x < 312; x++) {
      const i = (y * width + x + padding) * 4
      if (head[(y * 312 + x) * 4 + 3] > 0 && [0, 1, 2, 3].some(channel => output[i + channel] !== source[i + channel])) changedHeadPixels++
    }
    assert.equal(changedHeadPixels, 0, 'the original head silhouette remains fixed in front of the reaching wrists')
    let changedAlphaPixels = 0
    for (let i = 3; i < source.length; i += 4) if (output[i] !== source[i]) changedAlphaPixels++
    assert.equal(changedAlphaPixels, 0, 'typing never tears holes, disconnects the sleeves, or copies extra outlines')
    assert.deepEqual(output.slice(250 * width * 4), source.slice(250 * width * 4), 'lap, hips, legs and feet stay unchanged')
    poses.add(Buffer.from(output).toString('base64'))
  }
  assert.equal(poses.size, 4, 'left and right hand motions produce distinct poses')
  assert.deepEqual(source, original, 'animation never mutates the seated source')
  let lapSkin = 0
  for (let y = 250; y < 285; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    if (source[i + 3] > 127 && source[i] > 180 && source[i + 1] > 90 && source[i + 2] < 150 &&
      source[i] > source[i + 1] * 1.2) lapSkin++
  }
  assert.equal(lapSkin, 0, `${direction}: both hands leave the lap in the new typing posture`)
}
const typing = seatingScene()
typing.addFurniture('desk-0-0', 10, 400, 432, 144, 72)
typing.sitRepresentativeOn('chair-0-0')
advance(typing, 8)
assert.equal(typing.representativeSeatedForeground.texture.key, REPRESENTATIVE_WORK_TEXTURE)
typing.furniture.get('desk-0-0').image.setPosition(650, 750)
advance(typing, 0.1)
assert.equal(typing.representativeSeatedForeground.texture.key, 'ceo-seated-sheet-frames', 'moving the desk away restores resting hands')
typing.furniture.get('desk-0-0').image.setPosition(400, 432)
advance(typing, 0.2)
assert.equal(typing.representativeSeatedForeground.texture.key, REPRESENTATIVE_WORK_TEXTURE)
typing.setLayoutEditing(true)
assert.equal(typing.representativeSeatedForeground.visible, false, 'editing stops typing and stands up')
assert.equal(typing.representativeWorkElapsedMs, 0)
console.log('PASS representative work motion, local arm pixels, stable body/seat, brief pauses, desk changes and editor interruption')

// A north-side sitter must stay behind the meeting table even if the chair
// was edited last. Test both CEO and employee composition with actual arrival.
for (const north of [true, false]) {
  const arrangement = {
    'chair-0-0': { x: 432, y: north ? 112 : 224, rotation: north ? 0 : 180, frame: 12, zOrder: 9000 },
    'custom-meeting-table': { x: 480, y: 160, frame: 6, zOrder: 1 },
    'custom-laptop': { x: 480, y: 136, frame: 7, zOrder: 2 }
  }
  for (const employee of [false, true]) {
    const scene = createScene(arrangement)
    if (employee) {
      scene.worldSave.actors = [{ profileId: 'meeting-depth', x: 480, y: 600 }]
      snapshot(scene, [actor('meeting-depth')])
    } else {
      storage.set(OFFICE_REPRESENTATIVE_SAVE_KEY, JSON.stringify({ x: 480, y: 600 }))
      scene.createRepresentativeActor()
      assert.equal(scene.sitRepresentativeOn('chair-0-0'), true)
    }
    advance(scene, 15)
    const view = scene.actors.get('meeting-depth')
    assert.ok(employee ? view.settled : scene.representativeSeat, 'the actor actually arrives before depth is checked')
    const sitter = employee ? view.seatedForeground : scene.representativeSeatedForeground
    const table = scene.furniture.get('custom-meeting-table').image
    assert.equal(sitter.visible, true)
    assert.equal(sitter.texture.key, employee ? 'staff-seated-0-frames' : 'ceo-seated-sheet-frames', 'meeting seats do not type')
    assert.ok(north ? sitter.depth < table.depth : sitter.depth > table.depth,
      north ? 'front table hides the northern sitter lap' : 'southern sitter remains in front of the table')
    assert.equal(sitter.crop, null, 'occlusion uses asset layering, without cropping character pixels')
    assert.ok(scene.furniture.get('custom-laptop').image.depth > table.depth, 'tabletop laptop remains visible')
  }
}
console.log('PASS north/south meeting occlusion for representative and employee despite reversed saved layers')

// Pixel regression for the reported brown-haired Codex: the old horizontal
// crop removed his coat below the shoulders even though the chair was clear.
const torsoScene = createScene({
  'chair-1-0': { frame: 12, x: 400, y: 480, rotation: 180, zOrder: 1 },
  'desk-1-0': { frame: 10, x: 400, y: 432, zOrder: 2 }
})
torsoScene.worldSave.actors = [{ profileId: 'torso', x: 480, y: 600 }]
snapshot(torsoScene, [actor('torso', 1)])
advance(torsoScene, 8)
const torsoView = torsoScene.actors.get('torso')
const torsoChair = torsoScene.furniture.get('chair-1-0').image
assertSeatedLayers(torsoScene, torsoChair, torsoView.sprite, torsoView.seatedForeground.depth)
const torsoTextureKey = torsoView.seatedForeground.texture.key
assert.equal(torsoTextureKey, 'staff-work-1-frames', 'desk typing uses a complete authored pose')
assert.equal(torsoView.seatedForeground.crop, null, 'no crop removes the lower half of the character')
const torsoPixels = seatedRenderer.staffWorkFrame(1, 0, 'back').data
for (let y = 190; y <= 250; y++) {
  const offset = (y * 384 + 192) * 4
  assert.ok(torsoPixels[offset + 3] > 240, 'the complete center of the coat remains opaque')
  assert.ok(torsoPixels[offset] > torsoPixels[offset + 1] + 40 &&
    torsoPixels[offset + 1] > torsoPixels[offset + 2] + 25, 'visible torso pixels belong to the brown coat')
}
assert.ok(torsoPixels[(280 * 384 + 192) * 4 + 3] > 240, 'the lower torso is not punched out by a chair mask')
assertSeatContact(torsoScene, torsoScene.furniture.get('chair-1-0').image, torsoView.sprite, torsoView.seatedForeground)
const resizedChair = torsoScene.furniture.get('chair-1-0').image
resizedChair.setDisplaySize(resizedChair.displayWidth * 1.1, resizedChair.displayHeight * 1.1)
torsoScene.updateActorDepth(torsoView)
assertSeatContact(torsoScene, resizedChair, torsoView.sprite, torsoView.seatedForeground)
assert.equal(torsoView.seatedForeground.texture.key, torsoTextureKey, 'resizing the chair never rewrites character pixels')
assertSeatedLayers(torsoScene, resizedChair, torsoView.sprite, torsoView.seatedForeground.depth)
snapshot(torsoScene, [actor('torso', 1, 'offDuty')])
assert.equal(torsoView.seatedForeground.destroyed, true)
console.log('PASS original Codex torso pixels, no crop or alpha mask, seat contact, resizing, and cleanup')

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
assertSeatContact(seats, seats.furniture.get('custom-chair').image, seats.representativeSprite, seats.representativeSprite)
seats.setLayoutEditing(true)
seats.setLayoutEditing(false)
chairClick(seats, 'chair-0-0')
seats.furniture.delete('chair-0-0')
seats.refreshNavigationLayout()
advance(seats, 4)
assert.equal(seats.representativeSeat, null)
assert.equal(seats.representativeChairTarget, null, 'deleting the destination safely cancels seating')
console.log('PASS modified clicks, switching seats, edit selection, moved chairs, and deleted destinations')

const removedBackSeat = seatingScene(180)
chairClick(removedBackSeat, 'chair-0-0')
advance(removedBackSeat, 4)
removedBackSeat.furniture.delete('chair-0-0')
assert.equal(removedBackSeat.moveRepresentativeTo({ x: 480, y: 600 }), true)
advance(removedBackSeat, 4)
assert.deepEqual(position(removedBackSeat.representativeSprite), { x: 480, y: 600 })
assert.equal(removedBackSeat.representativeSprite.visible, true, 'removing an occupied chair restores visible walking')

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
  if (saved.y === 112) {
    assert.equal(meetingSeat.sitRepresentativeOn(id), false,
      'enlarged chairs enclose the north seats; entering them must not cross another chair')
    assert.equal(meetingSeat.representativeChairTarget, null)
    continue
  }
  assert.equal(meetingSeat.sitRepresentativeOn(id), true, `default meeting chair ${id} must be reachable under its table`)
  advance(meetingSeat, 15)
  assert.equal(meetingSeat.representativeSeat?.chairId, id)
  assertSeatContact(meetingSeat, meetingSeat.furniture.get(id).image, meetingSeat.representativeSprite, meetingSeat.representativeSprite)
  meetingSeat.representativeLabel.setDisplaySize(110, 24)
  meetingSeat.updateRepresentativeLabelPosition()
  assert.equal(meetingSeat.representativeLabel.x, meetingSeat.representativeSprite.x,
    'northern seats never push the name sideways')
  assert.equal(meetingSeat.representativeLabel.y,
    meetingSeat.representativeSprite.y - meetingSeat.representativeSprite.displayHeight - 6,
    'seated names remain anchored above the head regardless of available space')
  assert.equal(meetingSeat.moveRepresentativeTo({ x: 480, y: 600 }), true)
  advance(meetingSeat, 15)
  assert.deepEqual(position(meetingSeat.representativeSprite), { x: 480, y: 600 })
}
console.log('PASS meeting chairs: safe approaches, blocked enclosed seats, and departure through the doorway')

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
    const frozenPose = view.seatedForeground.frame, frozenTime = view.workElapsedMs
    seated.setLayoutEditing(true)
    advance(seated, 0.3)
    assert.equal(view.seatedForeground.frame, frozenPose, 'editing pauses the current typing pose')
    assert.equal(view.workElapsedMs, frozenTime, 'editing does not advance typing time')
    seated.setLayoutEditing(false)
    const desk = seated.furniture.get(deskId).image
    desk.setPosition(800, 800)
    seated.updateActorWorkAnimation(view, 0)
    assert.equal(view.seatedForeground.texture.key, `staff-seated-${team}-frames`, 'a chair without its nearby desk does not type')
    desk.setPosition(400, 432)
    seated.updateActorWorkAnimation(view, 0)
    assert.equal(view.seatedForeground.texture.key, staffWorkTexture(team), 'typing resumes at the restored desk')
    const prefix = `actor-${team}-${team === 0 && slot === 0 ? 4 : slot}-sit-`
    const approach = { ...view.approachPoint }
    const depths = [...seated.furniture.values()].map(({ image }) => image.depth)
    for (const presence of ['working', 'requestingHelp', 'error', 'deskIdle']) {
      snapshot(seated, [{ ...employee, presence }])
      assert.equal(view.sprite.frame, prefix + 'back')
      assert.deepEqual(position(view.container), { x: 400, y: 480 }, 'work/help/error remain in the same seat')
      assert.deepEqual(view.approachPoint, approach, 'presence updates preserve the safe exit tile')
      assert.equal(view.seatedForeground.visible, true)
      assert.equal(view.seatedForeground.crop, null, 'the upper torso and arms are not horizontally cropped')
      assert.equal(view.sprite.visible, false)
      assert.ok(view.seatedForeground.depth > seated.furniture.get(deskId).image.depth)
      assert.ok(view.overlay.depth > view.seatedForeground.depth)
      assert.equal(view.seatedForeground.texture.key, ['working', 'deskIdle'].includes(presence)
        ? staffWorkTexture(team) : `staff-seated-${team}-frames`, 'help/error pause desk typing')
    }
    for (const [rotation, direction] of [[0, 'front'], [90, 'left'], [180, 'back'], [270, 'left']]) {
      seated.setLayoutEditing(true)
      seated.furniture.get(chairId).image.setData('furnitureRotation', rotation)
        .setTexture(seated.directionalFurnitureTexture(12, rotation))
      seated.refreshNavigationLayout()
      seated.setLayoutEditing(false)
      assert.equal(view.sprite.frame, prefix + direction)
      assert.equal(view.sprite.flipX, rotation === 90)
      assert.match(view.seatedForeground.frame, new RegExp(`^${prefix.replace('-sit-', '-work-')}${direction}-[0-4]$`))
      const contact = position(view.seatedForeground)
      const workFrames = new Set()
      for (let tick = 0; tick < 23; tick++) {
        seated.updateActorWorkAnimation(view, 90)
        workFrames.add(view.seatedForeground.frame)
        assert.deepEqual(position(view.seatedForeground), contact, 'typing keeps the seat contact fixed')
      }
      assert.equal(workFrames.size, 5, 'every staff identity types in all four directions')
      const elapsed = view.workElapsedMs
      snapshot(seated, [{ ...employee, presence: 'deskIdle' }])
      assert.equal(view.workElapsedMs, elapsed, 'routine snapshots do not restart the typing loop')
      assert.equal(view.seatedForeground.flipX, view.sprite.flipX)
      assertSeatedLayers(seated, seated.furniture.get(chairId).image, view.sprite,
        view.seatedForeground.visible ? view.seatedForeground.depth : view.container.depth)
      assertSeatContact(seated, seated.furniture.get(chairId).image, view.sprite, {
        x: view.container.x + view.sprite.x,
        y: view.container.y + view.sprite.y + view.sprite.displayHeight / 2
      })
      assert.equal(view.label.x, view.sprite.x, 'the name follows the side-facing seated body')
    }
    assert.deepEqual([...seated.furniture.values()].map(({ image }) => image.depth), depths)
    let selected = null
    seated.actorSelectHandler = (id) => { selected = id }
    view.seatedForeground.events.get('pointerdown')()
    assert.equal(selected, employee.profileId, 'clicking the visible seated head still selects its agent')
    snapshot(seated, [{ ...employee, presence: 'pantry' }])
    assert.equal(view.seatedForeground.visible, false)
    assert.equal(view.sprite.crop, null)
    assert.equal(view.sprite.visible, true, 'departing employees remain visible')
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

for (let team = 0; team < 3; team++) {
  const root = 'src/renderer/src/assets/pixel-office/characters'
  const original = PNG.sync.read(fs.readFileSync(`${root}/seated-v1/staff-${team}-seated-v1.png`))
  const work = PNG.sync.read(fs.readFileSync(`${root}/work-v1/staff-${team}-work-v1.png`))
  for (const { region } of measureStaffWorkSheet(original.data, work.data, work.width, work.height, team)) {
    for (let y = region.y; y < region.y + region.height; y++) {
      for (const x of [region.x, region.x + region.width - 1]) {
        assert.ok(work.data[(y * work.width + x) * 4 + 3] <= 127, 'column splits must stay in transparent gaps, never through a neighboring fingertip')
      }
    }
  }
}

for (let team = 0; team < 3; team++) for (let column = 0; column < 5; column++) {
  for (const direction of ['front', 'back', 'left']) {
    const { data, hands } = seatedRenderer.staffWorkFrame(team, column, direction)
    const head = seatedRenderer.characterFrame(`staff-seated-${team}-frames`, `actor-${team}-${column}-sit-${direction}`).source.image.data
    const untouched = new Uint8ClampedArray(data)
    const distinct = new Set()
    for (let pose = 0; pose < 5; pose++) {
      const output = workHandPixels(data, 384, 360, hands, pose, head)
      distinct.add(require('node:crypto').createHash('sha256').update(output).digest('hex'))
      for (let y = 0; y < 360; y++) for (let x = 0; x < 384; x++) {
        const p = (y * 384 + x) * 4
        assert.equal(output[p + 3], data[p + 3], 'typing never tears sleeves or changes any silhouette alpha')
        if (y < 100 || y >= 250) assert.deepEqual(output.subarray(p, p + 4), data.subarray(p, p + 4), 'hair and lower body stay fixed')
      }
    }
    assert.equal(distinct.size, 5, `${team}-${column} ${direction}: all five hand poses are visually distinct`)
    assert.deepEqual(data, untouched, 'shared source artwork remains unchanged')
    for (let y = 0; y < 360; y++) {
      assert.ok(data[(y * 384) * 4 + 3] < 128 && data[(y * 384 + 383) * 4 + 3] < 128, 'reaching fingertips fit the wider frame')
    }
  }
}
console.log('PASS 45 staff work views: five distinct finger poses, intact alpha/edges, stable hair/feet and unclipped reach')

const meeting = createScene()
const attendees = Array.from({ length: 5 }, (_, index) => actor(`meeting-${index}`, index % 3, 'meeting', index))
snapshot(meeting, attendees)
advance(meeting, 25)
for (const view of meeting.actors.values()) {
  assert.equal(view.settled, true)
  if (view.actorIndex < 2) {
    assert.equal(view.seatedGoal, false, 'attendees use free floor when enlarged furniture encloses their seats')
    assert.equal(view.chairId, null)
    assert.ok(isOfficePositionWalkable(view.container, meeting.collisionRects()))
  } else {
    assert.equal(view.seatedGoal, true)
    assert.match(view.sprite.frame, /-sit-(front|back|left)$/)
    assert.deepEqual(position(view.container), position(meeting.furniture.get(view.chairId).image))
  }
}
assert.equal(new Set([...meeting.actors.values()].filter((view) => view.seatedGoal).map((view) => view.chairId)).size, 3)
console.log('PASS five meeting attendees: distinct reachable chairs and free-floor waiting at enclosed seats')

// Regression: the old desk collision was half its rendered size, and enlarged
// chairs still used their original bounds. Check visible edges independently
// from the movement collision rectangles, then exercise both actual movers.
function assertOutsideFurniture(point, image) {
  const body = actorCollisionRect(point)
  const bounds = furnitureTextureBounds(image)
  const left = image.x + (bounds.x - 0.5) * image.displayWidth
  const top = image.y + (bounds.y - 0.5) * image.displayHeight
  assert.ok(body.x + body.width <= left || body.x >= left + bounds.width * image.displayWidth ||
    body.y + body.height <= top || body.y >= top + bounds.height * image.displayHeight,
  'walking feet must clear the visible furniture edge, including corners')
}
for (const frame of [0, 1, 2, 5, 6, 10, 12, 13, 14, 15, 16, 17, 18, 19]) {
  for (const rotation of [0, 90, 180, 270]) {
    const layout = { obstacle: { x: 480, y: 560, frame, rotation, zOrder: 1 } }
    const clearances = createScene(layout)
    const image = clearances.furniture.get('obstacle').image
    const visible = clearances.furnitureWalkCollision(image, 0)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const edge = { x: visible.x + visible.width * (dx + 1) / 2,
        y: visible.y + visible.height * (dy + 1) / 2 }
      assert.equal(isOfficePositionWalkable(edge, clearances.collisionRects()), false,
        `frame ${frame}, rotation ${rotation}: the rendered edge cannot be a floor destination`)
    }
    const from = { x: 280, y: 560 }
    const goal = { x: 680, y: 560 }
    const path = findOfficePath(from, goal, clearances.collisionRects())
    assert.deepEqual(path.at(-1), goal)
    assert.ok(path.length > 1, 'the route must go around the rendered asset')
    let previous = from
    for (const next of path) {
      const steps = Math.ceil(Math.hypot(next.x - previous.x, next.y - previous.y))
      for (let step = 0; step <= steps; step++) {
        const t = step / steps
        assertOutsideFurniture({ x: previous.x + (next.x - previous.x) * t,
          y: previous.y + (next.y - previous.y) * t }, image)
      }
      previous = next
    }
    if (![10, 12, 13, 14].includes(frame)) continue
    storage.set(OFFICE_REPRESENTATIVE_SAVE_KEY, JSON.stringify(from))
    clearances.createRepresentativeActor()
    assert.equal(clearances.moveRepresentativeTo(goal), true)
    advance(clearances, 8, () => assertOutsideFurniture(clearances.representativeSprite, image))
    assert.deepEqual(position(clearances.representativeSprite), goal)
    const staff = createScene(layout)
    staff.worldSave.actors = [{ profileId: 'edge-walker', ...goal }]
    staff.actorDestination = () => ({ point: from, seated: false })
    snapshot(staff, [actor('edge-walker')])
    const walker = staff.actors.get('edge-walker')
    advance(staff, 8, () => assertOutsideFurniture(walker.container, staff.furniture.get('obstacle').image))
    assert.equal(walker.settled, true)
    assert.deepEqual(position(walker.container), from)
    const revision = staff.navigationRevision
    const desk = staff.furniture.get('obstacle').image
    desk.setDisplaySize(desk.displayWidth * 1.2, desk.displayHeight * 1.2)
    staff.refreshNavigationLayout()
    assert.ok(staff.navigationRevision > revision, 'resizing furniture must invalidate old paths')
  }
}
console.log('PASS visible edges in all furniture facings, corner clearance, both movers, and resize invalidation')

// Reported gap: two enlarged desks 240px apart have a visible walking aisle.
// Their PNG rectangles + the old 8px margin left just 4px between foot centers,
// so no navigation grid point could enter it from an offset approach.
const aisleLayout = {
  'desk-0-0': { x: 112, y: 480, frame: 10, zOrder: 1 },
  'chair-0-0': { x: 128, y: 528, frame: 12, rotation: 180, zOrder: 2 },
  'desk-1-0': { x: 352, y: 480, frame: 10, zOrder: 3 },
  'chair-1-0': { x: 368, y: 528, frame: 12, rotation: 180, zOrder: 4 }
}
const aisleStart = { x: 280, y: 400 }
const aisleEnd = { x: 208, y: 624 }
for (const representative of [true, false]) {
  const aisle = createScene(aisleLayout)
  let moving
  if (representative) {
    storage.set(OFFICE_REPRESENTATIVE_SAVE_KEY, JSON.stringify(aisleStart))
    aisle.createRepresentativeActor()
    assert.equal(aisle.moveRepresentativeTo(aisleEnd), true)
    moving = aisle.representativeSprite
  } else {
    aisle.worldSave.actors = [{ profileId: 'aisle-agent', ...aisleStart }]
    aisle.actorDestination = () => ({ point: aisleEnd, seated: false })
    snapshot(aisle, [actor('aisle-agent')])
    moving = aisle.actors.get('aisle-agent').container
  }
  let crossedAisle = false
  advance(aisle, 6, () => {
    for (const { image } of aisle.furniture.values()) assertOutsideFurniture(moving, image)
    if (moving.y > 450 && moving.y < 510) {
      assert.ok(moving.x > 210 && moving.x < 254, 'use the visible gap instead of detouring around both desks')
      crossedAisle = true
    }
  })
  assert.equal(crossedAisle, true)
  assert.deepEqual(position(moving), aisleEnd)
}
const padded = new Uint8Array(8 * 8 * 4)
for (let y = 2; y <= 5; y++) for (let x = 1; x <= 6; x++) padded[(y * 8 + x) * 4 + 3] = 255
padded[3] = 1
assert.deepEqual(measureFurnitureBounds(padded, 8, 8), { x: 1 / 8, y: 2 / 8, width: 6 / 8, height: 4 / 8 })
console.log('PASS reported desk aisle for representative and staff, opaque borders, and transparent padding')
