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
- [ ] Phase 3 — 에이전트 템플릿 스토어 + 설정 모달: Claude/Codex 시드, CRUD UI
- [ ] Phase 4 — 작업 폴더 선택 + 에이전트 인스턴스 생성 플로우
- [ ] Phase 5 — 픽셀 오피스 그리드 뷰 + 상태별 스타일링(idle/running/error) + 디바운스 상태 판별
- [ ] Phase 6 — 책상 클릭 → xterm.js 터미널 패널 연결(완전 CLI 패스스루)
- [ ] Phase 7 — 우측 프롬프트 패널: 대상 체크박스 선택 → 선택된 인스턴스들에 프롬프트 전송
- [ ] Phase 8 — 통합 점검: Claude+Codex 동시 구동, 프롬프트 전송, 터미널 드릴다운, 상태색 변화, 프로세스 정리 확인
