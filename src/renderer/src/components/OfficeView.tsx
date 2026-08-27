import type { AgentInstance, AgentProfile, AgentStatePayload, AgentTemplate, DeskStatus } from '@shared/types'
import AgentDesk from './AgentDesk'
import OfficeZones from './OfficeZones'
import type { OfficePresence } from '@shared/types'
import OfficeAgentLayer from './OfficeAgentLayer'
import { useOfficePresence } from '../hooks/useOfficePresence'

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
  onRemove
}: OfficeViewProps) {
  const presenceByProfile = useOfficePresence(profiles, instances, runtimeStates, tasks)

  return (
    <div className="office-room has-agent-layer">
      <OfficeZones />
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

        <div className="office-grid office-grid-fixed">
          {profiles.map((profile) => {
              const template = templates.find((candidate) => candidate.id === profile.templateId)
              const instance = instances.find((candidate) => candidate.profileId === profile.profileId)
              const roleLabel = profile.rank === 'teamLead' ? '팀장' : `하위 세션 ${profile.slotIndex}`
              if (!instance) {
                return (
                  <div className="desk desk-vacant" data-presence="offDuty" key={profile.profileId}>
                    <div className="vacant-chair"><i /></div>
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
          })}
        </div>
      </div>
    </div>
  )
}

export default OfficeView
