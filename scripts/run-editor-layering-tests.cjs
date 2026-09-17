const assert = require('node:assert/strict')
const path = require('node:path')
const { buildSync } = require('esbuild')

const outputFile = path.join(process.cwd(), 'out', 'editor-layering-runner.cjs')
buildSync({
  entryPoints: ['src/renderer/src/game/OfficeScene.ts'],
  outfile: outputFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: { phaser: path.join(__dirname, 'fixtures', 'phaser-scene.cjs') },
  loader: { '.png': 'empty' },
  define: { 'import.meta.glob': 'emptyAssetGlob' },
  banner: { js: 'function emptyAssetGlob() { return {} }' },
  logLevel: 'silent'
})
const { OfficeScene } = require(outputFile)
const storage = new Map()
global.localStorage = {
  setItem: (key, value) => storage.set(key, value),
  getItem: (key) => storage.get(key) ?? null,
  removeItem: (key) => storage.delete(key)
}

function imageDouble(x, y, width = 64, height = 64) {
  const data = new Map()
  const events = new Map()
  return {
    x, y, depth: 0, originX: 0.5, originY: 0.5, displayWidth: width, displayHeight: height, events,
    texture: { key: '' }, frame: { name: '' },
    setTexture(key, name) { this.texture = { key }; this.frame = { name }; return this },
    setFlipX(value) { this.flipX = value; return this },
    setDepth(value) { this.depth = value; return this },
    setCrop(...crop) { this.crop = crop; return this },
    setVisible(value) { this.visible = value; return this },
    setPosition(nextX, nextY) { this.x = nextX; this.y = nextY; return this },
    setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this },
    setSize(w, h) { return this.setDisplaySize(w, h) },
    setData(key, value) {
      if (typeof key === 'object') Object.entries(key).forEach(([name, entry]) => data.set(name, entry))
      else data.set(key, value)
      return this
    },
    getData(key) { return data.get(key) },
    setInteractive() { return this },
    setStrokeStyle() { return this },
    setAlpha() { return this },
    on(event, handler) { events.set(event, handler); return this },
    destroy() { this.destroyed = true }
  }
}

function createScene(saved) {
  const scene = new OfficeScene()
  scene.furnitureTextureBounds = () => ({ x: 0, y: 0, width: 1, height: 1 })
  scene.renderSeatedForeground = () => {}
  scene.seatedFrameAnchor = () => ({ x: 156, y: 280 })
  scene.add = { image: imageDouble, rectangle: imageDouble }
  scene.input = { setDraggable() {} }
  scene.furniturePlacementCollides = () => false
  scene.reportDeskCounts = () => {}
  scene.layoutSave = saved ?? {
    'desk-0-0': { x: 112, y: 480, zOrder: 100 },
    'chair-0-0': { x: 128, y: 512, zOrder: 101 },
    'custom-table': { x: 480, y: 800, zOrder: 102 }
  }
  scene.zOrderById = new Map(Object.entries(scene.layoutSave).map(([id, value]) => [id, value.zOrder]))
  scene.nextZOrder = Math.max(...scene.zOrderById.values()) + 1
  scene.addFurniture('desk-0-0', 10, 112, 480, 92, 58)
  scene.addFurniture('chair-0-0', 12, 128, 512, 64, 64)
  scene.addFurniture('custom-table', 6, 480, 800, 256, 96)
  scene.setLayoutEditing(true)
  return scene
}

const pointer = { event: { shiftKey: false }, rightButtonDown: () => false, leftButtonDown: () => true }
const click = (scene, id) => scene.furniture.get(id).image.events.get('pointerdown')(pointer)
const depth = (scene, id) => scene.furniture.get(id).image.depth
const savedLayout = () => JSON.parse(storage.get('pixel-office-layout-v1'))

