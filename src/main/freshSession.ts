import type { AgentTemplate } from '../shared/types'

/** Resume/fork arguments would silently reattach the previous CLI conversation. */
export function freshSessionArgs(template: Pick<AgentTemplate, 'id' | 'args'>): string[] {
  const args = [...template.args]
  if (template.id === 'claude-code') {
    return args.filter((arg, index) => {
      if (/^(?:--continue|-c|--resume|-r|--session-id|--fork-session)(?:=|$)/.test(arg)) return false
      return !['--resume', '-r', '--session-id'].includes(args[index - 1]) || arg.startsWith('-')
    })
  }
  if (template.id === 'codex-cli') {
    const resume = args.findIndex(arg => arg === 'resume' || arg === 'fork')
    return args.filter((arg, index) => {
      if (index === resume || ['--last', '--all'].includes(arg)) return false
      if (resume >= 0 && index === resume + 1 && !arg.startsWith('-')) return false
      return true
    })
  }
  // Unknown CLIs have no universal resume flag; their configured launch is retained.
  return args
}
