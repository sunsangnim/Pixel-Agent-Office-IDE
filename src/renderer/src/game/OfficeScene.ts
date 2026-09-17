import Phaser from 'phaser'
import row1 from '../assets/pixel-office/characters/corporate-roster-row-1-v1.png'
import row2 from '../assets/pixel-office/characters/corporate-roster-row-2-v1.png'
import row3 from '../assets/pixel-office/characters/corporate-roster-row-3-v1.png'
import row4 from '../assets/pixel-office/characters/corporate-roster-row-4-v1.png'
import ceoAnimationSheet from '../assets/pixel-office/characters/ceo-walk-cycle-v3.png'
import ceoSeatedSheet from '../assets/pixel-office/characters/ceo-seated-v1.png'
import ceoPantrySheet from '../assets/pixel-office/characters/ceo-pantry-actions-v1.png'
import speechBubbleAsset from '../assets/pixel-office/ui/speech-bubble-v1.png'
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
  OFFICE_WORLD_HEIGHT,
  OFFICE_WORLD_WIDTH,
  TEAM_DESKS,
  WAYPOINTS,
  targetPoint,
  teamIndexForX,
  type OfficeGameActor,
  type OfficeWorldSnapshot,
  type WorldPoint
} from './officeWorld'
import {
  ACTOR_NAV_HALF_HEIGHT, ACTOR_NAV_HALF_WIDTH, actorCollisionRect, findOfficePath,
  hasOfficeLineOfSight, isOfficePositionWalkable, nearestOfficePosition
} from './navigation'
import {
  collisionFootprint, furnitureCollision, OFFICE_FLOOR_REGION, OFFICE_WALL_COLLISIONS, rotatedFootprint, snapFurniturePoint
} from './officeGrid'
import { intersectsAabb, resolveAxisSeparated, type CollisionRect } from './collisionResolution'
import { measureFurnitureBounds } from './furnitureBounds'
import { seatedFrameAnchor, seatedSpriteFoot } from './seatAnchors'
import {
  DEFAULT_LAYOUT_SEED,
  OFFICE_LAYOUT_SAVE_KEY,
  OFFICE_REMOVED_DESKS_KEY,
  parseOfficeLayout,
  parseRemovedIds,
  type OfficeLayoutSave,
  type SavedFurniture
} from './layoutPersistence'
import { ActorStateMachine, actionForPresence } from './actorStateMachine'
import { pantryPoseAt, type PantryAnimation } from './pantryAnimation'
import {
  REPRESENTATIVE_WORK_TEXTURE, REPRESENTATIVE_WORK_POSES, representativeWorkPixels, representativeWorkPoseAt
} from './representativeWorkAnimation'
import { IdleActivity } from './idleActivity'
import { CharacterGait, type CharacterPose } from './characterGait'
import { STAFF_WALK_SHEETS, WALK_ROW_NAMES, STAFF_SEATED_SHEETS, SEATED_ROW_NAMES, STAFF_PANTRY_SHEETS } from './staffWalkSheets'
import {
  CHARACTER_FRAME_HEIGHT, CHARACTER_FRAME_WIDTH, CHARACTER_SHEET_LAYOUTS,
  measureCharacterSheet, measureWalkSheet, measureSeatedSheet, measurePantrySheet, type CharacterSheetKey
} from './characterFrames'
import {
  OFFICE_REPRESENTATIVE_SAVE_KEY, OFFICE_WORLD_SAVE_KEY, parseOfficeWorldSave,
  parseRepresentativePosition, upsertSavedActor, type OfficeWorldSave
} from './worldPersistence'

