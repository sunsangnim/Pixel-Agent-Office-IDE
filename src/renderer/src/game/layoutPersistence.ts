import type { WorldPoint } from './officeWorld'
import { isInRepresentativeRoom } from './officeRooms'

export const OFFICE_LAYOUT_SAVE_KEY = 'pixel-office-layout-v1'
// The chair at the left end of the meeting table, in front of the laptop.
// Its identity remains reserved when the user moves or rotates the furniture.
export const REPRESENTATIVE_MEETING_CHAIR_ID = 'custom-1787984571110-14'
export const REPRESENTATIVE_DESK_ID = 'representative-desk'
export const REPRESENTATIVE_CHAIR_ID = 'representative-chair'
export interface SavedFurniture extends WorldPoint { frame?: number; width?: number; height?: number; rotation?: number; zOrder?: number }
export type OfficeLayoutSave = Record<string, SavedFurniture>

export const CONFERENCE_TABLE_FRAME = 20
export const CONFERENCE_TABLE_ID = 'custom-1787984477840-5'
const LEGACY_MEETING_TABLE_PARTS = [
  [CONFERENCE_TABLE_ID, 0],
  ['custom-1787984530441-9', -16],
  ['custom-1787984545290-10', -48],
  ['custom-1787984553858-11', -32]
] as const

/** Replace only the intact four-piece table, including a translated group.
 * Independently edited, rotated or deleted pieces retain their saved layout. */
export function migrateMeetingTable(layout: OfficeLayoutSave, removedIds: ReadonlySet<string>) {
  const anchor = layout[CONFERENCE_TABLE_ID]
  if (!anchor || !LEGACY_MEETING_TABLE_PARTS.every(([id, offsetY]) => {
    const part = layout[id]
    return part && !removedIds.has(id) && part.frame === 6 &&
      (part.rotation ?? 0) === 0 && (part.width ?? 256) === 256 && (part.height ?? 96) === 96 &&
      part.x === anchor.x && part.y === anchor.y + offsetY
  })) return { layout, changed: false }
  const migrated = { ...layout }
  for (const [id] of LEGACY_MEETING_TABLE_PARTS) delete migrated[id]
  migrated[CONFERENCE_TABLE_ID] = {
    ...anchor, y: anchor.y - 24, frame: CONFERENCE_TABLE_FRAME, width: 256, height: 144
  }
  return { layout: migrated, changed: true }
}

// The shipped representative desk was accidentally labelled as Antigravity's
// first child. Rename its saved identity without moving or recreating furniture.
export function migrateRepresentativeFurniture(layout: OfficeLayoutSave, removedIds: Set<string>) {
  const migrated = { ...layout }
  const removed = new Set(removedIds)
  const legacy = layout['desk-2-1'] ?? layout['chair-2-1']
  let changed = false
  if (!legacy || isInRepresentativeRoom(legacy)) {
    for (const [oldId, newId] of [['desk-2-1', REPRESENTATIVE_DESK_ID], ['chair-2-1', REPRESENTATIVE_CHAIR_ID]]) {
      if (migrated[oldId]) {
        migrated[newId] ??= migrated[oldId]
        delete migrated[oldId]
        changed = true
      }
      if (removed.delete(oldId)) { removed.add(newId); changed = true }
    }
  }
  return { layout: migrated, removedIds: removed, changed }
}

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

