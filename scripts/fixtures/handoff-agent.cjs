const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const directory = process.argv[2]
const log = path.join(directory, `${process.pid}.log`)
fs.appendFileSync(log, `NEW SESSION ${process.pid}\n`)
process.stdout.write('handoff fixture ready\r\n> ')
const input = readline.createInterface({ input: process.stdin, terminal: false })
const watched = new Set()
input.on('line', line => {
  fs.appendFileSync(log, line + '\n')
  const match = line.match(/개발 기록을 먼저 갱신하고 (.+)에 아래 JSON/)
  if (!match || watched.has(match[1])) return
  watched.add(match[1])
  const timer = setInterval(() => {
    if (!fs.existsSync(match[1])) return
    clearInterval(timer)
    process.stdout.write('\r\n{"type":"result","result":"ok"}\r\n{"type":"turn.completed"}\r\n> ')
  }, 100)
})
input.on('close', () => process.exit(0))
