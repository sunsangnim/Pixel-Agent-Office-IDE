import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import { DEFAULT_TEAM_CAPACITY, MAX_TEAM_CAPACITY, MIN_TEAM_CAPACITY } from '../shared/orchestrationPolicy'

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

  /** `activeCount` is the number of currently running sessions for this team —
   *  capacity can never drop below what's already occupying desks. */
  set(templateId: string, capacity: number, activeCount: number): Record<string, number> {
    const clamped = Math.round(capacity)
    if (!Number.isFinite(clamped) || clamped < MIN_TEAM_CAPACITY || clamped > MAX_TEAM_CAPACITY) {
      throw new Error(`영역 할당은 ${MIN_TEAM_CAPACITY}~${MAX_TEAM_CAPACITY} 사이여야 합니다.`)
    }
    if (clamped < activeCount) {
      throw new Error(`현재 ${activeCount}개 세션이 실행 중입니다. 먼저 세션을 정리한 뒤 줄여주세요.`)
    }
    const all = readAll()
    all[templateId] = clamped
    writeAll(all)
    return all
  }
}
