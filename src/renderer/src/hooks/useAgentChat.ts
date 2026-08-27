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
  stage: 'task' | 'teamSynthesis' | 'globalSynthesis'
}

interface ChildReport {
  childName: string
  text: string
}

interface GlobalAggregation {
  coordinatorId: string
  expectedLeadIds: Set<string>
  summaries: Map<string, string>
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
  const globalAggregationRef = useRef<GlobalAggregation | null>(null)
  const globalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const addSystemMessage = (text: string): void => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: 'system', authorName: '', authorColor: '', authorSeed: '', text }
    ])
  }

  const flushGlobalAggregation = (): void => {
    const aggregation = globalAggregationRef.current
    if (!aggregation || aggregation.summaries.size < aggregation.expectedLeadIds.size) return
    const coordinator = instancesRef.current.find(
      (instance) => instance.instanceId === aggregation.coordinatorId
    )
    if (!coordinator) {
      globalAggregationRef.current = null
      return
    }
    if (capturesRef.current.has(coordinator.ptyId)) {
      if (globalTimerRef.current) clearTimeout(globalTimerRef.current)
      globalTimerRef.current = setTimeout(flushGlobalAggregation, RESPONSE_IDLE_MS)
      return
    }

    const summaries = Array.from(aggregation.summaries.entries()).map(([leadId, text], index) => {
      const lead = instancesRef.current.find((instance) => instance.instanceId === leadId)
      const template = lead
        ? templatesRef.current.find((candidate) => candidate.id === lead.templateId)
        : undefined
      return `## 팀 보고 ${index + 1} · ${template?.name ?? 'Agent'}\n${text}`
    })
    const prompt = `[총괄 코디네이터 최종 취합]\n아래 팀별 보고를 하나의 최종 결과로 통합하세요. 팀 간 결론이 충돌하면 근거를 비교해 결론을 선택하고, 완료된 작업·검증 결과·남은 위험·권장 다음 조치를 명확히 구분해 한국어로 보고하세요.\n\n${summaries.join('\n\n')}`

    globalAggregationRef.current = null
    globalTimerRef.current = null
    capturesRef.current.set(coordinator.ptyId, {
      instanceId: coordinator.instanceId,
      buffer: '',
      timer: setTimeout(() => {}, 0),
      stage: 'globalSynthesis'
    })
    setLastTaskByInstance((prev) => ({ ...prev, [coordinator.instanceId]: '전체 팀 최종 취합' }))
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: 'system',
        authorName: '',
        authorColor: '',
        authorSeed: '',
        text: `${summaries.length}개 팀 보고가 도착해 총괄 코디네이터가 최종 취합 시작`
      }
    ])
    window.api.pty.sendPrompt(coordinator.ptyId, prompt)
  }

  const queueTeamSummary = (leadInstanceId: string, text: string): void => {
    const aggregation = globalAggregationRef.current
    if (!aggregation || !aggregation.expectedLeadIds.has(leadInstanceId)) return
    aggregation.summaries.set(leadInstanceId, text)
    flushGlobalAggregation()
  }

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
      timer: setTimeout(() => {}, 0),
      stage: 'teamSynthesis'
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
    window.api.pty.sendPrompt(parent.ptyId, prompt)
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

  const finalizeCapture = (ptyId: string): void => {
    const capture = capturesRef.current.get(ptyId)
    if (!capture) return
    capturesRef.current.delete(ptyId)
    clearTimeout(capture.timer)
    const text = stripAnsi(capture.buffer)
    if (!text) return

    const instance = instancesRef.current.find((candidate) => candidate.instanceId === capture.instanceId)
    const template = instance
      ? templatesRef.current.find((candidate) => candidate.id === instance.templateId)
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
    } else if (capture.stage === 'teamSynthesis' && instance) {
      queueTeamSummary(instance.instanceId, text)
    } else if (capture.stage === 'globalSynthesis') {
      addSystemMessage('총괄 코디네이터 최종 취합 완료')
    }
  }

  useEffect(() => {
    const unsubscribeData = window.api.pty.onData(({ ptyId, data }) => {
      const capture = capturesRef.current.get(ptyId)
      if (!capture) return
      capture.buffer += data
    })
    const unsubscribeState = window.api.pty.onState(({ ptyId, state }) => {
      if (state === 'completed' || state === 'error' || state === 'exited') finalizeCapture(ptyId)
    })

    return () => {
      unsubscribeData()
      unsubscribeState()
      for (const timer of reportTimersRef.current.values()) clearTimeout(timer)
      reportTimersRef.current.clear()
      if (globalTimerRef.current) clearTimeout(globalTimerRef.current)
    }
  }, [])

  const sendPrompt = (
    text: string,
    targetInstanceIds: string[],
    sourceInstances = instances,
    displayText = text
  ): void => {
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
        authorName: '김태호',
        authorColor: '#6ea8fe',
        authorSeed: 'me',
        text: displayText
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
        timer: setTimeout(() => {}, 0),
        stage: 'task'
      })
      window.api.pty.sendPrompt(instance.ptyId, text)
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

    const assignedIds = new Set(assignments.map((assignment) => assignment.instanceId))
    const leadIdsWithChildren = resolved
      .filter(({ instance }) => instance.rank === 'teamLead')
      .map(({ instance }) => instance.instanceId)
      .filter((leadId) => sourceInstances.some(
        (candidate) => candidate.parentInstanceId === leadId && assignedIds.has(candidate.instanceId)
      ))
    const coordinator = sourceInstances.find(
      (instance) => leadIdsWithChildren.includes(instance.instanceId) && instance.templateId === 'claude-code'
    ) ?? sourceInstances.find((instance) => leadIdsWithChildren.includes(instance.instanceId))
    globalAggregationRef.current = coordinator && leadIdsWithChildren.length > 0
      ? {
          coordinatorId: coordinator.instanceId,
          expectedLeadIds: new Set(leadIdsWithChildren),
          summaries: new Map()
        }
      : null

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: 'user',
        authorName: '김태호',
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
        timer: setTimeout(() => {}, 0),
        stage: 'task'
      })
      window.api.pty.sendPrompt(instance.ptyId, assignment.prompt)
    }
  }

  return { messages, lastTaskByInstance, sendPrompt, sendAssignments, addSystemMessage }
}
