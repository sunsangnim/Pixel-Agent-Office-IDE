import type { AgentInstance, AgentStatePayload, AgentTemplate, DeskStatus } from '@shared/types'
import AgentProfileCard from './AgentProfileCard'

interface AgentProfileRowProps {
  instances: AgentInstance[]
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
      {instances.map((instance) => (
        <AgentProfileCard
          key={instance.instanceId}
          instance={instance}
          template={templates.find((t) => t.id === instance.templateId)}
          status={statuses[instance.ptyId] ?? 'idle'}
          runtimeState={runtimeStates[instance.ptyId]}
          task={tasks[instance.instanceId]}
          selected={selectedTargetIds.has(instance.instanceId)}
          onToggle={() => onToggleTarget(instance.instanceId)}
        />
      ))}

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
