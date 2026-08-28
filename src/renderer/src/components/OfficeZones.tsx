import { useDoorState } from '../hooks/useDoorState'

interface OfficeZonesProps {
  now: Date
  elevatorOpen: boolean
  pantryOpen: boolean
  meetingOpen: boolean
}

function OfficeZones({ now, elevatorOpen, pantryOpen, meetingOpen }: OfficeZonesProps) {
  void elevatorOpen
  const pantryState = useDoorState(pantryOpen)
  const meetingState = useDoorState(meetingOpen)
  const digitalTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return (
    <div className="office-zones">
      <div className="zone zone-pantry">
        <span className="zone-label">탕비실</span>
        <div className="pantry-clock" aria-label={`현재 시각 ${now.toLocaleTimeString('ko-KR')}`}>
          <time dateTime={`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}>{digitalTime}</time>
        </div>
        <div className="pantry-fridge" />
        <div className="pantry-counter"><span>☕</span><span>🍪</span><span>🥤</span><span>🍫</span></div>
        <div className="pantry-glass-wall" aria-label="탕비실 전면 유리벽과 통합 출입문">
          <span className="pantry-glass-panel" />
          <span className="pantry-glass-panel" />
          <span className={`office-glass-door pantry-glass-door office-door-${pantryState}`} data-door-state={pantryState}><i /></span>
        </div>
      </div>
      <div className="zone zone-meeting">
        <span className="zone-label">회의실</span>
        <div className="meeting-furniture" aria-label="긴 회의 테이블과 의자">
          <div className="meeting-chairs-row">
            <span className="chair" /><span className="chair" /><span className="chair" />
          </div>
          <div className="meeting-table-row">
            <span className="chair meeting-head-chair" />
            <div className="meeting-table"><span className="meeting-laptop" /></div>
            <span className="chair meeting-end-chair" />
          </div>
          <div className="meeting-chairs-row">
            <span className="chair" /><span className="chair" /><span className="chair" />
          </div>
        </div>
        <span className={`office-glass-door meeting-access-door office-door-${meetingState}`} data-door-state={meetingState} aria-label="회의실 출입문"><i /></span>
      </div>
      <div className="zone zone-entrance">
        <span className="zone-label">출입구</span>
      </div>
    </div>
  )
}

export default OfficeZones
