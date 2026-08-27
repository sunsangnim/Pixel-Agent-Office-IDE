import type { DeskStatus } from '@shared/types'
import type { CSSProperties } from 'react'

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
    <div className="desk-asset-wrap" style={{ '--desk-accent': color } as CSSProperties}>
      <svg className="desk-sprite" viewBox="0 0 120 96" width="120" height="96" shapeRendering="crispEdges">
      <g className="pixel-chair">
        <path fill="#b88758" d="M48 70h24v18H48z" />
        <path fill="#875d3f" d="M45 73h3v15h-3zm27 0h3v15h-3zM51 88h4v8h-4zm14 0h4v8h-4z" />
        <path fill="#d2a36d" d="M51 73h18v12H51z" />
      </g>
      <g className="pixel-worker">
        {/* afro silhouette */}
        <path fill="#24140f" d="M31 5h8V1h20v4h8v4h7v6h5v16h-5v7h-8v4H30v-4h-8v-7h-5V15h5V9h9z" />
        <path fill="#4b2517" d="M31 9h9V5h18v4h10v5h6v12h-5v7h-8V18H34v15h-8v-7h-4V15h9z" />
        <path fill="#6d3520" d="M26 13h8V9h8v4h-5v5h-7v7h-5zM59 9h8v5h5v9h-5v-5h-8z" />
        {/* face, neck, suit and tie */}
        <path fill="#9a5134" d="M37 17h23v20h-5v8H42v-8h-5z" />
        <path fill="#713722" d="M37 18h7v5h-3v11h-4zM55 18h5v16h-5z" />
        <rect x="42" y="27" width="13" height="4" fill="#b76949" />
        <path fill={color} d="M29 43h13l6 7 7-7h13l7 8v25H21V51z" />
        <path fill="#e8e3d7" d="M40 43h5l3 5 3-5h6l-3 14H43z" />
        <path fill="#18263e" d="M46 48h4l2 5-4 11-4-11z" />
        <path fill="#16233a" d="M29 43h9l5 23-6-7-3 17h-8V51zM58 43h10l7 8v25H62l-2-17-7 7z" opacity=".62" />
        <rect x="21" y="55" width="7" height="20" fill={color} />
        <rect x="68" y="55" width="7" height="20" fill={color} />
      </g>
      {/* clear front-facing pixel workstation */}
      <path fill="#20232b" d="M42 8h37v29H42z" />
      <path fill="#59636b" d="M45 11h31v23H45z" />
      <rect x="49" y="15" width="23" height="15" fill={screenColor[status]} className={status === 'running' ? 'desk-screen-glow' : undefined} />
      <path fill="#afb9b4" d="M56 37h9v7h10v4H46v-4h10z" />
      <path fill="#7b8380" d="M50 44h21v3H50z" />
      <path fill="#d9aa69" d="M7 48h106v10H7z" />
      <path fill="#b77c45" d="M7 58h106v7H7z" />
      <path fill="#754b31" d="M12 65h8v14h-8zm88 0h8v14h-8z" />
      <path fill="#f0e2c7" d="M43 53h35v5H43z" />
      <path fill="#8e8171" d="M47 54h27v2H47z" />
      <path fill="#e8ded0" d="M86 51h7v6h-7z" />
      <path fill="#88796b" d="M88 52h3v3h-3z" />
      </svg>
    </div>
  )
}

export default DeskIcon
