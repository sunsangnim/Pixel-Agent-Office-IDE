import type { OfficeScene } from './OfficeScene'
import Phaser from 'phaser'
import { CHARACTER_FRAME_HEIGHT, CHARACTER_FRAME_WIDTH, CHARACTER_SHEET_LAYOUTS, CharacterSheetKey, measureCharacterSheet, measurePantrySheet, measureSeatedSheet, measureWalkSheet } from './characterFrames'
import { FURNITURE_DIRECTIONS, OFFICE_FONT_FAMILY } from './OfficeScene'
import { OfficeDialogue } from './officeDialogue'
import { OfficeGameActor } from './officeWorld'
import { REPRESENTATIVE_WORK_FRAME_PADDING, REPRESENTATIVE_WORK_FRAME_WIDTH, REPRESENTATIVE_WORK_POSES, REPRESENTATIVE_WORK_TEXTURE, representativeWorkPixels, workHandPixels } from './representativeWorkAnimation'
import { SEATED_ROW_NAMES, STAFF_PANTRY_SHEETS, STAFF_WALK_SHEETS, WALK_ROW_NAMES } from './staffWalkSheets'
import { measureFurnitureBounds } from './furnitureBounds'
import { measureStaffWorkSheet, staffWorkTexture } from './staffWorkAnimation'
import { seatedFrameAnchor } from './seatAnchors'

