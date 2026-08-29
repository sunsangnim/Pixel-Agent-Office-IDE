import type { OfficePresence } from '@shared/types'

export const OFFICE_WORLD_WIDTH = 960
// +320px of open floor added below the existing rooms (was 640) - the desk
// area was pinned right up against the bottom wall with no room to grow.
// The representative room and bottom outer wall shift down by the same
// amount (see officeGrid.ts) so the top-row rooms (탕비실/회의실/출입구)
// stay exactly where they were.
export const OFFICE_WORLD_HEIGHT = 960

export interface WorldPoint {
  x: number
  y: number
}

export interface OfficeGameActor {
  profileId: string
  instanceId: string | null
  displayName: string
  color: string
  rosterIndex: number
  slotIndex: number
  teamIndex: number
  presence: OfficePresence
}

export interface OfficeWorldSnapshot {
  now: number
  meetingActive: boolean
  elevatorOpen: boolean
  actors: OfficeGameActor[]
}

// The office no longer boots into a fixed 5-desks-per-team grid - this is
// the hand-arranged layout that's actually in use (1 seat each for Claude
// and Codex, 2 for Antigravity), baked in as the default so a fresh install
// or a cleared interior save starts here instead of with 15 desks nobody
// asked for. Exact desk/chair pixel positions and chair rotation live in
// DEFAULT_LAYOUT_SEED (layoutPersistence.ts); these points are only the
// desk-creation fallback and the pre-seating deskPoint() fallback.
export const TEAM_DESKS: WorldPoint[][] = [
  [{ x: 112, y: 468 }],
  [{ x: 320, y: 468 }],
  [{ x: 560, y: 468 }, { x: 864, y: 852 }]
]

/** Team columns have no drawn boundary, so desk-count reporting infers which
 *  team a desk belongs to from its x position, split at the midpoints between
 *  the three TEAM_DESKS column centers (130, 375, 590). */
export function teamIndexForX(x: number): number {
  if (x < 252.5) return 0
  if (x < 482.5) return 1
  return 2
}

export const MEETING_SEATS: WorldPoint[] = [
  { x: 360, y: 92 }, { x: 430, y: 92 }, { x: 500, y: 92 }, { x: 570, y: 92 },
  { x: 360, y: 166 }, { x: 430, y: 166 }, { x: 500, y: 166 }, { x: 570, y: 166 }
]

export const WAYPOINTS = {
  // Recessed into the top wall band (see OfficeScene.createEntrance) instead
  // of floating mid-room, so arriving reads as "step out of the elevator".
  elevatorInside: { x: 820, y: 80 },
  elevatorExit: { x: 820, y: 130 },
  // The pantry's doorway gap (officeGrid.ts OFFICE_WALL_COLLISIONS) runs
  // x:224-272 - this used to sit at x:270, just 2px off the column-17 wall's
  // edge at x:272. An actor's collision box is +/-14px wide, so standing
  // "at" that waypoint already overlapped the wall by 12px, which is why a
  // character walking to/through the pantry door read as stuck on it.
  // Re-centered in the gap (248) with margin on both sides.
  pantryDoor: { x: 248, y: 364 },
  pantryTarget: { x: 130, y: 125 },
  meetingDoor: { x: 475, y: 364 },
  representativeDoor: { x: 735, y: 685 }
} satisfies Record<string, WorldPoint>

export function deskPoint(actor: Pick<OfficeGameActor, 'teamIndex' | 'slotIndex'>): WorldPoint {
  return TEAM_DESKS[actor.teamIndex]?.[actor.slotIndex] ?? { x: 480, y: 360 }
}

export function targetPoint(
  actor: OfficeGameActor,
  actorIndex: number,
  resolveDesk: (actor: OfficeGameActor) => WorldPoint = deskPoint
): WorldPoint | null {
  if (actor.presence === 'offDuty') return null
  if (actor.presence === 'arriving') return WAYPOINTS.elevatorInside
  if (actor.presence === 'pantryDoor') return WAYPOINTS.pantryDoor
  if (actor.presence === 'pantry') return {
    x: actorIndex % 2 === 0 ? 220 : 65,
    y: actorIndex % 2 === 0 ? 175 : 150
  }
  if (actor.presence === 'meetingDoor') return WAYPOINTS.meetingDoor
  if (actor.presence === 'meeting') return MEETING_SEATS[actorIndex % MEETING_SEATS.length]
  return resolveDesk(actor)
}

// A room only has one doorway each (see officeGrid.ts) - roughly its own
// interior, used only to decide whether a route needs to detour through
// that doorway before heading anywhere else.
const PANTRY_BOUNDS = { x0: 16, x1: 272, y0: 16, y1: 352 }
const MEETING_BOUNDS = { x0: 288, x1: 656, y0: 16, y1: 352 }

function isInside(point: WorldPoint, bounds: { x0: number; x1: number; y0: number; y1: number }): boolean {
  return point.x >= bounds.x0 && point.x <= bounds.x1 && point.y >= bounds.y0 && point.y <= bounds.y1
}

// resolveDesk lets the caller (OfficeScene) supply the *live* chair position
// so a character walks to and sits at wherever the interior editor currently
// has that seat, instead of the static default TEAM_DESKS layout.
export function routeFor(
  actor: OfficeGameActor,
  actorIndex: number,
  currentPosition: WorldPoint,
  resolveDesk: (actor: OfficeGameActor) => WorldPoint = deskPoint
): WorldPoint[] {
  const target = targetPoint(actor, actorIndex, resolveDesk)
  if (!target) return []
  if (actor.presence === 'arriving') return [WAYPOINTS.elevatorInside, WAYPOINTS.elevatorExit, resolveDesk(actor)]
  if (actor.presence === 'pantry') return [WAYPOINTS.pantryDoor, target]
  if (actor.presence === 'meeting') return [WAYPOINTS.meetingDoor, target]
  // Presence itself only says where the actor is headed next, not where it
  // currently is - without this, leaving the pantry/meeting room for
  // anywhere else (back to desk, etc.) beelined straight at the new target
  // and tried to walk through the wall instead of funneling back out
  // through that room's one doorway first.
  if (isInside(currentPosition, PANTRY_BOUNDS)) return [WAYPOINTS.pantryDoor, target]
  if (isInside(currentPosition, MEETING_BOUNDS)) return [WAYPOINTS.meetingDoor, target]
  return [target]
}
