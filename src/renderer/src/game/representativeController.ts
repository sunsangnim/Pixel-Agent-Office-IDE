import type { OfficeScene } from './OfficeScene'
import Phaser from 'phaser'
import { ACTOR_COLLISION_HALF_HEIGHT, ACTOR_COLLISION_HALF_WIDTH, ACTOR_SPRITE_HEIGHT, ACTOR_SPRITE_WIDTH, ActorView, CEO_LABEL_GAP, CEO_SPRITE_ART_X_OFFSET, DESK_FURNITURE_FRAME, FurnitureView, SEAT_ACCESS_RADIUS, SPEECH_BUBBLE_HEIGHT, SPEECH_BUBBLE_WIDTH, TABLETOP_FURNITURE_FRAMES } from './OfficeScene'
import { CHARACTER_FRAME_WIDTH } from './characterFrames'
import { CharacterPose } from './characterGait'
import { CollisionRect, intersectsAabb, resolveAxisSeparated } from './collisionResolution'
import { OFFICE_REPRESENTATIVE_SAVE_KEY, parseRepresentativePosition } from './worldPersistence'
import { OFFICE_WALL_COLLISIONS } from './officeGrid'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, WorldPoint } from './officeWorld'
import { REPRESENTATIVE_CHAIR_ID, REPRESENTATIVE_MEETING_CHAIR_ID } from './layoutPersistence'
import { REPRESENTATIVE_WORK_FRAME_WIDTH, REPRESENTATIVE_WORK_TEXTURE, representativeWorkPoseAt } from './representativeWorkAnimation'
import { actorCollisionRect, findOfficePath, hasOfficeLineOfSight, isOfficePositionWalkable, nearestOfficePosition } from './navigation'
import { isInMeetingRoom, isInRepresentativeRoom } from './officeRooms'
import { pantryPoseAt } from './pantryAnimation'
import { seatedSpriteFoot } from './seatAnchors'

