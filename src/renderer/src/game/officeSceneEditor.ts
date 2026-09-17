import type { OfficeScene, LayoutSnapshot } from './OfficeScene'
import Phaser from 'phaser'
import { CONFERENCE_TABLE_FRAME, CONFERENCE_TABLE_ID, OFFICE_LAYOUT_SAVE_KEY, OFFICE_REMOVED_DESKS_KEY, REPRESENTATIVE_MEETING_CHAIR_ID, type SavedFurniture } from './layoutPersistence'
import { DESK_FURNITURE_FRAME, EditorState, FloorTexture, FurnitureView, OFFICE_FLOOR_SAVE_KEY, STACKABLE_FURNITURE_FRAMES, TABLETOP_FURNITURE_FRAMES, furnitureDisplaySize, pairedFurnitureId } from './OfficeScene'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH } from './officeWorld'
import { intersectsAabb } from './collisionResolution'
import { isInStaffArea } from './officeRooms'
import { rotatedFootprint, snapFurniturePoint } from './officeGrid'

const MAX_UNDO_HISTORY = 50

function snapshotLayout(scene: OfficeScene): LayoutSnapshot {
  return { layout: structuredClone(scene.layoutSave), removedDeskIds: [...scene.removedDeskIds] }
}

/** Call before any furniture-layout mutation so it can be undone. A fresh
 *  action always invalidates whatever was previously available to redo. */
function pushUndo(scene: OfficeScene): void {
  scene.undoStack.push(snapshotLayout(scene))
  if (scene.undoStack.length > MAX_UNDO_HISTORY) scene.undoStack.shift()
  scene.redoStack = []
}

/** Rebuilds every furniture piece from a saved snapshot - the same
 *  destroy-and-recreate path `create()` itself uses on a fresh load. */
function applyLayoutSnapshot(scene: OfficeScene, snapshot: LayoutSnapshot): void {
  for (const view of scene.furniture.values()) view.image.destroy()
  scene.furniture.clear()
  scene.teamLabels.forEach((label) => label.destroy())
  scene.teamLabels.clear()
  scene.clearMultiSelection()
  scene.selectedFurniture = null
  scene.selectionOutline?.destroy()
  scene.selectionOutline = undefined

  scene.layoutSave = structuredClone(snapshot.layout)
  scene.removedDeskIds = new Set(snapshot.removedDeskIds)
  scene.zOrderById = new Map(
    Object.entries(scene.layoutSave)
      .filter((entry): entry is [string, SavedFurniture & { zOrder: number }] => typeof entry[1].zOrder === 'number')
      .map(([id, saved]) => [id, saved.zOrder])
  )
  scene.nextZOrder = 1 + Math.max(0, ...scene.zOrderById.values())

  scene.createDesks()
  scene.restoreCustomFurniture()
  localStorage.setItem(OFFICE_LAYOUT_SAVE_KEY, JSON.stringify(scene.layoutSave))
  localStorage.setItem(OFFICE_REMOVED_DESKS_KEY, JSON.stringify([...scene.removedDeskIds]))
  scene.refreshNavigationLayout()
  scene.reportDeskCounts()
  scene.notifyEditorState()
}

export function undoLayoutChange(scene: OfficeScene): void {
  if (!scene.layoutEditing) return
  const snapshot = scene.undoStack.pop()
  if (!snapshot) return
  scene.redoStack.push(snapshotLayout(scene))
  applyLayoutSnapshot(scene, snapshot)
}

export function redoLayoutChange(scene: OfficeScene): void {
  if (!scene.layoutEditing) return
  const snapshot = scene.redoStack.pop()
  if (!snapshot) return
  scene.undoStack.push(snapshotLayout(scene))
  applyLayoutSnapshot(scene, snapshot)
}

const LAYOUT_PRESETS_KEY = 'pixel-office-layout-presets-v1'
const MAX_PRESET_NAME_LENGTH = 40
export interface LayoutPresetSummary { name: string; savedAt: string }
interface StoredPreset { savedAt: string; snapshot: LayoutSnapshot }

function readPresets(): Record<string, StoredPreset> {
  try {
    const raw = localStorage.getItem(LAYOUT_PRESETS_KEY)
    if (!raw) return {}
    const value = JSON.parse(raw) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, StoredPreset> : {}
  } catch {
    return {}
  }
}

