import DeskIcon from './DeskIcon'

function RepresentativeOffice() {
  return (
    <section className="representative-office" aria-label="김태호 대표실">
      <h3 className="representative-office-title">대표실</h3>
      <div className="representative-picture" aria-hidden="true" />
      <div className="representative-cabinet" aria-hidden="true"><i /><i /><i /></div>
      <div className="representative-desk" aria-label="대표 데스크">
        <DeskIcon color="#476ba7" status="idle" />
        <span className="representative-chair" aria-hidden="true" />
      </div>
      <div className="representative-sofa" aria-hidden="true"><i /><i /></div>
      <div className="representative-plant" aria-hidden="true"><i /><i /><i /></div>
      <div className="representative-glass-door" aria-hidden="true"><i /></div>
    </section>
  )
}

export default RepresentativeOffice