// The approved interior: two desks per team, the representative's desk,
// meeting furniture and decorations, including their positions and stacking.
// The second row keeps its custom furniture ids to avoid duplicates in existing
// saves. User edits override these defaults in OfficeScene.create().
export const DEFAULT_LAYOUT_SEED: OfficeLayoutSave = {
  'desk-0-0': { x: 112, y: 480, rotation: 0, zOrder: 510 },
  'chair-0-0': { x: 112, y: 528, rotation: 180, zOrder: 667 },
  'desk-1-0': { x: 352, y: 480, rotation: 0, zOrder: 525 },
  'chair-1-0': { x: 352, y: 528, rotation: 180, zOrder: 719 },
  'desk-2-0': { x: 592, y: 480, rotation: 0, zOrder: 512 },
  'chair-2-0': { x: 592, y: 528, rotation: 180, zOrder: 661 },
  [REPRESENTATIVE_DESK_ID]: { x: 848, y: 832, rotation: 0, zOrder: 500 },
  [REPRESENTATIVE_CHAIR_ID]: { x: 848, y: 880, rotation: 180, zOrder: 659 },
  'custom-1787984430465-1': { x: 48, y: 64, rotation: 0, zOrder: 71, frame: 0, width: 64, height: 96 },
  'custom-1787984435417-2': { x: 144, y: 96, rotation: 0, zOrder: 66, frame: 2, width: 128, height: 64 },
  'custom-1787984442155-3': { x: 240, y: 80, rotation: 0, zOrder: 64, frame: 1, width: 64, height: 128 },
  'custom-1787984453381-4': { x: 48, y: 112, rotation: 0, zOrder: 70, frame: 16, width: 64, height: 32 },
  [CONFERENCE_TABLE_ID]: { x: 480, y: 200, rotation: 0, zOrder: 648, frame: CONFERENCE_TABLE_FRAME, width: 256, height: 144 },
  'custom-1787984480720-6': { x: 464, y: 48, rotation: 0, zOrder: 631, frame: 5, width: 160, height: 32 },
  'custom-1787984492714-7': { x: 448, y: 160, rotation: 0, zOrder: 653, frame: 12, width: 85.12, height: 85.12 },
  'custom-1787984505669-8': { x: 528, y: 160, rotation: 0, zOrder: 655, frame: 12, width: 85.12, height: 85.12 },
  'custom-1787984561211-12': { x: 528, y: 240, rotation: 180, zOrder: 651, frame: 12, width: 85.12, height: 85.12 },
  'custom-1787984561774-13': { x: 448, y: 240, rotation: 180, zOrder: 650, frame: 12, width: 85.12, height: 85.12 },
  'custom-1787984571110-14': { x: 368, y: 208, rotation: 90, zOrder: 646, frame: 12, width: 85.12, height: 85.12 },
  'custom-1787984596608-15': { x: 400, y: 184, rotation: 90, zOrder: 649, frame: 7, width: 32, height: 48 },
  'custom-1787984610230-16': { x: 624, y: 80, rotation: 0, zOrder: 151, frame: 19, width: 64, height: 128 },
  'custom-1787984616887-17': { x: 928, y: 80, rotation: 0, zOrder: 157, frame: 15, width: 32, height: 64 },
  'custom-1787984617343-18': { x: 704, y: 80, rotation: 0, zOrder: 156, frame: 15, width: 32, height: 64 },
  'custom-1787984639656-20': { x: 736, y: 928, rotation: 0, zOrder: 163, frame: 18, width: 32, height: 32 },
  'custom-1787984684806-22': { x: 912, y: 672, rotation: 0, zOrder: 182, frame: 16, width: 64, height: 32 },
  'custom-1787984739228-26': { x: 32, y: 912, rotation: 0, zOrder: 199, frame: 15, width: 32, height: 64 },
  'custom-1787984739417-27': { x: 688, y: 912, rotation: 0, zOrder: 198, frame: 15, width: 32, height: 64 },
  'custom-1789658180194-1': { x: 112, y: 688, rotation: 0, zOrder: 672, frame: 10, width: 192, height: 96 },
  'custom-1789658185211-2': { x: 112, y: 736, rotation: 180, zOrder: 723, frame: 12, width: 85.12, height: 85.12 },
  'custom-1789658199461-3': { x: 592, y: 688, rotation: 0, zOrder: 691, frame: 10, width: 192, height: 96 },
  'custom-1789658199645-4': { x: 352, y: 688, rotation: 0, zOrder: 715, frame: 10, width: 192, height: 96 },
  'custom-1789658212417-5': { x: 352, y: 736, rotation: 180, zOrder: 721, frame: 12, width: 85.12, height: 85.12 },
  'custom-1789658217848-6': { x: 592, y: 736, rotation: 180, zOrder: 725, frame: 12, width: 85.12, height: 85.12 }
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
