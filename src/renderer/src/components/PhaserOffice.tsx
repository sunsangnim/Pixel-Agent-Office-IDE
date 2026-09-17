import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { OFFICE_RENDER_SCALE, OfficeScene } from '../game/OfficeScene'
import { OFFICE_WORLD_HEIGHT, OFFICE_WORLD_WIDTH, type OfficeWorldSnapshot } from '../game/officeWorld'
import LayoutEditorPanel from './LayoutEditorPanel'
import OfficeDialoguePanel from './OfficeDialoguePanel'
import type { OfficeDialogue, OfficeRequest } from '../game/officeDialogue'
import type { ChatMessage } from '../lib/chatHistory'

interface PhaserOfficeProps {
  snapshot: OfficeWorldSnapshot
  teamTemplateIds: string[]
  onActorSelect: (profileId: string) => void
  onDeskCountsChange: (counts: number[]) => void
  messages: ChatMessage[]
  requests: OfficeRequest[]
  onConversationChange: (profileId: string) => void
}

function PhaserOffice({ snapshot, teamTemplateIds, onActorSelect, onDeskCountsChange, messages, requests, onConversationChange }: PhaserOfficeProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const sceneRef = useRef<OfficeScene | null>(null)
  const selectRef = useRef(onActorSelect)
  selectRef.current = onActorSelect
  const deskCountsRef = useRef(onDeskCountsChange)
  deskCountsRef.current = onDeskCountsChange
  const [scene, setScene] = useState<OfficeScene | null>(null)
  const [editing, setEditing] = useState(false)
  const [dialogues, setDialogues] = useState<OfficeDialogue[]>([])
  const seenMessages = useRef(new Set(messages.map((message) => message.id)))
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const dismissedRequests = useRef(new Set<string>())
  const requestKey = requests.map((request) => request.id).join('|')
  const conversationRef = useRef(onConversationChange)
  conversationRef.current = onConversationChange

  useEffect(() => {
    for (const id of dismissedRequests.current) if (!requests.some((request) => request.id === id)) dismissedRequests.current.delete(id)
    setActiveRequestId((id) => {
      const current = requests.find((request) => request.id === id)
      const permission = requests.find((request) => request.kind === 'permission' && !dismissedRequests.current.has(request.id))
      if (permission && (!current || current.kind === 'planning')) return permission.id
      return current?.id ?? requests.find((request) => !dismissedRequests.current.has(request.id))?.id ?? null
    })
  }, [requestKey])

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return
    const scene = new OfficeScene()
    sceneRef.current = scene
    scene.setActorSelectHandler((profileId: string) => selectRef.current(profileId))
    scene.setDeskCountsHandler((counts: number[]) => deskCountsRef.current(counts))
    scene.setDialogueHandler((dialogue) => setDialogues((queue) => [...queue, dialogue]))
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: hostRef.current,
      // Draw at twice the logical world size so text remains sharp when the
      // office fills a large window. The scene camera keeps world coordinates.
      width: OFFICE_WORLD_WIDTH * OFFICE_RENDER_SCALE,
      height: OFFICE_WORLD_HEIGHT * OFFICE_RENDER_SCALE,
      backgroundColor: '#17221f',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      render: { antialias: false, pixelArt: true, roundPixels: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene
    })
    const handleLayoutEditing = (event: Event): void => {
      const requested = Boolean((event as CustomEvent<{ editing: boolean }>).detail?.editing)
      const accepted = scene.setLayoutEditing(requested)
      // Refused only when leaving edit mode with something still colliding -
      // stay in editing state and tell ChatPanel's toggle button to match.
      if (!requested && !accepted) {
        window.dispatchEvent(new CustomEvent('office:layout-edit-rejected'))
      }
      setEditing(accepted ? requested : true)
    }
    window.addEventListener('office:layout-edit', handleLayoutEditing)
    scene.setLayoutEditing(false)
    gameRef.current = game
    setScene(scene)
    return () => {
      window.removeEventListener('office:layout-edit', handleLayoutEditing)
      scene.setActorSelectHandler(null)
      scene.setDeskCountsHandler(null)
      scene.setDialogueHandler(null)
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
    setDialogues((queue) => {
      const active = queue.filter((dialogue) => !dialogue.id.startsWith('visit-') ||
        snapshot.actors.some((actor) => actor.profileId === dialogue.profileId && actor.presence === 'representativeVisit'))
      return active.length === queue.length ? queue : active
    })
  }, [snapshot])

  useEffect(() => {
    sceneRef.current?.setTeamTemplateIds(teamTemplateIds)
  }, [teamTemplateIds])

  useEffect(() => {
    if (!scene) return
    for (const message of messages) {
      if (message.kind !== 'agent' || seenMessages.current.has(message.id)) continue
      const actor = snapshot.actors.find((actor) => actor.instanceId === message.authorSeed)
      const dialogue = actor && scene.dialogueForActor(actor, message.text, message.id)
      if (!dialogue) continue
      seenMessages.current.add(message.id)
      setDialogues((queue) => [...queue, dialogue])
    }
  }, [messages, scene, snapshot])

  const activeRequest = requests.find((request) => request.id === activeRequestId)
  const requestActor = activeRequest && snapshot.actors.find((actor) => actor.profileId === activeRequest.profileId)
  const requestDialogue = requestActor && activeRequest && scene?.dialogueForActor(requestActor, activeRequest.text, activeRequest.id)
  const dialogue = requestDialogue || dialogues[0]
  useEffect(() => {
    if (dialogue && !editing) conversationRef.current(dialogue.profileId)
  }, [dialogue?.profileId, editing])
  const closeRequest = (): void => {
    if (activeRequestId) dismissedRequests.current.add(activeRequestId)
    setActiveRequestId(requests.find((request) => !dismissedRequests.current.has(request.id))?.id ?? null)
  }

  return (
    <div className="phaser-office-wrap">
      <div className="phaser-office-host" ref={hostRef} aria-label="Phaser 생활형 에이전트 오피스" />
      {editing && <LayoutEditorPanel scene={scene} />}
      {!editing && requests.length > 0 && <div className="office-request-tray" aria-label="대기 중인 요청">
        {requests.map((request) => <button key={request.id} className={request.id === activeRequestId ? 'active' : ''}
          onClick={() => { dismissedRequests.current.delete(request.id); setActiveRequestId(request.id) }}>
          {snapshot.actors.find((actor) => actor.profileId === request.profileId)?.displayName} · {request.kind === 'permission' ? '권한 요청' : request.kind === 'approval' ? '작업 승인 요청' : '작업 요청'}
        </button>)}
      </div>}
      {!editing && dialogue && <OfficeDialoguePanel key={dialogue.id} dialogue={dialogue}
        request={requestDialogue ? activeRequest : undefined}
        remaining={dialogues.length - 1} onNext={() => setDialogues((queue) => queue.slice(1))}
        onClose={requestDialogue ? closeRequest : () => setDialogues([])} />}
    </div>
  )
}

export default PhaserOffice
