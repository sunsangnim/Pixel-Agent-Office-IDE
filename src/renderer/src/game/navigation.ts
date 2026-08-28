import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, TEAM_DESKS, type WorldPoint } from './officeWorld'

export const NAV_TILE_SIZE = 16
const COLS = OFFICE_WORLD_WIDTH / NAV_TILE_SIZE
const ROWS = OFFICE_WORLD_HEIGHT / NAV_TILE_SIZE

interface TilePoint { col: number; row: number }
interface CollisionRect { x: number; y: number; width: number; height: number }

const DESK_COLLISIONS: CollisionRect[] = TEAM_DESKS.flat().map((point) => ({
  x: point.x - 48, y: point.y - 18, width: 96, height: 45
}))

export const OFFICE_COLLISIONS: CollisionRect[] = [
  ...DESK_COLLISIONS,
  { x: 25, y: 64, width: 80, height: 78 },
  { x: 122, y: 28, width: 50, height: 112 },
  { x: 185, y: 78, width: 78, height: 65 },
  { x: 355, y: 98, width: 250, height: 62 },
  { x: 712, y: 72, width: 42, height: 92 },
  { x: 885, y: 72, width: 42, height: 92 },
  { x: 815, y: 490, width: 104, height: 58 },
  { x: 738, y: 540, width: 75, height: 86 },
  { x: 882, y: 520, width: 65, height: 108 }
]

function toTile(point: WorldPoint): TilePoint {
  return {
    col: PhaserMathClamp(Math.round(point.x / NAV_TILE_SIZE), 1, COLS - 2),
    row: PhaserMathClamp(Math.round(point.y / NAV_TILE_SIZE), 1, ROWS - 2)
  }
}

function toWorld(tile: TilePoint): WorldPoint {
  return { x: tile.col * NAV_TILE_SIZE, y: tile.row * NAV_TILE_SIZE }
}

function PhaserMathClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function tileKey(tile: TilePoint): string {
  return `${tile.col}:${tile.row}`
}

function isBlocked(tile: TilePoint, exceptions: Set<string>): boolean {
  if (exceptions.has(tileKey(tile))) return false
  const point = toWorld(tile)
  return OFFICE_COLLISIONS.some((rect) =>
    point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height
  )
}

function nearestWalkable(tile: TilePoint, exceptions: Set<string>): TilePoint {
  if (!isBlocked(tile, exceptions)) return tile
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        const candidate = { col: tile.col + dx, row: tile.row + dy }
        if (candidate.col > 0 && candidate.row > 0 && candidate.col < COLS - 1 && candidate.row < ROWS - 1 && !isBlocked(candidate, exceptions)) return candidate
      }
    }
  }
  return tile
}

export function findOfficePath(from: WorldPoint, to: WorldPoint): WorldPoint[] {
  const rawStart = toTile(from)
  const rawGoal = toTile(to)
  const exceptions = new Set([tileKey(rawStart), tileKey(rawGoal)])
  const start = nearestWalkable(rawStart, exceptions)
  const goal = nearestWalkable(rawGoal, exceptions)
  const open: TilePoint[] = [start]
  const cameFrom = new Map<string, TilePoint>()
  const gScore = new Map<string, number>([[tileKey(start), 0]])
  const fScore = new Map<string, number>([[tileKey(start), distance(start, goal)]])
  const closed = new Set<string>()

  while (open.length > 0) {
    open.sort((a, b) => (fScore.get(tileKey(a)) ?? Infinity) - (fScore.get(tileKey(b)) ?? Infinity))
    const current = open.shift()!
    const currentKey = tileKey(current)
    if (current.col === goal.col && current.row === goal.row) return simplify(reconstruct(cameFrom, current).map(toWorld), to)
    closed.add(currentKey)

    for (const neighbor of neighbors(current)) {
      const key = tileKey(neighbor)
      if (closed.has(key) || isBlocked(neighbor, exceptions)) continue
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1
      if (tentative >= (gScore.get(key) ?? Infinity)) continue
      cameFrom.set(key, current)
      gScore.set(key, tentative)
      fScore.set(key, tentative + distance(neighbor, goal))
      if (!open.some((item) => item.col === neighbor.col && item.row === neighbor.row)) open.push(neighbor)
    }
  }
  return [to]
}

function neighbors(tile: TilePoint): TilePoint[] {
  return [
    { col: tile.col + 1, row: tile.row }, { col: tile.col - 1, row: tile.row },
    { col: tile.col, row: tile.row + 1 }, { col: tile.col, row: tile.row - 1 }
  ].filter((candidate) => candidate.col > 0 && candidate.row > 0 && candidate.col < COLS - 1 && candidate.row < ROWS - 1)
}

function distance(a: TilePoint, b: TilePoint): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
}

function reconstruct(cameFrom: Map<string, TilePoint>, end: TilePoint): TilePoint[] {
  const path = [end]
  let current = end
  while (cameFrom.has(tileKey(current))) {
    current = cameFrom.get(tileKey(current))!
    path.unshift(current)
  }
  return path
}

function simplify(path: WorldPoint[], exactTarget: WorldPoint): WorldPoint[] {
  if (path.length < 2) return [exactTarget]
  const result: WorldPoint[] = []
  let previousDirection = ''
  for (let index = 1; index < path.length; index += 1) {
    const dx = Math.sign(path[index].x - path[index - 1].x)
    const dy = Math.sign(path[index].y - path[index - 1].y)
    const direction = `${dx}:${dy}`
    if (index > 1 && direction !== previousDirection) result.push(path[index - 1])
    previousDirection = direction
  }
  result.push(exactTarget)
  return result
}
