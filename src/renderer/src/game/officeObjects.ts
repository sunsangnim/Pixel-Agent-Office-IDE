import { MEETING_SEATS, TEAM_DESKS, WAYPOINTS, type WorldPoint } from './officeWorld'

export type OfficeObjectType = 'door' | 'chair' | 'desk' | 'coffee' | 'snack' | 'sofa' | 'bookcase'

export interface OfficeObjectDefinition {
  id: string
  type: OfficeObjectType
  position: WorldPoint
  approachPoint: WorldPoint
  snapPoint?: WorldPoint
  facing?: 'up' | 'down' | 'left' | 'right'
  frontDepthOffset?: number
}

export const OFFICE_OBJECTS: OfficeObjectDefinition[] = [
  { id: 'elevator-door', type: 'door', position: { x: 820, y: 94 }, approachPoint: WAYPOINTS.elevatorExit, facing: 'up' },
  { id: 'pantry-door', type: 'door', position: { x: 270, y: 200 }, approachPoint: WAYPOINTS.pantryDoor, facing: 'up' },
  { id: 'meeting-door', type: 'door', position: { x: 475, y: 200 }, approachPoint: WAYPOINTS.meetingDoor, facing: 'up' },
  { id: 'coffee-machine', type: 'coffee', position: { x: 65, y: 100 }, approachPoint: { x: 65, y: 150 }, facing: 'up' },
  { id: 'snack-counter', type: 'snack', position: { x: 220, y: 105 }, approachPoint: { x: 220, y: 155 }, facing: 'up' },
  { id: 'representative-sofa', type: 'sofa', position: { x: 895, y: 455 }, approachPoint: { x: 895, y: 495 }, snapPoint: { x: 895, y: 458 }, facing: 'down', frontDepthOffset: 8 },
  { id: 'representative-bookcase', type: 'bookcase', position: { x: 912, y: 568 }, approachPoint: { x: 865, y: 568 }, facing: 'right' },
  ...TEAM_DESKS.flatMap((team, teamIndex) => team.flatMap((point, slotIndex) => [
    { id: `desk-${teamIndex}-${slotIndex}`, type: 'desk' as const, position: point, approachPoint: { x: point.x, y: point.y + 48 }, facing: 'up' as const },
    { id: `chair-${teamIndex}-${slotIndex}`, type: 'chair' as const, position: { x: point.x, y: point.y + 35 }, approachPoint: { x: point.x, y: point.y + 55 }, snapPoint: point, facing: 'up' as const, frontDepthOffset: 12 }
  ])),
  ...MEETING_SEATS.map((point, index) => ({
    id: `meeting-chair-${index}`,
    type: 'chair' as const,
    position: point,
    approachPoint: { x: point.x, y: point.y + (index < 4 ? -22 : 22) },
    snapPoint: point,
    facing: (index < 4 ? 'down' : 'up') as 'down' | 'up',
    frontDepthOffset: index < 4 ? -4 : 8
  }))
]

export function objectById(id: string): OfficeObjectDefinition | undefined {
  return OFFICE_OBJECTS.find((object) => object.id === id)
}
