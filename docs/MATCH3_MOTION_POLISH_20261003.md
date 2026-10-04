# Match3 motion polish

This change replaces the frame-held board and independently delayed FX with one presentation timeline. It preserves the existing crystal creatures, library background, authored HUD, board geometry, boosters, scoring, network action queue and production pause-ticker fix. Swap, clear and fall use one representation of each gem; only a dead-board replacement intentionally cross-dissolves two complete boards. No new image generation, source art or runtime art changes are required for this pass.

## Implemented motion contract

All durations are milliseconds. Coordinates are board-cell units until the renderer projects them through the existing Match3 composition. The motion uses monotonic smoothstep easing, 3t² − 2t³, with zero endpoint velocity. It does not use the old abrupt ease-out drop followed by a backward bounce.

| Event | Timing | Appearance and sequence |
| --- | --- | --- |
| Accepted adjacent swap | 150 | Both actual gem images move simultaneously, fully opaque and at their normal size. No stationary copies remain underneath. |
| Invalid swap | 180 | Both gems travel 18% toward the other cell during the first 72 ms, then return during 108 ms. The board and move count stay unchanged. A same-cell rejected booster keeps one visible target. |
| Match clear | 120 for first wave; 112, 104, then minimum 96 | A brief 6.5% lift in scale, then a soft shrink and fade. Existing transparent burst art appears only after 20% of this phase, expands locally and fades completely. At most 18 bursts are pooled. No rings, board shake, full-screen flashes or speculative drag-success particles. |
| Gravity and refill | Per column: min(260, 120 + 50√distance), then 45 landing | All gems in one column share progress and a column duration based on its farthest travel. This preserves vertical order. New gems enter from distinct negative row coordinates and are clipped to the board opening. Landing squash is at most 3.5%; there is no positional bounce. |
| Later cascade waves | Flight speed multiplier max(.88, 1 − .04 × waveIndex) | Later waves are slightly brisker, but a long cascade never opens input early. A phase starts exactly where the previous phase ends. |
| Drop collection | 180 | A collected token lifts by 0.3 cell and fades. Its subsequent backfill is a separate ordered fall phase, including repeated collections in one engine step. |
| Dead-board replacement | 140 | The committed replacement board receives a brief overlapping cross-dissolve with no empty midpoint instead of appearing as an unrelated final-frame jump. |
| Combo | 240 | Existing HUD number receives a small 1.10× pulse on each combo wave above one. The event remains inside the existing HUD lane. No number is baked into art. |

The original frame-count helpers in animation.js remain available for historical recovery consumers. The live Match3 scene and controller no longer depend on their capped timeout.

## Rendering and lifecycle invariants

- The immutable engine outcome is committed once. Motion only presents that outcome; it never reruns matching, scoring, RNG, saving or reward calculation.
- Input locks immediately through a ref as well as React state. Only the current renderer completion ID unlocks it. Stale callbacks and same-frame repeated taps cannot unlock or spend another move.
- Completion clears the descriptor, so a finished move cannot replay after a renderer remount.
- A final classic/drop move presents its entire cascade before match3.end is sent. A zero-move/time save restored after reload is immediately finished from its saved score; it never resumes as an input-enabled run. Pause and Home reentry can suspend that final animation without prematurely ending it. An explicit Finish, New or timed expiry can settle immediately to the committed outcome.
- Manual pause and document-hidden time do not advance the animation. Resume rebases the monotonic clock at the actual boundary, then includes all time up to the first resumed frame. The existing production PixiGameHost stop/start behavior is preserved.
- Resize cancels an active pointer gesture but keeps phase and elapsed time. The same cell-space poses are reprojected into the new layout. Neither animated gems nor remaining stages are discarded.
- Cancellation, blur, hidden, resize and destroy release pointer sessions. Destroy removes the ticker and visibility/media listeners, pooled display objects and masks; it does not submit an action or invoke completion.
- The renderer pools gem containers and burst sprites. Board chrome is rebuilt only when board/selection/composition changes, rather than on every animation frame. Idle and dragging render on demand; only an active timeline runs the application ticker. Hit areas are renderless Containers and the gem batch does not alternate per-gem Graphics shadows with Sprites. Foreground stalls advance the full actual elapsed time, independently of Pixi deltaMS, minFPS or speed. Sprite retyping changes the cached texture in place rather than recreating the actor.
- Refill gems are clipped only while crossing the existing board opening; burst extents stay inside their own cells without an extra masked pass. This is game-internal geometry, not a new HUD/layout region. Composition, safe areas, action targets and editable artwork contracts remain unchanged.

