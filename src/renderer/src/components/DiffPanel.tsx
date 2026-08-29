import { useEffect, useState } from 'react'
import type { GitDiffFile, GitDiffResult } from '@shared/types'

interface LineComment {
  file: string
  line: number
  side: 'old' | 'new'
  code: string
  text: string
}

interface DiffPanelProps {
  runId: string
  title: string
  onClose: () => void
  onSendComments: (runId: string, prompt: string) => void
}

function DiffPanel({ runId, title, onClose, onSendComments }: DiffPanelProps) {
  const [diff, setDiff] = useState<GitDiffResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [comments, setComments] = useState<LineComment[]>([])
  const [draftLine, setDraftLine] = useState<{ line: number; side: 'old' | 'new'; code: string } | null>(null)
  const [draftText, setDraftText] = useState('')
  const [mergeStatus, setMergeStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.git.diff(runId).then((result) => {
      if (cancelled) return
      setDiff(result)
      setSelectedFile(result.files[0]?.path ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [runId])

  const file: GitDiffFile | undefined = diff?.files.find((f) => f.path === selectedFile)

  const addComment = (): void => {
    if (!draftLine || !draftText.trim() || !file) return
    setComments((prev) => [
      ...prev,
      { file: file.path, line: draftLine.line, side: draftLine.side, code: draftLine.code, text: draftText.trim() }
    ])
    setDraftLine(null)
    setDraftText('')
  }

  const sendComments = (): void => {
    if (comments.length === 0) return
    const prompt = comments
      .map((c) => `파일 ${c.file} ${c.line}번 라인 ("${c.code.trim()}") 관련 지시: "${c.text}"`)
      .join('\n')
    onSendComments(runId, `[코드 리뷰 코멘트]\n${prompt}`)
    setComments([])
  }

  const merge = async (): Promise<void> => {
    setMergeStatus('병합 중...')
    const result = await window.api.git.merge(runId)
    setMergeStatus(result.message)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel diff-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>변경사항 검토: {title}</h2>
          <div className="diff-header-actions">
            {diff?.branch && <button onClick={merge}>main에 병합</button>}
            <button onClick={onClose}>닫기</button>
          </div>
        </div>

        {mergeStatus && <div className="diff-merge-status">{mergeStatus}</div>}

        {!diff ? (
          <p className="chat-empty">diff를 불러오는 중...</p>
        ) : diff.error ? (
          <p className="chat-empty">{diff.error}</p>
        ) : diff.files.length === 0 ? (
          <p className="chat-empty">변경된 파일이 없습니다.</p>
        ) : (
          <div className="diff-body">
            <div className="diff-file-list">
              {diff.files.map((f) => (
                <button
                  key={f.path}
                  className={`diff-file-item${f.path === selectedFile ? ' is-active' : ''}`}
                  onClick={() => setSelectedFile(f.path)}
                >
                  <span className={`diff-file-status diff-file-status-${f.status}`}>{f.status[0].toUpperCase()}</span>
                  <span className="diff-file-path" title={f.path}>{f.path}</span>
                </button>
              ))}
            </div>
            <div className="diff-content">
              {file?.hunks.map((hunk, hunkIndex) => (
                <div className="diff-hunk" key={hunkIndex}>
                  <div className="diff-hunk-header">{hunk.header}</div>
                  {hunk.lines.map((line, lineIndex) => {
                    const lineNumber = line.type === 'del' ? line.oldLine : line.newLine
                    const side: 'old' | 'new' = line.type === 'del' ? 'old' : 'new'
                    const isDrafting =
                      draftLine !== null && draftLine.line === lineNumber && draftLine.side === side
                    const lineComments = comments.filter(
                      (c) => c.file === file.path && c.line === lineNumber && c.side === side
                    )
                    return (
                      <div key={lineIndex}>
                        <div
                          className={`diff-line diff-line-${line.type}`}
                          onClick={() =>
                            lineNumber !== undefined &&
                            setDraftLine({ line: lineNumber, side, code: line.text })
                          }
                        >
                          <span className="diff-line-number">{lineNumber ?? ''}</span>
                          <span className="diff-line-text">{line.text || ' '}</span>
                        </div>
                        {lineComments.map((c, i) => (
                          <div className="diff-comment-bubble" key={i}>💬 {c.text}</div>
                        ))}
                        {isDrafting && (
                          <div className="diff-comment-draft" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              autoFocus
                              placeholder="이 라인에 대한 지시를 입력하세요"
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                            />
                            <div className="diff-comment-draft-actions">
                              <button onClick={() => setDraftLine(null)}>취소</button>
                              <button onClick={addComment} disabled={!draftText.trim()}>추가</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {comments.length > 0 && (
          <div className="diff-comment-footer">
            <span>{comments.length}개 코멘트 대기 중</span>
            <button onClick={sendComments}>코멘트 전송</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default DiffPanel
