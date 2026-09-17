export const MEETING_LEADS = ['claude-code', 'codex-cli', 'antigravity-cli'] as const
export const MEETING_NAMES: Record<string, string> = { 'claude-code': 'Claude 부장', 'codex-cli': 'Codex 차장', 'antigravity-cli': 'Antigravity 과장' }

export interface MeetingEntry {
  id: string
  text: string
  author: string
  createdAt: string
  questionId?: string
  templateId?: string
}

export interface MeetingDraft {
  meetingId: string
  projectPath: string
  startedAt: string
  endedAt?: string
  entries: MeetingEntry[]
  questions: string[]
  errors: Record<string, string>
}

export function isMeetingQuestion(text: string): boolean {
  return /[?？]|질문|의견|어때|어떨|어떤|어떻게|왜\s|왜요|무엇|뭐가|뭘|추천|알려\s*줘|설명해|생각(?:해|하|은)|가능(?:해|한가|할까)|괜찮(?:아|을까)|맞(?:아|나요|을까)|할\s*수\s*있/.test(text)
}

export function pendingMeetingQuestions(draft: MeetingDraft): string[] {
  return draft.questions.filter(id => !MEETING_LEADS.every(templateId => draft.entries.some(entry => entry.questionId === id && entry.templateId === templateId)))
}

export function meetingTranscript(draft: MeetingDraft): string {
  return draft.entries.map((entry, index) => `${index + 1}. ${entry.author}${entry.questionId && !entry.templateId ? ' (질문)' : ''}\n${entry.text}`).join('\n\n')
}

export function meetingPlanningRequest(draft: MeetingDraft): string {
  const project = draft.projectPath.split(/[\\/]/).pop() || '프로젝트'
  return `${project} 회의 — 통합 SRS 작성\n\n회의 시작: ${draft.startedAt}\n회의 종료: ${draft.endedAt}\n\n` +
    `아래 회의 전체를 하나의 기획으로 정리하세요. 발언을 별도 작업으로 나누거나 문서를 여러 개 만들지 마세요.\n` +
    `대표의 최종 결정과 뒤에 나온 정정·취소를 우선하고, 에이전트 의견은 제안으로 구분하세요. 의견을 대표가 승인한 요구사항으로 단정하지 마세요.\n` +
    `회의 요약, 결정 사항, SRS·PRD·화면설계, 범위와 제외 범위, 제약, 검증 가능한 인수 조건, Phase를 작성하세요. 상충되거나 결정되지 않은 사항은 확인할 질문으로 남기세요.\n` +
    `기획 작성까지만 진행하고 구현은 대표의 명시적 승인을 기다리세요.\n\n[회의 발언 전체]\n${meetingTranscript(draft)}`
}

export function validateMeetingDraft(draft: MeetingDraft): void {
  if (!draft || !/^[\da-f-]{36}$/.test(draft.meetingId) || typeof draft.projectPath !== 'string' || !draft.projectPath ||
    !Number.isFinite(Date.parse(draft.startedAt)) || !Array.isArray(draft.entries) || !Array.isArray(draft.questions) ||
    !draft.entries.every(entry => entry && typeof entry.id === 'string' && typeof entry.text === 'string' && entry.text.trim() && typeof entry.author === 'string') ||
    !draft.questions.every(id => /^[\da-f-]{36}$/.test(id) && draft.entries.some(entry => entry.id === id && !entry.templateId))) {
    throw new Error('회의 기록을 확인할 수 없습니다.')
  }
}
