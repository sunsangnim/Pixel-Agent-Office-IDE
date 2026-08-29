import Phaser from 'phaser'
import row1 from '../assets/pixel-office/characters/corporate-roster-row-1-v1.png'
import row2 from '../assets/pixel-office/characters/corporate-roster-row-2-v1.png'
import row3 from '../assets/pixel-office/characters/corporate-roster-row-3-v1.png'
import row4 from '../assets/pixel-office/characters/corporate-roster-row-4-v1.png'
import ceoAnimationSheet from '../assets/pixel-office/characters/ceo-animation-sheet-v2.png'
import codexTeamAnimationAtlas from '../assets/pixel-office/characters/codex-team-animation-atlas-v1.png'
import antigravityTeamAnimationAtlas from '../assets/pixel-office/characters/antigravity-team-animation-atlas-v1.png'
import rosterRow4AnimationAtlas from '../assets/pixel-office/characters/roster-row-4-animation-atlas-v1.png'
import claudeTeamAnimationAtlas from '../assets/pixel-office/characters/claude-team-animation-atlas-v1.png'
import coffeeMachineAsset from '../assets/pixel-office/furniture/coffee-machine-v2.png'
import refrigeratorAsset from '../assets/pixel-office/furniture/refrigerator-v2.png'
import pantryCabinetAsset from '../assets/pixel-office/furniture/pantry-cabinet-v1.png'
import presentationScreenAsset from '../assets/pixel-office/furniture/presentation-screen-v1.png'
import longTableAsset from '../assets/pixel-office/furniture/long-table-v1.png'
import laptopAsset from '../assets/pixel-office/furniture/laptop-v1.png'
import workstationDeskAsset from '../assets/pixel-office/furniture/workstation-desk-v1.png'
import officeChairAsset from '../assets/pixel-office/furniture/office-chair-v2.png'
import officePlantAsset from '../assets/pixel-office/furniture/office-plant-v1.png'
import sideTableAsset from '../assets/pixel-office/furniture/side-table-v2.png'
import officeSofaAsset from '../assets/pixel-office/furniture/office-sofa-v1.png'
import floorLampAsset from '../assets/pixel-office/furniture/floor-lamp-v1.png'
import bookcaseAsset from '../assets/pixel-office/furniture/bookcase-v2.png'
import mintFloorAsset from '../assets/pixel-office/floors/mint-tile-v1.png'
import oakFloorAsset from '../assets/pixel-office/floors/oak-parquet-v1.png'
import stoneFloorAsset from '../assets/pixel-office/floors/blue-stone-v1.png'
import carpetFloorAsset from '../assets/pixel-office/floors/teal-carpet-v1.png'
import officeCarpetFloorAsset from '../assets/pixel-office/floors/office-carpet-tile-v1.png'
import plainGrayFloorAsset from '../assets/pixel-office/floors/plain-gray-floor-v2.png'
import wallHorizontalAsset from '../assets/pixel-office/architecture/wall-horizontal-v1.png'
import wallVerticalAsset from '../assets/pixel-office/architecture/wall-vertical-v1.png'
import wallSurfaceAsset from '../assets/pixel-office/architecture/wall-surface-v1.png'
import glassWallHorizontalAsset from '../assets/pixel-office/architecture/glass-wall-horizontal-v1.png'
import glassWallVerticalAsset from '../assets/pixel-office/architecture/glass-wall-vertical-v1.png'
import {
  MEETING_SEATS,
  OFFICE_WORLD_HEIGHT,
  OFFICE_WORLD_WIDTH,
  TEAM_DESKS,
  WAYPOINTS,
  routeFor,
  teamIndexForX,
  type OfficeGameActor,
  type OfficeWorldSnapshot,
  type WorldPoint
} from './officeWorld'
import { findOfficePath } from './navigation'
import {
  collisionFootprint, furnitureCollision, OFFICE_FLOOR_REGION, OFFICE_WALL_COLLISIONS, rotatedFootprint, snapFurniturePoint
} from './officeGrid'
import { intersectsAabb, pushApart, resolveAxisSeparated, type CollisionRect } from './collisionResolution'
import {
  DEFAULT_LAYOUT_SEED,
  OFFICE_LAYOUT_SAVE_KEY,
  OFFICE_REMOVED_DESKS_KEY,
  parseOfficeLayout,
  parseRemovedIds,
  type OfficeLayoutSave,
  type SavedFurniture
} from './layoutPersistence'
import { ActorStateMachine } from './actorStateMachine'
import { OFFICE_WORLD_SAVE_KEY, parseOfficeWorldSave, upsertSavedActor, type OfficeWorldSave } from './worldPersistence'

interface ActorView {
  container: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Sprite
  bubble: Phaser.GameObjects.Text
  routeKey: string
  actionTween?: Phaser.Tweens.Tween
  prop: Phaser.GameObjects.Rectangle
  stateMachine: ActorStateMachine
  route: WorldPoint[]
  routeIndex: number
  actor: OfficeGameActor
}

interface FurnitureView {
  id: string
  frame: number
  image: Phaser.GameObjects.Image
  defaultPoint: WorldPoint
}

interface DoorView {
  left: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image
  right: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image
  isOpen: boolean
}

export const OFFICE_SCENE_KEY = 'office-scene'
export const OFFICE_ACTOR_SELECT_EVENT = 'office:actor-select'

const FURNITURE_TEXTURES: Record<number, string> = {
  0: 'furniture-coffee-machine', 1: 'furniture-refrigerator', 2: 'furniture-pantry-cabinet',
  5: 'furniture-presentation-screen', 6: 'furniture-long-table', 7: 'furniture-laptop', 10: 'furniture-workstation-desk',
  12: 'furniture-office-chair', 13: 'furniture-office-chair', 14: 'furniture-office-chair',
  15: 'furniture-office-plant', 16: 'furniture-side-table', 17: 'furniture-office-sofa',
  18: 'furniture-floor-lamp', 19: 'furniture-bookcase'
}
const FURNITURE_ASSET_NAMES: Record<number, string> = {
  0: 'coffee-machine', 1: 'refrigerator', 2: 'pantry-cabinet', 5: 'presentation-screen',
  6: 'long-table', 7: 'laptop', 10: 'workstation-desk', 12: 'office-chair', 13: 'office-chair',
  14: 'office-chair', 15: 'office-plant', 16: 'side-table', 17: 'office-sofa',
  18: 'floor-lamp', 19: 'bookcase'
}
const FURNITURE_DIRECTIONS = ['front', 'right', 'back', 'left'] as const
const STACKABLE_FURNITURE_FRAMES = new Set([7])
const DESK_FURNITURE_FRAME = 10
const DESK_ASSET_SCALE = 0.75
type FurnitureDirection = typeof FURNITURE_DIRECTIONS[number]
const directionalFurnitureAssets = import.meta.glob('../assets/pixel-office/furniture/directional/*.png', {
  eager: true, query: '?url', import: 'default'
}) as Record<string, string>
const FLOOR_TEXTURES = ['floor-mint', 'floor-oak', 'floor-stone', 'floor-carpet', 'floor-office-carpet', 'floor-plain-gray'] as const
export type FloorTexture = typeof FLOOR_TEXTURES[number]
const DEFAULT_FLOOR_TEXTURE: FloorTexture = 'floor-plain-gray'

// Consumed by LayoutEditorPanel (React) to render the same palette/floor
// picker that used to be drawn as Phaser objects inside the scene itself.
export const PALETTE_ITEMS: Array<{ frame: number; label: string; asset: string }> = [
  { frame: 0, label: '커피머신', asset: coffeeMachineAsset },
  { frame: 1, label: '냉장고', asset: refrigeratorAsset },
  { frame: 2, label: '탕비장', asset: pantryCabinetAsset },
  { frame: 5, label: '스크린', asset: presentationScreenAsset },
  { frame: 6, label: '긴 테이블', asset: longTableAsset },
  { frame: 7, label: '노트북', asset: laptopAsset },
  { frame: 10, label: '책상', asset: workstationDeskAsset },
  { frame: 12, label: '의자', asset: officeChairAsset },
  { frame: 15, label: '화분', asset: officePlantAsset },
  { frame: 16, label: '사이드테이블', asset: sideTableAsset },
  { frame: 17, label: '소파', asset: officeSofaAsset },
  { frame: 18, label: '스탠드조명', asset: floorLampAsset },
  { frame: 19, label: '책장', asset: bookcaseAsset }
]

export const FLOOR_ITEMS: Array<{ texture: FloorTexture; label: string; asset: string }> = [
  { texture: 'floor-mint', label: '민트', asset: mintFloorAsset },
  { texture: 'floor-oak', label: '오크', asset: oakFloorAsset },
  { texture: 'floor-stone', label: '블루스톤', asset: stoneFloorAsset },
  { texture: 'floor-carpet', label: '틸 카펫', asset: carpetFloorAsset },
  { texture: 'floor-office-carpet', label: '오피스 카펫', asset: officeCarpetFloorAsset },
  { texture: 'floor-plain-gray', label: '그레이', asset: plainGrayFloorAsset }
]

