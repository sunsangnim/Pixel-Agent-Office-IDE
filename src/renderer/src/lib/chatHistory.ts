export interface ChatMessage {
  id: string
  kind: 'user' | 'agent' | 'system'
  authorName: string
  authorColor: string
  authorSeed: string
  text: string
}

export const CHAT_HISTORY_KEY = 'pixel-office:chat-history-v1'
const HISTORY_LIMIT = 300
const CHAT_BOOT_KEY = 'pixel-office:chat-boot-id'

/** A renderer reload keeps the conversation; a new IDE process starts empty. */
export function resetChatForBoot(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, bootId: string): void {
  if (storage.getItem(CHAT_BOOT_KEY) === bootId) return
  storage.removeItem(CHAT_HISTORY_KEY)
  storage.setItem(CHAT_BOOT_KEY, bootId)
}

export function userChatMessage(text: string, authorName: string): ChatMessage {
  return { id: crypto.randomUUID(), kind: 'user', authorName, authorColor: '#6ea8fe', authorSeed: 'me', text }
}

export function readChatHistory(storage: Pick<Storage, 'getItem'>): ChatMessage[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(CHAT_HISTORY_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is ChatMessage => Boolean(entry) &&
      ['user', 'agent', 'system'].includes(entry.kind) &&
      ['id', 'authorName', 'authorColor', 'authorSeed', 'text'].every((key) => typeof entry[key] === 'string'))
      .slice(-HISTORY_LIMIT)
  } catch { return [] }
}

export function saveChatHistory(storage: Pick<Storage, 'setItem'>, messages: ChatMessage[]): void {
  try { storage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_LIMIT))) }
  catch { /* A full local store must not prevent sending or displaying chat. */ }
}
