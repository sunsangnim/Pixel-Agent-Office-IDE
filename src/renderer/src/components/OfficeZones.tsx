function OfficeZones() {
  return (
    <div className="office-zones">
      <div className="zone zone-pantry">
        <span className="zone-label">탕비실</span>
        <div className="pantry-fridge" />
        <div className="pantry-counter"><span>☕</span><span>🍪</span><span>🥤</span><span>🍫</span></div>
      </div>
      <div className="zone zone-meeting">
        <span className="zone-label">회의실</span>
        <div className="meeting-tv" />
        <div className="meeting-chairs-row"><span className="chair" /><span className="chair" /><span className="chair" /></div>
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
