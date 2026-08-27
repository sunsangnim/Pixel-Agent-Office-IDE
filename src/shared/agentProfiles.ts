import type { AgentProfile, AgentRank } from './types'
import { BUILT_IN_TEAM_IDS } from './orchestrationPolicy'

const TEAM_NAMES: Record<(typeof BUILT_IN_TEAM_IDS)[number], string> = {
  'claude-code': 'Claude',
  'codex-cli': 'Codex',
  'antigravity-cli': 'Antigravity'
}

function profileId(templateId: string, slotIndex: number): string {
  return `${templateId}:${slotIndex === 0 ? 'lead' : `child-${slotIndex}`}`
}

export const BUILT_IN_AGENT_PROFILES: readonly AgentProfile[] = BUILT_IN_TEAM_IDS.flatMap(
  (templateId) =>
    Array.from({ length: 4 }, (_, slotIndex) => {
      const rank: AgentRank = slotIndex === 0 ? 'teamLead' : 'subAgent'
      return {
        profileId: profileId(templateId, slotIndex),
        templateId,
        rank,
        slotIndex,
        displayName:
          rank === 'teamLead'
            ? `${TEAM_NAMES[templateId]} 팀장`
            : `${TEAM_NAMES[templateId]} 하위 세션 ${slotIndex}`
      }
    })
)

export function listAgentProfiles(): AgentProfile[] {
  return BUILT_IN_AGENT_PROFILES.map((profile) => ({ ...profile }))
}

export function findAgentProfile(profileIdValue: string): AgentProfile | undefined {
  return BUILT_IN_AGENT_PROFILES.find((profile) => profile.profileId === profileIdValue)
}
