import type { MeetingDraft } from '@shared/meetingNotes'
import { MEETING_CHECKPOINT_KEY, MEETING_QUEUE_KEY, readStoredJson, type HeldMeetingPrompt } from './meetingCheckpoint'

export const MEETING_NOTES_KEY = 'pixel-office:meeting-notes-v1'

export function readMeetingDraft(storage: Pick<Storage, 'getItem'>): MeetingDraft | null {
  const saved = readStoredJson<MeetingDraft | null>(storage.getItem(MEETING_NOTES_KEY), null)
  if (saved && Array.isArray(saved.entries) && Array.isArray(saved.questions) && saved.errors) return saved
  // Preserve statements queued by older versions; never replay them separately.
  const queued = readStoredJson<HeldMeetingPrompt[]>(storage.getItem(MEETING_QUEUE_KEY), [])
  if (!Array.isArray(queued) || !queued.length) return null
  const startedAt = readStoredJson<{ startedAt?: string }>(storage.getItem(MEETING_CHECKPOINT_KEY), {}).startedAt ?? new Date().toISOString()
  return { meetingId: crypto.randomUUID(), projectPath: '', startedAt, questions: [], errors: {},
    entries: queued.filter(item => typeof item.text === 'string').map(item => ({ id: crypto.randomUUID(), text: item.text, author: '대표', createdAt: startedAt })) }
}
