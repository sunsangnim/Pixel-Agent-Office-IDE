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

export const TEAM_DESKS: WorldPoint[][] = [0, 1, 2].map((team) => {
  const centerX = 130 + team * 245
  return [
    { x: centerX, y: 310 },
    { x: centerX - 55, y: 440 },
    { x: centerX + 55, y: 440 },
    { x: centerX - 55, y: 560 },
    { x: centerX + 55, y: 560 }
  ]
})

export const MEETING_SEATS: WorldPoint[] = [
  { x: 360, y: 92 }, { x: 430, y: 92 }, { x: 500, y: 92 }, { x: 570, y: 92 },
  { x: 360, y: 166 }, { x: 430, y: 166 }, { x: 500, y: 166 }, { x: 570, y: 166 }
]

export const WAYPOINTS = {
  elevatorInside: { x: 820, y: 115 },
  elevatorExit: { x: 820, y: 225 },
  pantryDoor: { x: 270, y: 220 },
  pantryTarget: { x: 130, y: 125 },
  meetingDoor: { x: 475, y: 220 },
  representativeDoor: { x: 735, y: 445 }
} satisfies Record<string, WorldPoint>

export function deskPoint(actor: Pick<OfficeGameActor, 'teamIndex' | 'slotIndex'>): WorldPoint {
  return TEAM_DESKS[actor.teamIndex]?.[actor.slotIndex] ?? { x: 480, y: 360 }
}

export function targetPoint(actor: OfficeGameActor, actorIndex: number): WorldPoint | null {
  if (actor.presence === 'offDuty') return null
  if (actor.presence === 'arriving') return WAYPOINTS.elevatorInside
  if (actor.presence === 'pantryDoor') return WAYPOINTS.pantryDoor
  if (actor.presence === 'pantry') return {
    x: actorIndex % 2 === 0 ? 220 : 65,
    y: actorIndex % 2 === 0 ? 155 : 150
  }
  if (actor.presence === 'meetingDoor') return WAYPOINTS.meetingDoor
  if (actor.presence === 'meeting') return MEETING_SEATS[actorIndex % MEETING_SEATS.length]
  return deskPoint(actor)
}

export function routeFor(actor: OfficeGameActor, actorIndex: number): WorldPoint[] {
  const target = targetPoint(actor, actorIndex)
  if (!target) return []
  if (actor.presence === 'arriving') return [WAYPOINTS.elevatorInside, WAYPOINTS.elevatorExit, deskPoint(actor)]
  if (actor.presence === 'pantry') return [WAYPOINTS.pantryDoor, target]
  if (actor.presence === 'meeting') return [WAYPOINTS.meetingDoor, target]
  return [target]
}
