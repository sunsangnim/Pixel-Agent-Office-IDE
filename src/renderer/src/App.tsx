import { useEffect, useState } from 'react'
import type { AgentInstance, AgentProfile, AgentTemplate } from '@shared/types'
import OfficeView from './components/OfficeView'
import AgentProfileRow from './components/AgentProfileRow'
import TerminalModal from './components/TerminalModal'
import DiffPanel from './components/DiffPanel'
import PlanApprovalModal from './components/PlanApprovalModal'
import ChatPanel from './components/ChatPanel'
import { usePtyStatuses } from './hooks/usePtyStatuses'
import { useAgentChat, type PlanReadyPayload } from './hooks/useAgentChat'
import { planTask } from './lib/taskRouter'
import { leadTitleFor, SUB_AGENT_TITLE } from '@shared/agentProfiles'
import { isMeetingEndCommand, isMeetingStartCommand } from './lib/meetingCommands'
import {
  MEETING_CHECKPOINT_KEY,
  MEETING_QUEUE_KEY,
  presenceForRuntime,
  readStoredJson,
  type HeldMeetingPrompt,
  type MeetingCheckpoint
} from './lib/meetingCheckpoint'

interface PendingPlan {
  taskId: string
  instanceIds: string[]
  readyIds: Set<string>
  rootPath: string
  specPath: string
  phasesPath: string
  readmePath: string
  originalText: string
  mode: 'manual' | 'simple' | 'complex'
  specText: string | null
}

