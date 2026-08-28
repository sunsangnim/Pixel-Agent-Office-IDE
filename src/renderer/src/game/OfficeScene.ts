import Phaser from 'phaser'
import row1 from '../assets/pixel-office/corporate-roster-row-1-v1.png'
import row2 from '../assets/pixel-office/corporate-roster-row-2-v1.png'
import row3 from '../assets/pixel-office/corporate-roster-row-3-v1.png'
import row4 from '../assets/pixel-office/corporate-roster-row-4-v1.png'
import ceoAnimationSheet from '../assets/pixel-office/ceo-animation-sheet-v2.png'
import codexTeamAnimationAtlas from '../assets/pixel-office/codex-team-animation-atlas-v1.png'
import antigravityTeamAnimationAtlas from '../assets/pixel-office/antigravity-team-animation-atlas-v1.png'
import rosterRow4AnimationAtlas from '../assets/pixel-office/roster-row-4-animation-atlas-v1.png'
import claudeTeamAnimationAtlas from '../assets/pixel-office/claude-team-animation-atlas-v1.png'
import {
  MEETING_SEATS,
  OFFICE_WORLD_HEIGHT,
  OFFICE_WORLD_WIDTH,
  TEAM_DESKS,
  WAYPOINTS,
  routeFor,
  type OfficeGameActor,
  type OfficeWorldSnapshot,
  type WorldPoint
} from './officeWorld'
import { findOfficePath } from './navigation'
import { ActorStateMachine } from './actorStateMachine'
import { OFFICE_WORLD_SAVE_KEY, parseOfficeWorldSave, upsertSavedActor, type OfficeWorldSave } from './worldPersistence'

interface ActorView {
  container: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Sprite
  bubble: Phaser.GameObjects.Text
  routeKey: string
  actionTween?: Phaser.Tweens.Tween
  stateMachine: ActorStateMachine
}

interface DoorView {
  left: Phaser.GameObjects.Rectangle
  right: Phaser.GameObjects.Rectangle
  isOpen: boolean
}

export const OFFICE_SCENE_KEY = 'office-scene'
export const OFFICE_ACTOR_SELECT_EVENT = 'office:actor-select'

export class OfficeScene extends Phaser.Scene {
  private actors = new Map<string, ActorView>()
  private snapshot: OfficeWorldSnapshot | null = null
  private pendingSnapshot: OfficeWorldSnapshot | null = null
  private doors = new Map<string, DoorView>()
  private worldSave: OfficeWorldSave = { version: 1, actors: [] }
  private actorSelectHandler: ((profileId: string) => void) | null = null

  constructor() {
    super(OFFICE_SCENE_KEY)
  }

  setActorSelectHandler(handler: ((profileId: string) => void) | null): void {
    this.actorSelectHandler = handler
  }

  preload(): void {
    ;[row1, row2, row3, row4].forEach((url, index) => this.load.image(`roster-row-${index}`, url))
    this.load.image('ceo-animation-sheet', ceoAnimationSheet)
    this.load.image('codex-team-animation-atlas', codexTeamAnimationAtlas)
    this.load.image('antigravity-team-animation-atlas', antigravityTeamAnimationAtlas)
    this.load.image('roster-row-4-animation-atlas', rosterRow4AnimationAtlas)
    this.load.image('claude-team-animation-atlas', claudeTeamAnimationAtlas)
  }

  create(): void {
    this.worldSave = parseOfficeWorldSave(localStorage.getItem(OFFICE_WORLD_SAVE_KEY))
    this.cameras.main.setBackgroundColor('#17221f')
    this.createWorld()
    this.createRosterFrames()
    this.createTeamAnimations()
    this.createCeoAnimations()
    this.createRepresentativeActor()
    if (this.pendingSnapshot) this.applySnapshot(this.pendingSnapshot)
  }

  updateSnapshot(snapshot: OfficeWorldSnapshot): void {
    if (!this.sys || !this.sys.isActive()) {
      this.pendingSnapshot = snapshot
      return
    }
    this.applySnapshot(snapshot)
  }

