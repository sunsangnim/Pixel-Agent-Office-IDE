import { useState } from 'react'

interface PlanApprovalModalProps {
  title: string
  specText: string | null
  onApprove: () => void
  onReject: (feedback: string) => void
  onClose: () => void
}

function PlanApprovalModal({ title, specText, onApprove, onReject, onClose }: PlanApprovalModalProps) {
  const [rejecting, setRejecting] = useState(false)
  const [feedback, setFeedback] = useState('')

  const submitReject = (): void => {
    if (!feedback.trim()) return
    onReject(feedback.trim())
    setFeedback('')
    setRejecting(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel plan-approval-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>기획 검토: {title}</h2>
          <button onClick={onClose}>닫기</button>
        </div>

        {specText === null ? (
          <p className="chat-empty">기획서를 불러오는 중...</p>
        ) : (
          <pre className="plan-spec-text">{specText}</pre>
        )}

        {rejecting ? (
          <div className="plan-reject-form">
            <textarea
              className="plan-reject-input"
              placeholder="반려 사유를 입력하면 에이전트가 기획서를 다시 작성합니다"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              autoFocus
            />
            <div className="plan-approval-actions">
              <button onClick={() => setRejecting(false)}>취소</button>
              <button className="plan-reject-submit" onClick={submitReject} disabled={!feedback.trim()}>
                반려 사유 전송
              </button>
            </div>
          </div>
        ) : (
          <div className="plan-approval-actions">
            <button className="plan-reject-btn" onClick={() => setRejecting(true)}>반려</button>
            <button className="plan-approve-btn" onClick={onApprove}>승인 · Phase 1 시작</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlanApprovalModal
