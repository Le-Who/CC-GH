# Fresh render-failure and UI acceptance

Base:720dd25ec1e326a5cd50ce986c4bb48373a796c8, tree
9f41d167920bcfc57af9a17b4d144bed8ccb3a0d. This packet changes only the
acceptance harness/workflow. Integrate the separately reviewed final UI, renderer,
menu/surface/shadow and diagnostic source packet before sealing the full delta.

Run37493090357 reached the actual authenticated New Yard and rendered R1 using
Chromium145/WebGL2/ANGLE SwiftShader. It then returned to the legacy scene while
preparing the first ghost. The original product cause remains unknown; passing
Node/Three/no-op-GL tests does not establish shader or browser correctness.

The browser retains its exact owner snapshot, including lastFailure operation,
stack, ghost, viewport and pre-retirement renderer details, before closing the
context. It captures at most48 recent console warnings/errors,2048 text characters
each. Initial New Yard pixels/owner state and both startup/main failure evidence
remain. Observing duplicate-response rejection suppresses a secondary unhandled
rejection without changing the promise awaited by the main flow. Strict ghost,
placement/outbox, dynamic motion and viewport assertions remain intact.

Product/HUD/shadow changes invalidate the former blanket source/default-build
reuse. This job freshly runs affected source/UI/renderer checks (including the
actual-Three scene regression), the existing9-case PostgreSQL CAS/receipt pass,
both real NODE_ENV=production default-off/preview-on builds with all current
asset/startup/worker closure and budget gates, then the full real auth/API/DB/UI
browser acceptance. It does not run an old full-family native-render suite.
Historical reused-proof.json remains historical and is not read or credited.

One standard runner, PostgreSQL15,10-minute hard job limit, zero retries,
8MiB maximum artifact retained3days. Checkout depth6 is required now because the
fresh compatibility source tests again use4660: new→720→4591→c0→592→4660.
No limits are raised, no browser flags change, no deploy/cache/production target
is added. Actual browser/WebGL backend is recorded; device FPS remains unmeasured.

After exact final source review, from the integration repository root:

    node qa/yard-canonical-acceptance/seal.mjs --reviewed-final-source

Commit that manifest with exactly the reviewed delta, as one child of720.
Only first creation of qa/yard-canonical-render-diagnostics-20261006 triggers
the single job. No publication or dispatch was performed while preparing this
packet. Existing failed-run artifacts are preserved unchanged. No placement fix,
dynamic clip or subjective visual acceptance is claimed before real browser proof.
