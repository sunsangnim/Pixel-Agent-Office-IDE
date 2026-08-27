# Pixel Agent Office IDE — 구현 페이즈

풀 아키텍처/컨텍스트는 `C:\Users\win10\.claude\plans\frolicking-inventing-sprout.md` 참고.
각 페이즈 완료 시: 브리핑 → 커밋 & 푸시(main) → 이 파일 체크박스 갱신 → 다음 페이즈 진행.

## 요약
- Electron(main/preload/renderer, contextIsolation) + React + TypeScript + node-pty + xterm.js
- 에이전트 = 실제 CLI 프로세스(Claude Code, Codex CLI 우선, 템플릿 CRUD로 확장 가능)
- 픽셀 오피스 그리드(CSS 기반, 상태별 색상) + 우측 프롬프트 패널(수동 대상 선택) + 책상 클릭 시 xterm 터미널 드릴다운

## 페이즈

- [x] Phase 1 — 프로젝트 부트스트랩: electron-vite 기반 React+TS 스캐폴딩, 기본 창 실행 확인
- [x] Phase 2 — node-pty 통합: main에서 PTY spawn/write/kill, IPC로 stdout 스트리밍, 렌더러에서 최소 1개 터미널 동작 확인
- [x] Phase 3 — 에이전트 템플릿 스토어 + 설정 모달: Claude/Codex 시드, CRUD UI
- [x] Phase 4 — 작업 폴더 선택 + 에이전트 인스턴스 생성 플로우
- [x] Phase 5 — 픽셀 오피스 그리드 뷰 + 상태별 스타일링(idle/running/error) + 디바운스 상태 판별
- [x] Phase 6 — 책상 클릭 → xterm.js 터미널 패널 연결(완전 CLI 패스스루)
- [x] Phase 7 — 우측 프롬프트 패널: 대상 체크박스 선택 → 선택된 인스턴스들에 프롬프트 전송
- [x] Phase 8 — 통합 점검: Claude+Codex 동시 구동, 프롬프트 전송, 터미널 드릴다운, 상태색 변화, 프로세스 정리 확인
- [x] Phase 8.5 — 설정 별도 창 분리(Orca 스타일) + 오피스 룸 비주얼(바닥/테두리/식물/데스크 아이콘/하단 독) 1차 개편

### 2차 요청 (와이어프레임 기반 상세 오피스 + 채팅형 지시)

- [x] Phase 9 — 오피스 룸 리디자인: 탕비실(간식), 회의실(긴 테이블+의자+상석 노트북+벽걸이 TV), 출입구(엘리베이터 문), 데스크마다 책상/의자/모니터/키보드/마우스 디테일, 프린터/정수기 등 추가 장식
- [ ] Phase 10 — 에이전트별 고유 프로필(겹치지 않는 identicon 아바타) + 하단 바에 에이전트별 현재 업무내용 표시
- [ ] Phase 11 — 우측 패널을 채팅형 대화창으로 전면 개편: 상단에 "나" 프로필 + 설정 톱니바�퀴 버튼(설정창 오픈), 지시/에이전트 응답/업무 분배 내용이 말풍선으로 쌓이는 스레드, 하단 채팅 입력+전송 화살표
- [ ] Phase 12 — 설정창에 API 키/계정 연동(에이전트별 환경변수) 섹션 추가, 상단바의 기존 "설정" 버튼 제거(채팅 패널 톱니바퀴로 대체)
