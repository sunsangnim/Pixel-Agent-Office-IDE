// Team and variant are explicit: roster indexes change when desk counts change.
export const STAFF_WALK_SHEETS = Array.from({ length: 3 }, (_, team) =>
  Array.from({ length: 5 }, (_, variant) => ({
    id: `${team}-${variant}`,
    file: `staff-${team}-${variant}-walk-v6.png`
  }))
).flat()

export const WALK_ROW_NAMES = ['idle', 'walk-down', 'walk-up', 'walk-left'] as const
