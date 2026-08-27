import DeskIcon from './DeskIcon'

function RepresentativeOffice() {
  return (
    <section className="representative-office" aria-label="김태호 대표실">
      <h3 className="representative-office-title">대표실</h3>
      <div className="representative-picture" aria-hidden="true" />
      <div className="representative-wall-lamp" aria-hidden="true"><i /></div>
      <div className="representative-desk" aria-label="대표 데스크">
        <DeskIcon color="#476ba7" status="idle" />
      </div>
      <div className="representative-sofa" aria-hidden="true"><i /><i /></div>
      <div className="representative-plant" aria-hidden="true"><i /><i /><i /></div>
      <div className="representative-side-table" aria-hidden="true"><i /></div>
      <div className="representative-glass-front" aria-label="대표실 전면 유리벽과 문">
        <span className="representative-glass-panel" />
        <span className="representative-glass-door"><i /></span>
        <span className="representative-glass-panel" />
      </div>
    </section>
  )
}

export default RepresentativeOffice
