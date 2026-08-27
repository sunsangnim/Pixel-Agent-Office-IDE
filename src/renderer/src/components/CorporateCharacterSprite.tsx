import type { CSSProperties } from 'react'
import row1 from '../assets/pixel-office/corporate-roster-row-1-v1.png'
import row2 from '../assets/pixel-office/corporate-roster-row-2-v1.png'
import row3 from '../assets/pixel-office/corporate-roster-row-3-v1.png'
import row4 from '../assets/pixel-office/corporate-roster-row-4-v1.png'

interface CorporateCharacterSpriteProps {
  rosterIndex: number
  className?: string
}

const rosterRows = [row1, row2, row3, row4]
const columnPositions = ['0%', '25%', '50%', '75%', '100%']

function CorporateCharacterSprite({ rosterIndex, className = '' }: CorporateCharacterSpriteProps) {
  const safeIndex = Math.max(0, Math.min(19, rosterIndex))
  const row = Math.floor(safeIndex / 5)
  const column = safeIndex % 5

  return (
    <span
      aria-hidden="true"
      className={`corporate-character-sprite ${className}`.trim()}
      data-roster-index={safeIndex}
      style={{
        '--roster-image': `url(${rosterRows[row]})`,
        '--roster-position': columnPositions[column]
      } as CSSProperties}
    />
  )
}

export default CorporateCharacterSprite
