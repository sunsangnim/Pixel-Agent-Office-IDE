import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ProjectRepository, TrackedTask } from '../shared/types'
import type { WorkspaceFiles } from './workspaceFiles'
import { taskFeatureBranch } from '../shared/taskGitPolicy'

export type RepositoryCommand = (command: 'git' | 'gh', args: string[], cwd: string) => Promise<string>

export const repositoryCommands: { run: RepositoryCommand } = {
  run(command, args, cwd) {
    const env: NodeJS.ProcessEnv = { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' }
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key]
    return new Promise((resolve, reject) => {
      execFile(command, args, { cwd, env, windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) reject(new Error(`${command}: ${stderr.trim() || error.message}`))
        else resolve(stdout.trim())
      })
    })
  }
}

export function newProjectRepository(taskId: string): ProjectRepository {
  return { name: `office-task-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 12)}`, featureBranch: taskFeatureBranch(taskId), ready: false }
}

const IGNORE = `node_modules/
out/
dist/
build/
.env
.env.*
!.env.example
*.pem
*.key
credentials*.json
secrets*.json
session*.json
*.log
.runtime/
.pixel-agent-office/
private-tasks/
`

/** A saved task keeps its repository identity through failed creation, retry and resume. */
export async function ensureTaskRepository(
  files: WorkspaceFiles, task: TrackedTask, save: (repository: ProjectRepository) => void,
  run: RepositoryCommand = repositoryCommands.run
): Promise<void> {
  if (!task.repository || task.repository.ready) return // Existing projects retain their original repository.
  let repository = { ...task.repository }
  const cwd = files.path(task.projectPath)
  mkdirSync(cwd, { recursive: true })
  const git = (...args: string[]) => run('git', args, cwd)
  const gh = (...args: string[]) => run('gh', args, cwd)
  try {
    if (!existsSync(join(cwd, '.git'))) await git('init', '--initial-branch=main')
    const top = await git('rev-parse', '--show-toplevel')
    if (realpathSync(top) !== realpathSync(cwd)) throw new Error('작업 폴더와 Git 저장소가 일치하지 않습니다.')
    const ignore = join(cwd, '.gitignore')
    if (!existsSync(ignore)) writeFileSync(ignore, IGNORE, 'utf8')
    const commits = await git('rev-list', '--all', '--count')
    if (commits === '0') {
      await git('add', '--', '.gitignore')
      await git('-c', 'user.name=Pixel Agent Office IDE', '-c', 'user.email=office-ide@users.noreply.github.com',
        'commit', '-m', 'Initialize project repository')
    }
    if (!repository.owner) {
      const owner = await gh('api', '--hostname', 'github.com', 'user', '--jq', '.login')
      if (!/^[a-zA-Z0-9-]+$/.test(owner)) throw new Error('GitHub 로그인 계정을 확인할 수 없습니다.')
      repository = { ...repository, owner }
      save(repository)
    }
    const fullName = `${repository.owner}/${repository.name}`
    const remoteUrl = `https://github.com/${fullName}.git`
    let remote: { private: boolean; full_name: string; html_url: string }
    const readRemote = async () => JSON.parse(await gh('api', '--hostname', 'github.com', `repos/${fullName}`))
    try { remote = await readRemote() }
    catch (error) {
      if (!/HTTP 404/.test(String(error))) throw error
      await gh('repo', 'create', fullName, '--private')
      remote = await readRemote()
    }
    if (!remote.private || remote.full_name.toLowerCase() !== fullName.toLowerCase()) {
      throw new Error('작업용 GitHub 비공개 저장소를 확인할 수 없습니다.')
    }
    if ((await git('remote')).split(/\s+/).includes('origin')) {
      const origin = await git('remote', 'get-url', 'origin')
      if (origin !== remoteUrl && origin !== `git@github.com:${fullName}.git`) {
        throw new Error('다른 저장소가 origin에 연결되어 있어 작업을 중단했습니다.')
      }
    } else await git('remote', 'add', 'origin', remoteUrl)
    const pushUrls = (await git('remote', 'get-url', '--push', '--all', 'origin')).split(/\r?\n/)
    if (pushUrls.some(url => url !== remoteUrl && url !== `git@github.com:${fullName}.git`)) {
      throw new Error('origin의 푸시 대상이 이 작업의 저장소와 다릅니다.')
    }
    await git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '--set-upstream', 'origin', 'main')
    if (repository.featureBranch) await git('config', 'office.featureBranch', repository.featureBranch)
    save({ ...repository, url: remote.html_url, ready: true })
  } catch (error) {
    throw new Error(`새 작업 저장소 준비 실패: ${String(error)}\nGitHub CLI(gh) 설치·로그인과 네트워크를 확인한 뒤 “프로젝트 이어가기”에서 이 작업을 다시 선택해주세요. 같은 저장소로 재시도합니다.`, { cause: error })
  }
}
