import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { BrowserWindow, type WebContents } from 'electron'
import { MEETING_LEADS, MEETING_NAMES, meetingTranscript, validateMeetingDraft, type MeetingDraft, type MeetingEntry } from '../shared/meetingNotes'
import type { AgentInstance, MeetingReplyEvent } from '../shared/types'
import { workspaceFiles } from './workspaceStore'
import { instanceManager } from './instanceManager'
import { ptyManager } from './ptyManager'
import { taskRecovery } from './taskRecovery'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Discussion writes only reply receipts. Planning documents are created at meeting end. */
class MeetingDiscussion {
  private jobs = new Map<string, Promise<void>>()
  private teams = new Map<string, Promise<void>>()

  private emit(event: Omit<MeetingReplyEvent, 'instances'>): void {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('meetings:reply', { ...event, instances: instanceManager.list() })
  }

  ask(draft: MeetingDraft, questionId: string, sender: WebContents): void {
    validateMeetingDraft(draft)
    workspaceFiles().path(draft.projectPath)
    if (!draft.questions.includes(questionId)) throw new Error('회의 질문을 찾을 수 없습니다.')
    for (const templateId of MEETING_LEADS) {
      const event = { meetingId: draft.meetingId, questionId, templateId }
      const previous = draft.entries.find(entry => entry.questionId === questionId && entry.templateId === templateId)
      if (previous) { this.emit({ ...event, entry: previous }); continue }
      const key = `${draft.meetingId}:${questionId}:${templateId}`
      if (this.jobs.has(key)) continue
      // A lead handles one discussion turn at a time, in question order.
      const job = (this.teams.get(templateId) ?? Promise.resolve()).then(async () => {
        try { this.emit({ ...event, entry: await this.answer(draft, questionId, templateId, sender) }) }
        catch (error) { this.emit({ ...event, error: `${MEETING_NAMES[templateId]}: ${String(error)}` }) }
      }).finally(() => { this.jobs.delete(key); if (this.teams.get(templateId) === job) this.teams.delete(templateId) })
      this.jobs.set(key, job)
      this.teams.set(templateId, job)
    }
  }

  private async lead(draft: MeetingDraft, templateId: string, sender: WebContents): Promise<AgentInstance> {
    let instance = instanceManager.list().find(item => item.templateId === templateId && item.rank === 'teamLead')
    const items = instance
      ? await taskRecovery.ensureProject([instance.instanceId], draft.projectPath, sender)
      : await instanceManager.create(templateId, draft.projectPath, sender)
    instance = items.find(item => item.templateId === templateId && item.rank === 'teamLead')!
    if (ptyManager.getStates().some(state => state.ptyId === instance!.ptyId && state.state === 'error')) {
      instance = (await instanceManager.restart(instance.instanceId, sender)).find(item => item.profileId === instance!.profileId)!
    }
    return instance
  }

  private async answer(draft: MeetingDraft, questionId: string, templateId: string, sender: WebContents): Promise<MeetingEntry> {
    const files = workspaceFiles()
    const base = files.path(`.runtime/meetings/${draft.meetingId}/${questionId}-${templateId}`)
    const cached = files.path(`${base}.json`)
    if (existsSync(cached) && statSync(cached).size <= 128 * 1024) {
      try {
        const entry = JSON.parse(readFileSync(cached, 'utf8')) as MeetingEntry
        if (entry.questionId === questionId && entry.templateId === templateId && typeof entry.text === 'string' && entry.text.trim()) return entry
      } catch { /* An interrupted cache write must not prevent retrying the answer. */ }
    }
    const instance = await this.lead(draft, templateId, sender)
    this.emit({ meetingId: draft.meetingId, questionId, templateId })
    const deadline = Date.now() + 10 * 60_000
    // Preserve any development command already running in this session.
    while (ptyManager.getStates().some(state => state.ptyId === instance.ptyId && state.state === 'working') ||
      taskRecovery.hasActiveCommand(instance.ptyId)) {
      if (Date.now() > deadline) throw new Error('기존 작업이 진행 중입니다. 작업이 끝나면 답변을 다시 요청해주세요.')
      await delay(300)
    }
    const attemptId = randomUUID()
    const receipt = files.path(`${base}-${attemptId}.json`)
    mkdirSync(dirname(receipt), { recursive: true })
    const question = draft.entries.find(entry => entry.id === questionId)!
    const references = taskRecovery.list().filter(task => task.projectPath === draft.projectPath && task.stage !== 'cancelled').slice(-3)
      .map(task => `- ${task.title}\n  통합 SRS: ${task.specPath}\n  개발 기록: ${task.developmentLogPath}`).join('\n')
    const prompt = `[회의 질문 · ${MEETING_NAMES[templateId]}]\n프로젝트: ${draft.projectPath}\n` +
      `대표의 아래 질문에 본인의 의견이나 답변을 반드시 하나 작성하세요. 다른 에이전트를 대신하지 말고, 이유와 주의점도 간단히 설명하세요. 모르는 부분은 불확실하다고 밝히세요.\n` +
      `이것은 회의 질의응답입니다. 구현하거나 SRS를 만들지 마세요. 프로젝트와 참고 문서는 읽기만 하고 아래 답변 파일 외에는 생성·수정하지 마세요.\n` +
      `같은 프로젝트의 참고 문서(필요할 때 확인):\n${references || '(기존 기획 문서 없음)'}\n\n[회의 기록]\n${meetingTranscript(draft)}\n\n[답변할 질문]\n${question.text}\n\n` +
      `답변을 ${receipt}에 다음 형식의 JSON으로 저장하세요. answer에는 실제 한국어 답변을 넣으세요. 저장 후 답변을 출력하고 대기하세요.\n` +
      JSON.stringify({ meetingId: draft.meetingId, questionId, templateId, attemptId, answer: '실제 의견 또는 답변' })
    ptyManager.sendPrompt(instance.ptyId, prompt, attemptId)
    while (Date.now() <= deadline) {
      if (existsSync(receipt) && statSync(receipt).size <= 128 * 1024) {
        let result
        try { result = JSON.parse(readFileSync(receipt, 'utf8')) } catch { /* A write may still be in progress. */ }
        if (result?.meetingId === draft.meetingId && result.questionId === questionId && result.templateId === templateId &&
          result.attemptId === attemptId && typeof result.answer === 'string' && result.answer.trim()) {
          const entry: MeetingEntry = { id: `${questionId}:${templateId}`, questionId, templateId, author: MEETING_NAMES[templateId],
            text: result.answer.trim(), createdAt: new Date().toISOString() }
          const temporary = files.path(`${cached}.tmp`)
          writeFileSync(temporary, JSON.stringify(entry), 'utf8')
          renameSync(temporary, cached)
          return entry
        }
      }
      const state = ptyManager.getStates().find(item => item.ptyId === instance.ptyId)
      if (!state || state.state === 'error' || state.state === 'exited') throw new Error('CLI 응답이 중단되었습니다. 답변 다시 받기를 눌러주세요.')
      await delay(300)
    }
    ptyManager.cancelPrompt(instance.ptyId)
    throw new Error('답변 대기 시간이 지났습니다. CLI 상태를 확인한 뒤 답변 다시 받기를 눌러주세요.')
  }
}

export const meetingDiscussion = new MeetingDiscussion()
