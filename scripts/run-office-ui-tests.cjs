const path = require('node:path')
const { spawnSync } = require('node:child_process')
;(async () => {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  await build({ configFile: false, root: path.resolve('src/renderer'), base: './',
    plugins: [react()], resolve: { alias: { '@shared': path.resolve('src/shared') } }, logLevel: 'error',
    build: { outDir: path.resolve('out/office-ui'), emptyOutDir: false, rollupOptions: { input: path.resolve('src/renderer/__tests__/office-ui.html') } } })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [path.resolve('scripts/office-ui-runner.cjs')], { stdio: 'inherit', env, timeout: 60000 })
  if (result.error) console.error(result.error)
  process.exitCode = result.status ?? 1
})().catch(error => { console.error(error); process.exitCode = 1 })
