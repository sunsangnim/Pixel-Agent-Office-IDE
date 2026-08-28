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
