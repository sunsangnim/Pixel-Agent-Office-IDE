import { app, BrowserWindow, dialog, shell } from 'electron'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { registerIpcHandlers } from '../src/main/ipc'
import { workspaceFiles, workspaceStore } from '../src/main/workspaceStore'

const fixture = mkdtempSync(join(resolve('out'), 'workspace-ui-'))
const desktop = join(fixture, 'desktop')
mkdirSync(desktop)
app.setPath('desktop', desktop)
app.setPath('userData', join(fixture, 'profile'))
const opened: string[] = []
const revealed: string[] = []
shell.openPath = async (path) => { opened.push(path); return '' }
shell.showItemInFolder = (path) => { revealed.push(path) }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const files = workspaceFiles()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(join(app.getPath('userData'), 'workspace.json'), JSON.stringify({ workFolder: fixture }))
  assert.equal(workspaceStore.get(), files.path('프로젝트/기본 작업'), 'external legacy workspace is replaced')
  const docs = files.createFolder('문서/애니메이션', '대표 타이핑')
  const spec = join(docs, 'SRS-PRD-SCREEN-DESIGN.md')
  writeFileSync(files.path(spec), '# 대표 타이핑 모션\n\n문서는 에셋과 분리해 관리합니다.\n<script>window.bad = true</script>')
  writeFileSync(files.path('결과물/에셋/preview.png'), Buffer.from([0, 1, 2]))
  registerIpcHandlers()
  const win = new BrowserWindow({ show: false, width: 1500, height: 950, webPreferences: { preload: resolve('out/preload/index.js'), sandbox: false, contextIsolation: true, backgroundThrottling: false, offscreen: true } })
  const js = (code: string) => win.webContents.executeJavaScript(code)
  const wait = async (condition: string) => {
    for (let i = 0; i < 120; i++) { if (await js(condition)) return; await delay(100) }
    throw new Error(`Timed out: ${condition}`)
  }
  const click = async (label: string) => { await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`); await delay(100) }
  const fill = async (label: string, value: string) => {
    await js(`(()=>{const input=document.querySelector('input[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await delay(300)
  }
  await win.loadFile(resolve('out/renderer/index.html'))
  await wait('Boolean(document.querySelector(".chat-folder-row button"))')
  await click('파일')
  await wait('document.querySelectorAll(".workspace-entry").length===4')
  assert.equal(await js('document.querySelector("dialog").open'), true)
  await click('폴더 열기')
  assert.equal(opened[0], files.root)
  await fill('파일명 검색', 'SRS')
  await wait('document.querySelectorAll(".workspace-entry").length===1')
  await js('document.querySelector(".workspace-entry").click()')
  await wait('document.querySelector(".workspace-preview pre")?.textContent.includes("대표 타이핑")')
  assert.equal(await js('window.bad'), undefined)
  await click('탐색기에서 보기')
  assert.equal(revealed[0], files.path(spec))
  await delay(800)
  writeFileSync(join(fixture, 'files-preview.png'), (await win.webContents.capturePage()).toPNG())
  await click('작업실')
  await wait('document.querySelectorAll(".workspace-entry").length===4')
  await click('새 폴더')
  await fill('새 폴더 이름', '내 자료')
  await click('만들기')
  await wait('document.querySelectorAll(".workspace-entry").length===5')
  assert.ok(existsSync(files.path('내 자료')))
  const denied = await js(`window.api.workspace.listFiles(${JSON.stringify(fixture)}).then(()=>false,()=>true)`)
  assert.equal(denied, true)
  dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [fixture] })) as typeof dialog.showOpenDialog
  await click('프로젝트 변경')
  await wait('document.querySelector(".workspace-error")?.textContent.includes("작업실")')
  assert.equal(workspaceStore.get(), files.path('프로젝트/기본 작업'))
  await js('document.querySelector("dialog").dispatchEvent(new Event("cancel",{cancelable:true}))')
  await wait('!document.querySelector("dialog")')
  console.log('PASS actual App + preload + IPC: confined root, file panel, recursive search, safe preview, new folder, Explorer actions, denied external project, close')
  console.log(`Screenshot: ${join(fixture, 'files-preview.png')}`)
  app.quit()
}).catch((error) => { console.error(error); app.exit(1) })
