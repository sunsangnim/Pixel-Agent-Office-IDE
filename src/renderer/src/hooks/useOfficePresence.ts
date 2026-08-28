import { useEffect, useRef, useState } from 'react'
import type {
  AgentInstance,
  AgentProfile,
  AgentStatePayload,
  OfficePresence
} from '@shared/types'

const REST_DELAY_MS = 1200
const DOOR_ROUTE_MS = 520

// Stable (not random) so a given team lead doesn't flicker between desk and
// pantry every render - just spreads different leads across desk/pantry/
// meeting so the office doesn't look like everyone glues to their chair.
function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0
  return Math.abs(hash)
}

function idleActivity(profileId: string): OfficePresence {
  const bucket = hashString(profileId) % 4
  if (bucket === 0) return 'pantry'
  if (bucket === 1) return 'meeting'
  return 'deskIdle'
}

function restPresence(profile: AgentProfile): OfficePresence {
  if (profile.rank === 'teamLead') return idleActivity(profile.profileId)
  if (profile.slotIndex >= 3) return 'deskIdle'
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
          ? meetingActive && meetingAttendeeIds.has(profile.profileId) ? 'meeting' : isClockInActive ? 'arriving' : restPresence(profile)
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
        // Team leads stay clocked in through working hours even after their
        // CLI process exits - only send them home once the day is over.
        immediate[profile.profileId] = profile.rank === 'teamLead' && isWorkingHours
          ? restPresence(profile)
          : 'offDuty'
      } else if (runtimeState === 'completed') {
        immediate[profile.profileId] = presenceByProfile[profile.profileId] ?? 'deskIdle'
        if (!previousTimer && !restedProfiles.current.has(profile.profileId)) {
          const timer = setTimeout(() => {
            restTimers.current.delete(profile.profileId)
            restedProfiles.current.add(profile.profileId)
            const destination = restPresence(profile)
            const doorPresence: Partial<Record<OfficePresence, OfficePresence>> = { pantry: 'pantryDoor', meeting: 'meetingDoor' }
            const door = doorPresence[destination]
            if (door) {
              setPresenceByProfile((prev) => ({ ...prev, [profile.profileId]: door }))
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
