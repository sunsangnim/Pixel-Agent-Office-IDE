import { useEffect, useRef, useState } from 'react'
import type { AgentInstance, AgentProfile, AgentTemplate, TrackedTask } from '@shared/types'
import OfficeView from './components/OfficeView'
import AgentProfileRow from './components/AgentProfileRow'
import TerminalModal from './components/TerminalModal'
import DiffPanel from './components/DiffPanel'
import ChatPanel from './components/ChatPanel'
import WorkspacePanel from './components/WorkspacePanel'
import ResumeProjectDialog from './components/ResumeProjectDialog'
import { resolveResumeRequest } from './lib/resumeCommands'
import { usePtyStatuses } from './hooks/usePtyStatuses'
import { useAgentChat, type PlanReadyPayload } from './hooks/useAgentChat'
import { planTask } from './lib/taskRouter'
import { leadTitleFor, SUB_AGENT_TITLE } from '@shared/agentProfiles'
import { parseMeetingCommand, type MeetingCommand } from './lib/meetingCommands'
import { parseAttendanceCommand } from './lib/attendanceCommands'
import { OFFICE_VISIT_KEY, parseOfficeCommand, readOfficeVisitors, resolveOfficeCommandTargets, type OfficeCommand } from './lib/officeCommands'
import type { OfficeRequest } from './game/officeDialogue'
import { planningStatus } from './lib/planningStatus'
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
  const [filesOpen, setFilesOpen] = useState(false)
  const [resumeOpen, setResumeOpen] = useState(false)
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [instances, setInstances] = useState<AgentInstance[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [diffInstanceId, setDiffInstanceId] = useState<string | null>(null)
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [meetingActive, setMeetingActive] = useState(() => Boolean(localStorage.getItem(MEETING_CHECKPOINT_KEY)))
  const [manuallyOffDutyIds, setManuallyOffDutyIds] = useState<Set<string>>(new Set())
  const [representativeVisitors, setRepresentativeVisitors] = useState(() => readOfficeVisitors(localStorage))
  const [conversationProfileId, setConversationProfileId] = useState<string | null>(null)
  const recoveredCommand = useRef(false)
  const instancesLoaded = useRef(false)
  const [heldPrompts, setHeldPrompts] = useState<HeldMeetingPrompt[]>(() =>
    readStoredJson(localStorage.getItem(MEETING_QUEUE_KEY), [])
  )
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
  const [trackedTasks, setTrackedTasks] = useState<TrackedTask[]>([])
  const restoredBoot = useRef<string | null>(null)
  const taskStages = useRef(new Map<string, string>())
  const { deskStatuses: statuses, runtimeStates } = usePtyStatuses()

  const handlePlanReady = ({ instanceId, taskId }: PlanReadyPayload): void => {
    if (typeof window.api.tasks.dispatch === 'function') return // Durable completion records determine readiness.
    setPendingPlan((prev) => {
      if (!prev || prev.taskId !== taskId || prev.readyIds.has(instanceId)) return prev
      const readyIds = new Set(prev.readyIds)
      readyIds.add(instanceId)
      return { ...prev, readyIds }
    })
  }

  const { messages, lastTaskByInstance, sendPrompt, sendPlanningPrompt, sendAssignments, addSystemMessage, addUserMessage, cancelPlanning, trackRestoredTasks } =
    useAgentChat(instances, templates, handlePlanReady)

  useEffect(() => {
    if (!window.api.tasks.dispatch) return
    const task = trackedTasks.find(item => item.projectPath === workFolder && (item.stage === 'planning' || item.stage === 'review'))
    if (!task) { setPendingPlan(null); return }
    const targets = instances.filter(instance => instance.repoRoot === task.projectPath && task.commands.some(command => command.profileId === instance.profileId && command.cwd === instance.cwd && command.stage === 'planning'))
    if (!targets.length) return
    setPendingPlan(previous => ({ ...task, originalText: task.request,
      instanceIds: targets.map(instance => instance.instanceId),
      readyIds: new Set(task.stage === 'review' ? targets.map(instance => instance.instanceId) : []),
      specText: task.stage === 'review' && previous?.taskId === task.taskId ? previous.specText : null }))
  }, [trackedTasks, instances, workFolder])

  useEffect(() => {
    for (const task of trackedTasks) {
      const previous = taskStages.current.get(task.taskId)
      if (previous && previous !== task.stage && task.stage === 'completed') addSystemMessage(`“${task.title}” 작업 완료. 개발 기록과 검증·커밋 정보를 저장했습니다.`)
      taskStages.current.set(task.taskId, task.stage)
    }
  }, [trackedTasks])

  useEffect(() => {
    if (!pendingPlan || parseMeetingCommand(pendingPlan.originalText) || parseOfficeCommand(pendingPlan.originalText) || pendingPlan.specText !== null) return
    const allReady = pendingPlan.instanceIds.every((id) => pendingPlan.readyIds.has(id))
    if (!allReady) return
    let cancelled = false
    window.api.tasks.readSpec(pendingPlan.specPath).then((specText) => {
      if (cancelled) return
      setPendingPlan((current) => (current && current.taskId === pendingPlan.taskId ? { ...current, specText } : current))
    }).catch((e) => { if (!cancelled) setError(String(e)) })
    return () => {
      cancelled = true
    }
  }, [pendingPlan])

  useEffect(() => { localStorage.setItem(OFFICE_VISIT_KEY, JSON.stringify([...representativeVisitors])) }, [representativeVisitors])

  const handleOfficeCommand = (command: OfficeCommand, targetIds = Array.from(selectedTargetIds)): void => {
    const targets = resolveOfficeCommandTargets(command, profiles, instances, targetIds, conversationProfileId, representativeVisitors)
    if (!targets.length) { addSystemMessage('이동할 캐릭터를 @멘션하거나 선택해주세요. 예: @Claude 대표실로 오게나'); return }
    const ids = targets.map((profile) => profile.profileId)
    if (ids.length === 1) setConversationProfileId(ids[0])
    setError(null)
    setRepresentativeVisitors((previous) => {
      const next = new Set(previous)
      ids.forEach((id) => command.action === 'visit' ? next.add(id) : next.delete(id))
      return next
    })
    if (command.action === 'visit') setManuallyOffDutyIds((previous) => new Set([...previous].filter((id) => !ids.includes(id))))
    addSystemMessage(`${targets.map((profile) => profile.displayName).join(', ')}: ${command.action === 'visit' ? '대표실로 이동합니다.' : '자기 자리로 복귀합니다.'}`)
  }

  const cancelPlan = (): void => {
    if (!pendingPlan) return
    if (window.api.tasks.cancel) void window.api.tasks.cancel(pendingPlan.taskId).catch(e => setError(String(e)))
    cancelPlanning(pendingPlan.taskId)
    setPendingPlan(null)
    addSystemMessage('기획 요청을 취소했습니다. 작성된 문서는 작업실에 보관됩니다.')
  }

  useEffect(() => {
    if (!pendingPlan) return
    const command = parseOfficeCommand(pendingPlan.originalText)
    if (!command || !profiles.length) return
    recoveredCommand.current = true
    const lastUser = messages.findLast((message) => message.kind === 'user')
    if (lastUser) localStorage.setItem('pixel-office-recovered-command', lastUser.id)
    cancelPlanning(pendingPlan.taskId)
    setPendingPlan(null)
    setSelectedInstanceId(null)
    addSystemMessage('이동 지시로 잘못 시작된 기획 요청을 취소했습니다.')
    handleOfficeCommand(command, pendingPlan.instanceIds)
  }, [pendingPlan, profiles])

  useEffect(() => {
    if (recoveredCommand.current || !instancesLoaded.current || !profiles.length) return
    const index = messages.findLastIndex((message) => message.kind === 'user')
    const last = messages[index]
    const command = last && parseOfficeCommand(last.text)
    if (!command || !messages.slice(index + 1).some((message) => message.kind === 'system' && message.text.includes('기획 작성 요청'))) return
    const targets = resolveOfficeCommandTargets(command, profiles, instances, [], conversationProfileId, representativeVisitors)
    if (!targets.length) return
    if (localStorage.getItem('pixel-office-recovered-command') === last.id) return
    // Recover the reported command after a live update/reload without starting a new CLI.
    recoveredCommand.current = true
    localStorage.setItem('pixel-office-recovered-command', last.id)
    for (const instance of instances.filter((instance) => targets.some((profile) => profile.profileId === instance.profileId))) {
      if (window.api.pty.cancelPrompt) window.api.pty.cancelPrompt(instance.ptyId)
      else window.api.pty.write(instance.ptyId, '\u0003')
    }
    setPendingPlan(null)
    setSelectedInstanceId(null)
    addSystemMessage('이동 지시로 잘못 시작된 기획 요청을 취소했습니다.')
    handleOfficeCommand(command)
  }, [profiles, instances, messages])

  const refreshTemplates = (): void => {
    window.api.templates.list().then((list) => {
      setTemplates(list)
    })
    window.api.profiles.list().then(setProfiles)
  }

  useEffect(() => {
    window.api.workspace.getWorkFolder().then(setWorkFolder).catch((e) => setError(String(e)))
    refreshTemplates()
    if (window.api.tasks.restore) {
      window.api.tasks.restore().then(result => {
        instancesLoaded.current = true
        setInstances(result.instances)
        setTrackedTasks(result.tasks)
        trackRestoredTasks(result.tasks, result.instances)
        if (restoredBoot.current !== result.bootId) {
          restoredBoot.current = result.bootId
          result.notices.forEach(addSystemMessage)
        }
      }).catch(e => setError(`작업 인수인계 확인 실패: ${String(e)}`))
    } else window.api.instances.list().then((list) => { instancesLoaded.current = true; setInstances(list) })
    const unsubscribeTasks = window.api.tasks.onChanged?.(setTrackedTasks)
    const unsubscribeTemplates = window.api.templates.onChanged(refreshTemplates)
    const unsubscribeCapacity = window.api.teamCapacity.onChanged(() => {
      window.api.profiles.list().then(setProfiles)
    })
    return () => {
      unsubscribeTemplates()
      unsubscribeCapacity()
      unsubscribeTasks?.()
    }
  }, [])

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.api.workspace.chooseWorkFolder()
    setWorkFolder(folder)
  }

  const resumeProject = async (projectPath: string): Promise<void> => {
    setResumeOpen(false)
    setError(null)
    try {
      const result = await window.api.tasks.resume(projectPath)
      setWorkFolder(projectPath)
      setInstances(result.instances)
      setTrackedTasks(result.tasks)
      trackRestoredTasks(result.tasks, result.instances)
      result.notices.forEach(addSystemMessage)
    } catch (e) { setError(String(e)) }
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
    let availableInstances = instances

    try {
      if (targetIds.length > 0) {
        mode = 'manual'
        planInstanceIds = targetIds
      } else {
        const plan = planTask(text)
        addSystemMessage(`작업 계획: ${plan.reason}`)
        mode = plan.complexity
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
        planInstanceIds = leaders.map((leader) => leader.instanceId)
      }
      if (window.api.instances.ensureProject) {
        const profileIds = planInstanceIds.map(id => availableInstances.find(instance => instance.instanceId === id)?.profileId)
        availableInstances = await window.api.instances.ensureProject(planInstanceIds)
        planInstanceIds = availableInstances.filter(instance => profileIds.includes(instance.profileId)).map(instance => instance.instanceId)
      }
      setInstances(availableInstances)
      await sendPlanningPrompt(planningPrompt, planInstanceIds, taskWorkspace.taskId, taskWorkspace.specPath, availableInstances, null, mode)
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
    try {
      if (window.api.tasks.approve) await window.api.tasks.approve(plan.taskId)
      setPendingPlan(null)

      const workflowPrompt = buildWorkflowPrompt(plan)

      if (plan.mode !== 'complex') {
        await sendPrompt(workflowPrompt, plan.instanceIds, instances, `[기획 승인] ${plan.originalText}`, plan.taskId)
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
      await sendAssignments(plan.originalText, assignments, availableInstances, plan.taskId)
    } catch (e) { setError(String(e)) }
  }

  const rejectPlan = (feedback: string): void => {
    if (!pendingPlan) return
    const plan = pendingPlan
    const revisionPrompt = `[반려] ${feedback}\n기획서(${plan.specPath})와 Phase 문서(${plan.phasesPath})를 반영해 다시 수정한 뒤 "기획 완료"라고 보고하세요.`
    setPendingPlan({ ...plan, readyIds: new Set(), specText: null })
    void sendPlanningPrompt(revisionPrompt, plan.instanceIds, plan.taskId, plan.specPath, instances, `[반려] ${feedback}`, plan.mode).catch(e => setError(String(e)))
  }

  const handleMeetingCommand = async (command: MeetingCommand): Promise<void> => {
    setError(null)
    if (command === 'start') {
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
      setRepresentativeVisitors(new Set())
      localStorage.setItem(MEETING_CHECKPOINT_KEY, JSON.stringify(checkpoint))
      setMeetingActive(true)
      addSystemMessage('회의를 시작합니다. 에이전트들이 회의실로 이동합니다. 상석은 대표님 자리로 비워둡니다.')
      return
    }

    const queued = [...heldPrompts]
    setMeetingActive(false)
    setHeldPrompts([])
    localStorage.removeItem(MEETING_CHECKPOINT_KEY)
    localStorage.removeItem(MEETING_QUEUE_KEY)
    addSystemMessage(`회의를 마쳤습니다. 각자 자리로 복귀합니다.${queued.length ? ` 보류한 지시 ${queued.length}건을 이어서 처리합니다.` : ''}`)
    for (const prompt of queued) await executePrompt(prompt.text, prompt.targetIds)
  }

  useEffect(() => {
    if (!pendingPlan) return
    const command = parseMeetingCommand(pendingPlan.originalText)
    if (!command) return
    // Recover a review created by older command matching during a live update.
    // No approval or implementation request should be sent for a local command.
    setPendingPlan(null)
    addSystemMessage('회의 요청으로 잘못 열린 기획 검토를 취소했습니다.')
    void handleMeetingCommand(command)
  }, [pendingPlan])

  const sendPromptToSelected = async (text: string): Promise<void> => {
    text = text.trim()
    if (!text) return
    // Record at the input boundary, before local commands, validation, or
    // asynchronous session work can return. Queue replay does not record twice.
    addUserMessage(text)
    const officeCommand = parseOfficeCommand(text)
    if (officeCommand) { handleOfficeCommand(officeCommand); return }
    const attendanceCommand = parseAttendanceCommand(text)
    if (attendanceCommand) {
      const leadProfileIds = attendanceCommand.templateIds.map((templateId) => `${templateId}:lead`)
      const teamNames = attendanceCommand.templateIds
        .map((templateId) => templates.find((t) => t.id === templateId)?.name ?? templateId)
        .join(', ')
      setManuallyOffDutyIds((prev) => {
        const next = new Set(prev)
        leadProfileIds.forEach((id) => (attendanceCommand.clockIn ? next.delete(id) : next.add(id)))
        return next
      })
      setRepresentativeVisitors((prev) => new Set([...prev].filter((id) => !leadProfileIds.includes(id))))
      addSystemMessage(`${teamNames} 팀장이 ${attendanceCommand.clockIn ? '출근' : '퇴근'}했습니다.`)
      return
    }

    const meetingCommand = parseMeetingCommand(text)
    if (meetingCommand) {
      await handleMeetingCommand(meetingCommand)
      return
    }

    if (typeof window.api.tasks.resume === 'function') {
      const resume = resolveResumeRequest(text, trackedTasks)
      if (resume.kind === 'project') { await resumeProject(resume.projectPath!); return }
      if (resume.kind === 'select') { setResumeOpen(true); return }
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

  const requests: OfficeRequest[] = instances.filter((instance) => runtimeStates[instance.ptyId]?.state === 'waiting').map((instance) => ({
    id: `permission:${instance.ptyId}:${runtimeStates[instance.ptyId].timestamp}`, profileId: instance.profileId, kind: 'permission', ptyId: instance.ptyId,
    text: `${runtimeStates[instance.ptyId]?.reason?.replace(/\s*—\s*터미널에서 확인해주세요\.?/, '') ?? '권한 또는 확인 요청이 있습니다.'}\n요청 내용을 확인한 뒤 직접 응답해주세요.`
  }))
  if (pendingPlan && !parseOfficeCommand(pendingPlan.originalText) && !parseMeetingCommand(pendingPlan.originalText)) {
    const instance = instances.find((instance) => pendingPlan.instanceIds.includes(instance.instanceId))
    if (instance) {
      const ready = pendingPlan.specText !== null
      const status = planningStatus(pendingPlan.instanceIds, instances, runtimeStates)
      requests.push({ id: `plan:${pendingPlan.taskId}:${ready ? 'approval' : 'progress'}`, profileId: instance.profileId,
        kind: ready ? 'approval' : 'planning', ptyId: instance.ptyId,
        text: ready ? `“${pendingPlan.originalText}” 기획을 확인해주세요. 승인해주시면 작업을 시작하겠습니다.` : `요청: ${pendingPlan.originalText}\n${status.text}`,
        specText: pendingPlan.specText ?? undefined, onCancel: cancelPlan,
        onApprove: ready ? () => { void approvePlan() } : undefined, onReject: ready ? rejectPlan : undefined })
    }
  }

  return (
    <div className="app-root">
      <div className="main-column">
        {error && <p className="error-banner">{error}</p>}
        {trackedTasks.some(task => !['completed', 'cancelled'].includes(task.stage)) && <div className="resume-task-bar">
          <span>저장된 미완료 작업이 있습니다.</span><button onClick={() => setResumeOpen(true)}>프로젝트 이어가기</button>
        </div>}

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
          manuallyOffDutyIds={manuallyOffDutyIds}
          representativeVisitors={representativeVisitors}
          messages={messages}
          requests={requests}
          onConversationChange={setConversationProfileId}
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
        onOpenFiles={() => setFilesOpen(true)}
        onOpenFolder={() => { void window.api.workspace.openFolder().catch((e) => setError(String(e))) }}
        messages={messages}
        selectedTargetIds={selectedTargetIds}
        onSend={sendPromptToSelected}
      />

      {filesOpen && <WorkspacePanel workFolder={workFolder} onChooseFolder={chooseFolder} onClose={() => setFilesOpen(false)} />}
      {resumeOpen && <ResumeProjectDialog tasks={trackedTasks} onClose={() => setResumeOpen(false)} onSelect={project => { void resumeProject(project) }} />}

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
              onSendComments={(runId, prompt) => { void sendPrompt(prompt, [runId], instances, prompt).catch(e => setError(String(e))) }}
            />
          )
        })()}

    </div>
  )
}

export default App
