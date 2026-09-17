import { app, BrowserWindow } from 'electron'
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { registerIpcHandlers } from '../src/main/ipc'
import { workspaceFiles, workspaceStore } from '../src/main/workspaceStore'
import { ptyManager } from '../src/main/ptyManager'
import { taskRecovery } from '../src/main/taskRecovery'
import { repositoryCommands } from '../src/main/projectRepository'
import { repositoryFixture } from './fixtures/project-repository'
import { MEETING_LEADS, isMeetingQuestion, meetingPlanningRequest, pendingMeetingQuestions, type MeetingDraft } from '../src/shared/meetingNotes'

const fixture = mkdtempSync(resolve('out/meeting-ui-'))
const github = repositoryFixture(fixture)
repositoryCommands.run = github.run
const profile = join(fixture, 'profile'), desktop = join(fixture, 'desktop'), records = join(fixture, 'workers')
for (const directory of [profile, desktop, records]) mkdirSync(directory)
app.setPath('userData', profile)
app.setPath('desktop', desktop)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  for (const question of ['의견은 어때', '이 방식이 가능할까', '어떤 설계가 좋을까요', '추천해줘', '가능해?']) assert.equal(isMeetingQuestion(question), true)
  for (const statement of ['로그인 화면을 만들자', '아까 로그인은 취소하고 검색만 넣자']) assert.equal(isMeetingQuestion(statement), false)
  writeFileSync(join(profile, 'agent-templates.json'), JSON.stringify(MEETING_LEADS.map(id => ({
    id, name: id, command: process.env.MEETING_FIXTURE_NODE, args: [resolve('scripts/fixtures/meeting-agent.cjs'), records], env: {}, color: '#777777'
  }))))
  const project = workspaceFiles().path('프로젝트/회의 테스트')
  mkdirSync(project)
  workspaceStore.set(project)
  registerIpcHandlers()
  const win = new BrowserWindow({ show: false, width: 1500, height: 950,
    webPreferences: { preload: resolve('out/preload/index.js'), sandbox: false, backgroundThrottling: false, offscreen: true } })
  const js = (code: string) => win.webContents.executeJavaScript(code)
  const wait = async (condition: string) => {
    for (let i = 0; i < 300; i++) { if (await js(condition)) return; await delay(100) }
    console.error(await js('document.body.textContent'))
    console.error(ptyManager.getStates())
    for (const state of ptyManager.getStates()) console.error(JSON.stringify(ptyManager.getBuffer(state.ptyId).slice(-2500)))
    throw new Error(`Timed out: ${condition}`)
  }
  const draftCode = `JSON.parse(localStorage.getItem('pixel-office:meeting-notes-v1'))`
  const send = async (text: string, explicitQuestion = false) => {
    await js(`(()=>{const input=document.querySelector('.chat-compose textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await delay(30)
    await js(explicitQuestion ? `document.querySelector('.meeting-question-btn').click()` : `document.querySelector('button[aria-label="메시지 전송"]').click()`)
    await delay(70)
  }
  await win.loadFile(resolve('out/renderer/index.html'))
  await wait('!!document.querySelector(".chat-compose textarea")')
  await send('회의하자')
  await send('로그인 화면과 검색 기능을 만들자')
  await send('@Codex 아까 로그인은 취소하고 검색만 넣자')
  await send('회의 테스트 이어서 하자')
  assert.equal(await js('window.api.instances.list().then(items=>items.length)'), 0, 'statements and project-like phrases do not start agents during the meeting')
  assert.equal(taskRecovery.list().length, 0, 'no SRS until meeting end')
  await send('검색 방식에 대한 의견은 어때?')
  await wait(`${draftCode}?.entries.filter(entry=>entry.templateId).length===3`)
  let draft = await js(draftCode) as MeetingDraft
  const firstQuestion = draft.questions[0]
  assert.deepEqual(new Set(draft.entries.filter(entry => entry.questionId === firstQuestion && entry.templateId).map(entry => entry.templateId)), new Set(MEETING_LEADS))
  assert.equal(taskRecovery.list().length, 0)
  await wait(`document.querySelectorAll('.chat-message-agent').length===3`)
  assert.equal(await js('window.api.instances.list().then(items=>items.length)'), 3)
  await delay(300)
  writeFileSync(join(fixture, 'meeting-answers.png'), (await win.webContents.capturePage()).toPNG())
  console.log('PASS meeting statements stay local; each question gets three real CLI replies in chat and the persisted transcript')

  const loaded = new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()))
  win.webContents.reload(); await loaded
  await wait('!!document.querySelector(".meeting-question-btn")')
  assert.equal((await js(draftCode)).entries.length, draft.entries.length, 'reload preserves every meeting statement and answer')
  await send('실패 복구 시나리오를 검토해줘', true)
  await wait(`Object.keys(${draftCode}?.errors ?? {}).length===1`)
  draft = await js(draftCode)
  assert.equal(draft.entries.filter(entry => entry.questionId === draft.questions[1] && entry.templateId).length, 2)
  await js(`[...document.querySelectorAll('.meeting-notes-bar button')].find(button=>button.textContent==='답변 다시 받기').click()`)
  await wait(`${draftCode}?.entries.filter(entry=>entry.templateId).length===6`)
  assert.equal(Object.keys((await js(draftCode)).errors).length, 0)
  console.log('PASS explicit questions, reload retention, failed agent retry, and no duplicate replies from already finished agents')

  await send('답변 지연: 최종안은 어떻게 생각해?')
  await send('회의 끝')
  await wait(`${draftCode}?.endedAt`)
  await delay(600)
  assert.equal(taskRecovery.list().length, 0, 'meeting end waits for outstanding opinions before creating the SRS')
  const heldDraft = await js(draftCode)
  await assert.rejects(js(`window.api.tasks.planMeeting(${JSON.stringify(heldDraft)})`), /답변/)
  writeFileSync(join(records, 'release'), 'go')
  await wait('window.api.tasks.list().then(tasks=>tasks.length===1 && tasks[0].stage==="review")')
  await wait(`${draftCode}===null`)
  const task = taskRecovery.list()[0]
  assert.notEqual(task.projectPath, project, 'the meeting creates its own new project repository')
  assert.equal(task.sourceProjectPath, project)
  assert.equal(task.repository?.ready, true)
  assert.equal(workspaceStore.get(), task.projectPath)
  assert.equal(github.created.length, 1)
  const spec = readFileSync(task.specPath, 'utf8')
  for (const text of ['로그인 화면과 검색', '로그인은 취소', '회의 테스트 이어서 하자', 'claude-code 의견', 'codex-cli 의견', 'antigravity-cli 의견', '정정·취소', '미정 사항']) assert.ok(spec.includes(text), text)
  assert.equal(task.commands.length, 1, 'one meeting produces one planning request')
  assert.equal(task.commands[0].templateId, 'claude-code', 'a mention inside the transcript cannot reroute SRS writing')
  assert.equal(task.commands[0].stage, 'planning')
  assert.equal(readFileSync(join(records, 'answers.log'), 'utf8').trim().split('\n').length, 9, 'three replies per question including retries')
  const completedDraft: MeetingDraft = { ...heldDraft, entries: [...heldDraft.entries, ...MEETING_LEADS.map(templateId => ({
    id: `${heldDraft.questions[2]}:${templateId}`, questionId: heldDraft.questions[2], templateId, author: templateId, text: '검토 완료', createdAt: new Date().toISOString()
  }))] }
  assert.equal(pendingMeetingQuestions(completedDraft).length, 0)
  assert.match(meetingPlanningRequest(completedDraft), /대표의 최종 결정/)
  await Promise.all([js(`window.api.tasks.planMeeting(${JSON.stringify(completedDraft)})`), js(`window.api.tasks.planMeeting(${JSON.stringify(completedDraft)})`)])
  assert.equal(taskRecovery.list().length, 1, 'duplicate delivery or retries reuse the same task')
  assert.equal(taskRecovery.list()[0].commands.length, 1)
  assert.equal(github.created.length, 1, 'repeated meeting submission reuses the private repository')
  await send('회의 종료')
  assert.equal(taskRecovery.list().length, 1, 'repeated end does not create another document')
  await send('회의하자')
  await send('회의 끝')
  assert.equal(taskRecovery.list().length, 1, 'empty meetings create no document')
  console.log('PASS pending replies before SRS, complete transcript and corrections, one Claude SRS, explicit implementation approval, duplicate/empty end guards')
  await js(`window.api.tasks.cancel(${JSON.stringify(task.taskId)})`)
  await delay(100)
  await send('새 작업: 별도 메모장 화면을 만들어줘')
  await wait('window.api.tasks.list().then(tasks=>tasks.length===2 && tasks[1].stage==="review")')
  const nextTask = taskRecovery.list()[1]
  assert.notEqual(nextTask.projectPath, task.projectPath)
  assert.notEqual(nextTask.repository?.url, task.repository?.url)
  assert.equal(nextTask.commands.length, 1)
  assert.ok(nextTask.commands[0].prompt.includes(nextTask.projectPath), 'planning prompt uses the newly created project immediately')
  assert.ok(!nextTask.commands[0].prompt.includes(task.projectPath), 'the previous project never leaks into the new planning prompt')
  assert.equal(workspaceStore.get(), nextTask.projectPath)
  assert.equal((await js('window.api.instances.list()')).find((item: { templateId: string }) => item.templateId === 'claude-code').repoRoot, nextTask.projectPath)
  assert.equal(github.created.length, 2)
  console.log('PASS ordinary chat starts a distinct private repository and moves its planner into the new project')
  console.log(`Screenshot: ${join(fixture, 'meeting-answers.png')}`)
  taskRecovery.checkpoint()
  ptyManager.killAll()
  app.quit()
}).catch(error => { console.error(error); ptyManager.killAll(); app.exit(1) })
