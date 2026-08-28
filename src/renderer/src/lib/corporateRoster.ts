export const CORPORATE_ROSTER_SIZE = 20
export const CORPORATE_ROSTER_COLUMNS = 5
export const CORPORATE_ROSTER_ROWS = 4
export const CORPORATE_ROSTER_COLUMN_POSITIONS = ['0%', '25%', '50%', '75%', '100%'] as const

export function getCorporateRosterCell(rosterIndex: number): {
  index: number
  row: number
  column: number
  position: string
} {
  const index = Math.max(0, Math.min(CORPORATE_ROSTER_SIZE - 1, Math.trunc(rosterIndex)))
  const row = Math.floor(index / CORPORATE_ROSTER_COLUMNS)
  const column = index % CORPORATE_ROSTER_COLUMNS
  return { index, row, column, position: CORPORATE_ROSTER_COLUMN_POSITIONS[column] }
}
