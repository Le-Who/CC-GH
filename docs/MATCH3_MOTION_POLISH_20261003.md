# Match3 motion polish

This change replaces the frame-held board and independently delayed FX with one presentation timeline. It preserves the existing crystal creatures, library background, authored HUD, board geometry, boosters, scoring, network action queue and production pause-ticker fix. The scene now has one visible representation of each gem. No new image generation, source art, runtime art changes, or shared-scene changes are required for this pass.

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
| Dead-board replacement | 140 | The committed replacement board receives a brief through-transparent crossfade instead of appearing as an unrelated final-frame jump. |
| Combo | 240 | Existing HUD number receives a small 1.10× pulse on each combo wave above one. The event remains inside the existing HUD lane. No number is baked into art. |

The original frame-count helpers in animation.js remain available for historical recovery consumers. The live Match3 scene and controller no longer depend on their capped timeout.

## Rendering and lifecycle invariants

- The immutable engine outcome is committed once. Motion only presents that outcome; it never reruns matching, scoring, RNG, saving or reward calculation.
- Input locks immediately through a ref as well as React state. Only the current renderer completion ID unlocks it. Stale callbacks and same-frame repeated taps cannot unlock or spend another move.
- Completion clears the descriptor, so a finished move cannot replay after a renderer remount.
- A final classic/drop move presents its entire cascade before match3.end is sent. A zero-move/time save restored after reload is immediately finished from its saved score; it never resumes as an input-enabled run. Pause and Home reentry can suspend that final animation without prematurely ending it. An explicit Finish, New or timed expiry can settle immediately to the committed outcome.
- Manual pause and document-hidden time do not advance the animation. Resume rebases the first ticker delta. The existing production PixiGameHost stop/start behavior is preserved.
- Resize cancels an active pointer gesture but keeps phase and elapsed time. The same cell-space poses are reprojected into the new layout. Neither animated gems nor remaining stages are discarded.
- Cancellation, blur, hidden, resize and destroy release pointer sessions. Destroy removes the ticker and visibility/media listeners, pooled display objects and masks; it does not submit an action or invoke completion.
- The renderer pools gem containers and burst sprites. Board chrome is rebuilt only when board/selection/composition changes, rather than on every animation frame. Idle and dragging render on demand; only an active timeline runs the application ticker. Hit areas are renderless Containers and the gem batch does not alternate per-gem Graphics shadows with Sprites. A visible frame advances by at most 80 ms after a long foreground stall; the lock follows that actual presentation clock.
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

No Yard, Bubbo, Blox, Merge, shared runtime easing, PixiGameHost, economy, action queue, asset manifest or layout default was edited by this Match3 work.

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

Locally executed: 60 focused native Node tests covering the engine, controller, same-frame lock, stale completion, final move, 180 composition combinations, all ten viewport hit targets, pure motion, ordered drop phases, zero duplicate gems, no future FX, pause/hidden/resume, resize, teardown and reduced motion. The new pure-motion checks include 50 deterministic seeds for non-crossing column motion and final-snapshot agreement, and 40 seeds for special/drop metadata.

The existing whole-scene frozen animation snapshots intentionally no longer define visual parity. Their replacement retains geometry and input checks and asserts the new presentation contract. Controller comparison still checks gameplay and save/action boundaries while excluding the changed presentation descriptor.

Command:

    node --test tests/match3-motion.test.js tests/match3-scene-recovery.test.js tests/match3-controller-recovery.test.js tests/match3.test.js tests/match3-recovery-differential.test.js

Additional shared contracts: 38 tests passed across arcade asset integration, HUD layout, pointer sessions and scene geometry. game-ux-foundations.test.js could not import React in the partially installed local environment; that is a dependency blocker, not a passing check.

Browser gate prepared at tests/e2e/match3-motion.spec.js. It runs the actual app, Pixi renderer, controller, touch input and production action dispatcher with a fixture player and deterministic refill RNG. It records normal-speed Playwright videos and before/after screenshots. Coverage includes the ten required/extended viewports at DPR 2, invalid swap, a verified two-wave 90-point cascade, pause/Home reentry/resize, reduced motion and the final move.

CI command:

    pnpm exec playwright test tests/e2e/match3-motion.spec.js --project=chromium --workers=1

Keep the Playwright report, test-results directory and .webm files as review artifacts. Browser execution and true 1× visual acceptance are pending CI because local dependency installation is network-blocked. Unit/mock snapshots and this storyboard are not proof of runtime appearance. Do not merge/deploy on this document alone.

## Touch responsiveness regression and correction

The first CI touch run exposed software-WebGL starvation. The production input path accepted the swipe, reduced moves and sent a successful scoring sync; the test timed out because its eight touchMove commands took longer than eight seconds to reach touchEnd. The downloaded trace of run 37160796644, job 111313629360, showed touchStart at 100213 ms, touchEnd at 108448 ms and the request deadline at 108203 ms. The later scoring request received HTTP 200 in about 8 ms.

The correction removes idle continuous rendering, rendered transparent hit quads, alternating per-gem shadow Graphics, and unnecessary permanent mask passes. The existing eight-second assertions are unchanged. A new native regression checks that idle ticks do not render, dragging paints on demand, hit areas do not submit geometry, and active motion starts and stops its ticker. The existing touch suite passed in CI run 37161840011 after this correction. Full recorded motion scenarios and visual acceptance remain pending; native checks do not measure GPU latency.
