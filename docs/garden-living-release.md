# Garden Living R3 source integration

Status: isolated release-source candidate, not a production release. Baseline:
`47519ad79796f4b3dfefd2a5f1bfb73cb08a6e86`. No dependencies were added.

## Runtime dependency closure

- `GardenShelfGame.tsx` mounts the new `GardenPresentation.tsx` through the real
  `GameProvider`, `GardenI18nProvider`, and `useGameHub` action transport.
- `GardenPresentation.tsx` uses `gardenComposition.js`, `gardenInteraction.js`,
  `gardenHostLayout.js`, `garden-presentation.css`, and the existing Garden
  constants, events, sprites, language, state, and interval helpers.
- `living/living-plant-art.mjs` imports exactly `plant-stage-profiles.mjs`,
  `plant-profiles.mjs`, `plant-motion.mjs`, and
  `plant-presentation-contract.mjs`. No proof/demo entry point is shipped.
- Two shared source helpers are required: `src/app/useDialogFocus.js` and
  `src/app/dialogFocus.js`. Existing `useDismissableLayer.js`, HUD runtime,
  audio manager, React, React DOM, and lucide-react remain their dependencies.
- `src/app/hud-layout/defaultLayouts/garden.json` is the recovered complete
  Garden v2 layout, including the previously omitted `gardenComposition`
  numeric defaults and all seven semantic orientation profiles. Only the six
  missing Garden registry entries are added to the shared registry.
- Runtime assets: 56 individual plant WebP files under `/games/garden-living/`
  and 10 UI WebP files under `/games/garden-v2/`. The pre-existing
  `/games/garden-shelf/assets_transparent.png` remains the unchanged fallback.
  Superseded lavender seedling R1 and source PNG artwork are not added.

The Garden defaults and registry were recovered from bounded literal data in
the verified R3 preview bundle because its source excerpt omitted them. The
application bundle itself, preview host, fake backend, fixture state,
request-policy, launcher, and preview-only safe-area overrides are not used.

### Asset build and cache contract

The new WebP files are already encoded runtime exports and intentionally use
direct public paths. `loadAssetPipelineEntries()` continues to collect the
legacy Garden PNG inputs only. Its output and cleanup are confined to
`public/assets-runtime`, so it neither re-encodes nor prunes these 66 new files.
Vite's default public-directory copy preserves their bytes and relative paths;
the production static handler and `/games/` service-worker runtime-art rule
serve them without a preview manifest or request policy. The existing generated
legacy Garden manifest entries remain valid; the new paths do not appear in it.

No pixel or filename hash change is expected from `assets:build` for these new
files. The production CacheFirst rule retains `/games/` art for up to a year:
treat these paths as immutable. Future visual changes must use new revisioned
filenames or a new directory, including the UI WebP files, rather than replacing
bytes at an already-published URL. Full CI must compare copied dist asset hashes
against the source manifest as well as checking HTTP fetches.

## Production integration adaptations

1. `gardenHostLayout.js` is an intentional, Garden-scoped custom adapter. It
   applies HUD-owned reserve, columns, gaps, and padding to the real Hub while
   Garden is mounted, then restores its changes. The host consumes safe areas
   and the dock reserve once. Garden measures the remaining local frame.
   The dock is positioned within the real Hub, including its desktop width.
2. Composition rejects non-finite measurements/overrides and keeps transient
   near-zero sizes from producing negative plant slots. Normal R3 geometry is
   preserved. `gardenComposition` also has a semantic data-region marker.
3. A body-level Garden modal inerts the underlying Hub as well as containing
   dialog focus, with reference-counted restoration. The shared focus helpers
   themselves are unchanged from their recovered source.

These source integration adaptations were not part of the prior standalone
Windows preview runs and still require the full production-host browser pass.

## Layout registration and intentional exceptions

- `gardenRoot`, `gardenStatusRail`, `gardenShelf`, and `gardenComposition` use a
  measured local-flow adapter rather than moving gameplay targets with art.
- `gardenBackgroundAsset` and `gardenSignAsset` are meaningful editable visual
  asset regions. Code-owned text and control geometry do not scale with them.
- `gardenShelfAsset` is a registered asset-capable custom exception: every
  shelf repeats the same fixed-aspect decorative plank at its flow anchor.
  It is intentionally not freely draggable/resizable. The HUD regression test
  checks this one exception explicitly and retains the general freeform rule.
- `gardenSheet` and `gardenQuestSheet` identify the bounded modal flow. Dialog
  controls and the single scrolling body stay at natural scale. Existing R3
  modal CSS owns its fixed maximum width; arbitrary editor modal transforms
  are intentionally not applied to the gameplay surface.
- No map-coordinate anchors, localStorage editor exports, or new production
  editor permissions are introduced. Existing HUD override gating is retained.

## State and economy boundary

All server routes, authentication, request receipts, action transport, database
code, save schema, and `game-logic/` files remain byte-identical to the baseline.
Plant constants, phase durations, costs, production rates, unlocks, and rewards
are unchanged. R3 rendering only observes plant identity, phase, and confirmed
watering changes; loading an old save does not replay growth/watering rewards.

The recovered `GameContext.tsx` includes one existing three-line quest-credit
correction: after a successful direct quest reward credit,
`syncedEarnedRef.current += goldReward` acknowledges that credit so the passive
earnings effect cannot send the same reward again. This is the only change to
that state module. Its live-server and interrupted-request behavior must be
included in integration QA.

This existing R3 accounting correction is delivered as a separate
`garden-quest-credit.patch`, not silently included in the presentation overlay.
The isolated combined source tree contains it so the recovered R3 behavior can
be reviewed. Apply it only as a deliberate integration decision.

### Known inherited accounting risks, not resolved by presentation work

The current tests do not establish crash-safe atomic purchases or exactly-once
Garden rewards. Three baseline mechanisms remain hazardous:

1. The passive-earned effect calls `commitGoldDelta(..., 'earned')` without
   awaiting success and immediately advances `syncedEarnedRef`. A failed credit
   can be treated as acknowledged and never retried, even though local cumulative
   earnings and the saved Garden state have advanced.
2. Buying, upgrading, selling, and claiming first mutate shared gold separately
   from the Garden state. State sync can be delayed 2500ms and its unmount flush
   is best-effort. A crash after debit but before sync can lose the acquired
   plant; after quest credit but before claim-state sync it can permit re-credit.
3. `GardenShelfGame` calls `performAction` directly without `clientActionId`.
   Its `key` is only a local request gate. The server receipt API exists but is
   bypassed for these requests. Retrying a lost-response credit/debit can repeat
   its economic effect. The durable-action helper is not used by this wrapper.

The live cross-device purchase test waits for successful `garden.sync`, so it
does not exercise the crash window. The live receipt test supplies an explicit
ID itself, proving the server API contract only. Routed repeated-click and
request-failure tests likewise do not prove transactional guarantees.

Proposed separate accounting regression scenarios:

- Fail an `earned` credit after observing a positive local delta, restore
  networking, then reload: require the missing credit to be recovered once
- Let the server apply a purchase debit, interrupt its response before the
  client creates/syncs the plant, then retry from a fresh device: require either
  a single complete purchase or no economic change
- Apply a quest credit, terminate before the claimed marker syncs, then reopen:
  require the marker and credit to remain consistent without another reward
- Replay the same intended action after a lost response: require one stable
  durable clientActionId across attempts and exactly one receipt

These invariants are expected to fail or remain unproven on the inherited code;
they must not be marked passing through mocks, retries with fresh identities, or
weaker assertions. A bounded remediation should add server-authoritative Garden
mutation commands that atomically update gold, plant/quest state, and receipt;
persist each client intent before sending and retain its ID through retries;
acknowledge earned batches only after confirmed success. Stable receipt IDs alone
do not close the separate debit/state-write window. Keep that work separate from
the presentation release and test lost-response/crash/reload cases explicitly.

## Checks and outstanding release evidence

Run the dependency-free checks with Node 24:

```sh
node scripts/hud-layout-validate.mjs
node --test tests/garden-living-*.test.mjs tests/garden-release-integration.test.js tests/garden-interaction.test.js tests/dialog-focus.test.js tests/hud-layout.test.js
```

The focused tests cover four motion/profile/surface suites, static inventory
thumbnails, all 56 art paths, finite numeric composition, pointer cancellation,
repeated action suppression, modal focus/inert ownership, host cleanup, and
HUD registration. Numeric viewport checks are not visual browser QA.

`tests/e2e/garden-shelf.spec.js` has been migrated to the production `.gs2`
presentation. Obsolete atlas-slot checks are replaced by actual row containment,
non-overlap, minimum touch sizes, fixed close controls, and scrollability checks.
The ten-viewport matrix includes post-30 level-up, Care, quests, shop, dock
separation, screenshots, focus, and tab exit/return. Separate cases retain the
live purchase, two-device shared save, collected/offline/short-pause scenarios
and add receipt replay, static inventory placement, interrupted-request retry,
and living-renderer disposal checks. These are authored CI tests, not a claimed
local Playwright pass. Fixture-backed layout cases invoke the real server action
and receipt functions; the five live-server cases do not intercept player APIs.

The local `pnpm run hud-layout:validate` wrapper attempted an automatic install
preflight and failed before running the script. No dependencies were installed;
the exact validator was run directly with Node instead. Existing
`tests/unit.test.js` cannot load without `express`. Vite, esbuild, React SSR,
Playwright, live-server integration, and the complete aggregate build/test chain
have not run in this environment.

Before release, use the combined production source and installed CI environment:

- Clean full asset/Vite build; check static imports, chunk loading, generated
  service worker, all runtime image responses, fallback image, and console errors
- All nine AGENTS.md viewports: 320x568, 360x800, 390x844, 414x896, 568x320,
  844x390, 768x1024, 1024x768, 1280x720, plus an extended phone such as 393x873
- At least one phone at DPR 2; phone/tablet touch contexts with isMobile and
  hasTouch; real WebView safe areas, orientation, visual viewport and keyboard
- Full-hub header/dock reserves, no horizontal overflow, 44px controls, all
  modal exits and focus restoration, and navigation between the new games
- Old/current saves, offline return, unavailable art/WebGL, reduced motion,
  stage transitions, inventory placement, repeated Care open/close, aborts,
  visibility/blur/pointercancel cleanup, and bounded renderer resources
- Real auth/session/server integration, durable receipt replay, stale snapshots,
  network failure/retry, quest reward exactly once, passive income, level-up,
  and interrupted tab navigation; refresh and verify the persisted result

Historical evidence remains limited: R2 Windows full preview was 16/16 with
223 assertions and 55 PNGs but showed blank inventory thumbnails; R3 focused
preview was 2/2 with 51 assertions and 12 PNGs. Neither is a full rebuild or a
combined production-source/browser pass for this candidate.
