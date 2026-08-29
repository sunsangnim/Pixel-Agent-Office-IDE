const TEAM_ALIASES: Record<string, string> = {
  claude: 'claude-code',
  codex: 'codex-cli',
  antigravity: 'antigravity-cli'
}

export interface AttendanceCommand {
  templateIds: string[]
  clockIn: boolean
}

const MENTION_PATTERN = /@(claude|codex|antigravity)/gi
const CLOCK_OUT_PATTERN = /^퇴근(해요?|합니다|시켜(줘|주세요)?)?\.?$/
const CLOCK_IN_PATTERN = /^출근(해요?|합니다|시켜(줘|주세요)?)?\.?$/

/** "@Claude 퇴근해" -> send that team's lead home for the rest of the
 *  session; "@Claude 출근해" brings them back. Purely a local presence
 *  toggle in the office view - never reaches the CLI process. */
export function parseAttendanceCommand(text: string): AttendanceCommand | null {
  const trimmed = text.trim()
  const mentions = [...trimmed.matchAll(MENTION_PATTERN)]
  if (mentions.length === 0) return null
  const rest = trimmed.replace(MENTION_PATTERN, '').trim()
  const clockIn = CLOCK_IN_PATTERN.test(rest)
  const clockOut = CLOCK_OUT_PATTERN.test(rest)
  if (!clockIn && !clockOut) return null
  const templateIds = [...new Set(mentions.map((match) => TEAM_ALIASES[match[1].toLowerCase()]))]
  return { templateIds, clockIn }
}
