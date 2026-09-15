export type CharacterFacing = 'down' | 'up' | 'left' | 'right'

export interface CharacterPose {
  frame: string
  flipX: boolean
}

// v3: right arm forward -> passing -> left arm forward -> passing.
// Each contact pose pairs the leading arm with the opposite leading leg.
const WALK_COLUMNS = [0, 1, 2, 3] as const
const DISTANCE_PER_POSE = 16
const DIAGONAL_TOLERANCE = 1.25

export class CharacterGait {
  private facing: CharacterFacing = 'down'
  private distance = 0
  private moving = false

  constructor(private readonly prefix: string) {}

  advance(dx: number, dy: number): CharacterPose {
    const distance = Math.hypot(dx, dy)
    if (distance < 0.01) return this.stop()
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    // Retain the current axis near a diagonal so tiny rounding differences
    // cannot alternate between the side and front/back sheets every tick.
    const wasHorizontal = this.facing === 'left' || this.facing === 'right'
    const horizontal = wasHorizontal
      ? ax * DIAGONAL_TOLERANCE >= ay
      : ax > ay * DIAGONAL_TOLERANCE
    this.facing = horizontal ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')
    this.distance = (this.distance + distance) % (DISTANCE_PER_POSE * WALK_COLUMNS.length)
    this.moving = true
    return this.pose()
  }

  stop(): CharacterPose {
    this.moving = false
    this.distance = 0
    return this.pose()
  }

  private pose(): CharacterPose {
    const row = this.facing === 'right' ? 'left' : this.facing
    const column = this.moving
      ? WALK_COLUMNS[Math.floor((this.distance + 1e-6) / DISTANCE_PER_POSE) % WALK_COLUMNS.length] : 1
    return {
      frame: !this.moving && this.facing === 'down' ? `${this.prefix}-idle-0` : `${this.prefix}-walk-${row}-${column}`,
      flipX: this.facing === 'right'
    }
  }
}
