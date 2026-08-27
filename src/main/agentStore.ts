import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import type { AgentTemplate, AgentTemplateInput, AgentTemplatePatch } from '../shared/types'

const defaultTemplates: AgentTemplate[] = [
  { id: 'claude-code', name: 'Claude Code', command: 'claude', args: [], color: '#d97757' },
  { id: 'codex-cli', name: 'Codex CLI', command: 'codex', args: [], color: '#10a37f' },
  {
    id: 'antigravity-cli',
    name: 'Antigravity CLI',
    command: 'antigravity',
    args: [],
    color: '#8b7cf6'
  }
]

function getStorePath(): string {
  return join(app.getPath('userData'), 'agent-templates.json')
}

function readTemplates(): AgentTemplate[] {
  const path = getStorePath()
  if (!existsSync(path)) {
    return defaultTemplates
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as AgentTemplate[]
    if (!Array.isArray(parsed)) return defaultTemplates
    // Built-in teams are additive so existing installations also receive newly
    // introduced CLI adapters without overwriting user customizations.
    const existingIds = new Set(parsed.map((template) => template.id))
    return [...parsed, ...defaultTemplates.filter((template) => !existingIds.has(template.id))]
  } catch {
    return defaultTemplates
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
