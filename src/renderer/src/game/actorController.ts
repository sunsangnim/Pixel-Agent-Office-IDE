import type { OfficeScene } from './OfficeScene'
import Phaser from 'phaser'
import { ACTOR_COLLISION_HALF_HEIGHT, ACTOR_COLLISION_HALF_WIDTH, ACTOR_SPRITE_HEIGHT, ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_Y_OFFSET, ActorDestination, ActorView, CEO_LABEL_GAP, DESK_FURNITURE_FRAME, FurnitureView, SEAT_ACCESS_RADIUS, SPEECH_BUBBLE_HEIGHT, SPEECH_BUBBLE_WIDTH } from './OfficeScene'
import { ACTOR_NAV_HALF_HEIGHT, ACTOR_NAV_HALF_WIDTH, actorCollisionRect, findOfficePath, hasOfficeLineOfSight, isOfficePositionWalkable, nearestOfficePosition } from './navigation'
import { ActorStateMachine, actionForPresence } from './actorStateMachine'
import { CHARACTER_FRAME_WIDTH } from './characterFrames'
import { CharacterGait } from './characterGait'
import { CollisionRect, intersectsAabb, resolveAxisSeparated } from './collisionResolution'
import { IdleActivity } from './idleActivity'
import { OFFICE_WALL_COLLISIONS } from './officeGrid'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, OfficeGameActor, OfficeWorldSnapshot, TEAM_DESKS, WAYPOINTS, WorldPoint, targetPoint } from './officeWorld'
import { OFFICE_WORLD_SAVE_KEY, upsertSavedActor } from './worldPersistence'
import { REPRESENTATIVE_CHAIR_ID, REPRESENTATIVE_DESK_ID, REPRESENTATIVE_MEETING_CHAIR_ID } from './layoutPersistence'
import { REPRESENTATIVE_ROOM, isInMeetingRoom, isInRepresentativeRoom, isInStaffArea } from './officeRooms'
import { REPRESENTATIVE_WORK_FRAME_WIDTH, representativeWorkPoseAt } from './representativeWorkAnimation'
import { distanceToRoute, findYieldRoute } from './officeTraffic'
import { pantryPoseAt } from './pantryAnimation'
import { staffWorkTexture } from './staffWorkAnimation'

