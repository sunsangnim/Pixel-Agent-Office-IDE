import { useEffect, useRef, useState } from 'react'
import type { OfficeDialogue, OfficeRequest } from '../game/officeDialogue'
import TerminalPane from './TerminalPane'

interface Props { dialogue: OfficeDialogue; request?: OfficeRequest; remaining: number; onNext: () => void; onClose: () => void }

function OfficeDialoguePanel({ dialogue, request, remaining, onNext, onClose }: Props) {
  const [visibleCharacters, setVisibleCharacters] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? dialogue.text.length : 0)
  const panelRef = useRef<HTMLElement>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const complete = visibleCharacters >= dialogue.text.length
  const advance = (): void => { if (request) return; if (complete) onNext(); else setVisibleCharacters(dialogue.text.length) }
  const advanceRef = useRef(advance)
  advanceRef.current = advance
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (complete || request) return
    const timer = window.setInterval(() => setVisibleCharacters((count) => Math.min(count + 2, dialogue.text.length)), 30)
    return () => window.clearInterval(timer)
  }, [complete, dialogue.text.length, Boolean(request)])

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

  const reject = (): void => { if (feedback.trim()) request?.onReject?.(feedback.trim()) }
  return <section ref={panelRef} className={`office-dialogue${request ? ' office-dialogue-request' : ''}`} role="dialog" aria-modal="false"
    data-request-kind={request?.kind}
    aria-label={`${dialogue.displayName}의 대화`} onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}>
    <button className="office-dialogue-close" aria-label="대화 닫기" onClick={onClose}>×</button>
    <div className="office-dialogue-main">
      {request && <div className="office-dialogue-request-title">{request.kind === 'permission' ? '권한 요청' : request.kind === 'approval' ? '작업 승인 요청' : '작업 요청'}</div>}
      <div className="office-dialogue-text" aria-live="polite" aria-atomic="true">
        <span className="sr-only">{dialogue.text}</span>
        <span aria-hidden="true">{request ? dialogue.text : dialogue.text.slice(0, visibleCharacters)}</span>
      </div>
      {request?.kind === 'approval' && <pre className="office-dialogue-spec">{request.specText}</pre>}
      {request && terminalOpen && request.ptyId && <div className="office-dialogue-terminal">
        <p>아래 요청 화면을 클릭한 뒤 표시된 선택지와 키로 응답해주세요.</p>
        <TerminalPane ptyId={request.ptyId} />
      </div>}
      {request?.kind === 'approval' && rejecting && <textarea className="office-dialogue-feedback" aria-label="기획 반려 사유"
        placeholder="수정할 내용을 입력해주세요" value={feedback} onChange={(event) => setFeedback(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); reject() } }} />}
      {request ? <div className="office-dialogue-actions">
        {request.ptyId && request.kind !== 'approval' && <button onClick={() => setTerminalOpen((open) => !open)}>{terminalOpen ? '요청 화면 접기' : request.kind === 'permission' ? '권한 요청 확인 · 응답' : '진행 상황 확인'}</button>}
        {request.kind === 'approval' && <>
          {rejecting ? <button onClick={reject} disabled={!feedback.trim()}>반려 사유 전송</button> : <button onClick={() => setRejecting(true)}>반려</button>}
          <button className="office-dialogue-approve" onClick={request.onApprove}>승인 · 작업 시작</button>
        </>}
        {request.onCancel && <button onClick={request.onCancel}>기획 취소</button>}
        <button onClick={onClose}>나중에 확인</button>
      </div> : <div className="office-dialogue-footer">
        <span>Enter · 계속{remaining > 0 ? ` / 남은 대화 ${remaining}` : ''}</span>
        <button onClick={advance}>{!complete ? '전체 보기' : remaining > 0 ? '다음' : '확인'} <span aria-hidden="true">▾</span></button>
      </div>}
    </div>
    <figure className="office-dialogue-speaker">
      <div className="office-dialogue-portrait"><img src={dialogue.portraitUrl} alt="" /></div>
      <figcaption>{dialogue.displayName}</figcaption>
    </figure>
  </section>
}

export default OfficeDialoguePanel
