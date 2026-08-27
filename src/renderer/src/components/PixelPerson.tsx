import type { CSSProperties } from 'react'
import CorporateCharacterSprite from './CorporateCharacterSprite'

interface PixelPersonProps {
  color: string
  name: string
  activity?: string
  rosterIndex: number
}

function PixelPerson({ color, name, activity, rosterIndex }: PixelPersonProps) {
  return (
    <div className={`room-agent${activity ? ' room-agent-active' : ''}`} style={{ '--agent-color': color } as CSSProperties} title={`${name}${activity ? ` · ${activity}` : ''}`}>
      <span className="room-agent-sprite"><i className="hair" /><i className="face" /><i className="body" /></span>
      <CorporateCharacterSprite rosterIndex={rosterIndex} className="generated-character-sprite" />
      <span className="room-agent-name">{name}</span>
      {activity && <span className="room-agent-bubble" aria-hidden="true">{activity}</span>}
    </div>
  )
}

export default PixelPerson
