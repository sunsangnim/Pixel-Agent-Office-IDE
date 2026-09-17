import { createHash } from 'crypto'
import { existsSync, mkdirSync, realpathSync } from 'fs'
import { join } from 'path'
import { WORKSPACE_FOLDERS } from '../shared/workspaceLayout'
import { repositoryCommands, type RepositoryCommand } from './projectRepository'
import type { WorkspaceFiles } from './workspaceFiles'

export interface TaskFeatureWorktree { path: string; branch: string; baseSha: string }
const preparing = new Map<string, Promise<TaskFeatureWorktree>>()

/** All sessions of a task share one physical feature worktree; main stays separate. */
export async function ensureTaskFeatureWorktree(files: WorkspaceFiles, repoRoot: string, branch: string,
  run: RepositoryCommand = repositoryCommands.run): Promise<TaskFeatureWorktree> {
  repoRoot = files.path(repoRoot)
  const key = `${repoRoot}\0${branch}`
  const existing = preparing.get(key)
  if (existing) return existing
  const pending = (async () => {
    const git = (args: string[], cwd = repoRoot) => run('git', args, cwd)
    if (!branch.startsWith('feature/')) throw new Error('작업은 feature 브랜치를 사용해야 합니다.')
    await git(['check-ref-format', '--branch', branch])
    if (realpathSync(await git(['rev-parse', '--show-toplevel'])) !== realpathSync(repoRoot)) throw new Error('프로젝트 저장소 위치가 다릅니다.')
    const parent = files.path(join(WORKSPACE_FOLDERS.agents, `task-${createHash('sha1').update(repoRoot).digest('hex').slice(0, 12)}`))
    const path = files.path(join(parent, 'feature'))
    if (!existsSync(path)) {
      mkdirSync(parent, { recursive: true })
      const ref = `refs/heads/${branch}`
      const found = (await git(['for-each-ref', '--format=%(refname)', ref])).split(/\r?\n/).includes(ref)
      await git(found ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path, 'main'])
    }
    const common = await git(['rev-parse', '--path-format=absolute', '--git-common-dir'], path)
    const rootCommon = await git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
    if (realpathSync(common) !== realpathSync(rootCommon) || await git(['branch', '--show-current'], path) !== branch) {
      throw new Error('공용 작업본의 저장소 또는 feature 브랜치가 다릅니다. 기존 작업본은 보존했습니다.')
    }
    return { path, branch, baseSha: await git(['merge-base', 'main', branch]) }
  })()
  preparing.set(key, pending)
  try { return await pending } finally { preparing.delete(key) }
}

export async function mergeTaskFeature(files: WorkspaceFiles, repoRoot: string, worktreePath: string, branch: string,
  repositoryUrl: string, run: RepositoryCommand = repositoryCommands.run): Promise<string> {
  repoRoot = files.path(repoRoot)
  const worktree = await ensureTaskFeatureWorktree(files, repoRoot, branch, run)
  if (realpathSync(worktree.path) !== realpathSync(files.path(worktreePath))) throw new Error('이 작업의 공용 작업본이 아닙니다.')
  const git = (args: string[], cwd = repoRoot) => run('git', args, cwd)
  if (await git(['branch', '--show-current']) !== 'main') throw new Error('프로젝트의 기본 작업본이 main 브랜치여야 합니다.')
  for (const cwd of [repoRoot, worktree.path]) {
    if (await git(['status', '--porcelain'], cwd)) throw new Error('변경사항을 feature에 커밋하고 검증을 마친 뒤 병합할 수 있습니다.')
  }
  const expected = `${repositoryUrl}.git`
  if (await git(['remote', 'get-url', 'origin']) !== expected ||
    (await git(['remote', 'get-url', '--push', '--all', 'origin'])).split(/\r?\n/).some(url => url !== expected)) {
    throw new Error('origin이 이 작업의 저장소와 다릅니다.')
  }
  await git(['fetch', 'origin'])
  const remoteMain = await git(['rev-parse', 'origin/main'])
  if (await git(['merge-base', 'origin/main', branch]) !== remoteMain) {
    throw new Error('최신 origin/main을 feature에 반영하고 다시 검증한 뒤 병합해주세요.')
  }
  const push = (ref: string) => git(['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', 'origin', ref])
  await push(branch)
  await git(['merge', '--ff-only', 'origin/main'])
  await git(['merge', '--no-ff', '--no-edit', branch])
  await push('main')
  return `${branch}의 최종 변경을 main에 병합하고 origin/main에 푸시했습니다.`
}
