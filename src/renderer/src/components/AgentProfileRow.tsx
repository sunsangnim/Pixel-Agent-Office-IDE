import type { AgentInstance, AgentProfile, AgentStatePayload, AgentTemplate, DeskStatus } from '@shared/types'
import AgentProfileCard from './AgentProfileCard'
import IdenticonAvatar from './IdenticonAvatar'

interface AgentProfileRowProps {
  instances: AgentInstance[]
  profiles: AgentProfile[]
  templates: AgentTemplate[]
  statuses: Record<string, DeskStatus>
  runtimeStates: Record<string, AgentStatePayload>
  tasks: Record<string, string>
  selectedTargetIds: Set<string>
  onToggleTarget: (instanceId: string) => void
  workFolder: string | null
  selectedTemplateId: string
  onTemplateChange: (templateId: string) => void
  onAdd: () => void
}

function AgentProfileRow({
  instances,
  profiles,
  templates,
  statuses,
  runtimeStates,
  tasks,
  selectedTargetIds,
  onToggleTarget,
  workFolder,
  selectedTemplateId,
  onTemplateChange,
  onAdd
}: AgentProfileRowProps) {
  return (
    <div className="profile-row">
      {profiles.map((profile) => {
        const instance = instances.find((candidate) => candidate.profileId === profile.profileId)
        const template = templates.find((candidate) => candidate.id === profile.templateId)
        return instance ? (
          <AgentProfileCard
            key={profile.profileId}
            instance={instance}
            template={template}
            status={statuses[instance.ptyId] ?? 'idle'}
            runtimeState={runtimeStates[instance.ptyId]}
            task={tasks[instance.instanceId]}
            selected={selectedTargetIds.has(instance.instanceId)}
            onToggle={() => onToggleTarget(instance.instanceId)}
          />
        ) : (
          <div className="profile-card profile-card-offduty" key={profile.profileId} title="CLI 프로세스 미실행">
            <IdenticonAvatar seed={profile.profileId} color={template?.color ?? '#888888'} size={48} />
            <span className="profile-card-name">{profile.displayName}</span>
            <span className="profile-card-task">미출근</span>
          </div>
        )
      })}

      <div className="profile-add-card">
        <span className="profile-add-plus">+</span>
        <select value={selectedTemplateId} onChange={(e) => onTemplateChange(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button onClick={onAdd} disabled={!workFolder || !selectedTemplateId}>
          추가
        </button>
      </div>
    </div>
  )
}

export default AgentProfileRow
