import type { CollisionRect } from './collisionResolution'

/** Visible texture bounds in normalized coordinates, excluding transparent padding. */
export function measureFurnitureBounds(pixels: ArrayLike<number>, width: number, height: number): CollisionRect {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 16) continue
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }
  if (right < left) return { x: 0, y: 0, width: 1, height: 1 }
  return { x: left / width, y: top / height, width: (right - left + 1) / width, height: (bottom - top + 1) / height }
}