const scene = createScene()
const before = [...scene.furniture.values()].map(({ image }) => [image.x, image.y])
click(scene, 'desk-0-0')
assert.ok(depth(scene, 'desk-0-0') < depth(scene, 'custom-table'), 'selecting rear furniture cannot lift it above furniture further south')
assert.ok(scene.selectionOutline.depth > scene.maxFurnitureDepth(), 'outline stays above furniture')
assert.ok(savedLayout()['desk-0-0'].zOrder > savedLayout()['custom-table'].zOrder, 'click order is saved immediately')
click(scene, 'chair-0-0')
click(scene, 'desk-0-0')
assert.ok(depth(scene, 'desk-0-0') < depth(scene, 'chair-0-0'), 'floor position wins over repeated selection')
assert.deepEqual([...scene.furniture.values()].map(({ image }) => [image.x, image.y]), before, 'selection never moves an asset')
const reloaded = createScene(savedLayout())
assert.ok(depth(reloaded, 'desk-0-0') < depth(reloaded, 'chair-0-0'), 'spatial order survives reconstruction with saved selection history')
click(reloaded, 'chair-0-0')
assert.ok(depth(reloaded, 'chair-0-0') > depth(reloaded, 'desk-0-0'), 'the southern chair remains in front')
console.log('PASS spatial ordering despite selection history, persistence, reconstruction, and selection outline')

scene.toggleFurnitureSelection('chair-0-0')
assert.equal(scene.multiSelectedIds.size, 2)
assert.ok(depth(scene, 'chair-0-0') > depth(scene, 'desk-0-0'), 'Shift selection retains spatial order')
click(scene, 'desk-0-0')
assert.equal(scene.multiSelectedIds.size, 2, 'reselecting a group member preserves the group')
assert.ok(depth(scene, 'desk-0-0') < depth(scene, 'chair-0-0'), 'reselecting a group member retains spatial order')
assert.ok([...scene.multiSelectOutlines.values()].every((outline) => outline.depth > scene.maxFurnitureDepth()))
const orderBeforeDeselect = scene.zOrderById.get('chair-0-0')
scene.toggleFurnitureSelection('chair-0-0')
assert.equal(scene.zOrderById.get('chair-0-0'), orderBeforeDeselect, 'deselecting does not reorder')
scene.setMultiSelection(['desk-0-0', 'chair-0-0'])
assert.ok(depth(scene, 'desk-0-0') < depth(scene, 'chair-0-0'), 'marquee preserves spatial group order')
console.log('PASS Shift selection, group member reselection, deselection, and marquee ordering')

const occupied = { actors: [{ profileId: 'seated-test', presence: 'deskIdle', teamIndex: 0, slotIndex: 0 }] }
scene.snapshot = occupied
scene.actors.set('seated-test', {
  actor: occupied.actors[0], settled: true, seatedGoal: true, workElapsedMs: 0,
  chairId: 'chair-0-0',
  sprite: Object.assign(imageDouble(0, -38, 104, 120), { anims: { pause() {} } }),
  seatedForeground: imageDouble(128, 534, 104, 120),
  container: imageDouble(128, 512),
  overlay: imageDouble(128, 512),
  stateMachine: { current: { action: 'sitting' } }
})
// Movement is exercised by test:movement; this fixture represents an actor
// that has physically arrived at its chair for the layering assertions.
scene.effectiveActor = (view) => view.actor
scene.updateActor = () => {}
click(scene, 'chair-0-0')
scene.applySnapshot(occupied)
assert.ok(depth(scene, 'chair-0-0') > depth(scene, 'desk-0-0'), 'presence updates cannot lower an editing chair')
const selectedDepths = [...scene.furniture.values()].map(({ id, image }) => [id, image.depth])
const selectedOrder = [...scene.zOrderById]
scene.setLayoutEditing(false)
assert.ok(depth(scene, 'chair-0-0') > depth(scene, 'desk-0-0'), 'finishing editing preserves the selected chair order even when occupied')
assert.equal(scene.selectedFurniture, null, 'finishing editing clears selection')
assert.equal(scene.multiSelectedIds.size, 0, 'finishing editing clears group selection')
for (const presence of ['working', 'deskIdle', 'pantry', 'deskIdle']) {
  scene.actors.get('seated-test').actor.presence = presence
  scene.applySnapshot(occupied)
  assert.deepEqual([...scene.furniture.values()].map(({ id, image }) => [id, image.depth]), selectedDepths,
    'presence updates outside editing preserve every furniture depth')
}
assert.deepEqual([...scene.zOrderById], selectedOrder, 'presence updates preserve saved ordering')
const finishedReload = createScene(savedLayout())
finishedReload.setLayoutEditing(false)
assert.deepEqual([...finishedReload.furniture.values()].map(({ id, image }) => [id, image.depth]), selectedDepths,
  'the finished layout restores the same depths after a reload')
