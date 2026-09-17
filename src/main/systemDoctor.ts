import { execFile } from 'child_process'

function run(command: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 8000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: error ? (stderr.trim() || error.message) : stdout.trim() })
    })
  })
}

export interface GitEnvironmentCheck {
  ok: boolean
  /** Korean, ready to show as-is - explains exactly which prerequisite is missing. */
  message: string
}

/** New-task repository creation needs `git` and an authenticated `gh` before
 *  it touches anything. Without this, the first sign of a missing/unauthenticated
 *  CLI was a generic failure several git/gh calls into ensureTaskRepository. */
export async function checkGitEnvironment(): Promise<GitEnvironmentCheck> {
  const git = await run('git', ['--version'])
  if (!git.ok) return { ok: false, message: 'Git이 설치되어 있지 않거나 PATH에서 찾을 수 없습니다. Git을 설치한 뒤 다시 시도해주세요.' }

  const gh = await run('gh', ['--version'])
  if (!gh.ok) return { ok: false, message: 'GitHub CLI(gh)가 설치되어 있지 않거나 PATH에서 찾을 수 없습니다. gh를 설치한 뒤 다시 시도해주세요.' }

  const auth = await run('gh', ['auth', 'status', '--hostname', 'github.com'])
  if (!auth.ok) {
    return {
      ok: false,
      message: 'GitHub CLI(gh)에 로그인되어 있지 않습니다. 터미널에서 "gh auth login --hostname github.com"으로 로그인한 뒤 다시 시도해주세요.'
    }
  }

  return { ok: true, message: '' }
}
