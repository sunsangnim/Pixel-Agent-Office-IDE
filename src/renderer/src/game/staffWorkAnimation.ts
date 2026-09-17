import { measureSeatedSheet, type FrameRect } from './characterFrames'
import { REPRESENTATIVE_WORK_FRAME_PADDING, type HandRegion } from './representativeWorkAnimation'

export const staffWorkTexture = (team: number): string => `staff-work-${team}-frames`

// Wrist centers in the authored 5-column sheets: front, back, then left.
// Calibrate each identity rather than moving its shoulder or stretching an arm.
const WRISTS = [
  [
    [[105, 227], [212, 227]], [[394, 227], [502, 227]], [[700, 231], [807, 231]], [[999, 228], [1120, 228]], [[1318, 227], [1424, 227]],
    [[76, 500], [245, 500]], [[367, 500], [532, 500]], [[668, 500], [839, 500]], [[973, 500], [1147, 500]], [[1274, 493], [1475, 493]],
    [[49, 857], [65, 873]], [[342, 857], [357, 873]], [[647, 857], [662, 873]], [[948, 857], [965, 873]], [[1243, 857], [1258, 873]]
  ],
  [
    [[76, 274], [185, 274]], [[312, 274], [420, 274]], [[567, 274], [656, 274]], [[813, 274], [920, 274]], [[1061, 274], [1156, 274]],
    [[43, 616], [214, 616]], [[280, 616], [454, 616]], [[515, 616], [710, 616]], [[778, 616], [952, 616]], [[1010, 616], [1204, 616]],
    [[33, 1055], [52, 1074]], [[271, 1055], [291, 1074]], [[516, 1055], [536, 1074]], [[762, 1055], [782, 1074]], [[1006, 1055], [1026, 1074]]
  ],
  [
    [[132, 221], [233, 221]], [[425, 221], [533, 221]], [[718, 221], [813, 221]], [[998, 221], [1102, 221]], [[1300, 221], [1395, 221]],
    [[105, 487], [268, 487]], [[395, 487], [561, 487]], [[673, 487], [862, 487]], [[975, 487], [1134, 487]], [[1256, 487], [1438, 487]],
    [[82, 847], [97, 861]], [[373, 847], [389, 861]], [[655, 847], [670, 861]], [[949, 847], [963, 861]], [[1237, 847], [1252, 861]]
  ]
] as const

function lowerBodyBounds(pixels: ArrayLike<number>, width: number, region: FrameRect, top: number): FrameRect {
  let left = region.x + region.width, right = region.x, bottom = top
  for (let y = Math.ceil(top); y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 127) continue
      left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

export function measureStaffWorkSheet(original: ArrayLike<number>, work: ArrayLike<number>,
  width: number, height: number, team: number) {
  const frames = measureSeatedSheet(original, width, height)
  const workColumns = [0, 1, 2].map((row) => {
    const band = frames[row * 5].region
    const occupied = new Uint8Array(width)
    for (let x = 0; x < width; x++) for (let y = band.y; y < band.y + band.height; y++) {
      if (work[(y * width + x) * 4 + 3] > 127) { occupied[x] = 1; break }
    }
    const boundaries = [0]
    for (let column = 1; column < 5; column++) {
      const nominal = column * width / 5
      const end = Math.floor((column + 0.3) * width / 5)
      let best: number | undefined
      for (let x = Math.ceil((column - 0.3) * width / 5); x < end; x++) {
        if (occupied[x]) continue
        const start = x
        while (x < end && !occupied[x]) x++
        if (x - start < 2) continue
        const middle = Math.floor((start + x) / 2)
        if (best === undefined || Math.abs(middle - nominal) < Math.abs(best - nominal)) best = middle
      }
      if (best === undefined) throw new Error(`Staff work sheet ${team} has no column gutter at ${row}/${column}`)
      boundaries.push(best)
    }
    boundaries.push(width)
    return boundaries
  })
  return frames.map((frame, index) => {
    const { source, destination, region } = frame
    // Reaching fingertips can cross the old uniform column boundary. Split
    // at each row's actual transparent gaps so neither neighbor is clipped
    // or accidentally copied into this character's frame.
    const columns = workColumns[frame.row]
    const workRegion = { ...region, x: columns[frame.column], width: columns[frame.column + 1] - columns[frame.column] }
    const top = source.y + source.height * 0.72
    const seatedFeet = lowerBodyBounds(original, width, region, top)
    const workFeet = lowerBodyBounds(work, width, workRegion, top)
    const offsetX = seatedFeet.x + seatedFeet.width / 2 - workFeet.x - workFeet.width / 2
    const offsetY = seatedFeet.y + seatedFeet.height - workFeet.y - workFeet.height
    const sx = destination.width / source.width, sy = destination.height / source.height
    const hands: HandRegion[] = WRISTS[team][index].map(([x, y]) => ({
      x: destination.x + (x + offsetX - source.x) * sx,
      y: destination.y + (y + offsetY - source.y) * sy,
      rx: (frame.row === 0 ? 30 : 24) * sx,
      ry: (frame.row === 0 ? 20 : 17) * sy
    }))
    return { ...frame, region: workRegion, hands, workDestination: {
      x: REPRESENTATIVE_WORK_FRAME_PADDING + destination.x + (workRegion.x + offsetX - source.x) * sx,
      y: destination.y + (workRegion.y + offsetY - source.y) * sy,
      width: workRegion.width * sx, height: workRegion.height * sy
    } }
  })
}
