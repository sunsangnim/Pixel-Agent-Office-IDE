export interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

interface CharacterSheetLayout {
  columns: number
  // Measured source-pixel bands. These illustrations are not uniform grids.
  rows: ReadonlyArray<readonly [number, number]>
}

export const CHARACTER_SHEET_LAYOUTS = {
  'claude-team-animation-atlas': { columns: 5, rows: [[5, 346], [346, 614], [609, 869], [869, 1108]] },
  'codex-team-animation-atlas': { columns: 5, rows: [[32, 373], [375, 679], [682, 958], [959, 1236]] },
  'antigravity-team-animation-atlas': { columns: 5, rows: [[10, 314], [315, 587], [588, 838], [840, 1103]] },
  'ceo-animation-sheet': { columns: 8, rows: [[16, 169], [178, 332], [333, 484], [486, 632], [634, 807], [810, 961]] }
} as const satisfies Record<string, CharacterSheetLayout>

export type CharacterSheetKey = keyof typeof CHARACTER_SHEET_LAYOUTS

// The display size is 104 × 120: this canvas keeps the source aspect ratio
// and gives every pose the same size and a shared, padded ground line.
export const CHARACTER_FRAME_WIDTH = 312
export const CHARACTER_FRAME_HEIGHT = 360
export const CHARACTER_FRAME_PADDING = 6

export function characterFrameRegion(key: CharacterSheetKey, imageWidth: number, column: number, row: number): {
  rect: FrameRect
  exclusions: FrameRect[]
} {
  const layout = CHARACTER_SHEET_LAYOUTS[key]
  let [top, bottom]: [number, number] = [...layout.rows[row]]
  const left = Math.floor(column * imageWidth / layout.columns)
  const right = Math.floor((column + 1) * imageWidth / layout.columns)
  const exclusions: FrameRect[] = []
  if (key === 'claude-team-animation-atlas') {
    // The walking feet and the following back-facing heads are staggered.
    if (row === 1) bottom = [610, 611, 612, 614, 614][column]
    if (row === 2) top = [611, 609, 613, 614, 616][column]
    // Column 1's two poses share two scanlines, but occupy different x ranges.
    if (column === 1 && row === 1) exclusions.push({ x: 414, y: 609, width: right - 414, height: 2 })
    if (column === 1 && row === 2) exclusions.push({ x: left, y: 609, width: 414 - left, height: 2 })
  }
  return { rect: { x: left, y: top, width: right - left, height: bottom - top }, exclusions }
}

function contains(rect: FrameRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}

export function measureCharacterFrame(
  pixels: ArrayLike<number>, imageWidth: number, region: ReturnType<typeof characterFrameRegion>
): { source: FrameRect; destination: FrameRect } {
  const { rect, exclusions } = region
  let left = rect.x + rect.width
  let top = rect.y + rect.height
  let right = rect.x - 1
  let bottom = rect.y - 1
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (pixels[(y * imageWidth + x) * 4 + 3] <= 127 || exclusions.some((excluded) => contains(excluded, x, y))) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) throw new Error('Character frame has no visible pixels')

  // Include the antialiased edge while staying within this pose's source band.
  left = Math.max(rect.x, left - 1)
  top = Math.max(rect.y, top - 1)
  right = Math.min(rect.x + rect.width - 1, right + 1)
  bottom = Math.min(rect.y + rect.height - 1, bottom + 1)
  const source = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
  const scale = Math.min(
    (CHARACTER_FRAME_WIDTH - CHARACTER_FRAME_PADDING * 2) / source.width,
    (CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING * 2) / source.height
  )
  const width = Math.round(source.width * scale)
  const height = Math.round(source.height * scale)
  return {
    source,
    destination: {
      x: Math.floor((CHARACTER_FRAME_WIDTH - width) / 2),
      y: CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING - height,
      width,
      height
    }
  }
}
