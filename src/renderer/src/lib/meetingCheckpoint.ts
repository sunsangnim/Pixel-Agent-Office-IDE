import type { AgentRuntimeState, OfficePresence } from '@shared/types'

export const MEETING_CHECKPOINT_KEY = 'pixel-office:meeting-checkpoint'
export const MEETING_QUEUE_KEY = 'pixel-office:meeting-queue'

export interface MeetingSessionCheckpoint {
  instanceId: string
  ptyId: string
  runtimeState: AgentRuntimeState | 'idle'
  previousPresence: OfficePresence
  task: string
  bufferLength: number
}

export interface MeetingCheckpoint {
  startedAt: string
  sessions: MeetingSessionCheckpoint[]
}

export interface HeldMeetingPrompt {
  text: string
  targetIds: string[]
}

export function presenceForRuntime(state: AgentRuntimeState | 'idle'): OfficePresence {
  if (state === 'working' || state === 'starting') return 'working'
  if (state === 'waiting') return 'requestingHelp'
  if (state === 'error') return 'error'
  if (state === 'exited') return 'offDuty'
  return 'deskIdle'
}

export function readStoredJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
