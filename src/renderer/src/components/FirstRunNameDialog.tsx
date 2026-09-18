import { useEffect, useRef, useState } from 'react'

export default function FirstRunNameDialog({ onConfirm, onSkip }: {
  onConfirm: (name: string) => void
  onSkip: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <dialog className="first-run-dialog" ref={dialog} onCancel={onSkip} aria-labelledby="first-run-name-title">
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <h2 id="first-run-name-title">대표님 성함을 알려주세요</h2>
        <p>오피스 화면과 채팅에 표시될 이름입니다. 설정에서 언제든 바꿀 수 있어요.</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 홍길동"
          maxLength={20}
        />
        <div className="first-run-dialog-actions">
          <button type="button" className="pill-btn" onClick={onSkip}>나중에</button>
          <button type="submit" className="pill-btn pill-btn-primary" disabled={!name.trim()}>시작하기</button>
        </div>
      </form>
    </dialog>
  )
}