const outsideOrder = [...scene.zOrderById]
click(scene, 'desk-0-0')
assert.deepEqual([...scene.zOrderById], outsideOrder, 'outside-editor clicks leave saved order unchanged')
scene.setLayoutEditing(true)
assert.ok(depth(scene, 'chair-0-0') > depth(scene, 'desk-0-0'), 'entering editing restores chosen chair order immediately')
console.log('PASS finished layout order, presence updates, reload, and entering/leaving edit mode')

const sameRow = createScene()
sameRow.furniture.get('chair-0-0').image.setPosition(128, 480)
click(sameRow, 'desk-0-0')
assert.ok(depth(sameRow, 'desk-0-0') > depth(sameRow, 'chair-0-0'), 'selection breaks ties at the same Y')
click(sameRow, 'chair-0-0')
assert.ok(depth(sameRow, 'chair-0-0') > depth(sameRow, 'desk-0-0'), 'equal-Y tie breaking remains editable')
const moved = sameRow.furniture.get('desk-0-0').image
moved.events.get('dragstart')()
moved.events.get('drag')(pointer, 112, 544)
assert.ok(depth(sameRow, 'desk-0-0') > depth(sameRow, 'chair-0-0'), 'dragging below a chair brings the desk in front immediately')
moved.events.get('drag')(pointer, 112, 416)
assert.ok(depth(sameRow, 'desk-0-0') < depth(sameRow, 'chair-0-0'), 'dragging above a chair puts the desk behind immediately')
moved.events.get('dragend')()
const table = sameRow.furniture.get('custom-table').image
sameRow.addFurniture('custom-laptop', 7, 480, 776, 48, 32)
sameRow.addFurniture('custom-front-chair', 12, 480, 848, 64, 64)
assert.ok(depth(sameRow, 'custom-laptop') > table.depth, 'laptop stays above the tabletop despite its northern center')
assert.ok(depth(sameRow, 'custom-laptop') < depth(sameRow, 'custom-front-chair'), 'tabletop props do not cover nearer furniture')
table.events.get('drag')(pointer, 640, 800)
assert.ok(depth(sameRow, 'custom-laptop') < table.depth, 'moving the supporting table away restores the laptop floor depth')
console.log('PASS same-Y ties, live drag ordering, and local tabletop prop layering')

const headTable = createScene()
const headChairId = 'custom-1787984571110-14'
const conference = headTable.addFurniture('custom-conference', 20, 480, 200, 256, 144)
headTable.addFurniture(headChairId, 12, 368, 208, 64, 64)
headTable.addFurniture('custom-meeting-laptop', 7, 400, 184, 48, 32)
headTable.addFurniture('custom-meeting-front-chair', 12, 528, 240, 64, 64)
click(headTable, headChairId)
assert.ok(conference.depth > depth(headTable, headChairId) + 0.25, 'table covers the head chair and seated lap despite the chair center being further south')
assert.ok(depth(headTable, 'custom-meeting-laptop') > conference.depth, 'head-chair correction keeps the laptop on the tabletop')
assert.ok(depth(headTable, 'custom-meeting-front-chair') > conference.depth, 'near-side meeting chairs remain in front')
headTable.setLayoutEditing(false)
headTable.refreshFurnitureDepths()
assert.ok(conference.depth > depth(headTable, headChairId), 'finishing editing preserves the head-chair overlap')
headTable.setLayoutEditing(true)
conference.events.get('drag')(pointer, 736, 200)
assert.ok(conference.depth < depth(headTable, headChairId), 'a separated table returns to normal floor ordering')
console.log('PASS meeting head chair below tabletop, seated lap clearance, laptop, front chairs and separated furniture')