function App() {
  const [workFolder, setWorkFolder] = useState<string | null>(null)
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [instances, setInstances] = useState<AgentInstance[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [diffInstanceId, setDiffInstanceId] = useState<string | null>(null)
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [meetingActive, setMeetingActive] = useState(() => Boolean(localStorage.getItem(MEETING_CHECKPOINT_KEY)))
  const [heldPrompts, setHeldPrompts] = useState<HeldMeetingPrompt[]>(() =>
    readStoredJson(localStorage.getItem(MEETING_QUEUE_KEY), [])
  )
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const { deskStatuses: statuses, runtimeStates } = usePtyStatuses()

  const handlePlanReady = ({ instanceId, taskId }: PlanReadyPayload): void => {
    setPendingPlan((prev) => {
      if (!prev || prev.taskId !== taskId || prev.readyIds.has(instanceId)) return prev
      const readyIds = new Set(prev.readyIds)
      readyIds.add(instanceId)
      return { ...prev, readyIds }
    })
  }

  const { messages, lastTaskByInstance, sendPrompt, sendPlanningPrompt, sendAssignments, addSystemMessage } =
    useAgentChat(instances, templates, handlePlanReady)

  useEffect(() => {
    if (!pendingPlan || pendingPlan.specText !== null) return
    const allReady = pendingPlan.instanceIds.every((id) => pendingPlan.readyIds.has(id))
    if (!allReady) return
    let cancelled = false
    window.api.tasks.readSpec(pendingPlan.specPath).then((specText) => {
      if (cancelled) return
      setPendingPlan((current) => (current && current.taskId === pendingPlan.taskId ? { ...current, specText } : current))
      setPlanModalOpen(true)
    })
    return () => {
      cancelled = true
    }
  }, [pendingPlan])

  const refreshTemplates = (): void => {
    window.api.templates.list().then((list) => {
      setTemplates(list)
    })
    window.api.profiles.list().then(setProfiles)
  }

  useEffect(() => {
    window.api.workspace.getWorkFolder().then(setWorkFolder)
    refreshTemplates()
    window.api.instances.list().then(setInstances)
    const unsubscribeTemplates = window.api.templates.onChanged(refreshTemplates)
    const unsubscribeCapacity = window.api.teamCapacity.onChanged(() => {
      window.api.profiles.list().then(setProfiles)
    })
    return () => {
      unsubscribeTemplates()
      unsubscribeCapacity()
    }
  }, [])

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.api.workspace.chooseWorkFolder()
    setWorkFolder(folder)
  }

  const removeInstance = async (instanceId: string): Promise<void> => {
    const updated = await window.api.instances.remove(instanceId)
    setInstances(updated)
    setSelectedInstanceId((current) => (current === instanceId ? null : current))
    const remainingIds = new Set(updated.map((instance) => instance.instanceId))
    setSelectedTargetIds((prev) => new Set(Array.from(prev).filter((id) => remainingIds.has(id))))
  }

  const toggleTarget = (instanceId: string): void => {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev)
      if (next.has(instanceId)) next.delete(instanceId)
      else next.add(instanceId)
      return next
    })
  }

  const specialties: Record<string, string> = {
    'claude-code': '코딩·문서작업(SRS·PRD·화면설계서 통합 문서 생성)',
    'codex-cli': '이미지 생성·단순 노가다',
    'antigravity-cli': '테스트·검증'
  }

  const buildWorkflowPrompt = (plan: PendingPlan): string =>
    `[실행 단계 — 기획이 승인되었습니다]\n프로젝트 폴더: ${workFolder}\n비공개 작업 문서 폴더: ${plan.rootPath}\n1. 구현을 시작하기 전에 프로젝트 폴더에서 feature/${plan.taskId} 브랜치가 이미 있으면(다른 팀원이 먼저 만들었을 수 있습니다) 그 브랜치로 체크아웃하고, 없으면 최신 main에서 새로 만들어 체크아웃한 뒤 그 위에서 작업하세요. 팀장·하위 세션 모두 같은 프로젝트 폴더를 공유하므로 이 브랜치 하나로만 작업하고, main에는 직접 커밋하지 마세요.\n2. 승인된 기획서(${plan.specPath})와 Phase 문서(${plan.phasesPath})를 바탕으로 Phase 1부터 순서대로 구현하세요. 한 번에 한 Phase만 수행하세요.\n3. 코드는 프로젝트 폴더에서 작업하고, 문서 갱신은 비공개 작업 문서 폴더에서만 하세요.\n4. API 키·토큰·로그인 정보·세션·PTY 버퍼·로컬 절대경로·사용자 작업 문서는 Git에 추가하지 마세요.\n5. 각 Phase 완료 시 테스트와 빌드를 실행하고 공개 가능한 코드·자산만 feature 브랜치에 커밋하세요. feature 브랜치의 원격 푸시는 저장소 공개 범위와 사용자 승인을 확인한 경우에만 수행하세요.\n6. 전체 작업 완료 시 ${plan.readmePath}에 최종 결과물, 실행법, 검증 결과, 변경 이력을 완성하세요.\n7. 모든 Phase와 인수 조건이 끝나면 최신 main을 다시 받아 충돌을 해결한 뒤 feature 브랜치를 main에 병합(--no-ff)하세요. main 병합·푸시는 저장소 공개 범위와 사용자 승인을 확인한 경우에만 수행하고, 완료 후 병합 결과를 보고하세요.\n8. 직접 지정된 팀장은 하위 세션 사용 여부와 작업 방법을 자율적으로 결정하세요.\n\n[사용자 요청]\n${plan.originalText}`

  const executePrompt = async (text: string, targetIds = Array.from(selectedTargetIds)): Promise<void> => {
    if (!workFolder) {
      setError('작업을 시작하려면 작업 폴더를 먼저 지정해주세요.')
      return
    }
    if (pendingPlan) {
      setError('진행 중인 기획 검토가 있습니다. 승인 또는 반려 후 다시 시도해주세요.')
      return
    }

    setError(null)
    let taskWorkspace
    try {
      taskWorkspace = await window.api.tasks.prepare(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    addSystemMessage(`작업 폴더와 기획 문서 생성 완료: ${taskWorkspace.taskId}`)

    const planningPrompt = `[기획 단계]\n프로젝트 폴더: ${workFolder}\n비공개 작업 문서 폴더: ${taskWorkspace.rootPath}\n1. ${taskWorkspace.specPath}에 아래 요청에 대한 SRS·PRD·화면설계를 구체화하세요.\n2. ${taskWorkspace.phasesPath}에 작업을 Phase로 나누세요.\n3. 이번 단계에서는 코드를 작성하지 마세요 — 기획서 작성까지만 수행합니다.\n4. 완료되면 "기획 완료"라고 짧게 보고하세요.\n\n[사용자 요청]\n${text}`

    let planInstanceIds: string[] = []
    let mode: PendingPlan['mode'] = 'manual'

    try {
      if (targetIds.length > 0) {
        mode = 'manual'
        planInstanceIds = targetIds
        sendPlanningPrompt(planningPrompt, targetIds, taskWorkspace.taskId, taskWorkspace.specPath, instances, text)
      } else {
        const plan = planTask(text)
        addSystemMessage(`작업 계획: ${plan.reason}`)
        mode = plan.complexity
        let availableInstances = instances
        const leaders: AgentInstance[] = []
        for (const templateId of plan.templateIds) {
          let leader = availableInstances.find(
            (instance) => instance.templateId === templateId && instance.rank === 'teamLead'
          )
          if (!leader) {
            availableInstances = await window.api.instances.create(templateId)
            leader = availableInstances.find(
              (instance) => instance.templateId === templateId && instance.rank === 'teamLead'
            )
          }
          if (leader) leaders.push(leader)
        }
        setInstances(availableInstances)
        planInstanceIds = leaders.map((leader) => leader.instanceId)
        sendPlanningPrompt(
          planningPrompt,
          planInstanceIds,
          taskWorkspace.taskId,
          taskWorkspace.specPath,
          availableInstances,
          text
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }

    if (planInstanceIds.length === 0) {
      setError('기획을 요청할 에이전트를 찾지 못했습니다.')
      return
    }

    setPendingPlan({
      taskId: taskWorkspace.taskId,
      instanceIds: planInstanceIds,
      readyIds: new Set(),
      rootPath: taskWorkspace.rootPath,
      specPath: taskWorkspace.specPath,
      phasesPath: taskWorkspace.phasesPath,
      readmePath: taskWorkspace.readmePath,
      originalText: text,
      mode,
      specText: null
    })
  }

  const approvePlan = async (): Promise<void> => {
    if (!pendingPlan) return
    const plan = pendingPlan
    setPendingPlan(null)
    setPlanModalOpen(false)

    const workflowPrompt = buildWorkflowPrompt(plan)

    if (plan.mode !== 'complex') {
      sendPrompt(workflowPrompt, plan.instanceIds, instances, `[기획 승인] ${plan.originalText}`)
      return
    }

    let availableInstances = instances
    const leaders = plan.instanceIds
      .map((id) => availableInstances.find((instance) => instance.instanceId === id))
      .filter((instance): instance is AgentInstance => Boolean(instance))

    for (const leader of leaders) {
      const child = availableInstances.find(
        (instance) => instance.parentInstanceId === leader.instanceId && instance.rank === 'subAgent'
      )
      if (!child) {
        try {
          availableInstances = await window.api.instances.createChild(leader.instanceId)
        } catch {
          // The global concurrency policy can leave a team lead working alone.
        }
      }
    }
    setInstances(availableInstances)

    const assignments = leaders.flatMap((leader) => {
      const templateName = templates.find((template) => template.id === leader.templateId)?.name ?? leader.templateId
      const child = availableInstances.find(
        (instance) => instance.parentInstanceId === leader.instanceId && instance.rank === 'subAgent'
      )
      const leadTitle = leadTitleFor(leader.templateId)
      const leadAssignment = {
        instanceId: leader.instanceId,
        role: `${templateName} ${leadTitle} · 조율`,
        prompt: `[${leadTitle} 역할 — 기획 승인됨] 아래 운영정책을 지키며 ${templateName} 팀의 실행 계획과 최종 취합 기준을 제시하세요.\n\n${workflowPrompt}`
      }
      return child
        ? [
            leadAssignment,
            {
              instanceId: child.instanceId,
              role: `${templateName} ${SUB_AGENT_TITLE} · ${specialties[leader.templateId]}`,
              prompt: `[${SUB_AGENT_TITLE} 역할: ${specialties[leader.templateId]}] 아래 운영정책을 지키며 맡은 영역을 수행하고 ${leadTitle}이 취합할 수 있는 결과와 검증 내용을 명확히 보고하세요.\n\n${workflowPrompt}`
            }
          ]
        : [leadAssignment]
    })
    sendAssignments(plan.originalText, assignments, availableInstances)
  }

  const rejectPlan = (feedback: string): void => {
    if (!pendingPlan) return
    const plan = pendingPlan
    const revisionPrompt = `[반려] ${feedback}\n기획서(${plan.specPath})와 Phase 문서(${plan.phasesPath})를 반영해 다시 수정한 뒤 "기획 완료"라고 보고하세요.`
    setPendingPlan({ ...plan, readyIds: new Set(), specText: null })
    setPlanModalOpen(false)
    sendPlanningPrompt(revisionPrompt, plan.instanceIds, plan.taskId, plan.specPath, instances, `[반려] ${feedback}`)
  }

  const sendPromptToSelected = async (text: string): Promise<void> => {
    if (isMeetingStartCommand(text)) {
      if (meetingActive) {
        addSystemMessage('이미 전체 회의가 진행 중입니다.')
        return
      }
      const sessions = await Promise.all(instances.map(async (instance) => {
        const runtimeState = runtimeStates[instance.ptyId]?.state ?? 'idle'
        const buffer = await window.api.pty.getBuffer(instance.ptyId).catch(() => '')
        return {
          instanceId: instance.instanceId,
          ptyId: instance.ptyId,
          runtimeState,
          previousPresence: presenceForRuntime(runtimeState),
          task: lastTaskByInstance[instance.instanceId] ?? '',
          bufferLength: buffer.length
        }
      }))
      const checkpoint: MeetingCheckpoint = { startedAt: new Date().toISOString(), sessions }
      localStorage.setItem(MEETING_CHECKPOINT_KEY, JSON.stringify(checkpoint))
      setMeetingActive(true)
      addSystemMessage(`전체 회의 시작: ${sessions.length}개 CLI 세션과 PTY 버퍼 위치를 보존했습니다.`)
      return
    }

    if (isMeetingEndCommand(text)) {
      const queued = [...heldPrompts]
      setMeetingActive(false)
      setHeldPrompts([])
      localStorage.removeItem(MEETING_CHECKPOINT_KEY)
      localStorage.removeItem(MEETING_QUEUE_KEY)
      addSystemMessage(`전체 회의 종료: 이전 상태로 복귀하고 보류 지시 ${queued.length}건을 순서대로 재개합니다.`)
      for (const prompt of queued) await executePrompt(prompt.text, prompt.targetIds)
      return
    }

    if (meetingActive) {
      const next = [...heldPrompts, { text, targetIds: Array.from(selectedTargetIds) }]
      setHeldPrompts(next)
      localStorage.setItem(MEETING_QUEUE_KEY, JSON.stringify(next))
      addSystemMessage(`회의 중 지시 보류: 회의 종료 후 전송합니다. (대기 ${next.length}건)`)
      return
    }

    await executePrompt(text)
  }

  return (
    <div className="app-root">
      <div className="main-column">
        {error && <p className="error-banner">{error}</p>}
        {pendingPlan && !planModalOpen && (
          <div className="plan-pending-banner">
            {pendingPlan.specText ? (
              <>
                기획서 검토 대기 중
                <button onClick={() => setPlanModalOpen(true)}>다시 열기</button>
              </>
            ) : (
              '기획서 작성 중...'
            )}
          </div>
        )}

        <OfficeView
          instances={instances}
          profiles={profiles}
          templates={templates}
          statuses={statuses}
          runtimeStates={runtimeStates}
          tasks={lastTaskByInstance}
          selectedInstanceId={selectedInstanceId}
          onSelect={setSelectedInstanceId}
          onRemove={removeInstance}
          meetingActive={meetingActive}
        />

        <AgentProfileRow
          instances={instances}
          profiles={profiles}
          templates={templates}
          statuses={statuses}
          runtimeStates={runtimeStates}
          tasks={lastTaskByInstance}
          selectedTargetIds={selectedTargetIds}
          onToggleTarget={toggleTarget}
          onOpenDiff={setDiffInstanceId}
        />
      </div>

      <ChatPanel
        instances={instances}
        templates={templates}
        workFolder={workFolder}
        onChooseFolder={chooseFolder}
        messages={messages}
        selectedTargetIds={selectedTargetIds}
        onSend={sendPromptToSelected}
      />

      {selectedInstanceId &&
        (() => {
          const instance = instances.find((i) => i.instanceId === selectedInstanceId)
          if (!instance) return null
          const template = templates.find((t) => t.id === instance.templateId)
          return (
            <TerminalModal
              ptyId={instance.ptyId}
              title={template?.name ?? instance.templateId}
              onClose={() => setSelectedInstanceId(null)}
            />
          )
        })()}

      {diffInstanceId &&
        (() => {
          const instance = instances.find((i) => i.instanceId === diffInstanceId)
          if (!instance) return null
          const template = templates.find((t) => t.id === instance.templateId)
          return (
            <DiffPanel
              runId={instance.instanceId}
              title={template?.name ?? instance.templateId}
              onClose={() => setDiffInstanceId(null)}
              onSendComments={(runId, prompt) => sendPrompt(prompt, [runId], instances, prompt)}
            />
          )
        })()}

      {planModalOpen && pendingPlan && (
        <PlanApprovalModal
          title={pendingPlan.originalText.slice(0, 40)}
          specText={pendingPlan.specText}
          onApprove={() => void approvePlan()}
          onReject={rejectPlan}
          onClose={() => setPlanModalOpen(false)}
        />
      )}
    </div>
  )
}

export default App
