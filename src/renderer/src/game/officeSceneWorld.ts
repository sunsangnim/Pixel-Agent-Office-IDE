import type { OfficeScene } from './OfficeScene'
import { DEFAULT_LAYOUT_SEED, REPRESENTATIVE_CHAIR_ID, REPRESENTATIVE_DESK_ID } from './layoutPersistence'
import { DESK_FURNITURE_FRAME } from './OfficeScene'
import { OFFICE_FLOOR_REGION, OFFICE_WALL_COLLISIONS } from './officeGrid'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, TEAM_DESKS, WAYPOINTS, WorldPoint, teamIndexForX } from './officeWorld'
import { REPRESENTATIVE_ROOM, isInStaffArea } from './officeRooms'
import { measureFurnitureBounds } from './furnitureBounds'

export function createWorld(scene: OfficeScene): void {
  scene.add.rectangle(
    OFFICE_WORLD_WIDTH / 2, OFFICE_WORLD_HEIGHT / 2, OFFICE_WORLD_WIDTH, OFFICE_WORLD_HEIGHT, 0x18352e
  ).setDepth(0)
  scene.createFloorLayers()
  scene.createHardcodedArchitecture()

  scene.createRoom(8, 8, 280, 205, '탕비실')
  scene.createRoom(296, 8, 370, 205, '회의실')
  scene.createRoom(674, 8, 278, 205, '출입구')
  const room = REPRESENTATIVE_ROOM
  scene.createRoom(room.left + 5, room.top + 5, room.right - room.left, room.bottom - room.top, '대표실')

  // Pantry/meeting/representative-room decoration stays stripped per
  // request. Desks are back: capacity is now driven by how many are
  // actually placed in each team's zone, so they have to exist to count.
  // scene.createPantry()
  // scene.createMeetingRoom()
  scene.createEntrance()
  // scene.createRepresentativeRoom()
  scene.createDesks()
  scene.restoreCustomFurniture()
}
export function createFloorLayers(scene: OfficeScene): void {
  const region = OFFICE_FLOOR_REGION
  scene.floorLayers = [
    scene.add.tileSprite(region.x, region.y, region.width, region.height, scene.selectedFloor)
      .setTileScale(0.75)
      .setDepth(1)
  ]
}
export function createHardcodedArchitecture(scene: OfficeScene): void {
  // The north-facing room backs are part of the opaque exterior shell. One
  // continuous strip spans the full interior width so there is no seam at
  // the 탕비실/회의실/출입구 boundaries (previously three separate tiles
  // left visible gaps where the vertical dividers meet the top wall).
  // Extended up to y=0 (was y=26) so it's flush with the top edge of the
  // world instead of leaving a sliver of bare floor tile visible above it.
  scene.add.tileSprite(480, 45, OFFICE_WORLD_WIDTH, 90, 'architecture-wall-surface').setDepth(12)
  OFFICE_WALL_COLLISIONS.forEach((wall) => {
    const horizontal = wall.width >= wall.height
    const perimeter = wall.x === 0 || wall.y === 0 ||
      wall.x + wall.width === OFFICE_WORLD_WIDTH || wall.y + wall.height === OFFICE_WORLD_HEIGHT
    const texture = perimeter
      ? (horizontal ? 'architecture-wall-horizontal' : 'architecture-wall-vertical')
      : (horizontal ? 'architecture-glass-wall-horizontal' : 'architecture-glass-wall-vertical')
    scene.add.tileSprite(
      wall.x, wall.y, wall.width, wall.height, texture
    ).setOrigin(0).setDepth(20)
  })
}
export function createRoom(scene: OfficeScene, x: number, y: number, width: number, height: number, label: string): void {
  scene.addOfficeText(x + 10, y + 8, label, {
    fontSize: '12px', color: '#17362e', backgroundColor: '#dff3ed'
  }).setPadding(4, 4).setDepth(800)
}
export function createDoor(scene: OfficeScene, id: string, x: number, y: number, width: number, height: number): void {
  scene.add.rectangle(x, y, width + 8, height + 8, 0x173b39).setDepth(30)
  scene.add.rectangle(x, y - height / 2 - 2, width + 12, 4, 0x376f68).setDepth(31)
  const left = scene.add.rectangle(x - width / 4, y, width / 2, height, 0x8fa8a1).setDepth(32)
  const right = scene.add.rectangle(x + width / 4, y, width / 2, height, 0x839b94).setDepth(32)
  scene.doors.set(id, { left, right, isOpen: false })
}
export function setDoorOpen(scene: OfficeScene, id: string, open: boolean): void {
  const door = scene.doors.get(id)
  if (!door || door.isOpen === open) return
  door.isOpen = open
  const halfWidth = door.left.displayWidth
  scene.tweens.killTweensOf([door.left, door.right])
  scene.tweens.add({
    targets: door.left,
    x: door.left.x + (open ? -halfWidth : halfWidth),
    duration: 260,
    ease: 'Stepped',
    easeParams: [4]
  })
  scene.tweens.add({
    targets: door.right,
    x: door.right.x + (open ? halfWidth : -halfWidth),
    duration: 260,
    ease: 'Stepped',
    easeParams: [4]
  })
}
export function createPantry(scene: OfficeScene): void {
  scene.addFurniture('pantry-cabinet', 0, 65, 105, 70, 82)
  scene.addFurniture('pantry-fridge', 1, 145, 98, 62, 105)
  scene.addFurniture('pantry-counter', 2, 220, 108, 105, 70)
}
export function createMeetingRoom(scene: OfficeScene): void {
  scene.addFurniture('meeting-table', 6, 480, 128, 256, 96)
  scene.addFurniture('meeting-laptop', 7, 480, 132, 48, 32)
  scene.addFurniture('meeting-screen', 5, 480, 52, 135, 48)
}
export function createEntrance(scene: OfficeScene): void {
  // Recessed into the decorative wall band (y 26-90) instead of the old
  // 94-150 box, which hung well below the wall and floated in the open
  // room like a freestanding crate rather than a door in the wall.
  scene.createDoor('elevator', WAYPOINTS.elevatorInside.x, 58, 84, 64)
  // scene.addFurniture('entrance-plant-left', 15, 735, 125, 45, 70)
  // scene.addFurniture('entrance-plant-right', 15, 905, 125, 45, 70)
}
export function createRepresentativeRoom(scene: OfficeScene): void {
  scene.addFurniture('representative-plant', 15, 760, 900, 48, 70)
  scene.addFurniture('representative-side-table', 16, 805, 912, 48, 42)
  scene.addFurniture('representative-sofa', 17, 895, 775, 82, 48)
  scene.addFurniture('representative-lamp', 18, 842, 775, 32, 62)
  scene.addFurniture('representative-bookcase', 19, 912, 888, 48, 86)
  scene.addFurniture('representative-desk', 10, 835, 835, 100, 58)
  scene.addFurniture('representative-chair', 12, 835, 815, 38, 42)
}
// Idempotent so it doubles as both the initial build and, after a layout
// reset clears removedDeskIds, a way to recreate whichever default pairs
// the user had previously deleted - without duplicating ones still present.
export function ensureDeskPair(scene: OfficeScene, teamIndex: number, slotIndex: number): void {
  const point = TEAM_DESKS[teamIndex][slotIndex]
  const deskId = `desk-${teamIndex}-${slotIndex}`
  const chairId = `chair-${teamIndex}-${slotIndex}`
  if (!scene.removedDeskIds.has(deskId) && !scene.furniture.has(deskId)) {
    scene.addFurniture(deskId, DESK_FURNITURE_FRAME, point.x, point.y + 12, 92, 58)
    if (slotIndex === 0) {
      const teamNames = ['Claude', 'Codex', 'Antigravity']
      const label = scene.addOfficeText(0, 0, `Team ${teamNames[teamIndex]}`, {
        fontSize: '11px', color: '#111111'
      }).setPadding(4, 4).setOrigin(0.5, 0).setDepth(3)
      scene.teamLabels.set(deskId, label)
      scene.refreshTeamLabels()
    }
  }
  // Created right after its own desk, so on a fresh install (nothing in
  // zOrderById yet) it gets a stable tie breaker. Its floor position keeps
  // the chair in front of the desk, whether empty or occupied.
  if (!scene.removedDeskIds.has(chairId) && !scene.furniture.has(chairId)) {
    scene.addFurniture(chairId, 12 + teamIndex, point.x, point.y + 18, 38, 42)
  }
}
export function createDesks(scene: OfficeScene): void {
  TEAM_DESKS.forEach((team, teamIndex) => team.forEach((_point, slotIndex) => {
    scene.ensureDeskPair(teamIndex, slotIndex)
  }))
  for (const [id, frame] of [[REPRESENTATIVE_DESK_ID, DESK_FURNITURE_FRAME], [REPRESENTATIVE_CHAIR_ID, 12]] as const) {
    if (scene.removedDeskIds.has(id) || scene.furniture.has(id)) continue
    const point = DEFAULT_LAYOUT_SEED[id]
    scene.addFurniture(id, frame, point.x, point.y, 64, 64)
  }
}
/** Default desks keep their teamIndex in the id (collision avoidance can
 *  nudge one off its column, which would misclassify it under pure
 *  position lookup); only custom-added desks - which carry no team of
 *  their own - go by which column their x position currently falls in. */
