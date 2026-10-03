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
