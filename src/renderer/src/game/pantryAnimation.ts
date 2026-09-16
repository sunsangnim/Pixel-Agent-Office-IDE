export type PantryAction = 'drinking' | 'eating'

export interface PantryAnimation {
  action: PantryAction
  elapsedMs: number
  pose: number
}

// Both the representative and employees use the same six-pose rhythm.
export const PANTRY_POSE_DURATIONS: Record<PantryAction, readonly number[]> = {
  drinking: [550, 240, 850, 600, 950, 1100],
  eating: [550, 240, 650, 750, 750, 1100]
}

export function pantryPoseAt(action: PantryAction, elapsedMs: number): number | null {
  const durations = PANTRY_POSE_DURATIONS[action]
  for (let pose = 0; pose < durations.length; pose += 1) {
    if (elapsedMs < durations[pose]) return pose
    elapsedMs -= durations[pose]
  }
  return null
}
