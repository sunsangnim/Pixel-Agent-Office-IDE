import { describe, expect, it } from 'vitest'
import {
  CONFERENCE_TABLE_FRAME,
  CONFERENCE_TABLE_ID,
  REPRESENTATIVE_CHAIR_ID,
  REPRESENTATIVE_DESK_ID,
  migrateMeetingTable,
  migrateRepresentativeFurniture,
  parseOfficeLayout,
  parseRemovedIds,
  type OfficeLayoutSave
} from './layoutPersistence'

describe('parseOfficeLayout', () => {
  it('returns an empty layout for null, malformed JSON, arrays and non-objects', () => {
    expect(parseOfficeLayout(null)).toEqual({})
    expect(parseOfficeLayout('not json')).toEqual({})
    expect(parseOfficeLayout('[]')).toEqual({})
    expect(parseOfficeLayout('"a string"')).toEqual({})
    expect(parseOfficeLayout('42')).toEqual({})
  })

  it('keeps only entries with finite x/y and drops the rest', () => {
    const raw = JSON.stringify({
      good: { x: 10, y: 20, frame: 1 },
      missingY: { x: 10 },
      notAnObject: 'nope',
      nullEntry: null,
      nonFinite: { x: Infinity, y: 5 }
    })
    expect(parseOfficeLayout(raw)).toEqual({ good: { x: 10, y: 20, frame: 1 } })
  })
})

describe('parseRemovedIds', () => {
  it('returns an empty set for null, malformed JSON, and non-arrays', () => {
    expect(parseRemovedIds(null)).toEqual(new Set())
    expect(parseRemovedIds('not json')).toEqual(new Set())
    expect(parseRemovedIds('{}')).toEqual(new Set())
  })

  it('keeps only string entries', () => {
    expect(parseRemovedIds(JSON.stringify(['desk-0-0', 42, null, 'chair-1-0']))).toEqual(
      new Set(['desk-0-0', 'chair-1-0'])
    )
  })
})

describe('migrateMeetingTable', () => {
  const intactLayout: OfficeLayoutSave = {
    [CONFERENCE_TABLE_ID]: { x: 480, y: 200, frame: 6, width: 256, height: 96, rotation: 0 },
    'custom-1787984530441-9': { x: 480, y: 184, frame: 6, width: 256, height: 96, rotation: 0 },
    'custom-1787984545290-10': { x: 480, y: 152, frame: 6, width: 256, height: 96, rotation: 0 },
    'custom-1787984553858-11': { x: 480, y: 168, frame: 6, width: 256, height: 96, rotation: 0 }
  }

  it('replaces the intact four-piece table with the single conference table frame', () => {
    const result = migrateMeetingTable(intactLayout, new Set())
    expect(result.changed).toBe(true)
    expect(Object.keys(result.layout)).toEqual([CONFERENCE_TABLE_ID])
    expect(result.layout[CONFERENCE_TABLE_ID]).toMatchObject({
      x: 480, y: 176, frame: CONFERENCE_TABLE_FRAME, width: 256, height: 144
    })
  })

  it('leaves the layout alone when the anchor piece is missing', () => {
    const { [CONFERENCE_TABLE_ID]: _anchor, ...withoutAnchor } = intactLayout
    const result = migrateMeetingTable(withoutAnchor, new Set())
    expect(result.changed).toBe(false)
    expect(result.layout).toEqual(withoutAnchor)
  })

  it('leaves the layout alone when a part was already deleted', () => {
    const result = migrateMeetingTable(intactLayout, new Set(['custom-1787984530441-9']))
    expect(result.changed).toBe(false)
  })

  it('leaves the layout alone when a part was moved off its expected offset', () => {
    const moved: OfficeLayoutSave = {
      ...intactLayout,
      'custom-1787984530441-9': { ...intactLayout['custom-1787984530441-9'], y: 999 }
    }
    const result = migrateMeetingTable(moved, new Set())
    expect(result.changed).toBe(false)
  })
})

describe('migrateRepresentativeFurniture', () => {
  it('renames desk-2-1/chair-2-1 into the representative desk/chair ids when inside the representative room', () => {
    const layout: OfficeLayoutSave = {
      'desk-2-1': { x: 800, y: 700, rotation: 0 },
      'chair-2-1': { x: 800, y: 750, rotation: 180 }
    }
    const result = migrateRepresentativeFurniture(layout, new Set(['desk-2-1']))
    expect(result.changed).toBe(true)
    expect(result.layout[REPRESENTATIVE_DESK_ID]).toEqual({ x: 800, y: 700, rotation: 0 })
    expect(result.layout[REPRESENTATIVE_CHAIR_ID]).toEqual({ x: 800, y: 750, rotation: 180 })
    expect(result.layout['desk-2-1']).toBeUndefined()
    expect(result.removedIds.has(REPRESENTATIVE_DESK_ID)).toBe(true)
    expect(result.removedIds.has('desk-2-1')).toBe(false)
  })

  it('does nothing when desk-2-1 is outside the representative room (a real staff desk, not the mislabeled one)', () => {
    const layout: OfficeLayoutSave = { 'desk-2-1': { x: 592, y: 480, rotation: 0 } }
    const result = migrateRepresentativeFurniture(layout, new Set())
    expect(result.changed).toBe(false)
    expect(result.layout).toEqual(layout)
  })

  it('is a no-op when there is nothing to migrate', () => {
    const layout: OfficeLayoutSave = { [REPRESENTATIVE_DESK_ID]: { x: 848, y: 832, rotation: 0 } }
    const result = migrateRepresentativeFurniture(layout, new Set())
    expect(result.changed).toBe(false)
    expect(result.layout).toEqual(layout)
  })
})
