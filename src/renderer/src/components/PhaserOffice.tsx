import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { OfficeScene } from '../game/OfficeScene'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, type OfficeWorldSnapshot } from '../game/officeWorld'

interface PhaserOfficeProps {
  snapshot: OfficeWorldSnapshot
  onActorSelect: (profileId: string) => void
}

function PhaserOffice({ snapshot, onActorSelect }: PhaserOfficeProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const sceneRef = useRef<OfficeScene | null>(null)
  const selectRef = useRef(onActorSelect)
  selectRef.current = onActorSelect

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return
    const scene = new OfficeScene()
    sceneRef.current = scene
    scene.setActorSelectHandler((profileId: string) => selectRef.current(profileId))
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: hostRef.current,
      width: OFFICE_WORLD_WIDTH,
      height: OFFICE_WORLD_HEIGHT,
      backgroundColor: '#17221f',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      render: { antialias: false, pixelArt: true, roundPixels: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene
    })
    gameRef.current = game
    return () => {
      scene.setActorSelectHandler(null)
      game.destroy(true)
      gameRef.current = null
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.updateSnapshot(snapshot)
  }, [snapshot])

  return <div className="phaser-office-host" ref={hostRef} aria-label="Phaser 생활형 에이전트 오피스" />
}

export default PhaserOffice
