import { CHARACTER_FRAME_WIDTH, CHARACTER_FRAME_HEIGHT, type FrameRect } from './characterFrames'
import type { WorldPoint } from './officeWorld'

export type SeatFacing = 'front' | 'back' | 'left' | 'right'

// Cushion contact points in the ORIGINAL chair images. Keep the artwork and
// its 1.33 display scale intact; placement follows the cushion in each facing.
export const CHAIR_SEAT_ANCHORS: Record<SeatFacing, WorldPoint> = {
  front: { x: 495 / 991, y: 860 / 1613 },
  back: { x: 243 / 485, y: 385 / 715 },
  left: { x: 283 / 474, y: 376 / 716 },
  right: { x: 184 / 463, y: 374 / 712 }
}

// Underside of the pelvis / upper thigh, measured in the source illustrations.
// Feet, hair and transparent padding are deliberately not seat anchors.
const STAFF_CONTACTS = [
  [
    [[160, 291], [447, 291], [754, 290], [1058, 291], [1370, 291]],
    [[160, 643], [447, 641], [754, 640], [1058, 643], [1370, 641]],
    [[191, 963], [473, 963], [787, 963], [1087, 963], [1395, 963]]
  ],
  [
    [[126, 351], [365, 351], [607, 352], [852, 351], [1110, 352]],
    [[126, 766], [365, 765], [607, 765], [852, 764], [1110, 765]],
    [[164, 1158], [402, 1158], [650, 1156], [893, 1158], [1148, 1158]]
  ],
  [
    [[181, 283], [481, 283], [770, 284], [1057, 283], [1342, 284]],
    [[181, 634], [481, 634], [770, 633], [1057, 634], [1342, 634]],
    [[211, 956], [510, 956], [800, 957], [1093, 956], [1381, 957]]
  ]
]
const CEO_CONTACTS = [[[326, 504], [965, 510]], [[326, 1095], [894, 1095]]]

export function seatedFrameAnchor(sourceKey: string, column: number, row: number,
  source: FrameRect, destination: FrameRect): WorldPoint {
  const team = /^staff-seated-(\d)$/.exec(sourceKey)
  const [x, y] = team ? STAFF_CONTACTS[Number(team[1])][row][column] : CEO_CONTACTS[row][column]
  return {
    x: destination.x + (x - source.x) / source.width * destination.width,
    y: destination.y + (y - source.y) / source.height * destination.height
  }
}

export function seatedSpriteFoot(chair: { x: number; y: number; displayWidth: number; displayHeight: number },
  facing: SeatFacing, anchor: WorldPoint, sprite: { displayWidth: number; displayHeight: number; flipX: boolean }): WorldPoint {
  const seat = CHAIR_SEAT_ANCHORS[facing]
  const hipX = sprite.flipX ? 1 - anchor.x / CHARACTER_FRAME_WIDTH : anchor.x / CHARACTER_FRAME_WIDTH
  return {
    x: chair.x + (seat.x - 0.5) * chair.displayWidth + (0.5 - hipX) * sprite.displayWidth,
    y: chair.y + (seat.y - 0.5) * chair.displayHeight + (1 - anchor.y / CHARACTER_FRAME_HEIGHT) * sprite.displayHeight
  }
}
