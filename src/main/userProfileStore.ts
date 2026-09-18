import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'

export const DEFAULT_REPRESENTATIVE_NAME = '대표'

function getStorePath(): string {
  return join(app.getPath('userData'), 'user-profile.json')
}

export const userProfileStore = {
  /** Every install ships with the same generic label, not a real person's
   *  name - each user names their own representative on first launch. */
  getRepresentativeName(): string {
    const path = getStorePath()
    if (!existsSync(path)) return DEFAULT_REPRESENTATIVE_NAME
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { representativeName?: string }
      const name = parsed.representativeName?.trim()
      return name && name.length > 0 ? name : DEFAULT_REPRESENTATIVE_NAME
    } catch {
      return DEFAULT_REPRESENTATIVE_NAME
    }
  },

  /** Whether the user has ever set a name - distinct from the getter's
   *  fallback, so the renderer can tell "never configured" apart from
   *  "explicitly chose the default word". */
  hasSetRepresentativeName(): boolean {
    return existsSync(getStorePath())
  },

  setRepresentativeName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return this.getRepresentativeName()
    const path = getStorePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ representativeName: trimmed }, null, 2), 'utf-8')
    return trimmed
  }
}
