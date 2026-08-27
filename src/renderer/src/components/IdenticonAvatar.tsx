import { identiconCells } from '../lib/identicon'

interface IdenticonAvatarProps {
  seed: string
  color: string
  size?: number
}

function IdenticonAvatar({ seed, color, size = 32 }: IdenticonAvatarProps) {
  const cells = identiconCells(seed)
  return (
    <svg
      viewBox="0 0 5 5"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="identicon-avatar"
    >
      <rect x="0" y="0" width="5" height="5" fill="#1c1c26" />
      {cells.map(
        (filled, i) =>
          filled && <rect key={i} x={i % 5} y={Math.floor(i / 5)} width="1" height="1" fill={color} />
      )}
    </svg>
  )
}

export default IdenticonAvatar
