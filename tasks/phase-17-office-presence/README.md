# Phase 17 공간 상태와 이동

## 결과물

- `useOfficePresence`: 어댑터 상태와 업무에 따른 일곱 공간 상태 전이
- `OfficeAgentLayer`: 활성 Run당 하나의 지속 캐릭터 DOM
- 출입구 출근 및 책상·탕비실·회의실 간 step 이동
- 작업·휴식·회의·승인 대기·오류 말풍선
- 완료 후 1.2초 뒤 하위 직원 휴식 이동, 팀장은 책상 대기
- 미출근 직원은 캐릭터 없이 고정 좌석과 프로필만 유지
- 모션 감소 OS 설정 지원

## 검증

- `npm run typecheck` 통과
- `npm run build` 통과
- Electron 개발 서버와 앱 프로세스 기동 확인
- Orca computer-use 화면 캡처는 로컬 Orca 런타임 연결 실패(`runtime_unavailable`)로 수행하지 못함

## 상태 매핑

| 입력 | 공간 상태 | 표현 |
|---|---|---|
| Run 없음 / 종료 | `offDuty` | 미출근, 빈 좌석 |
| 시작 / 작업 | `working` | 자기 책상, 작업 모션 |
| 권한 확인 | `requestingHelp` | 자기 책상, 승인 필요 말풍선 |
| 오류 | `error` | 자기 책상, 오류 말풍선 |
| 팀 취합 | `meeting` | 회의실 이동 |
| 완료된 하위 세션 | `pantry` / `meeting` / `deskIdle` | 배정된 휴식 위치 |
| 완료된 팀장 | `deskIdle` | 자기 책상 대기 |
