# Garden R2 integration boundary

## Release state

`game-logic/garden-r2/catalog.js` sets `GARDEN_R2_RELEASE_POLICY.enabled` true for the approved rollout. The normal CI and deployment gates still apply to this activation commit. The server advertises availability; an eligible current client recovers legacy intents and checkpoints before sending an explicit durable adoption command. Reads never adopt a save. Client query strings, local storage, HTTP payload fields, and environment variables cannot override the policy. The optional `gardenR2Enabled` route-call parameter remains an internal rollback-test seam and is not accepted by the HTTP handler.

The global player schema remains 11. Adoption preserves the saved Garden `economyVersion` exactly; the separate private `_gardenProgression.version = 1` owns the new contract. Do not route an adopted save through the old reset or earned-credit paths, including during rollout rollback.

## Authority and migration

Adoption first resolves the account-scoped legacy intent and earnings checkpoint. Its `legacyRevision` and `acknowledgedTotal` must match the server ledger and `garden.totalGoldEarned`. Migration changes no wallet value and retains IDs, plants, shelf ownership, achievements, unrelated fields, and a private source snapshot. Existing plant levels map to bounded gold rank and species mastery; the old one-time base resale right is retained per original plant. No past-spending estimate becomes currency. The original economyVersion is not bumped. Existing pending level rewards remain one-time explicit claims.

The client receives only `gardenR2`, a curated public projection. No migration archive, receipt stream, or private source snapshot is exposed. The ordinary UI shows current gold, income per minute, upgrade prices, deltas, and resale values. There is no migration banner or explanatory dialog.

All new earnings use server time and fixed integer remainders. Each successful foreground command settles prior time before applying the mutation and renews a 30-second foreground lease. Reads, rejected commands, and receipt replay do not create a new income interval. Stashed plants do not grow or earn. Offline gold/XP and substrate use distinct fixed horizons. Monetary taps are globally limited to one per 500 milliseconds and pay one shared gold. Ranks are 1–5, with four purchases; species mastery is 0–3, permanent, and nontransferable. Substrate is the only new spendable material.

## Commands and receipts

- `garden.r2`: version, catalogRevision, accountId, command, input, expectedRevision, intent `{ streamId, sequence, createdAt }`
- `clientActionId`: `garden-r2:<streamId>:<sequence>`
- `garden.r2.reconcile`: accountId, streamId, sequence, clientActionId, payloadHash

The account-owned receipt and revision commit with gold and Garden under the existing `withPlayerLock`/PostgreSQL OCC boundary. Route code commits only the intended fields. Generic TTL receipts are never used for R2, and the old-client fence runs before any generic receipt replay. Stream records are bounded and never evicted; capacity exhaustion fails closed rather than risking duplicated old money. Unknown old intents remain pending unless a reconciliation proves their status.

`CLIENT_UPDATE_REQUIRED` stops the old earning loop and offers reload. It never invokes reset. Persisted malformed/future progression produces a blocked R2 public state instead of appearing to be a fresh legacy account.

Client action responses update only Garden, R2, shared gold, and observation metadata. Garden revision and committed account sequence/time prevent stale results from rewinding newer Garden or shared-wallet state. Account changes fence pending responses; unrelated Yard/Merge and resource slices are retained. Realtime projections include accountId, syncSeq, serverTime, and the curated R2 view.

## Verification and activation

Pure domain, service, route-boundary, transport, and store tests run without production data. Route-boundary tests use explicit infrastructure substitutes and include a synthetic OCC retry; they are not PostgreSQL persistence evidence. Guarded PostgreSQL tests must run only against the existing disposable PostgreSQL15 CI service. R2 browser fixtures and PostgreSQL workers use the actual enabled default, with no opt-in override. A separate browser flow reaches the real HTTP server for adoption, the old-client reset fence, a lost purchase response, and reload.

Before deployment, require the normal build and legacy regression suite, the actual PostgreSQL gate, and the mobile/touch UI matrix at 320×568, 360×800, 390×844, 414×896, 568×320, 844×390, 768×1024, 1024×768, 1280×720, and 393×873, including deviceScaleFactor 2. The enabled R2 path also covers measured idle pixels, stationary pot/UI geometry, touch acknowledgement, reduced-motion/WebGL fallback, context loss, and first-shelf/distant-art loading. Verify restart/replay, account switching, stale clients, capped storage, and interrupted/repeated dialog flows. Passing only pure tests is not rollout readiness.

Legacy browser suites model a cached pre-R2 client using `tests/e2e/helpers/legacyGardenClient.js`. The test-only fetch bridge hides only the new availability bit when a snapshot explicitly has no R2 state. It forwards the original request and preserves real status, receipts, errors, wallet and plant data. Adopted, malformed and future R2 projections are never hidden. The bridge is not imported by production, R2 or touch entrypoints; it adds no server flag or runtime override.

The preceding inactive commit `599202f` passed the ordinary build, 993 Node checks, 314 Yard checks (two explicit source-only image skips), the Merge/Garden accounting/R2 real PostgreSQL gates, 159 browser tests without flakes, and the touch job in Actions run `37084823230`. All 16 R2 browser scenarios passed on their first attempt, and the embedded viewport captures were reviewed. That is prerequisite evidence, not proof that the activation commit has passed its newly default-enabled gates. The historical `garden-r2-local-validation.json` records the earlier inactive preparation stage.

When rolling back activation, retain the private namespace and old-client fences. Never remove the namespace, rewind the shared wallet, restore the frozen archive over newer player data, or send adopted players back through the legacy provider. Resolve a corrupt state separately; do not infer a new initial state.

## Runtime trajectory cross-check

`node scripts/garden-r2-trajectories.mjs` drives the actual domain commands and settlement with deterministic new, middle and legacy fixtures, including JSON reloads. The new-player scenario matches the approved model's chapter/species milestones: 13 ten-minute daily visits, chapter 7 at day 1.0002, and chapter 30 with all 14 species at day 12.00694. It finishes with 13 mature plants at 51.48 gold/min. Its integer runtime wallet is 38,681 versus the review model's 38,576.382, a +104.618 difference (about 0.27%); server lease boundaries, exact first-window offline maturity and integer remainders differ from the review model's simplified integration. Catalog prices and rates are unchanged.

The explicit chapter-13 middle-save fixture reaches the same terminal collection in 11 visits. The L100 legacy fixture retains its starting wallet and maps its 15 mature plants to R5/M3, with a current aggregate rate of 92.368 gold/min. These are reproducible acceptance scenarios, not player-behavior or retention predictions. The review model did not record middle-save XP, so that middle fixture is documented separately rather than presented as an exact reconstruction.

The five explicit project durations are 6 + 8 + 8 + 6 + 12 = 40 hours. The design prose's separate “42 hours” statement conflicts with that table; the implementation follows the explicit recipes. Project substrate costs total 42 units, independently of duration.
