# Finite native HUD scroll qualification

One first-attempt push on `qa/yard-canonical-scroll-hud-20261006`, one ordinary
Ubuntu 24.04 job, ten-minute limit, PostgreSQL 15 on the existing guarded local
credentials. No deployment, secrets, cache or retries. Evidence is capped at
8 MiB and retained for three days. The existing API listener expires at 240 seconds;
Playwright remains bounded to 220 seconds globally, with a 200-second HUD test.

The real application receives fresh default and preview production builds:
`NODE_ENV=production VITE_YARD_PIP_PREVIEW=false/true VITE_BUILD_ID=<current head>
pnpm run build`. Both run every existing startup, asset closure and performance cap.
The native browser uses the final production preview through the real Express,
auth and PostgreSQL bridge. The production canonical flag remains false; only the
existing hash-guarded disposable test loader enables it inside the test process.

Fresh exhaustive native sizes cover the complete required matrix: 320x568 EN,
360x800 RU, 390x844 DPR2 RU, 414x896 RU, 568x320 EN/RU, 844x390 RU,
768x1024 EN, 1024x768 RU and 1280x720 EN, plus extended 375x812 EN. These
are eleven fresh tuples. Phone/tablet contexts use mobile/touch; desktop disables
both. DPR3 remains historical. Inventory, Placed and Shop are exhaustive at every
tuple, with Food/Guests additionally covered at compact EN/RU. Per-tuple and
total HUD elapsed time are recorded. The prior run spent 69 seconds in the browser
step (including acquisition), 76 seconds building, and 236 seconds for the full job;
this supports trying all eleven in the unchanged 220-second global browser cap.
Every scene must be ready and unblocked at the unchanged 280x192 minimum. Stage,
header, dock, tabs and fixed footer controls retain simultaneous viewport bounds,
44px practical targets and text clipping checks. Dialog header/tabs/footer must also
pass actual hit testing, with enabled controls passing Playwright trial clicks.

The shared pre-action helper records its initial observation before any assertion
and uses the same admission as the exhaustive walk, so fixed controls cannot be
scrolled into reach before the audit sees them. Failure observations remain in
browser.json. Only controls inside the real `.cy-dialog > .cy-panel` may start outside its visible
area. Every actual button, select and input is visited, including the full remodel
list. An offscreen target needs the declared user-scrollable axis and a real scroll
range. The test scrolls that actual element into view and records its before/after
rectangle, clipping ancestor bounds, scroll positions, center hit and trial result.
The entire target must then fit inside every clipping ancestor and the viewport.
Overlays, missing or hidden scrolling, clipped labels, or scrolling the page or an
undeclared ancestor to rescue a control all fail. Disabled economy controls remain
disabled and receive full geometry and hit checks. There is no requirement that
all intentional scroll content be visible simultaneously.

Inventory, Place/Cancel, all placed actions and Shop controls are checked. At
568x320 EN/RU, Food and Guests also receive the exhaustive content walk, including
visits, album and helper controls, plus real focus and normal dialog closing.
Before/after observations survive failures in browser.json; original failed run
artifacts are untouched. Fixed footer clipping still fails independently of the
scroll-content rule. Screenshots are current native captures; no clips are repeated.
The garden raster remains 390x648 DPR1 and this is not a device-FPS benchmark.

Reuse is explicit: 770a/run37513128014 passed all four native acquisition cases,
62 source checks and both builds, but failed HUD qualification. Its genuine debit,
receipt, same-nonce native IndexedDB recovery, old-domain quarantine/remount,
placement lifecycle and insufficient-funds results are retained as prior proof.
No wallet scenario is repeated here. The whole tracked product/dependency/asset
tree must be identical apart from the four exact reviewed layout files; purchase,
outbox, auth and backend code cannot change. The prior nine production-domain
PostgreSQL checks and db044 dynamic clips/full eleven-tuple history remain labelled
with their original runs and hashes. This does not turn prior HUD failures into a
fresh full-matrix pass.

The 480x194 compact stage observation assumes zero extra safe-area inset. Extra
Telegram insets, subjective visual acceptance, and physical device performance
remain separate qualifications. Checkout depth two is sufficient because this fresh
lane does not execute historical-service tests. The installed Playwright 1.58.2 path
audit resolves the API entry, selected HUD spec, outputs and build paths without
launching anything. After reviewing the final integrated files, run
`node qa/yard-canonical-acceptance/seal.mjs --reviewed-final-source` before committing.
