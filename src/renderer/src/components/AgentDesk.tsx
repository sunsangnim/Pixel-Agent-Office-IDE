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
      {(presence === 'pantry' || presence === 'meeting' || presence === 'requestingHelp') && (
        <span className={`desk-away${presence === 'requestingHelp' ? ' desk-help' : ''}`}>
          {presence === 'pantry' ? '탕비실' : presence === 'meeting' ? '회의실' : '승인 필요!'}
        </span>
      )}
      <div className="desk-label">{template?.name ?? instance.templateId}</div>
      {roleLabel && <div className="desk-role">{instance.rank === 'teamLead' ? '◆ ' : ''}{roleLabel}</div>}
    </div>
  )
}

export default AgentDesk
