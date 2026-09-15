# Employee walk sheets v6

Created with the built-in `image_gen` tool. Source PNGs retain their generated RGBA alpha; no white/color background keying is applied.

15 skin sheets, 16 poses each (4 phases × idle/front/back/left). Right walking mirrors the side row. The scene selects skins by team and slot; Claude's lead keeps variant 4.

All sheets use the representative's approved `ceo-walk-cycle-v3.png` as the pose template. The old team atlas supplies appearance only. Empty hands allow both arms to swing.

`measureWalkSheet` reads actual row gutters, uses a single scale for every pose of a person, and aligns soles. `CharacterGait` advances phases by actual distance and keeps diagonal facing stable.

## Assets and appearance prompts

| Asset | Appearance reference | Character |
| --- | --- | --- |
| [staff-0-0-walk-v6.png](staff-0-0-walk-v6.png) | claude-team-animation-atlas-v1.png, column 1 | navy-haired man in navy suit, white shirt, blue tie, black shoes |
| [staff-0-1-walk-v6.png](staff-0-1-walk-v6.png) | claude-team-animation-atlas-v1.png, column 2 | brown tousled-haired man with round dark glasses, brown blazer, white shirt, navy tie, blue ID lanyard, dark trousers, brown shoes |
| [staff-0-2-walk-v6.png](staff-0-2-walk-v6.png) | claude-team-animation-atlas-v1.png, column 3 | brown-haired man in dark brown sweater, white shirt collar, blue ID lanyard, tan trousers, white sneakers |
| [staff-0-3-walk-v6.png](staff-0-3-walk-v6.png) | claude-team-animation-atlas-v1.png, column 4 | navy-haired man in cream/beige jacket, white shirt, blue ID lanyard, charcoal trousers, white sneakers |
| [staff-0-4-walk-v6.png](staff-0-4-walk-v6.png) | claude-team-animation-atlas-v1.png, column 5 | woman with long wavy chestnut brown hair, brown blazer and brown knee-length skirt, white blouse, blue ID lanyard, black pumps |
| [staff-1-0-walk-v6.png](staff-1-0-walk-v6.png) | codex-team-animation-atlas-v1.png, column 1 | brown tousled-haired man with black rectangular glasses, tan blazer, white shirt, dark brown tie, dark charcoal trousers, brown shoes |
| [staff-1-1-walk-v6.png](staff-1-1-walk-v6.png) | codex-team-animation-atlas-v1.png, column 2 | short dark teal-haired man in dark teal suit, white shirt, white/light teal tie, dark shoes |
| [staff-1-2-walk-v6.png](staff-1-2-walk-v6.png) | codex-team-animation-atlas-v1.png, column 3 | woman with brown bob haircut, teal blouse, black knee-length skirt, teal shoes |
| [staff-1-3-walk-v6.png](staff-1-3-walk-v6.png) | codex-team-animation-atlas-v1.png, column 4 | black side-parted-haired man in fully opaque white long sleeve shirt, teal tie, charcoal trousers and dark shoes |
| [staff-1-4-walk-v6.png](staff-1-4-walk-v6.png) | codex-team-animation-atlas-v1.png, column 5 | woman with long dark brown hair, teal jacket over opaque white blouse, tan trousers, dark teal shoes |
| [staff-2-0-walk-v6.png](staff-2-0-walk-v6.png) | antigravity-team-animation-atlas-v1.png, column 1 | messy dark teal-haired man with rectangular dark teal glasses, fully opaque solid white long sleeve shirt, teal tie and ID badge lanyard, dark teal trousers and black shoes |
| [staff-2-1-walk-v6.png](staff-2-1-walk-v6.png) | antigravity-team-animation-atlas-v1.png, column 2 | short purple-haired man in dark purple suit, white shirt, purple tie and dark shoes |
| [staff-2-2-walk-v6.png](staff-2-2-walk-v6.png) | antigravity-team-animation-atlas-v1.png, column 3 | woman with shoulder-length purple bob hair, lavender blouse, charcoal trousers, purple shoes |
| [staff-2-3-walk-v6.png](staff-2-3-walk-v6.png) | antigravity-team-animation-atlas-v1.png, column 4 | short purple-haired bearded man in fully opaque solid white long sleeve shirt, purple tie, dark purple trousers, black shoes |
| [staff-2-4-walk-v6.png](staff-2-4-walk-v6.png) | antigravity-team-animation-atlas-v1.png, column 5 | woman with long dark purple hair, fully opaque solid white blouse, purple knee-length skirt, purple shoes |

## Shared generation prompt

Each call used the following text verbatim and appended the corresponding appearance instruction below.

