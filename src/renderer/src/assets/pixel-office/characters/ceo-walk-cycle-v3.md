# Representative walk cycle v3

Generated with the built-in `image_gen` tool from `ceo-animation-sheet-v2.png`.
Asset: `ceo-walk-cycle-v3.png` (1254 × 1254, RGBA; original generated alpha preserved).

Four columns: first contact, passing, opposite contact, passing. Rows: front idle,
front walk, back walk, left walk. Rightward walking mirrors the entire side row.
The front row alternates the leading hand, with the opposite leg stepping forward.
The head is not mirrored when exchanging left/right strides.
`characterFrames.ts` measures the actual source bands and uses one scale throughout.

## Generation prompt

Use case: precise-object-edit
Asset type: transparent pixel-art game character locomotion sprite sheet.
Input image is the character identity and art-style reference. Correct the broken walking poses from this sheet: front-walk currently keeps lifting the same arm.
Create ONE new 1024x1024 RGBA sprite sheet on a genuinely transparent background, a strict 4 COLUMN x 4 ROW grid of 256x256 cells. Exactly 16 sprites. No text, grid lines, labels, props or shadows. Preserve this SAME small navy-haired male CEO, navy blue suit and trousers, white shirt, blue tie, black shoes, blue eyes, chibi proportions, crisp pixel-art rendering. All poses must have identical head/body proportions, hair silhouette and costume. Whole body in every cell, each approximately 196 pixels high, horizontally centered, soles at local cell y=224. At least 24px transparent padding. Same scale and baseline for all cells. DO NOT stretch pose to fill its cell.
ROW 1: identical front-facing STANDING neutral sprite in all four cells, both arms resting at sides, feet together, same as reference idle.
ROW 2: FRONT-facing walk toward the viewer, exactly four sequential phases of a full left+right gait cycle:
column 1: character's RIGHT arm swings forward (viewer LEFT hand slightly nearer/higher), LEFT arm swings backward, LEFT leg steps forward, RIGHT leg back.
column 2: passing pose, arms naturally beside the hips, feet passing.
column 3: OPPOSITE of column 1: character's LEFT arm swings forward (viewer RIGHT hand nearer/higher), RIGHT arm swings backward, RIGHT leg steps forward, LEFT leg back.
column 4: opposite passing pose, arms beside hips, feet passing.
ROWS 2's columns 1 and 3 MUST have visibly opposite leading hands and opposite leading feet. Head and face stay IDENTICAL, do not mirror hair or turn head.
ROW 3: BACK-facing walking away, those same four phases, both arms alternating forward/backward opposite the legs, white cuffs/hands visibly swapping sides on columns 1 and 3, identical back of head throughout.
ROW 4: LEFT-facing SIDE walking, those same four phases. Column 1 nearest arm reaches toward screen LEFT while nearest leg reaches screen RIGHT, far arm toward RIGHT and far leg LEFT. Column 2 limbs pass through neutral. Column 3 nearest arm reaches toward screen RIGHT while nearest leg reaches LEFT, far arm LEFT and far leg RIGHT. Column 4 limbs pass through neutral. Both arms are visible in the contact poses; hands stay relaxed near hip height, with a gentle elbow bend, swinging from shoulders. Clear natural arm swing, not a raised fist, waving, saluting or one fixed raised hand. Keep front and back arm/leg layering anatomically correct.
Invariants: exact reference character identity, navy suit, pixel art, constant head scale, fixed facing within each row, unclipped shoes. Only walking choreography is redesigned. No accessories, cup, desk, stool, chair, labels or decorative background. Output true alpha transparency.
