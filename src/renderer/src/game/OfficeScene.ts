import Phaser from 'phaser'
import row1 from '../assets/pixel-office/characters/corporate-roster-row-1-v1.png'
import row2 from '../assets/pixel-office/characters/corporate-roster-row-2-v1.png'
import row3 from '../assets/pixel-office/characters/corporate-roster-row-3-v1.png'
import row4 from '../assets/pixel-office/characters/corporate-roster-row-4-v1.png'
import ceoAnimationSheet from '../assets/pixel-office/characters/ceo-walk-cycle-v3.png'
import ceoSeatedSheet from '../assets/pixel-office/characters/ceo-seated-v1.png'
import ceoDeskWorkSheet from '../assets/pixel-office/characters/ceo-desk-work-v3.png'
import ceoPantrySheet from '../assets/pixel-office/characters/ceo-pantry-actions-v1.png'
import speechBubbleAsset from '../assets/pixel-office/ui/speech-bubble-v1.png'
import type { OfficeDialogue } from './officeDialogue'
import coffeeMachineAsset from '../assets/pixel-office/furniture/coffee-machine-v2.png'
import refrigeratorAsset from '../assets/pixel-office/furniture/refrigerator-v2.png'
import pantryCabinetAsset from '../assets/pixel-office/furniture/pantry-cabinet-v1.png'
import presentationScreenAsset from '../assets/pixel-office/furniture/presentation-screen-v1.png'
import longTableAsset from '../assets/pixel-office/furniture/long-table-v1.png'
import conferenceTableAsset from '../assets/pixel-office/furniture/conference-table-v1.png'
import conferenceTableSideAsset from '../assets/pixel-office/furniture/conference-table-side-v1.png'
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
import { distanceToRoute, findYieldRoute } from './officeTraffic'
import { REPRESENTATIVE_ROOM, isInMeetingRoom, isInRepresentativeRoom, isInStaffArea } from './officeRooms'
import { measureFurnitureBounds } from './furnitureBounds'
import { seatedFrameAnchor, seatedSpriteFoot } from './seatAnchors'
import {
  DEFAULT_LAYOUT_SEED,
  CONFERENCE_TABLE_FRAME,
  CONFERENCE_TABLE_ID,
  OFFICE_LAYOUT_SAVE_KEY,
  OFFICE_REMOVED_DESKS_KEY,
  REPRESENTATIVE_MEETING_CHAIR_ID,
  REPRESENTATIVE_CHAIR_ID,
  REPRESENTATIVE_DESK_ID,
  migrateRepresentativeFurniture,
  migrateMeetingTable,
  parseOfficeLayout,
  parseRemovedIds,
  type OfficeLayoutSave,
  type SavedFurniture
} from './layoutPersistence'
import { ActorStateMachine, actionForPresence } from './actorStateMachine'
import { pantryPoseAt, type PantryAnimation } from './pantryAnimation'
import {
  REPRESENTATIVE_WORK_TEXTURE, REPRESENTATIVE_WORK_POSES, REPRESENTATIVE_WORK_FRAME_WIDTH,
  REPRESENTATIVE_WORK_FRAME_PADDING, representativeWorkPixels, representativeWorkPoseAt, workHandPixels
} from './representativeWorkAnimation'
import { measureStaffWorkSheet, staffWorkTexture } from './staffWorkAnimation'
import { IdleActivity, PantrySchedule } from './idleActivity'
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

export interface ActorView {
  container: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Sprite
  seatedForeground: Phaser.GameObjects.Sprite
  overlay: Phaser.GameObjects.Container
  label: Phaser.GameObjects.Text
  bubble: Phaser.GameObjects.Text
  speechPanel: Phaser.GameObjects.Image
  routeKey: string
  pantryAction?: PantryAnimation
  workElapsedMs: number
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
  departureBlocked?: boolean
  trafficYield?: { requesterId: string; origin: WorldPoint; arrived: boolean; wasSettled: boolean }
}

export interface ActorDestination { point: WorldPoint; seated: boolean; chairId?: string }

