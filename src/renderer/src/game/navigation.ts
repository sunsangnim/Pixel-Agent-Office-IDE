import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, TEAM_DESKS, type WorldPoint } from './officeWorld'
import { intersectsAabb, type CollisionRect } from './collisionResolution'

export const NAV_TILE_SIZE = 16
export const ACTOR_NAV_HALF_WIDTH = 14
export const ACTOR_NAV_HALF_HEIGHT = 10
const COLS = OFFICE_WORLD_WIDTH / NAV_TILE_SIZE
const ROWS = OFFICE_WORLD_HEIGHT / NAV_TILE_SIZE

export const OFFICE_COLLISIONS: CollisionRect[] = [
  ...TEAM_DESKS.flat().map((point) => ({ x: point.x - 48, y: point.y - 18, width: 96, height: 45 })),
  { x: 25, y: 64, width: 80, height: 78 }, { x: 122, y: 28, width: 50, height: 112 },
  { x: 185, y: 78, width: 78, height: 65 }, { x: 355, y: 98, width: 250, height: 62 },
  { x: 712, y: 72, width: 42, height: 92 }, { x: 885, y: 72, width: 42, height: 92 },
  { x: 815, y: 490, width: 104, height: 58 }, { x: 738, y: 540, width: 75, height: 86 },
  { x: 882, y: 520, width: 65, height: 108 }
]

export function actorCollisionRect(point: WorldPoint): CollisionRect {
  return {
    x: point.x - ACTOR_NAV_HALF_WIDTH, y: point.y - ACTOR_NAV_HALF_HEIGHT,
    width: ACTOR_NAV_HALF_WIDTH * 2, height: ACTOR_NAV_HALF_HEIGHT * 2
  }
}

export function isOfficePositionWalkable(point: WorldPoint, collisions: CollisionRect[]): boolean {
  const body = actorCollisionRect(point)
  return body.x >= 0 && body.y >= 0 && body.x + body.width <= OFFICE_WORLD_WIDTH && body.y + body.height <= OFFICE_WORLD_HEIGHT &&
    !collisions.some((rect) => intersectsAabb(body, rect))
}

export function hasOfficeLineOfSight(from: WorldPoint, to: WorldPoint, collisions: CollisionRect[]): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4))
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    if (!isOfficePositionWalkable({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, collisions)) return false
  }
  return true
}

function gridPoint(index: number): WorldPoint {
  return { x: (index % COLS) * NAV_TILE_SIZE, y: Math.floor(index / COLS) * NAV_TILE_SIZE }
}

function distanceSquared(a: WorldPoint, b: WorldPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

export function nearestOfficePosition(point: WorldPoint, collisions: CollisionRect[], radius = 128): WorldPoint | null {
  if (isOfficePositionWalkable(point, collisions)) return { x: point.x, y: point.y }
  let best: WorldPoint | null = null
  let bestDistance = radius ** 2
  for (let index = 0; index < COLS * ROWS; index += 1) {
    const candidate = gridPoint(index)
    const distance = distanceSquared(point, candidate)
    if (distance <= bestDistance && isOfficePositionWalkable(candidate, collisions)) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

export interface OfficePathOptions {
  // Furniture interactions may approach a seat from nearby free floor. Walls
  // still block that final seating segment via goalCollisions.
  goalRadius?: number
  goalCollisions?: CollisionRect[]
}

export function findOfficePath(
  from: WorldPoint, to: WorldPoint, collisions: CollisionRect[] = OFFICE_COLLISIONS, options: OfficePathOptions = {}
): WorldPoint[] {
  if (!isOfficePositionWalkable(from, collisions)) return []
  if (hasOfficeLineOfSight(from, to, collisions)) return distanceSquared(from, to) < 0.01 ? [] : [{ ...to }]

  const walkable = new Int8Array(COLS * ROWS).fill(-1)
  const canVisit = (index: number): boolean => {
    if (walkable[index] < 0) walkable[index] = isOfficePositionWalkable(gridPoint(index), collisions) ? 1 : 0
    return walkable[index] === 1
  }
  let start = -1
  let startDistance = (NAV_TILE_SIZE * 2) ** 2
  for (let index = 0; index < walkable.length; index += 1) {
    const point = gridPoint(index)
    const distance = distanceSquared(from, point)
    if (distance <= startDistance && canVisit(index) && hasOfficeLineOfSight(from, point, collisions)) {
      start = index
      startDistance = distance
    }
  }
  if (start < 0) return []

  const parents = new Int32Array(walkable.length).fill(-2)
  parents[start] = -1
  const queue = [start]
  let goal = -1
  let exactGoal = false
  let closestDistance = (options.goalRadius ?? 0) ** 2
  // A bounded breadth-first search makes every traversed tile safe for the
  // same body used by movement. Failed searches return no route, never a line
  // through the obstacle that made the search fail.
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]
    const point = gridPoint(current)
    const distance = distanceSquared(point, to)
    if (distance <= NAV_TILE_SIZE ** 2 * 2 && hasOfficeLineOfSight(point, to, collisions)) {
      goal = current
      exactGoal = true
      break
    }
    if ((options.goalRadius ?? 0) > 0 && distance <= closestDistance &&
      hasOfficeLineOfSight(point, to, options.goalCollisions ?? collisions)) {
      if (distance < closestDistance || goal < 0) {
        goal = current
        closestDistance = distance
      }
    }
    const column = current % COLS
    const row = Math.floor(current / COLS)
    const adjacent = [
      ...(column > 0 ? [current - 1] : []), ...(column + 1 < COLS ? [current + 1] : []),
      ...(row > 0 ? [current - COLS] : []), ...(row + 1 < ROWS ? [current + COLS] : [])
    ]
    for (const next of adjacent) {
      if (parents[next] !== -2 || !canVisit(next)) continue
      if (!hasOfficeLineOfSight(point, gridPoint(next), collisions)) continue
      parents[next] = current
      queue.push(next)
    }
  }
  if (goal < 0) return []
  const reversed: WorldPoint[] = []
  for (let index = goal; index >= 0; index = parents[index]) reversed.push(gridPoint(index))
  const points = [{ ...from }, ...reversed.reverse(), ...(exactGoal ? [{ ...to }] : [])]
  const result: WorldPoint[] = []
  let anchor = 0
  while (anchor < points.length - 1) {
    let next = points.length - 1
    while (next > anchor + 1 && !hasOfficeLineOfSight(points[anchor], points[next], collisions)) next -= 1
    if (distanceSquared(points[anchor], points[next]) > 0.01) result.push(points[next])
    anchor = next
  }
  return result.length > 0 ? result : [gridPoint(goal)]
}
