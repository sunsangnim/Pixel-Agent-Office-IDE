import type { OfficePresence } from '@shared/types'

export type ActorFacing = 'up' | 'down' | 'left' | 'right'
export type ActorAction = 'idle' | 'walking' | 'working' | 'eating' | 'drinking' | 'sitting' | 'help' | 'error'

export interface ActorState {
  presence: OfficePresence
  action: ActorAction
  facing: ActorFacing
  actionLocked: boolean
}

export class ActorStateMachine {
  private state: ActorState
  private queuedPresence: OfficePresence | null = null

  constructor(initialPresence: OfficePresence = 'offDuty') {
    this.state = { presence: initialPresence, action: 'idle', facing: 'down', actionLocked: false }
  }

  get current(): Readonly<ActorState> {
    return this.state
  }

  requestPresence(presence: OfficePresence): boolean {
    if (this.state.actionLocked && presence !== this.state.presence) {
      this.queuedPresence = presence
      return false
    }
    this.state = { ...this.state, presence }
    return true
  }

  startWalking(dx: number, dy: number): void {
    if (this.state.actionLocked) return
    this.state = {
      ...this.state,
      action: 'walking',
      facing: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')
    }
  }

  arrive(actorIndex: number): void {
    const action = actionForPresence(this.state.presence, actorIndex)
    this.state = { ...this.state, action, actionLocked: action === 'eating' || action === 'drinking' }
  }

  completeAction(): OfficePresence | null {
    this.state = { ...this.state, actionLocked: false }
    const queued = this.queuedPresence
    this.queuedPresence = null
    if (queued) this.requestPresence(queued)
    return queued
  }
}

export function actionForPresence(presence: OfficePresence, actorIndex: number): ActorAction {
  if (presence === 'working') return 'working'
  if (presence === 'pantry') return actorIndex % 2 === 0 ? 'eating' : 'drinking'
  if (presence === 'meeting') return 'sitting'
  if (presence === 'requestingHelp') return 'help'
  if (presence === 'error') return 'error'
  if (presence === 'arriving' || presence === 'pantryDoor' || presence === 'meetingDoor') return 'walking'
  return 'idle'
}
