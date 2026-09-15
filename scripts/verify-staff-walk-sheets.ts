import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { STAFF_WALK_SHEETS } from '../src/renderer/src/game/staffWalkSheets'
import { CHARACTER_FRAME_HEIGHT, CHARACTER_FRAME_PADDING, measureWalkSheet } from '../src/renderer/src/game/characterFrames'

export function verifyStaffWalkSheets(): void {
  for (const { id, file } of STAFF_WALK_SHEETS) {
    const png = PNG.sync.read(fs.readFileSync(path.join(process.cwd(),
      'src/renderer/src/assets/pixel-office/characters/walk-v6', file)))
    const frames = measureWalkSheet(png.data, png.width, png.height)
    assert.equal(frames.length, 16, `${id}: idle and three facing rows`)
    assert.equal(png.data[3], 0, `${id}: transparent background`)
    const scales = frames.map(({ source, destination }) => destination.height / source.height)
    assert.ok(Math.max(...scales) - Math.min(...scales) < 0.01, `${id}: consistent body scale`)
    for (const { row, column, region, source, destination } of frames) {
      const label = `${id} row ${row} phase ${column}`
      assert.equal(destination.y + destination.height, CHARACTER_FRAME_HEIGHT - CHARACTER_FRAME_PADDING, `${label}: feet on baseline`)
      assert.ok(source.width > 40 && source.height > 100, `${label}: complete sprite`)
      assert.ok(source.y > region.y, `${label}: head not cut at row boundary`)
      assert.ok(source.y + source.height < region.y + region.height, `${label}: shoes not cut at row boundary`)
      // The torso is inside the silhouette for all front/back/side poses.
      // This catches the white-shirt holes that the old Antigravity idle
      // frame exposed every time its two-picture walking loop returned to it.
      for (let y = Math.ceil(source.y + source.height * 0.56); y < source.y + source.height * 0.70; y += 1) {
        for (let x = Math.ceil(source.x + source.width * 0.45); x < source.x + source.width * 0.55; x += 1) {
          assert.ok(png.data[(y * png.width + x) * 4 + 3] >= 250, `${label}: clothing must be opaque at ${x},${y}`)
        }
      }
    }
    const leadingHand = (column: number): number => {
      const { source } = frames.find((frame) => frame.row === 1 && frame.column === column)!
      const hands = [{ sum: 0, count: 0 }, { sum: 0, count: 0 }]
      for (let y = Math.floor(source.y + source.height * 0.53); y < source.y + source.height * 0.80; y += 1) {
        for (let x = source.x; x < source.x + source.width; x += 1) {
          const index = (y * png.width + x) * 4
          const [r, g, b, a] = png.data.subarray(index, index + 4)
          if (a < 250 || r < 210 || g < 105 || g > 220 || b < 50 || b > 185 || r - g < 30 || g - b < 30) continue
          const hand = hands[x < source.x + source.width / 2 ? 0 : 1]
          hand.sum += y
          hand.count += 1
        }
      }
      assert.ok(hands.every((hand) => hand.count > 20), `${id}: both hands visible in contact ${column}`)
      return (hands[0].sum / hands[0].count - hands[1].sum / hands[1].count) / source.height
    }
    assert.ok(leadingHand(0) < -0.015, `${id}: first step must lead with viewer-left hand`)
    assert.ok(leadingHand(2) > 0.015, `${id}: opposite step must lead with viewer-right hand`)
  }
  console.log('PASS all 15 employee sheets: 240 complete poses, opaque clothes, and alternating hands')
}
