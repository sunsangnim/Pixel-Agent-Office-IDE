import type { AgentInstance, AgentTemplate, DeskStatus } from '@shared/types'
import DeskIcon from './DeskIcon'

interface AgentDeskProps {
  instance: AgentInstance
  template: AgentTemplate | undefined
  status: DeskStatus
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  roleLabel?: string
}

function AgentDesk({ instance, template, status, selected, onSelect, onRemove, roleLabel }: AgentDeskProps) {
  return (
    <div
      className={`desk desk-${status}${selected ? ' desk-selected' : ''}`}
      onClick={onSelect}
      title={instance.cwd}
    >
      <button
        className="desk-remove"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        ✕
      </button>
      <div className="desk-status-dot" />
      <DeskIcon color={template?.color ?? '#888888'} status={status} />
      <div className="desk-label">{template?.name ?? instance.templateId}</div>
      {roleLabel && <div className="desk-role">{roleLabel}</div>}
    </div>
  )
}

export default AgentDesk
