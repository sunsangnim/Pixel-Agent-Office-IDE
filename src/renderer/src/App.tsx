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
  const statuses = usePtyStatuses()
  const { messages, lastTaskByInstance, sendPrompt } = useAgentChat(instances, templates)

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
    if (selectedTargetIds.size > 0) {
      sendPrompt(text, Array.from(selectedTargetIds))
      return
    }
    if (!workFolder) {
      setError('자동 배정을 사용하려면 작업 폴더를 먼저 지정해주세요.')
      return
    }

    setError(null)
    const plan = planTask(text)
    let availableInstances = instances
    const targetIds: string[] = []

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
        if (leader) targetIds.push(leader.instanceId)
      }
      setInstances(availableInstances)
      sendPrompt(text, targetIds, availableInstances)
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
          selectedInstanceId={selectedInstanceId}
          onSelect={setSelectedInstanceId}
          onRemove={removeInstance}
        />

        <AgentProfileRow
          instances={instances}
          templates={templates}
          statuses={statuses}
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
