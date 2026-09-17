const { buildSync } = require('esbuild')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const output = path.resolve('out/meeting-ui-runner.cjs')
buildSync({ entryPoints: [path.resolve('scripts/meeting-ui-runner.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'node-pty'], logLevel: 'silent' })
const env = { ...process.env, MEETING_FIXTURE_NODE: process.execPath }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(require('electron'), [output], { env, stdio: 'inherit', timeout: 120000 })
if (result.error) console.error(result.error)
process.exitCode = result.status ?? 1
