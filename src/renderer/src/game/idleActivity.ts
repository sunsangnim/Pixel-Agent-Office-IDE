import type { OfficePresence } from '@shared/types'

export const PANTRY_VISIT_INTERVAL_MS = 5 * 60_000

/** One office-wide clock; each lead gets one randomly chosen turn per round. */
export class PantrySchedule {
  private nextVisitAt = PANTRY_VISIT_INTERVAL_MS
  private visited = new Set<string>()
  private lastVisitor: string | null = null

  constructor(private readonly random: () => number = Math.random) {}

  takeTurn(now: number, participants: readonly { id: string; available: boolean }[], occupied: boolean): string | null {
    if (occupied || now < this.nextVisitAt || participants.length === 0) return null
    if (participants.every(({ id }) => this.visited.has(id))) this.visited.clear()
    const candidates = participants.filter(({ id, available }) => available && !this.visited.has(id) &&
      (participants.length === 1 || id !== this.lastVisitor)).map(({ id }) => id).sort()
    if (candidates.length === 0) return null
    const selected = candidates[Math.floor(this.random() * candidates.length)]
    this.visited.add(selected)
    this.lastVisitor = selected
    this.nextVisitAt = now + PANTRY_VISIT_INTERVAL_MS
    return selected
  }
}

export class IdleActivity {
  private phase: 'desk' | 'outbound' | 'resting' | 'returning' = 'desk'
  private deadline = 0

  constructor(private readonly random: () => number = Math.random) {}

  get visitingPantry(): boolean {
    return this.phase === 'outbound' || this.phase === 'resting'
  }

  get awayFromDesk(): boolean {
    return this.phase !== 'desk'
  }

  update(requested: OfficePresence, now: number, settledPresence: OfficePresence | null, visitAllowed = false): OfficePresence {
    if (requested !== 'deskIdle') {
      this.reset()
      return requested
    }
    if (this.phase === 'returning' && settledPresence === 'deskIdle') {
      this.reset()
      return 'deskIdle'
    }
    if (this.phase === 'desk') {
      if (settledPresence !== 'deskIdle' || !visitAllowed) return 'deskIdle'
      this.phase = 'outbound'
      this.deadline = now + 45_000
    }
    if (this.phase === 'outbound') {
      if (settledPresence === 'pantry') {
        this.phase = 'resting'
        this.deadline = now + 8_000 + this.random() * 7_000
      } else if (now >= this.deadline) {
        this.phase = 'returning'
      }
    } else if (this.phase === 'resting' && now >= this.deadline) {
      this.phase = 'returning'
    }
    return this.visitingPantry ? 'pantry' : 'deskIdle'
  }

  cancelVisit(): void {
    this.phase = 'returning'
  }

  private reset(): void {
    this.phase = 'desk'
    this.deadline = 0
  }
}
