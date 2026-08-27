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
  selectedTargetIds: Set<string>
  onSend: (text: string) => void | Promise<void>
}

function ChatPanel({
  instances,
  templates,
  workFolder,
  onChooseFolder,
  messages,
  selectedTargetIds,
  onSend
}: ChatPanelProps) {
  const [text, setText] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const mentionOptions = [
    { token: '@Claude', name: 'Claude', description: '코딩·아키텍처' },
    { token: '@Codex', name: 'Codex', description: '상호작용·검증' },
    { token: '@Antigravity', name: 'Antigravity', description: '이미지·픽셀 자산' }
  ]
  const mentionMatch = text.match(/@([^\s@]*)$/)
  const mentionQuery = mentionMatch?.[1].toLowerCase() ?? ''
  const visibleMentions = mentionMatch
    ? mentionOptions.filter((option) => option.name.toLowerCase().startsWith(mentionQuery))
    : []

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const selectedNames = instances
    .filter((i) => selectedTargetIds.has(i.instanceId))
    .map((i) => templates.find((t) => t.id === i.templateId)?.name ?? i.templateId)

  const send = (): void => {
    if (!text.trim()) return
    void onSend(text)
    setText('')
  }

  const insertMention = (token: string): void => {
    const prefix = mentionMatch && mentionMatch.index !== undefined
      ? text.slice(0, mentionMatch.index)
      : `${text}${text && !text.endsWith(' ') ? ' ' : ''}`
    setText(`${prefix}${token} `)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-user">
          <IdenticonAvatar seed="me-ceo" color="#6ea8fe" size={34} />
          <div className="chat-user-info">
            <span className="chat-user-name">김태호</span>
            <span className="chat-user-title">대표</span>
          </div>
        </div>
        <button
          className="chat-settings-btn"
          onClick={() => window.api.system.openSettings()}
          title="설정"
        >
          ⚙
        </button>
      </div>

      <div className="chat-thread" ref={threadRef}>
        {messages.length === 0 && (
          <p className="chat-empty">
            에이전트를 선택해 직접 지시하거나, 선택 없이 보내 자동 배정할 수 있습니다.
          </p>
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

      <div className="chat-folder-row">
        <span className="chat-folder-label">작업 폴더</span>
        <span className="chat-folder-path" title={workFolder ?? ''}>
          {workFolder ?? '미지정'}
        </span>
        <button onClick={onChooseFolder}>변경</button>
      </div>

      <div className={`chat-selected-row${selectedNames.length === 0 ? ' chat-auto-route' : ''}`}>
        {selectedNames.length > 0 ? `받는 사람: ${selectedNames.join(', ')}` : '받는 사람: 자동 배정'}
      </div>

      <div className="chat-compose">
        <div className="chat-mention-toolbar" aria-label="에이전트 멘션">
          {mentionOptions.map((option) => (
            <button type="button" key={option.token} onClick={() => insertMention(option.token)}>
              {option.token}
            </button>
          ))}
        </div>
        {visibleMentions.length > 0 && (
          <div className="chat-mention-menu" role="listbox" aria-label="에이전트 목록">
            {visibleMentions.map((option) => (
              <button
                type="button"
                role="option"
                key={option.token}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(option.token)}
              >
                <span>{option.token}</span>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="@를 입력해 에이전트를 선택하고 지시하세요"
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
            disabled={!text.trim()}
          >
            ▷
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatPanel
