import type { AgentInstance, AgentStatePayload, AgentTemplate, DeskStatus } from '@shared/types'
import CorporateCharacterSprite from './CorporateCharacterSprite'

interface AgentProfileCardProps {
  instance: AgentInstance
  template: AgentTemplate | undefined
  status: DeskStatus
  runtimeState?: AgentStatePayload
  task?: string
  selected: boolean
  onToggle: () => void
  onOpenDiff: () => void
  displayName: string
  rosterIndex: number
}

const statusLabel: Record<DeskStatus, string> = {
  idle: '대기 중',
  running: '작업 중',
  error: '오류'
}

function AgentProfileCard({ instance, status, runtimeState, task, selected, onToggle, onOpenDiff, displayName, rosterIndex }: AgentProfileCardProps) {
  return (
    <button
      className={`profile-card profile-card-${status}${selected ? ' profile-card-selected' : ''}`}
      onClick={onToggle}
      title={instance.cwd}
    >
      {selected && <span className="profile-card-check">✓</span>}
      {instance.worktreeBranch && (
        <span
          className="profile-card-diff-btn"
          role="button"
          title="변경사항 검토"
          onClick={(e) => {
            e.stopPropagation()
            onOpenDiff()
          }}
        >
          ⇄
        </span>
      )}
      <CorporateCharacterSprite rosterIndex={rosterIndex} className="profile-character" />
      <span className="profile-card-name">{displayName}</span>
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
