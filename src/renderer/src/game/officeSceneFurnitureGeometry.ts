import type { OfficeScene } from './OfficeScene'
import Phaser from 'phaser'
import { CONFERENCE_TABLE_FRAME } from './layoutPersistence'
import { CollisionRect, intersectsAabb } from './collisionResolution'
import { FURNITURE_ASSET_NAMES, FURNITURE_DIRECTIONS, FURNITURE_TEXTURES, FURNITURE_WALK_CLEARANCE, FurnitureDirection, STACKABLE_FURNITURE_FRAMES } from './OfficeScene'
import { OFFICE_WALL_COLLISIONS, collisionFootprint, furnitureCollision, rotatedFootprint, snapFurniturePoint } from './officeGrid'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, WorldPoint } from './officeWorld'
import { measureFurnitureBounds } from './furnitureBounds'

export function collisionRects(scene: OfficeScene, excludedIds: ReadonlySet<string> = new Set(), clearance = FURNITURE_WALK_CLEARANCE): CollisionRect[] {
  const furnitureRects = [...scene.furniture.values()]
    .filter(({ id, frame }) => !excludedIds.has(id) && !STACKABLE_FURNITURE_FRAMES.has(frame))
    .map(({ image }) => scene.furnitureWalkCollision(image, clearance))
  return [...OFFICE_WALL_COLLISIONS, ...furnitureRects]
}
export function furnitureTextureBounds(scene: OfficeScene, image: Phaser.GameObjects.Image): CollisionRect {
  const key = image.texture.key
  const cached = scene.furnitureBoundsByTexture.get(key)
  if (cached) return cached
  const pixels = scene.furnitureTexturePixels(image)
  const bounds = measureFurnitureBounds(pixels.data, pixels.width, pixels.height)
  scene.furnitureBoundsByTexture.set(key, bounds)
  return bounds
}
export function furnitureTexturePixels(scene: OfficeScene, image: Phaser.GameObjects.Image): ImageData {
  const source = image.texture.getSourceImage() as HTMLImageElement
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(source, 0, 0)
  const pixels = context.getImageData(0, 0, source.width, source.height)
  return pixels
}
export function furnitureWalkCollision(scene: OfficeScene, image: Phaser.GameObjects.Image, clearance = FURNITURE_WALK_CLEARANCE): CollisionRect {
  // PNG padding is empty floor. Only the visible furniture blocks walking;
  // the actor's foot collider already supplies most of the required clearance.
  const bounds = scene.furnitureTextureBounds(image)
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
export function furniturePlacementCollides(scene: OfficeScene, _id: string, frame: number, point: WorldPoint, angle: number): boolean {
  const candidate = furnitureCollision(point, collisionFootprint(frame, angle))
  return OFFICE_WALL_COLLISIONS.some((wall) => intersectsAabb(candidate, wall))
}
// Searches outward in expanding rings from `near` (falling back to the
// office center) so a forced relocation lands as close as possible to
// where the piece was meant to be, instead of teleporting to the first
// free cell found by a top-left raster scan of the whole map.
export function findFreeFurniturePoint(scene: OfficeScene, frame: number, angle = 0, near?: WorldPoint): WorldPoint {
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
        if (!scene.furniturePlacementCollides('', frame, point, angle)) return point
      }
    }
  }
  return origin
}
export function furnitureRotation(scene: OfficeScene, image: Phaser.GameObjects.Image): number {
  return Number(image.getData('furnitureRotation') ?? 0)
}
export function furnitureDirection(scene: OfficeScene, angle: number): FurnitureDirection {
  return FURNITURE_DIRECTIONS[((Math.round(angle / 90) % 4) + 4) % 4]
}
export function directionalFurnitureTexture(scene: OfficeScene, frame: number, angle: number): string {
  if (frame === CONFERENCE_TABLE_FRAME) {
    return Math.abs(Math.round(angle / 90)) % 2 === 1
      ? 'furniture-conference-table-side' : 'furniture-conference-table'
  }
  const assetName = FURNITURE_ASSET_NAMES[frame]
  if (!assetName) return FURNITURE_TEXTURES[frame] ?? 'furniture-workstation-desk'
  const direction = scene.furnitureDirection(angle)
  // Keep the approved, independently cropped source asset for the default
  // front view. Generated cardinal variants are only used after rotation.
  if (direction === 'front') return FURNITURE_TEXTURES[frame] ?? 'furniture-workstation-desk'
  return `furniture-directional-${assetName}-${direction}`
}
export function furnitureDepthBonus(scene: OfficeScene, id: string): number {
  const zOrder = Math.max(0, scene.zOrderById.get(id) ?? 0)
  return 0.1 * zOrder / (zOrder + 1)
}
export function maxFurnitureDepth(scene: OfficeScene): number {
  let max = 0
  scene.furniture.forEach(({ image }) => { if (image.depth > max) max = image.depth })
  return max
}
export function editorOverlayDepth(scene: OfficeScene): number {
  return scene.maxFurnitureDepth() + OFFICE_WORLD_HEIGHT + 2
}
export function hasCollidingFurniture(scene: OfficeScene): boolean {
  for (const { id, frame, image } of scene.furniture.values()) {
    if (scene.furniturePlacementCollides(id, frame, image, scene.furnitureRotation(image))) return true
  }
  return false
}
