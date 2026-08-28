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
  type OfficeGameActor,
  type OfficeWorldSnapshot,
  type WorldPoint
} from './officeWorld'
import { findOfficePath } from './navigation'
import {
  furnitureCollision, OFFICE_FLOOR_REGION, OFFICE_WALL_COLLISIONS, rotatedFootprint, snapFurniturePoint
} from './officeGrid'
import { intersectsAabb, pushApart, resolveAxisSeparated, type CollisionRect } from './collisionResolution'
import { OFFICE_LAYOUT_SAVE_KEY, parseOfficeLayout, type OfficeLayoutSave } from './layoutPersistence'
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
const DEFAULT_FLOOR_TEXTURE: typeof FLOOR_TEXTURES[number] = 'floor-plain-gray'
const OFFICE_FLOOR_SAVE_KEY = 'pixel-office-floor-v4'
const ACTOR_SCALE = 2
const ACTOR_COLLISION_RADIUS = 11 * ACTOR_SCALE
const ACTOR_COLLISION_HALF_WIDTH = 7 * ACTOR_SCALE
const ACTOR_COLLISION_HALF_HEIGHT = 5 * ACTOR_SCALE

function furnitureDisplaySize(frame: number, columns: number, rows: number): { width: number; height: number } {
  const scale = frame === DESK_FURNITURE_FRAME ? DESK_ASSET_SCALE : 1
  return { width: columns * 16 * scale, height: rows * 16 * scale }
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
  private layoutEditing = false
  private selectedFurniture: FurnitureView | null = null
  private selectionOutline?: Phaser.GameObjects.Rectangle
  private editorUi: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Image> = []
  private nextFurnitureId = 1
  private floorLayers: Phaser.GameObjects.TileSprite[] = []
  private selectedFloor = DEFAULT_FLOOR_TEXTURE

  constructor() {
    super(OFFICE_SCENE_KEY)
  }

  setActorSelectHandler(handler: ((profileId: string) => void) | null): void {
    this.actorSelectHandler = handler
  }

  setLayoutEditing(editing: boolean): void {
    this.layoutEditing = editing
    this.setEditorUiVisible(editing)
    if (!editing) {
      this.selectFurniture(null)
      this.sanitizeFurniturePlacements()
    }
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
    this.layoutSave = parseOfficeLayout(localStorage.getItem(OFFICE_LAYOUT_SAVE_KEY))
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
    this.add.rectangle(480, 320, 960, 640, 0x18352e).setDepth(0)
    this.createFloorLayers()
    this.createHardcodedArchitecture()

    this.createRoom(8, 8, 280, 205, '탕비실')
    this.createRoom(296, 8, 370, 205, '회의실')
    this.createRoom(674, 8, 278, 205, '출입구')
    this.createRoom(709, 405, 243, 227, '대표실')

    this.createPantry()
    this.createMeetingRoom()
    this.createEntrance()
    this.createRepresentativeRoom()
    this.createDesks()
    this.restoreCustomFurniture()
  }

  private addFurniture(id: string, frame: number, x: number, y: number, _width: number, _height: number, depth = y): Phaser.GameObjects.Image {
    const saved = this.layoutSave[id]
    const angle = saved?.rotation ?? 0
    const requested = snapFurniturePoint({ x: saved?.x ?? x, y: saved?.y ?? y }, rotatedFootprint(frame, angle))
    const fallback = snapFurniturePoint({ x, y }, rotatedFootprint(frame, angle))
    const initial = this.furniturePlacementCollides(id, frame, requested, angle)
      ? (this.furniturePlacementCollides(id, frame, fallback, angle) ? this.findFreeFurniturePoint(frame, angle) : fallback)
      : requested
    const initialFootprint = rotatedFootprint(frame, angle)
    const initialDisplaySize = furnitureDisplaySize(frame, initialFootprint.columns, initialFootprint.rows)
    const image = this.add.image(initial.x, initial.y, this.directionalFurnitureTexture(frame, angle))
      .setDisplaySize(initialDisplaySize.width, initialDisplaySize.height)
      .setDepth(initial.y ?? depth)
      .setInteractive({ useHandCursor: true, draggable: true })
    image.setData({ furnitureId: id, furnitureFrame: frame, furnitureRotation: angle })
    this.input.setDraggable(image)
    image.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.selectFurniture(id)
      if (this.layoutEditing && pointer.rightButtonDown()) this.rotateSelectedFurniture(90)
    })
    image.on('dragstart', () => image.setData({ dragStartX: image.x, dragStartY: image.y }))
    image.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (!this.layoutEditing) return
      const rotation = this.furnitureRotation(image)
      const footprint = rotatedFootprint(frame, rotation)
      const snapped = snapFurniturePoint({
        x: Phaser.Math.Clamp(dragX, footprint.columns * 8, OFFICE_WORLD_WIDTH - footprint.columns * 8),
        y: Phaser.Math.Clamp(dragY, footprint.rows * 8, OFFICE_WORLD_HEIGHT - footprint.rows * 8)
      }, footprint)
      image.setPosition(snapped.x, snapped.y).setDepth(snapped.y)
      this.updateSelectionOutline()
    })
    image.on('dragend', () => {
      if (!this.layoutEditing) return
      const snapped = snapFurniturePoint({ x: image.x, y: image.y }, rotatedFootprint(frame, this.furnitureRotation(image)))
      image.setPosition(snapped.x, snapped.y)
      image.setDepth(image.y)
      this.updateSelectionOutline()
      this.saveFurnitureLayout()
    })
    this.furniture.set(id, { id, frame, image, defaultPoint: { x, y } })
    return image
  }

  private createLayoutEditor(): void {
    this.input.mouse?.disableContextMenu()
    const panel = this.add.rectangle(480, 606, 720, 56, 0x12251f, 0.94).setDepth(1900)
    const help = this.add.text(132, 582, '드래그: 이동  |  우클릭: 방향 전환  |  빨강: 충돌', {
      fontFamily: 'monospace', fontSize: '10px', color: '#dff3ed'
    }).setDepth(2000)
    this.editorUi.push(panel, help)
    FLOOR_TEXTURES.forEach((texture, index) => {
      const tile = this.add.image(145 + index * 34, 610, texture)
        .setDisplaySize(28, 28).setDepth(2001).setInteractive({ useHandCursor: true })
      tile.on('pointerdown', () => this.setFloorTexture(texture))
      this.editorUi.push(tile)
    })
    const frames = [0, 1, 2, 5, 6, 7, 10, 12, 15, 16, 17, 18, 19]
    frames.forEach((frame, index) => {
      const x = 350 + index * 38
      const icon = this.add.image(x, 610, FURNITURE_TEXTURES[frame])
        .setDisplaySize(34, 34).setDepth(2001).setInteractive({ useHandCursor: true })
      icon.on('pointerdown', () => this.addFurnitureFromPalette(frame))
      this.editorUi.push(icon)
    })
    const remove = this.add.text(820, 582, '선택 삭제', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#803c36'
    }).setPadding(6, 4).setDepth(2001).setInteractive({ useHandCursor: true })
    remove.on('pointerdown', () => this.deleteSelectedFurniture())
    remove.setX(780)
    const reset = this.add.text(910, 582, '초기화', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', backgroundColor: '#5a5034'
    }).setPadding(6, 4).setDepth(2001).setInteractive({ useHandCursor: true })
    reset.on('pointerdown', () => this.resetFurnitureLayout())
    this.editorUi.push(remove, reset)
    this.input.keyboard?.on('keydown-DELETE', () => this.deleteSelectedFurniture())
    this.setEditorUiVisible(false)
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
    // The north-facing room backs are part of the opaque exterior shell.
    this.add.tileSprite(144, 58, 256, 64, 'architecture-wall-surface').setDepth(12)
    this.add.tileSprite(480, 58, 352, 64, 'architecture-wall-surface').setDepth(12)
    this.add.tileSprite(808, 58, 272, 64, 'architecture-wall-surface').setDepth(12)
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

  private setFloorTexture(texture: typeof FLOOR_TEXTURES[number]): void {
    if (!this.layoutEditing) return
    this.selectedFloor = texture
    this.floorLayers.forEach((layer) => layer.setTexture(texture))
    localStorage.setItem(OFFICE_FLOOR_SAVE_KEY, texture)
  }

  private setEditorUiVisible(visible: boolean): void {
    this.editorUi.forEach((object) => object.setVisible(visible))
    this.furniture.forEach(({ image }) => image.setAlpha(visible ? 0.88 : 1))
  }

  private selectFurniture(id: string | null): void {
    if (!this.layoutEditing && id) return
    this.selectedFurniture = id ? this.furniture.get(id) ?? null : null
    this.selectionOutline?.destroy()
    this.selectionOutline = undefined
    if (!this.selectedFurniture) return
    const image = this.selectedFurniture.image
    this.selectionOutline = this.add.rectangle(image.x, image.y, image.displayWidth + 6, image.displayHeight + 6)
      .setDepth(1990)
    this.updateSelectionOutline()
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

  private addFurnitureFromPalette(frame: number): void {
    if (!this.layoutEditing) return
    const id = `custom-${Date.now()}-${this.nextFurnitureId++}`
    const point = this.findFreeFurniturePoint(frame)
    const image = this.addFurniture(id, frame, point.x, point.y, 64, 64)
    this.layoutSave[id] = { x: image.x, y: image.y, frame, width: 64, height: 64 }
    this.saveFurnitureLayout()
    this.selectFurniture(id)
  }

  private deleteSelectedFurniture(): void {
    if (!this.layoutEditing || !this.selectedFurniture) return
    const { id, image } = this.selectedFurniture
    image.destroy()
    this.furniture.delete(id)
    delete this.layoutSave[id]
    this.selectedFurniture = null
    this.selectionOutline?.destroy()
    this.selectionOutline = undefined
    localStorage.setItem(OFFICE_LAYOUT_SAVE_KEY, JSON.stringify(this.layoutSave))
  }

  private rotateSelectedFurniture(delta: number): void {
    if (!this.layoutEditing || !this.selectedFurniture) return
    const image = this.selectedFurniture.image
    const nextAngle = Phaser.Math.Wrap(this.furnitureRotation(image) + delta, 0, 360)
    const footprint = rotatedFootprint(this.selectedFurniture.frame, nextAngle)
    const displaySize = furnitureDisplaySize(this.selectedFurniture.frame, footprint.columns, footprint.rows)
    const snapped = snapFurniturePoint(image, footprint)
    image
      .setPosition(snapped.x, snapped.y)
      .setTexture(this.directionalFurnitureTexture(this.selectedFurniture.frame, nextAngle))
      .setDisplaySize(displaySize.width, displaySize.height)
      .setDepth(snapped.y)
      .setData('furnitureRotation', nextAngle)
    this.updateSelectionOutline()
    this.saveFurnitureLayout()
  }

  private saveFurnitureLayout(): void {
    this.furniture.forEach(({ id, frame, image }) => {
      this.layoutSave[id] = {
        x: Math.round(image.x), y: Math.round(image.y),
        rotation: this.furnitureRotation(image),
        ...(id.startsWith('custom-') ? { frame, width: image.displayWidth, height: image.displayHeight } : {})
      }
    })
    localStorage.setItem(OFFICE_LAYOUT_SAVE_KEY, JSON.stringify(this.layoutSave))
  }

  private restoreCustomFurniture(): void {
    Object.entries(this.layoutSave).forEach(([id, saved]) => {
      if (!id.startsWith('custom-') || saved.frame === undefined) return
      this.addFurniture(id, saved.frame, saved.x, saved.y, saved.width ?? 64, saved.height ?? 64)
    })
  }

  private resetFurnitureLayout(): void {
    this.layoutSave = {}
    localStorage.removeItem(OFFICE_LAYOUT_SAVE_KEY)
    for (const [id, furniture] of this.furniture) {
      if (id.startsWith('custom-')) {
        furniture.image.destroy()
        this.furniture.delete(id)
      } else {
        const footprint = rotatedFootprint(furniture.frame, 0)
        const displaySize = furnitureDisplaySize(furniture.frame, footprint.columns, footprint.rows)
        furniture.image
          .setPosition(furniture.defaultPoint.x, furniture.defaultPoint.y)
          .setTexture(this.directionalFurnitureTexture(furniture.frame, 0))
          .setDisplaySize(displaySize.width, displaySize.height)
          .setData('furnitureRotation', 0)
          .setDepth(furniture.defaultPoint.y)
      }
    }
    this.selectFurniture(null)
  }

  private collisionRects(): CollisionRect[] {
    const furnitureRects = [...this.furniture.values()]
      .filter(({ frame }) => !STACKABLE_FURNITURE_FRAMES.has(frame))
      .map(({ frame, image }) =>
        furnitureCollision({ x: image.x, y: image.y }, rotatedFootprint(frame, this.furnitureRotation(image))))
    return [...OFFICE_WALL_COLLISIONS, ...furnitureRects]
  }

  private furniturePlacementCollides(id: string, frame: number, point: WorldPoint, angle: number): boolean {
    const candidate = furnitureCollision(point, rotatedFootprint(frame, angle))
    if (OFFICE_WALL_COLLISIONS.some((wall) => intersectsAabb(candidate, wall))) return true
    if (STACKABLE_FURNITURE_FRAMES.has(frame)) return false
    return [...this.furniture.values()].some((other) => other.id !== id && !STACKABLE_FURNITURE_FRAMES.has(other.frame) && intersectsAabb(
      candidate,
      furnitureCollision(other.image, rotatedFootprint(other.frame, this.furnitureRotation(other.image)))
    ))
  }

  private findFreeFurniturePoint(frame: number, angle = 0): WorldPoint {
    const footprint = rotatedFootprint(frame, angle)
    for (let row = 2; row < 39 - footprint.rows; row += 1) {
      for (let column = 2; column < 59 - footprint.columns; column += 1) {
        const point = snapFurniturePoint({ x: column * 16, y: row * 16 }, footprint)
        if (!this.furniturePlacementCollides('', frame, point, angle)) return point
      }
    }
    return { x: 480, y: 340 }
  }

  private sanitizeFurniturePlacements(): void {
    if (this.furniture.size === 0) return
    for (const furniture of this.furniture.values()) {
      const { id, frame, image, defaultPoint } = furniture
      const rotation = this.furnitureRotation(image)
      if (!this.furniturePlacementCollides(id, frame, image, rotation)) continue
      const fallback = snapFurniturePoint(defaultPoint, rotatedFootprint(frame, rotation))
      const point = this.furniturePlacementCollides(id, frame, fallback, rotation)
        ? this.findFreeFurniturePoint(frame, rotation)
        : fallback
      image.setPosition(point.x, point.y).setDepth(point.y)
    }
    this.saveFurnitureLayout()
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
    this.addFurniture('pantry-cabinet', 0, 65, 105, 70, 82, 40)
    this.addFurniture('pantry-fridge', 1, 145, 98, 62, 105, 40)
    this.addFurniture('pantry-counter', 2, 220, 108, 105, 70, 40)
  }

  private createMeetingRoom(): void {
    this.addFurniture('meeting-table', 6, 480, 128, 256, 96, 80)
    this.addFurniture('meeting-laptop', 7, 480, 132, 48, 32, 150)
    this.addFurniture('meeting-screen', 5, 480, 52, 135, 48, 35)
  }

  private createEntrance(): void {
    this.createDoor('elevator', WAYPOINTS.elevatorInside.x, 94, 84, 112)
    this.addFurniture('entrance-plant-left', 15, 735, 125, 45, 70, 40)
    this.addFurniture('entrance-plant-right', 15, 905, 125, 45, 70, 40)
  }

  private createRepresentativeRoom(): void {
    this.addFurniture('representative-plant', 15, 760, 580, 48, 70, 580)
    this.addFurniture('representative-side-table', 16, 805, 592, 48, 42, 592)
    this.addFurniture('representative-sofa', 17, 895, 455, 82, 48, 455)
    this.addFurniture('representative-lamp', 18, 842, 455, 32, 62, 455)
    this.addFurniture('representative-bookcase', 19, 912, 568, 48, 86, 568)
    this.addFurniture('representative-desk', 10, 835, 515, 100, 58, 515)
    this.addFurniture('representative-chair', 12, 835, 495, 38, 42, 477)
  }

  private createDesks(): void {
    TEAM_DESKS.forEach((team, teamIndex) => team.forEach((point, slotIndex) => {
      this.addFurniture(`desk-${teamIndex}-${slotIndex}`, 10, point.x, point.y + 12, 92, 58, point.y + 5)
      // Chair, actor and desk remain independent. The chair is behind the
      // seated actor while the desk front edge renders in front of both.
      this.addFurniture(`chair-${teamIndex}-${slotIndex}`, 12 + teamIndex, point.x, point.y + 54, 38, 42, point.y - 1)
      if (slotIndex === 0) this.add.text(point.x - 36, point.y - 45, ['Claude', 'Codex', 'Antigravity'][teamIndex], {
        fontFamily: 'monospace', fontSize: '10px', color: '#24473e'
      }).setDepth(700)
    }))
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
    const sprite = this.add.sprite(835, 491, 'ceo-animation-sheet', 'ceo-idle-0').setDisplaySize(104, 120).setDepth(490)
    sprite.play('ceo-idle')
    this.add.text(835, 428, '김태호 대표', {
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
        repeat: name === 'interact' ? 0 : -1
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

  private updateActor(view: ActorView, actor: OfficeGameActor, actorIndex: number): void {
    if (!view.stateMachine.requestPresence(actor.presence)) return
    const waypoints = routeFor(actor, actorIndex)
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
