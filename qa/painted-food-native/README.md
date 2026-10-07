# Inactive painted-food adapter and native art QA packet

Native no-deploy CI passed at commit 05d0c43e8639a8efe0d26a2a07f7950541521908 (run 37583190346). No production/ordinary app import changed. The default R2 asset owner and canonical-food-contract.json remain unchanged, including the saved-visit source graph.

## Files to integrate

Copy `overlay/` paths into the exact QA checkout. They are additive only:
- `src/games/companion-yard-v2/pip-prototype/prototype/calibrated-food-painted.mjs`
- `src/games/companion-yard-v2/pip-prototype/assets/food-painted-reference/yard-food-painted-reference.glb`
- `tests/yard-painted-food-renderer.test.mjs`

Copy `qa/painted-food-native/` into the checkout beside `qa/saved-pip-visit/`. The latter is the existing saved-visit qualification packet; its sealed synthetic plan, input projection, actual renderer assets and source hashes are reused read-only. The painted job does not run the saved-visit transaction or depend on its concurrency test passing.

The sole art alias is `art-shim.mjs`, served only from the isolated `https://yard-food-art.invalid` request-interception fixture. It explicitly substitutes the additive owner when the actual renderer dynamically imports its old food module. The ordinary game and saved-visit job still serve the unchanged R2 module. Do not add this alias to app build configuration.

## Exact candidate and measured envelope

GLB SHA256: `122b502fba1bd9e34db0921713bcf9c2e05077fd48472ca52e3dd3204078823f`, 324,808 bytes. The reviewed art now has a 3.14 canonical height envelope, derived from the actual taller ceramic/mounded contents. Its footprint radius stays 3.843 and anchor stays 80/82/0. The previous 2.09 was historical R2 geometry metadata, not an established mouth-contact requirement.

The additive descriptor carries `economicDescriptorId` for the unchanged R2 economic selector, preserving bowl-1, four food state IDs, stock, expiry, placement and replay semantics. This is a preview-only art identity; updating a future production descriptor/source graph is a separate coordinated step.

Independent art review permits the bounded runtime/Pip-lighting test, not final user acceptance. Bonito has tapered thin shavings and an open curled edge; the current candidate remains subject to actual phone recognition, appetite/abundance, glaze, foot contact and Pip muzzle/rim overlap review.

## Source tests and resource policy

11 tests pass in `evidence/node-tests.tap`. They use the actual Three r186 GLTFLoader, real embedded PNG Blob extraction/fetch, geometry and materials. Only browser image decoding is replaced by a documented Node ImageBitmap boundary shim, so they do not claim rendered pixels. The actual browser import graph compiles: 45 modules, zero warnings.

The owner reserves 1,101,156 known CPU bytes, 131,072 RGBA image/decode-staging bytes and 787,128 estimated GPU bytes including old/restored geometry and mipmapped texture overlap. PNG Blob storage and both hash scratch outputs are conservatively included. One 128×128 embedded PNG and one shared texture are strictly verified by dimensions, byte identity and SHA256. All caps stay 64/16/12 MiB.

The texture and decoded bitmap are each disposed/closed once, including late decode cancellation or a parser failure without a returned scene. Concurrent reuse of one loading GLTFLoader is rejected. The existing host intentionally requires full renderer retirement after context loss to fit the unchanged GPU cap; the browser harness obeys that policy rather than trying to restore all old/new surfaces simultaneously.

## CI commands, independent job, no deploy

From the integrated exact checkout, with existing Node 24/frozen dependencies and Chromium:

    node --import ./tests/yard-pip-register-vendor.mjs --test --test-concurrency=1 tests/yard-painted-food-renderer.test.mjs
    YARD_SOURCE_ROOT="$PWD" YARD_ASSET_ROOT="$PWD" YARD_DEPENDENCY_ROOT="$PWD" YARD_OVERLAY_ROOTS='' YARD_SAVED_VISIT_QA="$PWD/qa/saved-pip-visit" node qa/painted-food-native/check-graph.mjs
    YARD_SOURCE_ROOT="$PWD" YARD_ASSET_ROOT="$PWD" YARD_DEPENDENCY_ROOT="$PWD" YARD_OVERLAY_ROOTS='' YARD_SAVED_VISIT_QA="$PWD/qa/saved-pip-visit" YARD_PAINTED_OUTPUT="$RUNNER_TEMP/painted-food-native" node qa/painted-food-native/run-native.mjs

Retain the entire `$RUNNER_TEMP/painted-food-native` directory as its own artifact even on failure. A 10-minute job bound is sufficient for this finite harness. No image publication or app deploy step belongs in the job. It can run independently of data-concurrency checks after the checkout is prepared.

## Native evidence requested

At 320×568, 390×844 DPR2, and 844×390: all four food states with actual Pip R1 geometry, actual shared-depth renderer, source garden camera and lighting. A grounded neutral source pose is rigidly moved beside the bowl for scale/occlusion review; this is explicitly an art pose fixture, not a saved visit path or a certified feeding action. Record PNG states and startup/state-change WebM originals. Verify resource ledger caps, actual WebGL context loss followed by full retirement/recreation, and fresh-owner same-time pixels.

The input snapshots are local, cloned visual fixtures; no player/storage mutation or transaction occurs. The fixture does not reconstruct the app HUD or qualify a full app shell. A higher bowl still requires a future genuine feeding/muzzle-contact check if such gameplay is introduced.

Local Chromium was not retried after the earlier socket denial. GitHub native CI passed: all four states at three viewports; context loss followed by renderer retirement/recreation and fresh-owner pixel equality at the fixed bonito pose only. This does not certify every pose or ordinary game UI. An additional 12-capture probe compared three appearance variants across all four states at 390×844 DPR2. Authored-color-contact is modestly better: warmer ceramic and stronger ground contact while preserving highlights. Coarse native edges remain the dominant gap; final artistic acceptance and feeding contact are still pending.

## Isolated sampling experiment
A subsequent 1.5× comparison keeps the world camera and color/contact settings fixed. Its explicitly named QA-only resource profile permits 20 MiB estimated GPU; production remains 12 MiB. This experiment adds a twelfth source test. Runtime outcome is pending for this sampling change. Repeat, fresh owner, resize roundtrip and retired-context recreation compare the fixed bonito pose.
