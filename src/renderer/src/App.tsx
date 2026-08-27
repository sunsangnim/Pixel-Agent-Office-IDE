import { useEffect, useState } from 'react'
import type { AgentInstance, AgentTemplate } from '@shared/types'
import SettingsModal from './components/SettingsModal'

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workFolder, setWorkFolder] = useState<string | null>(null)
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [instances, setInstances] = useState<AgentInstance[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [error, setError] = useState<string | null>(null)

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
  }

  const templateById = (id: string): AgentTemplate | undefined => templates.find((t) => t.id === id)

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

      <ul className="instance-list">
        {instances.map((instance) => {
          const template = templateById(instance.templateId)
          return (
            <li key={instance.instanceId} className="instance-row">
              <span
                className="template-color"
                style={{ background: template?.color ?? '#888' }}
              />
              <div className="template-info">
                <strong>{template?.name ?? instance.templateId}</strong>
                <code>{instance.cwd}</code>
              </div>
              <button onClick={() => removeInstance(instance.instanceId)}>제거</button>
            </li>
          )
        })}
        {instances.length === 0 && <li>아직 배치된 에이전트가 없습니다. 작업 폴더를 지정하고 에이전트를 추가하세요.</li>}
      </ul>
    </div>
  )
}

export default App