```text
IMAGE 1 is the EDIT TARGET and EXACT WALKING POSE TEMPLATE. IMAGE 2 is ONLY an appearance reference for the specified character. Reskin image1's sixteen sprites to the specified person from image2. Do NOT copy image2's broken walking poses.
Keep EXACTLY image1's 4 columns x 4 rows composition and ALL arm/hand/leg/foot positions frame by frame. Each sprite remains the SAME SIZE and centered on the SAME baseline, with a constant head scale. Row1 neutral front standing, row2 front walk, row3 back walk, row4 left walk. Keep the clearly alternating hands from image1: row2 col1 viewer-LEFT hand forward, row2 col3 viewer-RIGHT hand forward. Back and side rows likewise exchange NEAR/FAR arms and feet in columns1 and3; copy those positions from image1 faithfully. Columns2 and4 are passing poses with arms down. Never repeat col1 in col3. Keep hair and face facing fixed per row; do not mirror the head to alternate the body. Natural walking, arm swinging from shoulder opposite the leading leg, hands near waist/hips.
Change ONLY identity/hair/clothing to the specified person. For skirts keep the knee-length skirt and show the corresponding alternating legs below it. Empty hands; remove carried cups/folders/bags/books from the appearance reference so both arms can swing freely. No desks, chairs, text or props. Crisp original pixel-art game style, chibi proportions. Output genuine RGBA alpha transparency OUTSIDE the character. ALL skin and clothing, especially white shirts, are fully OPAQUE solid paint, never transparent or checkerboard. Generous transparent separation between the16 complete unclipped sprites.
```

## Per-asset appended instructions

- `staff-0-0-walk-v6.png`: APPEARANCE: Image2 column 1 (one-based), navy-haired man in navy suit, white shirt, blue tie, black shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-0-1-walk-v6.png`: APPEARANCE: Image2 column 2 (one-based), brown tousled-haired man with round dark glasses, brown blazer, white shirt, navy tie, blue ID lanyard, dark trousers, brown shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-0-2-walk-v6.png`: APPEARANCE: Image2 column 3 (one-based), brown-haired man in dark brown sweater, white shirt collar, blue ID lanyard, tan trousers, white sneakers. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-0-3-walk-v6.png`: APPEARANCE: Image2 column 4 (one-based), navy-haired man in cream/beige jacket, white shirt, blue ID lanyard, charcoal trousers, white sneakers. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-0-4-walk-v6.png`: APPEARANCE: Image2 column 5 (one-based), woman with long wavy chestnut brown hair, brown blazer and brown knee-length skirt, white blouse, blue ID lanyard, black pumps. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-1-0-walk-v6.png`: APPEARANCE: Image2 column 1 (one-based), brown tousled-haired man with black rectangular glasses, tan blazer, white shirt, dark brown tie, dark charcoal trousers, brown shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-1-1-walk-v6.png`: APPEARANCE: Image2 column 2 (one-based), short dark teal-haired man in dark teal suit, white shirt, white/light teal tie, dark shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-1-2-walk-v6.png`: APPEARANCE: Image2 column 3 (one-based), woman with brown bob haircut, teal blouse, black knee-length skirt, teal shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-1-3-walk-v6.png`: APPEARANCE: Image2 column 4 (one-based), black side-parted-haired man in fully opaque white long sleeve shirt, teal tie, charcoal trousers and dark shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-1-4-walk-v6.png`: APPEARANCE: Image2 column 5 (one-based), woman with long dark brown hair, teal jacket over opaque white blouse, tan trousers, dark teal shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-2-0-walk-v6.png`: APPEARANCE: Image2 column 1 (one-based), messy dark teal-haired man with rectangular dark teal glasses, fully opaque solid white long sleeve shirt, teal tie and ID badge lanyard, dark teal trousers and black shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-2-1-walk-v6.png`: APPEARANCE: Image2 column 2 (one-based), short purple-haired man in dark purple suit, white shirt, purple tie and dark shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-2-2-walk-v6.png`: APPEARANCE: Image2 column 3 (one-based), woman with shoulder-length purple bob hair, lavender blouse, charcoal trousers, purple shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-2-3-walk-v6.png`: APPEARANCE: Image2 column 4 (one-based), short purple-haired bearded man in fully opaque solid white long sleeve shirt, purple tie, dark purple trousers, black shoes. Only this ONE person in ALL16 poses; ignore the other four people.
- `staff-2-4-walk-v6.png`: APPEARANCE: Image2 column 5 (one-based), woman with long dark purple hair, fully opaque solid white blouse, purple knee-length skirt, purple shoes. Only this ONE person in ALL16 poses; ignore the other four people.

## Validation

`npm run test:integration -- --character-frames` checks all 240 poses for complete sprites, consistent scale, opaque torso pixels, and opposite leading hands in front-facing contact phases. `npm run test:movement` exercises every employee slot, all four directions, waiting, and editor pause/resume.
