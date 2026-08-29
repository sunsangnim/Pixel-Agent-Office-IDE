import type { OrchestrationPolicy } from './types'

/** Safe defaults for the three-team office. Per-team seat capacity now lives in
 *  teamCapacityStore (main) / the "영역 할당" settings UI, not a fixed constant here. */
export const ORCHESTRATION_POLICY: Readonly<OrchestrationPolicy> = {
  maxConcurrentRuns: 6,
  maxDepth: 2,
  simpleTaskMaxAgents: 1,
  cancelChildrenWithParent: true,
  idleProcessTimeoutMs: 10 * 60 * 1000
}

export const BUILT_IN_TEAM_IDS = ['claude-code', 'codex-cli', 'antigravity-cli'] as const

/** A team's office area physically fits 5 desks (1 lead + 4 sub-agent seats). */
export const MIN_TEAM_CAPACITY = 1
export const MAX_TEAM_CAPACITY = 5
export const DEFAULT_TEAM_CAPACITY = 5
