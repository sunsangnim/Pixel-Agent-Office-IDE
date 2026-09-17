# Pixel Office Asset Catalog

모든 런타임 이미지 에셋의 기준 경로는 `src/renderer/src/assets/pixel-office`이다.

## 폴더 구조

```text
pixel-office/
├─ characters/   캐릭터 원본 및 애니메이션 시트
├─ furniture/    독립 투명 PNG 가구
│  └─ directional/ 13종 × 정면·오른쪽·뒷면·왼쪽 방향 PNG
├─ floors/       64×64 무봉제 바닥 타일
├─ props/        캐릭터가 손에 드는 투명 PNG 소품
├─ ui/           투명 픽셀 UI 에셋
└─ archive/      런타임에서 제외된 교체 전 원본
```

## Characters

- `characters/corporate-roster-row-1-v1.png`
- `characters/corporate-roster-row-2-v1.png`
- `characters/corporate-roster-row-3-v1.png`
- `characters/corporate-roster-row-4-v1.png`
- `characters/claude-team-animation-atlas-v1.png`
- `characters/codex-team-animation-atlas-v1.png`
- `characters/antigravity-team-animation-atlas-v1.png`
- `characters/roster-row-4-animation-atlas-v1.png`
- `characters/ceo-animation-sheet-v2.png`

팀별 애니메이션 시트와 대표 시트는 행 높이가 일정하지 않다. 런타임은
`game/characterFrames.ts`의 실측 영역으로 각 포즈를 읽고, 원본 비율을 유지한 채
투명 여백이 있는 312×360px 프레임에 발끝을 맞춰 배치한다. 시트를 단순히
4등분 또는 6등분하면 신발이 잘리고 인접 포즈가 섞이므로 사용하지 않는다.
프레임 검증은 `npm run test:integration -- --character-frames`로 실행한다.

## Furniture

| 파일 | 용도 | 점유 칸 |
| --- | --- | --- |
| `coffee-machine-v2.png` | 정면형 탕비실 커피 머신 | 4×6 |
| `refrigerator-v2.png` | 정면형 탕비실 냉장고 | 4×8 |
| `pantry-cabinet-v1.png` | 탕비실 수납장 | 8×4 |
| `presentation-screen-v1.png` | 회의실 화면 | 10×2 |
| `long-table-v1.png` | 독립형 긴 회의 테이블 | 16×6 |
| `laptop-v1.png` | 테이블 위 배치 가능한 비충돌 노트북 | 3×2 |
| `workstation-desk-v1.png` | 팀/대표 업무 책상 | 12×6 |
| `office-chair-v2.png` | 정면형 사무용 의자 | 4×4 |
| `office-plant-v1.png` | 실내 화분 | 2×4 |
| `side-table-v2.png` | 정면형 대표실 사이드 테이블 | 4×2 |
| `office-sofa-v1.png` | 대표실 소파 | 8×4 |
| `floor-lamp-v1.png` | 대표실 램프 | 2×2 |
| `bookcase-v2.png` | 정면형 대표실 책장 | 4×8 |

## Handheld props

| 파일 | 용도 | 표시 크기 |
| --- | --- | --- |
| `props/coffee-mug-v1.png` | 탕비실 휴식 중 마시는 커피 머그컵 | 28×28 |
| `props/chocolate-cookie-v1.png` | 탕비실 휴식 중 먹는 초코칩 쿠키 | 26×26 |

내장 이미지 생성 도구로 만든 독립 투명 PNG다. 현재 대표와 직원의 휴식은
소품까지 포함된 전신 동작 시트로 표시한다. 이 두 파일은 원본 소품으로 보관하며
런타임에서는 별도로 로드하거나 캐릭터 위에 합성하지 않는다.

## Representative desk work posture

- `characters/ceo-desk-work-v1.png` — 대표 전용 투명 2×2 업무 자세 시트.
  왼쪽 위부터 정면·왼쪽·뒷면·오른쪽이며, 양손을 책상 높이로 올리고 팔꿈치를 굽힌 자세다.
  내장 이미지 생성 도구로 `ceo-seated-v1.png`의 외형과 착석 위치를 유지해 제작했다.
- 기존 착석 시트의 배율과 좌표 변환을 그대로 적용한다. 앞으로 뻗은 손이 생겨도
  캐릭터 전체를 다시 가운데 정렬하거나 축소하지 않는다.
- `representativeWorkAnimation.ts`가 손·소매에 작은 타이핑 움직임과 짧은 휴식을 넣는다.
  회의석과 독립 의자는 기존 휴식 자세를 사용하며 직원 캐릭터에는 적용하지 않는다.

