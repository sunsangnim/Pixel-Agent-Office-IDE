# Phase 21 오피스 UI 정리

## 결과

- 탕비실을 반투명 유리 벽과 별도 출입문이 있는 독립 구역으로 변경했다.
- 회의실에 긴 원목 테이블, 둘레 의자 7개, 상석 노트북을 배치했다.
- 상단 방 영역과 업무 영역의 비율을 고정하고 12개 데스크를 3행 × 4열로 배치했다.
- 사용자명을 `김태호`로 변경하고 채팅 메시지 작성자에도 동일하게 적용했다.
- 작업 폴더 선택 줄을 채팅 기록 아래, 받는 사람과 입력창 바로 위로 이동했다.
- 저장된 값이 없거나 손상된 경우 기본 작업 폴더를 `C:\Users\win10`으로 설정했다.
- 하단 프로필 행의 수동 에이전트 추가 카드를 제거했다. 에이전트 Run은 채팅 자동 배정으로 생성된다.
- 설정 화면의 폼 제목을 `새 에이전트 추가`와 `에이전트 수정`으로 변경했다.

## 검증

- `npm run typecheck` 통과
- `npm run test:integration` 통과
- `npm run build` 통과
- Orca computer-use로 1280 × 800 Electron 실제 화면 확인
  - 유리 탕비실·회의실 경계 확인
  - 회의실 테이블·의자·노트북 확인
  - 상단 방과 첫 번째 데스크 행 비중첩 확인
  - `김태호`, 기본 폴더, 폴더 선택 줄 위치 확인
  - 하단 추가 카드 제거 확인

## 변경 파일

- `src/renderer/src/components/OfficeZones.tsx`
- `src/renderer/src/components/OfficeAgentLayer.tsx`
- `src/renderer/src/components/ChatPanel.tsx`
- `src/renderer/src/components/AgentProfileRow.tsx`
- `src/renderer/src/hooks/useAgentChat.ts`
- `src/renderer/src/styles/global.css`
- `src/renderer/src/App.tsx`
- `src/renderer/src/SettingsWindow.tsx`
- `src/main/workspaceStore.ts`
