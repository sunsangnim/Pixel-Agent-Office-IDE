import type { SeatFacing } from './seatAnchors'

export const REPRESENTATIVE_WORK_TEXTURE = 'ceo-seated-work-frames'
export const REPRESENTATIVE_WORK_POSES = 5

// Atlas pixels (the 312 x 360 frame is displayed at 104 x 120). Only the
// wrists and lower sleeves flex; the head, spine and seat contact stay fixed.
interface HandRegion { x: number; y: number; rx: number; ry: number }
const HANDS: Record<SeatFacing, readonly [HandRegion, HandRegion]> = {
  front: [{ x: 112, y: 197, rx: 36, ry: 26 }, { x: 197, y: 197, rx: 36, ry: 26 }],
  back: [{ x: 74, y: 169, rx: 27, ry: 24 }, { x: 233, y: 169, rx: 27, ry: 24 }],
  left: [{ x: 66, y: 181, rx: 28, ry: 17 }, { x: 85, y: 199, rx: 35, ry: 20 }],
  right: [{ x: 232, y: 194, rx: 35, ry: 20 }, { x: 250, y: 177, rx: 28, ry: 17 }]
}
const HAND_LIFTS = [[0, 0], [9, 2], [4, 1], [2, 9], [1, 4]] as const
const TAPS = [0, 1, 2, 0, 3, 4, 0, 1, 2, 3, 4, 0, 3, 4, 1, 2] as const
const TAP_MS = 90
export const REPRESENTATIVE_WORK_CYCLE_MS = TAPS.length * TAP_MS + 540

function inHead(x: number, y: number, facing: SeatFacing): boolean {
  if (facing === 'front') return y < 174
  if (facing === 'back') return y < 146 || (y < 174 && x > 97 && x < 217)
  if (facing === 'left') return y < 164 || (y < 185 && x > 98)
  return y < 158 || (y < 180 && x < 224)
}

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
      // Raised wrists sit beside the chin/hair. Keep those head pixels fixed
      // even where a hand's deformation radius overlaps the face silhouette.
      if (inHead(x, y, facing)) continue
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
