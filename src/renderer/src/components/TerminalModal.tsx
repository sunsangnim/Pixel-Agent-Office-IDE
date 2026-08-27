import TerminalPane from './TerminalPane'

interface TerminalModalProps {
  ptyId: string
  title: string
  onClose: () => void
}

function TerminalModal({ ptyId, title, onClose }: TerminalModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel terminal-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}>닫기</button>
        </div>
        <TerminalPane ptyId={ptyId} />
      </div>
    </div>
  )
}

export default TerminalModal
