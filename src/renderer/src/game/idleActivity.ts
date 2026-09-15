import type { OfficePresence } from '@shared/types'

export class IdleActivity {
  private phase: 'desk' | 'outbound' | 'resting' | 'returning' = 'desk'
  private nextVisitAt: number | null = null
  private deadline = 0

  constructor(private readonly random: () => number = Math.random) {}

  get visitingPantry(): boolean {
    return this.phase === 'outbound' || this.phase === 'resting'
  }

  get awayFromDesk(): boolean {
    return this.phase !== 'desk'
  }

  update(requested: OfficePresence, now: number, settledPresence: OfficePresence | null, pantryAvailable: boolean): OfficePresence {
    if (requested !== 'deskIdle') {
      this.reset()
      return requested
    }
    if (this.phase === 'returning' && settledPresence === 'deskIdle') this.reset()
    if (this.phase === 'desk') {
      if (settledPresence !== 'deskIdle') return 'deskIdle'
      this.nextVisitAt ??= now + 60_000 + this.random() * 120_000
      if (now < this.nextVisitAt || !pantryAvailable) return 'deskIdle'
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
    this.nextVisitAt = null
  }

  private reset(): void {
    this.phase = 'desk'
    this.nextVisitAt = null
    this.deadline = 0
  }
}
