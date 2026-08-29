import { useEffect, useState } from 'react'
import type { AgentTemplate } from '@shared/types'
import TerminalModal from './components/TerminalModal'
import CorporateCharacterSprite from './components/CorporateCharacterSprite'
import { CORPORATE_ROSTER_SIZE } from './lib/corporateRoster'
import { DEFAULT_TEAM_CAPACITY, MAX_TEAM_CAPACITY, MIN_TEAM_CAPACITY } from '@shared/orchestrationPolicy'

interface FormState {
  name: string
  command: string
  args: string
  color: string
  env: string
  loginArgs: string
}

const emptyForm: FormState = {
  name: '',
  command: '',
  args: '',
  color: '#6ea8fe',
  env: '',
  loginArgs: ''
}

function toFormState(template: AgentTemplate): FormState {
  return {
    name: template.name,
    command: template.command,
    args: template.args.join(' '),
    color: template.color,
    env: Object.entries(template.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    loginArgs: (template.loginArgs ?? []).join(' ')
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
  const [loginSession, setLoginSession] = useState<{ ptyId: string; title: string } | null>(null)
  const [capacities, setCapacities] = useState<Record<string, number>>({})
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({})
  const [capacityErrors, setCapacityErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    window.api.templates.list().then((list) => {
      setTemplates(list)
      setLoading(false)
    })
    window.api.teamCapacity.list().then(setCapacities)
    const unsubscribeTemplates = window.api.templates.onChanged(() => {
      window.api.templates.list().then(setTemplates)
    })
    const unsubscribeCapacity = window.api.teamCapacity.onChanged(() => {
      window.api.teamCapacity.list().then(setCapacities)
    })
    return () => {
      unsubscribeTemplates()
      unsubscribeCapacity()
    }
  }, [])

  const capacityFor = (templateId: string): string =>
    capacityDrafts[templateId] ?? String(capacities[templateId] ?? DEFAULT_TEAM_CAPACITY)

  const saveCapacity = async (templateId: string): Promise<void> => {
    const value = Number(capacityFor(templateId))
    try {
      const updated = await window.api.teamCapacity.set(templateId, value)
      setCapacities(updated)
      setCapacityDrafts((prev) => {
        const next = { ...prev }
        delete next[templateId]
        return next
      })
      setCapacityErrors((prev) => {
        const next = { ...prev }
        delete next[templateId]
        return next
      })
    } catch (e) {
      setCapacityErrors((prev) => ({
        ...prev,
        [templateId]: e instanceof Error ? e.message : String(e)
      }))
    }
  }

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
      env: parseEnv(form.env),
      loginArgs: parseArgs(form.loginArgs)
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

  const startLogin = async (template: AgentTemplate): Promise<void> => {
    const loginArgs = template.loginArgs && template.loginArgs.length > 0 ? template.loginArgs : ['login']
    const { ptyId } = await window.api.pty.spawn({
      command: template.command,
      args: loginArgs,
      env: template.env
    })
    setLoginSession({ ptyId, title: `${template.name} 계정 로그인` })
  }

  const closeLogin = (): void => {
    if (loginSession) window.api.pty.kill(loginSession.ptyId)
    setLoginSession(null)
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>에이전트 설정</h1>
        <span className="settings-count-badge">{templates.length}개 등록됨</span>
      </div>
      <p className="settings-hint">
        오피스에 배치할 수 있는 에이전트 템플릿을 관리합니다. 실제 CLI 실행 명령어를 등록하고, API
        키를 넣거나 계정으로 직접 로그인하세요.
      </p>

      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <ul className="settings-card-list">
          {templates.map((t) => (
            <li key={t.id} className="settings-card">
              <span className="settings-card-icon" style={{ background: t.color }}>
                {t.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="settings-card-body">
                <span className="settings-card-name">{t.name}</span>
                <code className="settings-card-command">
                  {t.command} {t.args.join(' ')}
                </code>
                {t.env && Object.keys(t.env).length > 0 && (
                  <span className="settings-env-badge">환경변수 {Object.keys(t.env).length}개</span>
                )}
                <div className="settings-capacity-row">
                  <span>영역 할당 (데스크 수)</span>
                  <input
                    type="number"
                    min={MIN_TEAM_CAPACITY}
                    max={MAX_TEAM_CAPACITY}
                    className="settings-capacity-input"
                    value={capacityFor(t.id)}
                    onChange={(e) =>
                      setCapacityDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))
                    }
                  />
                  <button type="button" className="pill-btn" onClick={() => saveCapacity(t.id)}>
                    저장
                  </button>
                  {capacityErrors[t.id] && (
                    <span className="settings-capacity-error">{capacityErrors[t.id]}</span>
                  )}
                </div>
              </div>
              <div className="settings-card-actions">
                <button className="pill-btn" onClick={() => startLogin(t)}>
                  계정 로그인
                </button>
                <button className="pill-btn" onClick={() => startEdit(t)}>
                  수정
                </button>
                <button className="pill-btn pill-btn-danger" onClick={() => remove(t.id)}>
                  삭제
                </button>
              </div>
            </li>
          ))}
          {templates.length === 0 && <li>등록된 템플릿이 없습니다.</li>}
        </ul>
      )}

      <form
        className="settings-form-card"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h3>{editingId ? '에이전트 수정' : '새 에이전트 추가'}</h3>
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
          로그인 명령 인자 (공백 구분, 기본값: login)
          <input
            value={form.loginArgs}
            onChange={(e) => setForm({ ...form, loginArgs: e.target.value })}
            placeholder="예: auth login"
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
            className="settings-env-textarea"
            value={form.env}
            onChange={(e) => setForm({ ...form, env: e.target.value })}
            placeholder={'ANTHROPIC_API_KEY=<로컬에서만 설정>\nOPENAI_API_KEY=<로컬에서만 설정>'}
            rows={3}
          />
        </label>
        <div className="settings-form-actions">
          <button type="submit" className="pill-btn pill-btn-primary">
            {editingId ? '저장' : '추가'}
          </button>
          {editingId && (
            <button type="button" className="pill-btn" onClick={resetForm}>
              취소
            </button>
          )}
        </div>
      </form>

      <section className="settings-roster" aria-label="20인 회사원 캐릭터 전체 보기">
        <div className="settings-roster-heading">
          <h2>회사원 캐릭터</h2>
          <span className="settings-count-badge">20명</span>
        </div>
        <div className="settings-roster-grid">
          {Array.from({ length: CORPORATE_ROSTER_SIZE }, (_, index) => (
            <figure key={index} data-roster-index={index}>
              <CorporateCharacterSprite rosterIndex={index} />
              <figcaption>{index === 0 ? '대표' : index <= 15 ? `직원 ${index}` : `확장 ${index - 15}`}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {loginSession && (
        <TerminalModal ptyId={loginSession.ptyId} title={loginSession.title} onClose={closeLogin} />
      )}
    </div>
  )
}

export default SettingsWindow
