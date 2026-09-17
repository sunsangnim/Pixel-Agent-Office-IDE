import { mkdirSync, lstatSync, realpathSync, existsSync } from 'fs'
import { readdir, stat, open } from 'fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { WorkspaceEntry, WorkspaceListing } from '../shared/types'

const IGNORED = new Set(['.git', 'node_modules', '.cache', '.runtime'])
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.jsonc', '.csv', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.html', '.css', '.scss', '.yaml', '.yml', '.toml', '.xml', '.py', '.ps1', '.sh', '.log', '.svg', '.sql'])
const PREVIEW_LIMIT = 256 * 1024

function contains(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Check both lexical and physical paths, including the parent of a new file. */
export function confinedPath(root: string, input = ''): string {
  if (typeof input !== 'string' || input.includes('\0')) throw new Error('잘못된 파일 경로입니다.')
  const target = resolve(root, input)
  if (!contains(resolve(root), target) || /[:]/.test(relative(root, target))) {
    throw new Error('전용 작업실 안의 파일과 폴더만 사용할 수 있습니다.')
  }
  let ancestor = target
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) throw new Error('폴더를 찾을 수 없습니다.')
    ancestor = parent
  }
  if (!contains(realpathSync(root), realpathSync(ancestor))) {
    throw new Error('작업실 밖으로 연결된 경로는 사용할 수 없습니다.')
  }
  return target
}

export class WorkspaceFiles {
  constructor(readonly root: string) {}

  ensure(): void {
    if (existsSync(this.root) && lstatSync(this.root).isSymbolicLink()) {
      throw new Error('전용 작업실은 바로가기나 연결 폴더가 아닌 실제 폴더여야 합니다.')
    }
    mkdirSync(this.root, { recursive: true })
    for (const name of ['프로젝트', '문서', '결과물', '에이전트 작업본', '문서/에셋', '문서/애니메이션', '결과물/에셋', '결과물/애니메이션']) {
      mkdirSync(this.path(name), { recursive: true })
    }
    mkdirSync(this.path(join('프로젝트', '기본 작업')), { recursive: true })
  }

  path(input = ''): string { return confinedPath(this.root, input) }

  async list(input = '', query = ''): Promise<WorkspaceListing> {
    if (typeof query !== 'string') throw new Error('검색어가 올바르지 않습니다.')
    const folder = this.path(input)
    if (!(await stat(folder)).isDirectory()) throw new Error('폴더를 선택해주세요.')
    const needle = query.trim().toLocaleLowerCase()
    const entries: WorkspaceEntry[] = []
    const queue = [folder]
    let visited = 0
    let truncated = false
    while (queue.length) {
      const current = queue.shift()!
      let children
      try { children = await readdir(this.path(current), { withFileTypes: true }) }
      catch (error) { if (current === folder) throw error; continue }
      for (const child of children) {
        if (++visited > 10_000 || entries.length >= 300) { truncated = true; break }
        if (child.isSymbolicLink() || IGNORED.has(child.name)) continue
        const childPath = join(current, child.name)
        try {
          const safe = this.path(childPath)
          const info = await stat(safe)
          if (needle && info.isDirectory()) queue.push(safe)
          if (needle && !child.name.toLocaleLowerCase().includes(needle)) continue
          if (!info.isFile() && !info.isDirectory()) continue
          entries.push({ name: child.name, path: relative(this.root, safe), directory: info.isDirectory(), size: info.size, modifiedAt: info.mtimeMs })
        } catch { /* Entries may disappear during an agent write. */ }
      }
      if (truncated || !needle) break
    }
    entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'ko'))
    return { root: this.root, path: relative(this.root, folder), entries, truncated }
  }

  async preview(input: string): Promise<string> {
    const target = this.path(input)
    if (!TEXT_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error('이 형식은 미리보기를 지원하지 않습니다. 탐색기에서 확인해주세요.')
    const file = await open(target, 'r')
    try {
      const info = await file.stat()
      if (!info.isFile()) throw new Error('파일을 선택해주세요.')
      if (info.size > PREVIEW_LIMIT) throw new Error('256KB보다 큰 문서는 탐색기에서 열어주세요.')
      const buffer = Buffer.alloc(PREVIEW_LIMIT + 1)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      if (bytesRead > PREVIEW_LIMIT) throw new Error('256KB보다 큰 문서는 탐색기에서 열어주세요.')
      const content = buffer.subarray(0, bytesRead)
      if (content.includes(0)) throw new Error('텍스트로 미리 볼 수 없는 파일입니다.')
      return content.toString('utf8')
    } finally { await file.close() }
  }

  createFolder(parent: string, name: string): string {
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) || name === '.' || name === '..') throw new Error('사용할 수 없는 폴더 이름입니다.')
    const target = this.path(join(this.path(parent), name))
    if (existsSync(target)) throw new Error('같은 이름의 파일이나 폴더가 이미 있습니다.')
    mkdirSync(target)
    return relative(this.root, target)
  }
}
