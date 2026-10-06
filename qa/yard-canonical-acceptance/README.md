# Readiness correction with bounded evidence reuse

This follow-up changes acceptance code only, on exact parent
`4591a151a22503374999dfd5b207b38c4bf631e5`, tree
`6e8fcefa68a12f364f2d4ab0c39377547887e225`.

Run37487170407 passed190 source tests,9 PostgreSQL tests and both production builds,
then failed before browser startup on the server cwd. Run37489937106 repeated those
passes, opened the actual authenticated browser and captured the current HUD, then
stopped because the harness expected a deliberately hidden status indicator to be
visible. Neither run established canonical dynamic browser acceptance.

Boot and reload now require the real authenticated snapshot for the fixture,
known mutable canonical state, the ready class's presence, a visible Yard and its
live legacy scene. The status indicator can remain hidden as the UI intends.
The selector audit also uses the existing explicit Place action and waits for
modal open/close, ghost presentation and committed rendered rows. No product,
asset, store mutation hook or success-response substitution is introduced.

Preflight verifies exact parent identity, exact changed-file seal and a SHA256
of every protected Git tree entry. Only this harness/workflow may change. That
fingerprint matches both previous runs. The committed reused-proof.json retains
their original receipts, raw evidence-file hashes, test totals and default-build
closure/budget summary; original browser failures remain labelled failures.

The next single10-minute job runs fresh dependency setup, no-launch path/readiness/
DB-guard checks, a fresh preview production `pnpm run build` and every existing
asset/startup/worker closure and budget gate, then the unchanged full real
Express/auth/PostgreSQL/UI/outbox/dynamic-browser/viewport evidence flow. It reuses
only the190 unchanged source tests,9 unchanged multi-process PostgreSQL tests and
default-off build proof. PostgreSQL15 still starts fresh for actual browser API
persistence. Preview build and browser are never reused.

Checkout depth2 is sufficient because this job's selected checks need only the
current commit and exact4591 parent. Historical4660 compatibility tests are covered
by the pinned prior receipts, so no extra ancestry is fetched.

After applying and reviewing, run from the repository root:

    node qa/yard-canonical-acceptance/seal.mjs --reviewed-final-source

Commit the exact reviewed changes plus regenerated reviewed-source.json as one
child of4591. Only first creation of `qa/yard-canonical-ready-check-20261006` can
trigger the one job. There is no dispatch, retry, deploy, cache or production
connection. Artifact cap remains8MiB, retained3days. Early HUD and startup-failure
captures remain. Real dynamic motion, subjective visual review and device FPS
are still pending; the fixed world raster remains390×648 at DPR1.
