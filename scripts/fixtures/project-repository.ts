import { strict as assert } from 'node:assert'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { repositoryCommands, type RepositoryCommand } from '../../src/main/projectRepository'

const execute = repositoryCommands.run

/** Real Git repositories and pushes; GitHub operations stay in the test directory. */
export function repositoryFixture(root: string) {
  const created: string[] = []
  const state = { failAfterCreate: false, failPush: false, failAuth: false, publicRemote: false }
  const remotes = join(root, 'remotes')
  mkdirSync(remotes, { recursive: true })
  const run: RepositoryCommand = async (command, args, cwd) => {
    if (command === 'gh') {
      if (args.includes('user')) {
        if (state.failAuth) throw new Error('gh: not logged in')
        return 'fixture-owner'
      }
      if (args[0] === 'repo' && args[1] === 'create') {
        assert.deepEqual(args.slice(3), ['--private'])
        const name = args[2].split('/').at(-1)!
        const remote = join(remotes, name)
        assert.equal(existsSync(remote), false, 'remote creation must not be repeated on retry')
        await execute('git', ['init', '--bare', remote], cwd)
        created.push(name)
        if (state.failAfterCreate) { state.failAfterCreate = false; throw new Error('gh: connection lost after creation') }
        return `https://github.com/${args[2]}`
      }
      const target = args.find(arg => arg.startsWith('repos/'))
      assert.ok(target, `Unexpected GitHub command: ${args.join(' ')}`)
      const fullName = target.slice(6)
      if (!existsSync(join(remotes, fullName.split('/').at(-1)!))) throw new Error('gh: Not Found (HTTP 404)')
      return JSON.stringify({ private: !state.publicRemote, full_name: fullName, html_url: `https://github.com/${fullName}` })
    }
    if (args[0] === 'fetch' && args[1] === 'origin') {
      const origin = await execute('git', ['remote', 'get-url', 'origin'], cwd)
      const name = origin.split('/').at(-1)!.replace(/\.git$/, '')
      return execute('git', ['fetch', join(remotes, name), '+refs/heads/*:refs/remotes/origin/*'], cwd)
    }
    if (args.includes('push')) {
      if (state.failPush) { state.failPush = false; throw new Error('git: network unavailable') }
      const origin = await execute('git', ['remote', 'get-url', 'origin'], cwd)
      const name = origin.split('/').at(-1)!.replace(/\.git$/, '')
      assert.ok(existsSync(join(remotes, name)))
      return execute('git', ['-c', `remote.origin.pushurl=${join(remotes, name)}`, ...args], cwd)
    }
    return execute(command, args, cwd)
  }
  return { run, created, state, remotes }
}
