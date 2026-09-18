import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import type { AgentTemplate, AgentTemplateInput, AgentTemplatePatch } from '../shared/types'

const defaultTemplates: AgentTemplate[] = [
  // `claude` has no top-level "login" command - only `claude auth login` (see `claude auth --help`).
  // Without this, the generic ['login'] fallback in SettingsWindow's login button hands the CLI a
  // bare "login" positional, which it treats as a chat prompt instead of an auth command.
  { id: 'claude-code', name: 'Claude Code', command: 'claude', args: [], color: '#d97757', leadTitle: '부장', loginArgs: ['auth', 'login'] },
  // `codex login` is a real top-level subcommand, so the plain form is correct here.
  { id: 'codex-cli', name: 'Codex CLI', command: 'codex', args: [], color: '#10a37f', leadTitle: '차장', loginArgs: ['login'] },
  {
    id: 'antigravity-cli',
    name: 'Antigravity CLI',
    command: 'antigravity',
    args: [],
    color: '#8b7cf6',
    leadTitle: '과장'
  }
]

function getStorePath(): string {
  return join(app.getPath('userData'), 'agent-templates.json')
}

function readTemplates(): AgentTemplate[] {
  const path = getStorePath()
  // No file yet means a fresh install - the office starts empty except the
  // representative, and each team only shows up once its CLI is added
  // (either as a custom template or one of the built-in presets below).
  if (!existsSync(path)) {
    return []
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as AgentTemplate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeTemplates(templates: AgentTemplate[]): void {
  const path = getStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(templates, null, 2), 'utf-8')
}

export const agentTemplateStore = {
  list(): AgentTemplate[] {
    return readTemplates()
  },

  /** The known built-in CLIs a user can one-click add, so they don't have to
   *  hand-type command names and colors for Claude/Codex/Antigravity. */
  presets(): AgentTemplate[] {
    return defaultTemplates
  },

  addPreset(id: string): AgentTemplate[] {
    const preset = defaultTemplates.find((template) => template.id === id)
    if (!preset) return readTemplates()
    const templates = readTemplates()
    if (templates.some((template) => template.id === id)) return templates
    const updated = [...templates, preset]
    writeTemplates(updated)
    return updated
  },

  create(input: AgentTemplateInput): AgentTemplate[] {
    const template: AgentTemplate = { ...input, id: randomUUID() }
    const templates = [...readTemplates(), template]
    writeTemplates(templates)
    return templates
  },

  update(id: string, patch: AgentTemplatePatch): AgentTemplate[] {
    const templates = readTemplates().map((t) => (t.id === id ? { ...t, ...patch } : t))
    writeTemplates(templates)
    return templates
  },

  remove(id: string): AgentTemplate[] {
    const templates = readTemplates().filter((t) => t.id !== id)
    writeTemplates(templates)
    return templates
  }
}
