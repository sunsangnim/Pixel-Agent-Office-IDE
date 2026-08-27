import { useState } from 'react'
import type { AgentInstance, AgentTemplate } from '@shared/types'

interface PromptPanelProps {
  instances: AgentInstance[]
  templates: AgentTemplate[]
  onSend: (text: string, targetInstanceIds: string[]) => void
}

interface SendLogEntry {
  id: string
  text: string
  targetNames: string[]
}

function PromptPanel({ instances, templates, onSend }: PromptPanelProps) {
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<SendLogEntry[]>([])

  const templateName = (templateId: string): string =>
    templates.find((t) => t.id === templateId)?.name ?? templateId

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
    setLog((prev) =>
      [
        {
          id: crypto.randomUUID(),
          text,
          targetNames: targets.map((t) => templateName(t.templateId))
        },
        ...prev
      ].slice(0, 20)
    )
    setText('')
  }

  return (
    <div className="prompt-panel">
      <h2>프롬프트</h2>

      <div className="prompt-targets">
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

      <textarea
        className="prompt-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="선택한 에이전트에게 보낼 프롬프트를 입력하세요"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            send()
          }
        }}
      />

      <button onClick={send} disabled={!text.trim() || selected.size === 0}>
        전송 ({selected.size})
      </button>

      <div className="prompt-log">
        {log.map((entry) => (
          <div key={entry.id} className="prompt-log-entry">
            <span className="prompt-log-targets">{entry.targetNames.join(', ')}</span>
            <span className="prompt-log-text">{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PromptPanel
