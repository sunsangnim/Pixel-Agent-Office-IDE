# 부족한 부분 — 2026-09-18

`ADVERSARIAL_REVIEW.md`가 코드 품질·거버넌스·아키텍처 문제를 다뤘다면, 이 문서는 "무엇이 아직 없는가"를
개발환경과 게임/기능 두 축으로 정리한다.

## 개발환경

1. **Lint/format 도구 없음** — ESLint/Prettier 설정이 전혀 없어 코드 스타일이 순전히 관례에만 의존한다.
2. **패키징 파이프라인 없음** — `electron-builder`가 devDependency로 설치돼 있지만 설정 파일도 빌드
   스크립트도 없다. 지금은 `npm run dev`/`npm start`로만 실행 가능하고, 배포용 설치 파일(.exe 등)을
   만들 방법이 없다.
3. **CI가 불완전함** — `.github/workflows/ci.yml`이 9개 테스트 스크립트 중 `test:workspace`,
   `test:workspace-ui`, `test:office-ui` 3개를 빠뜨리고 있다. 바로 직전에 `test:office-ui`가 실제
   회귀(`createCharacterFrames` 인자 누락 버그)를 잡아낸 전례가 있어 이건 특히 아쉽다.
4. **통합 `npm test` 없음** — 9개 테스트를 사람이 일일이 기억해서 순서대로 돌려야 한다.
5. **pre-commit 훅 없음** (husky 등) — 최소 typecheck조차 커밋 전에 자동으로 걸리지 않는다.
   `OPERATING_POLICY.md`의 "검증 끝나면 확인 없이 바로 커밋·푸시" 원칙과 결합하면 더 아쉬운 지점이다.
6. **LICENSE 없음** — 공개 GitHub 저장소인데 라이선스가 없어 재사용 가능 여부가 법적으로 불분명하다.
7. **Node 버전 고정 안 됨** — `engines` 필드도 `.nvmrc`도 없어 어떤 Node로 돌려야 하는지 코드로
   보장되지 않는다.
8. **표준 테스트 프레임워크 없음** — 전부 Node `assert` 기반 손수 작성 스크립트라 watch 모드, 커버리지
   측정, 병렬 실행이 안 된다.

## 게임/기능

1. **레이아웃 에디터에 Undo/Redo 없음, 삭제 확인도 없음** — 가구·데스크를 잘못 지우면 되돌릴 방법이
   "전체 삭제" 뿐이다(부분 복구 불가).
2. **React Error Boundary 없음** — 렌더링 중 예외 하나가 앱 전체를 흰 화면으로 만들 수 있고 복구 UI가
   없다.
3. **에러/크래시 로깅 인프라 없음** — 사용자가 직접 devtools를 열지 않는 한 런타임 에러가 조용히
   묻힌다.
4. **레이아웃 프리셋/여러 저장 슬롯 없음** — localStorage에 현재 배치 딱 하나만 저장된다.
5. **git/gh CLI 사전 점검(닥터 체크) 없음** — 설치·로그인이 안 돼 있으면 실제 작업 흐름 중간에야
   실패로 드러난다(에러 메시지 자체는 안내가 괜찮은 편).
6. **Antigravity CLI가 이 환경에 설치돼 있지 않아 실동작 검증이 전혀 안 됨** — Claude Code는
   `claude login`이 아니라 `auth login`이어야 한다는 버그를 실제로 발견·수정했는데(커밋 `f50e2a7`),
   Antigravity는 `loginArgs`가 기본값(`['login']`)에 의존한 채 한 번도 실제 CLI로 검증된 적이 없다.
   같은 종류의 버그가 숨어 있을 가능성이 가장 높은 지점이다.
7. **사운드/음향 피드백 전혀 없음** — 순수 비주얼 + 텍스트뿐이다.

## 우선순위

가장 먼저 손볼 가치가 있는 건 **CI 3개 누락**과 **Antigravity 로그인 미검증**이다 — 둘 다 "이미 한 번
실제로 문제를 낸 것과 같은 패턴"이라서다.

## 조치 결과 (2026-09-18)

### 개발환경 — 8/8 완료

