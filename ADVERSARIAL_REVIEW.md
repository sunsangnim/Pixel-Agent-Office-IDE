# 적대적 리뷰 — 2026-09-18

전체 코드베이스(`src/main`, `src/renderer`, `src/shared`, 운영 정책 문서, 에셋, git 이력)를 대상으로 한
비판적 리뷰 결과입니다. 개별 파일 단위 구현(경로 confinement, `execFile` 사용, origin URL 검증 등)은
꼼꼼한 편이지만, **제품 설계·운영 정책 수준에서 되돌리기 어려운 리스크**가 여러 건 확인되었습니다.
심각도 순으로 정리합니다.

## 1. [심각] 에이전트가 자기 작업을 스스로 완료 판정하고 main까지 자동 푸시함

- `src/renderer/src/lib/officeCommands.ts:176` — 작업을 수행하는 바로 그 CLI 에이전트에게
  "완료했으면 `outcome: completed` JSON을 스스로 작성하라"고 지시한다.
- `src/main/taskRecoveryStore.ts` (약 185~206행) — 이 자기보고 JSON만으로
  `command.status = 'completed'` → `task.stage = 'completed'`가 결정된다. 독립적인 검증 로직 없음.
- `src/main/ipc.ts:241-256` (`git:merge` 핸들러) — `task.stage === 'completed'`가 유일한 게이트.
- `src/main/taskFeatureWorktree.ts:42-67` (`mergeTaskFeature`) — 게이트를 통과하면
  `origin/main` fetch → `--ff-only` 병합 → `--no-ff` 병합 → **`origin/main`에 즉시 push**까지 자동 수행.
- `OPERATING_POLICY.md` — "Git 담당 한 명이 추가 확인 없이 feature에 커밋·푸시", "모든 Phase 완료 시
  추가 확인 없이 main 푸시"라고 명문화되어 있음.

**영향**: 작업을 수행한 LLM이 "검증 완료"라고 스스로 선언하는 것 하나로, 사용자의 실제 GitHub 계정
저장소 `main`까지 자동으로 밀린다. UI에 "병합" 버튼이 있지만 운영 정책상 그 버튼도 사람이 아니라
Git 담당 에이전트가 누른다. 잘못된 변경이 병합된 뒤 이를 잡아낼 독립적인 사람의 검증 지점이 없다.

**권장**: main 병합 직전에 최소 1회 사람의 명시적 승인 단계를 두거나(다이얼로그/버튼 확인),
완료 판정에 자기보고 JSON 외의 독립 신호(예: 실제 테스트 실행 결과 파일)를 요구한다.

## 2. [높음] 전체 워크플로가 정규식/idle-timeout 휴리스틱 위에서 동작

- `src/main/cliAdapters.ts:17` — `ERROR_PATTERN`이 `permission denied`, `fatal error` 등을
  출력 어디서든 매칭한다. 에이전트가 "방금 `permission denied` 에러를 고쳤습니다"라고 요약만 해도
  `error` 상태로 오판할 수 있다.
- `src/main/cliAdapters.ts:36` — `waiting` 판정도 `\by\/n\b`, `press enter` 같은 느슨한 패턴이라
  커밋 로그나 문서 텍스트에서도 오탐 가능.
- `src/main/ptyManager.ts:88-97` — JSON 스트림 모드(`claude`, `codex`의 exec 모드)가 아니면
  완료 판정이 순수 idle-timeout(1.8~2.5초)이다.
- `src/main/cliAdapters.ts:79-81` — Antigravity 어댑터는 구조화된 완료 신호가 전혀 없고
  idle-timeout에만 의존한다고 주석에 명시.

**영향**: 네트워크 지연 등으로 잠깐 출력이 멈추면 "완료"로 오판되고, 그 오판이 1번의 자동 병합
파이프라인을 그대로 트리거한다.

**권장**: 가능한 CLI(특히 Antigravity)에 구조화된 완료 신호(JSON/특정 종료 코드)를 우선 요청하고,
idle-timeout은 최후의 fallback으로만 남긴다.

## 3. [중간~높음] 에셋·저장소 비대화가 통제되지 않음

- `src/renderer/src/assets` 전체 124MB, git 객체 146MB(전부 loose, pack 안 됨).
- 캐릭터 스프라이트 세대가 `seated-v1`(4개) / `seated-v3`(20개) / `seated-v4`(20개) /
  `complete-v5`(20개) / `walk-v6`(16개) / `pantry-v1`(15개) / `work-v1`(3개)로 최종본이 무엇인지
  코드만 봐서는 알 수 없을 정도로 중복 누적되어 있음.
