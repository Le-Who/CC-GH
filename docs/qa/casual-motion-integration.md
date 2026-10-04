# Casual motion integration

Base: `84d252d4bee6ed75fe8d32c07ebdef4c9270c629`.

This candidate updates Match-3, Bubbo, Blox, Merge Lab, Garden feedback and Trivia. It preserves the current art themes and keeps cosmetic events separate from authoritative game transactions. Yard integration is a separate unfinished candidate and is not included. Settlement is assessed separately; no Settlement redesign is included.

## Verification status

- The final root native run passed 91 tests across the five new files and existing Match-3 controller/scene/economy suites, with zero failures/skips. A separate root run passed 94 checks for Bubbo/Blox/DOM feedback/Merge UI/Garden interaction/Trivia. Counts overlap and must not be summed.
- Additional worker runs and their exact scopes are documented in the game-specific reports. Do not add overlapping counts together.
- Local dependency installation did not complete because network policy denied registry.npmjs.org. Local full build, installed-dependency suites and browser execution remain unverified.
- GitHub test PR is the next gate. A draft PR and green functional tests do not establish motion quality or release readiness.
- Three new browser specs retain real-time videos. Review those videos and screenshots independently for readability, clipping, timing and distracting movement. A skipped native visibility test is not a hidden-state browser pass.

## Safety and acceptance

- Bubbo gestures started inside the field may release outside and fire exactly once. Cancellation, capture loss, pause, blur, hidden state and teardown never fire. Ambient movement is cosmetic and suppressed during aiming or flight.
- Match-3 uses elapsed-time presentation and actual completion for unlocking. Invalid same-cell boosters remain visible. The last move settles before ending; pause and stale callbacks cannot prematurely end or replay a sequence.
- Blox drag cancellation is not a successful placement. Pending responses cannot produce late cosmetics after interruption.
- Reduced motion removes optional travel/scale/rotation, preserving essential state feedback. Visual effects are bounded and cannot alter saved state or rewards.
- Full mobile, landscape, tablet and DPR coverage is required by AGENTS.md. Existing performance budgets are unchanged.

## Design references

- https://web.dev/articles/animations-guide — prefer compositor-friendly transform/opacity for DOM motion; measure other properties.
- https://gameaccessibilityguidelines.com/avoid-any-sudden-unexpected-movement-or-events/ — avoid unnecessary unexpected movement.

The chosen easing, durations and particle counts are design decisions to validate in the game, not benchmark results or universal genre rules.

## First CI findings and follow-up

The first PR run built successfully, but the standard Node suite reported 1181/1184 passes: three Blox recovery guards still required the prior presentation/Promise shape. The follow-up retains exact gameplay parity while explicitly pinning the authorized presentation adapters and lifecycle globals. Negative controls remain enforced.

Three existing Match-3 touch cases also failed all retries. The trace showed the gesture reached scoring and the sync returned HTTP 200, but continuous rendering delayed touch delivery past the unchanged deadline. The follow-up uses event-driven idle/drag rendering, renderless hit regions, fewer per-gem draw layers and clipping only when needed. It does not increase test timeouts or weaken browser assertions.

A root run covering the corrected Match-3 suites and Blox verifier passed 75/75. The performance diagnosis and fix still require a fresh browser CI run and video review before acceptance.

The second CI run passed all 1186 Node tests and the existing touch suite. Its next gate rejected the changed package.json because inactive Yard intentionally pins production entry files. package.json is restored byte-for-byte to the production base; the five additional motion files run in an explicit CI step instead. No Yard isolation hash or guard was relaxed.

## Recorded-motion acceptance findings

CI run 37162250609 completed 282 browser checks successfully, with two Bubbo failures, six flaky Match-3 cases and five skips. Touch, Mochi, standard/motion Node and PostgreSQL gates passed. Trace review separated test observation races (late Bubbo screenshot/polling; transient fixture status; Socket.IO consuming a global seeded RNG) from a real Match-3 presentation defect.

Dense recorded frames showed slow Match-3 phase progression and an approximately 0.84-second empty-board interval. The next candidate removes the capped-delta presentation clock, uses active monotonic time with explicit pause/hidden accounting, keeps dead-board reconciliation nonempty, and limits Match-3-only renderer backing pixels/MSAA. The backing-pixel ceiling is a design choice, not a measured device benchmark; native device-scale PNG and fresh recorded wall-time evidence are required before visual acceptance. Other games' renderer settings and DOM HUD density are preserved.

Test fixtures now observe fast effects before release without extending runtime lifetimes, wait for authenticated fixture snapshots rather than transient socket status, and scope refill RNG to the real scoring input event. Existing score, cascade, reward and input expectations remain enforced. Trivia receives narrow text-wrapping fixes for baseline readability defects; Garden gains an actual scroll-to-end expansion reachability test without changing its layout.
