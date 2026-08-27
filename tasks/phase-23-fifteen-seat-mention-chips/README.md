# Phase 23 15석 오피스·멘션 칩

## 결과

- 팀장별 하위 세션 상한을 3개에서 4개로 확장했다.
- 3개 팀 × (팀장 1명 + 하위 세션 4명), 총 15개 고유 프로필을 생성한다.
- 오피스를 세로 확장하고 Team Claude, Team Codex, Team Antigravity 3열로 나눴다.
- 각 팀 열은 팀장 1석과 하위 세션 2×2 좌석이며 팀 사이에 픽셀 파티션을 표시한다.
- 탕비실 유리벽과 출입문을 회의실 전면 경계 높이까지 확장했다.
- 회의실 상석 노트북을 착석자 시점 방향으로 180도 회전했다.
- 우측 중앙 가로 플랜터를 세로 플랜터로 바꾼 `office-background-v2.png`를 추가했다.
- 고정 멘션 버튼을 제거하고 `@` 입력 시에만 멤버 목록형 패널이 표시되게 했다.
- 목록은 아바타, 이름, 역할, 별칭을 표시하며 선택 결과는 입력창 내부 칩으로 유지된다.
- 목록 선택을 `mouseDown`에서 확정하고 입력 끝에 포커스·선택 범위를 설정해 커서 역행을 막았다.
- 전송 시 선택 칩과 본문을 `@Agent 업무내용` 형태로 조합해 기존 라우터에 전달한다.

## 검증

- `npm run typecheck` 통과
- `npm run test:integration` 통과: 15개 프로필, 팀장 3명, 하위 세션 12명, 팀별 상한 4개
- `npm run build` 통과
- Orca computer-use 실제 화면 검증
  - 15석과 3개 팀 파티션 확인
  - 탕비실 경계, 세로 화분, 회전된 노트북 확인
  - 고정 멘션 버튼 제거 확인
  - `@` 입력 시 Claude/Codex/Antigravity 멤버 목록 확인
  - Claude 선택 시 `@Claude` 칩과 제거 버튼 생성 확인

## 이미지 자산

- 편집 대상: `src/renderer/src/assets/pixel-office/office-background-v1.png`
- 최종 자산: `src/renderer/src/assets/pixel-office/office-background-v2.png`
- 사용 도구: 내장 imagegen 편집 모드
- 최종 프롬프트 요약: 다른 방·벽·바닥·가구·조명·해상도를 유지하고 우측 중앙의 가로
  원목 플랜터만 동일한 픽셀 스타일의 세로 플랜터로 재구성한다.

## 주요 변경 파일

- `src/shared/orchestrationPolicy.ts`
- `src/shared/agentProfiles.ts`
- `src/renderer/src/components/OfficeView.tsx`
- `src/renderer/src/components/OfficeAgentLayer.tsx`
- `src/renderer/src/components/ChatPanel.tsx`
- `src/renderer/src/styles/global.css`
- `scripts/integration-runner.ts`
