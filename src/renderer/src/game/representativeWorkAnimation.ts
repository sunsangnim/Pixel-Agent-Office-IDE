import type { SeatFacing } from './seatAnchors'
import { CHARACTER_FRAME_WIDTH } from './characterFrames'

export const REPRESENTATIVE_WORK_TEXTURE = 'ceo-seated-work-frames'
export const REPRESENTATIVE_WORK_POSES = 5
export const REPRESENTATIVE_WORK_FRAME_WIDTH = 384
export const REPRESENTATIVE_WORK_FRAME_PADDING = (REPRESENTATIVE_WORK_FRAME_WIDTH - CHARACTER_FRAME_WIDTH) / 2

// Atlas pixels (the 312 x 360 frame is displayed at 104 x 120). The forward
// reach is authored in ceo-desk-work-v3; never stretch or cut the upper arms.
export interface HandRegion { x: number; y: number; rx: number; ry: number }
const HANDS: Record<SeatFacing, readonly [HandRegion, HandRegion]> = {
  front: [{ x: 96, y: 213, rx: 33, ry: 24 }, { x: 213, y: 213, rx: 33, ry: 24 }],
  back: [{ x: 67, y: 134, rx: 24, ry: 20 }, { x: 248, y: 134, rx: 24, ry: 20 }],
  left: [{ x: 17, y: 186, rx: 27, ry: 16 }, { x: 31, y: 205, rx: 31, ry: 18 }],
  right: [{ x: 298, y: 194, rx: 31, ry: 18 }, { x: 317, y: 177, rx: 24, ry: 16 }]
}
const HAND_LIFTS = [[0, 0], [6, 1], [3, 0], [1, 6], [0, 3]] as const
const TAPS = [0, 1, 2, 0, 3, 4, 0, 1, 2, 3, 4, 0, 3, 4, 1, 2] as const
const TAP_MS = 90
export const REPRESENTATIVE_WORK_CYCLE_MS = TAPS.length * TAP_MS + 540

function inHead(head: Uint8ClampedArray, width: number, x: number, y: number): boolean {
  if (y >= 174) return false
  // Include translucent hair edges and the small registration difference
  // between authored poses. Raised wrists must never drag the head outline.
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const sx = x + dx - (width - CHARACTER_FRAME_WIDTH) / 2
      const sy = y + dy
      if (sx >= 0 && sx < CHARACTER_FRAME_WIDTH && sy >= 0 && sy < 174 &&
        head[(sy * CHARACTER_FRAME_WIDTH + sx) * 4 + 3] > 0) return true
    }
  }
  return false
}

export function representativeWorkPoseAt(elapsedMs: number): number {
  const time = Math.max(0, elapsedMs) % REPRESENTATIVE_WORK_CYCLE_MS
  return TAPS[Math.floor(time / TAP_MS)] ?? 0
}

// Flex fingers and cuffs inside the complete authored silhouette. Preserve
// every alpha value and edge pixel: no transparent holes, copied hair, or
// disconnected sleeve/shoulder seams can appear during the typing cycle.
export function representativeWorkPixels(source: Uint8ClampedArray, width: number, height: number,
  facing: SeatFacing, pose: number, head: Uint8ClampedArray): Uint8ClampedArray {
  return workHandPixels(source, width, height, HANDS[facing], pose, head)
}

export function workHandPixels(source: Uint8ClampedArray, width: number, height: number,
  hands: readonly HandRegion[], pose: number, head: Uint8ClampedArray): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source)
  const lifts = HAND_LIFTS[pose]
  if (!lifts || pose === 0) return output
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4
      if (source[target + 3] < 240 || inHead(head, width, x, y)) continue
      let lift = 0
      for (let hand = 0; hand < hands.length; hand += 1) {
        const region = hands[hand]
        const distance = ((x - REPRESENTATIVE_WORK_FRAME_PADDING - region.x) / region.rx) ** 2 + ((y - region.y) / region.ry) ** 2
        if (distance >= 1) continue
        lift = Math.max(lift, (1 - distance) ** 2 * lifts[hand])
      }
      const sourceY = Math.min(height - 1, y + Math.round(lift))
      if (sourceY === y || inHead(head, width, x, sourceY)) continue
      const from = (sourceY * width + x) * 4
      if (source[from + 3] < 240) continue
      output.set(source.subarray(from, from + 3), target)
    }
  }
  return output
}
