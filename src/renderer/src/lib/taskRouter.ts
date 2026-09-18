import { BUILT_IN_TEAM_IDS } from '@shared/orchestrationPolicy'

export interface DispatchPlan {
  templateIds: string[]
  complexity: 'simple' | 'complex'
  reason: string
  explicitlyAssigned: boolean
}

const COMPLEX_MARKERS = ['병렬', '분담', '전체', '아키텍처', '마이그레이션', '리팩터링', '통합 테스트', 'orchestrat']

const BUILT_IN_ROLE_DESCRIPTIONS: Record<string, string> = {
  'claude-code': 'Claude=코딩·문서작업',
  'codex-cli': 'Codex=이미지 생성',
  'antigravity-cli': 'Antigravity=테스트·검증'
}

/** Picks a sensible default team for work nobody explicitly assigned - Claude
 *  when it's configured (matches the written docs/behavior), otherwise
 *  whichever team the user actually added first. Empty only when no agent
 *  has been configured at all. */
function defaultTeam(availableTemplateIds: string[]): string[] {
  if (availableTemplateIds.includes('claude-code')) return ['claude-code']
  return availableTemplateIds.length > 0 ? [availableTemplateIds[0]] : []
}

function simplePlan(templateIds: string[], reason: string): DispatchPlan {
  return { templateIds, complexity: 'simple', reason, explicitlyAssigned: false }
}

export function planTask(text: string, availableTemplateIds: string[]): DispatchPlan {
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
    const availableBuiltIns = BUILT_IN_TEAM_IDS.filter((id) => availableTemplateIds.includes(id))
    if (availableBuiltIns.length > 1) {
      return {
        templateIds: availableBuiltIns,
        complexity: 'complex',
        reason: `큰 작업으로 판단해 ${availableBuiltIns.map((id) => BUILT_IN_ROLE_DESCRIPTIONS[id]).join(', ')}으로 오케스트레이션`,
        explicitlyAssigned: false
      }
    }
    // Fewer than two of the three built-in roles are configured - there's
    // nothing to split work across, so fall through to the single-team default.
  }

  const fallback = defaultTeam(availableTemplateIds)
  if (fallback.length === 0) {
    return simplePlan([], '등록된 에이전트가 없습니다. 설정에서 CLI를 먼저 추가해주세요.')
  }
  const fallbackName = BUILT_IN_ROLE_DESCRIPTIONS[fallback[0]]?.split('=')[0] ?? fallback[0]
  return simplePlan(fallback, `미지정 작업의 기본 담당 ${fallbackName}에게 배정`)
}
