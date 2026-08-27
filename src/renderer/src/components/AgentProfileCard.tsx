import type { AgentInstance, AgentStatePayload, AgentTemplate, DeskStatus } from '@shared/types'
import IdenticonAvatar from './IdenticonAvatar'

interface AgentProfileCardProps {
  instance: AgentInstance
  template: AgentTemplate | undefined
  status: DeskStatus
  runtimeState?: AgentStatePayload
  task?: string
  selected: boolean
  onToggle: () => void
}

const statusLabel: Record<DeskStatus, string> = {
  idle: '대기 중',
  running: '작업 중',
  error: '오류'
}

function AgentProfileCard({ instance, template, status, runtimeState, task, selected, onToggle }: AgentProfileCardProps) {
  const name = template?.name ?? instance.templateId
  return (
    <button
      className={`profile-card profile-card-${status}${selected ? ' profile-card-selected' : ''}`}
      onClick={onToggle}
      title={instance.cwd}
    >
      {selected && <span className="profile-card-check">✓</span>}
      <IdenticonAvatar seed={instance.instanceId} color={template?.color ?? '#888888'} size={48} />
      <span className="profile-card-name">{name}</span>
      <span className="profile-card-task">
        {runtimeState?.state === 'waiting'
          ? '승인 대기 중'
          : runtimeState?.state === 'completed'
            ? '작업 완료'
            : runtimeState?.state === 'starting'
              ? 'CLI 시작 중'
              : task ?? statusLabel[status]}
      </span>
    </button>
  )
}

export default AgentProfileCard
