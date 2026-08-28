# Phase 49 — Office interaction fixes

- [x] Fix A* pathfinding treating a walkable destination (inside its own
      furniture footprint) as unreachable, plus line-of-sight path smoothing
- [x] Route desk-seeking characters through a live chair-position resolver
      instead of the static TEAM_DESKS table
- [x] Pin seated character depth just behind the desk so it renders in front
- [x] Team leads resolve to desk/pantry/meeting rest states instead of a
      hardcoded desk-only idle, and stay present through working hours even
      after their CLI process exits
- [x] Resize/reposition the elevator door into the wall band; adjust
      elevator waypoints to match
- [x] Exclude a desk/chair pair from colliding with each other; relocate
      collisions outward from the intended spot instead of the map corner
- [x] Preserve the `depth` override through furniture placement, drag,
      rotate, and reset so the laptop stays clickable above the table
- [x] Replace the three-piece top wall band with one continuous strip
- [x] `npm run typecheck`, `npm run build`, `npm run test:integration` pass
