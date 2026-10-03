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
