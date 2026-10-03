# Casual response: Blox, Merge, Garden Shelf, Trivia

Base: `84d252d4bee6ed75fe8d32c07ebdef4c9270c629`.
Status: implemented; native verification passed; **browser execution and visual acceptance pending CI/video review**. Timing values are art-direction hypotheses, not a quality certification.

## Changes

- Blox: 220 ms tile settle and 300 ms completed-line light. Removed the central burst/label and large particle showers. Tap and drag placement use confirmed results. Invalid cells get a brief local mark; cancellation is neutral. Cosmetic track cap 48. No input waits for an animation. Late response guards cover pause, resize, hidden, blur and destroy.
- Production Merge Lab: press response; keyed sample arrival; small inward combine movement; differentiated new/known/no-reaction results; visible valid well target during drag. Drag ghost uses transform rather than layout-position updates. Removed unowned click-suppression timer. Pending breathing is finite. Existing quoted prices, exact command IDs, stock and save logic are unchanged.
- Legacy Merge: narrow safety/feedback pass only. Correct valid/invalid target colors, bounded local result response, no invented level label, reduced-motion support and async/cleanup guards. Empty cells are invalid because the actual route requires two occupied cells.
- Garden Shelf: existing planted/pinned foliage renderer preserved. A confirmed tap gets at most one small existing leaf/coin asset per plant. Repeated taps replace the visual rather than stack particles; acknowledgement timers clear on interruption/unmount. Reduced motion retains the stationary confirmation and hides the travelling icon. Placement/reward opacity/scale accents do not change layout or hit geometry.
- Trivia: short question/answer arrivals; pending selected-answer outline; distinct correct/wrong acknowledgement; trophy settle. Existing controller still exclusively owns timing, scoring, answer lock and Next. No automatic feedback dismissal.
- DOM cosmetic lifecycle helper settles finite animations on blur/hidden/resize and before return; cancels on unmount. Server results arriving behind a modal are settled on close. Existing OS/app reduced-motion rules remain authoritative.

## Files

- `src/game-runtime/scenes/feedbackTrack.js`
- `src/game-runtime/scenes/bloxScene.js`
- `src/game-runtime/scenes/mergeScene.js`
- `src/games/shared/presentationMotion.js`
- `src/games/blox/BloxGame.jsx`
- `src/games/merge/MergeLabView.js`
- `src/games/merge/merge-lab.css`
- `src/games/garden-shelf/GardenPresentation.tsx`
- `src/games/garden-shelf/GardenViewShared.tsx`
- `src/games/garden-shelf/GardenDetail.tsx`
- `src/games/garden-shelf/garden-presentation.css`
- `src/games/trivia/TriviaGame.jsx`
- `src/games/trivia/trivia-presentation.css`
- `recovery-tools/verification/blox/scene-verification.cjs`
- `tests/casual-motion-feedback.test.mjs`
- `tests/blox-casual-motion.test.cjs`
- `tests/e2e/casual-motion.spec.js`
- This report

No shared runtime, pointer-session, package/config, source art, economy, accounting, database or save schema edits in this scope.

## Verification

107 native assertions passed with:

```sh
node --test tests/casual-motion-feedback.test.mjs tests/blox-casual-motion.test.cjs tests/merge-lab-ui.test.mjs tests/garden-release-integration.test.js tests/trivia-release-integration.test.js tests/trivia-controller-v2.test.js tests/garden-living-plant-motion.test.mjs tests/garden-living-plant-surface.test.mjs tests/garden-interaction.test.js
```

The Blox verifier keeps exact initial rendering/full-cell hit-area comparisons across all required viewports, then compares gameplay and static board/drag separately from deliberately redesigned FX. The late-response test drains the full event loop, including cross-VM Promise assimilation, before asserting both positive confirmed feedback and zero stale effects.

Native tests cover 60/120 Hz time equivalence, sprite aspect ratio/alpha, hard particle bounds under 120 repeated additions, reduced-motion zero displacement, finite effect lifetime, interruption cleanup, browser lifecycle listener removal and drop target boundaries. `node --check` passed for the new JS modules and browser specification. `git diff --check` passed.

The broader `tests/blox.test.js` could not load because `express` is unavailable locally. Local full build and browser execution are blocked by dependency availability; they are **not reported as passing**.

## Browser gate and review

```sh
pnpm exec playwright test tests/e2e/casual-motion.spec.js --project=chromium --workers=1
```

The spec records video for every run and attaches screenshots. Four actual integrated games run through the complete required viewport matrix plus 393×873, with mobile touch flags and 2× DPI at 390×844. It exercises confirmed placement/results, rapid answer/tap input, cancellation, pause, blur, reduced motion and return via Home. The configured test backend is used; the spec does not synthesize successful server replies or edit player saves.

Review videos separately for effect timing, naturalness, readability, tiny-phone clipping and feedback overlap. Assertions alone do not establish visual quality. Native scene tests cover hidden/resize/destroy callbacks; real background-tab and orientation interaction should be included in browser review.

## Settlement assessment only

`SettlementSceneCanvas.jsx` already animates villagers, selection rings and construction previews. It uses `performance.now()` directly, frame-based rotation increments, and no reduced-motion branch. Its visibility listener only clears the pointer session. A future narrow presentation-clock/hidden/reduced-motion patch is warranted; no Settlement changes were made in this scope and no broad redesign is recommended.


## CI recovery-guard correction (PR #45)

The first GitHub run built successfully, then exposed outdated preview guards. `verify-blox.cjs` now explicitly permits the exact selected-cell promise adapter and the scene-only `document` lifecycle dependency. The controller differential still compares all gameplay/action/score/optimistic traces; it separately checks the returned placement promise and unchanged receipt for selected-cell success, failure and clear, plus inactive/no-selection behavior.

The subsequent scene AST comparison is retained through `fixtures/casual-motion-ast-adapters.json`: exact reviewed statement order, old preview hashes and new presentation statement hashes are required before normalizing the sanctioned motion/lifecycle rewrite. All unmodified AST content still compares against the immutable preview. Valid-AST negative controls verify that extra calls and changes to input, drawing, effects, cleanup or ordering fail closed. No production code, gameplay/economy baseline hashes or unknown-global checks were relaxed.

The full native recovery/focused check passed 25/25 after this correction (including repeated scene assertions imported by the focused Blox test). Browser visual acceptance remains separate.
