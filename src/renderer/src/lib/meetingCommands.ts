export type MeetingCommand = 'start' | 'end'

const DO = '(?:하자|하자고|합시다|해(?:요|줘요?|주세요)?|하죠|할까(?:요)?|하겠습니다)'
const START = new RegExp(`^(?:회의(?:를)?(?:좀)?(?:${DO}|시작(?:${DO})?)|(?:다)?(?:회의실(?:로|에))?(?:모여(?:요|줘요?|주세요)?|모입시다|모이자|모이세요))$`)
const END = new RegExp(`^(?:회의(?:를)?(?:끝|종료(?:${DO})?|끝내(?:자|요|줘요?|주세요)|마칩시다|마치(?:자|죠|겠습니다)|마쳐(?:요|줘요?|주세요)|그만(?:${DO}))|업무(?:로)?복귀(?:${DO})?)$`)

export function parseMeetingCommand(text: string): MeetingCommand | null {
  const command = text.normalize('NFKC').trim()
    .replace(/^(?:@(?:claude|codex|antigravity|클로드|코덱스|안티그래피|안티그래비티)(?=\s|[,：:]|$)[\s,：:]*)+/i, '')
    .replace(/\s+/g, '')
    .replace(/[.!?。！？~]+$/, '')
    .replace(/^(?:(?:자|이제|그럼|우리|모두|다같이|다들|전부|전체|팀장님들|팀장들|여러분)[,:：]*)+/, '')
  // Match the whole request: a task about a "회의 시작 버튼" or a quoted
  // meeting command must still reach planning, rather than summon everyone.
  if (START.test(command)) return 'start'
  if (END.test(command)) return 'end'
  return null
}

export function isMeetingStartCommand(text: string): boolean {
  return parseMeetingCommand(text) === 'start'
}

export function isMeetingEndCommand(text: string): boolean {
  return parseMeetingCommand(text) === 'end'
}