export interface EditorState {
  hasSelection: boolean
  floor: FloorTexture
}
const OFFICE_FLOOR_SAVE_KEY = 'pixel-office-floor-v4'
// The CEO sprite's drawn art isn't centered within its animation-sheet cell
// (measured: opaque-pixel bbox center sits ~26px right of the cell's own
// center, at the sheet's native 202x161 frame size) - scaled to the sprite's
// 104px display width, that's this many world-space px, so the nameplate
// text lines up with the actual character instead of the empty cell center.
const CEO_SPRITE_ART_X_OFFSET = 13
const ACTOR_SCALE = 2
const ACTOR_COLLISION_RADIUS = 11 * ACTOR_SCALE
const ACTOR_COLLISION_HALF_WIDTH = 7 * ACTOR_SCALE
const ACTOR_COLLISION_HALF_HEIGHT = 5 * ACTOR_SCALE
// Same size as the CEO sprite (createRepresentativeActor) so every
// character in the office reads at a consistent scale, animated or not.
const ACTOR_SPRITE_WIDTH = 104
const ACTOR_SPRITE_HEIGHT = 120
const ACTOR_SPRITE_WORKING_HEIGHT = 104
const ACTOR_SPRITE_SITTING_HEIGHT = 112
const ACTOR_SPRITE_Y_OFFSET = -64

function furnitureDisplaySize(frame: number, columns: number, rows: number): { width: number; height: number } {
  const scale = frame === DESK_FURNITURE_FRAME ? DESK_ASSET_SCALE : 1
  return { width: columns * 16 * scale, height: rows * 16 * scale }
}

// A desk/chair pair is meant to sit close together (the chair tucks under
// the desk), so they should never push each other away as a "collision".
function pairedFurnitureId(id: string): string | null {
  const deskMatch = /^desk-(\d+-\d+)$/.exec(id)
  if (deskMatch) return `chair-${deskMatch[1]}`
  const chairMatch = /^chair-(\d+-\d+)$/.exec(id)
  if (chairMatch) return `desk-${chairMatch[1]}`
  return null
}

export class OfficeScene extends Phaser.Scene {
  private actors = new Map<string, ActorView>()
  private snapshot: OfficeWorldSnapshot | null = null
  private pendingSnapshot: OfficeWorldSnapshot | null = null
  private doors = new Map<string, DoorView>()
  private worldSave: OfficeWorldSave = { version: 1, actors: [] }
  private actorSelectHandler: ((profileId: string) => void) | null = null
  private furniture = new Map<string, FurnitureView>()
  private layoutSave: OfficeLayoutSave = {}
  private removedDeskIds = new Set<string>()
  private deskCountsHandler: ((counts: number[]) => void) | null = null
  private teamTemplateIds: string[] = []
  private editorStateHandler: ((state: EditorState) => void) | null = null
  private layoutEditing = false
  private selectedFurniture: FurnitureView | null = null
  private selectionOutline?: Phaser.GameObjects.Rectangle
  // Shift+drag rectangle select - a separate set from the single-piece
  // selection above so bulk delete works without disturbing the normal
  // click/drag/rotate flow for a single piece.
  private multiSelectedIds = new Set<string>()
  private multiSelectOutlines = new Map<string, Phaser.GameObjects.Rectangle>()
  private marqueeRect?: Phaser.GameObjects.Rectangle
  private marqueeStart: WorldPoint | null = null
  // While dragging one piece of an active multi-selection, each other
  // selected piece's fixed offset from the dragged (leader) piece.
  private groupDragOffsets = new Map<string, WorldPoint>()
  private nextFurnitureId = 1
  // Team-lead nameplates (desk-T-0 only) - fixed floor zone markers, not
  // tied to the desk's live position (see ensureDeskPair); tracked here only
  // so a deleted desk's label gets cleaned up with it.
  private teamLabels = new Map<string, Phaser.GameObjects.Text>()
  private representativeSprite?: Phaser.GameObjects.Sprite
  private representativeLabel?: Phaser.GameObjects.Text
  // Persisted (not just in-memory) so whichever piece was placed/edited most
  // recently keeps rendering on top of anything it overlaps even after a
  // reload, instead of only for the rest of the current session.
  private zOrderById = new Map<string, number>()
  private nextZOrder = 1
  private floorLayers: Phaser.GameObjects.TileSprite[] = []
  private selectedFloor = DEFAULT_FLOOR_TEXTURE

  constructor() {
    super(OFFICE_SCENE_KEY)
  }

  setActorSelectHandler(handler: ((profileId: string) => void) | null): void {
    this.actorSelectHandler = handler
  }

  /** Reports live desk-per-zone counts (indexed by team column 0/1/2) so the
   *  caller can push them to the main process as each team's seat capacity. */
  setDeskCountsHandler(handler: ((counts: number[]) => void) | null): void {
    this.deskCountsHandler = handler
    if (handler && this.sys?.isActive()) handler(this.computeDeskCounts())
  }

  /** templateId for each team column (0/1/2), needed to validate desk removal
   *  against that team's currently running session count. */
  setTeamTemplateIds(ids: string[]): void {
    this.teamTemplateIds = ids
  }

  /** Drives LayoutEditorPanel (React): current selection/floor, so it can
   *  enable the "선택 삭제" button and highlight the active floor swatch. */
  setEditorStateHandler(handler: ((state: EditorState) => void) | null): void {
    this.editorStateHandler = handler
    if (handler && this.sys?.isActive()) handler(this.editorState())
  }

  private editorState(): EditorState {
    return {
      hasSelection: Boolean(this.selectedFurniture) || this.multiSelectedIds.size > 0,
      floor: this.selectedFloor
    }
  }

  private notifyEditorState(): void {
    this.editorStateHandler?.(this.editorState())
  }

  /** Returns whether the transition was actually applied. Leaving edit mode
   *  is refused (scene stays in editing state) while any piece still
   *  collides - no more silently shoving overlapping furniture aside. */
  setLayoutEditing(editing: boolean): boolean {
    if (!editing && this.hasCollidingFurniture()) {
      this.showEditorNotice('배치를 수정해주세요!')
      return false
    }
    this.layoutEditing = editing
    this.setEditorUiVisible(editing)
    if (!editing) this.selectFurniture(null)
    return true
  }

  isLayoutEditing(): boolean {
    return this.layoutEditing
  }

  preload(): void {
    ;[row1, row2, row3, row4].forEach((url, index) => this.load.image(`roster-row-${index}`, url))
    this.load.image('ceo-animation-sheet', ceoAnimationSheet)
    this.load.image('codex-team-animation-atlas', codexTeamAnimationAtlas)
    this.load.image('antigravity-team-animation-atlas', antigravityTeamAnimationAtlas)
    this.load.image('roster-row-4-animation-atlas', rosterRow4AnimationAtlas)
    this.load.image('claude-team-animation-atlas', claudeTeamAnimationAtlas)
    const furnitureAssets: Array<[string, string]> = [
      ['furniture-coffee-machine', coffeeMachineAsset], ['furniture-refrigerator', refrigeratorAsset],
      ['furniture-pantry-cabinet', pantryCabinetAsset], ['furniture-presentation-screen', presentationScreenAsset],
      ['furniture-long-table', longTableAsset], ['furniture-laptop', laptopAsset],
      ['furniture-workstation-desk', workstationDeskAsset],
      ['furniture-office-chair', officeChairAsset], ['furniture-office-plant', officePlantAsset],
      ['furniture-side-table', sideTableAsset], ['furniture-office-sofa', officeSofaAsset],
      ['furniture-floor-lamp', floorLampAsset], ['furniture-bookcase', bookcaseAsset]
    ]
    furnitureAssets.forEach(([key, url]) => this.load.image(key, url))
    Object.entries(directionalFurnitureAssets).forEach(([path, url]) => {
      const fileName = path.split('/').pop()?.replace(/-v1\.png$/, '')
      if (fileName) this.load.image(`furniture-directional-${fileName}`, url)
    })
    this.load.image('floor-mint', mintFloorAsset)
    this.load.image('floor-oak', oakFloorAsset)
    this.load.image('floor-stone', stoneFloorAsset)
    this.load.image('floor-carpet', carpetFloorAsset)
    this.load.image('floor-office-carpet', officeCarpetFloorAsset)
    this.load.image('floor-plain-gray', plainGrayFloorAsset)
    this.load.image('architecture-wall-horizontal', wallHorizontalAsset)
    this.load.image('architecture-wall-vertical', wallVerticalAsset)
    this.load.image('architecture-wall-surface', wallSurfaceAsset)
    this.load.image('architecture-glass-wall-horizontal', glassWallHorizontalAsset)
    this.load.image('architecture-glass-wall-vertical', glassWallVerticalAsset)
  }

