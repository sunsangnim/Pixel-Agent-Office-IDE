const path = require('node:path')
const { buildSync } = require('esbuild')

const outputFile = path.join(process.cwd(), 'out', 'integration-runner.cjs')

buildSync({
  entryPoints: [path.join(process.cwd(), 'scripts', 'integration-runner.ts')],
  outfile: outputFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: {
    '@shared': path.join(process.cwd(), 'src', 'shared')
  },
  external: ['electron', 'node-pty'],
  logLevel: 'silent'
})

require(outputFile)
