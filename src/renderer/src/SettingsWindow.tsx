import { useEffect, useState } from 'react'
import type { AgentTemplate } from '@shared/types'

interface FormState {
  name: string
  command: string
  args: string
  color: string
  env: string
}

const emptyForm: FormState = { name: '', command: '', args: '', color: '#6ea8fe', env: '' }

function toFormState(template: AgentTemplate): FormState {
  return {
    name: template.name,
    command: template.command,
    args: template.args.join(' '),
    color: template.color,
    env: Object.entries(template.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  }
}

function parseArgs(raw: string): string[] {
  return raw.trim().length === 0 ? [] : raw.trim().split(/\s+/)
}

function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (key) env[key] = value
  }
  return env
}

function SettingsWindow() {
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.templates.list().then((list) => {
      setTemplates(list)
      setLoading(false)
    })
    return window.api.templates.onChanged(() => {
      window.api.templates.list().then(setTemplates)
    })
  }, [])

  const resetForm = (): void => {
    setEditingId(null)
    setForm(emptyForm)
  }

  const startEdit = (template: AgentTemplate): void => {
    setEditingId(template.id)
    setForm(toFormState(template))
  }

  const submit = async (): Promise<void> => {
    if (!form.name.trim() || !form.command.trim()) return
    const input = {
      name: form.name.trim(),
      command: form.command.trim(),
      args: parseArgs(form.args),
      color: form.color,
      env: parseEnv(form.env)
    }
    const updated = editingId
      ? await window.api.templates.update(editingId, input)
      : await window.api.templates.create(input)
    setTemplates(updated)
    resetForm()
  }

  const remove = async (id: string): Promise<void> => {
    const updated = await window.api.templates.remove(id)
    setTemplates(updated)
    if (editingId === id) resetForm()
  }

  return (
    <div className="settings-page">
      <h1>에이전트 설정</h1>
      <p className="settings-hint">
        오피스에 배치할 수 있는 에이전트 템플릿을 관리합니다. 실제 CLI 실행 명령어를 등록하세요.
      </p>

      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <ul className="template-list">
          {templates.map((t) => (
            <li key={t.id} className="template-row">
              <span className="template-color" style={{ background: t.color }} />
              <div className="template-info">
                <strong>{t.name}</strong>
                <code>
                  {t.command} {t.args.join(' ')}
                </code>
                {t.env && Object.keys(t.env).length > 0 && (
                  <span className="template-env-badge">환경변수 {Object.keys(t.env).length}개</span>
                )}
              </div>
              <div className="template-actions">
                <button onClick={() => startEdit(t)}>수정</button>
                <button onClick={() => remove(t.id)}>삭제</button>
              </div>
            </li>
          ))}
          {templates.length === 0 && <li>등록된 템플릿이 없습니다.</li>}
        </ul>
      )}

      <form
        className="template-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h3>{editingId ? '템플릿 수정' : '새 템플릿 추가'}</h3>
        <label>
          이름
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="예: Gemini CLI"
            required
          />
        </label>
        <label>
          실행 명령어
          <input
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            placeholder="예: gemini"
            required
          />
        </label>
        <label>
          인자 (공백 구분)
          <input
            value={form.args}
            onChange={(e) => setForm({ ...form, args: e.target.value })}
            placeholder="예: --model pro"
          />
        </label>
        <label>
          색상
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </label>
        <label>
          API 키 / 환경변수 (한 줄에 KEY=VALUE)
          <textarea
            className="template-env-textarea"
            value={form.env}
            onChange={(e) => setForm({ ...form, env: e.target.value })}
            placeholder={'ANTHROPIC_API_KEY=sk-...\nOPENAI_API_KEY=sk-...'}
            rows={3}
          />
        </label>
        <div className="template-form-actions">
          <button type="submit">{editingId ? '저장' : '추가'}</button>
          {editingId && (
            <button type="button" onClick={resetForm}>
              취소
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default SettingsWindow
