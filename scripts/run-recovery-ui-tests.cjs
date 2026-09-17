const { buildSync } = require('esbuild')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const output = path.resolve('out/recovery-ui-runner.cjs')
buildSync({ entryPoints: [path.resolve('scripts/recovery-ui-runner.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'node-pty'], logLevel: 'silent' })
const fixture = fs.mkdtempSync(path.resolve('out/recovery-ui-'))
for (const stage of ['save', 'reopen']) {
  const env = { ...process.env, HANDOFF_FIXTURE_NODE: process.execPath }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [output, fixture, stage], { env, stdio: 'inherit', timeout: 90000 })
  if (result.error) console.error(result.error)
  if (result.status !== 0) { process.exitCode = result.status || 1; break }
}
