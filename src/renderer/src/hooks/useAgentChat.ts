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

interface ChildReport {
  childName: string
  text: string
}

export interface AgentAssignment {
  instanceId: string
  prompt: string
  role: string
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
  const pendingReportsRef = useRef(new Map<string, ChildReport[]>())
  const reportTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const flushParentReports = (parentInstanceId: string): void => {
    const parent = instancesRef.current.find((instance) => instance.instanceId === parentInstanceId)
    const reports = pendingReportsRef.current.get(parentInstanceId)
    if (!parent || !reports?.length) {
      pendingReportsRef.current.delete(parentInstanceId)
      return
    }

    if (capturesRef.current.has(parent.ptyId)) {
      const previous = reportTimersRef.current.get(parentInstanceId)
      clearTimeout(previous)
      reportTimersRef.current.set(
        parentInstanceId,
        setTimeout(() => flushParentReports(parentInstanceId), RESPONSE_IDLE_MS)
      )
      return
    }

    pendingReportsRef.current.delete(parentInstanceId)
    reportTimersRef.current.delete(parentInstanceId)
    const reportText = reports
      .map((report, index) => `### 하위 세션 보고 ${index + 1} · ${report.childName}\n${report.text}`)
      .join('\n\n')
    const prompt = `[팀장 취합 단계]\n아래 하위 세션 보고를 검토해 중복을 제거하고, 충돌이나 누락을 확인한 뒤 최종 실행 결과와 다음 조치를 한국어로 정리하세요.\n\n${reportText}`

    capturesRef.current.set(parent.ptyId, {
      instanceId: parent.instanceId,
      buffer: '',
      timer: setTimeout(() => {}, 0)
    })
    setLastTaskByInstance((prev) => ({ ...prev, [parent.instanceId]: '하위 세션 결과 취합' }))
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: 'system',
        authorName: '',
        authorColor: '',
        authorSeed: '',
        text: `${reports.length}개 하위 세션 보고를 팀장에게 전달`
      }
    ])
    window.api.pty.write(parent.ptyId, `${prompt}\r`)
  }

  const queueChildReport = (parentInstanceId: string, report: ChildReport): void => {
    const reports = pendingReportsRef.current.get(parentInstanceId) ?? []
    reports.push(report)
    pendingReportsRef.current.set(parentInstanceId, reports)
    const previous = reportTimersRef.current.get(parentInstanceId)
    clearTimeout(previous)
    reportTimersRef.current.set(
      parentInstanceId,
      setTimeout(() => flushParentReports(parentInstanceId), 350)
    )
  }

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

        if (instance?.parentInstanceId) {
          queueChildReport(instance.parentInstanceId, {
            childName: template?.name ?? '하위 세션',
            text
          })
        }
      }, RESPONSE_IDLE_MS)
    })

    return () => {
      unsubscribe()
      for (const timer of reportTimersRef.current.values()) clearTimeout(timer)
      reportTimersRef.current.clear()
    }
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

  const sendAssignments = (
    originalText: string,
    assignments: AgentAssignment[],
    sourceInstances: AgentInstance[]
  ): void => {
    const resolved = assignments.flatMap((assignment) => {
      const instance = sourceInstances.find((candidate) => candidate.instanceId === assignment.instanceId)
      return instance ? [{ assignment, instance }] : []
    })
    if (resolved.length === 0) return

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: 'user',
        authorName: '나',
        authorColor: '#6ea8fe',
        authorSeed: 'me',
        text: originalText
      },
      {
        id: crypto.randomUUID(),
        kind: 'system',
        authorName: '',
        authorColor: '',
        authorSeed: '',
        text: `${resolved.length}개 세션으로 작업 분해: ${resolved.map(({ assignment }) => assignment.role).join(' · ')}`
      }
    ])

    setLastTaskByInstance((prev) => {
      const next = { ...prev }
      for (const { assignment } of resolved) next[assignment.instanceId] = assignment.role
      return next
    })

    for (const { assignment, instance } of resolved) {
      const existing = capturesRef.current.get(instance.ptyId)
      clearTimeout(existing?.timer)
      capturesRef.current.set(instance.ptyId, {
        instanceId: instance.instanceId,
        buffer: '',
        timer: setTimeout(() => {}, 0)
      })
      window.api.pty.write(instance.ptyId, `${assignment.prompt}\r`)
    }
  }

  return { messages, lastTaskByInstance, sendPrompt, sendAssignments }
}
