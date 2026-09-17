const readline = require('node:readline')
let trusted = false
process.stdout.write('Accessing work')
setTimeout(() => process.stdout.write('space: fixture\nChoose an option\n'), 80)
readline.createInterface({ input: process.stdin }).on('line', (text) => {
  if (!trusted) {
    if (text !== 'trust') { console.log('UNSAFE INPUT BEFORE TRUST'); return }
    trusted = true
    console.log('\n> ')
    return
  }
  console.log(`working: ${text}`)
  setTimeout(() => console.log('기획 완료\n> '), 100)
})
