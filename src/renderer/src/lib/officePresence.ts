import type { AgentInstance, AgentProfile, AgentStatePayload, OfficePresence } from '@shared/types'

export function resolveOfficePresence(
  profiles: AgentProfile[], instances: AgentInstance[], runtimeStates: Record<string, AgentStatePayload>,
  meetingActive: boolean, manuallyOffDutyIds: Set<string>, representativeVisitors: Set<string> = new Set()
): Record<string, OfficePresence> {
  const byProfile = new Map(instances.map((instance) => [instance.profileId, instance]))
  return Object.fromEntries(profiles.map((profile) => {
    const id = profile.profileId
    const instance = byProfile.get(id)
    const state = instance ? runtimeStates[instance.ptyId]?.state : undefined
    let presence: OfficePresence = 'deskIdle'
    if (manuallyOffDutyIds.has(id) || (profile.rank !== 'teamLead' && (!instance || state === 'exited'))) presence = 'offDuty'
    else if (representativeVisitors.has(id)) presence = 'representativeVisit'
    else if (state === 'error') presence = 'error'
    else if (state === 'waiting') presence = 'requestingHelp'
    else if (meetingActive && profile.rank === 'teamLead') presence = 'meeting'
    else if (state === 'working' || state === 'starting') presence = 'working'
    return [id, presence]
  }))
}
