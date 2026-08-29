import type { WorldPoint } from './officeWorld'

export const OFFICE_LAYOUT_SAVE_KEY = 'pixel-office-layout-v1'
export interface SavedFurniture extends WorldPoint { frame?: number; width?: number; height?: number; rotation?: number; zOrder?: number }
export type OfficeLayoutSave = Record<string, SavedFurniture>

export function parseOfficeLayout(raw: string | null): OfficeLayoutSave {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, point]) => {
      if (!point || typeof point !== 'object') return false
      const candidate = point as Partial<WorldPoint>
      return Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
    })) as OfficeLayoutSave
  } catch {
    return {}
  }
}

// Exact pixel positions/rotations for the baked-in default arrangement (see
// TEAM_DESKS in officeWorld.ts for why it's 1/1/2 seats, not 5 per team).
// Only fills in ids the user's own save doesn't already have an opinion on -
// see the merge in OfficeScene.create().
export const DEFAULT_LAYOUT_SEED: OfficeLayoutSave = {
  'desk-0-0': { x: 112, y: 320, rotation: 0 },
  'chair-0-0': { x: 128, y: 352, rotation: 180 },
  'desk-1-0': { x: 336, y: 320, rotation: 0 },
  'chair-1-0': { x: 352, y: 352, rotation: 180 },
  'desk-2-0': { x: 576, y: 320, rotation: 0 },
  'chair-2-0': { x: 592, y: 352, rotation: 180 },
  'desk-2-1': { x: 864, y: 560, rotation: 0 },
  'chair-2-1': { x: 880, y: 592, rotation: 180 }
}

/** Default desk/chair pairs the user has deleted in the interior editor.
 *  createDesks() must skip these on every reload, or the deletion never sticks. */
export const OFFICE_REMOVED_DESKS_KEY = 'pixel-office-removed-desks-v1'

export function parseRemovedIds(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return new Set()
    return new Set(value.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    return new Set()
  }
}
