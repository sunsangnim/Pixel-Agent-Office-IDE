# Phase 15 픽셀 이미지 자산화

## 결과물

- `office-background-v1.png`: 사람과 업무 책상이 없는 민트 타일 오피스 배경
- `furniture-sheet-v1.png`: 실제 알파 채널을 가진 4×3 가구 시트
- `character-sheet-v1.png`: 실제 알파 채널을 가진 4×2 정장 캐릭터 포즈 시트
- `furniture-source-v1.png`, `character-source-v1.png`: 비파괴 편집 원본
- 배경 → 독립 책상 → 지속 캐릭터 → 상태 UI 레이어 통합
- 이미지 로드 실패 시 기존 CSS/SVG fallback

## 생성 방식

- OpenAI 내장 image generation 모드 사용
- 사용자 제공 캐릭터 이미지는 픽셀 밀도·실루엣·정장 스타일 레퍼런스
- 사용자 제공 오피스 이미지는 구도·민트 타일·가구 스케일 레퍼런스
- 배경 프롬프트: 사람과 업무 책상이 없는 탕비실/유리 회의실/엘리베이터 포함 3:2 오피스
- 가구 프롬프트: 4×3로 분리된 책상·의자·회의 테이블·프린터·정수기 등
- 캐릭터 프롬프트: 4×2 정면·걷기·앉기·타이핑·도움 요청 포즈
- 배경 추출 편집 프롬프트: 객체/포즈를 보존하고 체크무늬만 실제 투명 알파로 교체

## 검증

- 가구 및 캐릭터 최종 PNG color type 6(RGBA) 확인
- `image-rendering: pixelated` 적용
- `npm run typecheck` 통과
- `npm run build` 통과
- 프로덕션 번들에 배경·가구·캐릭터 해시 자산 포함 확인
- 생성 이미지 자체는 대화에서 시각 검수 완료
- Electron 자동 화면 캡처는 Orca `runtime_unavailable`로 수행하지 못함

## 프로젝트 자산 경로

`src/renderer/src/assets/pixel-office/`
