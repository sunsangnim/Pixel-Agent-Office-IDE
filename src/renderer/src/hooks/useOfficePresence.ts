import { useEffect, useRef, useState } from 'react'
import type {
  AgentInstance,
  AgentProfile,
  AgentStatePayload,
  OfficePresence
} from '@shared/types'

const REST_DELAY_MS = 1200

function restPresence(profile: AgentProfile): OfficePresence {
  if (profile.rank === 'teamLead' || profile.slotIndex === 3) return 'deskIdle'
  return profile.slotIndex === 1 ? 'pantry' : 'meeting'
}

export function useOfficePresence(
  profiles: AgentProfile[],
  instances: AgentInstance[],
  runtimeStates: Record<string, AgentStatePayload>,
  tasks: Record<string, string>
): Record<string, OfficePresence> {
  const [presenceByProfile, setPresenceByProfile] = useState<Record<string, OfficePresence>>({})
  const restTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const immediate: Record<string, OfficePresence> = {}
    for (const profile of profiles) {
      const instance = instances.find((candidate) => candidate.profileId === profile.profileId)
      const previousTimer = restTimers.current.get(profile.profileId)
      if (!instance) {
        clearTimeout(previousTimer)
        restTimers.current.delete(profile.profileId)
        immediate[profile.profileId] = 'offDuty'
        continue
      }

      const runtimeState = runtimeStates[instance.ptyId]?.state
      const task = tasks[instance.instanceId] ?? ''
      if (runtimeState === 'error') immediate[profile.profileId] = 'error'
      else if (runtimeState === 'waiting') immediate[profile.profileId] = 'requestingHelp'
      else if (/취합|회의|조율/.test(task) && runtimeState === 'working') {
        immediate[profile.profileId] = 'meeting'
      } else if (runtimeState === 'working' || runtimeState === 'starting') {
        immediate[profile.profileId] = 'working'
      } else if (runtimeState === 'exited') {
        immediate[profile.profileId] = 'offDuty'
      } else if (runtimeState === 'completed') {
        immediate[profile.profileId] = presenceByProfile[profile.profileId] ?? 'deskIdle'
        if (!previousTimer) {
          const timer = setTimeout(() => {
            restTimers.current.delete(profile.profileId)
            setPresenceByProfile((prev) => ({
              ...prev,
              [profile.profileId]: restPresence(profile)
            }))
          }, REST_DELAY_MS)
          restTimers.current.set(profile.profileId, timer)
        }
      } else {
        immediate[profile.profileId] = 'deskIdle'
      }

      if (runtimeState !== 'completed') {
        clearTimeout(previousTimer)
        restTimers.current.delete(profile.profileId)
      }
    }
    setPresenceByProfile((prev) => ({ ...prev, ...immediate }))
  }, [instances, profiles, runtimeStates, tasks])

  useEffect(
    () => () => {
      for (const timer of restTimers.current.values()) clearTimeout(timer)
      restTimers.current.clear()
    },
    []
  )

  return presenceByProfile
}