| # | 항목 | 조치 |
| --- | --- | --- |
| 1 | Lint/format | `eslint.config.js` + `.prettierrc.json` 추가. `typescript-eslint`는 이 프로젝트의 `typescript@7`(TS 컴파일러 JS API 미노출)과 호환되지 않아 `@babel/eslint-parser` 기반으로 구성 — 실제 타입 검증은 계속 `npm run typecheck`가 담당. Prettier 전체 재포맷(112개 파일 변경분)은 git blame 오염을 피하려 적용하지 않고 `npm run format`으로만 제공, `lint-staged`가 커밋되는 파일에는 자동 반영. |
| 2 | 패키징 파이프라인 | `electron-builder.yml` + `npm run pack`/`dist:win`/`dist:mac`/`dist:linux` 추가. 이 저장소의 로컬 경로("오피스 IDE"의 공백) 때문에 `node-pty` 네이티브 리빌드가 로컬에서는 실패함(node-gyp의 잘 알려진 Windows 공백-경로 제약, 설정 문제 아님) — 공백 없는 경로로 체크아웃하는 GitHub Actions에서 실제 설치 파일을 만들 수 있도록 `.github/workflows/release.yml`(수동 트리거) 추가. |
| 3 | CI 불완전 | 누락됐던 `test:workspace`/`test:workspace-ui`/`test:office-ui`와 `npm run lint`/`test:unit`을 `ci.yml`에 추가. |
| 4 | 통합 `npm test` | typecheck→lint→test:unit→9개 스위트→build를 순서대로 묶은 `npm test` 추가. |
| 5 | pre-commit 훅 | husky + `lint-staged`로 커밋되는 파일에 `eslint`(검사만, 자동수정 없음)를 돌림. 전체 `npm test`는 몇 분씩 걸려 훅에 넣지 않음. |
| 6 | LICENSE | MIT 추가. |
| 7 | Node 버전 고정 | `engines`(`>=22`) + `.nvmrc`(`22`) 추가. |
| 8 | 표준 테스트 프레임워크 | vitest 추가(`vitest.config.ts`, `npm run test:unit`). 기존 9개 스위트는 각각 실제 Electron/node-pty/Phaser 하네스를 띄우는 구조라 그대로 두고, 새 순수 로직 테스트의 통로로 `layoutPersistence.test.ts`(11개 케이스)를 예시로 추가. |

### 게임/기능 — 7/7 완료 (사운드는 보류로 완료)

| # | 항목 | 조치 |
| --- | --- | --- |
| 1 | Undo/Redo, 삭제 확인 | 레이아웃 스냅샷 기반 undo/redo 스택(최대 50개) 추가, `Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y`와 버튼 2개로 노출. 개별 삭제엔 확인창을 넣지 않음(Undo가 있는데 매번 확인창까지 뜨면 더 나쁜 UX) — "전체 삭제"만 되돌릴 수 없을 만큼 파급력이 커서 확인창 추가. 실제 앱에서 추가→되돌리기→다시실행→전체삭제 전 과정을 스크린샷으로 검증. |
| 2 | React Error Boundary | `ErrorBoundary.tsx`로 두 창의 렌더 루트를 감쌈. 흰 화면 대신 에러 메시지 + 새로고침 버튼을 보여줌. |
| 3 | 크래시/에러 로깅 | `system:log-error` IPC로 `<userData>/error.log`에 기록(2MB마다 로테이션). `window.onerror`/`unhandledrejection`까지 잡아 Error Boundary가 못 잡는 영역도 커버. 실제 앱에서 세 경로 모두 로그 파일에 정확히 기록되는 것을 확인. |
| 4 | 레이아웃 프리셋 | 이름 붙여 저장·불러오기·삭제 가능한 프리셋을 별도 localStorage 키에 저장(현재 작업 중인 배치와 독립적이라 전환해도 안 잃어버림). 실제 앱에서 저장→초기화→불러오기로 원래 배치가 정확히 복원되는 것을 확인. |
| 5 | git/gh 사전 점검 | `systemDoctor.ts`의 `checkGitEnvironment()`가 새 작업 저장소를 만들기 전에 `git`/`gh` 설치와 `gh` 로그인 상태를 먼저 확인하고, 어느 것이 문제인지 구체적으로 안내. |
| 6 | Antigravity 로그인 미검증 | 여전히 미해결 — npm에 있는 `antigravity-cli` 패키지는 실제 Google Antigravity가 아닌 제3자의 "placeholder"라 설치하지 않음. 실제 CLI를 구할 방법이 없어 검증 불가 상태로 남겨둠. 사용자가 실제 CLI로 로그인을 한 번 시도해보고 Intent disambiguation 같은 엉뚱한 화면이 뜨면, Claude 때와 동일하게 설정의 "로그인 명령 인자" 필드를 실제 CLI의 서브커맨드(예: `auth login`)로 고치면 된다. |
| 7 | 사운드/음향 피드백 | 구현하지 않음 — 실제 사운드 에셋이 프로젝트에 전혀 없고, 그럴듯한 효과음을 무작정 만들어 넣는 것보다 어떤 톤/스타일을 원하는지 방향을 정하고 실제 에셋을 마련한 뒤 붙이는 게 맞다고 판단. |

`npm run typecheck`/`lint`/`test:unit`와 영향받은 스위트(`test:editor-layering`, `test:movement`,
`test:workspace`, `test:recovery`, `test:integration`, `test:office-ui`, `test:recovery-ui`)를 각
변경 직후 실행해 통과를 확인했고, Undo/Redo·Error Boundary·크래시 로깅·레이아웃 프리셋은 빌드된 앱을
직접 띄워 스크린샷/로그로 재확인했다.
