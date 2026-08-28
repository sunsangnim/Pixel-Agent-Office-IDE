import { NAV_TILE_SIZE } from './navigation'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, type WorldPoint } from './officeWorld'
import type { CollisionRect } from './collisionResolution'

export const OFFICE_GRID_COLUMNS = OFFICE_WORLD_WIDTH / NAV_TILE_SIZE
export const OFFICE_GRID_ROWS = OFFICE_WORLD_HEIGHT / NAV_TILE_SIZE
export interface TileFootprint { columns: number; rows: number }

function tiles(column: number, row: number, columns: number, rows: number): CollisionRect {
  return { x: column * NAV_TILE_SIZE, y: row * NAV_TILE_SIZE, width: columns * NAV_TILE_SIZE, height: rows * NAV_TILE_SIZE }
}

export const OFFICE_WALL_COLLISIONS: CollisionRect[] = [
  tiles(0, 0, 60, 1), tiles(0, 39, 60, 1), tiles(0, 0, 1, 40), tiles(59, 0, 1, 40),
  // Pantry: 2-tile door opening at columns 15-16.
  tiles(17, 1, 1, 13), tiles(1, 13, 14, 1),
  // Meeting room: 3-tile door opening at columns 28-30.
  tiles(18, 1, 1, 13), tiles(41, 1, 1, 13), tiles(18, 13, 10, 1), tiles(31, 13, 11, 1),
  // Entrance/elevator: 3-tile exit opening at columns 50-52.
  tiles(42, 1, 1, 13), tiles(42, 13, 8, 1), tiles(53, 13, 6, 1),
  // Representative room: 2-tile left-side door opening at rows 28-29.
  tiles(45, 25, 14, 1), tiles(45, 25, 1, 3), tiles(45, 30, 1, 9)
]

export const OFFICE_FLOOR_REGION = { x: 480, y: 320, width: 928, height: 608 }

export const FURNITURE_FOOTPRINTS: Record<number, TileFootprint> = {
  0: { columns: 4, rows: 6 }, 1: { columns: 4, rows: 8 }, 2: { columns: 8, rows: 4 },
  5: { columns: 10, rows: 2 }, 6: { columns: 16, rows: 6 }, 7: { columns: 3, rows: 2 }, 10: { columns: 12, rows: 6 },
  12: { columns: 4, rows: 4 }, 13: { columns: 4, rows: 4 }, 14: { columns: 4, rows: 4 },
  15: { columns: 2, rows: 4 }, 16: { columns: 4, rows: 2 }, 17: { columns: 8, rows: 4 },
  18: { columns: 2, rows: 2 }, 19: { columns: 4, rows: 8 }
}

export function rotatedFootprint(frame: number, angle: number): TileFootprint {
  const source = FURNITURE_FOOTPRINTS[frame] ?? { columns: 2, rows: 2 }
  return Math.abs(Math.round(angle / 90)) % 2 === 1
    ? { columns: source.rows, rows: source.columns }
    : source
}

export function snapFurniturePoint(point: WorldPoint, footprint: TileFootprint): WorldPoint {
  const snapAxis = (value: number, size: number): number => {
    const offset = size % 2 === 1 ? NAV_TILE_SIZE / 2 : 0
    return Math.round((value - offset) / NAV_TILE_SIZE) * NAV_TILE_SIZE + offset
  }
  return { x: snapAxis(point.x, footprint.columns), y: snapAxis(point.y, footprint.rows) }
}

export function furnitureCollision(point: WorldPoint, footprint: TileFootprint): CollisionRect {
  const width = footprint.columns * NAV_TILE_SIZE
  const height = footprint.rows * NAV_TILE_SIZE
  return { x: point.x - width / 2, y: point.y - height / 2, width, height }
}
