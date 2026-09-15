# Employee seated poses

Generated with the built-in `image_gen` tool. Original PNG alpha is preserved;
no white-shirt or background color keying is applied.

| Team | Saved asset | Appearance reference |
| --- | --- | --- |
| Claude (0) | [staff-0-seated-v1.png](staff-0-seated-v1.png) | `claude-team-animation-atlas-v1.png` |
| Codex (1) | [staff-1-seated-v1.png](staff-1-seated-v1.png) | `codex-team-animation-atlas-v1.png` |
| Antigravity (2) | [staff-2-seated-v1.png](staff-2-seated-v1.png) | `antigravity-team-animation-atlas-v1.png` |

Each sheet contains five people in columns and front, back, left seated poses
in rows. Right facing mirrors left. Variant order matches [walking skins](../walk-v6/README.md);
Claude's lead retains variant 4. `ceo-seated-v1.png` is the pose reference.

Runtime cropping reads transparent row gutters and fits all three directions of
each person at one scale. The same chair position and head/backrest composition
are used for employees and the representative. Work, desk idle, help, error,
and meeting stay seated until the destination changes; departures restore the
walking atlas and remove the seated overlay.

## Shared prompt

IMAGE 1 is the character appearance reference only: preserve the five distinct people in its five columns in that exact order. IMAGE 2 is the approved seated POSE AND STYLE reference: match its chibi pixel art head/body proportions and invisible-chair sitting posture. Create one transparent PNG sprite sheet, exactly FIVE COLUMNS and THREE ROWS of equal cells, 15 complete sprites. Each column is one person. Row 1 all five seated facing FRONT (toward viewer). Row 2 all five seated facing BACK (away from viewer, no faces visible). Row 3 all five seated facing LEFT (noses point to the LEFT edge of the image). No standing poses. Hips and knees bent, thighs horizontal, feet down, hands resting on thighs. Full bodies including complete hair and shoes, generous transparent gutters, centered in each equal cell. Same head scale and consistent size across all poses. No chairs, desks, laptop, bags, books, mugs, shadows, labels or text. Truly transparent background, NOT a checkerboard pattern. All clothing, especially white shirts, must be completely opaque with no holes. Preserve hairstyle, glasses, outfits, gender and skin tone of each column from image 1. Crisp polished pixel art like image 2.

Claude additionally used: Column 5 is the woman with long wavy brown hair and brown skirt; keep her feminine appearance.
