# Phase 19 CLI 어댑터

## 결과물

- `src/main/cliAdapters.ts`: Claude/Codex/Antigravity/generic 공통 어댑터 레지스트리
- `src/main/ptyManager.ts`: 출력 관찰, 완료 타이머, 오류 격리, 정규화 상태 이벤트
- `agent:state` IPC: `starting/ready/working/waiting/completed/error/exited` 전달
- 자동 프롬프트와 수동 터미널 입력 분리
- 세션 재시작 API와 기존 터미널 드릴다운 유지
- 채팅 응답과 팀 취합도 어댑터 완료 이벤트로 단일화

## 검증

- `npm run typecheck` 통과
- `npm run build` 통과
- 실행 파일 탐색 결과: 현재 셸 PATH에서 Claude 확인, Codex/Antigravity는 확인되지 않음
- 실제 계정 세션을 사용하는 라이브 CLI 시나리오는 Phase 20에서 검증

## 사용법과 복구

- 자동 지시는 `pty.sendPrompt`를 통해 CLI별 어댑터로 전달된다.
- 권한 승인이 필요하면 책상에 `승인 필요!`가 표시된다.
- 오류가 발생해도 다른 PTY는 유지되며 책상을 클릭해 원본 터미널을 확인할 수 있다.
- `instances.restart(instanceId)`로 동일 좌석과 부모 관계를 유지한 채 PTY를 재시작할 수 있다.

## 판정 방식

- Claude: stream-json의 `result` 이벤트 또는 대화형 프롬프트·유휴 판정
- Codex: JSONL 완료 이벤트 또는 대화형 프롬프트·유휴 판정
- Antigravity: 공식 CLI가 TUI 중심이므로 보수적 프롬프트·유휴 판정
- 사용자 템플릿: generic fallback
