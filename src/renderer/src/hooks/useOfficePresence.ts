import { useEffect, useRef, useState } from 'react'
import type {
  AgentInstance,
  AgentProfile,
  AgentStatePayload,
  OfficePresence
} from '@shared/types'

const REST_DELAY_MS = 1200
const DOOR_ROUTE_MS = 520

function restPresence(profile: AgentProfile): OfficePresence {
  if (profile.rank === 'teamLead' || profile.slotIndex >= 3) return 'deskIdle'
  return profile.slotIndex === 1 ? 'pantry' : 'meeting'
}

export function useOfficePresence(
  profiles: AgentProfile[],
  instances: AgentInstance[],
  runtimeStates: Record<string, AgentStatePayload>,
  tasks: Record<string, string>,
  isWorkingHours: boolean,
  isClockInActive: boolean,
  meetingActive: boolean
): Record<string, OfficePresence> {
  const [presenceByProfile, setPresenceByProfile] = useState<Record<string, OfficePresence>>({})
  const restTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const routeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const routeDestinations = useRef(new Map<string, OfficePresence>())
  const restedProfiles = useRef(new Set<string>())

  useEffect(() => {
    const immediate: Record<string, OfficePresence> = {}
    const meetingAttendeeIds = new Set(
      profiles
        .filter((profile) =>
          instances.some((instance) => instance.profileId === profile.profileId) ||
          (profile.rank === 'teamLead' && isWorkingHours)
        )
        .slice(0, 8)
        .map((profile) => profile.profileId)
    )
    for (const profile of profiles) {
      const instance = instances.find((candidate) => candidate.profileId === profile.profileId)
      const previousTimer = restTimers.current.get(profile.profileId)
      if (!instance) {
        clearTimeout(previousTimer)
        restTimers.current.delete(profile.profileId)
        restedProfiles.current.delete(profile.profileId)
        immediate[profile.profileId] = profile.rank === 'teamLead' && isWorkingHours
          ? meetingActive && meetingAttendeeIds.has(profile.profileId) ? 'meeting' : isClockInActive ? 'arriving' : 'deskIdle'
          : 'offDuty'
        continue
      }

      const runtimeState = runtimeStates[instance.ptyId]?.state
      const task = tasks[instance.instanceId] ?? ''
      if (meetingActive && meetingAttendeeIds.has(profile.profileId)) immediate[profile.profileId] = 'meeting'
      else if (runtimeState === 'error') immediate[profile.profileId] = 'error'
      else if (runtimeState === 'waiting') immediate[profile.profileId] = 'requestingHelp'
      else if (/취합|회의|조율/.test(task) && runtimeState === 'working') {
        immediate[profile.profileId] = 'meeting'
      } else if (runtimeState === 'working' || runtimeState === 'starting') {
        immediate[profile.profileId] = 'working'
      } else if (runtimeState === 'exited') {
        immediate[profile.profileId] = 'offDuty'
      } else if (runtimeState === 'completed') {
        immediate[profile.profileId] = presenceByProfile[profile.profileId] ?? 'deskIdle'
        if (!previousTimer && !restedProfiles.current.has(profile.profileId)) {
          const timer = setTimeout(() => {
            restTimers.current.delete(profile.profileId)
            restedProfiles.current.add(profile.profileId)
            const destination = restPresence(profile)
            if (destination === 'pantry') {
              setPresenceByProfile((prev) => ({ ...prev, [profile.profileId]: 'pantryDoor' }))
              const routeTimer = setTimeout(() => {
                routeTimers.current.delete(profile.profileId)
                routeDestinations.current.delete(profile.profileId)
                setPresenceByProfile((prev) => ({ ...prev, [profile.profileId]: destination }))
              }, DOOR_ROUTE_MS)
              routeTimers.current.set(profile.profileId, routeTimer)
              routeDestinations.current.set(profile.profileId, destination)
            } else {
              setPresenceByProfile((prev) => ({ ...prev, [profile.profileId]: destination }))
            }
          }, REST_DELAY_MS)
          restTimers.current.set(profile.profileId, timer)
        }
      } else {
        immediate[profile.profileId] = 'deskIdle'
      }

      if (runtimeState !== 'completed') {
        clearTimeout(previousTimer)
        restTimers.current.delete(profile.profileId)
        restedProfiles.current.delete(profile.profileId)
      }
    }
    setPresenceByProfile((prev) => {
      const routed = { ...immediate }
      for (const profile of profiles) {
        const id = profile.profileId
        const current = prev[id]
        const destination = immediate[id]
        const activeRoute = routeTimers.current.get(id)
        if (activeRoute) {
          if (routeDestinations.current.get(id) === destination) {
            delete routed[id]
            continue
          }
          clearTimeout(activeRoute)
          routeTimers.current.delete(id)
          routeDestinations.current.delete(id)
        }
        if (!current || !destination || current === destination) continue
        const meetingRoute = destination === 'meeting' || current === 'meeting'
        const pantryRoute = destination === 'pantry' || current === 'pantry'
        if (!meetingRoute && !pantryRoute) continue
        routed[id] = meetingRoute ? 'meetingDoor' : 'pantryDoor'
        const timer = setTimeout(() => {
          routeTimers.current.delete(id)
          routeDestinations.current.delete(id)
          setPresenceByProfile((latest) => ({ ...latest, [id]: destination }))
        }, DOOR_ROUTE_MS)
        routeTimers.current.set(id, timer)
        routeDestinations.current.set(id, destination)
      }
      return { ...prev, ...routed }
    })
  }, [instances, profiles, runtimeStates, tasks, isWorkingHours, isClockInActive, meetingActive])

  useEffect(
    () => () => {
      for (const timer of restTimers.current.values()) clearTimeout(timer)
      for (const timer of routeTimers.current.values()) clearTimeout(timer)
      restTimers.current.clear()
      routeTimers.current.clear()
      routeDestinations.current.clear()
      restedProfiles.current.clear()
    },
    []
  )

  return presenceByProfile
}
