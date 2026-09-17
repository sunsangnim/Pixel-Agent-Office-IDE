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
    let rootPath = join(workspaceRoot, taskId)
    let suffix = 1
    while (existsSync(rootPath)) rootPath = join(workspaceRoot, `${taskId}-${suffix++}`)
    mkdirSync(rootPath, { recursive: true })

    const specPath = join(rootPath, 'SRS-PRD-SCREEN-DESIGN.md')
    const phasesPath = join(rootPath, 'PHASES.md')
    const readmePath = join(rootPath, 'README.md')
    const developmentLogPath = join(rootPath, 'DEVELOPMENT-LOG.md')
    writeFileSync(developmentLogPath, `# ${title} — 개발 기록\n\n각 명령·작업과 검증이 끝날 때마다 아래 항목을 추가합니다. 기존 기록은 보존합니다.\n\n- 수행한 요청과 완료한 내용\n- 변경 파일과 설계 결정\n- 실행한 명령·테스트와 실제 결과\n- 관련 커밋과 미커밋 변경\n- 남은 작업·막힌 점·다음 단계\n\n새 세션은 통합 SRS → 이 개발 기록 → Git 커밋과 작업 트리 순서로 확인한 뒤 미완료 작업을 이어갑니다.\n`, 'utf8')
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

    return { taskId: basename(rootPath), title, rootPath, specPath, phasesPath, readmePath, developmentLogPath }
  }
}

export const taskWorkspaceManager = new TaskWorkspaceManager()
