# Inactive canonical Mochi integration

This slice connects the independently authored Mochi source to the actual Yard
server and courtyard renderer. The code-owned `MOCHI_RELEASE_GATE.accepted`
is false. Default server admission and browser asset loading therefore remain
Mika-only. Closed candidates are kept outside the admission registry so even
its strict legacy digest remains unchanged.

## Source-to-runtime path

1. `media/mochi/` contains the reviewed combined source, nonuniform root rows
   and measured sole/body envelopes. `mochi-actor-profile.mjs` owns the 20 Hz,
   0.48-world / 1000 ms hop and 2000/4000 ms turns. No Mika timing is reused.
2. `mochi-media.mjs` validates food, bowl, layout, actor uniqueness and the
   exact new-state target, then adapts the source plan to the canonical server
   fields. A use that would make the toy worn is rejected until worn media
   exists. The complete visit preserves native rest cycles and emits no prop
   transform commit.
3. `yard-media.mjs` dispatches canonical bindings. `service.mjs` consumes it
   for actions, catch-up and public snapshots. Catalog probabilities, prices,
   servings, wear and gift calculations are unchanged. Unknown inventory and
   every unavailable visitor/prop/style remain preserved.
4. `yard-mochi-pack.mjs` copies 49 reviewed atlas pages into the separate
   `/assets/yard-mochi/` namespace and verifies their exact hashes. The manifest
   binds source revision, calibration, ground revision and target still pivot.
5. `mochi-actor-media.mjs` adapts persisted samples to shared courtyard poses.
   `presentation.mjs` validates its target and profile; `scene.mjs` loads it
   only when the release registry permits it. The target still has an explicit
   Mochi source key; other prop images, Mika media and food bindings are intact.
6. All actors use the scene's one atlas cache. An unavailable current frame
   holds the whole canvas. Resize defers destructive backing-store changes
   until a coherent redraw is possible; temporary pointer mapping follows the
   displayed image. No extra canvas or atlas budget is introduced.

## Acceptance evidence and remaining gates

The corrected standalone fixture at commit `b6e0d70` passed ten real Chromium
viewport cases with zero retries. Forty screenshots were inspected; all 120
samples had one target, preserved the other prop, stable canvas/footer bounds
and at least an 8 px opaque margin. This is not full Yard acceptance.

The canonical Node acceptance fixture follows an actual probabilistic
83-minute visit, persistence/reload, native routes and rest, public projection,
album capture/favorite, helper preference and exactly-once gift collection.
Production code never imports that test-only profile override.

The new browser fixture runs the actual shared courtyard scene, production
CSS/background/food layers and canonical media against the real server-built
snapshot. Its twelve isolated cases include the full viewport matrix, closed
gate/no-fetch behavior and interrupted decode plus resize. It still needs an
authorized CI run and screenshot review, followed by multi-actor depth/cache
and final release review. Do not flip the gate based on Node or standalone
fixture success alone.

The target still is kept through the Mochi visit. Its transition back to the
shared standalone prop at visit completion is part of pending shared-scene
visual acceptance. This document does not assert pixel equivalence of
independently lit source renders.

## Rebuild and check

Run `node scripts/yard-mochi-pack.mjs`, then
`node scripts/yard-mochi-canonical-fixture.mjs` after source changes. The latter
creates a self-contained 46-file browser source closure and synthetic snapshot.
No new render, external provider, install or publication is performed.

Run `node --test tests/yard-*.test.mjs` for the focused suite. The broader local
source command is recorded in the handoff manifest and uses the existing
explicit no-network store/dependency substitutes; it is not a React build or
real database test.

Authorized CI command:
`pnpm exec playwright test -c playwright.yard-canonical.config.js --project=chromium --workers=1`

Keep `test-results-yard-canonical/` and `playwright-report-yard-canonical/`.
The server refuses non-CI execution. Its source closure is independent of the
main Playwright test directory and the earlier standalone Mochi fixture.
