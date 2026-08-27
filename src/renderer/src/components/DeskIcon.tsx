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
        <path fill="#5f4637" d="M45 70h30v19H45zM42 75h3v13h-3zm33 0h3v13h-3z" />
        <path fill="#9b704f" d="M48 72h24v14H48z" />
        <path fill="#c69a68" d="M51 74h18v8H51z" />
        <path fill="#4d392f" d="M48 86h5v10h-5zm19 0h5v10h-5zM43 94h12v2H43zm22 0h12v2H65z" />
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
      <path fill="#171b20" d="M40 6h41v32H40z" />
      <path fill="#404a50" d="M43 9h35v26H43z" />
      <path fill="#718087" d="M46 12h29v20H46z" />
      <rect x="49" y="15" width="23" height="14" fill={screenColor[status]} className={status === 'running' ? 'desk-screen-glow' : undefined} />
      <path fill="#ffffff" d="M51 16h10v2H51z" opacity=".25" />
      <path fill="#222931" d="M57 38h8v6h12v4H45v-4h12z" />
      <path fill="#89918d" d="M49 44h24v2H49z" />
      <path fill="#71452d" d="M5 49h110v13H5z" />
      <path fill="#edbd78" d="M7 47h106v10H7z" />
      <path fill="#ffd894" d="M9 48h102v2H9z" />
      <path fill="#c1844c" d="M7 57h106v5H7z" />
      <path fill="#5d3928" d="M10 62h10v18h-10zm90 0h10v18h-10z" />
      <path fill="#986139" d="M13 62h7v13h-7zm87 0h7v13h-7z" />
      <path fill="#4b3024" d="M8 78h14v3H8zm90 0h14v3H98z" />
      <path fill="#ddd2bd" d="M39 51h42v7H39z" />
      <path fill="#7f7569" d="M43 53h4v2h-4zm6 0h4v2h-4zm6 0h4v2h-4zm6 0h4v2h-4zm6 0h4v2h-4zm6 0h4v2h-4z" />
      <path fill="#eee6d9" d="M88 50h8v8h-8z" />
      <path fill="#766b62" d="M91 52h3v4h-3z" />
      <path fill="#483126" d="M17 82h86v3H17z" opacity=".25" />
      </svg>
    </div>
  )
}

export default DeskIcon
