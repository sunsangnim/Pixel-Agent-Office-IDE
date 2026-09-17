import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// For new, pure-logic unit tests. The existing 9 npm run test:* suites stay
// as they are (each spins up a real Electron/node-pty/Phaser harness that a
// plain vitest environment can't replace) - see GAP_ANALYSIS.md.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
