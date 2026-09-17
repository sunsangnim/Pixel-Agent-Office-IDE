import type { WorldPoint } from './officeWorld'

// Use the same room geometry for walls, labels, entrances and seat ownership.
export const REPRESENTATIVE_ROOM = {
  left: 704, top: 640, right: 944, bottom: 944, wall: 16, doorLeft: 800, doorRight: 864
} as const
export const REPRESENTATIVE_ROOM_BOUNDS = {
  x0: REPRESENTATIVE_ROOM.left + REPRESENTATIVE_ROOM.wall, x1: REPRESENTATIVE_ROOM.right,
  y0: REPRESENTATIVE_ROOM.top + REPRESENTATIVE_ROOM.wall, y1: REPRESENTATIVE_ROOM.bottom
}
export const MEETING_ROOM_BOUNDS = { x0: 304, x1: 656, y0: 16, y1: 352 }

export function isInRoom(point: WorldPoint, bounds: { x0: number; x1: number; y0: number; y1: number }): boolean {
  return point.x >= bounds.x0 && point.x < bounds.x1 && point.y >= bounds.y0 && point.y < bounds.y1
}

export const isInRepresentativeRoom = (point: WorldPoint): boolean => isInRoom(point, REPRESENTATIVE_ROOM_BOUNDS)
export const isInMeetingRoom = (point: WorldPoint): boolean => isInRoom(point, MEETING_ROOM_BOUNDS)
export const isInStaffArea = (point: WorldPoint): boolean => point.y >= 368 && !isInRepresentativeRoom(point)
