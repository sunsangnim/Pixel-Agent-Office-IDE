import type { AgentInstance, AgentTemplate, DeskStatus, OfficePresence } from '@shared/types'
import DeskIcon from './DeskIcon'

interface AgentDeskProps {
  instance: AgentInstance
  template: AgentTemplate | undefined
  status: DeskStatus
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  roleLabel?: string
  presence: OfficePresence
}

function AgentDesk({ instance, template, status, selected, onSelect, onRemove, roleLabel, presence }: AgentDeskProps) {
  return (
    <div
      className={`desk desk-${status}${selected ? ' desk-selected' : ''}`}
      data-rank={instance.rank}
      data-presence={presence}
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
      {(presence === 'pantry' || presence === 'meeting') && <span className="desk-away">{presence === 'pantry' ? '탕비실' : '회의실'}</span>}
      <div className="desk-label">{template?.name ?? instance.templateId}</div>
      {roleLabel && <div className="desk-role">{instance.rank === 'teamLead' ? '◆ ' : ''}{roleLabel}</div>}
    </div>
  )
}

export default AgentDesk
