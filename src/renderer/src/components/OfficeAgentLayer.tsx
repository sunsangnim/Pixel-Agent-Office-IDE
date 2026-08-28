import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { AgentInstance, AgentProfile, AgentTemplate, OfficePresence } from '@shared/types'
import PixelPerson from './PixelPerson'

interface OfficeAgentLayerProps {
  profiles: AgentProfile[]
  instances: AgentInstance[]
  templates: AgentTemplate[]
  presenceByProfile: Record<string, OfficePresence>
}

const TEAM_X = [12, 36, 60]
const MEETING_SEATS = [
  { x: 42, y: 14 }, { x: 48, y: 14 }, { x: 54, y: 14 }, { x: 60, y: 14 },
  { x: 42, y: 24 }, { x: 48, y: 24 }, { x: 54, y: 24 }, { x: 60, y: 24 }
]

function activityLabel(presence: OfficePresence): string | undefined {
  if (presence === 'pantry') return '간식·음료'
  if (presence === 'pantryDoor') return '탕비실 이동 중'
  if (presence === 'meeting') return '회의 중'
  if (presence === 'meetingDoor') return '회의실 이동 중'
  if (presence === 'requestingHelp') return '승인 필요!'
  if (presence === 'error') return '오류 발생'
  if (presence === 'working') return '작업 중'
  if (presence === 'arriving') return '출근 중'
  return undefined
}

function position(
  profile: AgentProfile,
  profileIndex: number,
  teamIndex: number,
  presence: OfficePresence
): { x: number; y: number } {
  if (presence === 'arriving') return { x: 84, y: 25 }
  if (presence === 'pantryDoor') return { x: 28, y: 35 }
  if (presence === 'meetingDoor') return { x: 52, y: 35 }
  if (presence === 'pantry') return { x: 9 + (profileIndex % 3) * 6, y: 18 }
  if (presence === 'meeting') return MEETING_SEATS[profileIndex % MEETING_SEATS.length]
  const teamX = TEAM_X[teamIndex] ?? 48
  if (profile.slotIndex === 0) return { x: teamX, y: 47 }
  const childIndex = profile.slotIndex - 1
  return { x: teamX + (childIndex % 2 === 0 ? -7 : 7), y: childIndex < 2 ? 68 : 87 }
}

function OfficeAgentLayer({ profiles, instances, templates, presenceByProfile }: OfficeAgentLayerProps) {
  const teamIds = Array.from(new Set(profiles.map((profile) => profile.templateId)))
  const previousPresence = useRef<Record<string, OfficePresence>>({})

  useEffect(() => {
    previousPresence.current = { ...presenceByProfile }
  }, [presenceByProfile])

  return (
    <div className="office-agent-layer" aria-label="에이전트 위치">
      {profiles.flatMap((profile, profileIndex) => {
        const instance = instances.find((candidate) => candidate.profileId === profile.profileId)
        const presence = presenceByProfile[profile.profileId] ?? 'offDuty'
        if (presence === 'offDuty') return []
        const template = templates.find((candidate) => candidate.id === profile.templateId)
        const teamIndex = teamIds.indexOf(profile.templateId)
        const coords = position(profile, profileIndex, teamIndex, presence)
        const deskCoords = position(profile, profileIndex, teamIndex, 'deskIdle')
        const fromPresence = previousPresence.current[profile.profileId] ?? 'offDuty'
        return (
          <div
            className={`office-agent office-agent-${presence}`}
            data-profile-id={profile.profileId}
            data-from-presence={fromPresence}
            data-seated={presence === 'working' || presence === 'meeting' ? 'true' : 'false'}
            data-pantry-action={presence === 'pantry' ? (profileIndex % 2 === 0 ? 'snacking' : 'drinking') : undefined}
            key={profile.profileId}
            role="img"
            aria-label={`${profile.displayName}: ${activityLabel(presence) ?? '책상 대기 중'}`}
            style={{
              '--agent-x': `${coords.x}%`,
              '--agent-y': `${coords.y}%`,
              '--desk-x': `${deskCoords.x}%`,
              '--desk-y': `${deskCoords.y}%`
            } as CSSProperties}
          >
            <PixelPerson
              color={template?.color ?? '#888888'}
              name={profile.displayName}
              activity={activityLabel(presence)}
              rosterIndex={profileIndex + 1}
            />
          </div>
        )
      })}
    </div>
  )
}

export default OfficeAgentLayer
