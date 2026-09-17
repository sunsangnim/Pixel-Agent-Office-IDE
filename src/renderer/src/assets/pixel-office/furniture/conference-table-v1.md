# Conference table v1

Generated with the built-in image generation tool. Both PNGs preserve the generated alpha.

- `conference-table-v1.png`: front/back view, fitted at runtime to a 256×144 canvas.
- `conference-table-side-v1.png`: right/left view, fitted at runtime to a 144×256 canvas.
- Editor entry: **대형 회의탁자** (frame 20).
- The intact original four-part meeting table becomes one object at the same center. Independently edited or removed pieces are preserved.

## Front prompt

Use case: precise-object-edit
Asset type: transparent PNG furniture sprite for a top-down pixel-art office game.
Primary request: turn the narrow table in Image 1 into ONE broad, continuous conference table that replaces the four overlapping tables seen in the meeting room in Image 2. Image 1 is the edit target for materials and straight-on orientation; Image 2 is supporting room context ONLY, do not include the room or other furniture.
Subject: one clean rectangular horizontal conference table, warm honey oak tabletop, subtle pixel wood grain, dark charcoal metal legs. A single restrained mint-green inlay running horizontally through the center may retain the original palette, but never repeat the four stripes or show four joined panels. The top is one unbroken surface with no seams between separate tables.
Camera/style: orthographic front-facing RPG furniture view from above, matching the front-facing desks in the screenshot, horizontal top and bottom edges, vertical legs, no diagonal isometric rotation. Crisp readable pixel art, hard pixels, dark brown outline, simple stepped highlights, limited warm oak and teal palette. The tabletop must be much deeper than Image 1 so people can sit across from each other.
Composition/geometry: landscape canvas aspect 16:9 (prefer 1024x576). Target game canvas is 256x144. At game scale the visible table silhouette should occupy x=22..234 and y=28..133: about 212 wide and 105 tall. Broad tabletop occupies about y=28..102; front apron about 8 pixels thick; two dark front metal legs descend to y=133, with rear supports if visible. Large top surface, relatively short legs. Leave transparent safety margins all around. Complete table fully visible, centered horizontally, slightly below vertical center.
Background: actual alpha transparency, including spaces between the legs. No opaque background, no checkerboard drawn into the pixels, no floor or cast ground shadow.
Constraints: output exactly ONE isolated table, no chairs, no laptop, no people, no objects on the tabletop, no room, no grid, no text, no logos. Do not output a sprite sheet or multiple views. This will be placed at the existing table position as a single editable object.

## Side prompt

Use case: precise-object-edit
Asset: directional variant of the SAME single conference table furniture sprite in the reference.
Change ONLY the orientation: show the same table rotated 90 degrees on the FLOOR so its LONG AXIS runs from the top to the bottom of the picture. Keep the game camera fixed at the SAME elevated front-facing orthographic RPG view. This is the narrow END VIEW of the same long table: the near short edge is horizontal, the long left and right edges run vertically back. The charcoal metal legs still point DOWN on screen (never sideways). Show two short front legs underneath the near short edge. One mint inlay runs lengthwise from far end to near end along the tabletop center, like the reference's single stripe.
Keep honey oak colors, subtle hard pixel wood grain, dark outline, mint-white trim and dark metal legs, same high angle, broad single seamless tabletop, same crisp game sprite style.
Canvas portrait 9:16, full isolated object with safety padding and ACTUAL alpha transparent background, including between the legs. At game size this sprite will occupy a 144x256 canvas, with visible silhouette about 105x212. Tabletop takes most height, front legs short. Exactly one table, no room, no objects, no chairs, no floor/shadow, no labels, no multiple views, no checkerboard pixels.