export interface FurnitureView {
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

export const FURNITURE_TEXTURES: Record<number, string> = {
  0: 'furniture-coffee-machine', 1: 'furniture-refrigerator', 2: 'furniture-pantry-cabinet',
  5: 'furniture-presentation-screen', 6: 'furniture-long-table', 7: 'furniture-laptop', 10: 'furniture-workstation-desk',
  12: 'furniture-office-chair', 13: 'furniture-office-chair', 14: 'furniture-office-chair',
  15: 'furniture-office-plant', 16: 'furniture-side-table', 17: 'furniture-office-sofa',
  18: 'furniture-floor-lamp', 19: 'furniture-bookcase', [CONFERENCE_TABLE_FRAME]: 'furniture-conference-table'
}
export const FURNITURE_ASSET_NAMES: Record<number, string> = {
  0: 'coffee-machine', 1: 'refrigerator', 2: 'pantry-cabinet', 5: 'presentation-screen',
  6: 'long-table', 7: 'laptop', 10: 'workstation-desk', 12: 'office-chair', 13: 'office-chair',
  14: 'office-chair', 15: 'office-plant', 16: 'side-table', 17: 'office-sofa',
  18: 'floor-lamp', 19: 'bookcase'
}
export const FURNITURE_DIRECTIONS = ['front', 'right', 'back', 'left'] as const
export const STACKABLE_FURNITURE_FRAMES = new Set([7])
export const DESK_FURNITURE_FRAME = 10
export const TABLETOP_FURNITURE_FRAMES = new Set([DESK_FURNITURE_FRAME, 6, 16, CONFERENCE_TABLE_FRAME])
// Keep the monitor wider than a seated character's head so its edges remain visible.
const DESK_ASSET_SCALE = 1
const CHAIR_ASSET_SCALE = 1.33
const SCREEN_HEIGHT_SCALE = 2.5
export const FURNITURE_WALK_CLEARANCE = 2
export type FurnitureDirection = typeof FURNITURE_DIRECTIONS[number]
const directionalFurnitureAssets = import.meta.glob('../assets/pixel-office/furniture/directional/*.png', {
  eager: true, query: '?url', import: 'default'
}) as Record<string, string>
const staffWalkAssets = import.meta.glob('../assets/pixel-office/characters/walk-v6/*.png', {
  eager: true, query: '?url', import: 'default'
}) as Record<string, string>
const staffSeatedAssets = import.meta.glob('../assets/pixel-office/characters/seated-v1/*.png', {
  eager: true, query: '?url', import: 'default'
}) as Record<string, string>
const staffWorkAssets = import.meta.glob('../assets/pixel-office/characters/work-v1/*.png', {
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
  { frame: CONFERENCE_TABLE_FRAME, label: '대형 회의탁자', asset: conferenceTableAsset },
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
export const OFFICE_FLOOR_SAVE_KEY = 'pixel-office-floor-v4'
export const OFFICE_FONT_FAMILY = '"Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif'
// Normalized frames center the character art on the sprite and nameplate.
export const CEO_SPRITE_ART_X_OFFSET = 0
export const CEO_LABEL_GAP = 6
export const SPEECH_BUBBLE_WIDTH = 176
export const SPEECH_BUBBLE_HEIGHT = 48
export const ACTOR_COLLISION_HALF_WIDTH = ACTOR_NAV_HALF_WIDTH
export const ACTOR_COLLISION_HALF_HEIGHT = ACTOR_NAV_HALF_HEIGHT
// Same size as the CEO sprite (createRepresentativeActor) so every
// character in the office reads at a consistent scale, animated or not.
export const ACTOR_SPRITE_WIDTH = 104
export const ACTOR_SPRITE_HEIGHT = 120
export const ACTOR_SPRITE_Y_OFFSET = -64
// The layered meeting table and its bookcase leave its far chair 8 tiles
// from free floor. The final seat segment still checks walls and other seats.
export const SEAT_ACCESS_RADIUS = 144

export function furnitureDisplaySize(frame: number, columns: number, rows: number): { width: number; height: number } {
  // Grow the screen's short axis while preserving its width and wall placement.
  // Cardinal side views swap that axis when the furniture is rotated.
  if (frame === 5) return columns >= rows
    ? { width: columns * 16, height: rows * 16 * SCREEN_HEIGHT_SCALE }
    : { width: columns * 16 * SCREEN_HEIGHT_SCALE, height: rows * 16 }
  const scale = frame === DESK_FURNITURE_FRAME ? DESK_ASSET_SCALE
    : [12, 13, 14].includes(frame) ? CHAIR_ASSET_SCALE : 1
  return { width: columns * 16 * scale, height: rows * 16 * scale }
}

// A desk/chair pair is meant to sit close together (the chair tucks under
// the desk), so they should never push each other away as a "collision".
export function pairedFurnitureId(id: string): string | null {
  if (id === REPRESENTATIVE_DESK_ID) return REPRESENTATIVE_CHAIR_ID
  if (id === REPRESENTATIVE_CHAIR_ID) return REPRESENTATIVE_DESK_ID
  const deskMatch = /^desk-(\d+-\d+)$/.exec(id)
  if (deskMatch) return `chair-${deskMatch[1]}`
  const chairMatch = /^chair-(\d+-\d+)$/.exec(id)
  if (chairMatch) return `desk-${chairMatch[1]}`
  return null
}

import { createWorld as createWorldImpl, createFloorLayers as createFloorLayersImpl, createHardcodedArchitecture as createHardcodedArchitectureImpl, createRoom as createRoomImpl, createDoor as createDoorImpl, setDoorOpen as setDoorOpenImpl, createPantry as createPantryImpl, createMeetingRoom as createMeetingRoomImpl, createEntrance as createEntranceImpl, createRepresentativeRoom as createRepresentativeRoomImpl, ensureDeskPair as ensureDeskPairImpl, createDesks as createDesksImpl, deskZone as deskZoneImpl, computeDeskCounts as computeDeskCountsImpl, reportDeskCounts as reportDeskCountsImpl, createConferenceTableTextures as createConferenceTableTexturesImpl, showEditorNotice as showEditorNoticeImpl } from './officeSceneWorld'
import { createRosterFrames as createRosterFramesImpl, createStaffWalkFrames as createStaffWalkFramesImpl, animationAtlasFor as animationAtlasForImpl, createStaffPantryFrames as createStaffPantryFramesImpl, actorAnimationKey as actorAnimationKeyImpl, addOfficeText as addOfficeTextImpl, createCeoFrames as createCeoFramesImpl, createRepresentativeWorkFrames as createRepresentativeWorkFramesImpl, createStaffWorkFrames as createStaffWorkFramesImpl, createCharacterFrames as createCharacterFramesImpl, dialogueForActor as dialogueForActorImpl } from './officeSceneFrames'
import { collisionRects as collisionRectsImpl, furnitureTextureBounds as furnitureTextureBoundsImpl, furnitureTexturePixels as furnitureTexturePixelsImpl, furnitureWalkCollision as furnitureWalkCollisionImpl, furniturePlacementCollides as furniturePlacementCollidesImpl, findFreeFurniturePoint as findFreeFurniturePointImpl, furnitureRotation as furnitureRotationImpl, furnitureDirection as furnitureDirectionImpl, directionalFurnitureTexture as directionalFurnitureTextureImpl, furnitureDepthBonus as furnitureDepthBonusImpl, maxFurnitureDepth as maxFurnitureDepthImpl, editorOverlayDepth as editorOverlayDepthImpl, hasCollidingFurniture as hasCollidingFurnitureImpl } from './officeSceneFurnitureGeometry'
import { addFurniture as addFurnitureImpl, createLayoutEditor as createLayoutEditorImpl, createMarqueeSelect as createMarqueeSelectImpl, setEditorUiVisible as setEditorUiVisibleImpl, selectFurniture as selectFurnitureImpl, updateSelectionOutline as updateSelectionOutlineImpl, clearMultiSelection as clearMultiSelectionImpl, addToMultiSelection as addToMultiSelectionImpl, removeFromMultiSelection as removeFromMultiSelectionImpl, setMultiSelection as setMultiSelectionImpl, toggleFurnitureSelection as toggleFurnitureSelectionImpl, addFurnitureFromPalette as addFurnitureFromPaletteImpl, deleteSelectedFurniture as deleteSelectedFurnitureImpl, deleteFurnitureView as deleteFurnitureViewImpl, rotateSelectedFurniture as rotateSelectedFurnitureImpl, saveFurnitureLayout as saveFurnitureLayoutImpl, restoreCustomFurniture as restoreCustomFurnitureImpl, resetFurnitureLayout as resetFurnitureLayoutImpl, furnitureNavigationKey as furnitureNavigationKeyImpl, refreshNavigationLayout as refreshNavigationLayoutImpl, bringFurnitureToFront as bringFurnitureToFrontImpl, refreshFurnitureDepths as refreshFurnitureDepthsImpl, refreshTeamLabels as refreshTeamLabelsImpl, editorState as editorStateImpl, notifyEditorState as notifyEditorStateImpl, setLayoutEditing as setLayoutEditingImpl, isLayoutEditing as isLayoutEditingImpl, setFloorTexture as setFloorTextureImpl } from './officeSceneEditor'
import { createRepresentativeActor as createRepresentativeActorImpl, moveRepresentativeTo as moveRepresentativeToImpl, sitRepresentativeOn as sitRepresentativeOnImpl, interactRepresentativeWith as interactRepresentativeWithImpl, showPantryHint as showPantryHintImpl, pantryServicePoint as pantryServicePointImpl, pantryAccessCollisions as pantryAccessCollisionsImpl, representativeCanUsePantry as representativeCanUsePantryImpl, representativePantryApproach as representativePantryApproachImpl, startRepresentativePantryAction as startRepresentativePantryActionImpl, stopRepresentativePantryAction as stopRepresentativePantryActionImpl, applyRepresentativePantryPose as applyRepresentativePantryPoseImpl, updateRepresentativePantryAction as updateRepresentativePantryActionImpl, showRepresentativeSpeech as showRepresentativeSpeechImpl, hideRepresentativeSpeech as hideRepresentativeSpeechImpl, representativeChairAvailable as representativeChairAvailableImpl, chairAccessCollisions as chairAccessCollisionsImpl, representativeChairApproach as representativeChairApproachImpl, representativeDeparturePoint as representativeDeparturePointImpl, standRepresentative as standRepresentativeImpl, planRepresentativeRoute as planRepresentativeRouteImpl, repairRepresentativePosition as repairRepresentativePositionImpl, updateRepresentativeMovement as updateRepresentativeMovementImpl, stopRepresentativeMovement as stopRepresentativeMovementImpl, updateRepresentativeDepth as updateRepresentativeDepthImpl, updateRepresentativeWorkAnimation as updateRepresentativeWorkAnimationImpl, applySeatedComposition as applySeatedCompositionImpl, seatedFrameAnchor as seatedFrameAnchorImpl, renderSeatedForeground as renderSeatedForegroundImpl, applyRepresentativePose as applyRepresentativePoseImpl, persistRepresentativePosition as persistRepresentativePositionImpl, updateRepresentativeLabelPosition as updateRepresentativeLabelPositionImpl } from './representativeController'
import { applySnapshot as applySnapshotImpl, createActor as createActorImpl, deskSeatPoint as deskSeatPointImpl, actorCanUseChair as actorCanUseChairImpl, assignedDeskChair as assignedDeskChairImpl, meetingDestination as meetingDestinationImpl, actorDestination as actorDestinationImpl, representativeVisitDestination as representativeVisitDestinationImpl, actorObstacles as actorObstaclesImpl, occupancyKey as occupancyKeyImpl, effectiveActor as effectiveActorImpl, updateIdleActivities as updateIdleActivitiesImpl, actorDeparturePoint as actorDeparturePointImpl, trafficRequesterCleared as trafficRequesterClearedImpl, yieldActor as yieldActorImpl, resolveActorTraffic as resolveActorTrafficImpl, resolveRepresentativeTraffic as resolveRepresentativeTrafficImpl, updateActor as updateActorImpl, actorSeatPathOptions as actorSeatPathOptionsImpl, restoreActorStandingPose as restoreActorStandingPoseImpl, stopActorAction as stopActorActionImpl, stopActorWalking as stopActorWalkingImpl, blockActor as blockActorImpl, finishActorRoute as finishActorRouteImpl, updateActorMovement as updateActorMovementImpl, startActionAnimation as startActionAnimationImpl, applyActorPantryPose as applyActorPantryPoseImpl, updateActorPantryActions as updateActorPantryActionsImpl, setActorSpeech as setActorSpeechImpl, updateActorWorkAnimation as updateActorWorkAnimationImpl, updateActorDepth as updateActorDepthImpl, updateActorOverlayPosition as updateActorOverlayPositionImpl, persistActor as persistActorImpl } from './actorController'

export class OfficeScene extends Phaser.Scene {
  actors = new Map<string, ActorView>()
  snapshot: OfficeWorldSnapshot | null = null
  pendingSnapshot: OfficeWorldSnapshot | null = null
  doors = new Map<string, DoorView>()
  worldSave: OfficeWorldSave = { version: 1, actors: [] }
  actorSelectHandler: ((profileId: string) => void) | null = null
  dialogueHandler: ((dialogue: OfficeDialogue) => void) | null = null
  greetedVisitors = new Set<string>()
  dialogueSequence = 0
  furniture = new Map<string, FurnitureView>()
  furnitureBoundsByTexture = new Map<string, CollisionRect>()
  seatedFrameAnchors = new Map<string, WorldPoint>()
  layoutSave: OfficeLayoutSave = {}
  removedDeskIds = new Set<string>()
  deskCountsHandler: ((counts: number[]) => void) | null = null
  teamTemplateIds: string[] = []
  editorStateHandler: ((state: EditorState) => void) | null = null
  layoutEditing = false
  selectedFurniture: FurnitureView | null = null
  selectionOutline?: Phaser.GameObjects.Rectangle
  // Shift+drag rectangle select - a separate set from the single-piece
  // selection above so bulk delete works without disturbing the normal
  // click/drag/rotate flow for a single piece.
  multiSelectedIds = new Set<string>()
  multiSelectOutlines = new Map<string, Phaser.GameObjects.Rectangle>()
  marqueeRect?: Phaser.GameObjects.Rectangle
  marqueeStart: WorldPoint | null = null
  // While dragging one piece of an active multi-selection, each other
  // selected piece's fixed offset from the dragged (leader) piece.
  groupDragOffsets = new Map<string, WorldPoint>()
  nextFurnitureId = 1
  // Team floor markers follow the clear space below each lead desk/chair.
  teamLabels = new Map<string, Phaser.GameObjects.Text>()
  representativeSprite?: Phaser.GameObjects.Sprite
  representativeSeatedForeground?: Phaser.GameObjects.Sprite
  representativeWorkElapsedMs = 0
  representativeLabel?: Phaser.GameObjects.Text
  representativeDestination?: Phaser.GameObjects.Arc
  representativeRoute: WorldPoint[] = []
  representativeGoal: WorldPoint | null = null
  representativeStalledMs = 0
  representativeNavigationRevision = -1
  representativeGait = new CharacterGait('ceo')
  representativeChairTarget: string | null = null
  representativeSeat: { chairId: string; approach: WorldPoint; center: WorldPoint } | null = null
  representativePantryTarget: string | null = null
  representativePantryAction?: PantryAnimation
  representativeSpeechBubble?: Phaser.GameObjects.Image
  representativeSpeech?: Phaser.GameObjects.Text
  pantryHint?: Phaser.GameObjects.Text
  // Persisted (not just in-memory) so whichever piece was placed/edited most
  // recently keeps rendering on top of anything it overlaps even after a
  // reload, instead of only for the rest of the current session.
  zOrderById = new Map<string, number>()
  nextZOrder = 1
  floorLayers: Phaser.GameObjects.TileSprite[] = []
  selectedFloor = DEFAULT_FLOOR_TEXTURE
  simulationTimeMs = 0
  pantrySchedule = new PantrySchedule()
  navigationRevision = 0
  navigationLayoutKey = ''
  meetingAssignmentKey = ''
  meetingAssignments = new Map<string, ActorDestination>()
  representativeVisitKey = ''
  representativeVisitAssignments = new Map<string, ActorDestination>()

  constructor() {
    super(OFFICE_SCENE_KEY)
  }

  setActorSelectHandler(handler: ((profileId: string) => void) | null): void {
    this.actorSelectHandler = handler
  }

  setDialogueHandler(handler: ((dialogue: OfficeDialogue) => void) | null): void {
    this.dialogueHandler = handler
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

  preload(): void {
    ;[row1, row2, row3, row4].forEach((url, index) => this.load.image(`roster-row-${index}`, url))
    this.load.image('ceo-animation-sheet', ceoAnimationSheet)
    this.load.image('ceo-seated-sheet', ceoSeatedSheet)
    this.load.image('ceo-desk-work-sheet', ceoDeskWorkSheet)
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
      const workFile = `staff-${team}-work-v1.png`
      const workUrl = staffWorkAssets[`../assets/pixel-office/characters/work-v1/${workFile}`]
      if (!workUrl) throw new Error(`Missing employee work sheet: ${workFile}`)
      this.load.image(`staff-work-${team}`, workUrl)
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
      ['furniture-conference-table-source', conferenceTableAsset],
      ['furniture-conference-table-side-source', conferenceTableSideAsset],
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
    const saved = migrateRepresentativeFurniture(parseOfficeLayout(localStorage.getItem(OFFICE_LAYOUT_SAVE_KEY)),
      parseRemovedIds(localStorage.getItem(OFFICE_REMOVED_DESKS_KEY)))
    const meetingTable = migrateMeetingTable(saved.layout, saved.removedIds)
    this.layoutSave = { ...DEFAULT_LAYOUT_SEED, ...meetingTable.layout }
    this.removedDeskIds = saved.removedIds
    if (saved.changed || meetingTable.changed) {
      localStorage.setItem(OFFICE_LAYOUT_SAVE_KEY, JSON.stringify(meetingTable.layout))
      localStorage.setItem(OFFICE_REMOVED_DESKS_KEY, JSON.stringify([...saved.removedIds]))
    }
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
    this.createConferenceTableTextures()
    this.createWorld()
    this.createLayoutEditor()
    this.createRosterFrames()
    this.createStaffWalkFrames()
    this.createStaffPantryFrames()
    for (const { team } of STAFF_SEATED_SHEETS) {
      this.createCharacterFrames(`staff-seated-${team}`,
        (column, row) => `actor-${team}-${column}-sit-${SEATED_ROW_NAMES[row]}`, 'seated')
      this.createStaffWorkFrames(team)
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
      this.actors.forEach((view) => this.updateActorWorkAnimation(view, elapsed))
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

  createWorld(): void {
    createWorldImpl(this)
  }

  createFloorLayers(): void {
    createFloorLayersImpl(this)
  }

  createHardcodedArchitecture(): void {
    createHardcodedArchitectureImpl(this)
  }

  createRoom(x: number, y: number, width: number, height: number, label: string): void {
    createRoomImpl(this, x, y, width, height, label)
  }

  createDoor(id: string, x: number, y: number, width: number, height: number): void {
    createDoorImpl(this, id, x, y, width, height)
  }

  setDoorOpen(id: string, open: boolean): void {
    setDoorOpenImpl(this, id, open)
  }

  createPantry(): void {
    createPantryImpl(this)
  }

  createMeetingRoom(): void {
    createMeetingRoomImpl(this)
  }

  createEntrance(): void {
    createEntranceImpl(this)
  }

  createRepresentativeRoom(): void {
    createRepresentativeRoomImpl(this)
  }

  // Idempotent so it doubles as both the initial build and, after a layout
  // reset clears removedDeskIds, a way to recreate whichever default pairs
  // the user had previously deleted - without duplicating ones still present.
  ensureDeskPair(teamIndex: number, slotIndex: number): void {
    ensureDeskPairImpl(this, teamIndex, slotIndex)
  }

  createDesks(): void {
    createDesksImpl(this)
  }

  /** Default desks keep their teamIndex in the id (collision avoidance can
   *  nudge one off its column, which would misclassify it under pure
   *  position lookup); only custom-added desks - which carry no team of
   *  their own - go by which column their x position currently falls in. */
  deskZone(id: string, point: WorldPoint): number {
    return deskZoneImpl(this, id, point)
  }

  /** Every desk-frame piece (default or custom-added), grouped by team -
   *  this *is* the team's seat capacity. */
  computeDeskCounts(): number[] {
    return computeDeskCountsImpl(this)
  }

  reportDeskCounts(): void {
    reportDeskCountsImpl(this)
  }

  createConferenceTableTextures(): void {
    createConferenceTableTexturesImpl(this)
  }

  showEditorNotice(text: string): void {
    showEditorNoticeImpl(this, text)
  }

  createRosterFrames(): void {
    createRosterFramesImpl(this)
  }

  createStaffWalkFrames(): void {
    createStaffWalkFramesImpl(this)
  }

  animationAtlasFor(actor: OfficeGameActor): string | null {
    return animationAtlasForImpl(this, actor)
  }

  createStaffPantryFrames(): void {
    createStaffPantryFramesImpl(this)
  }

  /** Which of the 5 skin variants in the actor's team atlas to use - the
   *  lead (slotIndex 0) gets column 0, sub-agents fill the rest, wrapping
   *  around past a 5th so a very large team still gets an animated sprite
   *  instead of falling back to a generic static one. Claude's lead is
   *  pinned to column 4 instead: column 0 there is dark hair + a navy suit,
   *  near-identical to the CEO sprite, so the two were hard to tell apart
   *  at a glance in the office.
   */
  actorAnimationKey(actor: OfficeGameActor): string {
    return actorAnimationKeyImpl(this, actor)
  }

  addOfficeText(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return addOfficeTextImpl(this, x, y, text, style)
  }

  createCeoFrames(): void {
    createCeoFramesImpl(this)
  }

  createRepresentativeWorkFrames(): void {
    createRepresentativeWorkFramesImpl(this)
  }

  createStaffWorkFrames(team: number): void {
    createStaffWorkFramesImpl(this, team)
  }

  createCharacterFrames(sourceKey: string, frameName: (column: number, row: number) => string,
    kind: 'legacy' | 'walk' | 'seated' | 'pantry' = 'legacy'): string {
    return createCharacterFramesImpl(this, sourceKey, frameName, kind)
  }

  dialogueForActor(actor: OfficeGameActor, text: string, id: string): OfficeDialogue | null {
    return dialogueForActorImpl(this, actor, text, id)
  }

  collisionRects(excludedIds: ReadonlySet<string> = new Set(), clearance = FURNITURE_WALK_CLEARANCE): CollisionRect[] {
    return collisionRectsImpl(this, excludedIds, clearance)
  }

  furnitureTextureBounds(image: Phaser.GameObjects.Image): CollisionRect {
    return furnitureTextureBoundsImpl(this, image)
  }

  furnitureTexturePixels(image: Phaser.GameObjects.Image): ImageData {
    return furnitureTexturePixelsImpl(this, image)
  }

  furnitureWalkCollision(image: Phaser.GameObjects.Image, clearance = FURNITURE_WALK_CLEARANCE): CollisionRect {
    return furnitureWalkCollisionImpl(this, image, clearance)
  }

  // Only walls block furniture placement now - two pieces of furniture are
  // free to overlap however you arrange them (a chair tucked under a desk,
  // decorations layered together, whatever the look calls for). Characters
  // still can't walk through either; collisionRects() below is unaffected.
  furniturePlacementCollides(_id: string, frame: number, point: WorldPoint, angle: number): boolean {
    return furniturePlacementCollidesImpl(this, _id, frame, point, angle)
  }

  // Searches outward in expanding rings from `near` (falling back to the
  // office center) so a forced relocation lands as close as possible to
  // where the piece was meant to be, instead of teleporting to the first
  // free cell found by a top-left raster scan of the whole map.
  findFreeFurniturePoint(frame: number, angle = 0, near?: WorldPoint): WorldPoint {
    return findFreeFurniturePointImpl(this, frame, angle, near)
  }

  furnitureRotation(image: Phaser.GameObjects.Image): number {
    return furnitureRotationImpl(this, image)
  }

  furnitureDirection(angle: number): FurnitureDirection {
    return furnitureDirectionImpl(this, angle)
  }

  directionalFurnitureTexture(frame: number, angle: number): string {
    return directionalFurnitureTextureImpl(this, frame, angle)
  }

  furnitureDepthBonus(id: string): number {
    return furnitureDepthBonusImpl(this, id)
  }

  maxFurnitureDepth(): number {
    return maxFurnitureDepthImpl(this)
  }

  editorOverlayDepth(): number {
    return editorOverlayDepthImpl(this)
  }

  hasCollidingFurniture(): boolean {
    return hasCollidingFurnitureImpl(this)
  }

  addFurniture(id: string, frame: number, x: number, y: number, _width: number, _height: number): Phaser.GameObjects.Image {
    return addFurnitureImpl(this, id, frame, x, y, _width, _height)
  }

  // The palette/floor-picker/remove-buttons used to render as Phaser objects
  // overlapping the bottom of the office scene itself. They now live in
  // LayoutEditorPanel (React, below the canvas) and drive this scene through
  // the public editor methods + setEditorStateHandler below - this only
  // wires the one interaction that has to stay at the Phaser/input level.
  createLayoutEditor(): void {
    createLayoutEditorImpl(this)
  }

  // Shift + drag draws a rectangle and multi-selects every piece whose
  // anchor point falls inside it (for bulk "선택 삭제"); a shift+click with
  // no real drag instead toggles just the one piece under the pointer, so
  // shift can build up a selection one click at a time too.
  createMarqueeSelect(): void {
    createMarqueeSelectImpl(this)
  }

  setEditorUiVisible(visible: boolean): void {
    setEditorUiVisibleImpl(this, visible)
  }

  selectFurniture(id: string | null): void {
    selectFurnitureImpl(this, id)
  }

  updateSelectionOutline(): void {
    updateSelectionOutlineImpl(this)
  }

  clearMultiSelection(): void {
    clearMultiSelectionImpl(this)
  }

  addToMultiSelection(id: string): void {
    addToMultiSelectionImpl(this, id)
  }

  removeFromMultiSelection(id: string): void {
    removeFromMultiSelectionImpl(this, id)
  }

  setMultiSelection(ids: string[]): void {
    setMultiSelectionImpl(this, ids)
  }

  toggleFurnitureSelection(id: string): void {
    toggleFurnitureSelectionImpl(this, id)
  }

  addFurnitureFromPalette(frame: number): void {
    addFurnitureFromPaletteImpl(this, frame)
  }

  async deleteSelectedFurniture(): Promise<void> {
    return deleteSelectedFurnitureImpl(this)
  }

  async deleteFurnitureView(view: FurnitureView): Promise<void> {
    return deleteFurnitureViewImpl(this, view)
  }

  rotateSelectedFurniture(delta: number): void {
    rotateSelectedFurnitureImpl(this, delta)
  }

  saveFurnitureLayout(): void {
    saveFurnitureLayoutImpl(this)
  }

  restoreCustomFurniture(): void {
    restoreCustomFurnitureImpl(this)
  }

  // "초기화" clears the interior entirely - floor/walls/elevator stay, every
  // desk/chair and custom piece goes - rather than restoring the furnished
  // defaults, matching the stripped-down office this is meant to reset to.
  resetFurnitureLayout(): void {
    resetFurnitureLayoutImpl(this)
  }

  furnitureNavigationKey(): string {
    return furnitureNavigationKeyImpl(this)
  }

  refreshNavigationLayout(): void {
    refreshNavigationLayoutImpl(this)
  }

  // Selection order is retained only for furniture sharing a floor position.
  bringFurnitureToFront(id: string): void {
    bringFurnitureToFrontImpl(this, id)
  }

  refreshFurnitureDepths(): void {
    refreshFurnitureDepthsImpl(this)
  }

  refreshTeamLabels(): void {
    refreshTeamLabelsImpl(this)
  }

  editorState(): EditorState {
    return editorStateImpl(this)
  }

  notifyEditorState(): void {
    notifyEditorStateImpl(this)
  }

  /** Returns whether the transition was actually applied. Leaving edit mode
   *  is refused (scene stays in editing state) while any piece still
   *  collides - no more silently shoving overlapping furniture aside. */
  setLayoutEditing(editing: boolean): boolean {
    return setLayoutEditingImpl(this, editing)
  }

  isLayoutEditing(): boolean {
    return isLayoutEditingImpl(this)
  }

  setFloorTexture(texture: FloorTexture): void {
    setFloorTextureImpl(this, texture)
  }

  createRepresentativeActor(): void {
    createRepresentativeActorImpl(this)
  }

  moveRepresentativeTo(point: WorldPoint): boolean {
    return moveRepresentativeToImpl(this, point)
  }

  /** Reserve a free chair, walk to its accessible edge, then sit on its seat. */
  sitRepresentativeOn(chairId: string): boolean {
    return sitRepresentativeOnImpl(this, chairId)
  }

  /** Approach the clicked furniture's live position before taking a break. */
  interactRepresentativeWith(furnitureId: string): boolean {
    return interactRepresentativeWithImpl(this, furnitureId)
  }

  showPantryHint(id: string, text: string): void {
    showPantryHintImpl(this, id, text)
  }

  pantryServicePoint(furniture: FurnitureView): WorldPoint {
    return pantryServicePointImpl(this, furniture)
  }

  pantryAccessCollisions(furniture: FurnitureView): CollisionRect[] {
    return pantryAccessCollisionsImpl(this, furniture)
  }

  representativeCanUsePantry(furniture: FurnitureView, from: WorldPoint): boolean {
    return representativeCanUsePantryImpl(this, furniture, from)
  }

  representativePantryApproach(furniture: FurnitureView, from: WorldPoint): WorldPoint | null {
    return representativePantryApproachImpl(this, furniture, from)
  }

  startRepresentativePantryAction(): void {
    startRepresentativePantryActionImpl(this)
  }

  stopRepresentativePantryAction(): void {
    stopRepresentativePantryActionImpl(this)
  }

  applyRepresentativePantryPose(): void {
    applyRepresentativePantryPoseImpl(this)
  }

  updateRepresentativePantryAction(deltaMs: number): void {
    updateRepresentativePantryActionImpl(this, deltaMs)
  }

  showRepresentativeSpeech(text: string): void {
    showRepresentativeSpeechImpl(this, text)
  }

  hideRepresentativeSpeech(): void {
    hideRepresentativeSpeechImpl(this)
  }

  representativeChairAvailable(chair: FurnitureView, checkReservations = false): boolean {
    return representativeChairAvailableImpl(this, chair, checkReservations)
  }

  chairAccessCollisions(chair: FurnitureView, actor?: ActorView, includeActors = true): CollisionRect[] {
    return chairAccessCollisionsImpl(this, chair, actor, includeActors)
  }

  representativeChairApproach(chair: FurnitureView, from: WorldPoint): WorldPoint | null {
    return representativeChairApproachImpl(this, chair, from)
  }

  representativeDeparturePoint(): WorldPoint | null {
    return representativeDeparturePointImpl(this)
  }

  standRepresentative(): boolean {
    return standRepresentativeImpl(this)
  }

  planRepresentativeRoute(): void {
    planRepresentativeRouteImpl(this)
  }

  repairRepresentativePosition(): void {
    repairRepresentativePositionImpl(this)
  }

  updateRepresentativeMovement(deltaSeconds: number): void {
    updateRepresentativeMovementImpl(this, deltaSeconds)
  }

  stopRepresentativeMovement(): void {
    stopRepresentativeMovementImpl(this)
  }

  updateRepresentativeDepth(): void {
    updateRepresentativeDepthImpl(this)
  }

  updateRepresentativeWorkAnimation(deltaMs: number): void {
    updateRepresentativeWorkAnimationImpl(this, deltaMs)
  }

  applySeatedComposition(chair: FurnitureView, sprite: Phaser.GameObjects.Sprite,
    foreground: Phaser.GameObjects.Sprite,
    depthTarget: Phaser.GameObjects.Sprite | Phaser.GameObjects.Container): number {
    return applySeatedCompositionImpl(this, chair, sprite, foreground, depthTarget)
  }

  seatedFrameAnchor(sprite: Phaser.GameObjects.Sprite): WorldPoint {
    return seatedFrameAnchorImpl(this, sprite)
  }

  renderSeatedForeground(sprite: Phaser.GameObjects.Sprite, foreground: Phaser.GameObjects.Sprite): void {
    renderSeatedForegroundImpl(this, sprite, foreground)
  }

  applyRepresentativePose(pose: CharacterPose): void {
    applyRepresentativePoseImpl(this, pose)
  }

  persistRepresentativePosition(): void {
    persistRepresentativePositionImpl(this)
  }

  updateRepresentativeLabelPosition(): void {
    updateRepresentativeLabelPositionImpl(this)
  }

  applySnapshot(snapshot: OfficeWorldSnapshot): void {
    applySnapshotImpl(this, snapshot)
  }

  createActor(actor: OfficeGameActor): ActorView {
    return createActorImpl(this, actor)
  }

  // The live chair position (which the interior editor can move) instead of
  // the static TEAM_DESKS default, so characters keep finding their seat
  // after a desk is dragged elsewhere.
  deskSeatPoint(actor: OfficeGameActor): WorldPoint {
    return deskSeatPointImpl(this, actor)
  }

  actorCanUseChair(actor: OfficeGameActor, chair: FurnitureView): boolean {
    return actorCanUseChairImpl(this, actor, chair)
  }

  assignedDeskChair(actor: OfficeGameActor): FurnitureView | undefined {
    return assignedDeskChairImpl(this, actor)
  }

  meetingDestination(actor: OfficeGameActor): ActorDestination {
    return meetingDestinationImpl(this, actor)
  }

  actorDestination(actor: OfficeGameActor, actorIndex: number): ActorDestination {
    return actorDestinationImpl(this, actor, actorIndex)
  }

  representativeVisitDestination(actor: OfficeGameActor): ActorDestination {
    return representativeVisitDestinationImpl(this, actor)
  }

  actorObstacles(except?: ActorView, includeRepresentative = true): CollisionRect[] {
    return actorObstaclesImpl(this, except, includeRepresentative)
  }

  occupancyKey(view: ActorView): string {
    return occupancyKeyImpl(this, view)
  }

  effectiveActor(view: ActorView, visitAllowed = false): OfficeGameActor {
    return effectiveActorImpl(this, view, visitAllowed)
  }

  updateIdleActivities(): void {
    updateIdleActivitiesImpl(this)
  }

  actorDeparturePoint(view: ActorView, chair: FurnitureView, destination: ActorDestination): WorldPoint | null {
    return actorDeparturePointImpl(this, view, chair, destination)
  }

  trafficRequesterCleared(view: ActorView): boolean {
    return trafficRequesterClearedImpl(this, view)
  }

  yieldActor(view: ActorView, requesterId: string, passingRoute: WorldPoint[]): boolean {
    return yieldActorImpl(this, view, requesterId, passingRoute)
  }

  resolveActorTraffic(requester: ActorView): boolean {
    return resolveActorTrafficImpl(this, requester)
  }

  resolveRepresentativeTraffic(): void {
    resolveRepresentativeTrafficImpl(this)
  }

  updateActor(view: ActorView, actor: OfficeGameActor, actorIndex: number): void {
    updateActorImpl(this, view, actor, actorIndex)
  }

  actorSeatPathOptions(view: ActorView) {
    return actorSeatPathOptionsImpl(this, view)
  }

  restoreActorStandingPose(view: ActorView): void {
    restoreActorStandingPoseImpl(this, view)
  }

  stopActorAction(view: ActorView): void {
    stopActorActionImpl(this, view)
  }

  stopActorWalking(view: ActorView): void {
    stopActorWalkingImpl(this, view)
  }

  blockActor(view: ActorView, dynamic: boolean): void {
    blockActorImpl(this, view, dynamic)
  }

  finishActorRoute(view: ActorView): void {
    finishActorRouteImpl(this, view)
  }

  updateActorMovement(deltaSeconds: number): void {
    updateActorMovementImpl(this, deltaSeconds)
  }

  startActionAnimation(view: ActorView, actor: OfficeGameActor): void {
    startActionAnimationImpl(this, view, actor)
  }

  applyActorPantryPose(view: ActorView): void {
    applyActorPantryPoseImpl(this, view)
  }

  updateActorPantryActions(deltaMs: number): void {
    updateActorPantryActionsImpl(this, deltaMs)
  }

  setActorSpeech(view: ActorView, text: string): void {
    setActorSpeechImpl(this, view, text)
  }

  updateActorWorkAnimation(view: ActorView, deltaMs: number): void {
    updateActorWorkAnimationImpl(this, view, deltaMs)
  }

  updateActorDepth(view: ActorView): void {
    updateActorDepthImpl(this, view)
  }

  updateActorOverlayPosition(view: ActorView): void {
    updateActorOverlayPositionImpl(this, view)
  }

  persistActor(actor: OfficeGameActor, view: ActorView): void {
    persistActorImpl(this, actor, view)
  }
}
