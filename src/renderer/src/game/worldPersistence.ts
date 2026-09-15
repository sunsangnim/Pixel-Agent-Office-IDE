import type { OfficePresence } from '@shared/types'
import type { WorldPoint } from './officeWorld'

export const OFFICE_WORLD_SAVE_KEY = 'pixel-office:phaser-world-v1'
export const OFFICE_REPRESENTATIVE_SAVE_KEY = 'pixel-office:representative-position-v1'

export function parseRepresentativePosition(raw: string | null): WorldPoint | null {
  try {
    const point = JSON.parse(raw ?? 'null') as WorldPoint | null
    return point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? { x: point.x, y: point.y } : null
  } catch {
    return null
  }
}

export interface SavedActorState {
  profileId: string
  x: number
  y: number
  presence: OfficePresence
  updatedAt: number
}

export interface OfficeWorldSave {
  version: 1
  actors: SavedActorState[]
}

export function parseOfficeWorldSave(raw: string | null): OfficeWorldSave {
  if (!raw) return { version: 1, actors: [] }
  try {
    const value = JSON.parse(raw) as Partial<OfficeWorldSave>
    if (value.version !== 1 || !Array.isArray(value.actors)) return { version: 1, actors: [] }
    const actors = value.actors.filter((actor): actor is SavedActorState =>
      Boolean(actor) && typeof actor.profileId === 'string' && Number.isFinite(actor.x) && Number.isFinite(actor.y)
    )
    return { version: 1, actors }
  } catch {
    return { version: 1, actors: [] }
  }
}

export function upsertSavedActor(save: OfficeWorldSave, actor: SavedActorState): OfficeWorldSave {
  return { version: 1, actors: [...save.actors.filter((candidate) => candidate.profileId !== actor.profileId), actor] }
}