## Reduced motion

The scene subscribes to prefers-reduced-motion. Swap uses a 90 ms stationary crossfade; rejected input remains stationary. Clear lasts 100 ms with opacity only. Refill and collection use 90 ms opacity changes at final cell centers. Bursts, squash, translation and HUD pulses are disabled. Changing the preference mid-move settles the already accepted result exactly once.

## Why the old effects looked discontinuous

Static inspection of production 84d252d4 and its unchanged Match3 files at base 77c1a565 showed:

- moving swap copies faded while the original gems stayed visible;
- frame-held snapshots and independently timed particles had different clocks and overflow handling;
- delayed children were added visibly before their delay elapsed;
- gravity/refill duration expressions saturated at 10/9 frames for every distance;
- static and animated sprite sizing used different formulas;
- refill actors could overlap static final snapshots and neighboring refill actors;
- resize erased FX while retaining unfinished board stages;
- the controller's timeout continued during the production ticker pause;
- special/booster first-step snapshots were captured after later cascades had already mutated the same board;
- multiple Drop-mode backfills were flattened into one simultaneous motion list.

The new engine metadata captures intermediate snapshots and ordered collection/fall subphases. It does not change the resulting board, points, special selection, move rules, booster consumption or save payloads.

## Code boundaries

- src/game-core/match3/motion.js: pure plan construction and pose sampling, independent of Pixi and React.
- src/game-core/match3/engine.js: presentation-only intermediate snapshots and motionPhases.
- src/game-runtime/scenes/match3Scene.js: pooled views, clipping, pointer presentation and lifecycle.
- src/games/match3/Match3Game.jsx: immediate lock, ID-scoped completion, last-move completion and HUD feedback.
- src/games/match3/Match3Presentation.jsx and match3-presentation.css: a small pulse in the existing combo metric.

The shared PixiGameHost has a narrowly scoped Match3-only MSAA/resolution policy at initialization and resize. Native tests execute its actual option/resize blocks and check unchanged settings for every other scene. No Yard, Bubbo, Blox, Merge, shared runtime easing, economy, action queue, asset manifest or layout default was edited by this Match3 work.

## Storyboard reference

This is a textual timing reference, not runtime visual evidence.

1. Idle: each crystal occupies one cell. Touch gives a small selected lift; a swipe previews only the target outline, without a detached cursor ghost.
2. 0–150 ms: two fully opaque crystals trade places. The rest of the board remains still.
3. 150–270 ms: matched crystals brighten through their existing art, rise slightly in scale and collapse with local transparent bursts.
4. From 270 ms: surviving crystals descend; ordered new crystals emerge through the upper board edge. A column settles once, without bouncing upward.
5. Next wave: another match receives the same clear rhythm, slightly faster fall, and a contained combo pulse. Input remains closed until every phase finishes.
6. Invalid gesture: a gentle two-gem nudge out and back over 180 ms, with no move spent.

## Art decision

The six alpha WebP crystal images are 256 pixels high and use distinct shapes. The retained clearBurst is an alpha image, 225 × 230 pixels. These are sufficient for this pass. The older MATCH3_THEMED_ASSET_PROMPT_PACK describes a prior tabletop skin; it must not replace the currently selected library/crystal artwork.

