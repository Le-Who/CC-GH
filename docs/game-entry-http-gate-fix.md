# Bound image holds in entry browser fixtures

Base: `53e5fbf6b7b774ccf35ade0244dc6690519ea15f`.
Evidence: [Game Hub CI 37179290541](https://github.com/Le-Who/CC-GH/actions/runs/37179290541),
artifact `11294111953`, `entry-http-diagnostic.json`.
Archive SHA-256: `550099619060ffc4e11e9228270499ab86a4606acae0fffacfc894f3b27dc14e`.

## Actual diagnostic result

The isolated diagnostic used Chromium 145.0.7632.6 and the repository's Nunito
400 Latin WOFF2 (16,316 bytes), with ordinary Playwright screenshot/font
readiness. It completed in about two seconds and reports
`hypothesisConfirmed: true`.

- Six HTTP/1.1 image responses held: at server time 907.416 ms, no font or
  status request had reached the server, fonts were loading, and the screenshot
  was pending.
- Release one response at 910.159 ms: the font request arrived at 911.498 ms;
  the ordinary screenshot completed at 935.408 ms while five images remained
  held.
- One response held: the font loaded and the ordinary screenshot completed at
  server time 89.798 ms while that image was still held.

This establishes the HTTP connection-starvation mechanism in a real browser.
It is an isolated transport reproduction, not a claim that the full game-entry
suite has already passed.

## Narrow correction

The original entry test withheld every response under `/games/` and
`/assets-runtime/`, then asked Playwright for a screenshot before releasing
those responses. That could exhaust all browser HTTP connections and prevent
its font-ready wait from completing. It also unintentionally withheld runtime
manifest JSON.

The corrected fixture separates explicit API/chunk gates from artwork gates.
Artwork gates:

- accept actual image extensions only;
- hold at most one image response at a time;
- target the current game's actual backdrop paths, including responsive
  variants and Yard's content-hashed runtime backdrop;
- leave manifests, fonts, remaining images, code and unrelated APIs flowing.

The cold cases assert that a real targeted backdrop request is held and save
its path in a small attachment before taking the same early-frame screenshots.
The rapid case keeps the real Blox backdrop pending through navigation to
Bubbo, Match3 and Garden, then releases that outgoing image and checks the
current screen. Its separate lazy Blox chunk and snapshot holds are preserved.

No application source, rendering, game controller, save behavior, service
worker, screenshot implementation, font readiness or test deadline changes.
No assertion is disabled and no timeout is increased.

## Verification and release boundary

24 focused Node tests pass: browser CI contracts (including image-budget,
manifest/font pass-through and independent API/chunk gates), existing entry
contracts, and existing Home navigation/history contracts. Syntax checks for
all changed JavaScript helpers/specs and `git diff --check` pass.

The final full-game cold/warm/rapid browser suite must pass in the next CI run.
The three changed files from the original entry-proof scope are:

- `tests/e2e/game-entry-flash.spec.js`
- `tests/e2e/helpers/resourceGate.mjs`
- `tests/e2e/helpers/swFixture.mjs`

Their protected provenance needs the explicit reviewed test-harness transition;
this patch does not edit or relax those historical guards.
