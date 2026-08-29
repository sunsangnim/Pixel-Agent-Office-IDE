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

// Exact pixel positions/rotations/zOrder for the baked-in default arrangement
// - the hand-arranged office as it stands, desks and every decorative custom
// piece included (see TEAM_DESKS in officeWorld.ts for why it's 1/1/2 desk
// seats, not 5 per team). Only fills in ids the user's own save doesn't
// already have an opinion on - see the merge in OfficeScene.create().
export const DEFAULT_LAYOUT_SEED: OfficeLayoutSave = {
  'desk-0-0': { x: 112, y: 480, rotation: 0, zOrder: 38 },
  'chair-0-0': { x: 128, y: 512, rotation: 180, zOrder: 44 },
  'desk-1-0': { x: 320, y: 480, rotation: 0, zOrder: 41 },
  'chair-1-0': { x: 336, y: 512, rotation: 180, zOrder: 45 },
  'desk-2-0': { x: 560, y: 480, rotation: 0, zOrder: 49 },
  'chair-2-0': { x: 576, y: 512, rotation: 180, zOrder: 50 },
  'desk-2-1': { x: 864, y: 864, rotation: 0, zOrder: 54 },
  'chair-2-1': { x: 880, y: 896, rotation: 180, zOrder: 55 },
  'custom-1787984430465-1': { x: 48, y: 64, rotation: 0, zOrder: 71, frame: 0, width: 64, height: 96 },
  'custom-1787984435417-2': { x: 144, y: 96, rotation: 0, zOrder: 66, frame: 2, width: 128, height: 64 },
  'custom-1787984442155-3': { x: 240, y: 80, rotation: 0, zOrder: 64, frame: 1, width: 64, height: 128 },
  'custom-1787984453381-4': { x: 48, y: 112, rotation: 0, zOrder: 70, frame: 16, width: 64, height: 32 },
  'custom-1787984477840-5': { x: 480, y: 128, rotation: 0, zOrder: 136, frame: 6, width: 256, height: 96 },
  'custom-1787984480720-6': { x: 464, y: 48, rotation: 0, zOrder: 78, frame: 5, width: 160, height: 32 },
  'custom-1787984492714-7': { x: 432, y: 112, rotation: 0, zOrder: 93, frame: 12, width: 64, height: 64 },
  'custom-1787984505669-8': { x: 528, y: 112, rotation: 0, zOrder: 92, frame: 12, width: 64, height: 64 },
  'custom-1787984530441-9': { x: 480, y: 144, rotation: 0, zOrder: 139, frame: 6, width: 256, height: 96 },
  'custom-1787984545290-10': { x: 480, y: 160, rotation: 0, zOrder: 141, frame: 6, width: 256, height: 96 },
  'custom-1787984553858-11': { x: 480, y: 176, rotation: 0, zOrder: 142, frame: 6, width: 256, height: 96 },
  'custom-1787984561211-12': { x: 528, y: 192, rotation: 180, zOrder: 144, frame: 12, width: 64, height: 64 },
  'custom-1787984561774-13': { x: 432, y: 192, rotation: 180, zOrder: 143, frame: 12, width: 64, height: 64 },
  'custom-1787984571110-14': { x: 368, y: 160, rotation: 90, zOrder: 119, frame: 12, width: 64, height: 64 },
  'custom-1787984596608-15': { x: 400, y: 136, rotation: 90, zOrder: 148, frame: 7, width: 32, height: 48 },
  'custom-1787984610230-16': { x: 624, y: 80, rotation: 0, zOrder: 151, frame: 19, width: 64, height: 128 },
  'custom-1787984616887-17': { x: 928, y: 80, rotation: 0, zOrder: 157, frame: 15, width: 32, height: 64 },
  'custom-1787984617343-18': { x: 704, y: 80, rotation: 0, zOrder: 156, frame: 15, width: 32, height: 64 },
  'custom-1787984639656-20': { x: 736, y: 928, rotation: 0, zOrder: 163, frame: 18, width: 32, height: 32 },
  'custom-1787984684806-22': { x: 912, y: 672, rotation: 0, zOrder: 182, frame: 16, width: 64, height: 32 },
  'custom-1787984739228-26': { x: 32, y: 912, rotation: 0, zOrder: 199, frame: 15, width: 32, height: 64 },
  'custom-1787984739417-27': { x: 688, y: 912, rotation: 0, zOrder: 198, frame: 15, width: 32, height: 64 }
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
