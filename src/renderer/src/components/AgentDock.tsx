import type { AgentInstance, AgentTemplate, DeskStatus } from '@shared/types'
import IdenticonAvatar from './IdenticonAvatar'

interface AgentDockProps {
  instances: AgentInstance[]
  templates: AgentTemplate[]
  statuses: Record<string, DeskStatus>
  tasks: Record<string, string>
  onSelect: (instanceId: string) => void
}

const statusLabel: Record<DeskStatus, string> = {
  idle: '대기 중',
  running: '작업 중',
  error: '오류'
}

function AgentDock({ instances, templates, statuses, tasks, onSelect }: AgentDockProps) {
  if (instances.length === 0) return null

  return (
    <div className="agent-dock">
      {instances.map((instance) => {
        const template = templates.find((t) => t.id === instance.templateId)
        const status = statuses[instance.ptyId] ?? 'idle'
        const name = template?.name ?? instance.templateId
        const task = tasks[instance.instanceId]
        return (
          <button
            key={instance.instanceId}
            className={`dock-item dock-item-${status}`}
            onClick={() => onSelect(instance.instanceId)}
            title={instance.cwd}
          >
            <IdenticonAvatar seed={instance.instanceId} color={template?.color ?? '#888888'} size={34} />
            <span className="dock-name">{name}</span>
            <span className="dock-status">{task ? task : statusLabel[status]}</span>
          </button>
        )
      })}
    </div>
  )
}

export default AgentDock