## Representative break animation and speech

- `characters/ceo-pantry-actions-v1.png` — 대표 전신 12개 자세(3열×4행).
  첫 2행은 컵 들기·올리기·첫 모금·내리기·두 번째 모금·마무리,
  마지막 2행은 쿠키 들기·올리기·첫 입·씹기·두 번째 입·만족 표정이다.
  손·팔과 소품이 함께 그려져 있으며 쿠키의 베어 문 자국도 바뀐다.
- `ui/speech-bubble-v1.png` — 민트 테두리·아이보리 내부·아래 꼬리가 있는 빈 말풍선.
  원본의 투명 여백을 런타임 프레임에서 제외하고 176×48로 표시한다.
  한국어 문구는 이미지 위에 텍스트로 표시한다.

두 에셋은 내장 이미지 생성 도구로 제작한 투명 PNG이며 원본 알파를 유지한다.
대표의 동작 프레임은 `measurePantrySheet`로 투명 행 간격을 찾아 분리하고,
모든 자세를 공통 배율·발끝 기준으로 맞춘다. 기존 대표용 소품 이동 대신
각각 6단계의 전신 자세를 재생한다. 이름은 그대로 두고 이동·섭취 문구를
말풍선에 표시한다. 이름표는 항상 머리 바로 위에 고정한다. 말풍선은 이름 위에 표시하고,
상단 여백이 부족하면 캐릭터 아래에 표시하며 꼬리만 위를 향하도록 뒤집는다.
섭취가 끝나면 추가 문구 없이 말풍선을 숨긴다. 새 이동·착석·편집 명령은 즉시 동작과 말풍선을 정리한다.

## Employee break animations

- `characters/pantry-v1/staff-{team}-{variant}-pantry-v1.png` — 팀 0~2, 외형 0~4의 직원 15종.
  각 PNG는 1086×1448, 투명 배경의 3열×4행 전신 시트다. 각 직원의
  `walk-v6` 외형과 대표 휴식 동작을 참조하여 내장 이미지 생성 도구로 제작했다.
- 행과 자세 순서는 대표와 동일하며, `pantryAnimation.ts`의 공통 시간표로
  커피 6단계·간식 6단계를 재생한다. 손·팔·표정과 컵/쿠키가 함께 바뀐다.
- 외형은 명부 순서가 아닌 팀/슬롯으로 선택한다. Claude 팀장은 기존과 같이 0-4를 사용한다.
- 말풍선은 대표와 같은 에셋을 사용한다. 이름은 머리 위 고정, 말풍선은 위 또는 아래에만 배치한다.
  이동/섭취 중 문구만 표시하며 완료 문구는 없다.
- 직원은 편집 중 현재 자세와 시간을 유지하고 종료 시 이어서 재생한다.
  업무·회의·도움 요청·오류·퇴근은 즉시 동작을 종료한다.
- `npm run test:movement`에서 15개 시트와 30개 외형/행동 조합을 검증한다.

## Floors

- `floors/mint-tile-v1.png` — 민트 세라믹
- `floors/oak-parquet-v1.png` — 오크 마루
- `floors/blue-stone-v1.png` — 블루 스톤
- `floors/teal-carpet-v1.png` — 청록 카펫
- `floors/office-carpet-tile-v1.png` — 쿨그레이 오피스 카펫 타일
- `floors/plain-gray-floor-v1.png` — 무늬 없는 회색 바닥, 1px 진회색 타일 윤곽선
- `floors/plain-gray-floor-v2.png` — 무늬 없는 고급 회색 패널 바닥, 방향성 베벨과 정돈된 타일 윤곽선

바닥 파일은 모두 64×64px이며 상하·좌우 경계 픽셀이 일치해야 한다.

## 관리 규칙

- 새 가구는 합본 이미지가 아니라 독립 PNG로 추가한다.
- 새 파일을 추가할 때 `OfficeScene.ts`의 텍스처 등록, `officeGrid.ts`의 점유 칸, 이 카탈로그를 함께 갱신한다.
- 투명 가구 에셋은 모든 외곽 경계 픽셀이 투명해야 한다.
- 삭제되거나 대체된 에셋은 코드 참조와 카탈로그에서 동시에 제거한다.
- 업무 상태는 캐릭터·의자·책상을 런타임에 합성하며, 가구가 포함된 캐릭터 프레임을 사용하지 않는다.
- 방향 전환은 `directional/<asset>-{front|right|back|left}-v1.png` 텍스처 교체로 표현한다.
- 노트북은 테이블과 겹쳐 배치할 수 있는 비충돌 소품이며, 긴 회의 테이블은 일반 충돌 가구다.
