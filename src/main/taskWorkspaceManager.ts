import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { TaskWorkspace } from '../shared/types'

function safeSlug(request: string): string {
  const firstLine = request.split(/\r?\n/).find((line) => line.trim())?.trim() ?? 'task'
  const slug = firstLine
    .slice(0, 48)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[.\s-]+$/g, '')
  return slug || 'task'
}

function stamp(): string {
  const now = new Date()
  const part = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}`
}

class TaskWorkspaceManager {
  prepare(workspaceRoot: string, request: string): TaskWorkspace {
    const title = request.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 80) ?? '새 작업'
    const taskId = `${stamp()}-${safeSlug(request)}`
    let rootPath = join(workspaceRoot, 'tasks', taskId)
    let suffix = 1
    while (existsSync(rootPath)) rootPath = join(workspaceRoot, 'tasks', `${taskId}-${suffix++}`)
    mkdirSync(rootPath, { recursive: true })

    const specPath = join(rootPath, 'SRS-PRD-SCREEN-DESIGN.md')
    const phasesPath = join(rootPath, 'PHASES.md')
    const readmePath = join(rootPath, 'README.md')
    writeFileSync(specPath, `# ${title} — SRS · PRD · 화면설계 통합 문서

## 1. 원문 요청

${request}

## 2. 제품 요구사항(PRD)

- 해결할 문제: 분석 필요
- 사용자 가치: 분석 필요
- 성공 기준: 구현 전 구체화
- 범위 / 제외 범위: 구현 전 구체화

## 3. 소프트웨어 요구사항(SRS)

- 기능 요구사항: 구현 전 구체화
- 비기능 요구사항: 성능·안정성·보안·호환성 검토
- 데이터 및 상태 모델: 구현 전 구체화
- 오류 및 복구 정책: 구현 전 구체화

## 4. 화면설계

- 화면 구조와 사용자 흐름: 구현 전 구체화
- 컴포넌트와 상태: 구현 전 구체화
- 빈 상태·로딩·오류 상태: 구현 전 구체화
- 반응형·접근성: 구현 전 구체화

## 5. 인수 조건

- [ ] 요구사항과 제외 범위가 명확하다.
- [ ] 핵심 사용자 흐름을 검증했다.
- [ ] 테스트와 빌드가 통과한다.
- [ ] 최종 결과와 사용법이 README에 기록됐다.
`, 'utf-8')
    writeFileSync(phasesPath, `# ${title} — 작업 Phase

- [ ] Phase 0 — SRS·PRD·화면설계 통합 문서 구체화 및 사용자 요구사항 확인
- [ ] Phase 1 — 핵심 구조와 데이터 모델 구현 → 검증 → 문서 갱신 → 커밋·푸시
- [ ] Phase 2 — 기능 및 화면 구현 → 검증 → 문서 갱신 → 커밋·푸시
- [ ] Phase 3 — 통합 테스트·오류 수정 → 문서 갱신 → 커밋·푸시
- [ ] Phase 4 — 최종 결과물 점검 및 README 완성 → 커밋·푸시
`, 'utf-8')
    writeFileSync(readmePath, `# ${title}

> 작업 진행 중 — 각 Phase가 끝날 때 결과와 검증 내역을 갱신합니다.

## 결과물

- 준비 중

## 실행 및 사용법

- 준비 중

## 검증

- 준비 중

## 변경 이력

- 작업 폴더 생성 및 기획 문서 초안 작성
`, 'utf-8')

    return { taskId: basename(rootPath), title, rootPath, specPath, phasesPath, readmePath }
  }
}

export const taskWorkspaceManager = new TaskWorkspaceManager()
