import type { AgentInstance, AgentProfile } from '@shared/types'

const ALIASES: Record<string, string> = {
  claude: 'claude-code', 클로드: 'claude-code', codex: 'codex-cli', 코덱스: 'codex-cli',
  antigravity: 'antigravity-cli', 안티그래비티: 'antigravity-cli', 안티그래피: 'antigravity-cli'
}
const NAMES = Object.keys(ALIASES).join('|')
const MENTION = new RegExp(`@(${NAMES})(?=\\s|[,：:]|$)`, 'gi')
const ADDRESS = new RegExp(`^(${NAMES})(?:\\s*(?:부장|차장|과장))?(?:님|야|아)?[\\s,：:]+`, 'i')
const VISIT = /^(?:대표실|사장실|내방|내사무실)(?:로|에)?(?:좀)?(?:오게나|오너라|오세요|와(?:줘요?|주세요|요|봐)?|들어와(?:줘요?|주세요|요)?|이동(?:해(?:줘요?|주세요|요)?|하자|하세요)?)$/
const RETURN = /^(?:(?:자기|각자|네|너희|본인|원래)?(?:자리|좌석)(?:으?로)?(?:좀)?)?(?:돌아가(?:게나?|라|세요|줘요?|주세요|요)?|복귀(?:해(?:라|줘요?|주세요|요)?|하게나?|하자|하세요)?)$|^(?:(?:자기|네|너희|본인|원래)?(?:자리|좌석)(?:으?로)?)(?:가(?:게나?|줘요?|주세요|세요|라|요)?)$/

export interface OfficeCommand { action: 'visit' | 'return'; templateIds: string[]; all?: boolean }

export function parseOfficeCommand(text: string): OfficeCommand | null {
  let rest = text.normalize('NFKC').trim()
  const ids = [...rest.matchAll(MENTION)].map((match) => ALIASES[match[1].toLowerCase()])
  rest = rest.replace(MENTION, '').trim()
  const address = rest.match(ADDRESS)
  if (address) { ids.push(ALIASES[address[1].toLowerCase()]); rest = rest.slice(address[0].length) }
  rest = rest.replace(/\s+/g, '').replace(/[.!?。！？~]+$/, '')
  const all = /^(?:모두|다들|다같이|전부|각자)/.test(rest)
  rest = rest.replace(/^(?:모두|다들|다같이|전부|각자)/, '')
  const action = VISIT.test(rest) ? 'visit' : RETURN.test(rest) ? 'return' : null
  return action ? { action, templateIds: [...new Set(ids)], ...(all && !ids.length ? { all: true } : {}) } : null
}

export function resolveOfficeCommandTargets(command: OfficeCommand, profiles: AgentProfile[], instances: AgentInstance[],
  selectedIds: string[], conversationProfileId: string | null, visitors: ReadonlySet<string>): AgentProfile[] {
  if (command.templateIds.length) return profiles.filter((profile) => profile.rank === 'teamLead' && command.templateIds.includes(profile.templateId))
  if (command.all) return profiles.filter((profile) => command.action === 'return' ? visitors.has(profile.profileId) : profile.rank === 'teamLead')
  const selected = profiles.filter((profile) => instances.some((instance) => instance.profileId === profile.profileId && selectedIds.includes(instance.instanceId)))
  if (selected.length) return selected
  const conversation = profiles.find((profile) => profile.profileId === conversationProfileId)
  if (conversation) return [conversation]
  const visiting = profiles.filter((profile) => visitors.has(profile.profileId))
  return visiting.length === 1 ? visiting : []
}

export const OFFICE_VISIT_KEY = 'pixel-office-representative-visitors-v1'
export function readOfficeVisitors(storage: Pick<Storage, 'getItem'>): Set<string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(OFFICE_VISIT_KEY) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
  } catch { return new Set() }
}
