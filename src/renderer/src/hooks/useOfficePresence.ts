import { useMemo } from 'react'
import type { AgentInstance, AgentProfile, AgentStatePayload, OfficePresence } from '@shared/types'
import { resolveOfficePresence } from '../lib/officePresence'

export function useOfficePresence(
  profiles: AgentProfile[], instances: AgentInstance[], runtimeStates: Record<string, AgentStatePayload>,
  _tasks: Record<string, string>, _isClockInActive: boolean, meetingActive: boolean,
  manuallyOffDutyIds: Set<string>, representativeVisitors: Set<string> = new Set()
): Record<string, OfficePresence> {
  // Physical arrival and occasional breaks belong to the scene. Wall-clock
  // timers must not replace a route before the character reaches its goal.
  return useMemo(() => resolveOfficePresence(profiles, instances, runtimeStates, meetingActive, manuallyOffDutyIds, representativeVisitors),
    [profiles, instances, runtimeStates, meetingActive, manuallyOffDutyIds, representativeVisitors])
}