function writePresets(presets: Record<string, StoredPreset>): void {
  localStorage.setItem(LAYOUT_PRESETS_KEY, JSON.stringify(presets))
}

export function listLayoutPresets(_scene: OfficeScene): LayoutPresetSummary[] {
  return Object.entries(readPresets())
    .map(([name, preset]) => ({ name, savedAt: preset.savedAt }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/** Named snapshots of the current layout, saved alongside (not instead of)
 *  the single active layout - switching presets doesn't require redoing the
 *  interior from scratch, and mid-edit work is never at risk of being
 *  silently replaced by loading one. */
export function saveLayoutPreset(scene: OfficeScene, name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > MAX_PRESET_NAME_LENGTH) return false
  const presets = readPresets()
  presets[trimmed] = { savedAt: new Date().toISOString(), snapshot: snapshotLayout(scene) }
  writePresets(presets)
  return true
}

export function loadLayoutPreset(scene: OfficeScene, name: string): boolean {
  if (!scene.layoutEditing) return false
  const preset = readPresets()[name]
  if (!preset) return false
  pushUndo(scene)
  applyLayoutSnapshot(scene, preset.snapshot)
  return true
}

export function deleteLayoutPreset(_scene: OfficeScene, name: string): void {
  const presets = readPresets()
  delete presets[name]
  writePresets(presets)
}

export function addFurniture(scene: OfficeScene, id: string, frame: number, x: number, y: number, _width: number, _height: number): Phaser.GameObjects.Image {
  const saved = scene.layoutSave[id]
  const angle = saved?.rotation ?? 0
  const requested = snapFurniturePoint({ x: saved?.x ?? x, y: saved?.y ?? y }, rotatedFootprint(frame, angle))
  const fallback = snapFurniturePoint({ x, y }, rotatedFootprint(frame, angle))
  const initial = scene.furniturePlacementCollides(id, frame, requested, angle)
    ? (scene.furniturePlacementCollides(id, frame, fallback, angle) ? scene.findFreeFurniturePoint(frame, angle, { x, y }) : fallback)
    : requested
  const initialFootprint = rotatedFootprint(frame, angle)
  const initialDisplaySize = furnitureDisplaySize(frame, initialFootprint.columns, initialFootprint.rows)
  // Floor position determines front/back order. Saved selection order only
  // breaks ties between pieces at the same Y coordinate.
  if (!scene.zOrderById.has(id)) scene.zOrderById.set(id, scene.nextZOrder++)
  const image = scene.add.image(initial.x, initial.y, scene.directionalFurnitureTexture(frame, angle))
    .setDisplaySize(initialDisplaySize.width, initialDisplaySize.height)
    .setDepth(initial.y + scene.furnitureDepthBonus(id))
    // Pixel-perfect hit testing: without it, overlapping pieces (e.g. a
    // desk and its chair) hit-test as solid rectangles, so whichever one
    // currently renders on top steals clicks even over the other's fully
    // visible, opaque pixels - you'd select the chair while aiming at the
    // desk's monitor. This makes clicks land on whatever is actually drawn
    // at that pixel.
    .setInteractive({ useHandCursor: true, draggable: true, pixelPerfect: true })
  image.setData({ furnitureId: id, furnitureFrame: frame, furnitureRotation: angle })
  scene.input.setDraggable(image)
  image.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (!scene.layoutEditing) {
      if (pointer.leftButtonDown() && !pointer.event.shiftKey && !pointer.event.ctrlKey &&
        !pointer.event.metaKey && !pointer.event.altKey) {
        if ([12, 13, 14].includes(frame)) scene.sitRepresentativeOn(id)
        else if ([0, 1, 2].includes(frame) && !scene.interactRepresentativeWith(id)) {
          scene.showPantryHint(id, '지금은 가까이 갈 수 없어요')
        }
      }
      return
    }
    if (scene.layoutEditing && pointer.rightButtonDown()) {
      // Right-click only rotates a piece that is already selected; it must
      // not also select whatever was right-clicked in the same click.
      if (scene.selectedFurniture?.id === id) scene.rotateSelectedFurniture(90)
      return
    }
    // Shift+click/drag is claimed by the scene-level marquee-select
    // handlers below (createLayoutEditor) - toggle-select on click,
    // rectangle-select on drag - so it must not also single-select here.
    if (scene.layoutEditing && pointer.event.shiftKey) return
    // Clicking (to start a drag) on a piece that's already part of an
    // active multi-selection must NOT collapse it down to just this one -
    // otherwise dragging any multi-selected piece would silently drop the
    // rest of the group right before the drag even starts.
    if (scene.layoutEditing && scene.multiSelectedIds.has(id) && scene.multiSelectedIds.size > 1) {
      scene.bringFurnitureToFront(id)
      scene.saveFurnitureLayout()
      return
    }
    scene.selectFurniture(id)
  })
  image.on('pointerover', () => {
    if (!scene.layoutEditing && [0, 1, 2].includes(frame)) {
      scene.showPantryHint(id, frame === 0 ? '클릭해서 커피 마시기' : '클릭해서 간식 먹기')
    }
  })
  image.on('pointerout', () => scene.pantryHint?.setVisible(false))
  image.on('dragstart', () => {
    // Input remains bound outside editing; that must not change layer order.
    if (!scene.layoutEditing) return
    pushUndo(scene)
    image.setData({ dragStartX: image.x, dragStartY: image.y })
    // Resolve equal-position ties without lifting rear furniture over the front.
    scene.bringFurnitureToFront(id)
    scene.groupDragOffsets.clear()
    if (scene.multiSelectedIds.has(id) && scene.multiSelectedIds.size > 1) {
      scene.multiSelectedIds.forEach((otherId) => {
        if (otherId === id) return
        const otherView = scene.furniture.get(otherId)
        if (otherView) scene.groupDragOffsets.set(otherId, { x: otherView.image.x - image.x, y: otherView.image.y - image.y })
      })
    }
  })
  image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
    if (!scene.layoutEditing) return
    const rotation = scene.furnitureRotation(image)
    const footprint = rotatedFootprint(frame, rotation)
    const snapped = snapFurniturePoint({
      x: Phaser.Math.Clamp(dragX, footprint.columns * 8, OFFICE_WORLD_WIDTH - footprint.columns * 8),
      y: Phaser.Math.Clamp(dragY, footprint.rows * 8, OFFICE_WORLD_HEIGHT - footprint.rows * 8)
    }, footprint)
    image.setPosition(snapped.x, snapped.y).setDepth(snapped.y + scene.furnitureDepthBonus(id))
    scene.updateSelectionOutline()
    // Carry the rest of the multi-selected group along by the same delta -
    // each piece keeps its own offset from the dragged (leader) piece, and
    // is independently clamped to the world bounds. Floor labels update
    // after every member has moved, using the whole desk/chair pair.
    scene.groupDragOffsets.forEach((offset, otherId) => {
      const otherView = scene.furniture.get(otherId)
      if (!otherView) return
      const otherImage = otherView.image
      const otherFootprint = rotatedFootprint(otherView.frame, scene.furnitureRotation(otherImage))
      const nx = Phaser.Math.Clamp(snapped.x + offset.x, otherFootprint.columns * 8, OFFICE_WORLD_WIDTH - otherFootprint.columns * 8)
      const ny = Phaser.Math.Clamp(snapped.y + offset.y, otherFootprint.rows * 8, OFFICE_WORLD_HEIGHT - otherFootprint.rows * 8)
      otherImage.setPosition(nx, ny).setDepth(ny + scene.furnitureDepthBonus(otherId))
      scene.multiSelectOutlines.get(otherId)?.setPosition(nx, ny)
    })
    scene.refreshFurnitureDepths()
  })
  image.on('dragend', () => {
    if (!scene.layoutEditing) return
    const snapped = snapFurniturePoint({ x: image.x, y: image.y }, rotatedFootprint(frame, scene.furnitureRotation(image)))
    image.setPosition(snapped.x, snapped.y)
    image.setDepth(image.y + scene.furnitureDepthBonus(id))
    scene.updateSelectionOutline()
    scene.groupDragOffsets.forEach((_offset, otherId) => {
      const otherView = scene.furniture.get(otherId)
      if (!otherView) return
      const otherImage = otherView.image
      const otherSnapped = snapFurniturePoint(
        { x: otherImage.x, y: otherImage.y }, rotatedFootprint(otherView.frame, scene.furnitureRotation(otherImage))
      )
      otherImage.setPosition(otherSnapped.x, otherSnapped.y).setDepth(otherSnapped.y + scene.furnitureDepthBonus(otherId))
      scene.multiSelectOutlines.get(otherId)?.setPosition(otherSnapped.x, otherSnapped.y)
    })
    scene.groupDragOffsets.clear()
    scene.saveFurnitureLayout()
  })
  scene.furniture.set(id, { id, frame, image, defaultPoint: { x, y } })
  scene.refreshFurnitureDepths()
  return image
}
// The palette/floor-picker/remove-buttons used to render as Phaser objects
// overlapping the bottom of the office scene itself. They now live in
// LayoutEditorPanel (React, below the canvas) and drive this scene through
// the public editor methods + setEditorStateHandler below - this only
// wires the one interaction that has to stay at the Phaser/input level.
export function createLayoutEditor(scene: OfficeScene): void {
  scene.input.mouse?.disableContextMenu()
  // A plain click selects; movement starts a drag separately.
  scene.input.dragDistanceThreshold = 4
  scene.input.keyboard?.on('keydown-DELETE', () => scene.deleteSelectedFurniture())
  scene.input.keyboard?.on('keydown-Z', (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return
    if (event.shiftKey) scene.redoLayoutChange()
    else scene.undoLayoutChange()
  })
  scene.input.keyboard?.on('keydown-Y', (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) scene.redoLayoutChange()
  })
  scene.createMarqueeSelect()
}
// Shift + drag draws a rectangle and multi-selects every piece whose
// anchor point falls inside it (for bulk "선택 삭제"); a shift+click with
// no real drag instead toggles just the one piece under the pointer, so
// shift can build up a selection one click at a time too.
export function createMarqueeSelect(scene: OfficeScene): void {
  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (!scene.layoutEditing || !pointer.event.shiftKey || pointer.rightButtonDown()) return
    scene.marqueeStart = { x: pointer.worldX, y: pointer.worldY }
    scene.marqueeRect?.destroy()
    scene.marqueeRect = scene.add.rectangle(pointer.worldX, pointer.worldY, 1, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x6ea8fe)
      .setFillStyle(0x6ea8fe, 0.12)
      .setDepth(scene.editorOverlayDepth())
  })
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (!scene.marqueeStart || !scene.marqueeRect) return
    const x0 = Math.min(scene.marqueeStart.x, pointer.worldX)
    const y0 = Math.min(scene.marqueeStart.y, pointer.worldY)
    const width = Math.abs(pointer.worldX - scene.marqueeStart.x)
    const height = Math.abs(pointer.worldY - scene.marqueeStart.y)
    scene.marqueeRect.setPosition(x0, y0).setSize(width, height)
  })
  scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    if (!scene.marqueeStart) return
    const start = scene.marqueeStart
    scene.marqueeStart = null
    scene.marqueeRect?.destroy()
    scene.marqueeRect = undefined

    const x0 = Math.min(start.x, pointer.worldX)
    const y0 = Math.min(start.y, pointer.worldY)
    const x1 = Math.max(start.x, pointer.worldX)
    const y1 = Math.max(start.y, pointer.worldY)
    if (x1 - x0 < 4 && y1 - y0 < 4) {
      // Barely moved - treat it as a shift+click toggle on whatever
      // furniture (if any) is directly under the pointer.
      const hit = scene.input.hitTestPointer(pointer)
      const clicked = hit.find((obj) => typeof (obj as Phaser.GameObjects.Image).getData === 'function' && (obj as Phaser.GameObjects.Image).getData('furnitureId'))
      const id = clicked ? ((clicked as Phaser.GameObjects.Image).getData('furnitureId') as string) : null
      if (id) scene.toggleFurnitureSelection(id)
      return
    }
    const ids = [...scene.furniture.values()]
      .filter(({ image }) => image.x >= x0 && image.x <= x1 && image.y >= y0 && image.y <= y1)
      .map(({ id }) => id)
    scene.setMultiSelection(ids)
  })
}
export function setEditorUiVisible(scene: OfficeScene, visible: boolean): void {
  scene.furniture.forEach(({ image }) => image.setAlpha(visible ? 0.88 : 1))
}
export function selectFurniture(scene: OfficeScene, id: string | null): void {
  if (!scene.layoutEditing && id) return
  scene.clearMultiSelection()
  scene.selectedFurniture = id ? scene.furniture.get(id) ?? null : null
  scene.selectionOutline?.destroy()
  scene.selectionOutline = undefined
  if (!id) {
    scene.notifyEditorState()
    return
  }
  if (!scene.selectedFurniture) {
    scene.notifyEditorState()
    return
  }
  const { image } = scene.selectedFurniture
  scene.bringFurnitureToFront(id)
  scene.saveFurnitureLayout()
  scene.selectionOutline = scene.add.rectangle(image.x, image.y, image.displayWidth + 6, image.displayHeight + 6)
    .setDepth(scene.editorOverlayDepth())
  scene.updateSelectionOutline()
  scene.notifyEditorState()
}
export function updateSelectionOutline(scene: OfficeScene): void {
  if (scene.selectedFurniture && scene.selectionOutline) {
    const image = scene.selectedFurniture.image
    const collides = scene.furniturePlacementCollides(
      scene.selectedFurniture.id, scene.selectedFurniture.frame, image, scene.furnitureRotation(image)
    )
    scene.selectionOutline
      .setPosition(image.x, image.y)
      .setSize(image.displayWidth + 6, image.displayHeight + 6)
      .setDepth(scene.editorOverlayDepth())
      .setStrokeStyle(3, collides ? 0xff4d4d : 0xffdd55)
  }
}
export function clearMultiSelection(scene: OfficeScene): void {
  scene.multiSelectOutlines.forEach((rect) => rect.destroy())
  scene.multiSelectOutlines.clear()
  scene.multiSelectedIds.clear()
}
export function addToMultiSelection(scene: OfficeScene, id: string): void {
  if (scene.multiSelectedIds.has(id)) return
  const view = scene.furniture.get(id)
  if (!view) return
  scene.multiSelectedIds.add(id)
  scene.bringFurnitureToFront(id)
  const outline = scene.add.rectangle(
    view.image.x, view.image.y, view.image.displayWidth + 6, view.image.displayHeight + 6
  ).setStrokeStyle(3, 0x6ea8fe).setDepth(scene.editorOverlayDepth())
  scene.multiSelectOutlines.set(id, outline)
}
export function removeFromMultiSelection(scene: OfficeScene, id: string): void {
  scene.multiSelectedIds.delete(id)
  scene.multiSelectOutlines.get(id)?.destroy()
  scene.multiSelectOutlines.delete(id)
}
export function setMultiSelection(scene: OfficeScene, ids: string[]): void {
  if (!scene.layoutEditing) return
  // A marquee selects a group simultaneously, preserving its internal order.
  const orderedIds = [...ids].sort((a, b) =>
    (scene.furniture.get(a)?.image.depth ?? 0) - (scene.furniture.get(b)?.image.depth ?? 0))
  // Also drops any active single-piece selection - only one selection mode
  // is active at a time.
  scene.selectFurniture(null)
  orderedIds.forEach((id) => scene.addToMultiSelection(id))
  if (orderedIds.length > 0) scene.saveFurnitureLayout()
  scene.notifyEditorState()
}
export function toggleFurnitureSelection(scene: OfficeScene, id: string): void {
  if (!scene.layoutEditing) return
  if (scene.selectedFurniture) {
    // Promote the existing single selection into the multi-select set
    // first, so shift+clicking a second piece builds up a selection
    // instead of discarding what was already picked.
    const previousId = scene.selectedFurniture.id
    scene.selectedFurniture = null
    scene.selectionOutline?.destroy()
    scene.selectionOutline = undefined
    if (previousId === id) {
      scene.notifyEditorState()
      return
    }
    scene.addToMultiSelection(previousId)
  }
  if (scene.multiSelectedIds.has(id)) {
    scene.removeFromMultiSelection(id)
  } else {
    scene.addToMultiSelection(id)
    scene.saveFurnitureLayout()
  }
  scene.notifyEditorState()
}
export function addFurnitureFromPalette(scene: OfficeScene, frame: number): void {
  if (!scene.layoutEditing) return
  pushUndo(scene)
  const id = `custom-${Date.now()}-${scene.nextFurnitureId++}`
  const point = scene.findFreeFurniturePoint(frame)
  const image = scene.addFurniture(id, frame, point.x, point.y, 64, 64)
  scene.bringFurnitureToFront(id)
  scene.layoutSave[id] = { x: image.x, y: image.y, frame, width: 64, height: 64 }
  scene.saveFurnitureLayout()
  scene.selectFurniture(id)
}
export async function deleteSelectedFurniture(scene: OfficeScene): Promise<void> {
  if (!scene.layoutEditing) return
  if (!scene.selectedFurniture && scene.multiSelectedIds.size === 0) return
  pushUndo(scene)
  if (scene.multiSelectedIds.size > 0) {
    // Snapshot the ids up front - deleting a desk also removes its paired
    // chair mid-loop, so a later id in this same batch may already be gone
    // by the time its turn comes (handled by the has() check below).
    for (const id of [...scene.multiSelectedIds]) {
      const view = scene.furniture.get(id)
      if (!view) continue
      await scene.deleteFurnitureView(view)
    }
    scene.clearMultiSelection()
    scene.saveFurnitureLayout()
    scene.notifyEditorState()
    return
  }
  if (!scene.selectedFurniture) return
  await scene.deleteFurnitureView(scene.selectedFurniture)
  scene.selectedFurniture = null
  scene.selectionOutline?.destroy()
  scene.selectionOutline = undefined
  scene.saveFurnitureLayout()
  scene.notifyEditorState()
}
export async function deleteFurnitureView(scene: OfficeScene, view: FurnitureView): Promise<void> {
  const { id, frame, image } = view

  if (frame === DESK_FURNITURE_FRAME) {
    const templateId = scene.teamTemplateIds[scene.deskZone(id, image)]
    const allowed = templateId ? await window.api.teamCapacity.canRemoveDesk(templateId) : true
    // The piece can be gone by the time the IPC round trip resolves (e.g.
    // already removed as another desk's paired chair in the same batch).
    if (!scene.furniture.has(id)) return
    if (!allowed) {
      scene.showEditorNotice('이미 실행 중인 세션이 있어 이 데스크는 뺄 수 없습니다.')
      return
    }
  }

  image.destroy()
  scene.furniture.delete(id)
  delete scene.layoutSave[id]
  scene.zOrderById.delete(id)
  scene.removeFromMultiSelection(id)
  // A team's "Team X" label rides along with its lead desk (see
  // ensureDeskPair) - without this it would be left behind as an orphaned
  // text object floating on the floor once that desk is gone.
  scene.teamLabels.get(id)?.destroy()
  scene.teamLabels.delete(id)
  if (!id.startsWith('custom-') || id === CONFERENCE_TABLE_ID) {
    scene.removedDeskIds.add(id)
    const paired = pairedFurnitureId(id)
    const pairedView = paired ? scene.furniture.get(paired) : undefined
    if (paired && pairedView) {
      pairedView.image.destroy()
      scene.furniture.delete(paired)
      delete scene.layoutSave[paired]
      scene.zOrderById.delete(paired)
      scene.removedDeskIds.add(paired)
      scene.removeFromMultiSelection(paired)
    }
    localStorage.setItem(OFFICE_REMOVED_DESKS_KEY, JSON.stringify([...scene.removedDeskIds]))
  }
}
export function rotateSelectedFurniture(scene: OfficeScene, delta: number): void {
  if (!scene.layoutEditing || !scene.selectedFurniture) return
  pushUndo(scene)
  const { id, image } = scene.selectedFurniture
  scene.bringFurnitureToFront(id)
  const nextAngle = Phaser.Math.Wrap(scene.furnitureRotation(image) + delta, 0, 360)
  const footprint = rotatedFootprint(scene.selectedFurniture.frame, nextAngle)
  const displaySize = furnitureDisplaySize(scene.selectedFurniture.frame, footprint.columns, footprint.rows)
  const snapped = snapFurniturePoint(image, footprint)
  image
    .setPosition(snapped.x, snapped.y)
    .setTexture(scene.directionalFurnitureTexture(scene.selectedFurniture.frame, nextAngle))
    .setDisplaySize(displaySize.width, displaySize.height)
    .setDepth(snapped.y + scene.furnitureDepthBonus(id))
    .setData('furnitureRotation', nextAngle)
  scene.updateSelectionOutline()
  scene.saveFurnitureLayout()
}
export function saveFurnitureLayout(scene: OfficeScene): void {
  scene.furniture.forEach(({ id, frame, image }) => {
    scene.layoutSave[id] = {
      x: Math.round(image.x), y: Math.round(image.y),
      rotation: scene.furnitureRotation(image),
      zOrder: scene.zOrderById.get(id),
      ...(id.startsWith('custom-') ? { frame, width: image.displayWidth, height: image.displayHeight } : {})
    }
  })
  localStorage.setItem(OFFICE_LAYOUT_SAVE_KEY, JSON.stringify(scene.layoutSave))
  scene.refreshNavigationLayout()
  scene.reportDeskCounts()
}
export function restoreCustomFurniture(scene: OfficeScene): void {
  Object.entries(scene.layoutSave).forEach(([id, saved]) => {
    if (scene.furniture.has(id) || scene.removedDeskIds.has(id)) return
    const frame = id.startsWith('custom-') ? saved.frame
      : /^desk-\d+-\d+$/.test(id) ? DESK_FURNITURE_FRAME : /^chair-\d+-\d+$/.test(id) ? 12 : undefined
    if (frame === undefined) return
    scene.addFurniture(id, frame, saved.x, saved.y, saved.width ?? 64, saved.height ?? 64)
  })
}
// "초기화" clears the interior entirely - floor/walls/elevator stay, every
// desk/chair and custom piece goes - rather than restoring the furnished
// defaults, matching the stripped-down office this is meant to reset to.
export function resetFurnitureLayout(scene: OfficeScene): void {
  if (!scene.layoutEditing) return
  if (!window.confirm('오피스의 모든 가구와 데스크를 지웁니다. (편집 중 Ctrl+Z로 되돌릴 수 있습니다) 계속할까요?')) return
  pushUndo(scene)
  scene.layoutSave = {}
  scene.zOrderById.clear()
  scene.nextZOrder = 1
  localStorage.removeItem(OFFICE_LAYOUT_SAVE_KEY)
  for (const [id, furniture] of scene.furniture) {
    furniture.image.destroy()
    scene.furniture.delete(id)
    if (!id.startsWith('custom-') || id === CONFERENCE_TABLE_ID) scene.removedDeskIds.add(id)
  }
  scene.teamLabels.forEach((label) => label.destroy())
  scene.teamLabels.clear()
  localStorage.setItem(OFFICE_REMOVED_DESKS_KEY, JSON.stringify([...scene.removedDeskIds]))
  scene.reportDeskCounts()
  scene.selectFurniture(null)
  scene.refreshNavigationLayout()
}
export function furnitureNavigationKey(scene: OfficeScene): string {
  return [...scene.furniture.values()].map(({ id, frame, image }) =>
    `${id}:${frame}:${image.x}:${image.y}:${image.displayWidth}:${image.displayHeight}:${scene.furnitureRotation(image)}`).join('|')
}
export function refreshNavigationLayout(scene: OfficeScene): void {
  scene.refreshFurnitureDepths()
  const key = scene.furnitureNavigationKey()
  if (key !== scene.navigationLayoutKey) {
    scene.navigationLayoutKey = key
    scene.navigationRevision += 1
  }
}
// Selection order is retained only for furniture sharing a floor position.
export function bringFurnitureToFront(scene: OfficeScene, id: string): void {
  const view = scene.furniture.get(id)
  if (!view) return
  scene.zOrderById.set(id, scene.nextZOrder++)
  scene.refreshFurnitureDepths()
  const overlayDepth = scene.editorOverlayDepth()
  scene.selectionOutline?.setDepth(overlayDepth)
  scene.multiSelectOutlines.forEach((outline) => outline.setDepth(overlayDepth))
  scene.marqueeRect?.setDepth(overlayDepth)
}
export function refreshFurnitureDepths(scene: OfficeScene): void {
  for (const { id, image } of scene.furniture.values()) {
    image.setDepth(image.y + scene.furnitureDepthBonus(id))
  }
  // The head chair tucks under the table's end, even when its center is
  // slightly south of the combined tabletop's center. Cover its seat and
  // the seated person's lap, while keeping the southern chairs in front.
  const headChair = scene.furniture.get(REPRESENTATIVE_MEETING_CHAIR_ID)
  if (headChair) {
    const chairBounds = scene.furnitureWalkCollision(headChair.image, 0)
    for (const { frame, image } of scene.furniture.values()) {
      if ((frame === 6 || frame === CONFERENCE_TABLE_FRAME) &&
        intersectsAabb(chairBounds, scene.furnitureWalkCollision(image, 0))) {
        image.setDepth(Math.max(image.depth, headChair.image.depth + 0.5))
      }
    }
  }
  // Coffee machines and laptops rest on the tabletop, even when their
  // centers are further north. This only changes drawing order: the coffee
  // machine remains a solid obstacle and an interactive pantry destination.
  for (const { frame, image } of scene.furniture.values()) {
    if (frame !== 0 && !STACKABLE_FURNITURE_FRAMES.has(frame)) continue
    const propBounds = scene.furnitureWalkCollision(image, 0)
    for (const support of scene.furniture.values()) {
      if (!TABLETOP_FURNITURE_FRAMES.has(support.frame)) continue
      const bounds = scene.furnitureWalkCollision(support.image, 0)
      if (intersectsAabb(propBounds, bounds)) {
        image.setDepth(Math.max(image.depth, support.image.depth + 0.25))
      }
    }
  }
  scene.refreshTeamLabels()
}
export function refreshTeamLabels(scene: OfficeScene): void {
  for (const [deskId, label] of scene.teamLabels) {
    const desk = scene.furniture.get(deskId)
    if (!desk || !isInStaffArea(desk.image)) {
      label.setVisible(false)
      continue
    }
    const chair = scene.furniture.get(pairedFurnitureId(deskId)!)
    const deskBounds = scene.furnitureWalkCollision(desk.image, 0)
    const chairBounds = chair && scene.furnitureWalkCollision(chair.image, 0)
    const bottom = Math.max(deskBounds.y + deskBounds.height,
      chairBounds ? chairBounds.y + chairBounds.height : 0)
    // Measure visible pixels, so transparent PNG padding does not push the
    // marker away. Keep it on the floor with a gap below wheels and shoes.
    label.setPosition(chair?.image.x ?? desk.image.x, bottom + 23).setVisible(true)
  }
}
export function editorState(scene: OfficeScene): EditorState {
  return {
    hasSelection: Boolean(scene.selectedFurniture) || scene.multiSelectedIds.size > 0,
    floor: scene.selectedFloor,
    canUndo: scene.undoStack.length > 0,
    canRedo: scene.redoStack.length > 0
  }
}
export function notifyEditorState(scene: OfficeScene): void {
  scene.editorStateHandler?.(scene.editorState())
}
/** Returns whether the transition was actually applied. Leaving edit mode
 *  is refused (scene stays in editing state) while any piece still
 *  collides - no more silently shoving overlapping furniture aside. */
