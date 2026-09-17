import { strict as assert } from 'node:assert'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { WorkspaceFiles } from '../src/main/workspaceFiles'
import { TaskRecoveryStore } from '../src/main/taskRecoveryStore'
import { taskWorkspaceManager } from '../src/main/taskWorkspaceManager'
import { freshSessionArgs } from '../src/main/freshSession'
import { CHAT_HISTORY_KEY, resetChatForBoot } from '../src/renderer/src/lib/chatHistory'
import { resolveResumeRequest } from '../src/renderer/src/lib/resumeCommands'
import type { AgentInstance, TaskCommand } from '../src/shared/types'

async function main() {
  const root = mkdtempSync(join(resolve('out'), 'recovery-unit-'))
  const files = new WorkspaceFiles(root)
  files.ensure()
  const project = files.path('프로젝트/테트리스')
  mkdirSync(project)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim()
  git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid')
  writeFileSync(join(project, 'game.txt'), 'initial')
  git('add', 'game.txt'); git('commit', '-m', 'initial game')
  const sha = git('rev-parse', '--short', 'HEAD')
  const workspace = taskWorkspaceManager.prepare(files.path('산출물/문서'), '블록 낙하 구현')
  assert.ok(existsSync(workspace.developmentLogPath))
  let store = new TaskRecoveryStore(files)
  store.register(workspace, '블록 낙하 구현', project)
  const instance = { instanceId: 'old-session', profileId: 'claude-code:lead', templateId: 'claude-code', cwd: project, repoRoot: project } as AgentInstance
  const dispatch = (stage: 'planning' | 'execution', prompt: string) => store.enqueue({ taskId: workspace.taskId, stage,
    assignments: [{ instanceId: instance.instanceId, prompt, role: stage }] }, [instance])[0]
  assert.throws(() => dispatch('execution', 'do not bypass approval'), /승인/)
  const planning = dispatch('planning', '기획 작성')
  assert.equal(await store.acceptReceipt(workspace.taskId, planning.id), false, 'silence or terminal completion does not complete a task')

  const receipt = (command: TaskCommand, outcome = 'completed', override: Record<string, unknown> = {}) => {
    appendFileSync(workspace.developmentLogPath, '\n기록: 테스트 및 변경을 확인했습니다.\n')
    const file = store.receiptPath(store.get(workspace.taskId), command)
    mkdirSync(join(workspace.rootPath, '.runtime'), { recursive: true })
    writeFileSync(file, JSON.stringify({ commandId: command.id, attemptId: command.attemptId, outcome,
      summary: '검증된 결과', changedFiles: ['game.txt'], checks: ['test passed'], nextSteps: [],
      reviewed: { srs: true, developmentLog: true, git: true }, ...override }))
    return file
  }
  receipt(planning, 'completed', { reviewed: { srs: false } })
  assert.equal(await store.acceptReceipt(workspace.taskId, planning.id), false, 'reading the required context must be acknowledged')
  receipt(planning)
  assert.equal(await store.acceptReceipt(workspace.taskId, planning.id), true)
  assert.equal(store.get(workspace.taskId).stage, 'review')
  store = new TaskRecoveryStore(files)
  assert.equal(store.get(workspace.taskId).stage, 'review', 'restart preserves approval wait')
  assert.throws(() => dispatch('execution', 'still not approved'), /승인/)
  store.approve(workspace.taskId)
  let command = dispatch('execution', 'implement remaining falling blocks')
  store.setStatus(workspace.taskId, command.id, 'running', '')
  writeFileSync(join(project, 'game.txt'), 'uncommitted half-finished code')
  store.setStatus(workspace.taskId, command.id, 'interrupted', 'IDE closed')
  const oldAttempt = command.attemptId
  store = new TaskRecoveryStore(files)
  command = store.resume(workspace.taskId, command.id)
  assert.notEqual(command.attemptId, oldAttempt, 'fresh attempt cannot accept an old completion')
  const prompt = await store.prompt(workspace.taskId, command)
  assert.match(prompt, /새 세션 작업 인수인계/)
  for (const required of [workspace.specPath, workspace.developmentLogPath, 'git log', 'git status/git diff', sha, 'game.txt', '각 명령·작업', '남은 작업']) assert.ok(prompt.includes(required), required)
  for (const required of ['feature/', '추가 확인 없이', '중간 Phase에서는 main', 'Git 담당: claude-code:lead']) assert.ok(prompt.includes(required), required)
  assert.ok(!prompt.includes('사용자 승인을 확인한 경우'))
  assert.equal(readFileSync(join(project, 'game.txt'), 'utf8'), 'uncommitted half-finished code')
  receipt(command, 'completed', { attemptId: oldAttempt })
  assert.equal(await store.acceptReceipt(workspace.taskId, command.id), false)
  receipt(command, 'incomplete', { nextSteps: ['remaining collision test'] })
  assert.equal(await store.acceptReceipt(workspace.taskId, command.id), true)
  assert.equal(store.get(workspace.taskId).stage, 'execution')
  assert.equal(await store.acceptReceipt(workspace.taskId, command.id), false, 'an incomplete receipt is logged once')
  command = store.resume(workspace.taskId, command.id)
  receipt(command)
  assert.equal(await store.acceptReceipt(workspace.taskId, command.id), true)
  assert.equal(store.get(workspace.taskId).stage, 'completed')
  const log = readFileSync(workspace.developmentLogPath, 'utf8')
  for (const required of ['검증된 결과', 'test passed', sha, 'game.txt', 'remaining collision test']) assert.ok(log.includes(required))
  assert.equal(await store.acceptReceipt(workspace.taskId, command.id), false, 'completion is idempotent')
  console.log('PASS persistent commands, approval gate, fresh attempt, Git/diff context, journal per result, partial completion and stale receipt rejection')

  const projectB = files.path('프로젝트/오목')
  mkdirSync(projectB)
  const other = taskWorkspaceManager.prepare(files.path('산출물/문서'), '오목 돌 놓기')
  store.register(other, '오목 돌 놓기', projectB)
  const taskB = store.get(other.taskId)
  const resumableA = { ...store.get(workspace.taskId), stage: 'execution' as const }
  const tasks = [resumableA, taskB]
  assert.deepEqual(resolveResumeRequest('테트리스 하자', tasks), { kind: 'project', projectPath: project })
  assert.deepEqual(resolveResumeRequest('오목 이어서 하자', tasks), { kind: 'project', projectPath: projectB })
  assert.deepEqual(resolveResumeRequest('계속하자', tasks), { kind: 'select' })
  assert.deepEqual(resolveResumeRequest('테트리스랑 오목 이어서 하자', tasks), { kind: 'select' })
  assert.deepEqual(resolveResumeRequest('회의하자', tasks), { kind: 'none' })
  assert.deepEqual(resolveResumeRequest('새로운 버튼 만들어줘', tasks), { kind: 'none' })
  const missing = other.specPath + '.saved'
  renameSync(other.specPath, missing)
  assert.doesNotThrow(() => new TaskRecoveryStore(files), 'startup reads metadata, not project documents')
  const bRequest = { taskId: other.taskId, stage: 'planning' as const, assignments: [{ instanceId: instance.instanceId, role: 'planning', prompt: 'plan' }] }
  assert.throws(() => store.enqueue(bRequest, [instance]), /프로젝트와 세션/, 'another project cannot receive this task')
  const bCommand = store.enqueue(bRequest, [{ ...instance, cwd: projectB, repoRoot: projectB }])[0]
  assert.throws(() => store.resume(other.taskId, bCommand.id), /문서가 없습니다/)
  assert.equal(existsSync(other.specPath), false, 'missing documents are not silently replaced')
  renameSync(missing, other.specPath)
  store.cancel(other.taskId)
  assert.equal(new TaskRecoveryStore(files).get(other.taskId).stage, 'cancelled')
  assert.throws(() => store.enqueue({ taskId: other.taskId, stage: 'planning', assignments: [] }, []), /취소/)
  console.log('PASS project selection, ambiguous requests, no document read at startup, missing-document stop, cancellation persistence')

  assert.deepEqual(freshSessionArgs({ id: 'claude-code', args: ['--continue', '--resume', 'old', '--session-id=stale', '--model', 'sonnet'] }), ['--model', 'sonnet'])
  assert.deepEqual(freshSessionArgs({ id: 'codex-cli', args: ['resume', '--last', '--model', 'chosen'] }), ['--model', 'chosen'])
  assert.deepEqual(freshSessionArgs({ id: 'codex-cli', args: ['fork', 'old-session'] }), [])
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  values.set(CHAT_HISTORY_KEY, 'old conversation')
  values.set('pixel-office-layout-v1', 'keep layout')
  resetChatForBoot(storage, 'boot-one')
  assert.equal(values.has(CHAT_HISTORY_KEY), false)
  values.set(CHAT_HISTORY_KEY, 'current conversation')
  resetChatForBoot(storage, 'boot-one')
  assert.equal(values.get(CHAT_HISTORY_KEY), 'current conversation', 'renderer refresh preserves current conversation')
  resetChatForBoot(storage, 'boot-two')
  assert.equal(values.has(CHAT_HISTORY_KEY), false, 'new IDE process clears the conversation')
  assert.equal(values.get('pixel-office-layout-v1'), 'keep layout')
  console.log('PASS fresh CLI arguments and new-boot-only chat clearing without losing office data')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
