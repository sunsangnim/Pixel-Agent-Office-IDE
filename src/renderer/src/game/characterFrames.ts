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
  'ceo-animation-sheet': { columns: 4, rows: [[0, 330], [330, 635], [635, 938], [938, 1254]] },
  'ceo-seated-sheet': { columns: 2, rows: [[0, 627], [627, 1254]] }
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
  return { source, destination: fitCharacterFrame(source) }
}

function fitCharacterFrame(source: FrameRect, scale = Math.min(
    (CHARACTER_FRAME_WIDTH - CHARACTER_FRAME_PADDING * 2) / source.width,
    (CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING * 2) / source.height
  )): FrameRect {
  const width = Math.round(source.width * scale)
  const height = Math.round(source.height * scale)
  return {
    x: Math.floor((CHARACTER_FRAME_WIDTH - width) / 2),
    y: CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING - height,
    width,
    height
  }
}

export function measureCharacterSheet(pixels: ArrayLike<number>, imageWidth: number, key: CharacterSheetKey) {
  const layout = CHARACTER_SHEET_LAYOUTS[key]
  const frames = layout.rows.flatMap((_, row) => Array.from({ length: layout.columns }, (_, column) => {
    const region = characterFrameRegion(key, imageWidth, column, row)
    return { row, column, exclusions: region.exclusions, ...measureCharacterFrame(pixels, imageWidth, region) }
  }))
  if (key === 'ceo-animation-sheet' || key === 'ceo-seated-sheet') {
    const locomotion = frames.filter(({ row }) => row < 4)
    const scale = Math.min(...locomotion.flatMap(({ source }) => [
      (CHARACTER_FRAME_WIDTH - CHARACTER_FRAME_PADDING * 2) / source.width,
      (CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING * 2) / source.height
    ]))
    // Use one scale across idle and all walking directions. Fitting each pose
    // independently makes the head and torso pulse as the feet change position.
    for (const frame of locomotion) frame.destination = fitCharacterFrame(frame.source, scale)
  }
  return frames
}

// Employee sheets each contain one person: four phases in each facing row.
// Keep the PNG's alpha as authored; color-keying white also erases white shirts.
export function measureWalkSheet(pixels: ArrayLike<number>, imageWidth: number, imageHeight: number) {
  return measureGridSheet(pixels, imageWidth, imageHeight, 4, 4)
}

export function measureSeatedSheet(pixels: ArrayLike<number>, imageWidth: number, imageHeight: number) {
  return measureGridSheet(pixels, imageWidth, imageHeight, 5, 3, true)
}

// First two rows: six coffee poses. Last two rows: six cookie poses.
// One scale and ground line keep the actor planted as arms and faces change.
export function measurePantrySheet(pixels: ArrayLike<number>, imageWidth: number, imageHeight: number) {
  return measureGridSheet(pixels, imageWidth, imageHeight, 3, 4)
}

function measureGridSheet(pixels: ArrayLike<number>, imageWidth: number, imageHeight: number,
  columns: number, rows: number, personPerColumn = false) {
  // Generated sheets can shift rows by a few pixels. Split at the actual
  // transparent gutters so equal-height slicing cannot shave off shoes.
  const occupied = new Uint8Array(imageHeight)
  for (let y = 0; y < imageHeight; y += 1) {
    for (let x = 0; x < imageWidth; x += 1) {
      if (pixels[(y * imageWidth + x) * 4 + 3] > 127) { occupied[y] = 1; break }
    }
  }
  const boundaries = [0]
  for (let row = 1; row < rows; row += 1) {
    const nominal = row * imageHeight / rows
    const end = Math.ceil((row + 0.35) * imageHeight / rows)
    let best: number | undefined
    for (let y = Math.floor((row - 0.35) * imageHeight / rows); y < end; y += 1) {
      if (occupied[y]) continue
      const start = y
      while (y < end && !occupied[y]) y += 1
      if (y - start < 2) continue
      const middle = Math.floor((start + y) / 2)
      if (best === undefined || Math.abs(middle - nominal) < Math.abs(best - nominal)) best = middle
    }
    if (best === undefined) throw new Error(`Employee sheet has no gutter at row ${row}`)
    boundaries.push(best)
  }
  boundaries.push(imageHeight)
  const frames = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
    const x = Math.floor(column * imageWidth / columns)
    const y = boundaries[row]
    const region = {
      rect: { x, y, width: Math.floor((column + 1) * imageWidth / columns) - x,
        height: boundaries[row + 1] - y },
      exclusions: [] as FrameRect[]
    }
    return { row, column, region: region.rect, exclusions: region.exclusions, ...measureCharacterFrame(pixels, imageWidth, region) }
  })).flat()
  const groups = personPerColumn ? Array.from({ length: columns }, (_, column) => frames.filter((frame) => frame.column === column)) : [frames]
  for (const group of groups) {
    const scale = Math.min(...group.flatMap(({ source }) => [
      (CHARACTER_FRAME_WIDTH - CHARACTER_FRAME_PADDING * 2) / source.width,
      (CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING * 2) / source.height
    ]))
    for (const frame of group) frame.destination = fitCharacterFrame(frame.source, scale)
  }
  return frames
}