export function setLayoutEditing(scene: OfficeScene, editing: boolean): boolean {
  if (!editing && scene.hasCollidingFurniture()) {
    scene.showEditorNotice('배치를 수정해주세요!')
    return false
  }
  scene.layoutEditing = editing
  scene.setEditorUiVisible(editing)
  if (editing) {
    scene.pantryHint?.setVisible(false)
    scene.hideRepresentativeSpeech()
    if (scene.representativePantryTarget) {
      scene.stopRepresentativePantryAction()
      scene.stopRepresentativeMovement()
    }
    scene.standRepresentative()
    scene.representativeSprite?.anims.pause()
  } else if (scene.representativeSprite) {
    scene.standRepresentative()
    if (!scene.representativeSeat) scene.repairRepresentativePosition()
    if (scene.representativeGoal) scene.planRepresentativeRoute()
    scene.updateRepresentativeDepth()
  }
  scene.actors.forEach((view) => {
    if (editing) {
      view.sprite.anims.pause()
    } else {
      scene.updateActor(view, scene.effectiveActor(view), view.actorIndex)
      scene.updateActorDepth(view)
    }
  })
  if (!editing) scene.selectFurniture(null)
  return true
}
export function isLayoutEditing(scene: OfficeScene): boolean {
  return scene.layoutEditing
}
export function setFloorTexture(scene: OfficeScene, texture: FloorTexture): void {
  if (!scene.layoutEditing) return
  scene.selectedFloor = texture
  scene.floorLayers.forEach((layer) => layer.setTexture(texture))
  localStorage.setItem(OFFICE_FLOOR_SAVE_KEY, texture)
  scene.notifyEditorState()
}
