import type { OrchestrationPolicy } from './types'

/** Safe defaults for the three-team, twelve-seat office. */
export const ORCHESTRATION_POLICY: Readonly<OrchestrationPolicy> = {
  maxChildrenPerLead: 4,
  maxConcurrentRuns: 6,
  maxDepth: 2,
  simpleTaskMaxAgents: 1,
  cancelChildrenWithParent: true,
  idleProcessTimeoutMs: 10 * 60 * 1000
}

export const BUILT_IN_TEAM_IDS = ['claude-code', 'codex-cli', 'antigravity-cli'] as const
