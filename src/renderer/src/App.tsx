import { useEffect, useState } from 'react'
import type { AgentInstance, AgentTemplate } from '@shared/types'
import SettingsModal from './components/SettingsModal'
import OfficeView from './components/OfficeView'
import { usePtyStatuses } from './hooks/usePtyStatuses'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workFolder, setWorkFolder] = useState<string | null>(null)
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [instances, setInstances] = useState<AgentInstance[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const statuses = usePtyStatuses()

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
  }

  return (
    <div className="app-shell office-shell">
      <div className="top-bar">
        <h1>Pixel Agent Office IDE</h1>
        <div className="top-bar-actions">
          <span className="work-folder-label">
            작업 폴더: {workFolder ?? '미지정'}
          </span>
          <button onClick={chooseFolder}>폴더 변경</button>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button onClick={addInstance} disabled={!workFolder || !selectedTemplateId}>
            + 에이전트 추가
          </button>
          <button
            onClick={() => {
              setSettingsOpen(true)
            }}
          >
            설정
          </button>
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal
          onClose={() => {
            setSettingsOpen(false)
            refreshTemplates()
          }}
        />
      )}

      {error && <p className="error-banner">{error}</p>}

      <OfficeView
        instances={instances}
        templates={templates}
        statuses={statuses}
        selectedInstanceId={selectedInstanceId}
        onSelect={setSelectedInstanceId}
        onRemove={removeInstance}
      />
    </div>
  )
}

export default App