  private createWorld(): void {
    const graphics = this.add.graphics()
    graphics.fillStyle(0xa9d7c7).fillRect(0, 0, OFFICE_WORLD_WIDTH, OFFICE_WORLD_HEIGHT)
    graphics.lineStyle(2, 0x86b8aa, 0.42)
    for (let x = 0; x <= OFFICE_WORLD_WIDTH; x += 16) graphics.lineBetween(x, 0, x, OFFICE_WORLD_HEIGHT)
    for (let y = 0; y <= OFFICE_WORLD_HEIGHT; y += 16) graphics.lineBetween(0, y, OFFICE_WORLD_WIDTH, y)

    this.createRoom(8, 8, 280, 205, '탕비실')
    this.createRoom(296, 8, 370, 205, '회의실')
    this.createRoom(674, 8, 278, 205, '출입구')
    this.createRoom(725, 405, 227, 227, '대표실')

    this.createPantry()
    this.createMeetingRoom()
    this.createEntrance()
    this.createRepresentativeRoom()
    this.createDesks()
  }

  private createRoom(x: number, y: number, width: number, height: number, label: string): void {
    this.add.rectangle(x + width / 2, y + height / 2, width, height, 0xd5ebe4, 0.72)
      .setStrokeStyle(5, 0x587a71).setDepth(5)
    this.add.text(x + 10, y + 8, label, {
      fontFamily: 'monospace', fontSize: '12px', color: '#17362e', backgroundColor: '#dff3ed'
    }).setPadding(4, 2).setDepth(800)
  }

  private createDoor(id: string, x: number, y: number, width: number, height: number): void {
    this.add.rectangle(x, y, width + 8, height + 8, 0x30443e).setDepth(30)
    const left = this.add.rectangle(x - width / 4, y, width / 2, height, 0x8fa8a1).setDepth(32)
    const right = this.add.rectangle(x + width / 4, y, width / 2, height, 0x839b94).setDepth(32)
    this.doors.set(id, { left, right, isOpen: false })
  }

  private setDoorOpen(id: string, open: boolean): void {
    const door = this.doors.get(id)
    if (!door || door.isOpen === open) return
    door.isOpen = open
    const halfWidth = door.left.width
    this.tweens.killTweensOf([door.left, door.right])
    this.tweens.add({
      targets: door.left,
      x: door.left.x + (open ? -halfWidth : halfWidth),
      duration: 260,
      ease: 'Stepped',
      easeParams: [4]
    })
    this.tweens.add({
      targets: door.right,
      x: door.right.x + (open ? halfWidth : -halfWidth),
      duration: 260,
      ease: 'Stepped',
      easeParams: [4]
    })
  }

  private createPantry(): void {
    this.add.rectangle(65, 100, 72, 58, 0xc6d2d0).setStrokeStyle(3, 0x5f726d).setDepth(20)
    this.add.rectangle(145, 76, 45, 90, 0xb7c7c8).setStrokeStyle(3, 0x657679).setDepth(20)
    this.add.rectangle(220, 105, 70, 45, 0x9c6843).setStrokeStyle(3, 0x65432f).setDepth(20)
    this.add.text(45, 92, 'COFFEE', { fontFamily: 'monospace', fontSize: '9px', color: '#385a50' }).setDepth(21)
    this.createDoor('pantry', WAYPOINTS.pantryDoor.x, 200, 34, 46)
  }

  private createMeetingRoom(): void {
    this.add.rectangle(480, 128, 245, 58, 0xa97043).setStrokeStyle(4, 0x69442e).setDepth(20)
    MEETING_SEATS.forEach((seat) => {
      this.add.rectangle(seat.x, seat.y, 24, 14, 0x52656a).setStrokeStyle(2, 0x2e4145).setDepth(seat.y - 1)
    })
    this.add.rectangle(480, 45, 125, 42, 0x26343a).setStrokeStyle(4, 0x60747b).setDepth(20)
    this.createDoor('meeting', WAYPOINTS.meetingDoor.x, 200, 36, 46)
  }

  private createEntrance(): void {
    this.createDoor('elevator', WAYPOINTS.elevatorInside.x, 94, 84, 112)
    this.add.rectangle(735, 115, 34, 68, 0x567d55).setStrokeStyle(3, 0x31533a).setDepth(40)
    this.add.rectangle(905, 115, 34, 68, 0x567d55).setStrokeStyle(3, 0x31533a).setDepth(40)
  }

