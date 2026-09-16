// Team and variant are explicit: roster indexes change when desk counts change.
export const STAFF_WALK_SHEETS = Array.from({ length: 3 }, (_, team) =>
  Array.from({ length: 5 }, (_, variant) => ({
    id: `${team}-${variant}`,
    file: `staff-${team}-${variant}-walk-v6.png`
  }))
).flat()

export const WALK_ROW_NAMES = ['idle', 'walk-down', 'walk-up', 'walk-left'] as const

export const STAFF_PANTRY_SHEETS = STAFF_WALK_SHEETS.map(({ id }) => ({
  id, file: `staff-${id}-pantry-v1.png`
}))

export const STAFF_SEATED_SHEETS = [0, 1, 2].map((team) => ({ team, file: `staff-${team}-seated-v1.png` }))
export const SEATED_ROW_NAMES = ['front', 'back', 'left'] as const
