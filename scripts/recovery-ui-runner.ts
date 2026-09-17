import { app, BrowserWindow } from 'electron'
import { strict as assert } from 'node:assert'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { registerIpcHandlers } from '../src/main/ipc'
import { workspaceFiles, workspaceStore } from '../src/main/workspaceStore'
import { ptyManager } from '../src/main/ptyManager'
import { taskRecovery } from '../src/main/taskRecovery'
import { instanceManager } from '../src/main/instanceManager'
import { TaskRecoveryStore } from '../src/main/taskRecoveryStore'
import { repositoryCommands } from '../src/main/projectRepository'
import { repositoryFixture } from './fixtures/project-repository'
import type { TaskCommand, TrackedTask } from '../src/shared/types'

const fixture = process.argv[2]
const github = repositoryFixture(fixture)
repositoryCommands.run = github.run
const stage = process.argv[3]
const desktop = join(fixture, 'desktop')
const profile = join(fixture, 'profile')
const records = join(fixture, 'workers')
for (const directory of [desktop, profile, records]) mkdirSync(directory, { recursive: true })
app.setPath('desktop', desktop)
app.setPath('userData', profile)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const receipt = (task: TrackedTask, command: TaskCommand) => {
  appendFileSync(task.developmentLogPath, '\n완료한 명령: fixture check. 실제 테스트 성공. 남은 작업 없음.\n')
  const store = new TaskRecoveryStore(workspaceFiles())
  writeFileSync(store.receiptPath(task, command), JSON.stringify({ commandId: command.id, attemptId: command.attemptId,
    outcome: 'completed', summary: 'fixture check complete', changedFiles: ['game.txt'], checks: ['fixture passed'], nextSteps: [],
    reviewed: { srs: true, developmentLog: true, git: true } }))
}

