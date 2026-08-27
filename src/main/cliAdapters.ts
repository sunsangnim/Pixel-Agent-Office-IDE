import type { AgentRuntimeState, CliAdapterId } from '../shared/types'

export interface AdapterSignal {
  state: AgentRuntimeState
  reason?: string
}

export interface CliAdapter {
  id: CliAdapterId
  displayName: string
  completionIdleMs: number
  serializePrompt(prompt: string): string
  inspectOutput(output: string): AdapterSignal | null
}

const ANSI_PATTERN = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g
const ERROR_PATTERN = /(?:not authenticated|login required|unauthorized|permission denied|rate limit|quota exceeded|fatal error|command not found)/i

function clean(output: string): string {
  return output.replace(ANSI_PATTERN, '').replace(/\r/g, '')
}

function prompt(promptText: string): string {
  return `${promptText.replace(/\r?\n/g, '\n')}\r`
}

function inspectCommon(output: string, readyPattern: RegExp): AdapterSignal | null {
  const text = clean(output)
  const error = text.match(ERROR_PATTERN)?.[0]
  if (error) return { state: 'error', reason: error }
  if (/allow|approve|confirm|permission|press enter|\by\/n\b/i.test(text)) {
    return { state: 'waiting', reason: '사용자 확인 또는 권한 승인을 기다리는 중' }
  }
  if (readyPattern.test(text)) return { state: 'ready' }
  if (/thinking|working|running tool|executing|searching|analyzing/i.test(text)) return { state: 'working' }
  return null
}

const adapters: Record<CliAdapterId, CliAdapter> = {
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    completionIdleMs: 1800,
    serializePrompt: prompt,
    inspectOutput(output) {
      const text = clean(output)
      // Claude print/stream-json emits a terminal result event. Interactive
      // sessions fall back to the prompt and inactivity detector.
      if (/"type"\s*:\s*"result"/.test(text)) return { state: 'completed' }
      return inspectCommon(text, /(?:^|\n)\s*[>❯]\s*$/m)
    }
  },
  codex: {
    id: 'codex',
    displayName: 'Codex CLI',
    completionIdleMs: 2000,
    serializePrompt: prompt,
    inspectOutput(output) {
      const text = clean(output)
      // codex exec --json terminates after task completion; interactive mode
      // uses the prompt/inactivity fallback below.
      if (/"type"\s*:\s*"turn\.completed"|"type"\s*:\s*"task_complete"/.test(text)) {
        return { state: 'completed' }
      }
      return inspectCommon(text, /(?:^|\n)\s*[>›]\s*$/m)
    }
  },
  antigravity: {
    id: 'antigravity',
    displayName: 'Antigravity CLI',
    completionIdleMs: 2500,
    serializePrompt: prompt,
    inspectOutput(output) {
      // AGY is currently TUI-first, so keep its recognizer deliberately
      // conservative and rely on idle completion when no explicit signal exists.
      return inspectCommon(output, /(?:^|\n)\s*[>›❯]\s*$/m)
    }
  },
  generic: {
    id: 'generic',
    displayName: 'Custom CLI',
    completionIdleMs: 2500,
    serializePrompt: prompt,
    inspectOutput(output) {
      return inspectCommon(output, /(?:^|\n)\s*[>$›❯]\s*$/m)
    }
  }
}

export function getCliAdapter(adapterId: CliAdapterId | undefined): CliAdapter {
  return adapters[adapterId ?? 'generic'] ?? adapters.generic
}

export function adapterIdForTemplate(templateId: string): CliAdapterId {
  if (templateId === 'claude-code') return 'claude'
  if (templateId === 'codex-cli') return 'codex'
  if (templateId === 'antigravity-cli') return 'antigravity'
  return 'generic'
}
