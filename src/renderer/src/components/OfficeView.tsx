import type { AgentInstance, AgentTemplate, DeskStatus } from '@shared/types'
import AgentDesk from './AgentDesk'

interface OfficeViewProps {
  instances: AgentInstance[]
  templates: AgentTemplate[]
  statuses: Record<string, DeskStatus>
  selectedInstanceId: string | null
  onSelect: (instanceId: string) => void
  onRemove: (instanceId: string) => void
}

function OfficeView({
  instances,
  templates,
  statuses,
  selectedInstanceId,
  onSelect,
  onRemove
}: OfficeViewProps) {
  return (
    <div className="office-room">
      <span className="office-plant office-plant-tl">🌿</span>
      <span className="office-plant office-plant-br">🪴</span>

      {instances.length === 0 ? (
        <p className="office-empty">
          아직 배치된 에이전트가 없습니다. 작업 폴더를 지정하고 에이전트를 추가하세요.
        </p>
      ) : (
        <div className="office-grid">
          {instances.map((instance) => (
            <AgentDesk
              key={instance.instanceId}
              instance={instance}
              template={templates.find((t) => t.id === instance.templateId)}
              status={statuses[instance.ptyId] ?? 'idle'}
              selected={instance.instanceId === selectedInstanceId}
              onSelect={() => onSelect(instance.instanceId)}
              onRemove={() => onRemove(instance.instanceId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default OfficeView
