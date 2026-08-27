import { useEffect, useRef, useState } from 'react'
import type { AgentInstance, AgentTemplate } from '@shared/types'
import type { ChatMessage } from '../hooks/useAgentChat'
import IdenticonAvatar from './IdenticonAvatar'

interface ChatPanelProps {
  instances: AgentInstance[]
  templates: AgentTemplate[]
  workFolder: string | null
  onChooseFolder: () => void
  messages: ChatMessage[]
  onSend: (text: string, targetInstanceIds: string[]) => void
}

function ChatPanel({
  instances,
  templates,
  workFolder,
  onChooseFolder,
  messages,
  onSend
}: ChatPanelProps) {
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const templateName = (id: string): string => templates.find((t) => t.id === id)?.name ?? id

  const toggle = (instanceId: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(instanceId)) next.delete(instanceId)
      else next.add(instanceId)
      return next
    })
  }

  const send = (): void => {
    const targets = instances.filter((i) => selected.has(i.instanceId))
    if (!text.trim() || targets.length === 0) return
    onSend(text, targets.map((t) => t.instanceId))
    setText('')
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-user">
          <span className="chat-user-avatar">나</span>
          <span className="chat-user-name">나</span>
        </div>
        <button
          className="chat-settings-btn"
          onClick={() => window.api.system.openSettings()}
          title="설정"
        >
          ⚙
        </button>
      </div>

      <div className="chat-folder-row">
        <span className="chat-folder-label">폴더</span>
        <span className="chat-folder-path" title={workFolder ?? ''}>
          {workFolder ?? '미지정'}
        </span>
        <button onClick={onChooseFolder}>변경</button>
      </div>

      <div className="chat-thread" ref={threadRef}>
        {messages.length === 0 && (
          <p className="chat-empty">아직 대화가 없습니다. 아래에서 에이전트를 선택하고 지시해보세요.</p>
        )}
        {messages.map((m) =>
          m.kind === 'system' ? (
            <div key={m.id} className="chat-system-line">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`chat-message chat-message-${m.kind}`}>
              <IdenticonAvatar seed={m.authorSeed} color={m.authorColor} size={26} />
              <div className="chat-bubble">
                <div className="chat-author">{m.authorName}</div>
                <div className="chat-text">{m.text}</div>
              </div>
            </div>
          )
        )}
      </div>

      <div className="chat-targets">
        {instances.length === 0 && <p className="prompt-empty">배치된 에이전트가 없습니다.</p>}
        {instances.map((instance) => (
          <label key={instance.instanceId} className="prompt-target-row">
            <input
              type="checkbox"
              checked={selected.has(instance.instanceId)}
              onChange={() => toggle(instance.instanceId)}
            />
            {templateName(instance.templateId)}
          </label>
        ))}
      </div>

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="지시할 내용을 입력하세요"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          className="chat-send-btn"
          onClick={send}
          disabled={!text.trim() || selected.size === 0}
        >
          ▷
        </button>
      </div>
    </div>
  )
}

export default ChatPanel
