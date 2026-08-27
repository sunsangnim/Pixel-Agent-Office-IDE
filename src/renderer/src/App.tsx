import { useEffect, useState } from 'react'
import type { AgentInstance, AgentTemplate } from '@shared/types'
import OfficeView from './components/OfficeView'
import AgentProfileRow from './components/AgentProfileRow'
import TerminalModal from './components/TerminalModal'
import ChatPanel from './components/ChatPanel'
import { usePtyStatuses } from './hooks/usePtyStatuses'
import { useAgentChat } from './hooks/useAgentChat'
import { planTask } from './lib/taskRouter'

function App() {
  const [workFolder, setWorkFolder] = useState<string | null>(null)
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [instances, setInstances] = useState<AgentInstance[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const { deskStatuses: statuses, runtimeStates } = usePtyStatuses()
  const { messages, lastTaskByInstance, sendPrompt, sendAssignments, addSystemMessage } = useAgentChat(instances, templates)

  const refreshTemplates = (): void => {
    window.api.templates.list().then((list) => {
      setTemplates(list)
      setSelectedTemplateId((current) => current || list[0]?.id || '')
    })
  }

  useEffect(() => {
    window.api.workspace.getWorkFolder().then(setWorkFolder)
    refreshTemplates()
    window.api.instances.list().then(setInstances)
    return window.api.templates.onChanged(refreshTemplates)
  }, [])

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.api.workspace.chooseWorkFolder()
    setWorkFolder(folder)
  }

  const addInstance = async (): Promise<void> => {
    if (!workFolder || !selectedTemplateId) return
    setError(null)
    try {
      const updated = await window.api.instances.create(selectedTemplateId)
      setInstances(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const removeInstance = async (instanceId: string): Promise<void> => {
    const updated = await window.api.instances.remove(instanceId)
    setInstances(updated)
    setSelectedInstanceId((current) => (current === instanceId ? null : current))
    setSelectedTargetIds((prev) => {
      if (!prev.has(instanceId)) return prev
      const next = new Set(prev)
      next.delete(instanceId)
      return next
    })
  }

  const toggleTarget = (instanceId: string): void => {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev)
      if (next.has(instanceId)) next.delete(instanceId)
      else next.add(instanceId)
      return next
    })
  }

  const sendPromptToSelected = async (text: string): Promise<void> => {
    if (!workFolder) {
      setError('작업을 시작하려면 작업 폴더를 먼저 지정해주세요.')
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

    const workflowPrompt = `[필수 작업 운영정책]\n작업 폴더: ${taskWorkspace.rootPath}\n1. 다른 작업과 섞지 말고 반드시 위 하위 폴더 안에서 작업하세요.\n2. 구현 전에 ${taskWorkspace.specPath}의 SRS·PRD·화면설계를 먼저 구체화하세요.\n3. ${taskWorkspace.phasesPath}에 작업을 Phase로 나누고 한 번에 한 Phase만 수행하세요.\n4. 각 Phase 완료 시 관련 테스트와 빌드를 실행하고, 문서 체크박스와 결과를 갱신한 뒤 현재 Git 저장소에 커밋하고 origin/main으로 푸시하세요.\n5. 전체 작업 완료 시 ${taskWorkspace.readmePath}에 최종 결과물, 실행법, 검증 결과, 변경 이력을 완성하세요.\n6. 직접 지정된 팀장은 하위 세션 사용 여부와 작업 방법을 자율적으로 결정하세요.\n\n[사용자 요청]\n${text}`
    addSystemMessage(`작업 폴더와 기획 문서 생성 완료: ${taskWorkspace.taskId}`)

    if (selectedTargetIds.size > 0) {
      sendPrompt(workflowPrompt, Array.from(selectedTargetIds), instances, text)
      return
    }

    const plan = planTask(text)
    addSystemMessage(`작업 계획: ${plan.reason}`)
    let availableInstances = instances
    const leaders: AgentInstance[] = []

    try {
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

      if (plan.complexity === 'complex') {
        for (const leader of leaders) {
          let child = availableInstances.find(
            (instance) => instance.parentInstanceId === leader.instanceId && instance.rank === 'subAgent'
          )
          if (!child) {
            try {
              availableInstances = await window.api.instances.createChild(leader.instanceId)
              child = availableInstances.find(
                (instance) => instance.parentInstanceId === leader.instanceId && instance.rank === 'subAgent'
              )
            } catch {
              // The global concurrency policy can leave a team lead working alone.
            }
          }
        }
      }
      setInstances(availableInstances)
      if (plan.complexity === 'simple') {
        sendPrompt(workflowPrompt, leaders.map((leader) => leader.instanceId), availableInstances, text)
      } else {
        const specialties: Record<string, string> = {
          'claude-code': '코딩·아키텍처·통합 구현',
          'codex-cli': '애니메이션·상호작용·동작 검증',
          'antigravity-cli': '이미지 생성·픽셀 자산·시각 품질'
        }
        const assignments = leaders.flatMap((leader) => {
          const templateName = templates.find((template) => template.id === leader.templateId)?.name ?? leader.templateId
          const child = availableInstances.find(
            (instance) => instance.parentInstanceId === leader.instanceId && instance.rank === 'subAgent'
          )
          const leadAssignment = {
            instanceId: leader.instanceId,
            role: `${templateName} 팀장 · 조율`,
            prompt: `[팀장 역할] 아래 운영정책을 지키며 ${templateName} 팀의 실행 계획과 최종 취합 기준을 제시하세요.\n\n${workflowPrompt}`
          }
          return child
            ? [
                leadAssignment,
                {
                  instanceId: child.instanceId,
                  role: `${templateName} 하위 세션 · ${specialties[leader.templateId]}`,
                  prompt: `[하위 세션 역할: ${specialties[leader.templateId]}] 아래 운영정책을 지키며 맡은 영역을 수행하고 팀장이 취합할 수 있는 결과와 검증 내용을 명확히 보고하세요.\n\n${workflowPrompt}`
                }
              ]
            : [leadAssignment]
        })
        sendAssignments(text, assignments, availableInstances)
      }
    } catch (e) {
      setInstances(availableInstances)
      setError(e instanceof Error ? `${plan.reason}: ${e.message}` : String(e))
    }
  }

  return (
    <div className="app-root">
      <div className="main-column">
        {error && <p className="error-banner">{error}</p>}

        <OfficeView
          instances={instances}
          templates={templates}
          statuses={statuses}
          runtimeStates={runtimeStates}
          selectedInstanceId={selectedInstanceId}
          onSelect={setSelectedInstanceId}
          onRemove={removeInstance}
        />

        <AgentProfileRow
          instances={instances}
          templates={templates}
          statuses={statuses}
          runtimeStates={runtimeStates}
          tasks={lastTaskByInstance}
          selectedTargetIds={selectedTargetIds}
          onToggleTarget={toggleTarget}
          workFolder={workFolder}
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={setSelectedTemplateId}
          onAdd={addInstance}
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
    </div>
  )
}

export default App
