/** Paths are relative to the dedicated workroom, never the IDE repository. */
export const WORKSPACE_FOLDERS = {
  required: '필수 파일',
  assets: '필수 파일/에셋',
  animations: '필수 파일/애니메이션',
  previous: '필수 파일/기존 작업',
  outputs: '산출물',
  projects: '프로젝트',
  agents: '에이전트 작업본'
} as const

export const TASK_DOCUMENTS_FOLDER = `${WORKSPACE_FOLDERS.outputs}/문서`

// Specific paths come first so preserved references use the closest match.
export const LEGACY_WORKSPACE_FOLDERS = [
  { source: '필수 자료/에셋/오피스 리소스', target: WORKSPACE_FOLDERS.required },
  { source: '필수 자료/에셋', target: WORKSPACE_FOLDERS.assets, exclude: ['오피스 리소스'] },
  { source: '필수 자료/문서', target: WORKSPACE_FOLDERS.previous },
  { source: '문서', target: WORKSPACE_FOLDERS.previous },
  { source: '결과물', target: WORKSPACE_FOLDERS.outputs }
] as const
