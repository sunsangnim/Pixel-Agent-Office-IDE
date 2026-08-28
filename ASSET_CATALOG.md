# Pixel Office Asset Catalog

모든 런타임 이미지 에셋의 기준 경로는 `src/renderer/src/assets/pixel-office`이다.

## 폴더 구조

```text
pixel-office/
├─ characters/   캐릭터 원본 및 애니메이션 시트
├─ furniture/    독립 투명 PNG 가구
├─ floors/       64×64 무봉제 바닥 타일
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

## Furniture

| 파일 | 용도 | 점유 칸 |
| --- | --- | --- |
| `coffee-machine-v2.png` | 정면형 탕비실 커피 머신 | 2×3 |
| `refrigerator-v2.png` | 정면형 탕비실 냉장고 | 2×4 |
| `pantry-cabinet-v1.png` | 탕비실 수납장 | 4×2 |
| `presentation-screen-v1.png` | 회의실 화면 | 5×1 |
| `conference-table-v1.png` | 회의 테이블과 좌석 세트 | 12×6 |
| `workstation-desk-v1.png` | 팀/대표 업무 책상 | 6×3 |
| `office-chair-v2.png` | 정면형 사무용 의자 | 2×2 |
| `office-plant-v1.png` | 실내 화분 | 1×2 |
| `side-table-v2.png` | 정면형 대표실 사이드 테이블 | 2×1 |
| `office-sofa-v1.png` | 대표실 소파 | 4×2 |
| `floor-lamp-v1.png` | 대표실 램프 | 1×1 |
| `bookcase-v2.png` | 정면형 대표실 책장 | 2×4 |

## Floors

- `floors/mint-tile-v1.png` — 민트 세라믹
- `floors/oak-parquet-v1.png` — 오크 마루
- `floors/blue-stone-v1.png` — 블루 스톤
- `floors/teal-carpet-v1.png` — 청록 카펫
- `floors/office-carpet-tile-v1.png` — 쿨그레이 오피스 카펫 타일

바닥 파일은 모두 64×64px이며 상하·좌우 경계 픽셀이 일치해야 한다.

## 관리 규칙

- 새 가구는 합본 이미지가 아니라 독립 PNG로 추가한다.
- 새 파일을 추가할 때 `OfficeScene.ts`의 텍스처 등록, `officeGrid.ts`의 점유 칸, 이 카탈로그를 함께 갱신한다.
- 투명 가구 에셋은 모든 외곽 경계 픽셀이 투명해야 한다.
- 삭제되거나 대체된 에셋은 코드 참조와 카탈로그에서 동시에 제거한다.
- 업무 상태는 캐릭터·의자·책상을 런타임에 합성하며, 가구가 포함된 캐릭터 프레임을 사용하지 않는다.
