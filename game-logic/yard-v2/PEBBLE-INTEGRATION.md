# Inactive Pebble and Leaf Pot integration

Pebble has independent golden-puppy geometry, a rig, all four cardinal walks,
eight signed quarter turns, four composed half turns, and one Leaf Pot visit.
The Leaf Pot is the existing open, leaf-wrapped basket with a rope bow and two
flower accents. Its physical bottom is on the ground. No Mika, Mochi or Pip
geometry, pixels, stride timing or foot envelopes are substituted.

## Source and physical evidence

- Source: `yard-pebble-source-20261003-r1/pebble-source.blend`, with five editable
  saved actions and a self-contained generator, solver, material and lighting files
- Native sampling: 50 ms / 20 fps; 0.40 world units per 1,000 ms cycle
- Quarter turns: 2,400 ms; half turns reuse two exact quarter turns
- Composite: 17,800 ms; approach, sniff, backward withdrawal, sit, breathe, rise,
  two planted quarter turns and an opposite-facing departure
- Composite entry `[-0.4,0,0]`, facing 0; exit `[-0.4,0,0]`, facing 4
- Seated rest loop `[9000,10600)` ms, 32 rows. Stored frames 180 and 212 have
  byte-identical decoded pixels and zero measured mesh difference
- Every native interaction key has exact evaluated sole/floor and basket-mesh
  clearance checks. No intersecting solid triangles were found in 357 samples
- Saved Blender actions were independently played back without applying the
  solver; their root and bone endpoints agree with the exact source keys
- This is source-key geometry evidence, not a force simulation or an assertion
  that arbitrary Blender subframe interpolation preserves planted soles

Shared courtyard camera direction and light calibration are intentionally reused.
The puppy and basket remain independently authored geometry. The renderer uses a
separate static parent to subtract each actual walk root, then checks the root
again after rendering. It does not translate an already moving raster twice.

## Canonical pipeline

`pebble-media.mjs` adapts the real source through `composite-visitor.mjs` and
`source-owned-routes.mjs`. The reusable route wrapper uses an explicit cardinal
coordinate transform for entry/exit facing and indexes turns with source cadence.
It leaves the older Mika and Mochi adapters unchanged.

The normal server dispatcher now knows the source, while release admission stays
closed. The trusted test-only profile selects a real 92-minute probabilistic
visit, spends one serving and one prop use, persists native rest cycles and
produces exactly one server-owned gift. Album, helper, replay and inventory
behavior use the existing canonical services. Purchase, placement and repair
remain binding-gated and use the original catalog prices.

`composite-visitor-media.mjs` validates identity, source hashes, camera, pivot,
page coverage, target state and timing. The shared scene owns the only atlas
cache. The presenter requests the next actual page boundary rather than assuming
one fixed time step. Source-owned static props use `entry.propBindings`; the
basket remains at the same world anchor before, during and after its composite.
The unrelated mouse remains a separate owner. A pending page holds the existing
canvas through a resize until a coherent redraw is possible.

The pack has 821 stored frames, 55 lossless WebP atlas pages and one prop still,
22,579,934 compressed media bytes. Each page has at most 16 frames. Three maximum
Pebble pages use 16.5 MiB decoded, within the shared three-page / 64 MiB budget.
Frames have at least 18 source pixels of alpha margin. Runtime pages are demand
loaded; no full animation sequence is decoded eagerly.

## Gates and remaining work

`PEBBLE_RELEASE_GATE.accepted` and its default profile readiness are false.
Default admission remains exactly Mika-only, and closed scenes fetch no Pebble
media. Unavailable visitors, inventory, styles and props are preserved.

The twelve-case browser fixture has not yet run locally or in CI. It uses the
actual shared scene and a deterministic, synthetic server snapshot, including a
second visible mouse. Its full viewport matrix, one DPR2 viewport, closed-gate
case and delayed-decode/resize case must pass authorized CI with actual screenshot
review. General mixed-actor depth/cache acceptance and final release review also
remain pending. Mika's existing rejection of newly introduced prop types is a
known mixed-yard gate; it is not bypassed in this slice.

## Validation and rebuilding

The source test run passes 431 tests with zero failures or skips. It uses the
existing explicit inventory/store substitutes; it is not a Vite build, real DB
or browser result. The saved source and pixel audit JSON files distinguish actual
rendered evidence from pure control-flow tests.

Run `scripts/yard-pebble-pack.mjs` in the r5 source tree, then
`scripts/yard-pebble-canonical-fixture.mjs`. The fixture generator creates a fresh
player with a fixed synthetic ID, time, inventories and placements. It reads no
real player database or account. Its local media links avoid redundant copies.

Authorized browser command:
`pnpm exec playwright test -c playwright.yard-pebble.config.js --project=chromium --workers=1`

Reports: `test-results-yard-pebble/` and `playwright-report-yard-pebble/`.
The dedicated server refuses non-GitHub-Actions execution. No local browser or
socket route was attempted. Root remains the only publisher.