If later visual review specifically requests a more delicate glint, the optional brief is: one separate 256 × 256 RGBA source asset, truly transparent background, centered amber-white crystal highlight with a few emerald tips, soft alpha falloff, no ring, creature, text or baked game state. It should match the existing clearBurst and fire/water crystal lighting, remain legible at 12–24 CSS px, and have at least 16 pixels of transparent edge padding. Do not generate a combined sheet or change normal-gem art. This optional asset has not been generated or integrated.

## Verification and release gate

Locally executed: 69 focused native Node tests covering the engine, controller, same-frame lock, stale completion, final move, 180 composition combinations, all ten viewport hit targets, pure motion, ordered drop phases, zero duplicate gems, no future FX, pause/hidden/resume, resize, teardown, reduced motion and deterministic browser-fixture input. The new pure-motion checks include 50 deterministic seeds for non-crossing column motion and final-snapshot agreement, and 40 seeds for special/drop metadata.

The existing whole-scene frozen animation snapshots intentionally no longer define visual parity. Their replacement retains geometry and input checks and asserts the new presentation contract. Controller comparison still checks gameplay and save/action boundaries while excluding the changed presentation descriptor.

Command:

    node --test tests/match3-motion-fixture.test.js tests/match3-render-budget.test.js tests/match3-motion.test.js tests/match3-scene-recovery.test.js tests/match3-controller-recovery.test.js tests/match3.test.js tests/match3-recovery-differential.test.js

Additional shared contracts: 38 tests passed across arcade asset integration, HUD layout, pointer sessions and scene geometry. game-ux-foundations.test.js could not import React in the partially installed local environment; that is a dependency blocker, not a passing check.

Browser gate prepared at tests/e2e/match3-motion.spec.js. It runs the actual app, Pixi renderer, controller, touch input and production action dispatcher with a fixture player and deterministic refill RNG. It records normal-speed Playwright videos and before/after screenshots. Coverage includes the ten required/extended viewports at DPR 2, invalid swap, a verified two-wave 90-point cascade, pause/Home reentry/resize, reduced motion and the final move.

CI command:

    pnpm exec playwright test tests/e2e/match3-motion.spec.js --project=chromium --workers=1

Keep the Playwright report, test-results directory and .webm files as review artifacts. Browser execution and true 1× visual acceptance are pending CI because local dependency installation is network-blocked. Unit/mock snapshots and this storyboard are not proof of runtime appearance. Do not merge/deploy on this document alone.

## Touch responsiveness regression and correction

The first CI touch run exposed software-WebGL starvation. The production input path accepted the swipe, reduced moves and sent a successful scoring sync; the test timed out because its eight touchMove commands took longer than eight seconds to reach touchEnd. The downloaded trace of run 37160796644, job 111313629360, showed touchStart at 100213 ms, touchEnd at 108448 ms and the request deadline at 108203 ms. The later scoring request received HTTP 200 in about 8 ms.

The correction removes idle continuous rendering, rendered transparent hit quads, alternating per-gem shadow Graphics, and unnecessary permanent mask passes. The existing eight-second assertions are unchanged. A new native regression checks that idle ticks do not render, dragging paints on demand, hit areas do not submit geometry, and active motion starts and stops its ticker. The existing touch suite passed in CI run 37161840011 after this correction. Full recorded motion scenarios and visual acceptance remain pending; native checks do not measure GPU latency.

## Browser-fixture determinism correction

CI run 37162250609 showed six flaky Match3 motion cases. Its traces separated two test-fixture races: the intentionally aborted Socket.IO transport changed the successful snapshot's transient ready status to offline before the test observed it; reconnect jitter/polling timestamps also consumed the global seeded Math.random stream before the scoring tap. In all three phase-count failures, the real sync payload contained score 30 and combo 1, matching the single clear/fall sequence rather than a lost rendered phase.

