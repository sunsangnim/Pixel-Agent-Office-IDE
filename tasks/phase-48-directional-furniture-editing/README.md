# Phase 48 — Directional furniture editing

Furniture rotation uses four cardinal-view assets instead of rotating the bitmap. Editing remains permissive while collisions are shown as a red selection outline.

## Acceptance criteria

- Right-clicking selected furniture cycles front, right, back, and left.
- Rotation buttons and Q/E rotation shortcuts are absent.
- Direction changes swap texture and footprint without applying image angle.
- The front direction always uses the approved standalone source asset to prevent quadrant bleed or clipping.
- Floor textures render at 2× tile scale to reduce high-frequency visual noise.
- The faulty combined conference-table/chair asset is replaced by an independent long table and stackable non-colliding laptop.
- Wall/furniture overlap does not block editing and renders a red outline.
- Leaving edit mode sanitizes invalid placements.
