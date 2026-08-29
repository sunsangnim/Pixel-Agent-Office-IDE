import type { OfficePresence } from '@shared/types'

export const OFFICE_WORLD_WIDTH = 960
export const OFFICE_WORLD_HEIGHT = 640

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
  [{ x: 112, y: 308 }],
  [{ x: 336, y: 308 }],
  [{ x: 576, y: 308 }, { x: 864, y: 548 }]
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
  pantryDoor: { x: 270, y: 220 },
  pantryTarget: { x: 130, y: 125 },
  meetingDoor: { x: 475, y: 220 },
  representativeDoor: { x: 735, y: 445 }
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
    y: actorIndex % 2 === 0 ? 155 : 150
  }
  if (actor.presence === 'meetingDoor') return WAYPOINTS.meetingDoor
  if (actor.presence === 'meeting') return MEETING_SEATS[actorIndex % MEETING_SEATS.length]
  return resolveDesk(actor)
}

// resolveDesk lets the caller (OfficeScene) supply the *live* chair position
// so a character walks to and sits at wherever the interior editor currently
// has that seat, instead of the static default TEAM_DESKS layout.
export function routeFor(
  actor: OfficeGameActor,
  actorIndex: number,
  resolveDesk: (actor: OfficeGameActor) => WorldPoint = deskPoint
): WorldPoint[] {
  const target = targetPoint(actor, actorIndex, resolveDesk)
  if (!target) return []
  if (actor.presence === 'arriving') return [WAYPOINTS.elevatorInside, WAYPOINTS.elevatorExit, resolveDesk(actor)]
  if (actor.presence === 'pantry') return [WAYPOINTS.pantryDoor, target]
  if (actor.presence === 'meeting') return [WAYPOINTS.meetingDoor, target]
  return [target]
}
