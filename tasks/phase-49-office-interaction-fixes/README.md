# Phase 49 — Office interaction fixes

Seven reported bugs in the live Phaser office, all rooted in a small set of
shared causes: pathfinding treated a destination's own furniture footprint
as unreachable, character seating referenced a static desk layout instead of
the live (editable) one, a `depth` override parameter was silently discarded,
and two decorative elements (elevator door, top wall band) didn't line up
with the wall they were supposed to sit in.

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
   chair's exact snap point (see #2), and the seated character's depth is
   pinned to just behind the desk's depth so the desk front edge occludes it.
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

## Verification

- `npm run typecheck` — pass
- `npm run build` — pass
- `npm run test:integration` — 5/5 pass
- Ran the actual Electron app (`npm run dev`) and confirmed the scene loads
  and hot-reloads without runtime errors through all edits.
