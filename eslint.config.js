// typescript-eslint's parser needs the TS compiler's JS API, which the
// pinned `typescript@7` build doesn't expose (require('typescript') only
// exports version info - see tsc7's Go-based rewrite). Real type-checking
// stays with `npm run typecheck`; ESLint here uses Babel's independent TS/JSX
// grammar (no dependency on the `typescript` package) for style/pattern rules.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'

export default [
  { ignores: ['out/**', 'node_modules/**', 'tmp/**', 'src/renderer/__tests__/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    languageOptions: {
      parser: (await import('@babel/eslint-parser')).default,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ['@babel/preset-typescript', ['@babel/preset-react', { runtime: 'automatic' }]]
        },
        sourceType: 'module'
      },
      globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', console: 'readonly', process: 'readonly', require: 'readonly', module: 'readonly', __dirname: 'readonly', HTMLImageElement: 'readonly', HTMLTextAreaElement: 'readonly', HTMLElement: 'readonly', ImageData: 'readonly', Image: 'readonly', KeyboardEvent: 'readonly', Event: 'readonly', fetch: 'readonly', Buffer: 'readonly', NodeJS: 'readonly' }
    },
    rules: {
      'no-undef': 'off', // TS-only syntax (types, interfaces) reads as undefined refs to a JS-only linter; tsc already checks real undefined references.
      // Babel's parser erases `import type`-only bindings before ESLint ever sees
      // them, but a plain `import { Foo }` used only in type positions (very
      // common in this codebase) still looks "unused" to a type-blind checker -
      // and, worse, this rule also false-positived on genuinely-used JSX
      // component imports (e.g. `<OfficeView />`) under this parser setup.
      // Unreliable either way without typescript-eslint (see file header); off.
      'no-unused-vars': 'off',
      // This codebase's terminal/PTY/log-parsing code intentionally matches
      // ANSI escape and other control characters (ansi.ts, cliAdapters.ts,
      // taskWorkspaceManager.ts, workspaceFiles.ts) - that's the actual job of
      // those regexes, not a bug.
      'no-control-regex': 'off'
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      // `refs` and `set-state-in-effect` are React Compiler-readiness rules
      // (eslint-plugin-react-hooks v7's "recommended" bundle). This codebase
      // doesn't use the Compiler, and both patterns are used pervasively and
      // deliberately here (mirroring latest props/state into a ref during
      // render to avoid stale closures in PTY/IPC callbacks; syncing external
      // event-driven state into React state via effects). Rewriting ~15 call
      // sites across App.tsx/PhaserOffice.tsx/OfficeDialoguePanel.tsx/
      // useAgentChat.ts/WorkspacePanel.tsx to satisfy a Compiler this project
      // doesn't run is out of proportion to what setting up linting should do.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    // U+3000 full-width spaces here are an intentional visual gap around the
    // footer's "|" divider, not stray whitespace. A line-anchored
    // eslint-disable comment is fragile against reformatting shifting the
    // footer to a different line, so this is scoped by file instead.
    files: ['src/renderer/src/components/WorkspacePanel.tsx'],
    rules: { 'no-irregular-whitespace': 'off' }
  },
  prettierConfig
]
