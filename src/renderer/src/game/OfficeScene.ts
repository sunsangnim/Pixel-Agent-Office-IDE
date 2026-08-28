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
import officeArchitectureBackground from '../assets/pixel-office/office-architecture-background-v1.png'
import officeFurnitureAtlas from '../assets/pixel-office/office-furniture-atlas-v1.png'
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
  prop: Phaser.GameObjects.Rectangle
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
    this.load.image('office-architecture-background', officeArchitectureBackground)
    this.load.image('office-furniture-atlas', officeFurnitureAtlas)
  }

  create(): void {
    this.worldSave = parseOfficeWorldSave(localStorage.getItem(OFFICE_WORLD_SAVE_KEY))
    this.cameras.main.setBackgroundColor('#17221f')
    this.createFurnitureFrames()
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
    this.add.image(OFFICE_WORLD_WIDTH / 2, OFFICE_WORLD_HEIGHT / 2, 'office-architecture-background')
      .setDisplaySize(OFFICE_WORLD_WIDTH, OFFICE_WORLD_HEIGHT)
      .setDepth(0)

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

  private createFurnitureFrames(): void {
    const texture = this.textures.get('office-furniture-atlas')
    const source = texture.getSourceImage() as HTMLImageElement
    const frameWidth = Math.floor(source.width / 5)
    const frameHeight = Math.floor(source.height / 4)
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        texture.add(`furniture-${row * 5 + column}`, 0, column * frameWidth, row * frameHeight, frameWidth, frameHeight)
      }
    }
  }

  private addFurniture(frame: number, x: number, y: number, width: number, height: number, depth = y): Phaser.GameObjects.Image {
    return this.add.image(x, y, 'office-furniture-atlas', `furniture-${frame}`)
      .setDisplaySize(width, height)
      .setDepth(depth)
  }

  private createRoom(x: number, y: number, width: number, height: number, label: string): void {
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
    this.addFurniture(0, 65, 105, 70, 82, 40)
    this.addFurniture(1, 145, 98, 62, 105, 40)
    this.addFurniture(2, 220, 108, 105, 70, 40)
    this.createDoor('pantry', WAYPOINTS.pantryDoor.x, 200, 34, 46)
  }

  private createMeetingRoom(): void {
    this.addFurniture(6, 480, 128, 270, 118, 80)
    this.addFurniture(5, 480, 52, 135, 48, 35)
    this.createDoor('meeting', WAYPOINTS.meetingDoor.x, 200, 36, 46)
  }

  private createEntrance(): void {
    this.createDoor('elevator', WAYPOINTS.elevatorInside.x, 94, 84, 112)
    this.addFurniture(15, 735, 125, 45, 70, 40)
    this.addFurniture(15, 905, 125, 45, 70, 40)
  }

  private createRepresentativeRoom(): void {
    this.addFurniture(15, 760, 580, 48, 70, 580)
    this.addFurniture(16, 805, 592, 48, 42, 592)
    this.addFurniture(17, 895, 455, 82, 48, 455)
    this.addFurniture(18, 842, 455, 32, 62, 455)
    this.addFurniture(19, 912, 568, 48, 86, 568)
    this.addFurniture(10, 835, 515, 100, 58, 515)
  }

  private createDesks(): void {
    TEAM_DESKS.forEach((team, teamIndex) => team.forEach((point, slotIndex) => {
      this.addFurniture(10, point.x, point.y + 12, 92, 58, point.y + 5)
      this.addFurniture(12 + teamIndex, point.x, point.y + 38, 38, 42, point.y + 45)
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
    ).setDisplaySize(animationAtlas ? 90 : 50, animationAtlas ? 90 : 68)
      .setY(animationAtlas ? -35 : -27)
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
    const prop = this.add.rectangle(12, -20, 7, 9, 0x6eb6d9)
      .setStrokeStyle(2, 0x294a5a).setVisible(false)
    const saved = this.worldSave.actors.find((candidate) => candidate.profileId === actor.profileId)
    const initial = saved ?? { x: WAYPOINTS.elevatorInside.x, y: WAYPOINTS.elevatorInside.y }
    const container = this.add.container(initial.x, initial.y, [sprite, label, bubble, prop]).setDepth(initial.y)
    const view = { container, sprite, bubble, prop, routeKey: '', stateMachine: new ActorStateMachine(actor.presence) }
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
    view.prop.setVisible(false)
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
    const action = view.stateMachine.current.action
    if (this.animationAtlasFor(actor.rosterIndex)) {
      view.sprite.play(`actor-${actor.rosterIndex}-${action === 'working' ? 'work' : 'idle'}`, true)
    }
    view.prop.setVisible(false)
    const animatedActor = Boolean(this.animationAtlasFor(actor.rosterIndex))
    view.sprite.setDisplaySize(animatedActor ? (action === 'working' ? 106 : 90) : (action === 'working' ? 76 : 50), animatedActor ? 90 : 68)
    view.sprite.setY(action === 'sitting' ? (animatedActor ? -30 : -20) : (animatedActor ? -35 : -27))
    if (action === 'sitting') {
      const seatIndex = actorIndex % MEETING_SEATS.length
      view.container.setDepth(view.container.y + (seatIndex < 4 ? -4 : 8))
      view.container.setScale(1, 0.86)
      return
    }
    if (!['working', 'pantry', 'meeting', 'requestingHelp', 'error'].includes(actor.presence)) return
    if (action === 'eating' || action === 'drinking') {
      const drinking = action === 'drinking'
      view.prop.setFillStyle(drinking ? 0x6eb6d9 : 0xd99a45)
        .setStrokeStyle(2, drinking ? 0x294a5a : 0x70431f)
        .setSize(drinking ? 7 : 9, drinking ? 10 : 7)
        .setPosition(12, -20)
        .setVisible(true)
      view.actionTween = this.tweens.add({
        targets: view.prop,
        x: 7,
        y: -43,
        duration: 260,
        hold: 140,
        yoyo: true,
        repeat: 2,
        ease: 'Stepped',
        easeParams: [3],
        onComplete: () => {
          view.prop.setVisible(false)
          view.stateMachine.completeAction()
        }
      })
      return
    }
    view.actionTween = this.tweens.add({
      targets: view.sprite,
      y: actor.presence === 'working' ? -29 : -25,
      duration: actor.presence === 'error' ? 150 : 420,
      yoyo: true,
      repeat: -1,
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
