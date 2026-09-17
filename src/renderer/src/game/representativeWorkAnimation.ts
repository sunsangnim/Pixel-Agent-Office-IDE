import type { SeatFacing } from './seatAnchors'

export const REPRESENTATIVE_WORK_TEXTURE = 'ceo-seated-work-frames'
export const REPRESENTATIVE_WORK_POSES = 5

// Atlas pixels (the 312 x 360 frame is displayed at 104 x 120). Only the
// wrists and lower sleeves flex; the head, spine and seat contact stay fixed.
interface HandRegion { x: number; y: number; rx: number; ry: number }
const HANDS: Record<SeatFacing, readonly [HandRegion, HandRegion]> = {
  front: [{ x: 112, y: 252, rx: 37, ry: 31 }, { x: 198, y: 252, rx: 37, ry: 31 }],
  back: [{ x: 94, y: 246, rx: 25, ry: 34 }, { x: 216, y: 246, rx: 25, ry: 34 }],
  left: [{ x: 101, y: 250, rx: 22, ry: 24 }, { x: 132, y: 254, rx: 39, ry: 32 }],
  right: [{ x: 205, y: 255, rx: 39, ry: 32 }, { x: 233, y: 252, rx: 22, ry: 24 }]
}
const HAND_LIFTS = [[0, 0], [9, 2], [4, 1], [2, 9], [1, 4]] as const
const TAPS = [0, 1, 2, 0, 3, 4, 0, 1, 2, 3, 4, 0, 3, 4, 1, 2] as const
const TAP_MS = 90
export const REPRESENTATIVE_WORK_CYCLE_MS = TAPS.length * TAP_MS + 540

export function representativeWorkPoseAt(elapsedMs: number): number {
  const time = Math.max(0, elapsedMs) % REPRESENTATIVE_WORK_CYCLE_MS
  return TAPS[Math.floor(time / TAP_MS)] ?? 0
}

// Bake the small, local arm deformation once when the scene loads. Sampling
// the original frame for every pose avoids cumulative distortion and keeps
// the pixel-art palette intact. The smooth falloff leaves no cutout seams.
export function representativeWorkPixels(source: Uint8ClampedArray, width: number, height: number,
  facing: SeatFacing, pose: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source)
  const lifts = HAND_LIFTS[pose]
  if (!lifts || pose === 0) return output
  const hands = HANDS[facing]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let lift = 0
      for (let hand = 0; hand < hands.length; hand += 1) {
        const region = hands[hand]
        const distance = ((x - region.x) / region.rx) ** 2 + ((y - region.y) / region.ry) ** 2
        if (distance >= 1) continue
        const weight = (1 - distance) ** 2
        lift = Math.max(lift, weight * lifts[hand])
      }
      const sourceY = Math.min(height - 1, y + Math.round(lift))
      if (sourceY === y) continue
      const from = (sourceY * width + x) * 4
      output.set(source.subarray(from, from + 4), (y * width + x) * 4)
    }
  }
  return output
}
