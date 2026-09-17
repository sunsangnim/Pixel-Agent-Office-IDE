import type { WorldPoint } from './officeWorld'
import type { CollisionRect } from './collisionResolution'
import { findOfficePath, isOfficePositionWalkable, NAV_TILE_SIZE } from './navigation'

export function distanceToRoute(point: WorldPoint, route: WorldPoint[]): number {
  let nearest = Infinity
  for (let index = 0; index < route.length; index++) {
    const a = route[index], b = route[index + 1] ?? a
    const dx = b.x - a.x, dy = b.y - a.y
    const length = dx * dx + dy * dy
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
    nearest = Math.min(nearest, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy))
  }
  return nearest
}

// Find an actual walking route to a passing place. In a single-file aisle
// this can backtrack to the entrance; no pushing, teleporting, or ghosting.
export function findYieldRoute(from: WorldPoint, passingRoute: WorldPoint[], obstacles: CollisionRect[],
  reserved: WorldPoint[]): WorldPoint[] {
  const candidates: WorldPoint[] = []
  const center = { x: Math.round(from.x / NAV_TILE_SIZE) * NAV_TILE_SIZE, y: Math.round(from.y / NAV_TILE_SIZE) * NAV_TILE_SIZE }
  for (let dy = -256; dy <= 256; dy += NAV_TILE_SIZE) for (let dx = -256; dx <= 256; dx += NAV_TILE_SIZE) {
    const point = { x: center.x + dx, y: center.y + dy }
    const distance = Math.hypot(point.x - from.x, point.y - from.y)
    if (distance < 32 || distance > 256 || distanceToRoute(point, passingRoute) < 44 ||
      reserved.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 40) ||
      !isOfficePositionWalkable(point, obstacles)) continue
    candidates.push(point)
  }
  candidates.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y) || a.y - b.y || a.x - b.x)
  for (const point of candidates.slice(0, 48)) {
    const route = findOfficePath(from, point, obstacles)
    if (route.length > 0) return route
  }
  return []
}
