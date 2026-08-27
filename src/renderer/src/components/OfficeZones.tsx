import type { AgentInstance, AgentTemplate, OfficePresence } from '@shared/types'
import PixelPerson from './PixelPerson'

interface OfficeZonesProps {
  occupants: Array<{ instance: AgentInstance; template?: AgentTemplate; presence: OfficePresence }>
}

function OfficeZones({ occupants }: OfficeZonesProps) {
  const pantryAgents = occupants.filter((occupant) => occupant.presence === 'pantry')
  const meetingAgents = occupants.filter((occupant) => occupant.presence === 'meeting')
  return (
    <div className="office-zones">
      <div className="zone zone-pantry">
        <span className="zone-label">탕비실</span>
        <div className="pantry-fridge" />
        <div className="pantry-counter"><span>☕</span><span>🍪</span><span>🥤</span><span>🍫</span></div>
        <div className="zone-occupants">
          {pantryAgents.map(({ instance, template }) => <PixelPerson key={instance.instanceId} color={template?.color ?? '#888'} name={`${template?.name ?? 'Agent'} ${instance.slotIndex}`} activity="휴식 중" />)}
        </div>
      </div>
      <div className="zone zone-meeting">
        <span className="zone-label">회의실</span>
        <div className="meeting-tv" />
        <div className="meeting-chairs-row"><span className="chair" /><span className="chair" /><span className="chair" /></div>
        <div className="zone-occupants meeting-occupants">
          {meetingAgents.map(({ instance, template }) => <PixelPerson key={instance.instanceId} color={template?.color ?? '#888'} name={`${template?.name ?? 'Agent'} ${instance.slotIndex}`} activity="대기 회의" />)}
        </div>
        <div className="meeting-table"><span className="meeting-head-seat">💻</span></div>
        <div className="meeting-chairs-row"><span className="chair" /><span className="chair" /><span className="chair" /></div>
      </div>
      <div className="zone zone-entrance">
        <span className="zone-label">출입구</span>
        <div className="elevator-door">
          <span className="elevator-door-leaf" /><span className="elevator-door-leaf" />
          <span className="elevator-indicator">▲</span>
        </div>
      </div>
    </div>
  )
}

export default OfficeZones
