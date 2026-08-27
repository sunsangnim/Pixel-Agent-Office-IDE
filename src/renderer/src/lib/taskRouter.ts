import { BUILT_IN_TEAM_IDS } from '@shared/orchestrationPolicy'

export interface DispatchPlan {
  templateIds: string[]
  complexity: 'simple' | 'complex'
  reason: string
}

const COMPLEX_MARKERS = ['병렬', '분담', '전체', '아키텍처', '마이그레이션', '리팩터링', '통합 테스트', 'orchestrat']

export function planTask(text: string): DispatchPlan {
  const normalized = text.toLowerCase()
  const complex =
    text.length >= 220 ||
    text.split('\n').filter((line) => line.trim()).length >= 4 ||
    COMPLEX_MARKERS.some((marker) => normalized.includes(marker))

  if (complex) {
    return {
      templateIds: [...BUILT_IN_TEAM_IDS],
      complexity: 'complex',
      reason: '복합 작업으로 판단해 세 팀장에게 병렬 배정'
    }
  }

  if (/ui|ux|화면|디자인|픽셀|css|프론트/.test(normalized)) {
    return { templateIds: ['antigravity-cli'], complexity: 'simple', reason: 'UI 작업으로 단일 팀장 배정' }
  }
  if (/분석|기획|문서|리뷰|검토|설계/.test(normalized)) {
    return { templateIds: ['claude-code'], complexity: 'simple', reason: '분석 작업으로 단일 팀장 배정' }
  }
  return { templateIds: ['codex-cli'], complexity: 'simple', reason: '코드 작업으로 단일 팀장 배정' }
}
