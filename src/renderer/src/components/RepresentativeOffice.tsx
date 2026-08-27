import DeskIcon from './DeskIcon'
import CorporateCharacterSprite from './CorporateCharacterSprite'

function RepresentativeOffice() {
  return (
    <section className="representative-office" aria-label="김태호 대표실">
      <h3 className="representative-office-title">대표실</h3>
      <div className="representative-picture" aria-hidden="true" />
      <div className="representative-desk" aria-label="대표 데스크">
        <DeskIcon color="#476ba7" status="idle" />
        <CorporateCharacterSprite rosterIndex={0} className="representative-character" />
      </div>
      <div className="representative-bookcase" aria-label="대표실 서류 책장"><i /><i /><i /></div>
      <div className="representative-sofa" aria-label="대표실 소파"><i /><i /></div>
      <div className="representative-plant" aria-label="대표실 화분"><i /><i /><i /></div>
      <div className="representative-side-table" aria-label="대표실 사이드 테이블"><i /></div>
      <div className="representative-floor-lamp" aria-label="대표실 스탠드 조명"><i /></div>
      <div className="representative-glass-front" aria-label="대표실 전면 유리벽과 문">
        <span className="representative-glass-door"><i /></span>
        <span className="representative-glass-panel" />
      </div>
    </section>
  )
}

export default RepresentativeOffice