interface ActorView {
  container: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Sprite
  seatedForeground: Phaser.GameObjects.Sprite
  overlay: Phaser.GameObjects.Container
  label: Phaser.GameObjects.Text
  bubble: Phaser.GameObjects.Text
  speechPanel: Phaser.GameObjects.Image
  routeKey: string
  pantryAction?: PantryAnimation
  stateMachine: ActorStateMachine
  gait: CharacterGait
  route: WorldPoint[]
  routeIndex: number
  actor: OfficeGameActor
  requestedActor: OfficeGameActor
  actorIndex: number
  idleActivity: IdleActivity
  goal: WorldPoint | null
  seatedGoal: boolean
  chairId: string | null
  approachPoint?: WorldPoint
  settled: boolean
  blocked: boolean
  stalledMs: number
  blockedOccupancy: string | null
  retryAt: number
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
export const OFFICE_RENDER_SCALE = 2
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
// Keep the monitor wider than a seated character's head so its edges remain visible.
const DESK_ASSET_SCALE = 1
const CHAIR_ASSET_SCALE = 1.33
const FURNITURE_WALK_CLEARANCE = 2
type FurnitureDirection = typeof FURNITURE_DIRECTIONS[number]
const directionalFurnitureAssets = import.meta.glob('../assets/pixel-office/furniture/directional/*.png', {
  eager: true, query: '?url', import: 'default'
}) as Record<string, string>
const staffWalkAssets = import.meta.glob('../assets/pixel-office/characters/walk-v6/*.png', {
  eager: true, query: '?url', import: 'default'
}) as Record<string, string>
const staffSeatedAssets = import.meta.glob('../assets/pixel-office/characters/seated-v1/*.png', {
  eager: true, query: '?url', import: 'default'
}) as Record<string, string>
const staffPantryAssets = import.meta.glob('../assets/pixel-office/characters/pantry-v1/*.png', {
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
const OFFICE_FONT_FAMILY = '"Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif'
// Normalized frames center the character art on the sprite and nameplate.
const CEO_SPRITE_ART_X_OFFSET = 0
const CEO_LABEL_GAP = 6
const SPEECH_BUBBLE_WIDTH = 176
const SPEECH_BUBBLE_HEIGHT = 48
const ACTOR_COLLISION_HALF_WIDTH = ACTOR_NAV_HALF_WIDTH
const ACTOR_COLLISION_HALF_HEIGHT = ACTOR_NAV_HALF_HEIGHT
// Same size as the CEO sprite (createRepresentativeActor) so every
// character in the office reads at a consistent scale, animated or not.
const ACTOR_SPRITE_WIDTH = 104
const ACTOR_SPRITE_HEIGHT = 120
const ACTOR_SPRITE_Y_OFFSET = -64
// The layered meeting table and its bookcase leave its far chair 8 tiles
// from free floor. The final seat segment still checks walls and other seats.
const SEAT_ACCESS_RADIUS = 144

function furnitureDisplaySize(frame: number, columns: number, rows: number): { width: number; height: number } {
  const scale = frame === DESK_FURNITURE_FRAME ? DESK_ASSET_SCALE
    : [12, 13, 14].includes(frame) ? CHAIR_ASSET_SCALE : 1
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
  private furnitureBoundsByTexture = new Map<string, CollisionRect>()
  private seatedFrameAnchors = new Map<string, WorldPoint>()
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
  private representativeSeatedForeground?: Phaser.GameObjects.Sprite
  private representativeWorkElapsedMs = 0
  private representativeLabel?: Phaser.GameObjects.Text
  private representativeDestination?: Phaser.GameObjects.Arc
  private representativeRoute: WorldPoint[] = []
  private representativeGoal: WorldPoint | null = null
  private representativeStalledMs = 0
  private representativeNavigationRevision = -1
  private representativeGait = new CharacterGait('ceo')
  private representativeChairTarget: string | null = null
  private representativeSeat: { chairId: string; approach: WorldPoint; center: WorldPoint } | null = null
  private representativePantryTarget: string | null = null
  private representativePantryAction?: PantryAnimation
  private representativeSpeechBubble?: Phaser.GameObjects.Image
  private representativeSpeech?: Phaser.GameObjects.Text
  private pantryHint?: Phaser.GameObjects.Text
  // Persisted (not just in-memory) so whichever piece was placed/edited most
  // recently keeps rendering on top of anything it overlaps even after a
  // reload, instead of only for the rest of the current session.
  private zOrderById = new Map<string, number>()
  private nextZOrder = 1
  private floorLayers: Phaser.GameObjects.TileSprite[] = []
  private selectedFloor = DEFAULT_FLOOR_TEXTURE
  private simulationTimeMs = 0
  private navigationRevision = 0
  private navigationLayoutKey = ''

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
    if (editing) {
      this.pantryHint?.setVisible(false)
      this.hideRepresentativeSpeech()
      if (this.representativePantryTarget) {
        this.stopRepresentativePantryAction()
        this.stopRepresentativeMovement()
      }
      this.standRepresentative()
      this.representativeSprite?.anims.pause()
    } else if (this.representativeSprite) {
      this.standRepresentative()
      if (!this.representativeSeat) this.repairRepresentativePosition()
      if (this.representativeGoal) this.planRepresentativeRoute()
      this.updateRepresentativeDepth()
    }
    this.actors.forEach((view) => {
      if (editing) {
        view.sprite.anims.pause()
      } else {
        this.updateActor(view, this.effectiveActor(view), view.actorIndex)
        this.updateActorDepth(view)
      }
    })
    if (!editing) this.selectFurniture(null)
    return true
  }

  isLayoutEditing(): boolean {
    return this.layoutEditing
  }

  preload(): void {
    ;[row1, row2, row3, row4].forEach((url, index) => this.load.image(`roster-row-${index}`, url))
    this.load.image('ceo-animation-sheet', ceoAnimationSheet)
    this.load.image('ceo-seated-sheet', ceoSeatedSheet)
    this.load.image('ceo-pantry-sheet', ceoPantrySheet)
    this.load.image('speech-bubble', speechBubbleAsset)
    for (const { id, file } of STAFF_WALK_SHEETS) {
      const url = staffWalkAssets[`../assets/pixel-office/characters/walk-v6/${file}`]
      if (!url) throw new Error(`Missing employee walk sheet: ${file}`)
      this.load.image(`staff-walk-${id}`, url)
    }
    for (const { team, file } of STAFF_SEATED_SHEETS) {
      const url = staffSeatedAssets[`../assets/pixel-office/characters/seated-v1/${file}`]
      if (!url) throw new Error(`Missing employee seated sheet: ${file}`)
      this.load.image(`staff-seated-${team}`, url)
    }
    for (const { id, file } of STAFF_PANTRY_SHEETS) {
      const url = staffPantryAssets[`../assets/pixel-office/characters/pantry-v1/${file}`]
      if (!url) throw new Error(`Missing employee pantry sheet: ${file}`)
      this.load.image(`staff-pantry-${id}`, url)
    }
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
      .setZoom(OFFICE_RENDER_SCALE)
      .centerOn(OFFICE_WORLD_WIDTH / 2, OFFICE_WORLD_HEIGHT / 2)
    this.createWorld()
    this.createLayoutEditor()
    this.createRosterFrames()
    this.createStaffWalkFrames()
    this.createStaffPantryFrames()
    for (const { team } of STAFF_SEATED_SHEETS) {
      this.createCharacterFrames(`staff-seated-${team}`,
        (column, row) => `actor-${team}-${column}-sit-${SEATED_ROW_NAMES[row]}`, 'seated')
    }
    this.createCeoFrames()
    this.createRepresentativeActor()
    this.navigationLayoutKey = this.furnitureNavigationKey()
    if (this.pendingSnapshot) this.applySnapshot(this.pendingSnapshot)
    this.reportDeskCounts()
  }

  update(_time: number, delta: number): void {
    if (!this.layoutEditing) {
      const elapsed = Math.min(delta, 50)
      this.simulationTimeMs += elapsed
      this.updateIdleActivities()
      this.updateActorMovement(elapsed / 1000)
      this.updateActorPantryActions(elapsed)
      this.updateRepresentativeMovement(elapsed / 1000)
      this.updateRepresentativePantryAction(elapsed)
      this.updateRepresentativeWorkAnimation(elapsed)
    }
    this.updateRepresentativeLabelPosition()
    this.actors.forEach((view) => this.updateActorOverlayPosition(view))
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
    // Floor position determines front/back order. Saved selection order only
    // breaks ties between pieces at the same Y coordinate.
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
      if (!this.layoutEditing) {
        if (pointer.leftButtonDown() && !pointer.event.shiftKey && !pointer.event.ctrlKey &&
          !pointer.event.metaKey && !pointer.event.altKey) {
          if ([12, 13, 14].includes(frame)) this.sitRepresentativeOn(id)
          else if ([0, 1, 2].includes(frame) && !this.interactRepresentativeWith(id)) {
            this.showPantryHint(id, '지금은 가까이 갈 수 없어요')
          }
        }
        return
      }
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
      if (this.layoutEditing && this.multiSelectedIds.has(id) && this.multiSelectedIds.size > 1) {
        this.bringFurnitureToFront(id)
        this.saveFurnitureLayout()
        return
      }
      this.selectFurniture(id)
    })
    image.on('pointerover', () => {
      if (!this.layoutEditing && [0, 1, 2].includes(frame)) {
        this.showPantryHint(id, frame === 0 ? '클릭해서 커피 마시기' : '클릭해서 간식 먹기')
      }
    })
    image.on('pointerout', () => this.pantryHint?.setVisible(false))
    image.on('dragstart', () => {
      // Input remains bound outside editing; that must not change layer order.
      if (!this.layoutEditing) return
      image.setData({ dragStartX: image.x, dragStartY: image.y })
      // Resolve equal-position ties without lifting rear furniture over the front.
      this.bringFurnitureToFront(id)
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
      this.refreshFurnitureDepths()
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
    this.refreshFurnitureDepths()
    return image
  }

  // The palette/floor-picker/remove-buttons used to render as Phaser objects
  // overlapping the bottom of the office scene itself. They now live in
  // LayoutEditorPanel (React, below the canvas) and drive this scene through
  // the public editor methods + setEditorStateHandler below - this only
  // wires the one interaction that has to stay at the Phaser/input level.
  private createLayoutEditor(): void {
    this.input.mouse?.disableContextMenu()
    // A plain click selects; movement starts a drag separately.
    this.input.dragDistanceThreshold = 4
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
        .setDepth(this.editorOverlayDepth())
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
    if (!this.selectedFurniture) {
      this.notifyEditorState()
      return
    }
    const { image } = this.selectedFurniture
    this.bringFurnitureToFront(id)
    this.saveFurnitureLayout()
    this.selectionOutline = this.add.rectangle(image.x, image.y, image.displayWidth + 6, image.displayHeight + 6)
      .setDepth(this.editorOverlayDepth())
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
        .setDepth(this.editorOverlayDepth())
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
    this.bringFurnitureToFront(id)
    const outline = this.add.rectangle(
      view.image.x, view.image.y, view.image.displayWidth + 6, view.image.displayHeight + 6
    ).setStrokeStyle(3, 0x6ea8fe).setDepth(this.editorOverlayDepth())
    this.multiSelectOutlines.set(id, outline)
  }

  private removeFromMultiSelection(id: string): void {
    this.multiSelectedIds.delete(id)
    this.multiSelectOutlines.get(id)?.destroy()
    this.multiSelectOutlines.delete(id)
  }

  private setMultiSelection(ids: string[]): void {
    if (!this.layoutEditing) return
    // A marquee selects a group simultaneously, preserving its internal order.
    const orderedIds = [...ids].sort((a, b) =>
      (this.furniture.get(a)?.image.depth ?? 0) - (this.furniture.get(b)?.image.depth ?? 0))
    // Also drops any active single-piece selection - only one selection mode
    // is active at a time.
    this.selectFurniture(null)
    orderedIds.forEach((id) => this.addToMultiSelection(id))
    if (orderedIds.length > 0) this.saveFurnitureLayout()
    this.notifyEditorState()
  }

  private toggleFurnitureSelection(id: string): void {
    if (!this.layoutEditing) return
    if (this.selectedFurniture) {
      // Promote the existing single selection into the multi-select set
      // first, so shift+clicking a second piece builds up a selection
      // instead of discarding what was already picked.
      const previousId = this.selectedFurniture.id
      this.selectedFurniture = null
      this.selectionOutline?.destroy()
      this.selectionOutline = undefined
      if (previousId === id) {
        this.notifyEditorState()
        return
      }
      this.addToMultiSelection(previousId)
    }
    if (this.multiSelectedIds.has(id)) {
      this.removeFromMultiSelection(id)
    } else {
      this.addToMultiSelection(id)
      this.saveFurnitureLayout()
    }
    this.notifyEditorState()
  }

  addFurnitureFromPalette(frame: number): void {
    if (!this.layoutEditing) return
    const id = `custom-${Date.now()}-${this.nextFurnitureId++}`
    const point = this.findFreeFurniturePoint(frame)
    const image = this.addFurniture(id, frame, point.x, point.y, 64, 64)
    this.bringFurnitureToFront(id)
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
    this.refreshNavigationLayout()
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
    this.refreshNavigationLayout()
  }

  private furnitureNavigationKey(): string {
    return [...this.furniture.values()].map(({ id, frame, image }) =>
      `${id}:${frame}:${image.x}:${image.y}:${image.displayWidth}:${image.displayHeight}:${this.furnitureRotation(image)}`).join('|')
  }

  private refreshNavigationLayout(): void {
    this.refreshFurnitureDepths()
    const key = this.furnitureNavigationKey()
    if (key !== this.navigationLayoutKey) {
      this.navigationLayoutKey = key
      this.navigationRevision += 1
    }
  }

  private collisionRects(excludedIds: ReadonlySet<string> = new Set(), clearance = FURNITURE_WALK_CLEARANCE): CollisionRect[] {
    const furnitureRects = [...this.furniture.values()]
      .filter(({ id, frame }) => !excludedIds.has(id) && !STACKABLE_FURNITURE_FRAMES.has(frame))
      .map(({ image }) => this.furnitureWalkCollision(image, clearance))
    return [...OFFICE_WALL_COLLISIONS, ...furnitureRects]
  }

  private furnitureTextureBounds(image: Phaser.GameObjects.Image): CollisionRect {
    const key = image.texture.key
    const cached = this.furnitureBoundsByTexture.get(key)
    if (cached) return cached
    const pixels = this.furnitureTexturePixels(image)
    const bounds = measureFurnitureBounds(pixels.data, pixels.width, pixels.height)
    this.furnitureBoundsByTexture.set(key, bounds)
    return bounds
  }

  private furnitureTexturePixels(image: Phaser.GameObjects.Image): ImageData {
    const source = image.texture.getSourceImage() as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(source, 0, 0)
    const pixels = context.getImageData(0, 0, source.width, source.height)
    return pixels
  }

  private furnitureWalkCollision(image: Phaser.GameObjects.Image, clearance = FURNITURE_WALK_CLEARANCE): CollisionRect {
    // PNG padding is empty floor. Only the visible furniture blocks walking;
    // the actor's foot collider already supplies most of the required clearance.
    const bounds = this.furnitureTextureBounds(image)
    return {
      x: image.x + (bounds.x - image.originX) * image.displayWidth - clearance,
      y: image.y + (bounds.y - image.originY) * image.displayHeight - clearance,
      width: bounds.width * image.displayWidth + clearance * 2,
      height: bounds.height * image.displayHeight + clearance * 2
    }
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

  // Selection order is retained only for furniture sharing a floor position.
  private bringFurnitureToFront(id: string): void {
    const view = this.furniture.get(id)
    if (!view) return
    this.zOrderById.set(id, this.nextZOrder++)
    this.refreshFurnitureDepths()
    const overlayDepth = this.editorOverlayDepth()
    this.selectionOutline?.setDepth(overlayDepth)
    this.multiSelectOutlines.forEach((outline) => outline.setDepth(overlayDepth))
    this.marqueeRect?.setDepth(overlayDepth)
  }

  private furnitureDepthBonus(id: string): number {
    const zOrder = Math.max(0, this.zOrderById.get(id) ?? 0)
    return 0.1 * zOrder / (zOrder + 1)
  }

  private refreshFurnitureDepths(): void {
    for (const { id, image } of this.furniture.values()) {
      image.setDepth(image.y + this.furnitureDepthBonus(id))
    }
    // A laptop rests on the tabletop, even when its center is further north
    // than the table's center. It must not jump in front of unrelated furniture.
    for (const { frame, image } of this.furniture.values()) {
      if (!STACKABLE_FURNITURE_FRAMES.has(frame)) continue
      const propBounds = this.furnitureWalkCollision(image, 0)
      for (const support of this.furniture.values()) {
        if (![DESK_FURNITURE_FRAME, 6, 16].includes(support.frame)) continue
        const bounds = this.furnitureWalkCollision(support.image, 0)
        if (intersectsAabb(propBounds, bounds)) {
          image.setDepth(Math.max(image.depth, support.image.depth + 0.25))
        }
      }
    }
  }

  private maxFurnitureDepth(): number {
    let max = 0
    this.furniture.forEach(({ image }) => { if (image.depth > max) max = image.depth })
    return max
  }

  private editorOverlayDepth(): number {
    return this.maxFurnitureDepth() + OFFICE_WORLD_HEIGHT + 2
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
    this.addOfficeText(x + 10, y + 8, label, {
      fontSize: '12px', color: '#17362e', backgroundColor: '#dff3ed'
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
        const label = this.addOfficeText(point.x - 36, point.y - 33, `Team ${teamNames[teamIndex]}`, {
          fontSize: '11px', color: '#111111'
        }).setPadding(4, 4).setDepth(3)
        this.teamLabels.set(deskId, label)
      }
    }
    // Created right after its own desk, so on a fresh install (nothing in
    // zOrderById yet) it gets a stable tie breaker. Its floor position keeps
    // the chair in front of the desk, whether empty or occupied.
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
    const notice = this.addOfficeText(480, 30, text, {
      fontSize: '12px', color: '#ffffff', backgroundColor: '#7a2222'
    }).setOrigin(0.5, 0).setPadding(6, 6).setDepth(this.editorOverlayDepth())
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

  private createStaffWalkFrames(): void {
    for (const { id } of STAFF_WALK_SHEETS) {
      this.createCharacterFrames('staff-walk-' + id,
        (column, row) => 'actor-' + id + '-' + WALK_ROW_NAMES[row] + '-' + column, 'walk')
    }
  }

  private animationAtlasFor(actor: OfficeGameActor): string | null {
    return actor.teamIndex >= 0 && actor.teamIndex <= 2
      ? 'staff-walk-' + this.actorAnimationKey(actor) + '-frames' : null
  }

  private createStaffPantryFrames(): void {
    for (const { id } of STAFF_PANTRY_SHEETS) {
      this.createCharacterFrames(`staff-pantry-${id}`, (column, row) =>
        `actor-${id}-${row < 2 ? 'drinking' : 'eating'}-${(row % 2) * 3 + column}`, 'pantry')
    }
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

  private addOfficeText(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    const label = this.add.text(x, y, text, {
      fontFamily: OFFICE_FONT_FAMILY,
      fontStyle: '600',
      resolution: 3,
      ...style
    })
    // Text needs smooth sampling when its high-resolution canvas is scaled
    // down; the scene's pixel-art texture filter would drop thin glyph strokes.
    label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
    return label
  }

  private createRepresentativeActor(): void {
    // Movement, collision, and click destinations all use the feet as the
    // anchor. The old centered sprite's feet were at (835, 871).
    const obstacles = [...this.collisionRects(), ...this.actorObstacles(undefined, false)]
    const saved = parseRepresentativePosition(localStorage.getItem(OFFICE_REPRESENTATIVE_SAVE_KEY))
    const initial = (saved && nearestOfficePosition(saved, obstacles))
      || nearestOfficePosition({ x: 832, y: 736 }, obstacles)
      || nearestOfficePosition({ x: 835, y: 871 }, obstacles)
      || { x: 832, y: 736 }
    this.representativeSprite = this.add.sprite(initial.x, initial.y, 'ceo-animation-sheet-frames', 'ceo-idle-0')
      .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT).setOrigin(0.5, 1)
    this.representativeSeatedForeground = this.add.sprite(0, 0, 'ceo-seated-sheet-frames', 'ceo-sit-front')
      .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT).setOrigin(0.5, 1).setVisible(false)
    this.representativeLabel = this.addOfficeText(0, 0, '김태호 대표', {
      fontSize: '13px', color: '#111111', align: 'center'
    }).setOrigin(0.5, 1).setPadding(4, 4).setDepth(700)
    this.representativeSpeechBubble = this.add.image(0, 0, 'speech-bubble', 'panel')
      .setOrigin(0.5, 1).setDisplaySize(SPEECH_BUBBLE_WIDTH, SPEECH_BUBBLE_HEIGHT).setVisible(false)
    this.representativeSpeech = this.addOfficeText(0, 0, '', {
      fontSize: '12px', color: '#23443e', align: 'center'
    }).setOrigin(0.5, 0.5).setVisible(false)
    this.representativeDestination = this.add.circle(0, 0, 7, 0x74c9f5, 0.2)
      .setStrokeStyle(2, 0x74c9f5).setDepth(2).setVisible(false)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // Furniture editing and employee selection retain their own clicks.
      if (this.layoutEditing || !pointer.leftButtonDown() || over.length > 0 ||
        pointer.event.shiftKey || pointer.event.ctrlKey || pointer.event.metaKey || pointer.event.altKey) return
      this.moveRepresentativeTo({ x: pointer.worldX, y: pointer.worldY })
    })
    this.updateRepresentativeDepth()
    this.updateRepresentativeLabelPosition()
  }

  moveRepresentativeTo(point: WorldPoint): boolean {
    const sprite = this.representativeSprite
    if (this.layoutEditing || !sprite || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
    const collisions = this.collisionRects()
    if (!isOfficePositionWalkable(point, collisions)) return false
    const departure = this.representativeDeparturePoint()
    if (!departure) return false
    const route = findOfficePath(departure, point, collisions)
    if (route.length === 0 && Math.hypot(departure.x - point.x, departure.y - point.y) >= 0.5) return false
    if (!this.standRepresentative()) return false
    this.stopRepresentativePantryAction()
    this.representativeChairTarget = null
    this.representativeGoal = { ...point }
    this.representativeStalledMs = 0
    this.planRepresentativeRoute()
    this.representativeDestination?.setPosition(point.x, point.y).setVisible(true)
    if (Math.hypot(sprite.x - point.x, sprite.y - point.y) < 0.5) this.stopRepresentativeMovement()
    return true
  }

  /** Reserve a free chair, walk to its accessible edge, then sit on its seat. */
  sitRepresentativeOn(chairId: string): boolean {
    if (this.layoutEditing || !this.representativeSprite) return false
    const chair = this.furniture.get(chairId)
    if (!chair || ![12, 13, 14].includes(chair.frame)) return false
    if (this.representativeSeat?.chairId === chairId) return true
    if (!this.representativeChairAvailable(chair, true)) return false
    const departure = this.representativeDeparturePoint()
    if (!departure || !this.representativeChairApproach(chair, departure)) return false
    if (!this.standRepresentative()) return false
    this.stopRepresentativePantryAction()
    this.representativeChairTarget = chairId
    this.representativeStalledMs = 0
    this.planRepresentativeRoute()
    return true
  }

  /** Approach the clicked furniture's live position before taking a break. */
  interactRepresentativeWith(furnitureId: string): boolean {
    if (this.layoutEditing || !this.representativeSprite) return false
    const furniture = this.furniture.get(furnitureId)
    if (!furniture || ![0, 1, 2].includes(furniture.frame)) return false
    if (this.representativePantryTarget === furnitureId) return true
    const departure = this.representativeDeparturePoint()
    if (!departure || !this.representativePantryApproach(furniture, departure)) return false
    if (!this.standRepresentative()) return false
    this.stopRepresentativePantryAction()
    this.representativeChairTarget = null
    this.representativePantryTarget = furnitureId
    this.representativeStalledMs = 0
    this.showRepresentativeSpeech(furniture.frame === 0 ? '커피 마시러 가는 중' : '간식 먹으러 가는 중')
    this.pantryHint?.setVisible(false)
    this.planRepresentativeRoute()
    return true
  }

  private showPantryHint(id: string, text: string): void {
    const furniture = this.furniture.get(id)
    if (!furniture) return
    if (!this.pantryHint) {
      this.pantryHint = this.addOfficeText(0, 0, '', {
        fontSize: '12px', color: '#ffffff', backgroundColor: '#23443e', align: 'center'
      }).setOrigin(0.5, 0).setPadding(8, 5).setDepth(OFFICE_WORLD_HEIGHT * 3)
    }
    const point = this.pantryServicePoint(furniture)
    this.pantryHint.setText(text).setPosition(Phaser.Math.Clamp(point.x, 110, OFFICE_WORLD_WIDTH - 110), point.y + 12)
      .setVisible(true)
  }

  private pantryServicePoint(furniture: FurnitureView): WorldPoint {
    const bounds = this.furnitureWalkCollision(furniture.image, 0)
    return { x: furniture.image.x, y: bounds.y + bounds.height }
  }

  private pantryAccessCollisions(furniture: FurnitureView): CollisionRect[] {
    const excluded = new Set([furniture.id])
    const bounds = this.furnitureWalkCollision(furniture.image, 0)
    // Reaching for a cup on a side table is allowed; the walking route still
    // respects both objects. No other furniture or walls are bypassed.
    for (const view of this.furniture.values()) {
      if (furniture.frame === 0 && view.frame === 16 &&
        intersectsAabb(bounds, this.furnitureWalkCollision(view.image, 0))) excluded.add(view.id)
    }
    return this.collisionRects(excluded, 0)
  }

  private representativeCanUsePantry(furniture: FurnitureView, from: WorldPoint): boolean {
    const point = this.pantryServicePoint(furniture)
    return [0, 1, 2].includes(furniture.frame) && isOfficePositionWalkable(from, this.collisionRects()) &&
      Math.hypot(from.x - point.x, from.y - point.y) <= 64 &&
      hasOfficeLineOfSight(from, point, this.pantryAccessCollisions(furniture))
  }

  private representativePantryApproach(furniture: FurnitureView, from: WorldPoint): WorldPoint | null {
    const actors = this.actorObstacles(undefined, false)
    if (this.representativeCanUsePantry(furniture, from) && isOfficePositionWalkable(from, actors)) return { x: from.x, y: from.y }
    const point = this.pantryServicePoint(furniture)
    const collisions = this.collisionRects()
    const access = this.pantryAccessCollisions(furniture)
    // Prefer a free service position. If an employee temporarily blocks the
    // only approach, keep the static route and wait without crossing them.
    const route = findOfficePath(from, point, [...collisions, ...actors], { goalRadius: 64, goalCollisions: [...access, ...actors] })
    return route.at(-1) ?? findOfficePath(from, point, collisions, { goalRadius: 64, goalCollisions: access }).at(-1) ?? null
  }

  private startRepresentativePantryAction(): void {
    const sprite = this.representativeSprite
    const furniture = this.representativePantryTarget && this.furniture.get(this.representativePantryTarget)
    if (!sprite || !furniture || !this.representativeCanUsePantry(furniture, sprite)) {
      this.stopRepresentativePantryAction()
      return
    }
    const action = furniture.frame === 0 ? 'drinking' : 'eating'
    this.representativePantryAction = { action, elapsedMs: 0, pose: 0 }
    this.showRepresentativeSpeech(action === 'drinking' ? '커피 마시는 중' : '간식 먹는 중')
    this.applyRepresentativePantryPose()
  }

  private stopRepresentativePantryAction(): void {
    if (this.representativePantryAction) this.applyRepresentativePose({ frame: 'ceo-idle-0', flipX: false })
    this.representativePantryAction = undefined
    this.representativePantryTarget = null
    this.hideRepresentativeSpeech()
  }

  private applyRepresentativePantryPose(): void {
    const state = this.representativePantryAction
    if (!state) return
    this.representativeSprite?.stop().setTexture('ceo-pantry-sheet-frames', `ceo-${state.action}-${state.pose}`)
      .setCrop().setFlipX(false).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
    this.representativeSeatedForeground?.setVisible(false)
  }

  private updateRepresentativePantryAction(deltaMs: number): void {
    const state = this.representativePantryAction
    if (!state) return
    state.elapsedMs += deltaMs
    const pose = pantryPoseAt(state.action, state.elapsedMs)
    if (pose === null) {
      this.stopRepresentativePantryAction()
    } else if (pose !== state.pose) {
      state.pose = pose
      this.applyRepresentativePantryPose()
    }
  }

  private showRepresentativeSpeech(text: string): void {
    this.representativeSpeech?.setText(text).setVisible(true)
    this.representativeSpeechBubble?.setVisible(true)
    this.updateRepresentativeLabelPosition()
  }

  private hideRepresentativeSpeech(): void {
    this.representativeSpeech?.setVisible(false)
    this.representativeSpeechBubble?.setVisible(false)
  }

  private representativeChairAvailable(chair: FurnitureView, checkReservations = false): boolean {
    return ![...this.actors.values()].some((view) =>
      intersectsAabb(actorCollisionRect(view.container), actorCollisionRect(chair.image)) ||
      (checkReservations && view.seatedGoal && view.goal &&
        Math.hypot(view.goal.x - chair.image.x, view.goal.y - chair.image.y) < 16))
  }

  private chairAccessCollisions(chair: FurnitureView, actor?: ActorView, includeActors = true): CollisionRect[] {
    const excluded = new Set([chair.id])
    const seat = this.furnitureWalkCollision(chair.image, 0)
    // Chairs can be tucked under desks or meeting tables. Their overlapping
    // tabletop permits the short seating step; every other object still blocks it.
    for (const view of this.furniture.values()) {
      const bounds = this.furnitureWalkCollision(view.image, 0)
      if ([DESK_FURNITURE_FRAME, 6, 16].includes(view.frame) &&
        (intersectsAabb(seat, bounds) || intersectsAabb(actorCollisionRect(chair.image), bounds))) {
        excluded.add(view.id)
      }
    }
    // The final pose change has no walking stride. Keep other furniture's
    // full visual bounds, but allow the extra shoe clearance to close here.
    return [...this.collisionRects(excluded, 0), ...(includeActors ? this.actorObstacles(actor, Boolean(actor)) : [])]
  }

  private representativeChairApproach(chair: FurnitureView, from: WorldPoint): WorldPoint | null {
    const collisions = this.collisionRects()
    const access = this.chairAccessCollisions(chair)
    if (isOfficePositionWalkable(from, collisions) &&
      Math.hypot(from.x - chair.image.x, from.y - chair.image.y) <= 64 &&
      hasOfficeLineOfSight(from, chair.image, access)) return { x: from.x, y: from.y }
    const route = findOfficePath(from, chair.image, collisions, { goalRadius: SEAT_ACCESS_RADIUS, goalCollisions: access })
    return route.at(-1) ?? null
  }

  private representativeDeparturePoint(): WorldPoint | null {
    const sprite = this.representativeSprite
    if (!sprite) return null
    const seat = this.representativeSeat
    if (!seat) return { x: sprite.x, y: sprite.y }
    const chair = this.furniture.get(seat.chairId)
    const center = chair?.image ?? seat.center
    const collisions = [...this.collisionRects(), ...this.actorObstacles(undefined, false)]
    const access = chair ? this.chairAccessCollisions(chair) : collisions
    const candidates = [seat.approach]
    for (let dx = -SEAT_ACCESS_RADIUS; dx <= SEAT_ACCESS_RADIUS; dx += 16) {
      for (let dy = -SEAT_ACCESS_RADIUS; dy <= SEAT_ACCESS_RADIUS; dy += 16) {
        if (Math.hypot(dx, dy) <= SEAT_ACCESS_RADIUS) candidates.push({ x: center.x + dx, y: center.y + dy })
      }
    }
    return candidates.find((point) => isOfficePositionWalkable(point, collisions) &&
      hasOfficeLineOfSight(center, point, access)) ?? null
  }

  private standRepresentative(): boolean {
    if (!this.representativeSeat) return true
    const point = this.representativeDeparturePoint()
    if (!point || !this.representativeSprite) return false
    this.representativeSeat = null
    this.representativeSprite.setPosition(point.x, point.y)
    this.applyRepresentativePose(this.representativeGait.stop())
    this.updateRepresentativeDepth()
    this.persistRepresentativePosition()
    return true
  }

  private planRepresentativeRoute(): void {
    const sprite = this.representativeSprite
    if (!sprite) return
    if (this.representativePantryTarget) {
      const furniture = this.furniture.get(this.representativePantryTarget)
      const approach = furniture && this.representativePantryApproach(furniture, sprite)
      if (!furniture || !approach) {
        this.stopRepresentativePantryAction()
        this.stopRepresentativeMovement()
        return
      }
      this.representativeGoal = approach
      this.representativeDestination?.setPosition(approach.x, approach.y).setVisible(true)
    }
    if (this.representativeChairTarget) {
      const chair = this.furniture.get(this.representativeChairTarget)
      const approach = chair && this.representativeChairAvailable(chair) &&
        this.representativeChairApproach(chair, sprite)
      if (!chair || !approach) {
        this.representativeChairTarget = null
        this.stopRepresentativeMovement()
        return
      }
      this.representativeGoal = approach
      this.representativeDestination?.setPosition(chair.image.x, chair.image.y).setVisible(true)
    }
    const goal = this.representativeGoal
    if (!goal) return
    const collisions = this.collisionRects()
    const route = findOfficePath(sprite, goal, [...collisions, ...this.actorObstacles(undefined, false)])
    // A passing employee may temporarily block the only path. Keep the
    // destination and wait at that obstruction, retrying without walking in place.
    this.representativeRoute = route.length > 0 ? route : findOfficePath(sprite, goal, collisions)
    this.representativeNavigationRevision = this.navigationRevision
    if (this.representativeRoute.length === 0) this.stopRepresentativeMovement()
  }

  private repairRepresentativePosition(): void {
    const sprite = this.representativeSprite
    if (!sprite) return
    const obstacles = [...this.collisionRects(), ...this.actorObstacles(undefined, false)]
    if (isOfficePositionWalkable(sprite, obstacles)) return
    const free = nearestOfficePosition(sprite, obstacles)
    if (free && hasOfficeLineOfSight(sprite, free, OFFICE_WALL_COLLISIONS)) sprite.setPosition(free.x, free.y)
    this.persistRepresentativePosition()
  }

  private updateRepresentativeMovement(deltaSeconds: number): void {
    const sprite = this.representativeSprite
    if (sprite && this.representativePantryAction && this.representativePantryTarget) {
      const furniture = this.furniture.get(this.representativePantryTarget)
      if (!furniture || !this.representativeCanUsePantry(furniture, sprite)) this.stopRepresentativePantryAction()
    }
    if (this.layoutEditing || !sprite || !this.representativeGoal || deltaSeconds <= 0) return
    if (this.representativeNavigationRevision !== this.navigationRevision) this.planRepresentativeRoute()
    const goal = this.representativeGoal
    if (!goal) return
    let target = this.representativeRoute[0]
    while (target && Math.hypot(target.x - sprite.x, target.y - sprite.y) < 0.5) {
      sprite.setPosition(target.x, target.y)
      this.representativeRoute.shift()
      target = this.representativeRoute[0]
    }
    if (!target) {
      this.stopRepresentativeMovement()
      return
    }
    const dx = target.x - sprite.x
    const dy = target.y - sprite.y
    const distance = Math.hypot(dx, dy)
    const amount = Math.min(distance, 120 * deltaSeconds)
    const resolved = resolveAxisSeparated(sprite,
      { x: sprite.x + dx / distance * amount, y: sprite.y + dy / distance * amount },
      [...this.collisionRects(), ...this.actorObstacles(undefined, false)],
      ACTOR_COLLISION_HALF_WIDTH, ACTOR_COLLISION_HALF_HEIGHT)
    const movedX = resolved.x - sprite.x
    const movedY = resolved.y - sprite.y
    if (Math.hypot(movedX, movedY) < 0.01) {
      this.applyRepresentativePose(this.representativeGait.stop())
      this.representativeStalledMs += deltaSeconds * 1000
      if (this.representativeStalledMs >= 500) {
        this.representativeStalledMs = 0
        this.planRepresentativeRoute()
      }
      return
    }
    this.representativeStalledMs = 0
    sprite.setPosition(resolved.x, resolved.y)
    this.applyRepresentativePose(this.representativeGait.advance(movedX, movedY))
    this.updateRepresentativeDepth()
    if (Math.hypot(goal.x - sprite.x, goal.y - sprite.y) < 0.5) {
      sprite.setPosition(goal.x, goal.y)
      this.stopRepresentativeMovement()
    }
  }

  private stopRepresentativeMovement(): void {
    const chair = this.representativeChairTarget ? this.furniture.get(this.representativeChairTarget) : null
    const sprite = this.representativeSprite
    const arrived = sprite && this.representativeGoal &&
      Math.hypot(sprite.x - this.representativeGoal.x, sprite.y - this.representativeGoal.y) < 0.5
    this.representativeChairTarget = null
    this.representativeRoute = []
    this.representativeGoal = null
    this.representativeStalledMs = 0
    this.applyRepresentativePose(this.representativeGait.stop())
    if (arrived && sprite && chair && this.representativeChairAvailable(chair) &&
      Math.hypot(sprite.x - chair.image.x, sprite.y - chair.image.y) <= SEAT_ACCESS_RADIUS &&
      hasOfficeLineOfSight(sprite, chair.image, this.chairAccessCollisions(chair))) {
      this.representativeSeat = { chairId: chair.id, approach: { x: sprite.x, y: sprite.y },
        center: { x: chair.image.x, y: chair.image.y } }
      const direction = this.furnitureDirection(this.furnitureRotation(chair.image))
      sprite.setTexture('ceo-seated-sheet-frames', `ceo-sit-${direction}`)
        .setFlipX(false).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
        .setPosition(chair.image.x, chair.image.y)
    }
    if (this.representativePantryTarget) {
      if (arrived) this.startRepresentativePantryAction()
      else this.stopRepresentativePantryAction()
    }
    this.representativeDestination?.setVisible(false)
    this.updateRepresentativeDepth()
    this.persistRepresentativePosition()
  }

  private updateRepresentativeDepth(): void {
    const sprite = this.representativeSprite
    if (!sprite) return
    const chair = this.representativeSeat && this.furniture.get(this.representativeSeat.chairId)
    let headDepth: number
    if (chair && this.representativeSeatedForeground) {
      headDepth = this.applySeatedComposition(chair, sprite, this.representativeSeatedForeground, sprite)
      this.updateRepresentativeWorkAnimation(0)
    } else {
      sprite.setDepth(sprite.y).setCrop().setVisible(true)
      this.representativeSeatedForeground?.setVisible(false)
      headDepth = sprite.depth
    }
    this.representativeLabel?.setDepth(headDepth + OFFICE_WORLD_HEIGHT)
    this.representativeSpeechBubble?.setDepth(headDepth + OFFICE_WORLD_HEIGHT + 1)
    this.representativeSpeech?.setDepth(headDepth + OFFICE_WORLD_HEIGHT + 2)
  }

  private updateRepresentativeWorkAnimation(deltaMs: number): void {
    const sprite = this.representativeSprite
    const foreground = this.representativeSeatedForeground
    const chair = this.representativeSeat && this.furniture.get(this.representativeSeat.chairId)
    if (!sprite || !foreground) return
    // Only work at an actual nearby desk, including desks moved in the editor.
    // Meeting-room and standalone chairs retain the relaxed sitting pose.
    const atDesk = chair && [...this.furniture.values()].some((furniture) =>
      furniture.frame === DESK_FURNITURE_FRAME && intersectsAabb(
        this.furnitureWalkCollision(chair.image, 0), this.furnitureWalkCollision(furniture.image, 16)))
    if (!atDesk || this.layoutEditing) {
      this.representativeWorkElapsedMs = 0
      if (chair && foreground.texture.key === REPRESENTATIVE_WORK_TEXTURE) this.renderSeatedForeground(sprite, foreground)
      return
    }
    this.representativeWorkElapsedMs += deltaMs
    const direction = this.furnitureDirection(this.furnitureRotation(chair.image))
    const pose = representativeWorkPoseAt(this.representativeWorkElapsedMs)
    const frame = `ceo-work-${direction}-${pose}`
    if (foreground.texture.key !== REPRESENTATIVE_WORK_TEXTURE || foreground.frame.name !== frame) {
      foreground.setTexture(REPRESENTATIVE_WORK_TEXTURE, frame)
        .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
    }
  }

  private applySeatedComposition(chair: FurnitureView, sprite: Phaser.GameObjects.Sprite,
    foreground: Phaser.GameObjects.Sprite,
    depthTarget: Phaser.GameObjects.Sprite | Phaser.GameObjects.Container): number {
    const direction = this.furnitureDirection(this.furnitureRotation(chair.image))
    const behindBackrest = direction === 'back'
    const foot = seatedSpriteFoot(chair.image, direction, this.seatedFrameAnchor(sprite), sprite)
    if (sprite === depthTarget) sprite.setPosition(foot.x, foot.y)
    else sprite.setPosition(foot.x - depthTarget.x, foot.y - depthTarget.y - sprite.displayHeight / 2)
    // Sort the complete, unmodified pose at the chair's floor position.
    // Tables further south naturally cover the lap, while a back-facing
    // chair's own backrest covers the sitter without duplicating the chair.
    depthTarget.setDepth(chair.image.depth + (behindBackrest ? -0.25 : 0.25))
    sprite.setCrop().setVisible(false)
    this.renderSeatedForeground(sprite, foreground)
    foreground.setPosition(foot.x, foot.y).setDepth(depthTarget.depth).setVisible(true)
    return depthTarget.depth
  }

  private seatedFrameAnchor(sprite: Phaser.GameObjects.Sprite): WorldPoint {
    const anchor = this.seatedFrameAnchors.get(`${sprite.texture.key}/${sprite.frame.name}`)
    if (!anchor) throw new Error(`Missing seated contact point: ${sprite.texture.key}/${sprite.frame.name}`)
    return anchor
  }

  private renderSeatedForeground(sprite: Phaser.GameObjects.Sprite, foreground: Phaser.GameObjects.Sprite): void {
    foreground.setTexture(sprite.texture.key, sprite.frame.name).setCrop().setFlipX(sprite.flipX)
      .setDisplaySize(sprite.displayWidth, sprite.displayHeight)
  }

  private applyRepresentativePose(pose: CharacterPose): void {
    this.representativeWorkElapsedMs = 0
    this.representativeSprite?.stop().setTexture('ceo-animation-sheet-frames', pose.frame)
      .setCrop().setVisible(true).setFlipX(pose.flipX).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
    this.representativeSeatedForeground?.setVisible(false)
  }

  private persistRepresentativePosition(): void {
    if (!this.representativeSprite) return
    localStorage.setItem(OFFICE_REPRESENTATIVE_SAVE_KEY, JSON.stringify({
      // Reload on the free approach tile, never inside the chair's collision.
      x: this.representativeSeat?.approach.x ?? this.representativeSprite.x,
      y: this.representativeSeat?.approach.y ?? this.representativeSprite.y
    }))
  }

  private updateRepresentativeLabelPosition(): void {
    if (!this.representativeSprite || !this.representativeLabel) return
    const sprite = this.representativeSprite
    const label = this.representativeLabel
    const above = sprite.y - sprite.displayHeight * sprite.originY - CEO_LABEL_GAP
    label.setPosition(sprite.x + CEO_SPRITE_ART_X_OFFSET, above)
    const bubble = this.representativeSpeechBubble
    const speech = this.representativeSpeech
    if (bubble?.visible && speech) {
      const upperBottom = above - label.displayHeight - 4
      const below = upperBottom - SPEECH_BUBBLE_HEIGHT < 8
      // Only the speech changes vertical side. The name never moves away
      // from the head, even when its normal position reaches the top edge.
      const bottom = below ? sprite.y + 8 + SPEECH_BUBBLE_HEIGHT : upperBottom
      const halfWidth = SPEECH_BUBBLE_WIDTH / 2
      const x = Phaser.Math.Clamp(label.x, halfWidth + 8, OFFICE_WORLD_WIDTH - halfWidth - 8)
      bubble.setPosition(x, bottom).setFlipY(below)
      // Flip the panel's tail toward the actor, keeping the text upright.
      speech.setPosition(x, bottom - SPEECH_BUBBLE_HEIGHT * (below ? 0.38 : 0.62))
    }
  }

  private createCeoFrames(): void {
    const rowNames = ['idle', 'walk-down', 'walk-up', 'walk-left']
    this.createCharacterFrames('ceo-animation-sheet', (column, row) => `ceo-${rowNames[row]}-${column}`)
    // The generated side views are left, then right in reading order.
    const seatedDirections = ['front', 'left', 'back', 'right']
    this.createCharacterFrames('ceo-seated-sheet', (column, row) => `ceo-sit-${seatedDirections[row * 2 + column]}`)
    this.createRepresentativeWorkFrames()
    this.createCharacterFrames('ceo-pantry-sheet', (column, row) =>
      `ceo-${row < 2 ? 'drinking' : 'eating'}-${(row % 2) * 3 + column}`, 'pantry')
    const bubble = this.textures.get('speech-bubble')
    const source = bubble.getSourceImage() as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d')!
    context.drawImage(source, 0, 0)
    const bounds = measureFurnitureBounds(context.getImageData(0, 0, source.width, source.height).data, source.width, source.height)
    bubble.add('panel', 0, Math.floor(bounds.x * source.width), Math.floor(bounds.y * source.height),
      Math.ceil(bounds.width * source.width), Math.ceil(bounds.height * source.height))
  }

  private createRepresentativeWorkFrames(): void {
    const seated = this.textures.get('ceo-seated-sheet-frames')
    const source = seated.getSourceImage() as HTMLCanvasElement
    const input = source.getContext('2d')!
    const texture = this.textures.createCanvas(REPRESENTATIVE_WORK_TEXTURE,
      CHARACTER_FRAME_WIDTH * REPRESENTATIVE_WORK_POSES, CHARACTER_FRAME_HEIGHT * FURNITURE_DIRECTIONS.length)
    if (!texture) throw new Error('Could not create representative work frames')
    const context = texture.getContext()
    FURNITURE_DIRECTIONS.forEach((direction, row) => {
      const frame = seated.get(`ceo-sit-${direction}`)
      const pixels = input.getImageData(frame.cutX, frame.cutY, CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT)
      for (let pose = 0; pose < REPRESENTATIVE_WORK_POSES; pose += 1) {
        const output = context.createImageData(CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT)
        output.data.set(representativeWorkPixels(pixels.data, CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT, direction, pose))
        const x = pose * CHARACTER_FRAME_WIDTH
        const y = row * CHARACTER_FRAME_HEIGHT
        context.putImageData(output, x, y)
        texture.add(`ceo-work-${direction}-${pose}`, 0, x, y, CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT)
      }
    })
    texture.refresh()
  }

  private createCharacterFrames(sourceKey: string, frameName: (column: number, row: number) => string,
    kind: 'legacy' | 'walk' | 'seated' | 'pantry' = 'legacy'): string {
    const source = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement
    const layout = kind === 'pantry' ? { columns: 3, rows: [0, 1, 2, 3] }
      : kind === 'seated' ? { columns: 5, rows: SEATED_ROW_NAMES }
      : kind === 'walk' ? { columns: 4, rows: WALK_ROW_NAMES } : CHARACTER_SHEET_LAYOUTS[sourceKey as CharacterSheetKey]
    const key = `${sourceKey}-frames`
    const texture = this.textures.createCanvas(
      key, layout.columns * CHARACTER_FRAME_WIDTH, layout.rows.length * CHARACTER_FRAME_HEIGHT
    )
    if (!texture) throw new Error(`Could not create character frames: ${sourceKey}`)
    const input = document.createElement('canvas')
    input.width = source.width
    input.height = source.height
    const inputContext = input.getContext('2d')!
    inputContext.drawImage(source, 0, 0)
    const pixels = inputContext.getImageData(0, 0, source.width, source.height).data
    const context = texture.getContext()
    context.imageSmoothingEnabled = false
    const frames = kind === 'pantry' ? measurePantrySheet(pixels, source.width, source.height)
      : kind === 'seated' ? measureSeatedSheet(pixels, source.width, source.height)
      : kind === 'walk' ? measureWalkSheet(pixels, source.width, source.height)
      : measureCharacterSheet(pixels, source.width, sourceKey as CharacterSheetKey)
    frames.forEach(({ row, column, source: crop, destination, exclusions }) => {
      if (kind === 'seated' || sourceKey === 'ceo-seated-sheet') {
        this.seatedFrameAnchors.set(`${key}/${frameName(column, row)}`,
          seatedFrameAnchor(sourceKey, column, row, crop, destination))
      }
      const x = column * CHARACTER_FRAME_WIDTH + destination.x
      const y = row * CHARACTER_FRAME_HEIGHT + destination.y
      context.drawImage(source, crop.x, crop.y, crop.width, crop.height, x, y, destination.width, destination.height)
      // Separate the two poses that share scanlines in the Claude source.
      context.save()
      context.beginPath()
      context.rect(x, y, destination.width, destination.height)
      context.clip()
      exclusions.forEach((excluded) => {
        const scaleX = destination.width / crop.width
        const scaleY = destination.height / crop.height
        context.clearRect(
          x + (excluded.x - crop.x) * scaleX, y + (excluded.y - crop.y) * scaleY,
          excluded.width * scaleX, excluded.height * scaleY
        )
      })
      context.restore()
      texture.add(
        frameName(column, row), 0, column * CHARACTER_FRAME_WIDTH, row * CHARACTER_FRAME_HEIGHT,
        CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT
      )
    })
    texture.refresh()
    return key
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
        this.stopActorAction(view)
        view.container.destroy(true)
        view.overlay.destroy(true)
        view.seatedForeground.destroy()
        this.actors.delete(id)
      }
    }

    snapshot.actors.forEach((actor, index) => {
      if (actor.presence === 'offDuty') return
      const view = this.actors.get(actor.profileId) ?? this.createActor(actor)
      view.requestedActor = actor
      view.actorIndex = index
      this.updateActor(view, this.effectiveActor(view), index)
    })
  }

