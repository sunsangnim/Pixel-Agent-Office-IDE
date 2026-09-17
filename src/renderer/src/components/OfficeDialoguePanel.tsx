import { useEffect, useRef, useState } from 'react'
import type { OfficeDialogue } from '../game/officeDialogue'

interface Props { dialogue: OfficeDialogue; remaining: number; onNext: () => void; onClose: () => void }

function OfficeDialoguePanel({ dialogue, remaining, onNext, onClose }: Props) {
  const [visibleCharacters, setVisibleCharacters] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? dialogue.text.length : 0)
  const panelRef = useRef<HTMLElement>(null)
  const complete = visibleCharacters >= dialogue.text.length
  const advance = (): void => { if (complete) onNext(); else setVisibleCharacters(dialogue.text.length) }
  const advanceRef = useRef(advance)
  advanceRef.current = advance
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (complete) return
    const timer = window.setInterval(() => setVisibleCharacters((count) => Math.min(count + 2, dialogue.text.length)), 30)
    return () => window.clearInterval(timer)
  }, [complete, dialogue.text.length])

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      // Chat keeps Enter-to-send and Shift+Enter-to-newline, even while a character speaks.
      if (event.defaultPrevented || event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ||
        target?.closest('input, textarea, select, [contenteditable="true"], .xterm') ||
        document.querySelector('dialog[open], .modal-backdrop')) return
      if (event.key === 'Enter' && !target?.closest('button')) { event.preventDefault(); advanceRef.current() }
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])

  return <section ref={panelRef} className="office-dialogue" role="dialog" aria-modal="false"
    aria-label={`${dialogue.displayName}의 대화`} onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}>
    <button className="office-dialogue-close" aria-label="대화 닫기" onClick={onClose}>×</button>
    <div className="office-dialogue-main">
      <div className="office-dialogue-text" aria-live="polite" aria-atomic="true">
        <span className="sr-only">{dialogue.text}</span>
        <span aria-hidden="true">{dialogue.text.slice(0, visibleCharacters)}</span>
      </div>
      <div className="office-dialogue-footer">
        <span>Enter · 계속{remaining > 0 ? ` / 남은 대화 ${remaining}` : ''}</span>
        <button onClick={advance}>{!complete ? '전체 보기' : remaining > 0 ? '다음' : '확인'} <span aria-hidden="true">▾</span></button>
      </div>
    </div>
    <figure className="office-dialogue-speaker">
      <div className="office-dialogue-portrait"><img src={dialogue.portraitUrl} alt="" /></div>
      <figcaption>{dialogue.displayName}</figcaption>
    </figure>
  </section>
}

export default OfficeDialoguePanel
