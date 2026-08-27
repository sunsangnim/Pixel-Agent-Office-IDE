# Phase 16 직원·실행 세션 분리

## 결과물

- `AgentProfile`: 프로세스와 무관한 직원·직급·좌석 명부
- `AgentRun`: 실제 PTY, 작업 폴더, 부모 Run, 공간 상태
- 내장 세 팀 12명의 결정적 프로필 ID
- 사용자 CLI 템플릿에도 결정적 프로필 4개 자동 생성
- `profiles:*` 읽기 API와 `runs:*` 생명주기 API
- 기존 `instances:*` 호환 projection
- 프로필 기준 오피스 좌석과 미출근 프로필 카드
- 팀장 종료 시 하위 Run 정리 및 선택 상태 고아 ID 제거

## 검증

- `npm run typecheck` 통과
- `npm run build` 통과
- Run 재시작 시 profileId, 부모 Run, 좌석 관계 보존
- 앱 재시작 시 PTY Run은 종료되지만 결정적 직원 명부와 좌석은 즉시 복원

## 구조

```text
AgentProfile (항상 존재)
└─ AgentRun (CLI 실행 중에만 존재)
   └─ PTY
```
