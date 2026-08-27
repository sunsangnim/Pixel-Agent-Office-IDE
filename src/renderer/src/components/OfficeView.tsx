import type { AgentInstance, AgentTemplate, DeskStatus } from '@shared/types'
import AgentDesk from './AgentDesk'
import OfficeZones from './OfficeZones'
import { BUILT_IN_TEAM_IDS } from '@shared/orchestrationPolicy'

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
  const teamTemplates = BUILT_IN_TEAM_IDS.map((id) => templates.find((template) => template.id === id))

  return (
    <div className="office-room">
      <OfficeZones />

      <div className="office-desk-floor">
        <span className="office-deco office-deco-tl">🌿</span>
        <span className="office-deco office-deco-tr">🖨️</span>
        <span className="office-deco office-deco-bl">🚰</span>
        <span className="office-deco office-deco-br">🪴</span>

        <div className="office-grid office-grid-fixed">
          {teamTemplates.flatMap((template, teamIndex) => {
            const teamInstances = instances
              .filter((instance) => instance.templateId === template?.id)
              .sort((a, b) => a.slotIndex - b.slotIndex)
            return Array.from({ length: 4 }, (_, seatIndex) => {
              const instance = teamInstances.find((candidate) => candidate.slotIndex === seatIndex)
              const roleLabel = seatIndex === 0 ? '팀장' : `하위 세션 ${seatIndex}`
              if (!instance) {
                return (
                  <div className="desk desk-vacant" data-presence="offDuty" key={`${teamIndex}-${seatIndex}`}>
                    <div className="vacant-chair"><i /></div>
                    <div className="desk-label">{template?.name ?? ['Claude Code', 'Codex CLI', 'Antigravity CLI'][teamIndex]}</div>
                    <div className="desk-role">{roleLabel} · 미출근</div>
                  </div>
                )
              }
              return (
                <AgentDesk
                  key={instance.instanceId}
                  instance={instance}
                  template={template}
                  status={statuses[instance.ptyId] ?? 'idle'}
                  selected={instance.instanceId === selectedInstanceId}
                  onSelect={() => onSelect(instance.instanceId)}
                  onRemove={() => onRemove(instance.instanceId)}
                  roleLabel={roleLabel}
                />
              )
            })
          })}
        </div>
      </div>
    </div>
  )
}

export default OfficeView