  private createActor(actor: OfficeGameActor): ActorView {
    const row = Math.floor(actor.rosterIndex / 5)
    const frame = String(actor.rosterIndex)
    const animationAtlas = this.animationAtlasFor(actor)
    const animKey = this.actorAnimationKey(actor)
    const sprite = this.add.sprite(
      0,
      -27,
      animationAtlas ?? `roster-row-${row}`,
      animationAtlas ? `actor-${animKey}-idle-0` : frame
    ).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
      .setY(ACTOR_SPRITE_Y_OFFSET)
    sprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.actorSelectHandler?.(actor.profileId)
    })
    const seatedForeground = this.add.sprite(0, 0, animationAtlas ?? `roster-row-${row}`,
      animationAtlas ? `actor-${animKey}-idle-0` : frame)
      .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT).setOrigin(0.5, 1).setVisible(false)
      .setInteractive({ useHandCursor: true, pixelPerfect: true })
      .on('pointerdown', () => this.actorSelectHandler?.(actor.profileId))
    // Bottom-anchor the full label above the head, including Korean glyphs
    // with taller font metrics, just like the representative's nameplate.
    const label = this.addOfficeText(0, ACTOR_SPRITE_Y_OFFSET - ACTOR_SPRITE_HEIGHT / 2 - 6, actor.displayName, {
      fontSize: '13px', color: '#111111', align: 'center'
    }).setOrigin(0.5, 1).setPadding(4, 4)
    const speechPanel = this.add.image(0, 0, 'speech-bubble', 'panel')
      .setOrigin(0.5, 1).setDisplaySize(SPEECH_BUBBLE_WIDTH, SPEECH_BUBBLE_HEIGHT).setVisible(false)
    const bubble = this.addOfficeText(0, 0, '', {
      fontSize: '12px', color: '#26332f', align: 'center'
    }).setOrigin(0.5, 0.5).setVisible(false)
    const saved = this.worldSave.actors.find((candidate) => candidate.profileId === actor.profileId)
    const initial = nearestOfficePosition(saved ?? WAYPOINTS.elevatorInside,
      [...this.collisionRects(), ...this.actorObstacles()]) ?? WAYPOINTS.elevatorExit
    const container = this.add.container(initial.x, initial.y, [sprite]).setDepth(initial.y)
    const overlay = this.add.container(initial.x, initial.y, [label, speechPanel, bubble])
    const view: ActorView = {
      container, sprite, seatedForeground, overlay, label, bubble, speechPanel, routeKey: '', stateMachine: new ActorStateMachine(actor.presence),
      gait: new CharacterGait(`actor-${animKey}`),
      route: [], routeIndex: 0, actor, requestedActor: actor, actorIndex: 0, idleActivity: new IdleActivity(),
      goal: null, seatedGoal: false, chairId: null, settled: false, blocked: false, stalledMs: 0, blockedOccupancy: null, retryAt: 0
    }
    this.actors.set(actor.profileId, view)
    return view
  }

  // The live chair position (which the interior editor can move) instead of
  // the static TEAM_DESKS default, so characters keep finding their seat
  // after a desk is dragged elsewhere.
  private deskSeatPoint(actor: OfficeGameActor): WorldPoint {
    const chair = this.furniture.get('chair-' + actor.teamIndex + '-' + actor.slotIndex)
    if (chair) return { x: chair.image.x, y: chair.image.y }
    const desks = [...this.furniture.values()].filter(({ id, frame, image }) =>
      frame === DESK_FURNITURE_FRAME && id !== 'representative-desk' && this.deskZone(id, image.x) === actor.teamIndex)
    const desk = desks[actor.slotIndex]
    if (desk) return { x: desk.image.x, y: desk.image.y + 64 }
    // Distinct waiting points for a team that currently has no physical seat.
    return { x: 352 + actor.teamIndex * 96, y: 592 + actor.slotIndex * 40 }
  }

  private actorDestination(actor: OfficeGameActor, actorIndex: number): { point: WorldPoint; seated: boolean; chairId?: string } {
    if (actor.presence === 'meeting') {
      const attendees = this.snapshot?.actors.filter((candidate) => candidate.presence === 'meeting') ?? [actor]
      const index = Math.max(0, attendees.findIndex((candidate) => candidate.profileId === actor.profileId))
      const chairs = [...this.furniture.values()].filter(({ frame, image }) =>
        [12, 13, 14].includes(frame) && image.x > 304 && image.x < 656 && image.y > 32 && image.y < 336
      ).sort((a, b) => a.image.y - b.image.y || a.image.x - b.image.x || a.id.localeCompare(b.id))
      const chair = chairs[index]
      if (chair) return { point: { x: chair.image.x, y: chair.image.y }, seated: true, chairId: chair.id }
      const waitingIndex = index - chairs.length
      return { point: { x: 336 + (waitingIndex % 4) * 80, y: 272 + Math.floor(waitingIndex / 4) * 48 }, seated: false }
    }
    const point = targetPoint(actor, actorIndex, (candidate) => this.deskSeatPoint(candidate)) ?? this.deskSeatPoint(actor)
    const seated = ['working', 'deskIdle', 'arriving', 'requestingHelp', 'error'].includes(actor.presence) &&
      this.furniture.has('chair-' + actor.teamIndex + '-' + actor.slotIndex)
    return { point, seated, chairId: seated ? 'chair-' + actor.teamIndex + '-' + actor.slotIndex : undefined }
  }

  private actorObstacles(except?: ActorView, includeRepresentative = true): CollisionRect[] {
    const obstacles = [...this.actors.values()].filter((view) => view !== except)
      .map((view) => actorCollisionRect(view.container))
    if (includeRepresentative && this.representativeSprite) {
      const chair = this.representativeSeat && this.furniture.get(this.representativeSeat.chairId)
      obstacles.push(actorCollisionRect(chair ? chair.image : this.representativeSprite))
    }
    return obstacles
  }

  private occupancyKey(view: ActorView): string {
    const actors = [...this.actors.values()].filter((other) => other !== view &&
      Math.hypot(other.container.x - view.container.x, other.container.y - view.container.y) < 128)
      .map((other) => [other.actor.profileId, Math.round(other.container.x / 8), Math.round(other.container.y / 8)].join(':'))
      .join('|')
    const representative = this.representativeSprite
    return actors + `|seat:${this.representativeSeat?.chairId ?? this.representativeChairTarget ?? ''}` +
      (representative && Math.hypot(representative.x - view.container.x, representative.y - view.container.y) < 128
      ? `|representative:${Math.round(representative.x / 8)}:${Math.round(representative.y / 8)}` : '')
  }

  private effectiveActor(view: ActorView): OfficeGameActor {
    const pantryAvailable = ![...this.actors.values()].some((other) =>
      other !== view && other.idleActivity.awayFromDesk)
    const presence = view.idleActivity.update(
      view.requestedActor.presence, this.simulationTimeMs, view.settled ? view.actor.presence : null, pantryAvailable
    )
    return { ...view.requestedActor, presence }
  }

  private updateIdleActivities(): void {
    for (const view of this.actors.values()) {
      const actor = this.effectiveActor(view)
      const changed = actor.presence !== view.actor.presence
      const occupancyChanged = view.blocked && view.blockedOccupancy !== null &&
        this.simulationTimeMs >= view.retryAt && this.occupancyKey(view) !== view.blockedOccupancy
      if (occupancyChanged) view.routeKey = ''
      if (changed || occupancyChanged) this.updateActor(view, actor, view.actorIndex)
    }
  }

  private updateActor(view: ActorView, actor: OfficeGameActor, actorIndex: number): void {
    if (this.layoutEditing || !view.stateMachine.requestPresence(actor.presence)) return
    const destination = this.actorDestination(actor, actorIndex)
    const key = [actor.presence, destination.point.x, destination.point.y, this.navigationRevision].join(':')
    view.actor = actor
    view.actorIndex = actorIndex
    if (view.routeKey === key) return
    view.routeKey = key
    this.stopActorAction(view)
    view.route = []
    view.routeIndex = 0
    view.stalledMs = 0
    view.blocked = false
    view.blockedOccupancy = null
    view.settled = false
    view.goal = destination.point
    view.seatedGoal = destination.seated
    view.chairId = destination.seated ? destination.chairId ?? [...this.furniture.values()].find(({ frame, image }) =>
      [12, 13, 14].includes(frame) && Math.hypot(image.x - destination.point.x, image.y - destination.point.y) < 0.5)?.id ?? null : null
    const labels: Partial<Record<OfficeGameActor['presence'], string>> = {
      working: '업무 중', meeting: '회의', requestingHelp: '도움 필요!', error: '오류!'
    }
    const message = actor.presence === 'pantry'
      ? actionForPresence('pantry', actorIndex) === 'drinking' ? '커피 마시러 가는 중' : '간식 먹으러 가는 중'
      : labels[actor.presence] ?? ''
    this.setActorSpeech(view, message)
    view.sprite.setTint(actor.presence === 'error' ? 0xff7777 : actor.presence === 'requestingHelp' ? 0xffd36a : 0xffffff)
    this.restoreActorStandingPose(view)

    if (Math.hypot(view.container.x - view.goal.x, view.container.y - view.goal.y) < 0.5) {
      this.finishActorRoute(view)
      return
    }

    const collisions = this.collisionRects()
    if (!isOfficePositionWalkable(view.container, collisions)) {
      // Stand up at the approach used to enter the seat. Old saves inside
      // furniture are repaired once, before planning, rather than every tick.
      const standing = view.approachPoint && isOfficePositionWalkable(view.approachPoint, collisions)
        ? view.approachPoint : nearestOfficePosition(view.container, collisions)
      if (!standing || !hasOfficeLineOfSight(view.container, standing, OFFICE_WALL_COLLISIONS)) {
        this.blockActor(view, false)
        return
      }
      view.container.setPosition(standing.x, standing.y)
    }
    view.approachPoint = undefined
    view.container.setScale(1)
    view.route = findOfficePath(view.container, view.goal, collisions, this.actorSeatPathOptions(view))
    if (view.route.length === 0 && view.seatedGoal && actor.presence === 'meeting') {
      // Edited tables can completely enclose a chair. Join the meeting from
      // open floor instead of trying to walk through the table to that seat.
      const attendees = this.snapshot?.actors.filter((candidate) => candidate.presence === 'meeting') ?? [actor]
      const index = Math.max(0, attendees.findIndex((candidate) => candidate.profileId === actor.profileId))
      view.goal = { x: 336 + (index % 4) * 80, y: 272 + Math.floor(index / 4) * 48 }
      view.seatedGoal = false
      view.chairId = null
      view.route = findOfficePath(view.container, view.goal, collisions)
    }
    if (view.route.length === 0) this.blockActor(view, false)
    this.updateActorDepth(view)
  }

  private actorSeatPathOptions(view: ActorView) {
    const chair = view.chairId && this.furniture.get(view.chairId)
    return { goalRadius: view.seatedGoal ? SEAT_ACCESS_RADIUS : 0,
      goalCollisions: chair ? this.chairAccessCollisions(chair, view, false) : OFFICE_WALL_COLLISIONS }
  }

  private restoreActorStandingPose(view: ActorView): void {
    const atlas = this.animationAtlasFor(view.actor)
    if (atlas) view.sprite.setTexture(atlas, `actor-${this.actorAnimationKey(view.actor)}-idle-0`)
    view.sprite.stop().setCrop().setVisible(true).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
      .setPosition(0, ACTOR_SPRITE_Y_OFFSET).setFlipX(false)
    view.seatedForeground.setVisible(false)
  }

  private stopActorAction(view: ActorView): void {
    if (view.pantryAction) {
      view.pantryAction = undefined
      this.restoreActorStandingPose(view)
      this.setActorSpeech(view, '')
    }
    view.sprite.stop()
    view.gait.stop()
    view.stateMachine.cancelAction()
  }

  private stopActorWalking(view: ActorView): void {
    this.restoreActorStandingPose(view)
    view.sprite.stop()
    if (this.animationAtlasFor(view.actor)) {
      const pose = view.gait.stop()
      view.sprite.setFrame(pose.frame).setFlipX(pose.flipX)
    }
    view.stateMachine.stopWalking()
  }

  private blockActor(view: ActorView, dynamic: boolean): void {
    view.route = []
    view.routeIndex = 0
    view.settled = false
    view.blocked = true
    view.blockedOccupancy = dynamic ? this.occupancyKey(view) : null
    view.retryAt = this.simulationTimeMs + 1000
    this.stopActorWalking(view)
    this.setActorSpeech(view, '통로 대기')
    if (view.idleActivity.visitingPantry) view.idleActivity.cancelVisit()
    this.updateActorDepth(view)
  }

  private finishActorRoute(view: ActorView): void {
    const reservedId = this.representativeSeat?.chairId ?? this.representativeChairTarget
    const reserved = reservedId && this.furniture.get(reservedId)
    if (view.seatedGoal && view.goal && reserved &&
      Math.hypot(view.goal.x - reserved.image.x, view.goal.y - reserved.image.y) < 16) {
      view.route = []
      view.routeIndex = 0
      this.blockActor(view, true)
      return
    }
    view.route = []
    view.routeIndex = 0
    view.blocked = false
    view.stalledMs = 0
    if (isOfficePositionWalkable(view.container, this.collisionRects())) {
      view.approachPoint = { x: view.container.x, y: view.container.y }
    }
    if (view.seatedGoal && view.goal) {
      const chair = view.chairId && this.furniture.get(view.chairId)
      if (!chair || Math.hypot(view.container.x - view.goal.x, view.container.y - view.goal.y) > SEAT_ACCESS_RADIUS ||
        !hasOfficeLineOfSight(view.container, view.goal, this.chairAccessCollisions(chair, view, false))) {
        this.blockActor(view, false)
        return
      }
      if (!hasOfficeLineOfSight(view.container, view.goal, this.chairAccessCollisions(chair, view))) {
        this.blockActor(view, true)
        return
      }
      view.container.setPosition(view.goal.x, view.goal.y)
    }
    view.settled = true
    this.startActionAnimation(view, view.actor)
    this.persistActor(view.actor, view)
  }

  private updateActorMovement(deltaSeconds: number): void {
    if (this.layoutEditing || deltaSeconds <= 0) return
    const collisions = this.collisionRects()
    for (const view of this.actors.values()) {
      let target = view.route[view.routeIndex]
      while (target && Math.hypot(target.x - view.container.x, target.y - view.container.y) < 0.5) {
        view.container.setPosition(target.x, target.y)
        view.routeIndex += 1
        if (view.routeIndex >= view.route.length) {
          this.finishActorRoute(view)
          break
        }
        target = view.route[view.routeIndex]
      }
      if (view.route.length === 0 || !target) continue
      const dx = target.x - view.container.x
      const dy = target.y - view.container.y
      const distance = Math.hypot(dx, dy)
      const amount = Math.min(distance, 120 * deltaSeconds)
      const before = { x: view.container.x, y: view.container.y }
      const obstacles = [...collisions, ...this.actorObstacles(view)]
      const resolved = resolveAxisSeparated(before,
        { x: before.x + dx / distance * amount, y: before.y + dy / distance * amount },
        obstacles, ACTOR_COLLISION_HALF_WIDTH, ACTOR_COLLISION_HALF_HEIGHT)
      const movedX = resolved.x - before.x
      const movedY = resolved.y - before.y
      if (Math.hypot(movedX, movedY) < 0.01) {
        this.stopActorWalking(view)
        view.stalledMs += deltaSeconds * 1000
        if (view.stalledMs >= 500 && view.goal) {
          const alternate = findOfficePath(view.container, view.goal, obstacles, this.actorSeatPathOptions(view))
          if (alternate.length > 0 && Math.hypot(alternate[0].x - before.x, alternate[0].y - before.y) > 0.5) {
            view.route = alternate
            view.routeIndex = 0
            view.stalledMs = 0
          } else this.blockActor(view, true)
        }
        continue
      }
      view.stalledMs = 0
      view.container.setPosition(resolved.x, resolved.y).setDepth(resolved.y)
      view.overlay.setDepth(view.container.depth + OFFICE_WORLD_HEIGHT)
      view.stateMachine.startWalking(movedX, movedY)
      // Facing follows actual displacement, not an unreachable target vector.
      if (this.animationAtlasFor(view.actor)) {
        const pose = view.gait.advance(movedX, movedY)
        view.sprite.stop().setFrame(pose.frame).setFlipX(pose.flipX)
      }
      if (Math.hypot(target.x - resolved.x, target.y - resolved.y) < 0.5) {
        view.container.setPosition(target.x, target.y)
        view.routeIndex += 1
        if (view.routeIndex >= view.route.length) this.finishActorRoute(view)
      }
    }
  }

  private startActionAnimation(view: ActorView, actor: OfficeGameActor): void {
    this.stopActorAction(view)
    view.stateMachine.arrive(view.actorIndex)
    const action = view.stateMachine.current.action
    const chair = view.seatedGoal && view.chairId && this.furniture.get(view.chairId)
    if (chair && this.animationAtlasFor(actor)) {
      const direction = this.furnitureDirection(this.furnitureRotation(chair.image))
      const frame = `actor-${this.actorAnimationKey(actor)}-sit-${direction === 'right' ? 'left' : direction}`
      const texture = `staff-seated-${actor.teamIndex}-frames`
      view.sprite.setTexture(texture, frame).setCrop().setFlipX(direction === 'right')
        .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
      view.seatedForeground.setTexture(texture, frame).setFlipX(direction === 'right')
        .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
        .setTint(actor.presence === 'error' ? 0xff7777 : actor.presence === 'requestingHelp' ? 0xffd36a : 0xffffff)
    } else this.restoreActorStandingPose(view)
    view.container.setScale(1)
    this.updateActorDepth(view)
    this.updateActorOverlayPosition(view)

    if (action !== 'eating' && action !== 'drinking') return
    if (!this.animationAtlasFor(actor)) {
      view.stateMachine.completeAction()
      this.setActorSpeech(view, '')
      return
    }
    view.pantryAction = { action, elapsedMs: 0, pose: 0 }
    this.applyActorPantryPose(view)
    this.setActorSpeech(view, action === 'drinking' ? '커피 마시는 중' : '간식 먹는 중')
  }

  private applyActorPantryPose(view: ActorView): void {
    const state = view.pantryAction
    if (!state) return
    const id = this.actorAnimationKey(view.actor)
    view.sprite.stop().setTexture(`staff-pantry-${id}-frames`, `actor-${id}-${state.action}-${state.pose}`)
      .setCrop().setFlipX(false).setVisible(true).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
      .setPosition(0, ACTOR_SPRITE_Y_OFFSET)
    view.seatedForeground.setVisible(false)
  }

  private updateActorPantryActions(deltaMs: number): void {
    for (const view of this.actors.values()) {
      const state = view.pantryAction
      if (!state) continue
      state.elapsedMs += deltaMs
      const pose = pantryPoseAt(state.action, state.elapsedMs)
      if (pose === null) {
        view.pantryAction = undefined
        view.stateMachine.completeAction()
        this.restoreActorStandingPose(view)
        this.setActorSpeech(view, '')
        this.updateActor(view, this.effectiveActor(view), view.actorIndex)
      } else if (pose !== state.pose) {
        state.pose = pose
        this.applyActorPantryPose(view)
      }
    }
  }

  private setActorSpeech(view: ActorView, text: string): void {
    view.bubble.setText(text).setVisible(Boolean(text))
    view.speechPanel.setVisible(Boolean(text))
    this.updateActorOverlayPosition(view)
  }

  private updateActorDepth(view: ActorView): void {
    const chair = view.settled && view.seatedGoal && view.chairId && this.furniture.get(view.chairId)
    let headDepth: number
    if (chair && this.animationAtlasFor(view.actor)) {
      headDepth = this.applySeatedComposition(chair, view.sprite, view.seatedForeground, view.container)
    } else {
      view.container.setDepth(view.container.y)
      view.sprite.setCrop().setVisible(true)
      view.seatedForeground.setVisible(false)
      headDepth = view.container.depth
    }
    view.overlay.setDepth(headDepth + OFFICE_WORLD_HEIGHT)
  }

  private updateActorOverlayPosition(view: ActorView): void {
    view.overlay.setPosition(view.container.x, view.container.y)
    const above = view.container.y + view.sprite.y - view.sprite.displayHeight * view.sprite.originY - CEO_LABEL_GAP
    view.label.setPosition(view.sprite.x, above - view.container.y)
    const aboveBottom = above - view.label.displayHeight - 4
    const below = aboveBottom - SPEECH_BUBBLE_HEIGHT < 8
    const feet = view.container.y + view.sprite.y + view.sprite.displayHeight * (1 - view.sprite.originY)
    const bottom = (below ? feet + 8 + SPEECH_BUBBLE_HEIGHT : aboveBottom) - view.container.y
    const x = Phaser.Math.Clamp(view.container.x + view.sprite.x, SPEECH_BUBBLE_WIDTH / 2 + 8,
      OFFICE_WORLD_WIDTH - SPEECH_BUBBLE_WIDTH / 2 - 8) - view.container.x
    view.speechPanel.setPosition(x, bottom).setFlipY(below)
    view.bubble.setPosition(x, bottom - SPEECH_BUBBLE_HEIGHT * (below ? 0.38 : 0.62))
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
