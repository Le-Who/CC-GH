# Durable coding contracts

## State and economy

Preserve server-action, save, inventory, shared-currency, visit, schema-version, and retry contracts, plus currently agreed compatibility requirements. Storage fixes must preserve prices, starting resources, and single-award behavior. Balance changes require an actual balance task.

## HUD/Pixi layout

The shared layout system owns viewport/orientation profiles, safe areas, playfield reserves, editor persistence, repository defaults, export/import, and validation. Games retain custom composition, animation, flow layouts, and Pixi-native surfaces; `HudRegion` is one integration option, not a universal renderer.

Register layout-, safe-area-, dock-, reserve-, or pre-deploy-positioning regions, or document intentional exceptions. Put cross-surface spacing in layout defaults/profiles. Game-internal geometry constants are acceptable when they do not control those contracts or editor-tunable placement.

Expose pre-deploy-tunable position, scale, opacity, rotation, and visibility through asset-capable regions, or document why the asset is fixed. Expose authored gameplay anchors through coordinate-space regions and custom adapters when the editor is their calibration tool. Keep the coordinate system explicit and convert drag deltas into source coordinates before storing overrides.

Pixi consumes safe/reserve values through scene state or a clear adapter rather than unrelated DOM measurements when avoidable. Tunable Pixi art uses the shared asset adapter or a documented custom adapter. New layout modes and edit primitives extend shared capabilities instead of introducing per-scene debug handles or bypasses.

New visible games provide base layout defaults; semantic orientation profiles or a documented fallback; region registrations/adapters; a meaningful asset-capable region for tunable art or a documented exception; coordinate-space regions for editor-tuned anchors; and validation tests. Portrait and landscape are separate compositions; tablet orientations may need separate defaults.

## Editor isolation

The HUD editor is pre-deploy/debug tooling. Production players must not receive local overrides. Browser exports must neither write source files nor affect other users. Server writes or shared persistence require explicit dev/admin authorization.