app.whenReady().then(async () => {
  const files = workspaceFiles()
  if (stage === 'save') {
    writeFileSync(join(profile, 'agent-templates.json'), JSON.stringify(['claude-code', 'codex-cli'].map(id => ({
      id, name: id, command: process.env.HANDOFF_FIXTURE_NODE!, args: [resolve('scripts/fixtures/handoff-agent.cjs'), records],
      env: {}, color: '#777777'
    }))))
  }
  registerIpcHandlers()
  const win = new BrowserWindow({ show: false, width: 1500, height: 950,
    webPreferences: { preload: resolve('out/preload/index.js'), sandbox: false, contextIsolation: true, backgroundThrottling: false, offscreen: true } })
  const js = (code: string) => win.webContents.executeJavaScript(code)
  const wait = async (condition: string) => {
    for (let attempt = 0; attempt < 250; attempt++) { if (await js(condition)) return; await delay(100) }
    console.error('Worker states:', ptyManager.getStates())
    for (const state of ptyManager.getStates()) console.error('Worker output:', JSON.stringify(ptyManager.getBuffer(state.ptyId)))
    throw new Error(`Timed out: ${condition}`)
  }
  const send = async (text: string) => {
    await js(`(()=>{const el=document.querySelector('.chat-compose textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await delay(50)
    await js(`document.querySelector('button[aria-label="메시지 전송"]').click()`)
  }
  if (stage === 'save') {
    const projects: string[] = []
    await win.loadFile(resolve('out/renderer/index.html'))
    await wait('!!document.querySelector(".chat-compose textarea")')
    const saved: Record<string, any> = { bootId: taskRecovery.bootId, projects }
    for (let index = 0; index < 2; index++) {
      if (index) {
        taskRecovery.checkpoint()
        for (const instance of instanceManager.list()) instanceManager.detach(instance.instanceId)
      }
      const task = await js(`window.api.tasks.prepare(${JSON.stringify(index ? '오목' : '테트리스')})`)
      const project = task.projectPath
      projects.push(project)
      const git = (...args: string[]) => execFileSync('git', args, { cwd: project, encoding: 'utf8' })
      git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid')
      writeFileSync(join(project, 'game.txt'), 'base code')
      git('add', 'game.txt'); git('commit', '-m', 'initial project')
      const template = 'claude-code'
      const instances = await js(`window.api.instances.create(${JSON.stringify(template)})`)
      const instance = instances.find((item: any) => item.templateId === template)
      assert.equal(instance.worktreeBranch, task.repository.featureBranch)
      assert.ok(instance.worktreeBranch.startsWith('feature/'))
      if (index === 0) {
        const childInstances = await js(`window.api.instances.createChild(${JSON.stringify(instance.instanceId)})`)
        const child = childInstances.find((item: any) => item.parentInstanceId === instance.instanceId)
        const withCodex = await js(`window.api.instances.create('codex-cli')`)
        const codex = withCodex.find((item: any) => item.templateId === 'codex-cli')
        assert.equal(child.cwd, instance.cwd)
        assert.equal(codex.cwd, instance.cwd)
        assert.equal(codex.worktreeBranch, instance.worktreeBranch)
        writeFileSync(join(instance.cwd, 'preserved.txt'), 'shared work remains after colleagues leave')
        await js(`window.api.instances.remove(${JSON.stringify(child.instanceId)})`)
        await js(`window.api.instances.remove(${JSON.stringify(codex.instanceId)})`)
        assert.equal(readFileSync(join(instance.cwd, 'preserved.txt'), 'utf8'), 'shared work remains after colleagues leave')
        const earlyMerge = await js(`window.api.git.merge(${JSON.stringify(instance.instanceId)})`)
        assert.equal(earlyMerge.ok, false)
        assert.match(earlyMerge.message, /최종 완료/)
      }
      await js(`window.api.tasks.dispatch(${JSON.stringify({ taskId: task.taskId, stage: 'planning', mode: 'simple', assignments: [{ instanceId: instance.instanceId, role: '기획 작성', prompt: 'plan fixture' }] })})`)
      await wait(`window.api.tasks.list().then(tasks=>tasks.find(t=>t.taskId===${JSON.stringify(task.taskId)}).commands.at(-1).status==='running')`)
      let tracked = taskRecovery.list().find(item => item.taskId === task.taskId)!
      receipt(tracked, tracked.commands.at(-1)!)
      await wait(`window.api.tasks.list().then(tasks=>tasks.find(t=>t.taskId===${JSON.stringify(task.taskId)}).stage==='review')`)
      if (index === 0) {
        await js(`window.api.tasks.approve(${JSON.stringify(task.taskId)})`)
        await js(`window.api.tasks.dispatch(${JSON.stringify({ taskId: task.taskId, stage: 'execution', assignments: [{ instanceId: instance.instanceId, role: '블록 구현', prompt: 'finish the remaining block game' }] })})`)
        await wait(`window.api.tasks.list().then(tasks=>tasks.find(t=>t.taskId===${JSON.stringify(task.taskId)}).commands.at(-1).status==='running')`)
        writeFileSync(join(instance.cwd, 'game.txt'), 'half implemented; keep this')
        appendFileSync(task.developmentLogPath, '\n블록 생성 완료. 충돌 처리는 다음 세션이 이어갈 것.\n')
      }
      saved[index ? 'b' : 'a'] = { taskId: task.taskId, runId: instance.instanceId, ptyId: instance.ptyId, cwd: instance.cwd }
    }
    await js(`localStorage.setItem('pixel-office:chat-history-v1',JSON.stringify([{id:'old',kind:'user',authorName:'user',authorColor:'#fff',authorSeed:'me',text:'PREVIOUS_BOOT_CHAT'}]))`)
    writeFileSync(join(fixture, 'saved.json'), JSON.stringify(saved))
    taskRecovery.checkpoint()
    ptyManager.killAll()
    console.log('PASS first IDE process: two projects, real CLI workers, one unfinished approved task, one approval-waiting plan, persisted worktree and journal')
  } else {
    const saved = JSON.parse(readFileSync(join(fixture, 'saved.json'), 'utf8'))
    const oldLogs = new Set(readdirSync(records))
    await win.loadFile(resolve('out/renderer/index.html'))
    await wait('!!document.querySelector(".resume-task-bar")')
    assert.notEqual(taskRecovery.bootId, saved.bootId)
    assert.equal(await js('document.querySelector(".chat-thread").textContent.includes("PREVIOUS_BOOT_CHAT")'), false)
    assert.equal(await js('window.api.instances.list().then(items=>items.length)'), 0, 'startup must not launch an agent')
    await delay(2000)
    assert.deepEqual(readdirSync(records), [...oldLogs], 'no startup handoff or document-reading prompts')
    await send('계속하자')
    await wait('document.querySelector(".resume-project-dialog")?.open')
    assert.equal(await js('document.querySelectorAll(".resume-project-option").length'), 2)
    assert.equal(await js('window.api.instances.list().then(items=>items.length)'), 0, 'ambiguous text only opens the picker')
    await js(`[...document.querySelectorAll('.resume-project-option')].find(el=>el.querySelector('strong').textContent.includes('테트리스')).click()`)
    await wait('window.api.instances.list().then(items=>items.length===1)')
    await wait(`window.api.tasks.list().then(tasks=>tasks.find(t=>t.taskId===${JSON.stringify(saved.a.taskId)}).commands.at(-1).status==='running')`)
    const instance = (await js('window.api.instances.list()'))[0]
    assert.notEqual(instance.instanceId, saved.a.runId)
    assert.notEqual(instance.ptyId, saved.a.ptyId)
    assert.equal(instance.cwd, saved.a.cwd)
    assert.equal(readFileSync(join(instance.cwd, 'game.txt'), 'utf8'), 'half implemented; keep this')
    await delay(500)
    const newLogs = readdirSync(records).filter(file => !oldLogs.has(file))
    assert.equal(newLogs.length, 1, 'only the selected project gets a fresh session')
    const prompt = readFileSync(join(records, newLogs[0]), 'utf8')
    for (const required of ['새 세션 작업 인수인계', 'SRS-PRD-SCREEN-DESIGN.md', 'DEVELOPMENT-LOG.md', 'git log', 'git status/git diff', 'initial project', 'game.txt']) assert.ok(prompt.includes(required), required)
    assert.ok(!prompt.includes('PREVIOUS_BOOT_CHAT'))
    assert.ok(!prompt.includes('오목 돌 놓기'))
    await js(`window.api.tasks.resume(${JSON.stringify(saved.projects[0])})`)
    assert.equal(await js('window.api.instances.list().then(items=>items.length)'), 1, 'repeat resume does not duplicate sessions')
    const blockedSwitch = await js(`window.api.tasks.resume(${JSON.stringify(saved.projects[1])})`)
    assert.ok(blockedSwitch.notices.some((text: string) => text.includes('다른 프로젝트를 작업 중')), 'a busy worker cannot be switched to another project')
    ptyManager.kill(instance.ptyId)
    await wait(`window.api.tasks.list().then(tasks=>tasks.find(t=>t.taskId===${JSON.stringify(saved.a.taskId)}).commands.at(-1).status==='interrupted')`)
    await js(`window.api.tasks.resume(${JSON.stringify(saved.projects[0])})`)
    await wait(`window.api.tasks.list().then(tasks=>tasks.find(t=>t.taskId===${JSON.stringify(saved.a.taskId)}).commands.at(-1).status==='running')`)
    assert.notEqual((await js('window.api.instances.list()'))[0].ptyId, instance.ptyId, 'an exited CLI must get a new PTY on explicit resume')
    let task = taskRecovery.list().find(item => item.taskId === saved.a.taskId)!
    receipt(task, task.commands.at(-1)!)
    await wait(`window.api.tasks.list().then(tasks=>tasks.find(t=>t.taskId===${JSON.stringify(saved.a.taskId)}).stage==='completed')`)
    assert.match(readFileSync(task.developmentLogPath, 'utf8'), /fixture passed/)
    await wait('window.api.pty.getStates().then(states=>states.every(state=>state.state!=="working"))')
    await send('오목 하자')
    await wait(`window.api.instances.list().then(items=>items.length===1 && items[0].cwd===${JSON.stringify(saved.b.cwd)})`)
    await wait('document.body.textContent.includes("기획을 확인해주세요")')
    task = taskRecovery.list().find(item => item.taskId === saved.b.taskId)!
    assert.equal(task.stage, 'review', 'reopening or selecting a project cannot approve implementation')
    assert.ok(task.commands.every(command => command.stage === 'planning'))
    assert.equal(readFileSync(join(saved.a.cwd, 'game.txt'), 'utf8'), 'half implemented; keep this', 'switching projects keeps the old worktree')
    assert.ok(await js('document.querySelector(".chat-thread").textContent.includes("오목 하자")'))
    const reloaded = new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()))
    win.webContents.reload()
    await reloaded
    await wait('!!document.querySelector(".chat-thread")')
    assert.ok(await js('document.querySelector(".chat-thread").textContent.includes("오목 하자")'), 'renderer reload keeps this boot conversation')
    assert.equal(github.created.length, 0, 'resume and reload never create a new remote repository')
    writeFileSync(join(fixture, 'recovery-ui.png'), (await win.webContents.capturePage()).toPNG())
    console.log('PASS second IDE process: empty chat, no automatic agents, ambiguous project picker, selected-project-only fresh CLI, docs+Git handoff, intact uncommitted code, journal completion, preserved approval gate, same-boot reload')
    console.log(`Screenshot: ${join(fixture, 'recovery-ui.png')}`)
    taskRecovery.checkpoint()
    ptyManager.killAll()
  }
  app.quit()
}).catch(error => { console.error(error); ptyManager.killAll(); app.exit(1) })