  private createRepresentativeRoom(): void {
    this.add.rectangle(760, 580, 40, 62, 0x3f7e4d).setStrokeStyle(3, 0x285235).setDepth(580)
    this.add.rectangle(805, 592, 44, 32, 0x8c5f3c).setStrokeStyle(3, 0x593b2b).setDepth(592)
    this.add.rectangle(895, 455, 92, 38, 0x455568).setStrokeStyle(3, 0x293744).setDepth(455)
    this.add.rectangle(842, 455, 18, 52, 0xd5b858).setStrokeStyle(2, 0x745e2d).setDepth(455)
    this.add.rectangle(912, 568, 34, 78, 0x7b4d31).setStrokeStyle(3, 0x493020).setDepth(568)
    this.add.rectangle(835, 515, 92, 42, 0xa97043).setStrokeStyle(3, 0x65432f).setDepth(515)
  }

  private createDesks(): void {
    const colors = [0x9b6c50, 0x4c827b, 0x6e5a91]
    TEAM_DESKS.forEach((team, teamIndex) => team.forEach((point, slotIndex) => {
      this.add.rectangle(point.x, point.y + 16, 86, 26, 0xc18b59).setStrokeStyle(3, 0x765238).setDepth(point.y + 5)
      this.add.rectangle(point.x, point.y - 1, 31, 23, 0x42545a).setStrokeStyle(3, 0x26363a).setDepth(point.y)
      this.add.rectangle(point.x, point.y + 35, 28, 14, colors[teamIndex]).setStrokeStyle(2, 0x34413e).setDepth(point.y + 45)
      if (slotIndex === 0) this.add.text(point.x - 36, point.y - 45, ['Claude', 'Codex', 'Antigravity'][teamIndex], {
        fontFamily: 'monospace', fontSize: '10px', color: '#24473e'
      }).setDepth(700)
    }))
  }

  private createRosterFrames(): void {
    for (let row = 0; row < 4; row += 1) {
      const texture = this.textures.get(`roster-row-${row}`)
      const source = texture.getSourceImage() as HTMLImageElement
      const cellWidth = Math.floor(source.width / 5)
      for (let column = 0; column < 5; column += 1) {
        texture.add(`${row * 5 + column}`, 0, column * cellWidth, 0, cellWidth, source.height)
      }
    }
  }

  private createTeamAnimations(): void {
    const states = ['idle', 'walk-down', 'walk-up', 'work'] as const
    const atlases = [
      { key: 'claude-team-animation-atlas', start: 0 },
      { key: 'codex-team-animation-atlas', start: 5 },
      { key: 'antigravity-team-animation-atlas', start: 10 },
      { key: 'roster-row-4-animation-atlas', start: 15 }
    ]
    atlases.forEach(({ key, start }) => {
      const texture = this.textures.get(key)
      const source = texture.getSourceImage() as HTMLImageElement
      const frameWidth = Math.floor(source.width / 5)
      const frameHeight = Math.floor(source.height / 4)
      for (let column = 0; column < 5; column += 1) {
        const rosterIndex = column + start
      states.forEach((state, row) => {
        texture.add(`actor-${rosterIndex}-${state}`, 0, column * frameWidth, row * frameHeight, frameWidth, frameHeight)
      })
      this.anims.create({
        key: `actor-${rosterIndex}-idle`,
        frames: [{ key, frame: `actor-${rosterIndex}-idle` }],
        frameRate: 2,
        repeat: -1
      })
      this.anims.create({
        key: `actor-${rosterIndex}-walk-down`,
        frames: [
          { key, frame: `actor-${rosterIndex}-idle` },
          { key, frame: `actor-${rosterIndex}-walk-down` }
        ],
        frameRate: 6,
        repeat: -1,
        yoyo: true
      })
      this.anims.create({
        key: `actor-${rosterIndex}-walk-up`,
        frames: [{ key, frame: `actor-${rosterIndex}-walk-up` }],
        frameRate: 6,
        repeat: -1
      })
      this.anims.create({
        key: `actor-${rosterIndex}-work`,
        frames: [{ key, frame: `actor-${rosterIndex}-work` }],
        frameRate: 3,
        repeat: -1
      })
      }
    })
  }

