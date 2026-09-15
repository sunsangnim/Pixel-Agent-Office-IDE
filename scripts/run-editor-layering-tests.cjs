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
    x, y, depth: 0, displayWidth: width, displayHeight: height, events,
    setDepth(value) { this.depth = value; return this },
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

const pointer = { event: { shiftKey: false }, rightButtonDown: () => false }
const click = (scene, id) => scene.furniture.get(id).image.events.get('pointerdown')(pointer)
const depth = (scene, id) => scene.furniture.get(id).image.depth
const savedLayout = () => JSON.parse(storage.get('pixel-office-layout-v1'))

const scene = createScene()
const before = [...scene.furniture.values()].map(({ image }) => [image.x, image.y])
click(scene, 'desk-0-0')
assert.ok(depth(scene, 'desk-0-0') > depth(scene, 'custom-table'), 'a click alone must raise the selected asset')
assert.ok(scene.selectionOutline.depth > scene.maxFurnitureDepth(), 'outline stays above furniture')
assert.ok(savedLayout()['desk-0-0'].zOrder > savedLayout()['custom-table'].zOrder, 'click order is saved immediately')
click(scene, 'chair-0-0')
click(scene, 'desk-0-0')
assert.ok(depth(scene, 'desk-0-0') > depth(scene, 'chair-0-0'), 'the latest selection wins repeatedly')
assert.deepEqual([...scene.furniture.values()].map(({ image }) => [image.x, image.y]), before, 'selection never moves an asset')
const reloaded = createScene(savedLayout())
assert.ok(depth(reloaded, 'desk-0-0') > depth(reloaded, 'chair-0-0'), 'saved order survives reconstruction')
click(reloaded, 'chair-0-0')
assert.ok(depth(reloaded, 'chair-0-0') > depth(reloaded, 'desk-0-0'), 'new selections outrank restored order')
console.log('PASS click ordering, persistence, reconstruction, and selection outline')

scene.toggleFurnitureSelection('chair-0-0')
assert.equal(scene.multiSelectedIds.size, 2)
assert.ok(depth(scene, 'chair-0-0') > depth(scene, 'desk-0-0'), 'Shift-added item goes on top')
click(scene, 'desk-0-0')
assert.equal(scene.multiSelectedIds.size, 2, 'reselecting a group member preserves the group')
assert.ok(depth(scene, 'desk-0-0') > depth(scene, 'chair-0-0'), 'reselected member goes on top')
assert.ok([...scene.multiSelectOutlines.values()].every((outline) => outline.depth > scene.maxFurnitureDepth()))
const orderBeforeDeselect = scene.zOrderById.get('chair-0-0')
scene.toggleFurnitureSelection('chair-0-0')
assert.equal(scene.zOrderById.get('chair-0-0'), orderBeforeDeselect, 'deselecting does not reorder')
scene.setMultiSelection(['desk-0-0', 'chair-0-0'])
assert.ok(depth(scene, 'desk-0-0') > depth(scene, 'chair-0-0'), 'marquee preserves internal group order')
console.log('PASS Shift selection, group member reselection, deselection, and marquee ordering')

const occupied = { actors: [{ profileId: 'seated-test', presence: 'deskIdle', teamIndex: 0, slotIndex: 0 }] }
scene.snapshot = occupied
scene.actors.set('seated-test', {
  actor: occupied.actors[0], settled: true, seatedGoal: true,
  sprite: { anims: { pause() {} } },
  container: imageDouble(128, 512),
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