- 이 리뷰 시점의 미커밋 변경 역시 같은 패턴을 반복 중 — `seated-v3`, `seated-v4` 폴더와 생성
  스크립트 2개를 새로 추가하면서 이전 세대(`seated-v1`, `complete-v5`)는 정리하지 않음.
- `README.md`의 "현재 제한사항"이 "이미지 자산이 번들 용량의 큰 비중을 차지하므로 무손실
  최적화를 권장"이라고 38 Phase 넘게 인정만 하고 방치.

**권장**: 실제 사용 중인 최신 세대만 남기고 이전 세대(`seated-v1`, `seated-v3`, `complete-v5` 등
사용되지 않는 것)를 삭제하거나 `archive/`로 명확히 격리한 뒤 `git gc`로 저장소를 정리한다.

## 4. [중간] CI가 전혀 없음

`package.json`에 `test:integration`, `test:movement`, `test:editor-layering`, `test:workspace`,
`test:workspace-ui`, `test:recovery`, `test:recovery-ui`, `test:meeting-ui`, `test:office-ui` 등
9개 테스트 스크립트가 있지만 `.github/workflows`가 존재하지 않는다 — 전부 사람이 로컬에서 수동
실행해야만 돈다. "검증 끝나면 확인 없이 커밋·푸시"하는 운영 정책과 결합하면, 검증을 건너뛴 변경이
feature/main에 실리는 것을 잡아줄 자동 안전망이 전혀 없다.

**권장**: 최소한 `npm run typecheck`와 비용 없는 통합 테스트(`test:integration`,
`test:movement` 등)만이라도 push/PR 트리거 CI에 올린다.

## 5. [낮음~중간] `OfficeScene.ts` God object

`src/renderer/src/game/OfficeScene.ts` 2,835줄 — 렌더링, 경로탐색, 유휴 행동, 회의/탕비실
체크포인트, 편집모드 정지 로직이 한 파일에 몰려 있다. 규모상 한 가지 동작(예: 탕비실 휴식 타이밍)을
고치다가 관련 없어 보이는 다른 동작(회의 체크포인트, 에디터 정지 로직)을 깨뜨릴 구조적 위험이 높다.

**권장**: 책임별(이동/경로탐색, 유휴·휴식 스케줄, 회의 체크포인트, 편집모드 상태)로 모듈을 분리한다.

## 6. [낮음, 심층방어] IPC 신뢰 경계가 필요 이상으로 넓음

- `src/main/windowManager.ts:11` — 두 창 모두 `sandbox: false`.
- `src/main/ipc.ts:41-46` (`pty:spawn` 핸들러) — renderer가 보낸 `command`/`args`를 템플릿
  화이트리스트 대조 없이 그대로 `node-pty`에 전달.

현재는 `dangerouslySetInnerHTML`/`eval` 등 XSS 경로가 코드에 없어 당장 악용 경로는 낮지만, 이 앱의
목적 자체가 "실제 프로세스 실행"이라 renderer 코드(또는 향후 서드파티 의존성)가 조금이라도 취약해지면
바로 임의 명령 실행으로 이어지는 설계다. `sandbox`를 꺼야 할 필요가 코드상 보이지 않는다
(preload는 `contextBridge`/`ipcRenderer`만 사용).

**권장**: `sandbox: true`로 전환 가능한지 검토하고, `pty:spawn`에서 `command`를 등록된 템플릿
목록과 대조하는 검증을 추가한다.

## 사소한 위생 문제

- `.gitattributes`가 없어 `LayoutEditorPanel.tsx`처럼 실제 내용 변경 없이 LF/CRLF 차이만으로
  `git status`에 "수정됨"이 표시되는 노이즈가 발생한다. `.gitattributes`에 `* text=auto`류 규칙
  추가를 권장.

## 요약

| # | 항목 | 심각도 |
| --- | --- | --- |
| 1 | 자기보고 완료 판정 → 무확인 main 자동 병합·푸시 | 심각 |
| 2 | 정규식/idle-timeout 기반 상태 판정의 오탐 가능성 | 높음 |
| 3 | 에셋·git 저장소 비대화, 중복 세대 정리 안 됨 | 중간~높음 |
| 4 | CI 부재 — 테스트가 전부 수동 실행 | 중간 |
| 5 | `OfficeScene.ts` 2,835줄 God object | 낮음~중간 |
| 6 | `sandbox: false` + `pty:spawn` 검증 부재 | 낮음(심층방어) |

가장 먼저 손봐야 할 지점은 1번이다 — 개별 코드는 방어적으로 잘 짜여 있지만, 그 위에 얹힌 제품
정책 자체가 "LLM 에이전트의 자기 완료 선언 → 무확인 main 자동 병합·푸시"를 전제로 하고 있고,
그 완료 판정마저 휴리스틱에 의존한다.
