/** Paths are relative to the dedicated workroom, never the IDE repository. */
export const WORKSPACE_FOLDERS = {
  documents: '필수 자료/문서',
  assets: '필수 자료/에셋',
  outputs: '산출물',
  projects: '프로젝트',
  agents: '에이전트 작업본'
} as const

export const TASK_DOCUMENTS_FOLDER = `${WORKSPACE_FOLDERS.outputs}/문서`

export const LEGACY_WORKSPACE_FOLDERS = {
  문서: WORKSPACE_FOLDERS.documents,
  결과물: WORKSPACE_FOLDERS.outputs
} as const