The fixture now checks the successful HTTP snapshot and exact player identity before using real navigation controls. Refill seeding is armed for the next real canvas pointerup, applied synchronously in capture, and restored on the next event-loop task. Unrelated timers before the tap cannot advance the refill stream. A native reproduction inserts 17 unrelated random calls and verifies the production engine still returns exactly two steps and 90 points, then restores the original generator. The browser assertions still require two clear/fall phases, 90 points, 29 moves and the full viewport/lifecycle contracts. This correction changes test files only; the final clean browser rerun and 1× visual acceptance remain required.

## Real-time motion and active render budget correction

CI3 desktop video exposed an unacceptable recorded slowdown: a roughly one-second cascade stretched over several seconds, and the old reconciliation fade held a near-empty board for about 0.84 seconds. These recordings are evidence about the recorded software-WebGL session, not a physical-device benchmark.

The scene now samples performance.now() through a monotonic active-time clock. Pause/visibility events account for the last active fraction and exclude the entire inactive interval. Neither Pixi's capped/speed-scaled deltaMS nor an extra 80 ms cap is used. A 250 ms foreground frame completes a 180 ms rejection immediately; native regression coverage keeps exact pause/hidden/resume behavior. Reconciliation now overlaps both boards at complementary opacity, leaving artwork in every cell throughout. The pool retains Sprite instances and replaces their textures at phase boundaries; HUD-only phase callbacks leave board chrome intact. Active update/draw work is included in wall time rather than treated as an artificial pause, with a targeted 250 ms update-stall regression.

Match3 alone disables MSAA because its production artwork already has antialiased alpha edges. Its backing buffer is bounded to approximately 1,750,000 pixels (rounding aside), while CSS/world/pointer coordinates are unchanged. This is an explicit design ceiling, not a measured performance guarantee. Full DPR2 is preserved through 430×932 phones (1,603,040 pixels). At 1280×720 the density is approximately 1.378; at 768×1024 it is approximately 1.492. DOM HUD text retains the browser's native DPR. Other games keep their existing renderer settings.

The browser matrix now asserts active wall duration no more than the planned duration plus one 500 ms late-recording-frame allowance, without removing the two clear/fall phase assertions. Before/after screenshots are written explicitly as device-scale PNG files. Additional stable idle screenshots include all normal gems, four specials and three drop tokens at 320×568, 390×844 and 1280×720; canvas density, backing size, device DPR and actual WebGL antialias settings are captured beside them. New videos, native PNG sharpness/edge review, and clean first-attempt browser passes are required before accepting this candidate.

Additional executed contracts after the host change: 37/37 across match3-render-budget, arcade-integration-contracts, HUD layout and sceneGeometry. game-ux-foundations was attempted again and remains blocked locally by the missing React dependency; CI must execute it.

## CI5 fixture-listener ordering correction

Run 37165880810 exposed a second fixture issue: Pixi 8.18.1 registers its own pointerup handler on window in capture mode during renderer initialization. A fixture listener registered on that same target before the test's second tap runs later than Pixi, so its seed was applied after the engine had already resolved the move. The small diagnostics archive contained 31 failing contexts at score 30/combo 1, and one tablet attempt at score 90/combo 2. The latter remains a separate missing-rendered-phase concern, not evidence that the seed fix alone resolves every failure.

The fixture now installs an inactive capture listener with addInitScript before application initialization and only arms it before the scoring tap. Its native regression models both listeners in actual registration order, intervening unrelated RNG calls, synchronous production-engine resolution, and restoration. Pause uses a premeasured static Pause control and an immediate real touchscreen tap, eliminating the fixture's extra RNG-restoration polling and actionability wait between the move and pause; all in-flight lock, pause, resize and Home reentry assertions remain. Score 90 is checked before phase counts so fixture failures are distinguished from presentation failures.

Every Match3 browser case now writes a compact match3-motion-diagnostics.json in afterEach, including seed audit, observed elapsed/wall phases, canvas configuration and production-fixture score/moves/combo even when an assertion fails. This preserves actionable evidence independently of large trace archives. No production logic or phase/score assertion was weakened by this correction. A focused recorded CI rerun is required to resolve the remaining tablet phase concern.
