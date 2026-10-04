# Bubbo: restrained underwater motion and captured release

## Chosen treatment

Three directions were considered:

1. A synchronized floating field makes the geometry look mobile while the actual aim/collision centers remain fixed. Rejected for aiming confidence and visual noise.
2. Continuous rising particles and broad caustic sweeps add atmosphere but compete with the dotted guide and the new small marine motifs. Rejected for this pass.
3. Sparse, local token gestures with brief material reactions. Implemented: one token at a time, rotation around its original center, an occasional small light catch over the existing artwork, then genuine stillness.

Existing mint starfish, amber pufferfish, coral scallop, sky pearl and berry nautilus art is unchanged. There are no new textures, substitute vector token assets, downloaded assets, dependencies, layout regions or geometry overrides. The additional radial light and short water droplets are ephemeral Canvas lighting/feedback, not replacement production art.

### Timing and budget

- Idle: at most one eligible token; 1,600 ms gesture within a 3,600 ms interval, with a maximum 0.028 radian rotation (actual envelope is smaller). Pending and danger rows remain still. Every other gesture can catch a soft upper-left glint.
- Touch/mouse aim, keyboard aim and active flight suppress ambience. Gain reaches exactly zero within 120 ms. The idle return waits for 850 ms quiet, then fades in over 500 ms.
- Hit: 250 ms local water-light ring. Pop: short marine-art swell/fade and two light droplets, with a distance-ordered 35–130 ms cascade. Drop: artwork detaches after 130–220 ms, then travels a short, fading arc over 670 ms.
- Hard descriptor limit: 32, including at most 20 pops and 11 drops plus one impact. New results replace an earlier burst; there is no unbounded emitter or backlog. Cosmetic clock steps cap at 50 ms and never catch up after long interruptions. Gameplay flight/timer math is unchanged.
- Feedback is clipped above the cannon/current/next lane. Reward text gets one 360 ms acknowledgement inside the existing reserved status region; no new floating text covers the board or guide.
- Sampling is deterministic from run seed/wave/idle epoch. Effects never call gameplay RNG or modify the board, hitboxes, aim trace, launch origin, path, pressure, score, rewards or save payloads.

### Lifecycle and accessibility

Pause, blur, hidden state, resize and unmount cancel pointer ownership and discard cosmetic bursts. Paused/hidden fields stop their animation-frame loop; resuming starts with zero elapsed debt. Existing in-flight gameplay is paused and remapped by its unchanged flight helper when appropriate. A run change resets cosmetic state. A live reduced-motion preference change clears active decoration; reduced-motion reactions retain stationary fades and short rings without rotation, travel, scale or stagger. The reserved reward acknowledgement also disables CSS animation.

## Wide-screen outside-release defect

The field already called `setPointerCapture`, so aiming continued beyond its bounds. Its old `pointerup` handler independently required the release coordinates to be inside the canvas, silently cancelling those valid gestures.

A primary gesture that starts inside now owns its release anywhere, using the same existing upward angle clamp, and fires once. It relinquishes capture before launching. A keyboard/Fire-button launch also consumes a held pointer gesture, so a late release cannot fire a second shot after the first flight finishes.

Start outside, secondary/non-primary pointer, foreign release/cancel, pointercancel, lost capture, blur, hidden state, pause, resize and exit never launch. This change is confined to Bubbo; the shared pointer-session utility is untouched.

## Verification

### Executed in the implementation environment

`node --test tests/bubbo-effects.test.js tests/bubbo-field-motion.test.js tests/bubbo.test.js tests/bubbo-controller-recovery.test.js tests/bubbo-recovery-differential.test.js tests/telegram-game-gestures.test.js tests/sceneGeometry.test.js tests/arcade-integration-contracts.test.js`

Result: 82 tests passed, 0 failed. This includes 24 new effect/component-contract cases, unchanged production-controller differential traces, 15,840 seeded analytical aim/collision comparisons, existing engine rules, safe-area geometry, native Telegram swipe ownership and original marine-art hashes. The new component harness executes the actual `BubboField` event handlers and frame loop with deterministic DOM/Canvas contracts; it does not claim browser rendering or physical touch-device validation.