  create(): void {
    this.worldSave = parseOfficeWorldSave(localStorage.getItem(OFFICE_WORLD_SAVE_KEY))
    // The seed only fills in ids the saved layout has no opinion on, so any
    // further edit the user makes always wins and persists exactly as before.
    this.layoutSave = { ...DEFAULT_LAYOUT_SEED, ...parseOfficeLayout(localStorage.getItem(OFFICE_LAYOUT_SAVE_KEY)) }
    this.removedDeskIds = parseRemovedIds(localStorage.getItem(OFFICE_REMOVED_DESKS_KEY))
    this.zOrderById = new Map(
      Object.entries(this.layoutSave)
        .filter((entry): entry is [string, SavedFurniture & { zOrder: number }] => typeof entry[1].zOrder === 'number')
        .map(([id, saved]) => [id, saved.zOrder])
    )
    this.nextZOrder = 1 + Math.max(0, ...Array.from(this.zOrderById.values()))
    const savedFloor = localStorage.getItem(OFFICE_FLOOR_SAVE_KEY)
    this.selectedFloor = FLOOR_TEXTURES.includes(savedFloor as typeof FLOOR_TEXTURES[number])
      ? savedFloor as typeof FLOOR_TEXTURES[number]
      : DEFAULT_FLOOR_TEXTURE
    this.cameras.main.setBackgroundColor('#17221f')
    this.createWorld()
    this.createLayoutEditor()
    this.createRosterFrames()
    this.createTeamAnimations()
    this.createCeoAnimations()
    this.createRepresentativeActor()
    if (this.pendingSnapshot) this.applySnapshot(this.pendingSnapshot)
    this.reportDeskCounts()
  }

  update(_time: number, delta: number): void {
    this.updateActorMovement(Math.min(delta, 50) / 1000)
    this.resolveActorOverlaps()
    // Keep the nameplate centered above the CEO sprite's head, whatever
    // moves it - it's static today, but this doesn't assume that.
    if (this.representativeSprite && this.representativeLabel) {
      this.representativeLabel.setPosition(
        this.representativeSprite.x + CEO_SPRITE_ART_X_OFFSET, this.representativeSprite.y - 63
      )
    }
  }

  updateSnapshot(snapshot: OfficeWorldSnapshot): void {
    if (!this.sys || !this.sys.isActive()) {
      this.pendingSnapshot = snapshot
      return
    }
    this.applySnapshot(snapshot)
  }

  private createWorld(): void {
    this.add.rectangle(
      OFFICE_WORLD_WIDTH / 2, OFFICE_WORLD_HEIGHT / 2, OFFICE_WORLD_WIDTH, OFFICE_WORLD_HEIGHT, 0x18352e
    ).setDepth(0)
    this.createFloorLayers()
    this.createHardcodedArchitecture()

    this.createRoom(8, 8, 280, 205, '탕비실')
    this.createRoom(296, 8, 370, 205, '회의실')
    this.createRoom(674, 8, 278, 205, '출입구')
    this.createRoom(709, 645, 243, 227, '대표실')

    // Pantry/meeting/representative-room decoration stays stripped per
    // request. Desks are back: capacity is now driven by how many are
    // actually placed in each team's zone, so they have to exist to count.
    // this.createPantry()
    // this.createMeetingRoom()
    this.createEntrance()
    // this.createRepresentativeRoom()
    this.createDesks()
    this.restoreCustomFurniture()
  }

