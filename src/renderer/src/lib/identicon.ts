function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash >>> 0
}

/**
 * Deterministic 5x5 symmetric grid ("identicon") from a seed string, so
 * every agent instance gets a visually distinct profile that never
 * collides with another instance, even when they share a template color.
 */
export function identiconCells(seed: string): boolean[] {
  const hash = hashString(seed)
  const cols = 5
  const rows = 5
  const halfCols = Math.ceil(cols / 2)
  const cells: boolean[] = new Array(rows * cols).fill(false)
  let bitIndex = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < halfCols; c++) {
      const filled = ((hash >> bitIndex % 30) & 1) === 1
      bitIndex++
      cells[r * cols + c] = filled
      cells[r * cols + (cols - 1 - c)] = filled
    }
  }
  return cells
}
