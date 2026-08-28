import type { AgentInstance, AgentProfile, AgentStatePayload, AgentTemplate, DeskStatus } from '@shared/types'
import AgentDesk from './AgentDesk'
import DeskIcon from './DeskIcon'
import OfficeZones from './OfficeZones'
import type { OfficePresence } from '@shared/types'
import OfficeAgentLayer from './OfficeAgentLayer'
import { useOfficePresence } from '../hooks/useOfficePresence'
import RepresentativeOffice from './RepresentativeOffice'
import { useOfficeClock } from '../hooks/useOfficeClock'

interface OfficeViewProps {
  instances: AgentInstance[]
  profiles: AgentProfile[]
  templates: AgentTemplate[]
  statuses: Record<string, DeskStatus>
  runtimeStates: Record<string, AgentStatePayload>
  tasks: Record<string, string>
  selectedInstanceId: string | null
  onSelect: (instanceId: string) => void
  onRemove: (instanceId: string) => void
  meetingActive: boolean
}

function OfficeView({
  instances,
  profiles,
  templates,
  statuses,
  runtimeStates,
  tasks,
  selectedInstanceId,
  onSelect,
  onRemove,
  meetingActive
}: OfficeViewProps) {
  const officeClock = useOfficeClock()
  const presenceByProfile = useOfficePresence(
    profiles,
    instances,
    runtimeStates,
    tasks,
    officeClock.isWorkingHours,
    officeClock.isClockInActive,
    meetingActive
  )
  const pantryOccupied = Object.values(presenceByProfile).some((presence) => presence === 'pantry' || presence === 'pantryDoor')
  const meetingOccupied = Object.values(presenceByProfile).some((presence) => presence === 'meeting' || presence === 'meetingDoor')
  const teamIds = Array.from(new Set(profiles.map((profile) => profile.templateId)))
  const teamLabels: Record<string, string> = {
    'claude-code': 'Team Claude',
    'codex-cli': 'Team Codex',
    'antigravity-cli': 'Team Antigravity'
  }

  const renderDesk = (profile: AgentProfile) => {
    const template = templates.find((candidate) => candidate.id === profile.templateId)
    const instance = instances.find((candidate) => candidate.profileId === profile.profileId)
    const roleLabel = profile.rank === 'teamLead' ? '팀장' : `하위 세션 ${profile.slotIndex}`
    if (!instance) {
      return (
        <div className="desk desk-vacant" data-presence="offDuty" key={profile.profileId}>
          <DeskIcon color={template?.color ?? '#66736d'} status="idle" />
          <div className="desk-label">{profile.displayName}</div>
          <div className="desk-role">{roleLabel} · 미출근</div>
        </div>
      )
    }
    return (
      <AgentDesk
        key={instance.instanceId}
        instance={instance}
        template={template}
        status={statuses[instance.ptyId] ?? 'idle'}
        selected={instance.instanceId === selectedInstanceId}
        onSelect={() => onSelect(instance.instanceId)}
        onRemove={() => onRemove(instance.instanceId)}
        roleLabel={roleLabel}
        presence={presenceByProfile[profile.profileId] ?? 'deskIdle'}
      />
    )
  }

  return (
    <div className="office-room has-agent-layer pixel-background-enabled">
      <OfficeZones
        now={officeClock.now}
        elevatorOpen={officeClock.isClockInActive}
        pantryOpen={pantryOccupied}
        meetingOpen={meetingActive || meetingOccupied}
      />
      <OfficeAgentLayer
        profiles={profiles}
        instances={instances}
        templates={templates}
        presenceByProfile={presenceByProfile}
      />

      <div className="office-desk-floor">
        <span className="office-deco office-deco-tl">🌿</span>
        <span className="office-deco office-deco-tr">🖨️</span>
        <span className="office-deco office-deco-bl">🚰</span>
        <span className="office-deco office-deco-br">🪴</span>

        <div className="office-team-grid">
          {teamIds.map((teamId) => {
            const teamProfiles = profiles.filter((profile) => profile.templateId === teamId)
            return (
              <section className="office-team-column" data-team={teamId} key={teamId}>
                <h3 className="office-team-heading">{teamLabels[teamId] ?? teamId}</h3>
                <div className="office-team-lead">{teamProfiles[0] && renderDesk(teamProfiles[0])}</div>
                <div className="office-team-children">{teamProfiles.slice(1).map(renderDesk)}</div>
              </section>
            )
          })}
        </div>
        <RepresentativeOffice />
      </div>
    </div>
  )
}

export default OfficeView