  private addFurniture(id: string, frame: number, x: number, y: number, _width: number, _height: number): Phaser.GameObjects.Image {
    const saved = this.layoutSave[id]
    const angle = saved?.rotation ?? 0
    const requested = snapFurniturePoint({ x: saved?.x ?? x, y: saved?.y ?? y }, rotatedFootprint(frame, angle))
    const fallback = snapFurniturePoint({ x, y }, rotatedFootprint(frame, angle))
    const initial = this.furniturePlacementCollides(id, frame, requested, angle)
      ? (this.furniturePlacementCollides(id, frame, fallback, angle) ? this.findFreeFurniturePoint(frame, angle, { x, y }) : fallback)
      : requested
    const initialFootprint = rotatedFootprint(frame, angle)
    const initialDisplaySize = furnitureDisplaySize(frame, initialFootprint.columns, initialFootprint.rows)
    // No per-type bias (a desk isn't hardcoded behind a chair, a table isn't
    // hardcoded behind a laptop) - stacking is purely "whatever was placed or
    // edited most recently is on top". A piece with no prior zOrder (first
    // time it's ever been created) gets the next one now, so creation order
    // alone still gives a sane default (e.g. a chair created right after its
    // desk in ensureDeskPair naturally ends up in front of it).
    if (!this.zOrderById.has(id)) this.zOrderById.set(id, this.nextZOrder++)
    const image = this.add.image(initial.x, initial.y, this.directionalFurnitureTexture(frame, angle))
      .setDisplaySize(initialDisplaySize.width, initialDisplaySize.height)
      .setDepth(initial.y + this.furnitureDepthBonus(id))
      // Pixel-perfect hit testing: without it, overlapping pieces (e.g. a
      // desk and its chair) hit-test as solid rectangles, so whichever one
      // currently renders on top steals clicks even over the other's fully
      // visible, opaque pixels - you'd select the chair while aiming at the
      // desk's monitor. This makes clicks land on whatever is actually drawn
      // at that pixel.
      .setInteractive({ useHandCursor: true, draggable: true, pixelPerfect: true })
    image.setData({ furnitureId: id, furnitureFrame: frame, furnitureRotation: angle })
    this.input.setDraggable(image)
    image.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.layoutEditing && pointer.rightButtonDown()) {
        // Right-click only rotates a piece that is already selected; it must
        // not also select whatever was right-clicked in the same click.
        if (this.selectedFurniture?.id === id) this.rotateSelectedFurniture(90)
        return
      }
      // Shift+click/drag is claimed by the scene-level marquee-select
      // handlers below (createLayoutEditor) - toggle-select on click,
      // rectangle-select on drag - so it must not also single-select here.
      if (this.layoutEditing && pointer.event.shiftKey) return
      // Clicking (to start a drag) on a piece that's already part of an
      // active multi-selection must NOT collapse it down to just this one -
      // otherwise dragging any multi-selected piece would silently drop the
      // rest of the group right before the drag even starts.
      if (this.layoutEditing && this.multiSelectedIds.has(id) && this.multiSelectedIds.size > 1) return
      this.selectFurniture(id)
    })
    image.on('dragstart', () => {
      // draggable was set unconditionally above (so drag works the instant
      // edit mode turns on, no re-binding needed) - but that also means a
      // plain click outside edit mode fires a dragstart Phaser considers a
      // (zero-distance) drag. Without this guard, that alone bumped the
      // clicked piece to the front even though drag/dragend both already
      // refuse to run outside edit mode - the exact z-order-on-click bug
      // this was supposed to have stayed fixed.
      if (!this.layoutEditing) return
      image.setData({ dragStartX: image.x, dragStartY: image.y })
      // Bring the piece being moved to the front immediately, before it's
      // even dropped, so it's never hidden behind whatever it's dragged over.
      this.bringFurnitureToFront(id)
      image.setDepth(image.y + this.furnitureDepthBonus(id))
      this.groupDragOffsets.clear()
      if (this.multiSelectedIds.has(id) && this.multiSelectedIds.size > 1) {
        this.multiSelectedIds.forEach((otherId) => {
          if (otherId === id) return
          const otherView = this.furniture.get(otherId)
          if (otherView) this.groupDragOffsets.set(otherId, { x: otherView.image.x - image.x, y: otherView.image.y - image.y })
        })
      }
    })
    image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (!this.layoutEditing) return
      const rotation = this.furnitureRotation(image)
      const footprint = rotatedFootprint(frame, rotation)
      const snapped = snapFurniturePoint({
        x: Phaser.Math.Clamp(dragX, footprint.columns * 8, OFFICE_WORLD_WIDTH - footprint.columns * 8),
        y: Phaser.Math.Clamp(dragY, footprint.rows * 8, OFFICE_WORLD_HEIGHT - footprint.rows * 8)
      }, footprint)
      image.setPosition(snapped.x, snapped.y).setDepth(snapped.y + this.furnitureDepthBonus(id))
      this.updateSelectionOutline()
      // Carry the rest of the multi-selected group along by the same delta -
      // each piece keeps its own offset from the dragged (leader) piece, and
      // is independently clamped to the world bounds. The "Team X" label is
      // a fixed floor marker, not tied to any one desk's position, so it is
      // deliberately left alone here even if its desk is part of the drag.
      this.groupDragOffsets.forEach((offset, otherId) => {
        const otherView = this.furniture.get(otherId)
        if (!otherView) return
        const otherImage = otherView.image
        const otherFootprint = rotatedFootprint(otherView.frame, this.furnitureRotation(otherImage))
        const nx = Phaser.Math.Clamp(snapped.x + offset.x, otherFootprint.columns * 8, OFFICE_WORLD_WIDTH - otherFootprint.columns * 8)
        const ny = Phaser.Math.Clamp(snapped.y + offset.y, otherFootprint.rows * 8, OFFICE_WORLD_HEIGHT - otherFootprint.rows * 8)
        otherImage.setPosition(nx, ny).setDepth(ny + this.furnitureDepthBonus(otherId))
        this.multiSelectOutlines.get(otherId)?.setPosition(nx, ny)
      })
    })
    image.on('dragend', () => {
      if (!this.layoutEditing) return
      const snapped = snapFurniturePoint({ x: image.x, y: image.y }, rotatedFootprint(frame, this.furnitureRotation(image)))
      image.setPosition(snapped.x, snapped.y)
      image.setDepth(image.y + this.furnitureDepthBonus(id))
      this.updateSelectionOutline()
      this.groupDragOffsets.forEach((_offset, otherId) => {
        const otherView = this.furniture.get(otherId)
        if (!otherView) return
        const otherImage = otherView.image
        const otherSnapped = snapFurniturePoint(
          { x: otherImage.x, y: otherImage.y }, rotatedFootprint(otherView.frame, this.furnitureRotation(otherImage))
        )
        otherImage.setPosition(otherSnapped.x, otherSnapped.y).setDepth(otherSnapped.y + this.furnitureDepthBonus(otherId))
        this.multiSelectOutlines.get(otherId)?.setPosition(otherSnapped.x, otherSnapped.y)
      })
      this.groupDragOffsets.clear()
      this.saveFurnitureLayout()
    })
    this.furniture.set(id, { id, frame, image, defaultPoint: { x, y } })
    return image
  }

  // The palette/floor-picker/remove-buttons used to render as Phaser objects
  // overlapping the bottom of the office scene itself. They now live in
  // LayoutEditorPanel (React, below the canvas) and drive this scene through
  // the public editor methods + setEditorStateHandler below - this only
  // wires the one interaction that has to stay at the Phaser/input level.
  private createLayoutEditor(): void {
    this.input.mouse?.disableContextMenu()
    this.input.keyboard?.on('keydown-DELETE', () => this.deleteSelectedFurniture())
    this.createMarqueeSelect()
  }

  // Shift + drag draws a rectangle and multi-selects every piece whose
  // anchor point falls inside it (for bulk "선택 삭제"); a shift+click with
  // no real drag instead toggles just the one piece under the pointer, so
  // shift can build up a selection one click at a time too.
  private createMarqueeSelect(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.layoutEditing || !pointer.event.shiftKey || pointer.rightButtonDown()) return
      this.marqueeStart = { x: pointer.worldX, y: pointer.worldY }
      this.marqueeRect?.destroy()
      this.marqueeRect = this.add.rectangle(pointer.worldX, pointer.worldY, 1, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x6ea8fe)
        .setFillStyle(0x6ea8fe, 0.12)
        .setDepth(2500)
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.marqueeStart || !this.marqueeRect) return
      const x0 = Math.min(this.marqueeStart.x, pointer.worldX)
      const y0 = Math.min(this.marqueeStart.y, pointer.worldY)
      const width = Math.abs(pointer.worldX - this.marqueeStart.x)
      const height = Math.abs(pointer.worldY - this.marqueeStart.y)
      this.marqueeRect.setPosition(x0, y0).setSize(width, height)
    })
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.marqueeStart) return
      const start = this.marqueeStart
      this.marqueeStart = null
      this.marqueeRect?.destroy()
      this.marqueeRect = undefined

      const x0 = Math.min(start.x, pointer.worldX)
      const y0 = Math.min(start.y, pointer.worldY)
      const x1 = Math.max(start.x, pointer.worldX)
      const y1 = Math.max(start.y, pointer.worldY)
      if (x1 - x0 < 4 && y1 - y0 < 4) {
        // Barely moved - treat it as a shift+click toggle on whatever
        // furniture (if any) is directly under the pointer.
        const hit = this.input.hitTestPointer(pointer)
        const clicked = hit.find((obj) => typeof (obj as Phaser.GameObjects.Image).getData === 'function' && (obj as Phaser.GameObjects.Image).getData('furnitureId'))
        const id = clicked ? ((clicked as Phaser.GameObjects.Image).getData('furnitureId') as string) : null
        if (id) this.toggleFurnitureSelection(id)
        return
      }
      const ids = [...this.furniture.values()]
        .filter(({ image }) => image.x >= x0 && image.x <= x1 && image.y >= y0 && image.y <= y1)
        .map(({ id }) => id)
      this.setMultiSelection(ids)
    })
  }

  private createFloorLayers(): void {
    const region = OFFICE_FLOOR_REGION
    this.floorLayers = [
      this.add.tileSprite(region.x, region.y, region.width, region.height, this.selectedFloor)
        .setTileScale(0.75)
        .setDepth(1)
    ]
  }

  private createHardcodedArchitecture(): void {
    // The north-facing room backs are part of the opaque exterior shell. One
    // continuous strip spans the full interior width so there is no seam at
    // the 탕비실/회의실/출입구 boundaries (previously three separate tiles
    // left visible gaps where the vertical dividers meet the top wall).
    // Extended up to y=0 (was y=26) so it's flush with the top edge of the
    // world instead of leaving a sliver of bare floor tile visible above it.
    this.add.tileSprite(480, 45, OFFICE_WORLD_WIDTH, 90, 'architecture-wall-surface').setDepth(12)
    OFFICE_WALL_COLLISIONS.forEach((wall) => {
      const horizontal = wall.width >= wall.height
      const perimeter = wall.x === 0 || wall.y === 0 ||
        wall.x + wall.width === OFFICE_WORLD_WIDTH || wall.y + wall.height === OFFICE_WORLD_HEIGHT
      const texture = perimeter
        ? (horizontal ? 'architecture-wall-horizontal' : 'architecture-wall-vertical')
        : (horizontal ? 'architecture-glass-wall-horizontal' : 'architecture-glass-wall-vertical')
      this.add.tileSprite(
        wall.x, wall.y, wall.width, wall.height, texture
      ).setOrigin(0).setDepth(20)
    })
  }

  setFloorTexture(texture: FloorTexture): void {
    if (!this.layoutEditing) return
    this.selectedFloor = texture
    this.floorLayers.forEach((layer) => layer.setTexture(texture))
    localStorage.setItem(OFFICE_FLOOR_SAVE_KEY, texture)
    this.notifyEditorState()
  }

  private setEditorUiVisible(visible: boolean): void {
    this.furniture.forEach(({ image }) => image.setAlpha(visible ? 0.88 : 1))
  }

  private selectFurniture(id: string | null): void {
    if (!this.layoutEditing && id) return
    this.clearMultiSelection()
    this.selectedFurniture = id ? this.furniture.get(id) ?? null : null
    this.selectionOutline?.destroy()
    this.selectionOutline = undefined
    if (!id) {
      this.notifyEditorState()
      return
    }
    // Selecting (clicking) a piece is just inspection - it must NOT bump the
    // z-order on its own, or clicking something to look at/delete it quietly
    // reorders it in front of whatever it overlaps. Only an actual
    // reposition (dragstart), rotation, or new placement calls
    // bringFurnitureToFront.
    if (!this.selectedFurniture) {
      this.notifyEditorState()
      return
    }
    const { image } = this.selectedFurniture
    image.setDepth(image.y + this.furnitureDepthBonus(id))
    this.selectionOutline = this.add.rectangle(image.x, image.y, image.displayWidth + 6, image.displayHeight + 6)
      .setDepth(1990)
    this.updateSelectionOutline()
    this.notifyEditorState()
  }

  private updateSelectionOutline(): void {
    if (this.selectedFurniture && this.selectionOutline) {
      const image = this.selectedFurniture.image
      const collides = this.furniturePlacementCollides(
        this.selectedFurniture.id, this.selectedFurniture.frame, image, this.furnitureRotation(image)
      )
      this.selectionOutline
        .setPosition(image.x, image.y)
        .setSize(image.displayWidth + 6, image.displayHeight + 6)
        .setStrokeStyle(3, collides ? 0xff4d4d : 0xffdd55)
    }
  }

  private clearMultiSelection(): void {
    this.multiSelectOutlines.forEach((rect) => rect.destroy())
    this.multiSelectOutlines.clear()
    this.multiSelectedIds.clear()
  }

  private addToMultiSelection(id: string): void {
    if (this.multiSelectedIds.has(id)) return
    const view = this.furniture.get(id)
    if (!view) return
    this.multiSelectedIds.add(id)
    const outline = this.add.rectangle(
      view.image.x, view.image.y, view.image.displayWidth + 6, view.image.displayHeight + 6
    ).setStrokeStyle(3, 0x6ea8fe).setDepth(1990)
    this.multiSelectOutlines.set(id, outline)
  }

  private removeFromMultiSelection(id: string): void {
    this.multiSelectedIds.delete(id)
    this.multiSelectOutlines.get(id)?.destroy()
    this.multiSelectOutlines.delete(id)
  }

  private setMultiSelection(ids: string[]): void {
    // Also drops any active single-piece selection - only one selection mode
    // is active at a time.
    this.selectFurniture(null)
    ids.forEach((id) => this.addToMultiSelection(id))
    this.notifyEditorState()
  }

  private toggleFurnitureSelection(id: string): void {
    if (this.selectedFurniture) {
      // Promote the existing single selection into the multi-select set
      // first, so shift+clicking a second piece builds up a selection
      // instead of discarding what was already picked.
      const previousId = this.selectedFurniture.id
      this.selectedFurniture = null
      this.selectionOutline?.destroy()
      this.selectionOutline = undefined
      if (previousId !== id) this.addToMultiSelection(previousId)
    }
    if (this.multiSelectedIds.has(id)) {
      this.removeFromMultiSelection(id)
    } else {
      this.addToMultiSelection(id)
    }
    this.notifyEditorState()
  }

  addFurnitureFromPalette(frame: number): void {
    if (!this.layoutEditing) return
    const id = `custom-${Date.now()}-${this.nextFurnitureId++}`
    const point = this.findFreeFurniturePoint(frame)
    const image = this.addFurniture(id, frame, point.x, point.y, 64, 64)
    this.bringFurnitureToFront(id)
    image.setDepth(image.y + this.furnitureDepthBonus(id))
    this.layoutSave[id] = { x: image.x, y: image.y, frame, width: 64, height: 64 }
    this.saveFurnitureLayout()
    this.selectFurniture(id)
  }

  async deleteSelectedFurniture(): Promise<void> {
    if (!this.layoutEditing) return
    if (this.multiSelectedIds.size > 0) {
      // Snapshot the ids up front - deleting a desk also removes its paired
      // chair mid-loop, so a later id in this same batch may already be gone
      // by the time its turn comes (handled by the has() check below).
      for (const id of [...this.multiSelectedIds]) {
        const view = this.furniture.get(id)
        if (!view) continue
        await this.deleteFurnitureView(view)
      }
      this.clearMultiSelection()
      this.saveFurnitureLayout()
      this.notifyEditorState()
      return
    }
    if (!this.selectedFurniture) return
    await this.deleteFurnitureView(this.selectedFurniture)
    this.selectedFurniture = null
    this.selectionOutline?.destroy()
    this.selectionOutline = undefined
    this.saveFurnitureLayout()
    this.notifyEditorState()
  }

  private async deleteFurnitureView(view: FurnitureView): Promise<void> {
    const { id, frame, image } = view

    if (frame === DESK_FURNITURE_FRAME) {
      const templateId = this.teamTemplateIds[this.deskZone(id, image.x)]
      const allowed = templateId ? await window.api.teamCapacity.canRemoveDesk(templateId) : true
      // The piece can be gone by the time the IPC round trip resolves (e.g.
      // already removed as another desk's paired chair in the same batch).
      if (!this.furniture.has(id)) return
      if (!allowed) {
        this.showEditorNotice('이미 실행 중인 세션이 있어 이 데스크는 뺄 수 없습니다.')
        return
      }
    }

    image.destroy()
    this.furniture.delete(id)
    delete this.layoutSave[id]
    this.zOrderById.delete(id)
    this.removeFromMultiSelection(id)
    // A team's "Team X" label rides along with its lead desk (see
    // ensureDeskPair) - without this it would be left behind as an orphaned
    // text object floating on the floor once that desk is gone.
    this.teamLabels.get(id)?.destroy()
    this.teamLabels.delete(id)
    if (!id.startsWith('custom-')) {
      this.removedDeskIds.add(id)
      const paired = pairedFurnitureId(id)
      const pairedView = paired ? this.furniture.get(paired) : undefined
      if (paired && pairedView) {
        pairedView.image.destroy()
        this.furniture.delete(paired)
        delete this.layoutSave[paired]
        this.zOrderById.delete(paired)
        this.removedDeskIds.add(paired)
        this.removeFromMultiSelection(paired)
      }
      localStorage.setItem(OFFICE_REMOVED_DESKS_KEY, JSON.stringify([...this.removedDeskIds]))
    }
  }

  private rotateSelectedFurniture(delta: number): void {
    if (!this.layoutEditing || !this.selectedFurniture) return
    const { id, image } = this.selectedFurniture
    this.bringFurnitureToFront(id)
    const nextAngle = Phaser.Math.Wrap(this.furnitureRotation(image) + delta, 0, 360)
    const footprint = rotatedFootprint(this.selectedFurniture.frame, nextAngle)
    const displaySize = furnitureDisplaySize(this.selectedFurniture.frame, footprint.columns, footprint.rows)
    const snapped = snapFurniturePoint(image, footprint)
    image
      .setPosition(snapped.x, snapped.y)
      .setTexture(this.directionalFurnitureTexture(this.selectedFurniture.frame, nextAngle))
      .setDisplaySize(displaySize.width, displaySize.height)
      .setDepth(snapped.y + this.furnitureDepthBonus(id))
      .setData('furnitureRotation', nextAngle)
    this.updateSelectionOutline()
    this.saveFurnitureLayout()
  }

  private saveFurnitureLayout(): void {
    this.furniture.forEach(({ id, frame, image }) => {
      this.layoutSave[id] = {
        x: Math.round(image.x), y: Math.round(image.y),
        rotation: this.furnitureRotation(image),
        zOrder: this.zOrderById.get(id),
        ...(id.startsWith('custom-') ? { frame, width: image.displayWidth, height: image.displayHeight } : {})
      }
    })
    localStorage.setItem(OFFICE_LAYOUT_SAVE_KEY, JSON.stringify(this.layoutSave))
    this.reportDeskCounts()
  }

  private restoreCustomFurniture(): void {
    Object.entries(this.layoutSave).forEach(([id, saved]) => {
      if (!id.startsWith('custom-') || saved.frame === undefined) return
      this.addFurniture(id, saved.frame, saved.x, saved.y, saved.width ?? 64, saved.height ?? 64)
    })
  }

  // "초기화" clears the interior entirely - floor/walls/elevator stay, every
  // desk/chair and custom piece goes - rather than restoring the furnished
  // defaults, matching the stripped-down office this is meant to reset to.
  resetFurnitureLayout(): void {
    this.layoutSave = {}
    this.zOrderById.clear()
    this.nextZOrder = 1
    localStorage.removeItem(OFFICE_LAYOUT_SAVE_KEY)
    for (const [id, furniture] of this.furniture) {
      furniture.image.destroy()
      this.furniture.delete(id)
      if (!id.startsWith('custom-')) this.removedDeskIds.add(id)
    }
    this.teamLabels.forEach((label) => label.destroy())
    this.teamLabels.clear()
    localStorage.setItem(OFFICE_REMOVED_DESKS_KEY, JSON.stringify([...this.removedDeskIds]))
    this.reportDeskCounts()
    this.selectFurniture(null)
  }

  private collisionRects(): CollisionRect[] {
    const furnitureRects = [...this.furniture.values()]
      .filter(({ frame }) => !STACKABLE_FURNITURE_FRAMES.has(frame))
      .map(({ frame, image }) =>
        furnitureCollision({ x: image.x, y: image.y }, collisionFootprint(frame, this.furnitureRotation(image))))
    return [...OFFICE_WALL_COLLISIONS, ...furnitureRects]
  }

  // Only walls block furniture placement now - two pieces of furniture are
  // free to overlap however you arrange them (a chair tucked under a desk,
  // decorations layered together, whatever the look calls for). Characters
  // still can't walk through either; collisionRects() below is unaffected.
  private furniturePlacementCollides(_id: string, frame: number, point: WorldPoint, angle: number): boolean {
    const candidate = furnitureCollision(point, collisionFootprint(frame, angle))
    return OFFICE_WALL_COLLISIONS.some((wall) => intersectsAabb(candidate, wall))
  }

  // Searches outward in expanding rings from `near` (falling back to the
  // office center) so a forced relocation lands as close as possible to
  // where the piece was meant to be, instead of teleporting to the first
  // free cell found by a top-left raster scan of the whole map.
  private findFreeFurniturePoint(frame: number, angle = 0, near?: WorldPoint): WorldPoint {
    const footprint = rotatedFootprint(frame, angle)
    const origin = snapFurniturePoint(near ?? { x: 480, y: 340 }, footprint)
    const stepX = footprint.columns * 16
    const stepY = footprint.rows * 16
    const minX = footprint.columns * 8
    const maxX = OFFICE_WORLD_WIDTH - footprint.columns * 8
    const minY = footprint.rows * 8
    const maxY = OFFICE_WORLD_HEIGHT - footprint.rows * 8
    for (let radius = 0; radius <= 40; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
          const point = { x: origin.x + dx * stepX, y: origin.y + dy * stepY }
          if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue
          if (!this.furniturePlacementCollides('', frame, point, angle)) return point
        }
      }
    }
    return origin
  }

  // Whichever piece was placed or edited most recently renders above every
  // other piece it overlaps - no furniture type gets a hardcoded bias (a
  // desk isn't hardcoded behind a chair, a table isn't hardcoded behind a
  // laptop). A deliberate reorder (drag, rotate, a fresh placement - never
  // just clicking to select) always jumps to the very front, persists via
  // saveFurnitureLayout, and applies whether or not the editor is open.
  private bringFurnitureToFront(id: string): void {
    this.zOrderById.set(id, this.nextZOrder++)
  }

  private furnitureDepthBonus(id: string): number {
    const zOrder = this.zOrderById.get(id)
    return zOrder ? zOrder * 20000 : 0
  }

  private maxFurnitureDepth(): number {
    let max = 0
    this.furniture.forEach(({ image }) => { if (image.depth > max) max = image.depth })
    return max
  }

  private hasCollidingFurniture(): boolean {
    for (const { id, frame, image } of this.furniture.values()) {
      if (this.furniturePlacementCollides(id, frame, image, this.furnitureRotation(image))) return true
    }
    return false
  }

  private furnitureRotation(image: Phaser.GameObjects.Image): number {
    return Number(image.getData('furnitureRotation') ?? 0)
  }

  private furnitureDirection(angle: number): FurnitureDirection {
    return FURNITURE_DIRECTIONS[((Math.round(angle / 90) % 4) + 4) % 4]
  }

  private directionalFurnitureTexture(frame: number, angle: number): string {
    const assetName = FURNITURE_ASSET_NAMES[frame]
    if (!assetName) return FURNITURE_TEXTURES[frame] ?? 'furniture-workstation-desk'
    const direction = this.furnitureDirection(angle)
    // Keep the approved, independently cropped source asset for the default
    // front view. Generated cardinal variants are only used after rotation.
    if (direction === 'front') return FURNITURE_TEXTURES[frame] ?? 'furniture-workstation-desk'
    return `furniture-directional-${assetName}-${direction}`
  }

  private createRoom(x: number, y: number, width: number, height: number, label: string): void {
    this.add.text(x + 10, y + 8, label, {
      fontFamily: '"DOSGothic", "굴림체", "굴림", sans-serif', fontSize: '12px', color: '#17362e', backgroundColor: '#dff3ed'
    }).setPadding(4, 4).setDepth(800)
  }

  private createDoor(id: string, x: number, y: number, width: number, height: number): void {
    this.add.rectangle(x, y, width + 8, height + 8, 0x173b39).setDepth(30)
    this.add.rectangle(x, y - height / 2 - 2, width + 12, 4, 0x376f68).setDepth(31)
    const left = this.add.rectangle(x - width / 4, y, width / 2, height, 0x8fa8a1).setDepth(32)
    const right = this.add.rectangle(x + width / 4, y, width / 2, height, 0x839b94).setDepth(32)
    this.doors.set(id, { left, right, isOpen: false })
  }

  private setDoorOpen(id: string, open: boolean): void {
    const door = this.doors.get(id)
    if (!door || door.isOpen === open) return
    door.isOpen = open
    const halfWidth = door.left.displayWidth
    this.tweens.killTweensOf([door.left, door.right])
    this.tweens.add({
      targets: door.left,
      x: door.left.x + (open ? -halfWidth : halfWidth),
      duration: 260,
      ease: 'Stepped',
      easeParams: [4]
    })
    this.tweens.add({
      targets: door.right,
      x: door.right.x + (open ? halfWidth : -halfWidth),
      duration: 260,
      ease: 'Stepped',
      easeParams: [4]
    })
  }

  private createPantry(): void {
    this.addFurniture('pantry-cabinet', 0, 65, 105, 70, 82)
    this.addFurniture('pantry-fridge', 1, 145, 98, 62, 105)
    this.addFurniture('pantry-counter', 2, 220, 108, 105, 70)
  }

  private createMeetingRoom(): void {
    this.addFurniture('meeting-table', 6, 480, 128, 256, 96)
    this.addFurniture('meeting-laptop', 7, 480, 132, 48, 32)
    this.addFurniture('meeting-screen', 5, 480, 52, 135, 48)
  }

  private createEntrance(): void {
    // Recessed into the decorative wall band (y 26-90) instead of the old
    // 94-150 box, which hung well below the wall and floated in the open
    // room like a freestanding crate rather than a door in the wall.
    this.createDoor('elevator', WAYPOINTS.elevatorInside.x, 58, 84, 64)
    // this.addFurniture('entrance-plant-left', 15, 735, 125, 45, 70)
    // this.addFurniture('entrance-plant-right', 15, 905, 125, 45, 70)
  }

  private createRepresentativeRoom(): void {
    this.addFurniture('representative-plant', 15, 760, 900, 48, 70)
    this.addFurniture('representative-side-table', 16, 805, 912, 48, 42)
    this.addFurniture('representative-sofa', 17, 895, 775, 82, 48)
    this.addFurniture('representative-lamp', 18, 842, 775, 32, 62)
    this.addFurniture('representative-bookcase', 19, 912, 888, 48, 86)
    this.addFurniture('representative-desk', 10, 835, 835, 100, 58)
    this.addFurniture('representative-chair', 12, 835, 815, 38, 42)
  }

  // Idempotent so it doubles as both the initial build and, after a layout
  // reset clears removedDeskIds, a way to recreate whichever default pairs
  // the user had previously deleted - without duplicating ones still present.
  private ensureDeskPair(teamIndex: number, slotIndex: number): void {
    const point = TEAM_DESKS[teamIndex][slotIndex]
    const deskId = `desk-${teamIndex}-${slotIndex}`
    const chairId = `chair-${teamIndex}-${slotIndex}`
    if (!this.removedDeskIds.has(deskId) && !this.furniture.has(deskId)) {
      this.addFurniture(deskId, DESK_FURNITURE_FRAME, point.x, point.y + 12, 92, 58)
      if (slotIndex === 0) {
        // A fixed floor marker for the zone, anchored to the static
        // TEAM_DESKS point - not the desk's own (possibly dragged-elsewhere)
        // position, so it stays put as its own zone label instead of
        // tagging along whenever the desk itself gets moved around.
        const teamNames = ['Claude', 'Codex', 'Antigravity']
        const label = this.add.text(point.x - 36, point.y - 33, `Team ${teamNames[teamIndex]}`, {
          fontFamily: '"DOSGothic", "굴림체", "굴림", sans-serif', fontSize: '10px', color: '#111111'
        }).setPadding(4, 4).setDepth(700)
        this.teamLabels.set(deskId, label)
      }
    }
    // Created right after its own desk, so on a fresh install (nothing in
    // zOrderById yet) it naturally gets the later zOrder and renders in
    // front - an empty seat stays visible instead of tucked out of sight.
    // It's only pushed behind the desk while someone is actually seated
    // there - see syncDeskChairDepths, applied from applySnapshot - so the
    // desk front edge convincingly occludes the seated actor without also
    // swallowing the chair when nobody's sitting in it.
    if (!this.removedDeskIds.has(chairId) && !this.furniture.has(chairId)) {
      this.addFurniture(chairId, 12 + teamIndex, point.x, point.y + 18, 38, 42)
    }
  }

  private createDesks(): void {
    TEAM_DESKS.forEach((team, teamIndex) => team.forEach((_point, slotIndex) => {
      this.ensureDeskPair(teamIndex, slotIndex)
    }))
  }

  /** Default desks keep their teamIndex in the id (collision avoidance can
   *  nudge one off its column, which would misclassify it under pure
   *  position lookup); only custom-added desks - which carry no team of
   *  their own - go by which column their x position currently falls in. */
  private deskZone(id: string, x: number): number {
    const defaultMatch = /^desk-(\d+)-\d+$/.exec(id)
    return defaultMatch ? Number(defaultMatch[1]) : teamIndexForX(x)
  }

  /** Every desk-frame piece (default or custom-added), grouped by team -
   *  this *is* the team's seat capacity. */
  private computeDeskCounts(): number[] {
    const counts = [0, 0, 0]
    this.furniture.forEach(({ id, frame, image }) => {
      if (frame !== DESK_FURNITURE_FRAME || id === 'representative-desk') return
      const zone = this.deskZone(id, image.x)
      if (zone >= 0 && zone < counts.length) counts[zone] += 1
    })
    return counts
  }

  private reportDeskCounts(): void {
    this.deskCountsHandler?.(this.computeDeskCounts())
  }

  private showEditorNotice(text: string): void {
    const notice = this.add.text(480, 30, text, {
      fontFamily: '"DOSGothic", "굴림체", "굴림", sans-serif', fontSize: '11px', color: '#ffffff', backgroundColor: '#7a2222'
    }).setOrigin(0.5, 0).setPadding(6, 6).setDepth(3000)
    this.time.delayedCall(2200, () => notice.destroy())
  }

  private createRosterFrames(): void {
    for (let row = 0; row < 4; row += 1) {
      const texture = this.textures.get(`roster-row-${row}`)
      const source = texture.getSourceImage() as HTMLImageElement
      const cellWidth = Math.floor(source.width / 5)
      for (let column = 0; column < 5; column += 1) {
        texture.add(`${row * 5 + column}`, 0, column * cellWidth, 0, cellWidth, source.height)
      }
    }
  }

  private createTeamAnimations(): void {
    const states = ['idle', 'walk-down', 'walk-up', 'work'] as const
    // Keyed by team (0=Claude/1=Codex/2=Antigravity), not a global roster
    // index - see animationAtlasFor for why: team capacity is desk-count
    // driven now and usually well under 5, so a global 1-4/5-9/10-14 band
    // scheme silently mismatched teams to atlases as soon as any team had
    // fewer than 5 people ahead of it in the profile list.
    const atlases = [
      { key: 'claude-team-animation-atlas', teamIndex: 0 },
      { key: 'codex-team-animation-atlas', teamIndex: 1 },
      { key: 'antigravity-team-animation-atlas', teamIndex: 2 }
    ]
    atlases.forEach(({ key, teamIndex }) => {
      const texture = this.textures.get(key)
      const source = texture.getSourceImage() as HTMLImageElement
      const frameWidth = Math.floor(source.width / 5)
      const frameHeight = Math.floor(source.height / 4)
      for (let column = 0; column < 5; column += 1) {
        const actorKey = `${teamIndex}-${column}`
      states.forEach((state, row) => {
        texture.add(`actor-${actorKey}-${state}`, 0, column * frameWidth, row * frameHeight, frameWidth, frameHeight)
      })
      this.anims.create({
        key: `actor-${actorKey}-idle`,
        frames: [{ key, frame: `actor-${actorKey}-idle` }],
        frameRate: 2,
        repeat: -1
      })
      this.anims.create({
        key: `actor-${actorKey}-walk-down`,
        frames: [
          { key, frame: `actor-${actorKey}-idle` },
          { key, frame: `actor-${actorKey}-walk-down` }
        ],
        frameRate: 6,
        repeat: -1,
        yoyo: true
      })
      this.anims.create({
        key: `actor-${actorKey}-walk-up`,
        frames: [{ key, frame: `actor-${actorKey}-walk-up` }],
        frameRate: 6,
        repeat: -1
      })
      this.anims.create({
        key: `actor-${actorKey}-work`,
        frames: [{ key, frame: `actor-${actorKey}-work` }],
        frameRate: 3,
        repeat: -1
      })
      }
    })
  }

  private animationAtlasFor(teamIndex: number): string | null {
    if (teamIndex === 0) return 'claude-team-animation-atlas'
    if (teamIndex === 1) return 'codex-team-animation-atlas'
    if (teamIndex === 2) return 'antigravity-team-animation-atlas'
    return null
  }

  /** Which of the 5 skin variants in the actor's team atlas to use - the
   *  lead (slotIndex 0) gets column 0, sub-agents fill the rest, wrapping
   *  around past a 5th so a very large team still gets an animated sprite
   *  instead of falling back to a generic static one. Claude's lead is
   *  pinned to column 4 instead: column 0 there is dark hair + a navy suit,
   *  near-identical to the CEO sprite, so the two were hard to tell apart
   *  at a glance in the office.
   */
  private actorAnimationKey(actor: OfficeGameActor): string {
    if (actor.teamIndex === 0 && actor.slotIndex === 0) return '0-4'
    return `${actor.teamIndex}-${actor.slotIndex % 5}`
  }

  private createRepresentativeActor(): void {
    // Static, not sprite.play('ceo-idle') - nothing drives this character's
    // state (no actual agent behind it), so it should hold still instead of
    // looping a breathing animation nobody asked for.
    this.representativeSprite = this.add.sprite(835, 811, 'ceo-animation-sheet', 'ceo-idle-0')
      .setDisplaySize(104, 120).setDepth(810)
    this.representativeLabel = this.add.text(835 + CEO_SPRITE_ART_X_OFFSET, 748, '김태호 대표', {
      fontFamily: '"DOSGothic", "굴림체", "굴림", sans-serif', fontSize: '13px', color: '#111111', align: 'center'
    }).setOrigin(0.5, 0).setPadding(4, 4).setDepth(700)
  }

  private createCeoAnimations(): void {
    const texture = this.textures.get('ceo-animation-sheet')
    const source = texture.getSourceImage() as HTMLImageElement
    const frameWidth = Math.floor(source.width / 8)
    const frameHeight = Math.floor(source.height / 6)
    const rowNames = ['idle', 'walk-down', 'walk-up', 'walk-left', 'work', 'interact']
    rowNames.forEach((name, row) => {
      const frames: string[] = []
      for (let column = 0; column < 8; column += 1) {
        const frameName = `ceo-${name}-${column}`
        texture.add(frameName, 0, column * frameWidth, row * frameHeight, frameWidth, frameHeight)
        frames.push(frameName)
      }
      this.anims.create({
        key: `ceo-${name}`,
        frames: frames.map((frame) => ({ key: 'ceo-animation-sheet', frame })),
        frameRate: name === 'idle' ? 4 : 8,
        repeat: name === 'interact' ? 0 : -1,
        // The idle row's frames aren't perfectly recentered in their cells
        // (last frame sits a bit off from the first), so a hard loop back to
        // frame 0 reads as a visible snap/teleport. Playing it forward then
        // back removes that jump cut - every step is a real consecutive-frame
        // transition either way.
        yoyo: name === 'idle'
      })
    })
  }

  private applySnapshot(snapshot: OfficeWorldSnapshot): void {
    this.snapshot = snapshot
    this.pendingSnapshot = null
    const pantryOpen = snapshot.actors.some((actor) => actor.presence === 'pantry' || actor.presence === 'pantryDoor')
    const meetingOpen = snapshot.meetingActive || snapshot.actors.some((actor) => actor.presence === 'meeting' || actor.presence === 'meetingDoor')
    this.setDoorOpen('elevator', snapshot.elevatorOpen)
    this.setDoorOpen('pantry', pantryOpen)
    this.setDoorOpen('meeting', meetingOpen)

    const activeIds = new Set(snapshot.actors.filter((actor) => actor.presence !== 'offDuty').map((actor) => actor.profileId))
    for (const [id, view] of this.actors) {
      if (!activeIds.has(id)) {
        view.container.destroy(true)
        this.actors.delete(id)
      }
    }

    snapshot.actors.forEach((actor, index) => {
      if (actor.presence === 'offDuty') return
      const view = this.actors.get(actor.profileId) ?? this.createActor(actor)
      this.updateActor(view, actor, index)
    })
    this.syncDeskChairDepths(snapshot)
  }

  // A chair's own depth stays in front of the desk (visible, natural) except
  // while someone is actually seated there, where it drops behind both the
  // desk and the seated actor (see startActionAnimation) so the desk front
  // edge convincingly occludes the character without also hiding an empty
  // chair the rest of the time.
  private syncDeskChairDepths(snapshot: OfficeWorldSnapshot): void {
    const occupiedSeats = new Set(
      snapshot.actors
        .filter((actor) => actor.presence === 'working' || actor.presence === 'deskIdle')
        .map((actor) => `${actor.teamIndex}-${actor.slotIndex}`)
    )
    this.furniture.forEach((chair, id) => {
      const match = /^chair-(\d+-\d+)$/.exec(id)
      if (!match) return
      const desk = this.furniture.get(`desk-${match[1]}`)
      if (!desk) return
      // An actually-seated character always wins the desk-occludes-chair
      // look, overriding whatever the ordinary zOrder-based stacking says -
      // only an *empty* seat goes by that.
      if (occupiedSeats.has(match[1])) {
        chair.image.setDepth(desk.image.depth - 2)
        return
      }
      chair.image.setDepth(chair.image.y + this.furnitureDepthBonus(id))
    })
  }

  private createActor(actor: OfficeGameActor): ActorView {
    const row = Math.floor(actor.rosterIndex / 5)
    const frame = String(actor.rosterIndex)
    const animationAtlas = this.animationAtlasFor(actor.teamIndex)
    const animKey = this.actorAnimationKey(actor)
    const sprite = this.add.sprite(
      0,
      -27,
      animationAtlas ?? `roster-row-${row}`,
      animationAtlas ? `actor-${animKey}-idle` : frame
    ).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
      .setY(ACTOR_SPRITE_Y_OFFSET)
    if (animationAtlas) sprite.play(`actor-${animKey}-idle`)
    sprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.actorSelectHandler?.(actor.profileId)
    })
    // Same style/placement as the CEO's own nameplate (createRepresentativeActor)
    // - no background box, bigger/darker text, sitting just above the head
    // (sprite top edge is ACTOR_SPRITE_Y_OFFSET - height/2 = -124). y:28 was
    // below the container's own ground anchor, i.e. under the character's
    // feet rather than above its head.
    const label = this.add.text(0, ACTOR_SPRITE_Y_OFFSET - ACTOR_SPRITE_HEIGHT / 2 - 3, actor.displayName, {
      fontFamily: '"DOSGothic", "굴림체", "굴림", sans-serif', fontSize: '13px', color: '#111111', align: 'center'
    }).setOrigin(0.5, 0).setPadding(4, 4)
    const bubble = this.add.text(36, -136, '', {
      fontFamily: '"DOSGothic", "굴림체", "굴림", sans-serif', fontSize: '8px', color: '#26332f', backgroundColor: '#fff7df'
    }).setPadding(4, 4).setVisible(false)
    const prop = this.add.rectangle(24, -40, 14, 18, 0x6eb6d9)
      .setStrokeStyle(2, 0x294a5a).setVisible(false)
    const saved = this.worldSave.actors.find((candidate) => candidate.profileId === actor.profileId)
    const initial = saved ?? { x: WAYPOINTS.elevatorInside.x, y: WAYPOINTS.elevatorInside.y }
    const container = this.add.container(initial.x, initial.y, [sprite, label, bubble, prop]).setDepth(initial.y)
    const view: ActorView = {
      container, sprite, bubble, prop, routeKey: '', stateMachine: new ActorStateMachine(actor.presence),
      route: [], routeIndex: 0, actor
    }
    this.actors.set(actor.profileId, view)
    return view
  }

  // The live chair position (which the interior editor can move) instead of
  // the static TEAM_DESKS default, so characters keep finding their seat
  // after a desk is dragged elsewhere.
  private deskSeatPoint(actor: OfficeGameActor): WorldPoint {
    const chair = this.furniture.get(`chair-${actor.teamIndex}-${actor.slotIndex}`)
    if (chair) return { x: chair.image.x, y: chair.image.y }
    return TEAM_DESKS[actor.teamIndex]?.[actor.slotIndex] ?? { x: 480, y: 360 }
  }

  private updateActor(view: ActorView, actor: OfficeGameActor, actorIndex: number): void {
    if (!view.stateMachine.requestPresence(actor.presence)) return
    const waypoints = routeFor(
      actor, actorIndex, { x: view.container.x, y: view.container.y }, (candidate) => this.deskSeatPoint(candidate)
    )
    const route: WorldPoint[] = []
    let cursor = { x: view.container.x, y: view.container.y }
    for (const waypoint of waypoints) {
      const segment = findOfficePath(cursor, waypoint, this.collisionRects())
      route.push(...segment)
      cursor = waypoint
    }
    const routeKey = `${actor.presence}:${route.map((point) => `${point.x},${point.y}`).join('|')}`
    const actionLabels: Partial<Record<OfficeGameActor['presence'], string>> = {
      working: '업무 중', pantry: actorIndex % 2 ? '음료' : '간식', meeting: '회의',
      requestingHelp: '도움 필요!', error: '오류!'
    }
    const label = actionLabels[actor.presence]
    view.bubble.setText(label ?? '').setVisible(Boolean(label))
    view.sprite.setTint(actor.presence === 'error' ? 0xff7777 : actor.presence === 'requestingHelp' ? 0xffd36a : 0xffffff)
    view.container.setScale(1, actor.presence === 'working' || actor.presence === 'meeting' ? 0.92 : 1)
    if (view.routeKey === routeKey) return
    view.routeKey = routeKey
    view.actionTween?.stop()
    view.prop.setVisible(false)
    if (route.length === 0) return
    view.actor = actor
    view.route = route
    view.routeIndex = 0
  }

  private updateActorMovement(deltaSeconds: number): void {
    if (this.layoutEditing) return
    const collisions = this.collisionRects()
    for (const view of this.actors.values()) {
      const target = view.route[view.routeIndex]
      if (!target) continue
      const dx = target.x - view.container.x
      const dy = target.y - view.container.y
      const distance = Math.hypot(dx, dy)
      if (distance < 2) {
        view.routeIndex += 1
        this.persistActor(view.actor, view)
        if (view.routeIndex >= view.route.length) {
          view.route = []
          this.startActionAnimation(view, view.actor)
        }
        continue
      }
      const amount = Math.min(distance, 160 * deltaSeconds)
      const desired = { x: view.container.x + dx / distance * amount, y: view.container.y + dy / distance * amount }
      const movementCollisions = collisions.filter((rect) => !(
        target.x >= rect.x && target.x <= rect.x + rect.width && target.y >= rect.y && target.y <= rect.y + rect.height
      ))
      const resolved = resolveAxisSeparated(
        { x: view.container.x, y: view.container.y }, desired, movementCollisions,
        ACTOR_COLLISION_HALF_WIDTH, ACTOR_COLLISION_HALF_HEIGHT
      )
      view.container.setPosition(resolved.x, resolved.y).setDepth(resolved.y)
      view.stateMachine.startWalking(dx, dy)
      view.sprite.setFlipX(dx < 0)
      if (this.animationAtlasFor(view.actor.teamIndex)) {
        const animation = Math.abs(dy) > Math.abs(dx) && dy < 0 ? 'walk-up' : 'walk-down'
        view.sprite.play(`actor-${this.actorAnimationKey(view.actor)}-${animation}`, true)
      }
      if (resolved.blockedX && resolved.blockedY) {
        const remaining = findOfficePath({ x: view.container.x, y: view.container.y }, target, movementCollisions)
        view.route.splice(view.routeIndex, 1, ...remaining)
      }
    }
  }

  private resolveActorOverlaps(): void {
    if (this.layoutEditing) return
    const entries = [...this.actors.entries()]
    const collisions = this.collisionRects()
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < entries.length; i += 1) for (let j = i + 1; j < entries.length; j += 1) {
        const [idA, a] = entries[i]
        const [idB, b] = entries[j]
        const [nextA, nextB] = pushApart(
          { id: idA, x: a.container.x, y: a.container.y, radius: ACTOR_COLLISION_RADIUS },
          { id: idB, x: b.container.x, y: b.container.y, radius: ACTOR_COLLISION_RADIUS }
        )
        const safeA = resolveAxisSeparated(
          { x: a.container.x, y: a.container.y }, nextA, collisions,
          ACTOR_COLLISION_HALF_WIDTH, ACTOR_COLLISION_HALF_HEIGHT
        )
        const safeB = resolveAxisSeparated(
          { x: b.container.x, y: b.container.y }, nextB, collisions,
          ACTOR_COLLISION_HALF_WIDTH, ACTOR_COLLISION_HALF_HEIGHT
        )
        a.container.setPosition(safeA.x, safeA.y).setDepth(safeA.y)
        b.container.setPosition(safeB.x, safeB.y).setDepth(safeB.y)
      }
    }
  }

  private startActionAnimation(view: ActorView, actor: OfficeGameActor): void {
    // A previous bob/eating/drinking tween from the last time this actor
    // arrived somewhere may still be running (nothing here ever stopped it)
    // - left alone, it keeps nudging sprite.y on its own schedule even after
    // setY below puts the sprite back where it belongs, fighting the fresh
    // pose and reading as a piece of the character (usually the legs, since
    // that's near the tween's other extreme) floating away from the rest.
    view.actionTween?.stop()
    const actorIndex = this.snapshot?.actors.findIndex((candidate) => candidate.profileId === actor.profileId) ?? 0
    view.stateMachine.arrive(actorIndex)
    const action = view.stateMachine.current.action
    if (this.animationAtlasFor(actor.teamIndex)) {
      // Furniture is always composed at runtime. The atlas work row contains a
      // baked desk, so a desk-facing character frame is used at the chair snap.
      view.sprite.play(`actor-${this.actorAnimationKey(actor)}-${action === 'working' ? 'walk-up' : 'idle'}`, true)
    }
    view.prop.setVisible(false)
    view.sprite.setDisplaySize(
      ACTOR_SPRITE_WIDTH,
      action === 'working' ? ACTOR_SPRITE_WORKING_HEIGHT : action === 'sitting' ? ACTOR_SPRITE_SITTING_HEIGHT : ACTOR_SPRITE_HEIGHT
    )
    view.sprite.setY(
      action === 'working' ? ACTOR_SPRITE_Y_OFFSET + 24
        : action === 'sitting' ? ACTOR_SPRITE_Y_OFFSET + 8
          : ACTOR_SPRITE_Y_OFFSET
    )
    if (actor.presence === 'working' || actor.presence === 'deskIdle') {
      // Sit exactly at the chair snap point and render just behind the desk
      // front edge, per requirement: independent chair snap + independent
      // desk in front, never a character frame with a desk baked in.
      const desk = this.furniture.get(`desk-${actor.teamIndex}-${actor.slotIndex}`)
      if (desk) view.container.setDepth(desk.image.depth - 1)
    }
    if (action === 'sitting') {
      // The meeting table is ordinary custom furniture, and furniture depth
      // is y + zOrder*20000 (see furnitureDepthBonus) - once it's been
      // edited even once, its zOrder alone puts it at a depth in the
      // millions, which swallows a plain y-based actor depth whole (a small
      // +/-4..8 bias was never going to clear that gap, whichever way it
      // pointed - this is why a seated head reads as "buried" in the table).
      // Meeting seating isn't tied to one specific desk the way desk-seating
      // is, so instead of matching one piece of furniture, this actor is
      // pushed in front of every piece of furniture currently in the scene.
      view.container.setDepth(this.maxFurnitureDepth() + 1 + actorIndex)
      view.container.setScale(1, 0.86)
      return
    }
    if (!['working', 'pantry', 'meeting', 'requestingHelp', 'error'].includes(actor.presence)) return
    if (action === 'eating' || action === 'drinking') {
      const drinking = action === 'drinking'
      view.prop.setFillStyle(drinking ? 0x6eb6d9 : 0xd99a45)
        .setStrokeStyle(2, drinking ? 0x294a5a : 0x70431f)
        .setSize(drinking ? 14 : 18, drinking ? 20 : 14)
        .setPosition(24, -40)
        .setVisible(true)
      view.actionTween = this.tweens.add({
        targets: view.prop,
        x: 14,
        y: -86,
        duration: 260,
        hold: 140,
        yoyo: true,
        repeat: 2,
        ease: 'Stepped',
        easeParams: [3],
        onComplete: () => {
          view.prop.setVisible(false)
          view.stateMachine.completeAction()
        }
      })
      return
    }
    view.actionTween = this.tweens.add({
      targets: view.sprite,
      y: actor.presence === 'working' ? -58 : -50,
      duration: actor.presence === 'error' ? 150 : 420,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
      easeParams: [2],
      onComplete: () => view.stateMachine.completeAction()
    })
  }

  private persistActor(actor: OfficeGameActor, view: ActorView): void {
    this.worldSave = upsertSavedActor(this.worldSave, {
      profileId: actor.profileId,
      x: Math.round(view.container.x),
      y: Math.round(view.container.y),
      presence: actor.presence,
      updatedAt: Date.now()
    })
    localStorage.setItem(OFFICE_WORLD_SAVE_KEY, JSON.stringify(this.worldSave))
  }
}
