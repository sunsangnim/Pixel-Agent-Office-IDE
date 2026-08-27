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
    <svg className="desk-sprite" viewBox="0 0 96 92" width="96" height="92" shapeRendering="crispEdges">
      <g className="pixel-worker">
        {/* chair and afro silhouette */}
        <path fill="#252431" d="M26 33h44v35H26zM20 42h8v22h-8zM68 42h8v22h-8z" />
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
      {/* monitor and workstation */}
      <path fill="#171820" d="M32 52h35v25H32z" />
      <rect x="36" y="56" width="27" height="16" fill={screenColor[status]} className={status === 'running' ? 'desk-screen-glow' : undefined} />
      <path fill="#232b35" d="M39 59h12v2H39zm0 4h18v2H39zm0 4h8v2h-8z" opacity=".8" />
      <path fill="#171820" d="M46 77h7v5h8v3H38v-3h8z" />
      <path fill="#9a5a34" d="M5 80h86v7H5z" />
      <path fill="#63371f" d="M5 87h86v5H5zM10 92h7v-9h-7zm69 0h7v-9h-7z" />
      <path fill="#20212a" d="M24 83h28v3H24zm34 0h6v4h-6z" />
    </svg>
  )
}

export default DeskIcon
