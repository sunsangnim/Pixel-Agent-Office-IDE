import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { OfficeScene } from '../game/OfficeScene'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, type OfficeWorldSnapshot } from '../game/officeWorld'
import LayoutEditorPanel from './LayoutEditorPanel'

interface PhaserOfficeProps {
  snapshot: OfficeWorldSnapshot
  teamTemplateIds: string[]
  onActorSelect: (profileId: string) => void
  onDeskCountsChange: (counts: number[]) => void
}

function PhaserOffice({ snapshot, teamTemplateIds, onActorSelect, onDeskCountsChange }: PhaserOfficeProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const sceneRef = useRef<OfficeScene | null>(null)
  const selectRef = useRef(onActorSelect)
  selectRef.current = onActorSelect
  const deskCountsRef = useRef(onDeskCountsChange)
  deskCountsRef.current = onDeskCountsChange
  const [scene, setScene] = useState<OfficeScene | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return
    const scene = new OfficeScene()
    sceneRef.current = scene
    scene.setActorSelectHandler((profileId: string) => selectRef.current(profileId))
    scene.setDeskCountsHandler((counts: number[]) => deskCountsRef.current(counts))
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
    const handleLayoutEditing = (event: Event): void => {
      const nextEditing = Boolean((event as CustomEvent<{ editing: boolean }>).detail?.editing)
      scene.setLayoutEditing(nextEditing)
      setEditing(nextEditing)
    }
    window.addEventListener('office:layout-edit', handleLayoutEditing)
    scene.setLayoutEditing(false)
    gameRef.current = game
    setScene(scene)
    return () => {
      window.removeEventListener('office:layout-edit', handleLayoutEditing)
      scene.setActorSelectHandler(null)
      scene.setDeskCountsHandler(null)
      game.destroy(true)
      gameRef.current = null
      sceneRef.current = null
      setScene(null)
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.updateSnapshot(snapshot)
  }, [snapshot])

  useEffect(() => {
    sceneRef.current?.setTeamTemplateIds(teamTemplateIds)
  }, [teamTemplateIds])

  return (
    <div className="phaser-office-wrap">
      <div className="phaser-office-host" ref={hostRef} aria-label="Phaser 생활형 에이전트 오피스" />
      {editing && <LayoutEditorPanel scene={scene} />}
    </div>
  )
}

export default PhaserOffice