  private animationAtlasFor(rosterIndex: number): string | null {
    if (rosterIndex >= 1 && rosterIndex <= 4) return 'claude-team-animation-atlas'
    if (rosterIndex >= 5 && rosterIndex <= 9) return 'codex-team-animation-atlas'
    if (rosterIndex >= 10 && rosterIndex <= 14) return 'antigravity-team-animation-atlas'
    if (rosterIndex >= 15 && rosterIndex <= 19) return 'roster-row-4-animation-atlas'
    return null
  }

  private createRepresentativeActor(): void {
    const sprite = this.add.sprite(835, 478, 'ceo-animation-sheet', 'ceo-work-0').setDisplaySize(94, 78).setDepth(490)
    sprite.play('ceo-work')
    this.add.text(835, 505, '김태호 대표', {
      fontFamily: 'monospace', fontSize: '8px', color: '#17362e', backgroundColor: '#e7f3ef'
    }).setOrigin(0.5, 0).setPadding(2, 1).setDepth(700)
  }

  private createCeoAnimations(): void {
    const texture = this.textures.get('ceo-animation-sheet')
    const source = texture.getSourceImage() as HTMLImageElement
    const frameWidth = Math.floor(source.width / 8)
    const frameHeight = Math.floor(source.height / 6)
    const rowNames = ['idle', 'walk-down', 'walk-up', 'walk-left', 'work', 'interact']
    rowNames.forEach((name, row) => {
      const frames: string[] = []
      for (let column = 0; column < 8; column += 1) {
        const frameName = `ceo-${name}-${column}`
        texture.add(frameName, 0, column * frameWidth, row * frameHeight, frameWidth, frameHeight)
        frames.push(frameName)
      }
      this.anims.create({
        key: `ceo-${name}`,
        frames: frames.map((frame) => ({ key: 'ceo-animation-sheet', frame })),
        frameRate: name === 'idle' ? 4 : 8,
        repeat: name === 'interact' ? 0 : -1
      })
    })
  }

  private applySnapshot(snapshot: OfficeWorldSnapshot): void {
    this.snapshot = snapshot
    this.pendingSnapshot = null
    const pantryOpen = snapshot.actors.some((actor) => actor.presence === 'pantry' || actor.presence === 'pantryDoor')
    const meetingOpen = snapshot.meetingActive || snapshot.actors.some((actor) => actor.presence === 'meeting' || actor.presence === 'meetingDoor')
    this.setDoorOpen('elevator', snapshot.elevatorOpen)
    this.setDoorOpen('pantry', pantryOpen)
    this.setDoorOpen('meeting', meetingOpen)

    const activeIds = new Set(snapshot.actors.filter((actor) => actor.presence !== 'offDuty').map((actor) => actor.profileId))
    for (const [id, view] of this.actors) {
      if (!activeIds.has(id)) {
        view.container.destroy(true)
        this.actors.delete(id)
      }
    }

    snapshot.actors.forEach((actor, index) => {
      if (actor.presence === 'offDuty') return
      const view = this.actors.get(actor.profileId) ?? this.createActor(actor)
      this.updateActor(view, actor, index)
    })
  }

