# Phase 49 — Office interaction fixes

Seven reported bugs in the live Phaser office, all rooted in a small set of
shared causes: pathfinding treated a destination's own furniture footprint
as unreachable, character seating referenced a static desk layout instead of
the live (editable) one, a `depth` override parameter was silently discarded,
and two decorative elements (elevator door, top wall band) didn't line up
with the wall they were supposed to sit in. A follow-up round then covered
the interior editor's own interaction quality (rotation, selection, and
front/back ordering while editing).

## Fixes

1. **Character zigzag while walking** — `findOfficePath` excluded only the
   destination's own collision rect from A* (it's normal to stand inside a
   chair's footprint), and added line-of-sight string-pulling so a clear
   diagonal doesn't get stair-stepped into a left-right shimmy.
2. **Desks moved via the interior editor, characters didn't follow** —
   `routeFor`/`targetPoint` now accept a live desk resolver; `OfficeScene`
   supplies one backed by the actual chair furniture position instead of the
   static `TEAM_DESKS` table.
3. **Sit in the chair while working** — the desk-seeking target is now the
   chair's exact snap point (see #2). Seating depth is occupancy-aware (see
   #9): an empty chair renders in front of the desk like normal furniture,
   and only drops behind the desk (with the actor pinned between them) once
   someone is actually seated.
4. **Team leads not reliably present in working hours** — idle team leads
   (no instance, or instance exited) now resolve through the existing
   rest-rotation instead of a hardcoded `deskIdle`/`offDuty`, and can land on
   desk, pantry, or meeting room. Meeting-bound rest transitions also route
   through `meetingDoor` instead of teleporting straight into the seat.
5. **Elevator door looked wrong** — resized/repositioned to sit flush in the
   decorative wall band (y 26-90) instead of hanging 60px below it in the
   middle of the room; `WAYPOINTS.elevatorInside/elevatorExit` adjusted to
   match.
6. **Chair/desk drifting apart; laptop unclickable under the table** — a
   desk and its own chair no longer collision-check against each other
   (they're meant to sit close together); any forced relocation now spirals
   outward from the intended spot instead of raster-scanning from the map's
   top-left corner; the `depth` parameter passed into `addFurniture` was
   being discarded (`initial.y ?? depth` never falls through) so the
   laptop's explicit above-table depth never applied — now the offset is
   preserved through placement, drag, rotate, and reset.
7. **Top wall looked broken** — the three separate `architecture-wall-surface`
   strips left gaps at the 탕비실/회의실/출입구 boundaries; replaced with one
   continuous strip spanning the full interior width.
8. **Right-click rotation applied to whatever was right-clicked** — it now
   only rotates a piece that is already the current selection; right-clicking
   an unselected piece does nothing (must be left-clicked first).
9. **Editor front/back ordering** — the interior editor now tracks a single
   "frontmost" furniture id, set whenever a piece is selected, dragged,
   rotated, or added from the palette, and left alone when you deselect or
   leave edit mode (it used to snap back to the baked default depth the
   moment you clicked away or hit "편집 완료", which made whatever you'd just
   arranged disappear behind other pieces again). An actually-occupied chair
   still always renders behind its desk regardless of that flag, so the
   seated-character illusion can't be broken by a stale editor selection.
   Furniture hit-testing is also now pixel-perfect (`pixelPerfect: true`),
   because two overlapping pieces previously hit-tested as solid rectangles
   - clicking a fully opaque, clearly-visible part of the desk could
   silently select the chair instead, since the chair (whichever was on top
   at the time) claimed the entire overlapping rectangle even over its own
   transparent pixels.

## Verification

- `npm run typecheck` — pass
- `npm run build` — pass
- `npm run test:integration` — 5/5 pass
- Ran the actual Electron app repeatedly through this phase (`npm run dev`,
  restarted after every change) and iterated directly against user-reported
  screenshots until desk/chair selection, rotation, and front/back ordering
  all matched expectations in and after the interior editor.
