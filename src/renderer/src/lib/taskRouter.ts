import { BUILT_IN_TEAM_IDS } from '@shared/orchestrationPolicy'

export interface DispatchPlan {
  templateIds: string[]
  complexity: 'simple' | 'complex'
  reason: string
  explicitlyAssigned: boolean
}

const COMPLEX_MARKERS = ['병렬', '분담', '전체', '아키텍처', '마이그레이션', '리팩터링', '통합 테스트', 'orchestrat']

export function planTask(text: string): DispatchPlan {
  const normalized = text.toLowerCase()
  const explicitRoutes: Array<{ pattern: RegExp; templateId: string; name: string }> = [
    { pattern: /@(?:클로드|claude)(?=\s|$)/i, templateId: 'claude-code', name: 'Claude' },
    { pattern: /@(?:코덱스|codex)(?=\s|$)/i, templateId: 'codex-cli', name: 'Codex' },
    { pattern: /@(?:안티그래피|안티그래비티|antigravity)(?=\s|$)/i, templateId: 'antigravity-cli', name: 'Antigravity' }
  ]
  const explicit = explicitRoutes.filter((route) => route.pattern.test(text))
  if (explicit.length > 0) {
    return {
      templateIds: explicit.map((route) => route.templateId),
      complexity: explicit.length > 1 ? 'complex' : 'simple',
      reason: `${explicit.map((route) => route.name).join(', ')} 멘션을 감지해 해당 팀장에게 직접 배정`,
      explicitlyAssigned: true
    }
  }
  const complex =
    text.length >= 220 ||
    text.split('\n').filter((line) => line.trim()).length >= 4 ||
    COMPLEX_MARKERS.some((marker) => normalized.includes(marker))

  if (complex) {
    return {
      templateIds: [...BUILT_IN_TEAM_IDS],
      complexity: 'complex',
      reason: '큰 작업으로 판단해 Claude=코딩·문서작업, Codex=이미지 생성, Antigravity=테스트·검증으로 오케스트레이션',
      explicitlyAssigned: false
    }
  }

  if (/ui|ux|화면|디자인|픽셀|css|프론트/.test(normalized)) {
    return { templateIds: ['claude-code'], complexity: 'simple', reason: '미지정 작업의 기본 담당 Claude에게 배정', explicitlyAssigned: false }
  }
  if (/분석|기획|문서|리뷰|검토|설계/.test(normalized)) {
    return { templateIds: ['claude-code'], complexity: 'simple', reason: '미지정 작업의 기본 담당 Claude에게 배정', explicitlyAssigned: false }
  }
  return { templateIds: ['claude-code'], complexity: 'simple', reason: '미지정 작업의 기본 담당 Claude에게 배정', explicitlyAssigned: false }
}
