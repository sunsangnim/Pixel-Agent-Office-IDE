import { strict as assert } from 'node:assert'
import { join, resolve } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from 'node:fs'
import { WorkspaceFiles } from '../src/main/workspaceFiles'
import { taskWorkspaceManager } from '../src/main/taskWorkspaceManager'

async function main() {
  const fixture = mkdtempSync(join(resolve('out'), 'workspace-test-'))
  const root = join(fixture, '작업실')
  const files = new WorkspaceFiles(root)
  files.ensure()
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

  const task = taskWorkspaceManager.prepare(files.path('문서'), '새 애니메이션 문서')
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

  const many = files.createFolder('', 'many')
  for (let i = 0; i < 305; i++) writeFileSync(files.path(join(many, `${i}.txt`)), '')
  const limited = await files.list(many)
  assert.equal(limited.entries.length, 300)
  assert.equal(limited.truncated, true)
  console.log('PASS large directory limits')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
