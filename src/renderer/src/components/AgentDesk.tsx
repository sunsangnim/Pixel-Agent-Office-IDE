import type { CSSProperties } from 'react'
import type { AgentInstance, AgentTemplate, DeskStatus } from '@shared/types'

interface AgentDeskProps {
  instance: AgentInstance
  template: AgentTemplate | undefined
  status: DeskStatus
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}

function AgentDesk({ instance, template, status, selected, onSelect, onRemove }: AgentDeskProps) {
  return (
    <div
      className={`desk desk-${status}${selected ? ' desk-selected' : ''}`}
      style={{ '--desk-color': template?.color ?? '#888888' } as CSSProperties}
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
      <div className="desk-surface">
        <div className="desk-avatar" />
      </div>
      <div className="desk-label">{template?.name ?? instance.templateId}</div>
    </div>
  )
}

export default AgentDesk