export function deskZone(scene: OfficeScene, id: string, point: WorldPoint): number {
  if (id === REPRESENTATIVE_DESK_ID || !isInStaffArea(point)) return -1
  const defaultMatch = /^desk-(\d+)-\d+$/.exec(id)
  return defaultMatch ? Number(defaultMatch[1]) : teamIndexForX(point.x)
}
/** Every desk-frame piece (default or custom-added), grouped by team -
 *  this *is* the team's seat capacity. */
export function computeDeskCounts(scene: OfficeScene): number[] {
  const counts = [0, 0, 0]
  scene.furniture.forEach(({ id, frame, image }) => {
    if (frame !== DESK_FURNITURE_FRAME) return
    const zone = scene.deskZone(id, image)
    if (zone >= 0 && zone < counts.length) counts[zone] += 1
  })
  return counts
}
export function reportDeskCounts(scene: OfficeScene): void {
  scene.deskCountsHandler?.(scene.computeDeskCounts())
}
export function createConferenceTableTextures(scene: OfficeScene): void {
  // Fit the generated alpha silhouettes into the former four-table bounds.
  // Original PNGs stay intact; opposite views share this symmetric furniture.
  for (const [key, width, height, x, y, artWidth, artHeight] of [
    ['furniture-conference-table', 256, 144, 22, 28, 212, 105],
    ['furniture-conference-table-side', 144, 256, 20, 22, 105, 212]
  ] as const) {
    if (scene.textures.exists(key)) continue
    const source = scene.textures.get(`${key}-source`).getSourceImage() as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(source, 0, 0)
    const bounds = measureFurnitureBounds(context.getImageData(0, 0, source.width, source.height).data,
      source.width, source.height)
    const texture = scene.textures.createCanvas(key, width, height)!
    texture.context.imageSmoothingEnabled = false
    texture.context.drawImage(source, Math.round(bounds.x * source.width), Math.round(bounds.y * source.height),
      Math.round(bounds.width * source.width), Math.round(bounds.height * source.height), x, y, artWidth, artHeight)
    texture.refresh()
  }
}
export function showEditorNotice(scene: OfficeScene, text: string): void {
  const notice = scene.addOfficeText(480, 30, text, {
    fontSize: '12px', color: '#ffffff', backgroundColor: '#7a2222'
  }).setOrigin(0.5, 0).setPadding(6, 6).setDepth(scene.editorOverlayDepth())
  scene.time.delayedCall(2200, () => notice.destroy())
}
