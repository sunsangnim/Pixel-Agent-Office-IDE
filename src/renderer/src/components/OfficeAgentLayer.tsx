import type { CSSProperties } from 'react'
import type { AgentInstance, AgentProfile, AgentTemplate, OfficePresence } from '@shared/types'
import PixelPerson from './PixelPerson'

interface OfficeAgentLayerProps {
  profiles: AgentProfile[]
  instances: AgentInstance[]
  templates: AgentTemplate[]
  presenceByProfile: Record<string, OfficePresence>
}

const DESK_X = [12.5, 37.5, 62.5, 87.5]
const DESK_Y = [45, 67, 87]

function activityLabel(presence: OfficePresence): string | undefined {
  if (presence === 'pantry') return '휴식 중'
  if (presence === 'meeting') return '회의 중'
  if (presence === 'requestingHelp') return '승인 필요!'
  if (presence === 'error') return '오류 발생'
  if (presence === 'working') return '작업 중'
  return undefined
}

function position(
  profile: AgentProfile,
  profileIndex: number,
  teamIndex: number,
  presence: OfficePresence
): { x: number; y: number } {
  if (presence === 'pantry') return { x: 8 + (profileIndex % 3) * 5, y: 14 }
  if (presence === 'meeting') return { x: 43 + (profileIndex % 4) * 5, y: 14 }
  return {
    x: DESK_X[profile.slotIndex] ?? 50,
    y: DESK_Y[teamIndex] ?? Math.min(88, 45 + teamIndex * 18)
  }
}

function OfficeAgentLayer({ profiles, instances, templates, presenceByProfile }: OfficeAgentLayerProps) {
  const teamIds = Array.from(new Set(profiles.map((profile) => profile.templateId)))
  return (
    <div className="office-agent-layer" aria-label="에이전트 위치">
      {profiles.flatMap((profile, profileIndex) => {
        const instance = instances.find((candidate) => candidate.profileId === profile.profileId)
        const presence = presenceByProfile[profile.profileId] ?? 'offDuty'
        if (!instance || presence === 'offDuty') return []
        const template = templates.find((candidate) => candidate.id === profile.templateId)
        const coords = position(profile, profileIndex, teamIds.indexOf(profile.templateId), presence)
        return (
          <div
            className={`office-agent office-agent-${presence}`}
            data-profile-id={profile.profileId}
            key={profile.profileId}
            style={{ '--agent-x': `${coords.x}%`, '--agent-y': `${coords.y}%` } as CSSProperties}
          >
            <PixelPerson
              color={template?.color ?? '#888888'}
              name={profile.displayName}
              activity={activityLabel(presence)}
            />
          </div>
        )
      })}
    </div>
  )
}

export default OfficeAgentLayer
