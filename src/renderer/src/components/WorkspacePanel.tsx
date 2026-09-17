import { useEffect, useRef, useState } from 'react'
import type { WorkspaceEntry, WorkspaceListing } from '@shared/types'

interface Props {
  workFolder: string | null
  onChooseFolder: () => Promise<void>
  onClose: () => void
}

const message = (error: unknown): string => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error)
const parentPath = (path: string): string => path.split(/[\\/]/).slice(0, -1).join('/')

export default function WorkspacePanel({ workFolder, onChooseFolder, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [path, setPath] = useState('')
  const [query, setQuery] = useState('')
  const [listing, setListing] = useState<WorkspaceListing | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<WorkspaceEntry | null>(null)
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [folderName, setFolderName] = useState('')
  const selectedVersion = listing?.entries.find((entry) => entry.path === selected?.path)?.modifiedAt

  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    const timer = setInterval(() => setRevision((value) => value + 1), 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        const result = await window.api.workspace.listFiles(path, query)
        if (!cancelled) { setListing(result); setError('') }
      } catch (e) {
        if (!cancelled) { setListing(null); setError(message(e)) }
      } finally { if (!cancelled) setBusy(false) }
    }, query ? 200 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [path, query, revision])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setPreview(''); setPreviewError(''); setPreviewBusy(true)
    window.api.workspace.previewFile(selected.path)
      .then((text) => { if (!cancelled) setPreview(text) })
      .catch((e) => { if (!cancelled) setPreviewError(message(e)) })
      .finally(() => { if (!cancelled) setPreviewBusy(false) })
    return () => { cancelled = true }
  }, [selected?.path, selectedVersion])

  const navigate = (next: string): void => {
    setPath(next); setQuery(''); setSelected(null); setListing(null); setError('')
    setCreating(false); setFolderName('')
  }
  const perform = async (action: () => Promise<unknown>): Promise<void> => {
    try { await action(); setError('') } catch (e) { setError(message(e)) }
  }
  const createFolder = async (): Promise<void> => {
    await perform(async () => {
      await window.api.workspace.createFolder(path, folderName)
      setCreating(false); setFolderName(''); setRevision((value) => value + 1)
    })
  }

  return (
    <dialog ref={dialog} className="workspace-panel" onCancel={(e) => { e.preventDefault(); onClose() }} aria-labelledby="workspace-title">
      <header className="workspace-header">
        <div><h2 id="workspace-title">작업실 파일</h2><p>문서와 결과물을 한곳에서 찾아보세요.</p></div>
        <button type="button" onClick={onClose} aria-label="파일 패널 닫기">닫기</button>
      </header>
      <div className="workspace-project"><span title={workFolder ?? ''}>현재 프로젝트 · {workFolder?.split(/[\\/]/).pop() ?? '준비 중'}</span><button onClick={() => void perform(onChooseFolder)}>프로젝트 변경</button></div>
      <nav className="workspace-toolbar" aria-label="폴더 탐색">
        <button onClick={() => navigate('')}>작업실</button>
        <button disabled={!path} onClick={() => navigate(parentPath(path))}>상위 폴더</button>
        <span className="workspace-current" title={listing ? `${listing.root}/${path}` : path}>{path || '전체 폴더'}</span>
        <button onClick={() => setRevision((value) => value + 1)} aria-label="파일 목록 새로고침">새로고침</button>
        <button onClick={() => void perform(() => window.api.workspace.openFolder(path))}>폴더 열기</button>
      </nav>
      <div className="workspace-search">
        <input aria-label="파일명 검색" placeholder="현재 폴더 아래 파일명 검색" value={query} onChange={(e) => { setQuery(e.target.value); setListing(null) }} />
        <button onClick={() => setCreating((value) => !value)}>새 폴더</button>
      </div>
      {creating && <form className="workspace-new-folder" onSubmit={(e) => { e.preventDefault(); void createFolder() }}>
        <input aria-label="새 폴더 이름" placeholder="폴더 이름" value={folderName} onChange={(e) => setFolderName(e.target.value)} autoFocus />
        <button type="submit" disabled={!folderName.trim()}>만들기</button>
        <button type="button" onClick={() => setCreating(false)}>취소</button>
      </form>}
      {error && <p className="workspace-error" role="alert">{error}</p>}
      <div className="workspace-body">
        <div className="workspace-list" aria-label="작업실 파일 목록" aria-busy={busy}>
          {!listing && !error && <p className="workspace-hint">파일을 불러오는 중…</p>}
          {listing?.entries.length === 0 && <p className="workspace-hint">{query ? '검색 결과가 없습니다.' : '아직 파일이 없습니다. 이 폴더에서 작업하면 여기에 표시됩니다.'}</p>}
          {listing?.entries.map((entry) => <button key={entry.path} className={`workspace-entry${selected?.path === entry.path ? ' is-selected' : ''}`} onClick={() => entry.directory ? navigate(entry.path) : setSelected(entry)} title={entry.path}>
            <span className="workspace-file-icon" aria-hidden="true">{entry.directory ? '▣' : '▤'}</span>
            <span className="workspace-entry-info"><strong>{entry.name}</strong><small>{query ? parentPath(entry.path) || '작업실' : entry.directory ? '폴더' : `${Math.max(1, Math.ceil(entry.size / 1024))} KB`} · {new Date(entry.modifiedAt).toLocaleDateString('ko-KR')}</small></span>
            {entry.directory && <span aria-hidden="true">›</span>}
          </button>)}
          {listing?.truncated && <p className="workspace-hint">일부 항목만 표시했습니다. 하위 폴더로 이동하거나 검색어를 구체적으로 입력해주세요.</p>}
        </div>
        <section className="workspace-preview" aria-label="문서 미리보기">
          {selected ? <>
            <div className="workspace-preview-header"><strong title={selected.name}>{selected.name}</strong><button onClick={() => void perform(() => window.api.workspace.revealFile(selected.path))}>탐색기에서 보기</button></div>
            {previewBusy ? <p className="workspace-hint">문서를 불러오는 중…</p> : previewError ? <p className="workspace-hint">{previewError}</p> : <pre>{preview || '(빈 파일)'}</pre>}
          </> : <div className="workspace-placeholder"><span aria-hidden="true">▤</span><strong>파일을 선택해 미리보세요</strong><p>문서와 코드는 여기서 확인할 수 있습니다.<br />이름 변경·이동·삭제는 폴더 열기로 관리하세요.</p></div>}
        </section>
      </div>
      <footer className="workspace-footer">문서 · SRS / PRD / Phase　 |　 결과물 · 에셋 / 애니메이션 <span>5초마다 갱신</span></footer>
    </dialog>
  )
}
