import { useEffect, useRef, useState } from 'react'
import type { AgentInstance, AgentTemplate } from '@shared/types'
import { stripAnsi } from '../lib/ansi'

const RESPONSE_IDLE_MS = 1500

export interface ChatMessage {
  id: string
  kind: 'user' | 'agent' | 'system'
  authorName: string
  authorColor: string
  authorSeed: string
  text: string
}

interface CaptureEntry {
  instanceId: string
  buffer: string
  timer: ReturnType<typeof setTimeout>
}

export function useAgentChat(instances: AgentInstance[], templates: AgentTemplate[]) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastTaskByInstance, setLastTaskByInstance] = useState<Record<string, string>>({})

  // kept fresh every render so the long-lived pty:data listener below always
  // sees current instances/templates without needing to resubscribe
  const instancesRef = useRef(instances)
  instancesRef.current = instances
  const templatesRef = useRef(templates)
  templatesRef.current = templates

  const capturesRef = useRef(new Map<string, CaptureEntry>())

  useEffect(() => {
    const unsubscribe = window.api.pty.onData(({ ptyId, data }) => {
      const capture = capturesRef.current.get(ptyId)
      if (!capture) return

      capture.buffer += data
      clearTimeout(capture.timer)
      capture.timer = setTimeout(() => {
        capturesRef.current.delete(ptyId)
        const text = stripAnsi(capture.buffer)
        if (!text) return

        const instance = instancesRef.current.find((i) => i.instanceId === capture.instanceId)
        const template = instance
          ? templatesRef.current.find((t) => t.id === instance.templateId)
          : undefined

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            kind: 'agent',
            authorName: template?.name ?? '에이전트',
            authorColor: template?.color ?? '#888888',
            authorSeed: capture.instanceId,
            text
          }
        ])
      }, RESPONSE_IDLE_MS)
    })

    return unsubscribe
  }, [])

  const sendPrompt = (text: string, targetInstanceIds: string[], sourceInstances = instances): void => {
    const targets = sourceInstances.filter((i) => targetInstanceIds.includes(i.instanceId))
    if (targets.length === 0) return

    const targetNames = targets.map(
      (t) => templates.find((tpl) => tpl.id === t.templateId)?.name ?? t.templateId
    )

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: 'user',
        authorName: '나',
        authorColor: '#6ea8fe',
        authorSeed: 'me',
        text
      },
      {
        id: crypto.randomUUID(),
        kind: 'system',
        authorName: '',
        authorColor: '',
        authorSeed: '',
        text:
          targets.length === 1
            ? `${targetNames[0]}에게 전달`
            : `${targets.length}개 에이전트에게 분배: ${targetNames.join(', ')}`
      }
    ])

    setLastTaskByInstance((prev) => {
      const next = { ...prev }
      for (const instance of targets) next[instance.instanceId] = text
      return next
    })

    for (const instance of targets) {
      const existing = capturesRef.current.get(instance.ptyId)
      clearTimeout(existing?.timer)
      capturesRef.current.set(instance.ptyId, {
        instanceId: instance.instanceId,
        buffer: '',
        timer: setTimeout(() => {}, 0)
      })
      window.api.pty.write(instance.ptyId, `${text}\r`)
    }
  }

  return { messages, lastTaskByInstance, sendPrompt }
}
