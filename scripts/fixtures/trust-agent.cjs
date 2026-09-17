const readline = require('node:readline')
let trusted = false
console.log('Accessing workspace: fixture\nYes, I trust this folder\nEnter to confirm')
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
