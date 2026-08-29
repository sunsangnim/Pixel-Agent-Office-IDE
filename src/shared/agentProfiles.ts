import type { AgentProfile, AgentRank, AgentTemplate } from './types'
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
    Array.from({ length: 5 }, (_, slotIndex) => {
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
            ? `${template.name} 팀장`
            : `${template.name} 하위 세션 ${slotIndex}`
      }
    })
  })
}