export function applySnapshot(scene: OfficeScene, snapshot: OfficeWorldSnapshot): void {
  scene.snapshot = snapshot
  scene.pendingSnapshot = null
  for (const profileId of scene.greetedVisitors) {
    if (!snapshot.actors.some((actor) => actor.profileId === profileId && actor.presence === 'representativeVisit')) {
      scene.greetedVisitors.delete(profileId)
    }
  }
  const pantryOpen = snapshot.actors.some((actor) => actor.presence === 'pantry' || actor.presence === 'pantryDoor')
  const meetingOpen = snapshot.meetingActive || snapshot.actors.some((actor) => actor.presence === 'meeting' || actor.presence === 'meetingDoor')
  scene.setDoorOpen('elevator', snapshot.elevatorOpen)
  scene.setDoorOpen('pantry', pantryOpen)
  scene.setDoorOpen('meeting', meetingOpen)

  const activeIds = new Set(snapshot.actors.filter((actor) => actor.presence !== 'offDuty').map((actor) => actor.profileId))
  for (const [id, view] of scene.actors) {
    if (!activeIds.has(id)) {
      scene.stopActorAction(view)
      view.container.destroy(true)
      view.overlay.destroy(true)
      view.seatedForeground.destroy()
      scene.actors.delete(id)
    }
  }

  snapshot.actors.forEach((actor, index) => {
    if (actor.presence === 'offDuty') return
    const view = scene.actors.get(actor.profileId) ?? scene.createActor(actor)
    view.requestedActor = actor
    view.actorIndex = index
    scene.updateActor(view, scene.effectiveActor(view), index)
  })
}
export function createActor(scene: OfficeScene, actor: OfficeGameActor): ActorView {
  const row = Math.floor(actor.rosterIndex / 5)
  const frame = String(actor.rosterIndex)
  const animationAtlas = scene.animationAtlasFor(actor)
  const animKey = scene.actorAnimationKey(actor)
  const sprite = scene.add.sprite(
    0,
    -27,
    animationAtlas ?? `roster-row-${row}`,
    animationAtlas ? `actor-${animKey}-idle-0` : frame
  ).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
    .setY(ACTOR_SPRITE_Y_OFFSET)
  sprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    scene.actorSelectHandler?.(actor.profileId)
  })
  const seatedForeground = scene.add.sprite(0, 0, animationAtlas ?? `roster-row-${row}`,
    animationAtlas ? `actor-${animKey}-idle-0` : frame)
    .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT).setOrigin(0.5, 1).setVisible(false)
    .setInteractive({ useHandCursor: true, pixelPerfect: true })
    .on('pointerdown', () => scene.actorSelectHandler?.(actor.profileId))
  // Bottom-anchor the full label above the head, including Korean glyphs
  // with taller font metrics, just like the representative's nameplate.
  const label = scene.addOfficeText(0, ACTOR_SPRITE_Y_OFFSET - ACTOR_SPRITE_HEIGHT / 2 - 6, actor.displayName, {
    fontSize: '13px', color: '#111111', align: 'center'
  }).setOrigin(0.5, 1).setPadding(4, 4)
  const speechPanel = scene.add.image(0, 0, 'speech-bubble', 'panel')
    .setOrigin(0.5, 1).setDisplaySize(SPEECH_BUBBLE_WIDTH, SPEECH_BUBBLE_HEIGHT).setVisible(false)
  const bubble = scene.addOfficeText(0, 0, '', {
    fontSize: '12px', color: '#26332f', align: 'center'
  }).setOrigin(0.5, 0.5).setVisible(false)
  const saved = scene.worldSave.actors.find((candidate) => candidate.profileId === actor.profileId)
  const initial = nearestOfficePosition(saved ?? WAYPOINTS.elevatorInside,
    [...scene.collisionRects(), ...scene.actorObstacles()]) ?? WAYPOINTS.elevatorExit
  const container = scene.add.container(initial.x, initial.y, [sprite]).setDepth(initial.y)
  const overlay = scene.add.container(initial.x, initial.y, [label, speechPanel, bubble])
  const view: ActorView = {
    container, sprite, seatedForeground, overlay, label, bubble, speechPanel, routeKey: '', workElapsedMs: 0,
    stateMachine: new ActorStateMachine(actor.presence),
    gait: new CharacterGait(`actor-${animKey}`),
    route: [], routeIndex: 0, actor, requestedActor: actor, actorIndex: 0, idleActivity: new IdleActivity(),
    goal: null, seatedGoal: false, chairId: null, settled: false, blocked: false, stalledMs: 0, blockedOccupancy: null, retryAt: 0
  }
  scene.actors.set(actor.profileId, view)
  return view
}
// The live chair position (which the interior editor can move) instead of
// the static TEAM_DESKS default, so characters keep finding their seat
// after a desk is dragged elsewhere.
export function deskSeatPoint(scene: OfficeScene, actor: OfficeGameActor): WorldPoint {
  const chair = scene.assignedDeskChair(actor)
  if (chair) return { x: chair.image.x, y: chair.image.y }
  const desk = scene.furniture.get(`desk-${actor.teamIndex}-${actor.slotIndex}`)
  if (desk && scene.deskZone(desk.id, desk.image) === actor.teamIndex) return { x: desk.image.x, y: desk.image.y + 64 }
  // Distinct waiting points for a team that currently has no physical seat.
  return { x: 352 + actor.teamIndex * 96, y: 592 + actor.slotIndex * 40 }
}
export function actorCanUseChair(scene: OfficeScene, actor: OfficeGameActor, chair: FurnitureView): boolean {
  if (![12, 13, 14].includes(chair.frame) || chair.id === REPRESENTATIVE_CHAIR_ID ||
    chair.id === REPRESENTATIVE_MEETING_CHAIR_ID || isInRepresentativeRoom(chair.image)) return false
  if (isInMeetingRoom(chair.image)) return actor.presence === 'meeting'
  return chair.id === `chair-${actor.teamIndex}-${actor.slotIndex}` && isInStaffArea(chair.image)
}
export function assignedDeskChair(scene: OfficeScene, actor: OfficeGameActor): FurnitureView | undefined {
  const chair = scene.furniture.get(`chair-${actor.teamIndex}-${actor.slotIndex}`)
  return chair && !isInMeetingRoom(chair.image) && scene.actorCanUseChair(actor, chair) ? chair : undefined
}
export function meetingDestination(scene: OfficeScene, actor: OfficeGameActor): ActorDestination {
  const attendees = (scene.snapshot?.actors.filter((candidate) => candidate.presence === 'meeting') ?? [actor])
    .slice().sort((a, b) => a.teamIndex - b.teamIndex || a.slotIndex - b.slotIndex || a.profileId.localeCompare(b.profileId))
  const representativeChair = scene.representativeSeat?.chairId ?? scene.representativeChairTarget
  const key = JSON.stringify([scene.navigationRevision, representativeChair, attendees.map((candidate) => candidate.profileId)])
  if (key !== scene.meetingAssignmentKey) {
    scene.meetingAssignmentKey = key
    scene.meetingAssignments.clear()
    const collisions = scene.collisionRects()
    const entry = nearestOfficePosition(WAYPOINTS.meetingDoor, collisions) ?? WAYPOINTS.meetingDoor
    const chairs = [...scene.furniture.values()].filter(({ id, frame, image }) =>
      id !== REPRESENTATIVE_MEETING_CHAIR_ID && id !== REPRESENTATIVE_CHAIR_ID && id !== representativeChair &&
      [12, 13, 14].includes(frame) && isInMeetingRoom(image)
    ).sort((a, b) => a.image.y - b.image.y || a.image.x - b.image.x || a.id.localeCompare(b.id))
      .filter((chair) => findOfficePath(entry, chair.image, collisions, {
        goalRadius: SEAT_ACCESS_RADIUS, goalCollisions: scene.chairAccessCollisions(chair, undefined, false)
      }).length > 0)
    const reserved: WorldPoint[] = chairs.map(({ image }) => ({ x: image.x, y: image.y }))
    const candidates: WorldPoint[] = []
    // Keep a clear central aisle to the table and doorway. Overflow guests
    // wait on distinct free floor, rather than sharing an unreachable chair.
    for (const y of [320, 256, 192, 128, 64]) for (const x of [336, 624, 400, 560]) candidates.push({ x, y })
    for (let y = 400; y <= 896; y += 64) for (const x of [352, 608, 288, 672]) candidates.push({ x, y })
    attendees.forEach((attendee, index) => {
      const chair = chairs[index]
      if (chair) {
        scene.meetingAssignments.set(attendee.profileId, { point: { x: chair.image.x, y: chair.image.y }, seated: true, chairId: chair.id })
        return
      }
      const obstacles = [...collisions, ...reserved.map(actorCollisionRect)]
      const point = candidates.find((candidate) => reserved.every((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y) >= 64) &&
        isOfficePositionWalkable(candidate, obstacles) && findOfficePath(entry, candidate, obstacles).length > 0)
        ?? nearestOfficePosition({ x: 480, y: 592 + index * 16 }, obstacles, 320)
      if (point) {
        reserved.push(point)
        scene.meetingAssignments.set(attendee.profileId, { point, seated: false })
      }
    })
  }
  return scene.meetingAssignments.get(actor.profileId) ?? { point: scene.deskSeatPoint(actor), seated: false }
}
export function actorDestination(scene: OfficeScene, actor: OfficeGameActor, actorIndex: number): ActorDestination {
  if (actor.presence === 'representativeVisit') return scene.representativeVisitDestination(actor)
  if (actor.presence === 'meeting') {
    return scene.meetingDestination(actor)
  }
  const point = targetPoint(actor, actorIndex, (candidate) => scene.deskSeatPoint(candidate)) ?? scene.deskSeatPoint(actor)
  const chair = scene.assignedDeskChair(actor)
  const seated = ['working', 'deskIdle', 'arriving', 'requestingHelp', 'error'].includes(actor.presence) && Boolean(chair)
  return { point, seated, chairId: seated ? chair?.id : undefined }
}
export function representativeVisitDestination(scene: OfficeScene, actor: OfficeGameActor): ActorDestination {
  const visitors = (scene.snapshot?.actors.filter((candidate) => candidate.presence === 'representativeVisit') ?? [actor])
    .slice().sort((a, b) => a.profileId.localeCompare(b.profileId))
  const collisions = scene.collisionRects()
  const representative = scene.representativeSprite
  const key = JSON.stringify([scene.navigationRevision, representative && [Math.round(representative.x), Math.round(representative.y)], visitors.map((visitor) => visitor.profileId)])
  if (key === scene.representativeVisitKey) return scene.representativeVisitAssignments.get(actor.profileId) ?? { point: scene.deskSeatPoint(actor), seated: false }
  scene.representativeVisitKey = key
  scene.representativeVisitAssignments.clear()
  const obstacles = representative ? [...collisions, actorCollisionRect(representative)] : collisions
  const entry = nearestOfficePosition(WAYPOINTS.representativeDoor, obstacles) ?? WAYPOINTS.representativeDoor
  const candidates: WorldPoint[] = []
  const desk = scene.furniture.get(REPRESENTATIVE_DESK_ID)
  const chair = scene.furniture.get(REPRESENTATIVE_CHAIR_ID)
  let front: WorldPoint = { x: 832, y: 752 }
  if (desk) {
    const bounds = scene.furnitureWalkCollision(desk.image, 0)
    const dx = (chair?.image.x ?? desk.image.x) - desk.image.x
    const dy = (chair?.image.y ?? desk.image.y + 64) - desk.image.y
    const horizontal = Math.abs(dx) > Math.abs(dy)
    const away = horizontal ? (dx >= 0 ? -1 : 1) : (dy >= 0 ? -1 : 1)
    front = horizontal
      ? { x: (away < 0 ? bounds.x : bounds.x + bounds.width) + away * (ACTOR_NAV_HALF_WIDTH + 12), y: desk.image.y }
      : { x: desk.image.x, y: (away < 0 ? bounds.y : bounds.y + bounds.height) + away * (ACTOR_NAV_HALF_HEIGHT + 12) }
    // Center first, then spread visitors to either side across from the CEO's chair.
    for (const distance of [0, 32, 64]) for (const offset of [0, -56, 56, -112, 112]) {
      candidates.push(horizontal ? { x: front.x + away * distance, y: front.y + offset }
        : { x: front.x + offset, y: front.y + away * distance })
    }
  }
  const fallback: WorldPoint[] = []
  for (let y = REPRESENTATIVE_ROOM.top + 80; y <= REPRESENTATIVE_ROOM.bottom - 32; y += 48) {
    for (let x = REPRESENTATIVE_ROOM.left + 48; x <= REPRESENTATIVE_ROOM.right - 32; x += 48) fallback.push({ x, y })
  }
  candidates.push(...fallback.sort((a, b) => Math.hypot(a.x - front.x, a.y - front.y) - Math.hypot(b.x - front.x, b.y - front.y)))
  const reserved: WorldPoint[] = []
  for (const visitor of visitors) {
    const occupied = [...obstacles, ...reserved.map(actorCollisionRect)]
    const point = candidates.find((candidate) => isInRepresentativeRoom(candidate) && reserved.every((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) >= 48) &&
      isOfficePositionWalkable(candidate, occupied) && findOfficePath(entry, candidate, obstacles).length > 0)
    if (point) reserved.push(point)
    scene.representativeVisitAssignments.set(visitor.profileId, { point: point ?? scene.deskSeatPoint(visitor), seated: false })
  }
  return scene.representativeVisitAssignments.get(actor.profileId) ?? { point: scene.deskSeatPoint(actor), seated: false }
}
export function actorObstacles(scene: OfficeScene, except?: ActorView, includeRepresentative = true): CollisionRect[] {
  const obstacles = [...scene.actors.values()].filter((view) => view !== except)
    .map((view) => actorCollisionRect(view.container))
  if (includeRepresentative && scene.representativeSprite) {
    const chair = scene.representativeSeat && scene.furniture.get(scene.representativeSeat.chairId)
    obstacles.push(actorCollisionRect(chair ? chair.image : scene.representativeSprite))
  }
  return obstacles
}
export function occupancyKey(scene: OfficeScene, view: ActorView): string {
  const actors = [...scene.actors.values()].filter((other) => other !== view &&
    Math.hypot(other.container.x - view.container.x, other.container.y - view.container.y) < 128)
    .map((other) => [other.actor.profileId, Math.round(other.container.x / 8), Math.round(other.container.y / 8)].join(':'))
    .join('|')
  const representative = scene.representativeSprite
  return actors + `|seat:${scene.representativeSeat?.chairId ?? scene.representativeChairTarget ?? ''}` +
    (representative && Math.hypot(representative.x - view.container.x, representative.y - view.container.y) < 128
    ? `|representative:${Math.round(representative.x / 8)}:${Math.round(representative.y / 8)}` : '')
}
export function effectiveActor(scene: OfficeScene, view: ActorView, visitAllowed = false): OfficeGameActor {
  const presence = view.idleActivity.update(
    view.requestedActor.presence, scene.simulationTimeMs, view.settled ? view.actor.presence : null, visitAllowed
  )
  return { ...view.requestedActor, presence }
}
export function updateIdleActivities(scene: OfficeScene): void {
  const views = [...scene.actors.values()]
  const pantryOccupied = Boolean(scene.representativePantryTarget || scene.representativePantryAction) ||
    views.some((view) => view.idleActivity.awayFromDesk ||
      view.actor.presence === 'pantry' || view.actor.presence === 'pantryDoor' ||
      view.requestedActor.presence === 'pantry' || view.requestedActor.presence === 'pantryDoor')
  const visitor = scene.pantrySchedule.takeTurn(scene.simulationTimeMs,
    views.filter((view) => view.requestedActor.slotIndex === 0).map((view) => ({
      id: view.requestedActor.profileId,
      available: view.requestedActor.presence === 'deskIdle' && view.actor.presence === 'deskIdle' &&
        view.settled && !view.departureBlocked && !view.trafficYield
    })), pantryOccupied)
  for (const view of scene.actors.values()) {
    if (view.departureBlocked && scene.simulationTimeMs < view.retryAt) continue
    const actor = scene.effectiveActor(view, view.actor.profileId === visitor)
    const changed = actor.presence !== view.actor.presence
    if (view.trafficYield && !changed) {
      if (!view.trafficYield.arrived || !scene.trafficRequesterCleared(view)) continue
      const wasSettled = view.trafficYield.wasSettled
      view.trafficYield = undefined
      if (wasSettled) {
        view.goal = { x: view.container.x, y: view.container.y }
        view.settled = true
        scene.startActionAnimation(view, actor)
        continue
      }
      view.routeKey = ''
      scene.updateActor(view, actor, view.actorIndex)
      continue
    }
    const occupancyChanged = view.blocked && view.blockedOccupancy !== null &&
      scene.simulationTimeMs >= view.retryAt
    if (occupancyChanged) view.routeKey = ''
    if (changed || occupancyChanged || view.departureBlocked) scene.updateActor(view, actor, view.actorIndex)
  }
}
export function actorDeparturePoint(scene: OfficeScene, view: ActorView, chair: FurnitureView, destination: ActorDestination): WorldPoint | null {
  const collisions = scene.collisionRects()
  const obstacles = [...collisions, ...scene.actorObstacles(view)]
  const access = scene.chairAccessCollisions(chair, view)
  const candidates: WorldPoint[] = view.approachPoint ? [view.approachPoint] : []
  for (let dy = -SEAT_ACCESS_RADIUS; dy <= SEAT_ACCESS_RADIUS; dy += 16) {
    for (let dx = -SEAT_ACCESS_RADIUS; dx <= SEAT_ACCESS_RADIUS; dx += 16) {
      if (Math.hypot(dx, dy) <= SEAT_ACCESS_RADIUS) candidates.push({ x: chair.image.x + dx, y: chair.image.y + dy })
    }
  }
  candidates.sort((a, b) => Math.hypot(a.x - chair.image.x, a.y - chair.image.y) - Math.hypot(b.x - chair.image.x, b.y - chair.image.y))
  const nextChair = destination.chairId && scene.furniture.get(destination.chairId)
  const options = { goalRadius: destination.seated ? SEAT_ACCESS_RADIUS : 0,
    goalCollisions: nextChair ? scene.chairAccessCollisions(nextChair, view, false) : OFFICE_WALL_COLLISIONS }
  return candidates.find((point) => isOfficePositionWalkable(point, obstacles) &&
    hasOfficeLineOfSight(chair.image, point, access) &&
    (Math.hypot(point.x - destination.point.x, point.y - destination.point.y) < 0.5 ||
      findOfficePath(point, destination.point, collisions, options).length > 0)) ?? null
}
export function trafficRequesterCleared(scene: OfficeScene, view: ActorView): boolean {
  const yielding = view.trafficYield!
  const representative = yielding.requesterId === '__representative__'
  const requester = scene.actors.get(yielding.requesterId)
  const point = representative ? scene.representativeSprite : requester?.container
  if (!point) return true
  if (Math.hypot(point.x - view.container.x, point.y - view.container.y) < 44) return false
  if (representative ? !scene.representativeGoal : requester?.settled) return true
  const route = representative ? scene.representativeRoute : requester!.route.slice(requester!.routeIndex)
  return distanceToRoute(yielding.origin, [point, ...route]) > 44
}
export function yieldActor(scene: OfficeScene, view: ActorView, requesterId: string, passingRoute: WorldPoint[]): boolean {
  if (view.trafficYield || view.pantryAction || view.departureBlocked || (view.settled && view.seatedGoal)) return false
  const reserved = [...scene.actors.values()].filter((other) => other !== view)
    .flatMap((other) => other.trafficYield ? other.route.slice(-1) : other.goal ? [other.goal] : [])
  const route = findYieldRoute(view.container, passingRoute, [...scene.collisionRects(), ...scene.actorObstacles(view)], reserved)
  if (route.length === 0) return false
  view.trafficYield = { requesterId, origin: { x: view.container.x, y: view.container.y }, arrived: false, wasSettled: view.settled }
  view.settled = false
  view.blocked = false
  view.stalledMs = 0
  view.route = route
  view.routeIndex = 0
  scene.restoreActorStandingPose(view)
  scene.setActorSpeech(view, '잠시 양보')
  return true
}
export function resolveActorTraffic(scene: OfficeScene, requester: ActorView): boolean {
  if (requester.trafficYield || !requester.goal) return false
  const route = [requester.container, ...findOfficePath(requester.container, requester.goal, scene.collisionRects(), scene.actorSeatPathOptions(requester))]
  const blockers = [...scene.actors.values()].filter((other) => other !== requester && !other.trafficYield &&
    !(other.settled && other.seatedGoal) && Math.hypot(other.container.x - requester.container.x, other.container.y - requester.container.y) < 80 &&
    distanceToRoute(other.container, route) < 32)
    .sort((a, b) => a.actor.profileId.localeCompare(b.actor.profileId))
  for (const other of blockers) {
    // A deterministic right of way prevents both walkers choosing the same
    // sidestep or waiting for each other. Idle floor occupants also step aside.
    if (other.settled || requester.actor.profileId.localeCompare(other.actor.profileId) < 0) {
      if (scene.yieldActor(other, requester.actor.profileId, route)) return true
    } else if (other.goal) {
      const otherRoute = [other.container, ...findOfficePath(other.container, other.goal, scene.collisionRects(), scene.actorSeatPathOptions(other))]
      if (scene.yieldActor(requester, other.actor.profileId, otherRoute)) return true
    }
  }
  return false
}
export function resolveRepresentativeTraffic(scene: OfficeScene): void {
  const sprite = scene.representativeSprite
  if (!sprite || !scene.representativeGoal) return
  const route = [sprite, ...findOfficePath(sprite, scene.representativeGoal, scene.collisionRects())]
  for (const view of scene.actors.values()) {
    if (Math.hypot(view.container.x - sprite.x, view.container.y - sprite.y) < 80 &&
      distanceToRoute(view.container, route) < 32 && scene.yieldActor(view, '__representative__', route)) return
  }
}
export function updateActor(scene: OfficeScene, view: ActorView, actor: OfficeGameActor, actorIndex: number): void {
  if (scene.layoutEditing || !view.stateMachine.requestPresence(actor.presence)) return
  const destination = scene.actorDestination(actor, actorIndex)
  const key = [actor.presence, destination.point.x, destination.point.y, destination.chairId, destination.seated, scene.navigationRevision].join(':')
  const previousChair = view.settled && view.seatedGoal && view.chairId && scene.furniture.get(view.chairId)
  if (previousChair && Math.hypot(destination.point.x - view.container.x, destination.point.y - view.container.y) > 0.5) {
    const departure = scene.actorDeparturePoint(view, previousChair, destination)
    if (!departure) {
      // Keep the current seated composition until a collision-free exit is
      // available. Never stand on another character's occupied approach tile.
      view.departureBlocked = true
      view.retryAt = scene.simulationTimeMs + 500
      return
    }
    view.container.setPosition(departure.x, departure.y)
  }
  view.departureBlocked = false
  view.actor = actor
  view.actorIndex = actorIndex
  if (view.routeKey === key) return
  view.routeKey = key
  view.trafficYield = undefined
  scene.stopActorAction(view)
  view.route = []
  view.routeIndex = 0
  view.stalledMs = 0
  view.blocked = false
  view.blockedOccupancy = null
  view.settled = false
  view.goal = destination.point
  view.seatedGoal = destination.seated
  view.chairId = destination.seated ? destination.chairId ?? scene.assignedDeskChair(actor)?.id ?? null : null
  const labels: Partial<Record<OfficeGameActor['presence'], string>> = {
    working: '업무 중', representativeVisit: '대표실로 가는 중', requestingHelp: '승인 대기', error: '오류!'
  }
  const message = actor.presence === 'pantry'
    ? actionForPresence('pantry', actorIndex) === 'drinking' ? '커피 마시러 가는 중' : '간식 먹으러 가는 중'
    : labels[actor.presence] ?? ''
  scene.setActorSpeech(view, message)
  view.sprite.setTint(actor.presence === 'error' ? 0xff7777 : actor.presence === 'requestingHelp' ? 0xffd36a : 0xffffff)
  scene.restoreActorStandingPose(view)

  if (Math.hypot(view.container.x - view.goal.x, view.container.y - view.goal.y) < 0.5) {
    scene.finishActorRoute(view)
    return
  }

  const collisions = scene.collisionRects()
  const obstacles = [...collisions, ...scene.actorObstacles(view)]
  if (!isOfficePositionWalkable(view.container, obstacles)) {
    // Stand up at the approach used to enter the seat. Old saves inside
    // furniture are repaired once, before planning, rather than every tick.
    const standing = view.approachPoint && isOfficePositionWalkable(view.approachPoint, obstacles)
      ? view.approachPoint : nearestOfficePosition(view.container, obstacles)
    if (!standing || !hasOfficeLineOfSight(view.container, standing, OFFICE_WALL_COLLISIONS)) {
      scene.blockActor(view, false)
      return
    }
    view.container.setPosition(standing.x, standing.y)
  }
  view.approachPoint = undefined
  view.container.setScale(1)
  view.route = findOfficePath(view.container, view.goal, obstacles, scene.actorSeatPathOptions(view))
  if (view.route.length === 0) view.route = findOfficePath(view.container, view.goal, collisions, scene.actorSeatPathOptions(view))
  if (view.route.length === 0 && view.seatedGoal && actor.presence === 'meeting') {
    // Edited tables can completely enclose a chair. Join the meeting from
    // open floor instead of trying to walk through the table to that seat.
    const waiting = nearestOfficePosition(destination.point, obstacles, SEAT_ACCESS_RADIUS)
    if (waiting) view.goal = waiting
    view.seatedGoal = false
    view.chairId = null
    view.route = findOfficePath(view.container, view.goal, obstacles)
  }
  if (view.route.length === 0) scene.blockActor(view, false)
  scene.updateActorDepth(view)
}
export function actorSeatPathOptions(scene: OfficeScene, view: ActorView) {
  const chair = view.chairId && scene.furniture.get(view.chairId)
  return { goalRadius: view.seatedGoal ? SEAT_ACCESS_RADIUS : 0,
    goalCollisions: chair ? scene.chairAccessCollisions(chair, view, false) : OFFICE_WALL_COLLISIONS }
}
export function restoreActorStandingPose(scene: OfficeScene, view: ActorView): void {
  const atlas = scene.animationAtlasFor(view.actor)
  if (atlas) view.sprite.setTexture(atlas, `actor-${scene.actorAnimationKey(view.actor)}-idle-0`)
  view.sprite.stop().setCrop().setVisible(true).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
    .setPosition(0, ACTOR_SPRITE_Y_OFFSET).setFlipX(false)
  view.seatedForeground.setVisible(false)
}
export function stopActorAction(scene: OfficeScene, view: ActorView): void {
  view.workElapsedMs = 0
  if (view.pantryAction) {
    view.pantryAction = undefined
    scene.restoreActorStandingPose(view)
    scene.setActorSpeech(view, '')
  }
  view.sprite.stop()
  view.gait.stop()
  view.stateMachine.cancelAction()
}
export function stopActorWalking(scene: OfficeScene, view: ActorView): void {
  scene.restoreActorStandingPose(view)
  view.sprite.stop()
  if (scene.animationAtlasFor(view.actor)) {
    const pose = view.gait.stop()
    view.sprite.setFrame(pose.frame).setFlipX(pose.flipX)
  }
  view.stateMachine.stopWalking()
}
export function blockActor(scene: OfficeScene, view: ActorView, dynamic: boolean): void {
  view.route = []
  view.routeIndex = 0
  view.settled = false
  view.blocked = true
  view.blockedOccupancy = dynamic ? scene.occupancyKey(view) : null
  view.retryAt = scene.simulationTimeMs + 1000
  scene.stopActorWalking(view)
  scene.setActorSpeech(view, '통로 대기')
  if (view.idleActivity.visitingPantry) view.idleActivity.cancelVisit()
  scene.updateActorDepth(view)
}
export function finishActorRoute(scene: OfficeScene, view: ActorView): void {
  if (view.trafficYield) {
    view.trafficYield.arrived = true
    view.route = []
    view.routeIndex = 0
    scene.stopActorWalking(view)
    scene.updateActorDepth(view)
    return
  }
  const reservedId = scene.representativeSeat?.chairId ?? scene.representativeChairTarget
  const reserved = reservedId && scene.furniture.get(reservedId)
  if (view.seatedGoal && view.goal && reserved &&
    Math.hypot(view.goal.x - reserved.image.x, view.goal.y - reserved.image.y) < 16) {
    view.route = []
    view.routeIndex = 0
    scene.blockActor(view, true)
    return
  }
  view.route = []
  view.routeIndex = 0
  view.blocked = false
  view.stalledMs = 0
  if (isOfficePositionWalkable(view.container, scene.collisionRects())) {
    view.approachPoint = { x: view.container.x, y: view.container.y }
  }
  if (view.seatedGoal && view.goal) {
    const chair = view.chairId && scene.furniture.get(view.chairId)
    if (!chair || !scene.actorCanUseChair(view.actor, chair) || Math.hypot(view.container.x - view.goal.x, view.container.y - view.goal.y) > SEAT_ACCESS_RADIUS ||
      !hasOfficeLineOfSight(view.container, view.goal, scene.chairAccessCollisions(chair, view, false))) {
      scene.blockActor(view, false)
      return
    }
    if (!hasOfficeLineOfSight(view.container, view.goal, scene.chairAccessCollisions(chair, view))) {
      scene.blockActor(view, true)
      return
    }
    view.container.setPosition(view.goal.x, view.goal.y)
  }
  view.settled = true
  scene.startActionAnimation(view, view.actor)
  if (view.actor.presence === 'representativeVisit') {
    const arrived = isInRepresentativeRoom(view.container)
    scene.setActorSpeech(view, arrived ? '' : '자리 대기')
    if (arrived && scene.dialogueHandler && !scene.greetedVisitors.has(view.actor.profileId)) {
      const dialogue = scene.dialogueForActor(view.actor, '대표님, 부르셨나요?', `visit-${++scene.dialogueSequence}`)
      if (dialogue) {
        scene.greetedVisitors.add(view.actor.profileId)
        scene.dialogueHandler(dialogue)
      }
    }
  }
  scene.persistActor(view.actor, view)
}
export function updateActorMovement(scene: OfficeScene, deltaSeconds: number): void {
  if (scene.layoutEditing || deltaSeconds <= 0) return
  const collisions = scene.collisionRects()
  for (const view of scene.actors.values()) {
    let target = view.route[view.routeIndex]
    while (target && Math.hypot(target.x - view.container.x, target.y - view.container.y) < 0.5) {
      view.container.setPosition(target.x, target.y)
      view.routeIndex += 1
      if (view.routeIndex >= view.route.length) {
        scene.finishActorRoute(view)
        break
      }
      target = view.route[view.routeIndex]
    }
    if (view.route.length === 0 || !target) continue
    const dx = target.x - view.container.x
    const dy = target.y - view.container.y
    const distance = Math.hypot(dx, dy)
    const amount = Math.min(distance, 120 * deltaSeconds)
    const before = { x: view.container.x, y: view.container.y }
    const obstacles = [...collisions, ...scene.actorObstacles(view)]
    const resolved = resolveAxisSeparated(before,
      { x: before.x + dx / distance * amount, y: before.y + dy / distance * amount },
      obstacles, ACTOR_COLLISION_HALF_WIDTH, ACTOR_COLLISION_HALF_HEIGHT)
    const movedX = resolved.x - before.x
    const movedY = resolved.y - before.y
    if (Math.hypot(movedX, movedY) < 0.01) {
      scene.stopActorWalking(view)
      view.stalledMs += deltaSeconds * 1000
      if (view.stalledMs >= 500 && view.goal) {
        if (!view.trafficYield && scene.resolveActorTraffic(view)) {
          view.stalledMs = 0
          continue
        }
        const targetGoal = view.trafficYield ? view.route.at(-1)! : view.goal
        const alternate = findOfficePath(view.container, targetGoal, obstacles, view.trafficYield ? {} : scene.actorSeatPathOptions(view))
        if (alternate.length > 0 && Math.hypot(alternate[0].x - before.x, alternate[0].y - before.y) > 0.5) {
          view.route = alternate
          view.routeIndex = 0
          view.stalledMs = 0
        } else if (view.trafficYield) {
          view.stalledMs = 0
        } else {
          scene.blockActor(view, true)
        }
      }
      continue
    }
    view.stalledMs = 0
    view.container.setPosition(resolved.x, resolved.y).setDepth(resolved.y)
    view.overlay.setDepth(view.container.depth + OFFICE_WORLD_HEIGHT)
    view.stateMachine.startWalking(movedX, movedY)
    // Facing follows actual displacement, not an unreachable target vector.
    if (scene.animationAtlasFor(view.actor)) {
      const pose = view.gait.advance(movedX, movedY)
      view.sprite.stop().setFrame(pose.frame).setFlipX(pose.flipX)
    }
    if (Math.hypot(target.x - resolved.x, target.y - resolved.y) < 0.5) {
      view.container.setPosition(target.x, target.y)
      view.routeIndex += 1
      if (view.routeIndex >= view.route.length) scene.finishActorRoute(view)
    }
  }
}
export function startActionAnimation(scene: OfficeScene, view: ActorView, actor: OfficeGameActor): void {
  scene.stopActorAction(view)
  view.stateMachine.arrive(view.actorIndex)
  const action = view.stateMachine.current.action
  const chair = view.seatedGoal && view.chairId && scene.furniture.get(view.chairId)
  if (chair && scene.animationAtlasFor(actor)) {
    const direction = scene.furnitureDirection(scene.furnitureRotation(chair.image))
    const frame = `actor-${scene.actorAnimationKey(actor)}-sit-${direction === 'right' ? 'left' : direction}`
    const texture = `staff-seated-${actor.teamIndex}-frames`
    view.sprite.setTexture(texture, frame).setCrop().setFlipX(direction === 'right')
      .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
    view.seatedForeground.setTexture(texture, frame).setFlipX(direction === 'right')
      .setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
      .setTint(actor.presence === 'error' ? 0xff7777 : actor.presence === 'requestingHelp' ? 0xffd36a : 0xffffff)
  } else scene.restoreActorStandingPose(view)
  view.container.setScale(1)
  scene.updateActorDepth(view)
  scene.updateActorOverlayPosition(view)

  if (action !== 'eating' && action !== 'drinking') return
  if (!scene.animationAtlasFor(actor)) {
    view.stateMachine.completeAction()
    scene.setActorSpeech(view, '')
    return
  }
  view.pantryAction = { action, elapsedMs: 0, pose: 0 }
  scene.applyActorPantryPose(view)
  scene.setActorSpeech(view, action === 'drinking' ? '커피 마시는 중' : '간식 먹는 중')
}
export function applyActorPantryPose(scene: OfficeScene, view: ActorView): void {
  const state = view.pantryAction
  if (!state) return
  const id = scene.actorAnimationKey(view.actor)
  view.sprite.stop().setTexture(`staff-pantry-${id}-frames`, `actor-${id}-${state.action}-${state.pose}`)
    .setCrop().setFlipX(false).setVisible(true).setDisplaySize(ACTOR_SPRITE_WIDTH, ACTOR_SPRITE_HEIGHT)
    .setPosition(0, ACTOR_SPRITE_Y_OFFSET)
  view.seatedForeground.setVisible(false)
}
export function updateActorPantryActions(scene: OfficeScene, deltaMs: number): void {
  for (const view of scene.actors.values()) {
    const state = view.pantryAction
    if (!state) continue
    state.elapsedMs += deltaMs
    const pose = pantryPoseAt(state.action, state.elapsedMs)
    if (pose === null) {
      view.pantryAction = undefined
      view.stateMachine.completeAction()
      scene.restoreActorStandingPose(view)
      scene.setActorSpeech(view, '')
      scene.updateActor(view, scene.effectiveActor(view), view.actorIndex)
    } else if (pose !== state.pose) {
      state.pose = pose
      scene.applyActorPantryPose(view)
    }
  }
}
export function setActorSpeech(scene: OfficeScene, view: ActorView, text: string): void {
  view.bubble.setText(text).setVisible(Boolean(text))
  view.speechPanel.setVisible(Boolean(text))
  scene.updateActorOverlayPosition(view)
}
export function updateActorWorkAnimation(scene: OfficeScene, view: ActorView, deltaMs: number): void {
  const chair = view.settled && view.seatedGoal && view.chairId === `chair-${view.actor.teamIndex}-${view.actor.slotIndex}` &&
    scene.furniture.get(view.chairId)
  const atDesk = chair && !scene.layoutEditing && !view.pantryAction &&
    ['working', 'deskIdle', 'arriving'].includes(view.actor.presence) && scene.animationAtlasFor(view.actor) &&
    [...scene.furniture.values()].some((furniture) => furniture.frame === DESK_FURNITURE_FRAME && intersectsAabb(
      scene.furnitureWalkCollision(chair.image, 0), scene.furnitureWalkCollision(furniture.image, 16)))
  const texture = staffWorkTexture(view.actor.teamIndex)
  if (!atDesk) {
    view.workElapsedMs = 0
    if (view.seatedForeground.visible && view.seatedForeground.texture.key === texture) {
      scene.renderSeatedForeground(view.sprite, view.seatedForeground)
    }
    return
  }
  view.workElapsedMs += deltaMs
  const direction = scene.furnitureDirection(scene.furnitureRotation(chair.image))
  const offset = (view.actor.teamIndex * 5 + view.actor.slotIndex) * 137
  const pose = representativeWorkPoseAt(view.workElapsedMs + offset)
  const frame = `actor-${scene.actorAnimationKey(view.actor)}-work-${direction === 'right' ? 'left' : direction}-${pose}`
  const foreground = view.seatedForeground
  if (foreground.texture.key !== texture || foreground.frame.name !== frame) {
    foreground.setTexture(texture, frame).setFlipX(direction === 'right')
      .setDisplaySize(ACTOR_SPRITE_WIDTH * REPRESENTATIVE_WORK_FRAME_WIDTH / CHARACTER_FRAME_WIDTH, ACTOR_SPRITE_HEIGHT)
  }
}
export function updateActorDepth(scene: OfficeScene, view: ActorView): void {
  const chair = view.settled && view.seatedGoal && view.chairId && scene.furniture.get(view.chairId)
  let headDepth: number
  if (chair && scene.animationAtlasFor(view.actor)) {
    headDepth = scene.applySeatedComposition(chair, view.sprite, view.seatedForeground, view.container)
    scene.updateActorWorkAnimation(view, 0)
  } else {
    view.container.setDepth(view.container.y)
    view.sprite.setCrop().setVisible(true)
    view.seatedForeground.setVisible(false)
    headDepth = view.container.depth
  }
  view.overlay.setDepth(headDepth + OFFICE_WORLD_HEIGHT)
}
export function updateActorOverlayPosition(scene: OfficeScene, view: ActorView): void {
  view.overlay.setPosition(view.container.x, view.container.y)
  const above = view.container.y + view.sprite.y - view.sprite.displayHeight * view.sprite.originY - CEO_LABEL_GAP
  view.label.setPosition(view.sprite.x, above - view.container.y)
  const aboveBottom = above - view.label.displayHeight - 4
  const below = aboveBottom - SPEECH_BUBBLE_HEIGHT < 8
  const feet = view.container.y + view.sprite.y + view.sprite.displayHeight * (1 - view.sprite.originY)
  const bottom = (below ? feet + 8 + SPEECH_BUBBLE_HEIGHT : aboveBottom) - view.container.y
  const x = Phaser.Math.Clamp(view.container.x + view.sprite.x, SPEECH_BUBBLE_WIDTH / 2 + 8,
    OFFICE_WORLD_WIDTH - SPEECH_BUBBLE_WIDTH / 2 - 8) - view.container.x
  view.speechPanel.setPosition(x, bottom).setFlipY(below)
  view.bubble.setPosition(x, bottom - SPEECH_BUBBLE_HEIGHT * (below ? 0.38 : 0.62))
}
export function persistActor(scene: OfficeScene, actor: OfficeGameActor, view: ActorView): void {
  scene.worldSave = upsertSavedActor(scene.worldSave, {
    profileId: actor.profileId,
    x: Math.round(view.container.x),
    y: Math.round(view.container.y),
    presence: actor.presence,
    updatedAt: Date.now()
  })
  localStorage.setItem(OFFICE_WORLD_SAVE_KEY, JSON.stringify(scene.worldSave))
}
