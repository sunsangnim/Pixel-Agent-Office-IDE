const path = require('node:path')
const { buildSync } = require('esbuild')
const { spawnSync } = require('node:child_process')
const output = path.resolve('out/workspace-ui-runner.cjs')
buildSync({ entryPoints: [path.join(__dirname, 'workspace-ui-runner.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'node-pty'], logLevel: 'silent' })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(require('electron'), [output], { stdio: 'inherit', env, timeout: 60000 })
if (result.error) console.error(result.error)
process.exitCode = result.status ?? 1
