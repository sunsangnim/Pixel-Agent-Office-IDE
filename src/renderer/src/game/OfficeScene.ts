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
const ACTOR_SCALE = 2
const ACTOR_COLLISION_RADIUS = 11 * ACTOR_SCALE
const ACTOR_COLLISION_HALF_WIDTH = 7 * ACTOR_SCALE
const ACTOR_COLLISION_HALF_HEIGHT = 5 * ACTOR_SCALE

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
  private nextFurnitureId = 1
  // Team-lead nameplates (desk-T-0 only), tracked so they follow the desk if
  // it's later dragged instead of staying behind at its original spot.
  private teamLabels = new Map<string, Phaser.GameObjects.Text>()
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
    return { hasSelection: Boolean(this.selectedFurniture), floor: this.selectedFloor }
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
      this.selectFurniture(id)
    })
    image.on('dragstart', () => {
      image.setData({ dragStartX: image.x, dragStartY: image.y })
      // Bring the piece being moved to the front immediately, before it's
      // even dropped, so it's never hidden behind whatever it's dragged over.
      this.bringFurnitureToFront(id)
      image.setDepth(image.y + this.furnitureDepthBonus(id))
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
      this.teamLabels.get(id)?.setPosition(snapped.x - 36, snapped.y - 45)
      this.updateSelectionOutline()
    })
    image.on('dragend', () => {
      if (!this.layoutEditing) return
      const snapped = snapFurniturePoint({ x: image.x, y: image.y }, rotatedFootprint(frame, this.furnitureRotation(image)))
      image.setPosition(snapped.x, snapped.y)
      image.setDepth(image.y + this.furnitureDepthBonus(id))
      this.teamLabels.get(id)?.setPosition(snapped.x - 36, snapped.y - 45)
      this.updateSelectionOutline()
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
    if (!this.layoutEditing || !this.selectedFurniture) return
    const { id, frame, image } = this.selectedFurniture

    if (frame === DESK_FURNITURE_FRAME) {
      const templateId = this.teamTemplateIds[this.deskZone(id, image.x)]
      const allowed = templateId ? await window.api.teamCapacity.canRemoveDesk(templateId) : true
      // The selection can change while we were awaiting the IPC round trip;
      // bail rather than delete whatever happens to be selected by then.
      if (this.selectedFurniture?.id !== id) return
      if (!allowed) {
        this.showEditorNotice('이미 실행 중인 세션이 있어 이 데스크는 뺄 수 없습니다.')
        return
      }
    }

    image.destroy()
    this.furniture.delete(id)
    delete this.layoutSave[id]
    this.zOrderById.delete(id)
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
      }
      localStorage.setItem(OFFICE_REMOVED_DESKS_KEY, JSON.stringify([...this.removedDeskIds]))
    }
    this.selectedFurniture = null
    this.selectionOutline?.destroy()
    this.selectionOutline = undefined
    this.saveFurnitureLayout()
    this.notifyEditorState()
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
      fontFamily: 'monospace', fontSize: '12px', color: '#17362e', backgroundColor: '#dff3ed'
    }).setPadding(4, 2).setDepth(800)
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
      const desk = this.addFurniture(deskId, DESK_FURNITURE_FRAME, point.x, point.y + 12, 92, 58)
      if (slotIndex === 0) {
        // Anchored to the desk's actual (possibly dragged-elsewhere) position,
        // not the static TEAM_DESKS fallback point - otherwise the label stays
        // wherever the desk originally spawned even after it's moved.
        const label = this.add.text(desk.x - 36, desk.y - 45, ['Claude', 'Codex', 'Antigravity'][teamIndex], {
          fontFamily: 'monospace', fontSize: '10px', color: '#24473e'
        }).setDepth(700)
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
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', backgroundColor: '#7a2222'
    }).setOrigin(0.5, 0).setPadding(6, 4).setDepth(3000)
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
    const atlases = [
      { key: 'claude-team-animation-atlas', start: 0 },
      { key: 'codex-team-animation-atlas', start: 5 },
      { key: 'antigravity-team-animation-atlas', start: 10 },
      { key: 'roster-row-4-animation-atlas', start: 15 }
    ]
    atlases.forEach(({ key, start }) => {
      const texture = this.textures.get(key)
      const source = texture.getSourceImage() as HTMLImageElement
      const frameWidth = Math.floor(source.width / 5)
      const frameHeight = Math.floor(source.height / 4)
      for (let column = 0; column < 5; column += 1) {
        const rosterIndex = column + start
      states.forEach((state, row) => {
        texture.add(`actor-${rosterIndex}-${state}`, 0, column * frameWidth, row * frameHeight, frameWidth, frameHeight)
      })
      this.anims.create({
        key: `actor-${rosterIndex}-idle`,
        frames: [{ key, frame: `actor-${rosterIndex}-idle` }],
        frameRate: 2,
        repeat: -1
      })
      this.anims.create({
        key: `actor-${rosterIndex}-walk-down`,
        frames: [
          { key, frame: `actor-${rosterIndex}-idle` },
          { key, frame: `actor-${rosterIndex}-walk-down` }
        ],
        frameRate: 6,
        repeat: -1,
        yoyo: true
      })
      this.anims.create({
        key: `actor-${rosterIndex}-walk-up`,
        frames: [{ key, frame: `actor-${rosterIndex}-walk-up` }],
        frameRate: 6,
        repeat: -1
      })
      this.anims.create({
        key: `actor-${rosterIndex}-work`,
        frames: [{ key, frame: `actor-${rosterIndex}-work` }],
        frameRate: 3,
        repeat: -1
      })
      }
    })
  }

  private animationAtlasFor(rosterIndex: number): string | null {
    if (rosterIndex >= 1 && rosterIndex <= 4) return 'claude-team-animation-atlas'
    if (rosterIndex >= 5 && rosterIndex <= 9) return 'codex-team-animation-atlas'
    if (rosterIndex >= 10 && rosterIndex <= 14) return 'antigravity-team-animation-atlas'
    if (rosterIndex >= 15 && rosterIndex <= 19) return 'roster-row-4-animation-atlas'
    return null
  }

  private createRepresentativeActor(): void {
    // Static, not sprite.play('ceo-idle') - nothing drives this character's
    // state (no actual agent behind it), so it should hold still instead of
    // looping a breathing animation nobody asked for.
    this.add.sprite(835, 811, 'ceo-animation-sheet', 'ceo-idle-0').setDisplaySize(104, 120).setDepth(810)
    this.add.text(835, 748, '김태호 대표', {
      fontFamily: 'monospace', fontSize: '8px', color: '#17362e', backgroundColor: '#e7f3ef'
    }).setOrigin(0.5, 0).setPadding(2, 1).setDepth(700)
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
    const animationAtlas = this.animationAtlasFor(actor.rosterIndex)
    const sprite = this.add.sprite(
      0,
      -27,
      animationAtlas ?? `roster-row-${row}`,
      animationAtlas ? `actor-${actor.rosterIndex}-idle` : frame
    ).setDisplaySize(animationAtlas ? 180 : 100, animationAtlas ? 180 : 136)
      .setY(animationAtlas ? -70 : -54)
    if (animationAtlas) sprite.play(`actor-${actor.rosterIndex}-idle`)
    sprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.actorSelectHandler?.(actor.profileId)
    })
    const label = this.add.text(0, 28, actor.displayName, {
      fontFamily: 'monospace', fontSize: '8px', color: '#18352e', backgroundColor: '#e7f3ef'
    }).setOrigin(0.5, 0).setPadding(2, 1)
    const bubble = this.add.text(36, -136, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#26332f', backgroundColor: '#fff7df'
    }).setPadding(3, 2).setVisible(false)
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
    const waypoints = routeFor(actor, actorIndex, (candidate) => this.deskSeatPoint(candidate))
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
      const amount = Math.min(distance, 320 * deltaSeconds)
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
      if (this.animationAtlasFor(view.actor.rosterIndex)) {
        const animation = Math.abs(dy) > Math.abs(dx) && dy < 0 ? 'walk-up' : 'walk-down'
        view.sprite.play(`actor-${view.actor.rosterIndex}-${animation}`, true)
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
    const actorIndex = this.snapshot?.actors.findIndex((candidate) => candidate.profileId === actor.profileId) ?? 0
    view.stateMachine.arrive(actorIndex)
    const action = view.stateMachine.current.action
    if (this.animationAtlasFor(actor.rosterIndex)) {
      // Furniture is always composed at runtime. The atlas work row contains a
      // baked desk, so a desk-facing character frame is used at the chair snap.
      view.sprite.play(`actor-${actor.rosterIndex}-${action === 'working' ? 'walk-up' : 'idle'}`, true)
    }
    view.prop.setVisible(false)
    const animatedActor = Boolean(this.animationAtlasFor(actor.rosterIndex))
    view.sprite.setDisplaySize(
      animatedActor ? 180 : 100,
      action === 'working' ? (animatedActor ? 152 : 116) : (animatedActor ? 180 : 136)
    )
    view.sprite.setY(
      action === 'working' ? (animatedActor ? -40 : -30)
        : action === 'sitting' ? (animatedActor ? -60 : -40)
          : (animatedActor ? -70 : -54)
    )
    if (actor.presence === 'working' || actor.presence === 'deskIdle') {
      // Sit exactly at the chair snap point and render just behind the desk
      // front edge, per requirement: independent chair snap + independent
      // desk in front, never a character frame with a desk baked in.
      const desk = this.furniture.get(`desk-${actor.teamIndex}-${actor.slotIndex}`)
      if (desk) view.container.setDepth(desk.image.depth - 1)
    }
    if (action === 'sitting') {
      const seatIndex = actorIndex % MEETING_SEATS.length
      view.container.setDepth(view.container.y + (seatIndex < 4 ? -4 : 8))
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
