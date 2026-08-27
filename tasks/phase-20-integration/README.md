# Phase 20 통합 검증

## 결과

- 실제 `node-pty` stdin/stdout 경로를 사용하는 비용 없는 가짜 CLI를 추가했다.
- 미지정 작업의 Claude 기본 배정, Codex/Antigravity 직접 호명, 복합 작업의 3팀 배정을 검증했다.
- 팀장 3명과 팀별 하위 세션 3명으로 구성된 12개 고유 프로필을 검증했다.
- CLI별 완료 신호, 공통 대기·오류 신호, CR 프롬프트 직렬화를 검증했다.
- 정상 세션의 `working → completed`와 실패 세션의 `error`를 검증했다.
- 실패 세션과 동시에 실행한 정상 세션이 독립적으로 완료되는 것을 검증했다.

## 자동 검증

```bash
npm run typecheck
npm run test:integration
npm run build
```

2026-08-28 기준 세 명령이 모두 통과했다. 프로덕션 빌드에는 메인, 프리로드,
렌더러 번들과 픽셀 오피스 PNG 자산이 포함된다.

## 범위와 제한

- 자동 테스트는 실제 PTY를 사용하지만 유료 계정이나 로그인 상태가 필요한 Claude Code,
  Codex CLI, Antigravity CLI 자체는 호출하지 않는다.
- 실제 CLI 검증 시에는 각 도구 로그인 후 앱의 팀장 프로필에서 명령 경로를 확인한다.
- 데스크톱 캡처 런타임을 사용할 수 없는 환경에서는 화면 픽셀 검증 대신 번들 생성과
  자산 포함 여부를 확인한다.

## 최종 산출물

- 루트 `README.md`: 설치, 실행, 라우팅 정책, 상태 모델, 검증과 제한사항
- `scripts/integration-runner.ts`: 라우팅·프로필·어댑터·PTY 통합 시나리오
- `scripts/fixtures/fake-agent.cjs`: 실제 stdin/stdout을 사용하는 테스트용 CLI
- 이 폴더의 통합 SRS·PRD·화면설계와 Phase 기록
