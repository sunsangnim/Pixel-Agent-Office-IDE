import type { CSSProperties } from 'react'
import row1 from '../assets/pixel-office/corporate-roster-row-1-v1.png'
import row2 from '../assets/pixel-office/corporate-roster-row-2-v1.png'
import row3 from '../assets/pixel-office/corporate-roster-row-3-v1.png'
import row4 from '../assets/pixel-office/corporate-roster-row-4-v1.png'
import { getCorporateRosterCell } from '../lib/corporateRoster'

interface CorporateCharacterSpriteProps {
  rosterIndex: number
  className?: string
}

const rosterRows = [row1, row2, row3, row4]
function CorporateCharacterSprite({ rosterIndex, className = '' }: CorporateCharacterSpriteProps) {
  const cell = getCorporateRosterCell(rosterIndex)

  return (
    <span
      aria-hidden="true"
      className={`corporate-character-sprite ${className}`.trim()}
      data-roster-index={cell.index}
      style={{
        '--roster-image': `url(${rosterRows[cell.row]})`,
        '--roster-position': cell.position
      } as CSSProperties}
    />
  )
}

export default CorporateCharacterSprite
