import type { DeskStatus } from '@shared/types'

interface DeskIconProps {
  color: string
  status: DeskStatus
}

const screenColor: Record<DeskStatus, string> = {
  idle: '#3a3a48',
  running: '#f5c542',
  error: '#ff5c5c'
}

function DeskIcon({ color, status }: DeskIconProps) {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" shapeRendering="crispEdges">
      {/* chair back, behind everything */}
      <rect x="16" y="12" width="32" height="6" fill="#2b2b33" />

      {/* character */}
      <rect x="25" y="4" width="14" height="4" fill="#2b2b33" />
      <rect x="26" y="6" width="12" height="10" fill="#f2c9a0" />
      <rect x="20" y="16" width="24" height="12" fill={color} />
      <rect x="16" y="18" width="4" height="8" fill={color} />
      <rect x="44" y="18" width="4" height="8" fill={color} />

      {/* desk + monitor */}
      <rect x="20" y="26" width="24" height="16" fill="#222226" />
      <rect
        x="23"
        y="29"
        width="18"
        height="10"
        fill={screenColor[status]}
        className={status === 'running' ? 'desk-screen-glow' : undefined}
      />
      <rect x="6" y="42" width="52" height="6" fill="#8a5a3b" />
      <rect x="6" y="48" width="52" height="4" fill="#6b4327" />

      {/* keyboard + mouse, on the desk in front of the monitor */}
      <rect x="19" y="44" width="18" height="2.5" fill="#17171b" />
      <rect x="40" y="44" width="3" height="3" fill="#17171b" />
    </svg>
  )
}

export default DeskIcon
