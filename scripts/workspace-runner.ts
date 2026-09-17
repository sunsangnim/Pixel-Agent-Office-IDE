import { strict as assert } from 'node:assert'
import { dirname, join, resolve } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, readFileSync } from 'node:fs'
import { WorkspaceFiles } from '../src/main/workspaceFiles'
import { taskWorkspaceManager } from '../src/main/taskWorkspaceManager'
import { TASK_DOCUMENTS_FOLDER, WORKSPACE_FOLDERS } from '../src/shared/workspaceLayout'
import { ensureTaskRepository, newProjectRepository, repositoryCommands } from '../src/main/projectRepository'
import { TaskRecoveryStore } from '../src/main/taskRecoveryStore'
import { repositoryFixture } from './fixtures/project-repository'
import { ensureTaskFeatureWorktree, mergeTaskFeature } from '../src/main/taskFeatureWorktree'
import { taskFeatureBranch } from '../src/shared/taskGitPolicy'

async function main() {
  const fixture = mkdtempSync(join(resolve('out'), 'workspace-test-'))
  const root = join(fixture, '작업실')
  mkdirSync(join(root, '문서', '기존 작업'), { recursive: true })
  mkdirSync(join(root, '결과물', '에셋'), { recursive: true })
  const legacyDoc = join(root, '문서', '기존 작업', 'SRS.md')
  const legacyAsset = join(root, '결과물', '에셋', 'image.png')
  writeFileSync(legacyDoc, '# 기존 문서')
  writeFileSync(legacyAsset, Buffer.from([0, 1, 2, 3]))
  const previousResources = [
    ['필수 자료/에셋/오피스 리소스/에셋/coffee.png', `${WORKSPACE_FOLDERS.assets}/coffee.png`],
    ['필수 자료/에셋/오피스 리소스/애니메이션/drink.png', `${WORKSPACE_FOLDERS.animations}/drink.png`],
    ['필수 자료/에셋/오피스 리소스/기존 작업/preview.png', `${WORKSPACE_FOLDERS.previous}/preview.png`],
    ['필수 자료/에셋/reference.png', `${WORKSPACE_FOLDERS.assets}/reference.png`],
    ['필수 자료/문서/guide.md', `${WORKSPACE_FOLDERS.previous}/guide.md`]
  ]
  for (const [source] of previousResources) {
    mkdirSync(dirname(join(root, source)), { recursive: true })
    writeFileSync(join(root, source), source)
  }
  const files = new WorkspaceFiles(root)
  files.ensure()
  files.ensure()
  assert.equal(existsSync(join(root, '문서')), false)
  assert.equal(existsSync(join(root, '결과물')), false)
  assert.equal(readFileSync(files.path(legacyDoc), 'utf8'), '# 기존 문서')
  assert.deepEqual(readFileSync(files.path(legacyAsset)), Buffer.from([0, 1, 2, 3]))
  assert.equal(files.path(legacyDoc), join(root, WORKSPACE_FOLDERS.previous, '기존 작업', 'SRS.md'))
  for (const [source, target] of previousResources) {
    assert.equal(readFileSync(files.path(target), 'utf8'), source)
    assert.equal(files.path(join(root, source)), files.path(target))
  }
  assert.equal(existsSync(join(root, '필수 자료')), false)
  assert.deepEqual((await files.list(WORKSPACE_FOLDERS.required)).entries.map(entry => entry.name).sort(), ['에셋', '애니메이션', '기존 작업'].sort())
  for (const path of Object.values(WORKSPACE_FOLDERS)) assert.ok(existsSync(files.path(path)))
  assert.equal(files.path('constructor'), join(root, 'constructor'))
  // A previously populated destination must never lose either version.
  mkdirSync(join(root, '문서'), { recursive: true })
  writeFileSync(join(root, '문서', 'same.md'), 'old copy')
  writeFileSync(files.path(`${WORKSPACE_FOLDERS.previous}/same.md`), 'new copy')
  const conflictingSource = join(root, previousResources[0][0])
  mkdirSync(dirname(conflictingSource), { recursive: true })
  writeFileSync(conflictingSource, 'keep old resource')
  writeFileSync(join(root, '문서', 'another.md'), 'uncontested')
  files.ensure()
  assert.equal(await files.preview('문서/same.md'), 'old copy')
  assert.equal(await files.preview(`${WORKSPACE_FOLDERS.previous}/same.md`), 'new copy')
  assert.equal(readFileSync(files.path(conflictingSource), 'utf8'), 'keep old resource')
  assert.equal(readFileSync(files.path(previousResources[0][1]), 'utf8'), previousResources[0][0])
  assert.equal(existsSync(files.path(`${WORKSPACE_FOLDERS.assets}/오피스 리소스`)), false)
  assert.equal(await files.preview('문서/another.md'), 'uncontested')
  assert.equal(existsSync(join(root, '문서', 'another.md')), false)
  console.log('PASS folder migration: contents preserved, legacy references, repeated startup, no overwritten conflicts')
  const sibling = join(fixture, '작업실-outside')
  mkdirSync(sibling)
  writeFileSync(join(sibling, 'secret.md'), 'outside')
  for (const path of ['../작업실-outside/secret.md', sibling, join(sibling, 'new'), '문서/test.md:stream']) {
    assert.throws(() => files.path(path), /작업실/)
  }
  symlinkSync(sibling, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => files.path('escape/secret.md'), /작업실 밖/)
  assert.throws(() => files.createFolder('escape', 'created'), /작업실 밖/)
  assert.equal(existsSync(join(sibling, 'created')), false)
  assert.equal((await files.list()).entries.some((entry) => entry.name === 'escape'), false)
  console.log('PASS path traversal, sibling-prefix, alternate stream and external junction guards')

  const task = taskWorkspaceManager.prepare(files.path(TASK_DOCUMENTS_FOLDER), '새 애니메이션 문서')
  assert.match(await files.preview(task.specPath), /새 애니메이션 문서/)
  const folder = files.createFolder('결과물', '새 폴더')
  writeFileSync(files.path(join(folder, '보고서.md')), '# 문서\n<script>not executed</script>')
  writeFileSync(files.path(join(folder, 'picture.png')), Buffer.from([0, 1, 2, 3]))
  writeFileSync(files.path(join(folder, 'binary.txt')), Buffer.from([0, 1, 2, 3]))
  writeFileSync(files.path(join(folder, 'large.md')), Buffer.alloc(256 * 1024 + 1, 'a'))
  assert.equal((await files.list('결과물', '보고서')).entries.length, 1)
  assert.equal((await files.list('결과물', 'NOT_FOUND')).entries.length, 0)
  assert.equal((await files.list('결과물', '보고서')).entries[0].path, join(folder, '보고서.md'))
  assert.match(await files.preview(join(folder, '보고서.md')), /not executed/)
  await assert.rejects(files.preview(join(folder, 'picture.png')), /미리보기/)
  await assert.rejects(files.preview(join(folder, 'binary.txt')), /텍스트/)
  await assert.rejects(files.preview(join(folder, 'large.md')), /256KB/)
  await assert.rejects(files.preview(join(sibling, 'secret.md')), /작업실/)
  for (const name of ['../escape', 'bad/name', 'NUL', 'COM1.txt', 'name.', ' space ', '..']) assert.throws(() => files.createFolder('', name))
  assert.throws(() => files.createFolder('결과물', '새 폴더'), /이미/)
  console.log('PASS separate task documents, folder creation, recursive search, text preview and size/type limits')

  let recovery = new TaskRecoveryStore(files)
  const github = repositoryFixture(fixture)
  const newTask = (request: string) => {
    const documents = taskWorkspaceManager.prepare(files.path(TASK_DOCUMENTS_FOLDER), request)
    const project = files.path(join(WORKSPACE_FOLDERS.projects, documents.taskId))
    mkdirSync(project)
    recovery.register(documents, request, project, { repository: newProjectRepository(documents.taskId) })
    return recovery.get(documents.taskId)
  }
  const first = newTask('독립 프로젝트')
  const second = newTask('독립 프로젝트')
  const prepare = (task: typeof first) => ensureTaskRepository(files, task,
    repository => recovery.setRepository(task.taskId, repository), github.run)
  const git = (cwd: string, ...args: string[]) => repositoryCommands.run('git', args, cwd)
  await prepare(first)
  await prepare(second)
  assert.notEqual(first.projectPath, second.projectPath)
  assert.notEqual(first.repository!.url, second.repository!.url)
  for (const task of [first, second]) {
    assert.equal(await git(task.projectPath, 'branch', '--show-current'), 'main')
    assert.equal(await git(task.projectPath, 'ls-files'), '.gitignore', 'private task documents stay outside Git')
    assert.equal(await git(task.projectPath, 'remote', 'get-url', 'origin'), `${task.repository!.url}.git`)
    assert.equal(await git(task.projectPath, 'config', '--get', 'office.featureBranch'), taskFeatureBranch(task.taskId))
    assert.equal(await git(task.projectPath, 'rev-parse', '--path-format=absolute', '--git-common-dir'), join(task.projectPath, '.git').replace(/\\/g, '/'))
  }
  const feature = first.repository!.featureBranch!
  const worktrees = await Promise.all(Array.from({ length: 3 }, () => ensureTaskFeatureWorktree(files, first.projectPath, feature, github.run)))
  assert.equal(new Set(worktrees.map(worktree => worktree.path)).size, 1, 'concurrent leads and employees share one feature worktree')
  const worktree = worktrees[0]
  assert.equal(await git(worktree.path, 'branch', '--show-current'), feature)
  assert.deepEqual((await git(first.projectPath, 'for-each-ref', '--format=%(refname:short)', 'refs/heads')).split(/\r?\n/).sort(), [feature, 'main'].sort())
  await git(first.projectPath, 'config', 'user.name', 'Test')
  await git(first.projectPath, 'config', 'user.email', 'test@example.invalid')
  const originalMain = await git(first.projectPath, 'rev-parse', 'main')
  const remoteGit = (...args: string[]) => git(first.projectPath, '--git-dir', join(github.remotes, first.repository!.name), ...args)
  writeFileSync(join(worktree.path, 'code.txt'), 'phase one')
  await git(worktree.path, 'add', '--', 'code.txt')
  await git(worktree.path, 'commit', '-m', 'Phase 1')
  await github.run('git', ['push', '--set-upstream', 'origin', feature], worktree.path)
  assert.equal(await remoteGit('rev-parse', 'main'), originalMain, 'phase push never changes remote main')
  assert.equal(await remoteGit('rev-parse', feature), await git(worktree.path, 'rev-parse', 'HEAD'))
  writeFileSync(join(worktree.path, 'code.txt'), 'phase two')
  assert.equal((await ensureTaskFeatureWorktree(files, first.projectPath, feature, github.run)).path, worktree.path)
  assert.equal(readFileSync(join(worktree.path, 'code.txt'), 'utf8'), 'phase two', 'reopening preserves uncommitted work')
  await assert.rejects(mergeTaskFeature(files, first.projectPath, worktree.path, feature, first.repository!.url!, github.run), /커밋/)
  await git(worktree.path, 'add', '--', 'code.txt')
  await git(worktree.path, 'commit', '-m', 'Phase 2')
  await mergeTaskFeature(files, first.projectPath, worktree.path, feature, first.repository!.url!, github.run)
  const mergedMain = await git(first.projectPath, 'rev-parse', 'main')
  assert.equal(await remoteGit('rev-parse', 'main'), mergedMain)
  assert.equal((await git(first.projectPath, 'rev-list', '--parents', '-n', '1', 'main')).split(' ').length, 3, 'final merge leaves a --no-ff merge commit')
  assert.equal(readFileSync(join(first.projectPath, 'code.txt'), 'utf8'), 'phase two')
  assert.equal(await git(worktree.path, 'branch', '--show-current'), feature, 'final merge does not switch the agents out of their feature')
  writeFileSync(join(first.projectPath, 'new-main.txt'), 'external update')
  await git(first.projectPath, 'add', '--', 'new-main.txt')
  await git(first.projectPath, 'commit', '-m', 'New upstream main')
  await github.run('git', ['push', 'origin', 'main'], first.projectPath)
  await assert.rejects(mergeTaskFeature(files, first.projectPath, worktree.path, feature, first.repository!.url!, github.run), /최신 origin\/main/)
  console.log('PASS shared feature worktree, concurrent creation, phase-only push, preserved edits, final main merge/push and stale-main guard')
  const third = newTask('중단 후 재시도')
  github.state.failAfterCreate = true
  await assert.rejects(prepare(third), /같은 저장소로 재시도/)
  recovery = new TaskRecoveryStore(files)
  const saved = recovery.get(third.taskId)
  const savedName = saved.repository!.name
  github.state.failPush = true
  await assert.rejects(prepare(saved), /network unavailable/)
  await prepare(saved)
  assert.equal(saved.repository!.name, savedName)
  assert.equal(saved.repository!.ready, true)
  await prepare(saved)
  assert.equal(github.created.length, 3, 'resume/retry never creates another remote')
  const publicTask = newTask('공개 저장소 차단')
  github.state.publicRemote = true
  await assert.rejects(prepare(publicTask), /비공개 저장소/)
  assert.equal(await git(publicTask.projectPath, 'remote'), '', 'no origin or push when privacy verification fails')
  github.state.publicRemote = false
  const signedOut = newTask('로그인 실패')
  github.state.failAuth = true
  await assert.rejects(prepare(signedOut), /not logged in/)
  assert.equal(signedOut.repository!.ready, false)
  assert.equal(await git(signedOut.projectPath, 'remote'), '')
  assert.throws(() => recovery.enqueue({ taskId: signedOut.taskId, stage: 'planning', assignments: [] }, []), /저장소 준비/,
    'an agent cannot be dispatched before the private repository is ready')
  github.state.failAuth = false
  const wrongPush = newTask('잘못된 푸시 대상')
  github.state.failPush = true
  await assert.rejects(prepare(wrongPush), /network unavailable/)
  await git(wrongPush.projectPath, 'config', 'remote.origin.pushurl', 'https://github.com/fixture-owner/ide-repository.git')
  await assert.rejects(prepare(wrongPush), /푸시 대상/)
  assert.equal(wrongPush.repository!.ready, false)
  console.log('PASS independent project Git roots/private remotes, initial push, excluded documents, durable retries, privacy and authentication failures')

  const many = files.createFolder('', 'many')
  for (let i = 0; i < 305; i++) writeFileSync(files.path(join(many, `${i}.txt`)), '')
  const limited = await files.list(many)
  assert.equal(limited.entries.length, 300)
  assert.equal(limited.truncated, true)
  console.log('PASS large directory limits')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
