# Genuine Yard player API / store / browser lane

## Scope

This is a bounded integration test lane for the reviewed fail-closed player wiring. It adds no production routes, flags, policy branches, client-store hooks, SQL mocks, or asset remapping. Production source and the normal client build keep `YARD_PLAYER_RELEASE_POLICY.enabled: false`.

The tests start three loopback HTTP processes against the CI disposable PostgreSQL15 service. Each uses the real exported production Express app, authentication middleware, routes, Socket.IO, player lock and database adapter. Only the two active subprocesses receive the existing explicit `--import tests/helpers/yard-player-rollout-test-loader.mjs`; its isolated module substitution is not exposed through HTTP, environment switches in production code, or client queries. The third process uses the unchanged closed policy. All additional actor acceptance gates stay false, and server actor registrations are verified as Mika only.

The unchanged built client selects its actual Yard entry from real snapshots. React, Zustand, IndexedDB, the reliable outbox, authenticated HTTP and Socket.IO are genuine dependencies. The test runtime wrapper binds `127.0.0.1` and initializes the real database/socket components itself; it does not test the production executable's operations/startup timers.

## Covered

At 320×568, 390×844 DPR2, and 568×320, using mobile/touch contexts:

- Ordinary closed accounts stay on the legacy entry, do not migrate, and cannot enable the policy with supplied HTTP fields.
- Paused persistent accounts and future/malformed list/album saves are preserved, mutation-denied, safely rendered read-only, and can return through Home to another game.
- The active process migrates through real authentication/snapshot routes, preserves 105 gifts, 110 photos and opaque fields, and retains one original archive across reads/reloads.
- Collect originates from the actual UI and reliable outbox. Playwright forwards the first request to the real server, then discards only its committed response. The real outbox retries its same nonce; the API confirms a duplicate; the persisted balance, gift ledger and receipt prove exactly one credit. The durable outbox is inspected read-only after acknowledgement.
- Home exit and re-entry exercise the real shell, with no private-store injection.
- Canvas alpha pixels, decoded background and absence of translated scene-error feedback witness actual renderer readiness before collect and after reload/re-entry. This is not a visual-quality judgement.
- Actual requested Mika files are retrieved from the real production static path and compared byte-for-byte with `dist/`. Unaccepted actor media must not be requested; missing media must return non-HTML 404.
- Two independent active HTTP processes concurrently submit one collect intent and converge on one real PostgreSQL receipt. This exercises cross-process contention but does not claim every run forces an OCC retry.

Only generated test identities are touched. Before every fixture load/delete, the exact `dev` identity-to-account mapping is verified. Fixtures are cleaned up after the suite. Database, identity and runtime guards have dependency-free negative tests.

## CI

The independent required `yard-player` job installs locked dependencies, builds the unchanged production client and provides its own disposable PostgreSQL15 service. It has no dependency on the main `test` job or the separate eight-actor candidate job, so an unrelated failure cannot prevent its evidence run. Docker still requires every existing gate plus this job. The normal build must pass first; this lane never raises Workbox, code, media or decoded-memory budgets. Added required steps run the safety contract, install Chromium through Playwright's official installer, and run:

`pnpm exec playwright test --config playwright.yard-player-integration.config.js`

The step requires explicit disposable CI opt-ins, uses one worker, zero retries, a 12-minute suite budget and a 15-minute step budget. The existing bounded-evidence action retains screenshots, traces and JSON results under `test-results/` even on failure. Production test/auth flags are never added to deployment configuration.

## Evidence limits

These tests must actually pass in GitHub CI before being claimed as API/browser/PostgreSQL evidence. Local syntax, safety-contract or modeled tests do not establish that result. Local full execution was unavailable while developing this lane because the supplied dependency tree lacked Express, PostgreSQL client, Vite, React/Zustand and Playwright; no blocked installation was bypassed.

This is focused integration coverage, not a full viewport matrix, source-art acceptance, native-duration animation run, forced failed-write/OCC proof, production authentication review, deployment check, or release approval. Empty native visits may request manifests/stills without requesting actor atlas pages. Existing exact media-delivery, family persistence and native-duration lanes remain separate. Invalid Yard economic fields retain the documented inherited Merge snapshot-validation limitation. Frozen prior long-run evidence keeps its original source identity.