export function createRepresentativeActor(scene: OfficeScene): void {
  // Movement, collision, and click destinations all use the feet as the
  // anchor. The old centered sprite's feet were at (835, 871).
  const obstacles = [...scene.collisionRects(), ...scene.actorObstacles(undefined, false)]
  const saved = parseRepresentativePosition(localStorage.getItem(OFFICE_REPRESENTATIVE_SAVE_KEY))
  const initial = (saved && nearestOfficePosition(saved, obstacles))
    || nearestOfficePosition({ x: 832, y: 736 }, obstacles)
    || nearestOfficePosition({ x: 835, y: 871 }, obstacles)
    || { x: 832, y: 736 }
  scene.representativeSprite = scene.add.sprite(initial.x, initial.y, 'ceo-animation-sheet-frames', 'ceo-idle-0')
    .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT).setOrigin(0.5, 1)
  scene.representativeSeatedForeground = scene.add.sprite(0, 0, 'ceo-seated-sheet-frames', 'ceo-sit-front')
    .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT).setOrigin(0.5, 1).setVisible(false)
  // Real label text is set moments later by the first applySnapshot() call
  // once the representative's configured name has loaded from the main
  // process - this generic placeholder is only visible for a single frame.
  scene.representativeLabel = scene.addOfficeText(0, 0, '대표', {
    fontSize: '13px', color: '#111111', align: 'center'
  }).setOrigin(0.5, 1).setPadding(4, 4).setDepth(700)
  scene.representativeSpeechBubble = scene.add.image(0, 0, 'speech-bubble', 'panel')
    .setOrigin(0.5, 1).setDisplaySize(SPEECH_BUBBLE_WIDTH, SPEECH_BUBBLE_HEIGHT).setVisible(false)
  scene.representativeSpeech = scene.addOfficeText(0, 0, '', {
    fontSize: '12px', color: '#23443e', align: 'center'
  }).setOrigin(0.5, 0.5).setVisible(false)
  scene.representativeDestination = scene.add.circle(0, 0, 7, 0x74c9f5, 0.2)
    .setStrokeStyle(2, 0x74c9f5).setDepth(2).setVisible(false)
  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
    // Furniture editing and employee selection retain their own clicks.
    if (scene.layoutEditing || !pointer.leftButtonDown() || over.length > 0 ||
      pointer.event.shiftKey || pointer.event.ctrlKey || pointer.event.metaKey || pointer.event.altKey) return
    scene.moveRepresentativeTo({ x: pointer.worldX, y: pointer.worldY })
  })
  scene.updateRepresentativeDepth()
  scene.updateRepresentativeLabelPosition()
}
export function moveRepresentativeTo(scene: OfficeScene, point: WorldPoint): boolean {
  const sprite = scene.representativeSprite
  if (scene.layoutEditing || !sprite || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
  const collisions = scene.collisionRects()
  if (!isOfficePositionWalkable(point, collisions)) return false
  const departure = scene.representativeDeparturePoint()
  if (!departure) return false
  const route = findOfficePath(departure, point, collisions)
  if (route.length === 0 && Math.hypot(departure.x - point.x, departure.y - point.y) >= 0.5) return false
  if (!scene.standRepresentative()) return false
  scene.stopRepresentativePantryAction()
  scene.representativeChairTarget = null
  scene.representativeGoal = { ...point }
  scene.representativeStalledMs = 0
  scene.planRepresentativeRoute()
  scene.representativeDestination?.setPosition(point.x, point.y).setVisible(true)
  if (Math.hypot(sprite.x - point.x, sprite.y - point.y) < 0.5) scene.stopRepresentativeMovement()
  return true
}
/** Reserve a free chair, walk to its accessible edge, then sit on its seat. */
export function sitRepresentativeOn(scene: OfficeScene, chairId: string): boolean {
  if (scene.layoutEditing || !scene.representativeSprite) return false
  const chair = scene.furniture.get(chairId)
  if (!chair || ![12, 13, 14].includes(chair.frame)) return false
  if (scene.representativeSeat?.chairId === chairId) return true
  if (!scene.representativeChairAvailable(chair, true)) return false
  const departure = scene.representativeDeparturePoint()
  if (!departure || !scene.representativeChairApproach(chair, departure)) return false
  if (!scene.standRepresentative()) return false
  scene.stopRepresentativePantryAction()
  scene.representativeChairTarget = chairId
  scene.representativeStalledMs = 0
  scene.planRepresentativeRoute()
  return true
}
/** Approach the clicked furniture's live position before taking a break. */
export function interactRepresentativeWith(scene: OfficeScene, furnitureId: string): boolean {
  if (scene.layoutEditing || !scene.representativeSprite) return false
  const furniture = scene.furniture.get(furnitureId)
  if (!furniture || ![0, 1, 2].includes(furniture.frame)) return false
  if (scene.representativePantryTarget === furnitureId) return true
  const departure = scene.representativeDeparturePoint()
  if (!departure || !scene.representativePantryApproach(furniture, departure)) return false
  if (!scene.standRepresentative()) return false
  scene.stopRepresentativePantryAction()
  scene.representativeChairTarget = null
  scene.representativePantryTarget = furnitureId
  scene.representativeStalledMs = 0
  scene.showRepresentativeSpeech(furniture.frame === 0 ? '커피 마시러 가는 중' : '간식 먹으러 가는 중')
  scene.pantryHint?.setVisible(false)
  scene.planRepresentativeRoute()
  return true
}
export function showPantryHint(scene: OfficeScene, id: string, text: string): void {
  const furniture = scene.furniture.get(id)
  if (!furniture) return
  if (!scene.pantryHint) {
    scene.pantryHint = scene.addOfficeText(0, 0, '', {
      fontSize: '12px', color: '#ffffff', backgroundColor: '#23443e', align: 'center'
    }).setOrigin(0.5, 0).setPadding(8, 5).setDepth(OFFICE_WORLD_HEIGHT * 3)
  }
  const point = scene.pantryServicePoint(furniture)
  scene.pantryHint.setText(text).setPosition(Phaser.Math.Clamp(point.x, 110, OFFICE_WORLD_WIDTH - 110), point.y + 12)
    .setVisible(true)
}
export function pantryServicePoint(scene: OfficeScene, furniture: FurnitureView): WorldPoint {
  const bounds = scene.furnitureWalkCollision(furniture.image, 0)
  return { x: furniture.image.x, y: bounds.y + bounds.height }
}
export function pantryAccessCollisions(scene: OfficeScene, furniture: FurnitureView): CollisionRect[] {
  const excluded = new Set([furniture.id])
  const bounds = scene.furnitureWalkCollision(furniture.image, 0)
  // Reaching for a cup on a side table is allowed; the walking route still
  // respects both objects. No other furniture or walls are bypassed.
  for (const view of scene.furniture.values()) {
    if (furniture.frame === 0 && view.frame === 16 &&
      intersectsAabb(bounds, scene.furnitureWalkCollision(view.image, 0))) excluded.add(view.id)
  }
  return scene.collisionRects(excluded, 0)
}
export function representativeCanUsePantry(scene: OfficeScene, furniture: FurnitureView, from: WorldPoint): boolean {
  const point = scene.pantryServicePoint(furniture)
  return [0, 1, 2].includes(furniture.frame) && isOfficePositionWalkable(from, scene.collisionRects()) &&
    Math.hypot(from.x - point.x, from.y - point.y) <= 64 &&
    hasOfficeLineOfSight(from, point, scene.pantryAccessCollisions(furniture))
}
export function representativePantryApproach(scene: OfficeScene, furniture: FurnitureView, from: WorldPoint): WorldPoint | null {
  const actors = scene.actorObstacles(undefined, false)
  if (scene.representativeCanUsePantry(furniture, from) && isOfficePositionWalkable(from, actors)) return { x: from.x, y: from.y }
  const point = scene.pantryServicePoint(furniture)
  const collisions = scene.collisionRects()
  const access = scene.pantryAccessCollisions(furniture)
  // Prefer a free service position. If an employee temporarily blocks the
  // only approach, keep the static route and wait without crossing them.
  const route = findOfficePath(from, point, [...collisions, ...actors], { goalRadius: 64, goalCollisions: [...access, ...actors] })
  return route.at(-1) ?? findOfficePath(from, point, collisions, { goalRadius: 64, goalCollisions: access }).at(-1) ?? null
}
export function startRepresentativePantryAction(scene: OfficeScene): void {
  const sprite = scene.representativeSprite
  const furniture = scene.representativePantryTarget && scene.furniture.get(scene.representativePantryTarget)
  if (!sprite || !furniture || !scene.representativeCanUsePantry(furniture, sprite)) {
    scene.stopRepresentativePantryAction()
    return
  }
  const action = furniture.frame === 0 ? 'drinking' : 'eating'
  scene.representativePantryAction = { action, elapsedMs: 0, pose: 0 }
  scene.showRepresentativeSpeech(action === 'drinking' ? '커피 마시는 중' : '간식 먹는 중')
  scene.applyRepresentativePantryPose()
}
export function stopRepresentativePantryAction(scene: OfficeScene): void {
  if (scene.representativePantryAction) scene.applyRepresentativePose({ frame: 'ceo-idle-0', flipX: false })
  scene.representativePantryAction = undefined
  scene.representativePantryTarget = null
  scene.hideRepresentativeSpeech()
}
export function applyRepresentativePantryPose(scene: OfficeScene): void {
  const state = scene.representativePantryAction
  if (!state) return
  scene.representativeSprite?.stop().setTexture('ceo-pantry-sheet-frames', `ceo-${state.action}-${state.pose}`)
    .setCrop().setFlipX(false).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
  scene.representativeSeatedForeground?.setVisible(false)
}
export function updateRepresentativePantryAction(scene: OfficeScene, deltaMs: number): void {
  const state = scene.representativePantryAction
  if (!state) return
  state.elapsedMs += deltaMs
  const pose = pantryPoseAt(state.action, state.elapsedMs)
  if (pose === null) {
    scene.stopRepresentativePantryAction()
  } else if (pose !== state.pose) {
    state.pose = pose
    scene.applyRepresentativePantryPose()
  }
}
export function showRepresentativeSpeech(scene: OfficeScene, text: string): void {
  scene.representativeSpeech?.setText(text).setVisible(true)
  scene.representativeSpeechBubble?.setVisible(true)
  scene.updateRepresentativeLabelPosition()
}
export function hideRepresentativeSpeech(scene: OfficeScene): void {
  scene.representativeSpeech?.setVisible(false)
  scene.representativeSpeechBubble?.setVisible(false)
}
export function representativeChairAvailable(scene: OfficeScene, chair: FurnitureView, checkReservations = false): boolean {
  if (![12, 13, 14].includes(chair.frame) || !(chair.id === REPRESENTATIVE_CHAIR_ID ||
    chair.id === REPRESENTATIVE_MEETING_CHAIR_ID || isInRepresentativeRoom(chair.image) || isInMeetingRoom(chair.image))) return false
  return ![...scene.actors.values()].some((view) =>
    intersectsAabb(actorCollisionRect(view.container), actorCollisionRect(chair.image)) ||
    (checkReservations && view.seatedGoal && view.goal &&
      Math.hypot(view.goal.x - chair.image.x, view.goal.y - chair.image.y) < 16))
}
export function chairAccessCollisions(scene: OfficeScene, chair: FurnitureView, actor?: ActorView, includeActors = true): CollisionRect[] {
  const excluded = new Set([chair.id])
  const seat = scene.furnitureWalkCollision(chair.image, 0)
  // Chairs can be tucked under desks or meeting tables. Their overlapping
  // tabletop permits the short seating step; every other object still blocks it.
  for (const view of scene.furniture.values()) {
    const bounds = scene.furnitureWalkCollision(view.image, 0)
    if (TABLETOP_FURNITURE_FRAMES.has(view.frame) &&
      (intersectsAabb(seat, bounds) || intersectsAabb(actorCollisionRect(chair.image), bounds))) {
      excluded.add(view.id)
    }
  }
  // The final pose change has no walking stride. Keep other furniture's
  // full visual bounds, but allow the extra shoe clearance to close here.
  return [...scene.collisionRects(excluded, 0), ...(includeActors ? scene.actorObstacles(actor, Boolean(actor)) : [])]
}
export function representativeChairApproach(scene: OfficeScene, chair: FurnitureView, from: WorldPoint): WorldPoint | null {
  const collisions = scene.collisionRects()
  const access = scene.chairAccessCollisions(chair)
  if (isOfficePositionWalkable(from, collisions) &&
    Math.hypot(from.x - chair.image.x, from.y - chair.image.y) <= 64 &&
    hasOfficeLineOfSight(from, chair.image, access)) return { x: from.x, y: from.y }
  const route = findOfficePath(from, chair.image, collisions, { goalRadius: SEAT_ACCESS_RADIUS, goalCollisions: access })
  return route.at(-1) ?? null
}
export function representativeDeparturePoint(scene: OfficeScene): WorldPoint | null {
  const sprite = scene.representativeSprite
  if (!sprite) return null
  const seat = scene.representativeSeat
  if (!seat) return { x: sprite.x, y: sprite.y }
  const chair = scene.furniture.get(seat.chairId)
  const center = chair?.image ?? seat.center
  const collisions = [...scene.collisionRects(), ...scene.actorObstacles(undefined, false)]
  const access = chair ? scene.chairAccessCollisions(chair) : collisions
  const candidates = [seat.approach]
  for (let dx = -SEAT_ACCESS_RADIUS; dx <= SEAT_ACCESS_RADIUS; dx += 16) {
    for (let dy = -SEAT_ACCESS_RADIUS; dy <= SEAT_ACCESS_RADIUS; dy += 16) {
      if (Math.hypot(dx, dy) <= SEAT_ACCESS_RADIUS) candidates.push({ x: center.x + dx, y: center.y + dy })
    }
  }
  return candidates.find((point) => isOfficePositionWalkable(point, collisions) &&
    hasOfficeLineOfSight(center, point, access)) ?? null
}
export function standRepresentative(scene: OfficeScene): boolean {
  if (!scene.representativeSeat) return true
  const point = scene.representativeDeparturePoint()
  if (!point || !scene.representativeSprite) return false
  scene.representativeSeat = null
  scene.representativeSprite.setPosition(point.x, point.y)
  scene.applyRepresentativePose(scene.representativeGait.stop())
  scene.updateRepresentativeDepth()
  scene.persistRepresentativePosition()
  return true
}
export function planRepresentativeRoute(scene: OfficeScene): void {
  const sprite = scene.representativeSprite
  if (!sprite) return
  if (scene.representativePantryTarget) {
    const furniture = scene.furniture.get(scene.representativePantryTarget)
    const approach = furniture && scene.representativePantryApproach(furniture, sprite)
    if (!furniture || !approach) {
      scene.stopRepresentativePantryAction()
      scene.stopRepresentativeMovement()
      return
    }
    scene.representativeGoal = approach
    scene.representativeDestination?.setPosition(approach.x, approach.y).setVisible(true)
  }
  if (scene.representativeChairTarget) {
    const chair = scene.furniture.get(scene.representativeChairTarget)
    const approach = chair && scene.representativeChairAvailable(chair) &&
      scene.representativeChairApproach(chair, sprite)
    if (!chair || !approach) {
      scene.representativeChairTarget = null
      scene.stopRepresentativeMovement()
      return
    }
    scene.representativeGoal = approach
    scene.representativeDestination?.setPosition(chair.image.x, chair.image.y).setVisible(true)
  }
  const goal = scene.representativeGoal
  if (!goal) return
  const collisions = scene.collisionRects()
  const route = findOfficePath(sprite, goal, [...collisions, ...scene.actorObstacles(undefined, false)])
  // A passing employee may temporarily block the only path. Keep the
  // destination and wait at that obstruction, retrying without walking in place.
  scene.representativeRoute = route.length > 0 ? route : findOfficePath(sprite, goal, collisions)
  scene.representativeNavigationRevision = scene.navigationRevision
  if (scene.representativeRoute.length === 0) scene.stopRepresentativeMovement()
}
export function repairRepresentativePosition(scene: OfficeScene): void {
  const sprite = scene.representativeSprite
  if (!sprite) return
  const obstacles = [...scene.collisionRects(), ...scene.actorObstacles(undefined, false)]
  if (isOfficePositionWalkable(sprite, obstacles)) return
  const free = nearestOfficePosition(sprite, obstacles)
  if (free && hasOfficeLineOfSight(sprite, free, OFFICE_WALL_COLLISIONS)) sprite.setPosition(free.x, free.y)
  scene.persistRepresentativePosition()
}
export function updateRepresentativeMovement(scene: OfficeScene, deltaSeconds: number): void {
  const sprite = scene.representativeSprite
  if (sprite && scene.representativePantryAction && scene.representativePantryTarget) {
    const furniture = scene.furniture.get(scene.representativePantryTarget)
    if (!furniture || !scene.representativeCanUsePantry(furniture, sprite)) scene.stopRepresentativePantryAction()
  }
  if (scene.layoutEditing || !sprite || !scene.representativeGoal || deltaSeconds <= 0) return
  if (scene.representativeNavigationRevision !== scene.navigationRevision) scene.planRepresentativeRoute()
  const goal = scene.representativeGoal
  if (!goal) return
  let target = scene.representativeRoute[0]
  while (target && Math.hypot(target.x - sprite.x, target.y - sprite.y) < 0.5) {
    sprite.setPosition(target.x, target.y)
    scene.representativeRoute.shift()
    target = scene.representativeRoute[0]
  }
  if (!target) {
    scene.stopRepresentativeMovement()
    return
  }
  const dx = target.x - sprite.x
  const dy = target.y - sprite.y
  const distance = Math.hypot(dx, dy)
  const amount = Math.min(distance, 120 * deltaSeconds)
  const resolved = resolveAxisSeparated(sprite,
    { x: sprite.x + dx / distance * amount, y: sprite.y + dy / distance * amount },
    [...scene.collisionRects(), ...scene.actorObstacles(undefined, false)],
    ACTOR_COLLISION_HALF_WIDTH, ACTOR_COLLISION_HALF_HEIGHT)
  const movedX = resolved.x - sprite.x
  const movedY = resolved.y - sprite.y
  if (Math.hypot(movedX, movedY) < 0.01) {
    scene.applyRepresentativePose(scene.representativeGait.stop())
    scene.representativeStalledMs += deltaSeconds * 1000
    if (scene.representativeStalledMs >= 500) {
      scene.representativeStalledMs = 0
      scene.resolveRepresentativeTraffic()
      scene.planRepresentativeRoute()
    }
    return
  }
  scene.representativeStalledMs = 0
  sprite.setPosition(resolved.x, resolved.y)
  scene.applyRepresentativePose(scene.representativeGait.advance(movedX, movedY))
  scene.updateRepresentativeDepth()
  if (Math.hypot(goal.x - sprite.x, goal.y - sprite.y) < 0.5) {
    sprite.setPosition(goal.x, goal.y)
    scene.stopRepresentativeMovement()
  }
}
export function stopRepresentativeMovement(scene: OfficeScene): void {
  const chair = scene.representativeChairTarget ? scene.furniture.get(scene.representativeChairTarget) : null
  const sprite = scene.representativeSprite
  const arrived = sprite && scene.representativeGoal &&
    Math.hypot(sprite.x - scene.representativeGoal.x, sprite.y - scene.representativeGoal.y) < 0.5
  scene.representativeChairTarget = null
  scene.representativeRoute = []
  scene.representativeGoal = null
  scene.representativeStalledMs = 0
  scene.applyRepresentativePose(scene.representativeGait.stop())
  if (arrived && sprite && chair && scene.representativeChairAvailable(chair) &&
    Math.hypot(sprite.x - chair.image.x, sprite.y - chair.image.y) <= SEAT_ACCESS_RADIUS &&
    hasOfficeLineOfSight(sprite, chair.image, scene.chairAccessCollisions(chair))) {
    scene.representativeSeat = { chairId: chair.id, approach: { x: sprite.x, y: sprite.y },
      center: { x: chair.image.x, y: chair.image.y } }
    const direction = scene.furnitureDirection(scene.furnitureRotation(chair.image))
    sprite.setTexture('ceo-seated-sheet-frames', `ceo-sit-${direction}`)
      .setFlipX(false).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
      .setPosition(chair.image.x, chair.image.y)
  }
  if (scene.representativePantryTarget) {
    if (arrived) scene.startRepresentativePantryAction()
    else scene.stopRepresentativePantryAction()
  }
  scene.representativeDestination?.setVisible(false)
  scene.updateRepresentativeDepth()
  scene.persistRepresentativePosition()
}
export function updateRepresentativeDepth(scene: OfficeScene): void {
  const sprite = scene.representativeSprite
  if (!sprite) return
  const chair = scene.representativeSeat && scene.furniture.get(scene.representativeSeat.chairId)
  let headDepth: number
  if (chair && scene.representativeSeatedForeground) {
    headDepth = scene.applySeatedComposition(chair, sprite, scene.representativeSeatedForeground, sprite)
    scene.updateRepresentativeWorkAnimation(0)
  } else {
    sprite.setDepth(sprite.y).setCrop().setVisible(true)
    scene.representativeSeatedForeground?.setVisible(false)
    headDepth = sprite.depth
  }
  scene.representativeLabel?.setDepth(headDepth + OFFICE_WORLD_HEIGHT)
  scene.representativeSpeechBubble?.setDepth(headDepth + OFFICE_WORLD_HEIGHT + 1)
  scene.representativeSpeech?.setDepth(headDepth + OFFICE_WORLD_HEIGHT + 2)
}
export function updateRepresentativeWorkAnimation(scene: OfficeScene, deltaMs: number): void {
  const sprite = scene.representativeSprite
  const foreground = scene.representativeSeatedForeground
  const chair = scene.representativeSeat && scene.furniture.get(scene.representativeSeat.chairId)
  if (!sprite || !foreground) return
  // Only work at an actual nearby desk, including desks moved in the editor.
  // Meeting-room and standalone chairs retain the relaxed sitting pose.
  const atDesk = chair && [...scene.furniture.values()].some((furniture) =>
    furniture.frame === DESK_FURNITURE_FRAME && intersectsAabb(
      scene.furnitureWalkCollision(chair.image, 0), scene.furnitureWalkCollision(furniture.image, 16)))
  if (!atDesk || scene.layoutEditing) {
    scene.representativeWorkElapsedMs = 0
    if (chair && foreground.texture.key === REPRESENTATIVE_WORK_TEXTURE) scene.renderSeatedForeground(sprite, foreground)
    return
  }
  scene.representativeWorkElapsedMs += deltaMs
  const direction = scene.furnitureDirection(scene.furnitureRotation(chair.image))
  const pose = representativeWorkPoseAt(scene.representativeWorkElapsedMs)
  const frame = `ceo-work-${direction}-${pose}`
  if (foreground.texture.key !== REPRESENTATIVE_WORK_TEXTURE || foreground.frame.name !== frame) {
    foreground.setTexture(REPRESENTATIVE_WORK_TEXTURE, frame)
      .setDisplaySize(ACTOR_SPRITE_WIDTH * REPRESENTATIVE_WORK_FRAME_WIDTH / CHARACTER_FRAME_WIDTH, ACTOR_SPRITE_HEIGHT)
  }
}
export function applySeatedComposition(scene: OfficeScene, chair: FurnitureView, sprite: Phaser.GameObjects.Sprite,
  foreground: Phaser.GameObjects.Sprite,
  depthTarget: Phaser.GameObjects.Sprite | Phaser.GameObjects.Container): number {
  const direction = scene.furnitureDirection(scene.furnitureRotation(chair.image))
  const behindBackrest = direction === 'back'
  const foot = seatedSpriteFoot(chair.image, direction, scene.seatedFrameAnchor(sprite), sprite)
  if (sprite === depthTarget) sprite.setPosition(foot.x, foot.y)
  else sprite.setPosition(foot.x - depthTarget.x, foot.y - depthTarget.y - sprite.displayHeight / 2)
  // Sort the complete, unmodified pose at the chair's floor position.
  // Tables further south naturally cover the lap, while a back-facing
  // chair's own backrest covers the sitter without duplicating the chair.
  depthTarget.setDepth(chair.image.depth + (behindBackrest ? -0.25 : 0.25))
  sprite.setCrop().setVisible(false)
  scene.renderSeatedForeground(sprite, foreground)
  foreground.setPosition(foot.x, foot.y).setDepth(depthTarget.depth).setVisible(true)
  return depthTarget.depth
}
export function seatedFrameAnchor(scene: OfficeScene, sprite: Phaser.GameObjects.Sprite): WorldPoint {
  const anchor = scene.seatedFrameAnchors.get(`${sprite.texture.key}/${sprite.frame.name}`)
  if (!anchor) throw new Error(`Missing seated contact point: ${sprite.texture.key}/${sprite.frame.name}`)
  return anchor
}
export function renderSeatedForeground(scene: OfficeScene, sprite: Phaser.GameObjects.Sprite, foreground: Phaser.GameObjects.Sprite): void {
  foreground.setTexture(sprite.texture.key, sprite.frame.name).setCrop().setFlipX(sprite.flipX)
    .setDisplaySize(sprite.displayWidth, sprite.displayHeight)
}
export function applyRepresentativePose(scene: OfficeScene, pose: CharacterPose): void {
  scene.representativeWorkElapsedMs = 0
  scene.representativeSprite?.stop().setTexture('ceo-animation-sheet-frames', pose.frame)
    .setCrop().setVisible(true).setFlipX(pose.flipX).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
  scene.representativeSeatedForeground?.setVisible(false)
}
export function persistRepresentativePosition(scene: OfficeScene): void {
  if (!scene.representativeSprite) return
  localStorage.setItem(OFFICE_REPRESENTATIVE_SAVE_KEY, JSON.stringify({
    // Reload on the free approach tile, never inside the chair's collision.
    x: scene.representativeSeat?.approach.x ?? scene.representativeSprite.x,
    y: scene.representativeSeat?.approach.y ?? scene.representativeSprite.y
  }))
}
export function updateRepresentativeLabelPosition(scene: OfficeScene): void {
  if (!scene.representativeSprite || !scene.representativeLabel) return
  const sprite = scene.representativeSprite
  const label = scene.representativeLabel
  const above = sprite.y - sprite.displayHeight * sprite.originY - CEO_LABEL_GAP
  label.setPosition(sprite.x + CEO_SPRITE_ART_X_OFFSET, above)
  const bubble = scene.representativeSpeechBubble
  const speech = scene.representativeSpeech
  if (bubble?.visible && speech) {
    const upperBottom = above - label.displayHeight - 4
    const below = upperBottom - SPEECH_BUBBLE_HEIGHT < 8
    // Only the speech changes vertical side. The name never moves away
    // from the head, even when its normal position reaches the top edge.
    const bottom = below ? sprite.y + 8 + SPEECH_BUBBLE_HEIGHT : upperBottom
    const halfWidth = SPEECH_BUBBLE_WIDTH / 2
    const x = Phaser.Math.Clamp(label.x, halfWidth + 8, OFFICE_WORLD_WIDTH - halfWidth - 8)
    bubble.setPosition(x, bottom).setFlipY(below)
    // Flip the panel's tail toward the actor, keeping the text upright.
    speech.setPosition(x, bottom - SPEECH_BUBBLE_HEIGHT * (below ? 0.38 : 0.62))
  }
}
