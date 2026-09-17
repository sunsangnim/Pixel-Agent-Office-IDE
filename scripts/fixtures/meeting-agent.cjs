const fs = require('node:fs')
const path = require('node:path')
const input = require('node:readline').createInterface({ input: process.stdin, terminal: false })
const records = process.argv[2]
let receipt, log, spec
let prompt = ''
const ready = () => process.stdout.write('\r\n{"type":"result","result":"ok"}\r\n{"type":"turn.completed"}\r\n> ')
process.stdout.write('meeting fixture ready\r\n> ')
input.on('line', line => {
  fs.appendFileSync(path.join(records, `${process.pid}.log`), line + '\n')
  prompt += line + '\n'
  const answer = line.match(/답변을 ((?:[A-Za-z]:[\\/]|\/).+?\.json)에 다음 형식의 JSON/)
  const plan = line.match(/개발 기록을 먼저 갱신하고 (.+)에 아래 JSON/)
  if (answer || plan) receipt = (answer || plan)[1]
  log = line.match(/개발 기록: (.+?\.md)/)?.[1] ?? log
  spec = line.match(/통합 SRS: (.+?\.md)/)?.[1] ?? spec
  let data
  // Windows cooked console input can combine the whole prompt into one line.
  const payload = line.match(/\{"meetingId".*?\}/)?.[0] ?? line.match(/\{"commandId".*?"reviewed":\{[^}]+\}\}/)?.[0]
  try { data = JSON.parse(payload) } catch { return }
  if (!receipt) return
  const file = receipt, currentPrompt = prompt
  if (data.meetingId && data.questionId && data.templateId) {
    prompt = ''
    const currentQuestion = currentPrompt.split('[답변할 질문]').at(-1).split('답변을 ')[0]
    const failed = path.join(records, `${data.questionId}-${data.templateId}.failed`)
    if (currentQuestion.includes('실패 복구') && data.templateId === 'antigravity-cli' && !fs.existsSync(failed)) {
      fs.writeFileSync(failed, 'failed once')
      process.stdout.write('fatal error: fixture answer interrupted\r\n')
      setTimeout(() => process.exit(1), 30)
      return
    }
    const timer = setInterval(() => {
      if (currentQuestion.includes('답변 지연') && !fs.existsSync(path.join(records, 'release'))) return
      clearInterval(timer)
      data.answer = `${data.templateId} 의견: 질문을 검토했습니다. 단계별 검증과 예외 처리를 포함하는 방안을 제안합니다.`
      fs.writeFileSync(file, JSON.stringify(data))
      fs.appendFileSync(path.join(records, 'answers.log'), `${data.questionId}:${data.templateId}\n`)
      ready()
    }, 100)
  } else if (data.commandId) {
    setTimeout(() => {
      fs.appendFileSync(log, '\n회의 전체를 읽고 통합 SRS 작성 및 검증 완료. 구현하지 않음.\n')
      fs.appendFileSync(spec, '\n## 회의 정리 검증\n발언과 세 에이전트 의견을 반영했습니다. 미정 사항은 확인 필요로 남깁니다.\n')
      fs.writeFileSync(file, JSON.stringify({ ...data, summary: '회의 통합 SRS 작성 완료', checks: ['회의 발언과 답변 반영 확인'], changedFiles: ['SRS-PRD-SCREEN-DESIGN.md'], nextSteps: ['대표 기획 승인 대기'] }))
      ready()
    }, 500)
  }
})
input.on('close', () => process.exit(0))