export function createRosterFrames(scene: OfficeScene): void {
  for (let row = 0; row < 4; row += 1) {
    const texture = scene.textures.get(`roster-row-${row}`)
    const source = texture.getSourceImage() as HTMLImageElement
    const cellWidth = Math.floor(source.width / 5)
    for (let column = 0; column < 5; column += 1) {
      texture.add(`${row * 5 + column}`, 0, column * cellWidth, 0, cellWidth, source.height)
    }
  }
}
export function createStaffWalkFrames(scene: OfficeScene): void {
  for (const { id } of STAFF_WALK_SHEETS) {
    scene.createCharacterFrames('staff-walk-' + id,
      (column, row) => 'actor-' + id + '-' + WALK_ROW_NAMES[row] + '-' + column, 'walk')
  }
}
export function animationAtlasFor(scene: OfficeScene, actor: OfficeGameActor): string | null {
  return actor.teamIndex >= 0 && actor.teamIndex <= 2
    ? 'staff-walk-' + scene.actorAnimationKey(actor) + '-frames' : null
}
export function createStaffPantryFrames(scene: OfficeScene): void {
  for (const { id } of STAFF_PANTRY_SHEETS) {
    scene.createCharacterFrames(`staff-pantry-${id}`, (column, row) =>
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
export function actorAnimationKey(scene: OfficeScene, actor: OfficeGameActor): string {
  if (actor.teamIndex === 0 && actor.slotIndex === 0) return '0-4'
  return `${actor.teamIndex}-${actor.slotIndex % 5}`
}
export function addOfficeText(scene: OfficeScene, x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
  const label = scene.add.text(x, y, text, {
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
export function createCeoFrames(scene: OfficeScene): void {
  const rowNames = ['idle', 'walk-down', 'walk-up', 'walk-left']
  scene.createCharacterFrames('ceo-animation-sheet', (column, row) => `ceo-${rowNames[row]}-${column}`)
  // The generated side views are left, then right in reading order.
  const seatedDirections = ['front', 'left', 'back', 'right']
  scene.createCharacterFrames('ceo-seated-sheet', (column, row) => `ceo-sit-${seatedDirections[row * 2 + column]}`)
  scene.createRepresentativeWorkFrames()
  scene.createCharacterFrames('ceo-pantry-sheet', (column, row) =>
    `ceo-${row < 2 ? 'drinking' : 'eating'}-${(row % 2) * 3 + column}`, 'pantry')
  const bubble = scene.textures.get('speech-bubble')
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
export function createRepresentativeWorkFrames(scene: OfficeScene): void {
  const seated = scene.textures.get('ceo-seated-sheet').getSourceImage() as HTMLImageElement
  const work = scene.textures.get('ceo-desk-work-sheet').getSourceImage() as HTMLImageElement
  const original = document.createElement('canvas')
  original.width = seated.width
  original.height = seated.height
  const originalContext = original.getContext('2d')!
  originalContext.drawImage(seated, 0, 0)
  const measured = measureCharacterSheet(originalContext.getImageData(0, 0, seated.width, seated.height).data,
    seated.width, 'ceo-seated-sheet')
  const normalized = document.createElement('canvas')
  normalized.width = REPRESENTATIVE_WORK_FRAME_WIDTH
  normalized.height = CHARACTER_FRAME_HEIGHT
  const input = normalized.getContext('2d')!
  input.imageSmoothingEnabled = false
  const texture = scene.textures.createCanvas(REPRESENTATIVE_WORK_TEXTURE,
    REPRESENTATIVE_WORK_FRAME_WIDTH * REPRESENTATIVE_WORK_POSES, CHARACTER_FRAME_HEIGHT * FURNITURE_DIRECTIONS.length)
  if (!texture) throw new Error('Could not create representative work frames')
  const context = texture.getContext()
  const seatedFrames = scene.textures.get('ceo-seated-sheet-frames')
  const headContext = (seatedFrames.getSourceImage() as HTMLCanvasElement).getContext('2d')!
  FURNITURE_DIRECTIONS.forEach((direction, row) => {
    const index = ['front', 'left', 'back', 'right'].indexOf(direction)
    const { source, destination } = measured[index]
    // The raised-arm sheet preserves the original hips and feet. Use that
    // original transform, including padding beyond its old arm bounds, so
    // reaching forward never recenters or rescales the seated character.
    const scaleX = destination.width / source.width
    const scaleY = destination.height / source.height
    const cellX = (index % 2) * seated.width / 2
    const cellY = Math.floor(index / 2) * seated.height / 2
    input.clearRect(0, 0, REPRESENTATIVE_WORK_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT)
    input.drawImage(work, cellX, cellY, seated.width / 2, seated.height / 2,
      REPRESENTATIVE_WORK_FRAME_PADDING + destination.x + (cellX - source.x) * scaleX, destination.y + (cellY - source.y) * scaleY,
      seated.width / 2 * scaleX, seated.height / 2 * scaleY)
    const pixels = input.getImageData(0, 0, REPRESENTATIVE_WORK_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT)
    const seatedFrame = seatedFrames.get(`ceo-sit-${direction}`)
    const head = headContext.getImageData(seatedFrame.cutX, seatedFrame.cutY, CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT).data
    for (let pose = 0; pose < REPRESENTATIVE_WORK_POSES; pose += 1) {
      const output = context.createImageData(REPRESENTATIVE_WORK_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT)
      output.data.set(representativeWorkPixels(pixels.data, REPRESENTATIVE_WORK_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT, direction, pose, head))
      const x = pose * REPRESENTATIVE_WORK_FRAME_WIDTH
      const y = row * CHARACTER_FRAME_HEIGHT
      context.putImageData(output, x, y)
      texture.add(`ceo-work-${direction}-${pose}`, 0, x, y, REPRESENTATIVE_WORK_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT)
    }
  })
  texture.refresh()
}
export function createStaffWorkFrames(scene: OfficeScene, team: number): void {
  const seated = scene.textures.get(`staff-seated-${team}`).getSourceImage() as HTMLImageElement
  const work = scene.textures.get(`staff-work-${team}`).getSourceImage() as HTMLImageElement
  if (work.width !== seated.width || work.height !== seated.height) throw new Error(`Staff work sheet ${team} changed grid size`)
  const read = (image: HTMLImageElement): Uint8ClampedArray => {
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    return context.getImageData(0, 0, image.width, image.height).data
  }
  const frames = measureStaffWorkSheet(read(seated), read(work), seated.width, seated.height, team)
  const normalized = document.createElement('canvas')
  normalized.width = REPRESENTATIVE_WORK_FRAME_WIDTH; normalized.height = CHARACTER_FRAME_HEIGHT
  const input = normalized.getContext('2d')!
  input.imageSmoothingEnabled = false
  const texture = scene.textures.createCanvas(staffWorkTexture(team), REPRESENTATIVE_WORK_FRAME_WIDTH * REPRESENTATIVE_WORK_POSES,
    CHARACTER_FRAME_HEIGHT * frames.length)
  if (!texture) throw new Error(`Could not create staff work frames: ${team}`)
  const context = texture.getContext()
  const seatedFrames = scene.textures.get(`staff-seated-${team}-frames`)
  const headContext = (seatedFrames.getSourceImage() as HTMLCanvasElement).getContext('2d')!
  frames.forEach(({ column, row, region: r, workDestination: d, hands }, index) => {
    input.clearRect(0, 0, normalized.width, normalized.height)
    // Keep the original body scale and chair contact, with room for the
    // complete forward reach. Right-facing staff mirror the left pose.
    input.drawImage(work, r.x, r.y, r.width, r.height, d.x, d.y, d.width, d.height)
    const pixels = input.getImageData(0, 0, normalized.width, normalized.height).data
    const frame = seatedFrames.get(`actor-${team}-${column}-sit-${SEATED_ROW_NAMES[row]}`)
    const head = headContext.getImageData(frame.cutX, frame.cutY, CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT).data
    for (let pose = 0; pose < REPRESENTATIVE_WORK_POSES; pose++) {
      const output = context.createImageData(normalized.width, normalized.height)
      output.data.set(workHandPixels(pixels, normalized.width, normalized.height, hands, pose, head))
      const x = pose * normalized.width, y = index * normalized.height
      context.putImageData(output, x, y)
      texture.add(`actor-${team}-${column}-work-${SEATED_ROW_NAMES[row]}-${pose}`, 0, x, y, normalized.width, normalized.height)
    }
  })
  texture.refresh()
}
export function createCharacterFrames(scene: OfficeScene, sourceKey: string, frameName: (column: number, row: number) => string,
  kind: 'legacy' | 'walk' | 'seated' | 'pantry' = 'legacy'): string {
  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement
  const layout = kind === 'pantry' ? { columns: 3, rows: [0, 1, 2, 3] }
    : kind === 'seated' ? { columns: 5, rows: SEATED_ROW_NAMES }
    : kind === 'walk' ? { columns: 4, rows: WALK_ROW_NAMES } : CHARACTER_SHEET_LAYOUTS[sourceKey as CharacterSheetKey]
  const key = `${sourceKey}-frames`
  const texture = scene.textures.createCanvas(
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
      scene.seatedFrameAnchors.set(`${key}/${frameName(column, row)}`,
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
export function dialogueForActor(scene: OfficeScene, actor: OfficeGameActor, text: string, id: string): OfficeDialogue | null {
  const atlas = scene.animationAtlasFor(actor)
  if (!atlas || !scene.textures.exists(atlas)) return null
  return { id, profileId: actor.profileId, displayName: actor.displayName, text,
    portraitUrl: scene.textures.getBase64(atlas, `actor-${scene.actorAnimationKey(actor)}-idle-0`) }
}
