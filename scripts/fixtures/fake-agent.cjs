const readline = require('node:readline')

const input = readline.createInterface({ input: process.stdin, terminal: false })

process.stdout.write('fake agent ready\r\n> ')

input.on('line', (line) => {
  const prompt = line.trim()
  if (!prompt) return

  if (prompt.toLowerCase().includes('fail')) {
    process.stdout.write('fatal error: simulated failure\r\n')
    return
  }

  process.stdout.write(`working: ${prompt}\r\n`)
  setTimeout(() => process.stdout.write('task complete\r\n> '), 40)
})

input.on('close', () => process.exit(0))

