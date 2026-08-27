import type { CSSProperties } from 'react'

interface PixelPersonProps {
  color: string
  name: string
  activity?: string
}

function PixelPerson({ color, name, activity }: PixelPersonProps) {
  return (
    <div className="room-agent" style={{ '--agent-color': color } as CSSProperties} title={`${name}${activity ? ` · ${activity}` : ''}`}>
      <span className="room-agent-sprite"><i className="hair" /><i className="face" /><i className="body" /></span>
      <span className="room-agent-name">{name}</span>
      {activity && <span className="room-agent-bubble">{activity}</span>}
    </div>
  )
}

export default PixelPerson
