import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import { DEFAULT_TEAM_CAPACITY } from '../shared/orchestrationPolicy'

function getStorePath(): string {
  return join(app.getPath('userData'), 'team-capacity.json')
}

function readAll(): Record<string, number> {
  const path = getStorePath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === 'number' && Number.isInteger(value)
      )
    ) as Record<string, number>
  } catch {
    return {}
  }
}

function writeAll(capacities: Record<string, number>): void {
  const path = getStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(capacities, null, 2), 'utf-8')
}

export const teamCapacityStore = {
  getAll(): Record<string, number> {
    return readAll()
  },

  get(templateId: string): number {
    return readAll()[templateId] ?? DEFAULT_TEAM_CAPACITY
  },

  /** Merges reported desk counts in; returns whether anything actually changed
   *  (so the caller only broadcasts when there's something new to pick up). */
  merge(counts: Record<string, number>): boolean {
    const all = readAll()
    let changed = false
    for (const [templateId, count] of Object.entries(counts)) {
      const clamped = Math.max(0, Math.round(count))
      if (all[templateId] !== clamped) {
        all[templateId] = clamped
        changed = true
      }
    }
    if (changed) writeAll(all)
    return changed
  }
}
