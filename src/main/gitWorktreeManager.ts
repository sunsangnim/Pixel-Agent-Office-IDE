import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { basename, join } from 'path'
import { app } from 'electron'
import type { GitDiffFile, GitDiffFileStatus, GitDiffHunk, GitDiffLine, GitDiffResult, GitMergeResult } from '../shared/types'

function run(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

function repoSlug(repoRoot: string): string {
  const hash = createHash('sha1').update(repoRoot).digest('hex').slice(0, 8)
  return `${basename(repoRoot).replace(/[^a-zA-Z0-9._-]/g, '-') || 'repo'}-${hash}`
}

function worktreesRoot(repoRoot: string): string {
  return join(app.getPath('userData'), 'worktrees', repoSlug(repoRoot))
}

export async function isGitRepo(repoRoot: string): Promise<boolean> {
  try {
    const out = await run(['rev-parse', '--is-inside-work-tree'], repoRoot)
    return out.trim() === 'true'
  } catch {
    return false
  }
}

export interface DeskWorktree {
  path: string
  branch: string
  baseSha: string
}

/** Idempotent: returns the existing worktree for a desk if one was already created. */
export async function ensureDeskWorktree(repoRoot: string, deskKey: string): Promise<DeskWorktree | null> {
  if (!(await isGitRepo(repoRoot))) return null

  const branch = `desk/${deskKey}`
  const path = join(worktreesRoot(repoRoot), deskKey)

  if (existsSync(path)) {
    try {
      const baseSha = (await run(['merge-base', branch, 'HEAD'], repoRoot)).trim()
      return { path, branch, baseSha }
    } catch {
      // fall through and try to (re)create below
    }
  }

  mkdirSync(worktreesRoot(repoRoot), { recursive: true })
  const baseSha = (await run(['rev-parse', 'HEAD'], repoRoot)).trim()

  try {
    await run(['worktree', 'add', '-b', branch, path, baseSha], repoRoot)
  } catch (error) {
    // branch may already exist from a prior run whose worktree dir was removed manually
    const message = error instanceof Error ? error.message : String(error)
    if (!/already exists/i.test(message)) throw error
    await run(['worktree', 'add', path, branch], repoRoot)
  }

  return { path, branch, baseSha }
}

export async function removeDeskWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  try {
    await run(['worktree', 'remove', '--force', worktreePath], repoRoot)
  } catch {
    // best-effort: the directory may already be gone, or still locked by a lingering process
  }
}

function statusFromDiffHeader(header: string): GitDiffFileStatus {
  if (/^new file mode/m.test(header)) return 'added'
  if (/^deleted file mode/m.test(header)) return 'deleted'
  if (/^rename from/m.test(header)) return 'renamed'
  return 'modified'
}

/** Parses `git diff` unified output. No external dependency: git's format is stable. */
function parseUnifiedDiff(raw: string): GitDiffFile[] {
  const files: GitDiffFile[] = []
  const fileBlocks = raw.split(/^diff --git /m).slice(1)

  for (const block of fileBlocks) {
    const headerEnd = block.search(/^@@/m)
    const header = headerEnd === -1 ? block : block.slice(0, headerEnd)
    const pathMatch = header.match(/a\/(.+?) b\/(.+?)(?:\n|$)/)
    const path = pathMatch?.[2] ?? pathMatch?.[1] ?? header.split('\n')[0]?.trim() ?? 'unknown'
    const status = statusFromDiffHeader(header)

    const hunks: GitDiffHunk[] = []
    if (headerEnd !== -1) {
      const hunkText = block.slice(headerEnd)
      const hunkChunks = hunkText.split(/(?=^@@ )/m).filter((chunk) => chunk.startsWith('@@'))
      for (const chunk of hunkChunks) {
        const lines = chunk.split('\n')
        const hunkHeaderMatch = lines[0].match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        let oldLine = hunkHeaderMatch ? Number(hunkHeaderMatch[1]) : 0
        let newLine = hunkHeaderMatch ? Number(hunkHeaderMatch[2]) : 0
        const diffLines: GitDiffLine[] = []
        for (const line of lines.slice(1)) {
          if (!line) continue
          if (line.startsWith('+')) {
            diffLines.push({ type: 'add', text: line.slice(1), newLine })
            newLine += 1
          } else if (line.startsWith('-')) {
            diffLines.push({ type: 'del', text: line.slice(1), oldLine })
            oldLine += 1
          } else if (line.startsWith('\\')) {
            // "\ No newline at end of file" — not a content line
          } else {
            diffLines.push({ type: 'context', text: line.slice(1), oldLine, newLine })
            oldLine += 1
            newLine += 1
          }
        }
        hunks.push({ header: lines[0], lines: diffLines })
      }
    }

    files.push({ path, status, hunks })
  }

  return files
}

export async function diffAgainstBase(worktreePath: string, baseSha: string): Promise<GitDiffResult> {
  try {
    const raw = await run(['diff', baseSha], worktreePath)
    return { branch: null, baseSha, files: parseUnifiedDiff(raw) }
  } catch (error) {
    return {
      branch: null,
      baseSha,
      files: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  const out = await run(['status', '--porcelain'], worktreePath)
  return out.trim().length > 0
}

/** Diff Panel의 "병합" 버튼은 화면에 보이는 변경사항이 그대로 들어가야 직관적이므로,
 *  아직 커밋되지 않은 워크트리 변경분은 병합 직전 스냅샷 커밋으로 먼저 갈무리한다. */
async function snapshotUncommittedChanges(worktreePath: string, branch: string): Promise<void> {
  await run(['add', '-A'], worktreePath)
  await run(['commit', '-m', `desk: ${branch} 병합 전 스냅샷`], worktreePath)
}

export async function mergeDeskBranch(repoRoot: string, worktreePath: string, branch: string): Promise<GitMergeResult> {
  try {
    if (await hasUncommittedChanges(worktreePath)) {
      await snapshotUncommittedChanges(worktreePath, branch)
    }
    const out = await run(['merge', '--no-ff', branch], repoRoot)
    return { ok: true, message: out.trim() || `${branch} 브랜치를 병합했습니다.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
