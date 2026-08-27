export function isMeetingStartCommand(text: string): boolean {
  return /(회의\s*(하자|시작)|다\s*모여)/i.test(text)
}

export function isMeetingEndCommand(text: string): boolean {
  return /(회의\s*(끝|종료)|업무\s*복귀)/i.test(text)
}
