# Phase 22 방 충돌·팀 영역 개선

## 결과

- 탕비실 전면을 3분할 유리 패널, 픽셀 프레임·하부 레일, 손잡이가 있는 독립문으로 개선했다.
- 배경에 포함된 회의실 TV 위에 겹치던 DOM TV를 제거했다.
- 상세 원목 책상·모니터·키보드·마우스·정면 의자 자산을 미출근 좌석까지 적용했다.
- 우측 장식 화분 영역을 그리드 금지 영역으로 예약하고 네 번째 좌석 열을 안전 위치로 이동했다.
- 캐릭터의 탕비실·회의실 입퇴실 애니메이션을 공용 복도와 지정 출입문 경유 방식으로 변경했다.
- 하단 프로필을 Team Claude, Team Codex, Team Antigravity 영역으로 분리하고 각 4명을 한 줄에 배치했다.
- 채팅에 멘션 버튼과 `@` 자동완성 목록을 추가했다.
- `@클로드`·`@claude`·`@Claude` 등 한글/영문/대소문자 멘션을 담당 팀장 라우팅에 연결했다.

## 검증

- `npm run typecheck` 통과
- `npm run test:integration` 통과
- `npm run build` 통과
- Orca computer-use 1280 × 800 실제 화면 검증
  - 유리 탕비실과 정상 회의실 TV 확인
  - 상세 데스크 12석과 화분 안전 여백 확인
  - Team Claude/Codex/Antigravity 각 4명 확인
  - `@c` 입력 시 Claude·Codex 필터 목록 표시 확인

## 주요 변경 파일

- `src/renderer/src/components/OfficeZones.tsx`
- `src/renderer/src/components/OfficeView.tsx`
- `src/renderer/src/components/OfficeAgentLayer.tsx`
- `src/renderer/src/components/AgentProfileRow.tsx`
- `src/renderer/src/components/ChatPanel.tsx`
- `src/renderer/src/lib/taskRouter.ts`
- `src/renderer/src/styles/global.css`
- `scripts/integration-runner.ts`
