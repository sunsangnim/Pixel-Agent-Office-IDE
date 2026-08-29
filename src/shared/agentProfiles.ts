import type { AgentProfile, AgentRank, AgentTemplate } from './types'
import { BUILT_IN_TEAM_IDS } from './orchestrationPolicy'

const TEAM_NAMES: Record<(typeof BUILT_IN_TEAM_IDS)[number], string> = {
  'claude-code': 'Claude',
  'codex-cli': 'Codex',
  'antigravity-cli': 'Antigravity'
}

// Team-lead job titles - Claude/Codex/Antigravity aren't peers, they're a
// small hierarchy. Sub-sessions are all 사원 regardless of team.
const TEAM_LEAD_TITLES: Record<(typeof BUILT_IN_TEAM_IDS)[number], string> = {
  'claude-code': '부장',
  'codex-cli': '차장',
  'antigravity-cli': '과장'
}
const DEFAULT_LEAD_TITLE = '팀장'
export const SUB_AGENT_TITLE = '사원'

export function leadTitleFor(templateId: string): string {
  return TEAM_LEAD_TITLES[templateId as (typeof BUILT_IN_TEAM_IDS)[number]] ?? DEFAULT_LEAD_TITLE
}

function profileId(templateId: string, slotIndex: number): string {
  return `${templateId}:${slotIndex === 0 ? 'lead' : `child-${slotIndex}`}`
}

export const BUILT_IN_AGENT_PROFILES: readonly AgentProfile[] = BUILT_IN_TEAM_IDS.flatMap(
  (templateId) =>
    Array.from({ length: 5 }, (_, slotIndex) => {
      const rank: AgentRank = slotIndex === 0 ? 'teamLead' : 'subAgent'
      return {
        profileId: profileId(templateId, slotIndex),
        templateId,
        rank,
        slotIndex,
        displayName:
          rank === 'teamLead'
            ? `${TEAM_NAMES[templateId]} ${leadTitleFor(templateId)}`
            : `${TEAM_NAMES[templateId]} ${SUB_AGENT_TITLE} ${slotIndex}`
      }
    })
)

export function listAgentProfiles(): AgentProfile[] {
  return BUILT_IN_AGENT_PROFILES.map((profile) => ({ ...profile }))
}

export function findAgentProfile(profileIdValue: string): AgentProfile | undefined {
  return BUILT_IN_AGENT_PROFILES.find((profile) => profile.profileId === profileIdValue)
}

export function buildAgentProfiles(
  templates: Array<Pick<AgentTemplate, 'id' | 'name'>>,
  capacityByTemplateId: Record<string, number> = {}
): AgentProfile[] {
  return templates.flatMap((template) => {
    const capacity = Math.max(1, capacityByTemplateId[template.id] ?? 5)
    return Array.from({ length: capacity }, (_, slotIndex) => {
      const rank: AgentRank = slotIndex === 0 ? 'teamLead' : 'subAgent'
      return {
        profileId: profileId(template.id, slotIndex),
        templateId: template.id,
        rank,
        slotIndex,
        displayName:
          rank === 'teamLead'
            ? `${template.name} ${leadTitleFor(template.id)}`
            : `${template.name} ${SUB_AGENT_TITLE} ${slotIndex}`
      }
    })
  })
}