`node --check tests/e2e/bubbo-casual-motion.spec.js` and the scoped `git diff --check` pass.

### Browser / visual QA: authored, not executed here

`tests/e2e/bubbo-casual-motion.spec.js` retains video for every case and attaches real page screenshots plus pointer-event JSON. It includes:

- 320×568, 360×800, 390×844, 414×896, 568×320, 844×390, 768×1024, 1024×768, 1280×720 and extended 393×873, all DPR2;
- trusted captured touch release outside the field and idle/aim/pause/resume checks;
- dedicated 1280×720 mouse and touch sequences: cancel, bomb and lightning, real shot resolution, bounded effect diagnostics, reward feedback and trusted outside-release evidence;
- live reduced-motion change, resize during capture, explicit blur interruption and return to the catalogue (Bubbo remains paused/inert in the cache, not unmounted).

A separate native background-tab test records actual visibility events. If Chromium does not deliver `document.hidden`, that case is explicitly skipped, not passed; if delivered, it asserts pause, released capture and no shot on the subsequent touch release. Functional hidden-state and unmount behavior are also covered explicitly by the component contract tests. No synthetic blur or touchcancel is used to claim a native hidden-state pass.

Suggested CI command: `pnpm exec playwright test tests/e2e/bubbo-casual-motion.spec.js tests/e2e/bubbo-marine-art.spec.js --project=chromium --workers=1`. Retain `test-results`, screenshots, WebM videos and the Playwright report. Root integration owns CI/package/workflow changes.

Local dependency installation was blocked by network policy. Therefore full build, browser execution, video review and physical Telegram WebView acceptance remain pending. Review the videos independently of functional pass/fail, looking for subtle non-synchronous sway, calm aiming, legible marine motifs, unobscured guide/cannon and a readable hit → pop → drop hierarchy. Passing assertions alone do not establish top-tier visual quality.

## CI3 observation-race correction (2026-10-04)

[CI run 37162250609](https://github.com/Le-Who/CC-GH/actions/runs/37162250609), PR head `995d2d2e68cbd4e12c33e35073a5e1d020bd979c`, completed with two failed Bubbo wide-screen checks. The shot/capture assertions succeeded; sequential observation of the short FX/reward windows failed. This is not recorded as an all-green browser run.

The retained retry traces directly establish the burst observation race:

- Mouse: `call@82` reads `shots=1, effects=3` at monotonic 1084670.260 ms. The snapshot at 1084681.278 ms already has `effects=0`.
- Touch: `call@84` reads `shots=1, effects=3` at 1124311.078 ms. Its snapshot at 1124313.427 ms has `effects=0`.
- Both result snapshots contain the actual `Bomb +100` reward node. Inspected screencast frames also show the painted burst rings and visible reward; the reaction was not missing.
- Initial/retry2 failures asked for the reward only after awaiting a full-page DPR2 screenshot. This ordering can consume the natural 1800 ms reward TTL. First-attempt traces were not retained, so no exact screenshot-duration claim is made.

The correction changes tests only. `tests/e2e/helpers/bubboMotionObservation.js` installs a read-only MutationObserver before release. It atomically retains the first matching result frame, peak effect count, and visibility/text/bounds of the new reward node. A previous reward still within its TTL cannot satisfy a subsequent shot. Effects must be present in the first result frame, and the budget, positive feedback, exact one-shot count, cancellation and trusted outside-release contracts remain in force. Runtime TTLs, motion timing, clocks, gestures and game state are unchanged. The later full-page capture is accurately labelled “after-shot”; always-on video retains the real sequence.

Five added native tests cover delayed reads after burst/TTL expiry, stale reward rejection, missing/invisible/offscreen feedback, wrong shot/hidden document, bounded history and observer cleanup. The expanded local command, adding `tests/bubbo-motion-observation.test.js` to the earlier list, passes 87 tests with no failures. Browser helper/spec syntax and scoped diff checks pass. A fresh CI browser run and final video review are still required for this correction.
