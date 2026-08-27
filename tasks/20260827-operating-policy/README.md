# 문서 우선 오케스트레이션 운영정책

## 최종 결과물

- 작업마다 격리된 하위 폴더를 자동 생성한다.
- SRS·PRD·화면설계 통합 문서와 Phase 문서가 구현보다 먼저 생성된다.
- 미지정 작업은 Claude, 명시적 호명은 해당 팀장, 큰 작업은 세 팀으로 배정된다.
- 각 에이전트는 Phase별 검증·문서 갱신·커밋·푸시 의무를 전달받는다.

## 사용법

- 일반 요청: Claude 팀장이 기본 수행
- `코덱스야 ...`: Codex 팀장에게 직접 배정
- `안티그래피야 ...`: Antigravity 팀장에게 직접 배정
- 길거나 복합적인 요청: 분업 계획 공지 후 자동 오케스트레이션

## 검증

- `npm run typecheck` 통과
- `npm run build` 통과

## 관련 문서

- 루트 `OPERATING_POLICY.md`
- `SRS-PRD-SCREEN-DESIGN.md`
- `PHASES.md`
