import type { WorldPoint } from './officeWorld'

export const OFFICE_LAYOUT_SAVE_KEY = 'pixel-office-layout-v1'
export interface SavedFurniture extends WorldPoint { frame?: number; width?: number; height?: number; rotation?: number }
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