  private createActor(actor: OfficeGameActor): ActorView {
    const row = Math.floor(actor.rosterIndex / 5)
    const frame = String(actor.rosterIndex)
    const animationAtlas = this.animationAtlasFor(actor.rosterIndex)
    const sprite = this.add.sprite(
      0,
      -27,
      animationAtlas ?? `roster-row-${row}`,
      animationAtlas ? `actor-${actor.rosterIndex}-idle` : frame
    ).setDisplaySize(50, 68)
    if (animationAtlas) sprite.play(`actor-${actor.rosterIndex}-idle`)
    sprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.actorSelectHandler?.(actor.profileId)
    })
    const label = this.add.text(0, 16, actor.displayName, {
      fontFamily: 'monospace', fontSize: '8px', color: '#18352e', backgroundColor: '#e7f3ef'
    }).setOrigin(0.5, 0).setPadding(2, 1)
    const bubble = this.add.text(18, -68, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#26332f', backgroundColor: '#fff7df'
    }).setPadding(3, 2).setVisible(false)
    const saved = this.worldSave.actors.find((candidate) => candidate.profileId === actor.profileId)
    const initial = saved ?? { x: WAYPOINTS.elevatorInside.x, y: WAYPOINTS.elevatorInside.y }
    const container = this.add.container(initial.x, initial.y, [sprite, label, bubble]).setDepth(initial.y)
    const view = { container, sprite, bubble, routeKey: '', stateMachine: new ActorStateMachine(actor.presence) }
    this.actors.set(actor.profileId, view)
    return view
  }

  private updateActor(view: ActorView, actor: OfficeGameActor, actorIndex: number): void {
    if (!view.stateMachine.requestPresence(actor.presence)) return
    const waypoints = routeFor(actor, actorIndex)
    const route: WorldPoint[] = []
    let cursor = { x: view.container.x, y: view.container.y }
    for (const waypoint of waypoints) {
      const segment = findOfficePath(cursor, waypoint)
      route.push(...segment)
      cursor = waypoint
    }
    const routeKey = `${actor.presence}:${route.map((point) => `${point.x},${point.y}`).join('|')}`
    const actionLabels: Partial<Record<OfficeGameActor['presence'], string>> = {
      working: '업무 중', pantry: actorIndex % 2 ? '음료' : '간식', meeting: '회의',
      requestingHelp: '도움 필요!', error: '오류!'
    }
    const label = actionLabels[actor.presence]
    view.bubble.setText(label ?? '').setVisible(Boolean(label))
    view.sprite.setTint(actor.presence === 'error' ? 0xff7777 : actor.presence === 'requestingHelp' ? 0xffd36a : 0xffffff)
    view.container.setScale(1, actor.presence === 'working' || actor.presence === 'meeting' ? 0.92 : 1)
    if (view.routeKey === routeKey) return
    view.routeKey = routeKey
    this.tweens.killTweensOf(view.container)
    view.actionTween?.stop()
    if (route.length === 0) return
    this.moveRoute(view, route, 0, actor)
  }

  private moveRoute(view: ActorView, route: WorldPoint[], index: number, actor: OfficeGameActor): void {
    const point = route[index]
    if (!point) {
      this.startActionAnimation(view, actor)
      return
    }
    const distance = Phaser.Math.Distance.Between(view.container.x, view.container.y, point.x, point.y)
    const duration = Math.max(180, distance * 3.1)
    view.stateMachine.startWalking(point.x - view.container.x, point.y - view.container.y)
    view.sprite.setFlipX(point.x < view.container.x)
    if (this.animationAtlasFor(actor.rosterIndex)) {
      const vertical = Math.abs(point.y - view.container.y) > Math.abs(point.x - view.container.x)
      const animation = vertical && point.y < view.container.y ? 'walk-up' : 'walk-down'
      view.sprite.play(`actor-${actor.rosterIndex}-${animation}`, true)
    }
    this.tweens.add({
      targets: view.container,
      x: point.x,
      y: point.y,
      duration,
      ease: 'Linear',
      onUpdate: () => view.container.setDepth(view.container.y),
      onComplete: () => {
        this.persistActor(actor, view)
        this.moveRoute(view, route, index + 1, actor)
      }
    })
  }

  private startActionAnimation(view: ActorView, actor: OfficeGameActor): void {
    const actorIndex = this.snapshot?.actors.findIndex((candidate) => candidate.profileId === actor.profileId) ?? 0
    view.stateMachine.arrive(actorIndex)
    if (this.animationAtlasFor(actor.rosterIndex)) {
      view.sprite.play(`actor-${actor.rosterIndex}-${actor.presence === 'working' ? 'work' : 'idle'}`, true)
    }
    if (!['working', 'pantry', 'meeting', 'requestingHelp', 'error'].includes(actor.presence)) return
    view.actionTween = this.tweens.add({
      targets: view.sprite,
      y: actor.presence === 'working' ? -29 : -25,
      duration: actor.presence === 'error' ? 150 : 420,
      yoyo: true,
      repeat: actor.presence === 'pantry' ? 2 : -1,
      ease: 'Stepped',
      easeParams: [2],
      onComplete: () => view.stateMachine.completeAction()
    })
  }

  private persistActor(actor: OfficeGameActor, view: ActorView): void {
    this.worldSave = upsertSavedActor(this.worldSave, {
      profileId: actor.profileId,
      x: Math.round(view.container.x),
      y: Math.round(view.container.y),
      presence: actor.presence,
      updatedAt: Date.now()
    })
    localStorage.setItem(OFFICE_WORLD_SAVE_KEY, JSON.stringify(this.worldSave))
  }
}
