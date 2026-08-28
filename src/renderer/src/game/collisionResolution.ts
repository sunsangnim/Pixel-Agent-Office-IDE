import type { WorldPoint } from './officeWorld'

export interface CollisionRect { x: number; y: number; width: number; height: number }
export interface ActorBody { id: string; x: number; y: number; radius: number }

export function intersectsAabb(a: CollisionRect, b: CollisionRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function actorRect(point: WorldPoint, halfWidth: number, halfHeight: number): CollisionRect {
  return { x: point.x - halfWidth, y: point.y - halfHeight, width: halfWidth * 2, height: halfHeight * 2 }
}

export function resolveAxisSeparated(
  current: WorldPoint,
  desired: WorldPoint,
  obstacles: CollisionRect[],
  halfWidth = 9,
  halfHeight = 6
): WorldPoint & { blockedX: boolean; blockedY: boolean } {
  let x = desired.x
  let y = current.y
  let blockedX = obstacles.some((obstacle) => intersectsAabb(actorRect({ x, y }, halfWidth, halfHeight), obstacle))
  if (blockedX) x = current.x
  y = desired.y
  let blockedY = obstacles.some((obstacle) => intersectsAabb(actorRect({ x, y }, halfWidth, halfHeight), obstacle))
  if (blockedY) y = current.y
  return { x, y, blockedX, blockedY }
}

export function pushApart(a: ActorBody, b: ActorBody): [WorldPoint, WorldPoint] {
  let dx = b.x - a.x
  let dy = b.y - a.y
  let distance = Math.hypot(dx, dy)
  const minimum = a.radius + b.radius
  if (distance >= minimum) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]
  if (distance === 0) {
    dx = a.id.localeCompare(b.id) <= 0 ? 1 : -1
    dy = 0
    distance = 1
  }
  const push = (minimum - distance) / 2
  const nx = dx / distance
  const ny = dy / distance
  return [
    { x: a.x - nx * push, y: a.y - ny * push },
    { x: b.x + nx * push, y: b.y + ny * push }
  ]
}

