# Finite canonical Yard acceptance

Prepared workflow and tests only. This packet does not establish PostgreSQL,
browser, visual, mobile performance, or production acceptance. Local preparation
runs no browser, HTTP listener, database, or GitHub action.

## Before the one authorized publication

Integrate the reviewed final backend, dynamic planner, UI and this test packet on
base `592356e97b67bc5cda3b4b0eeccff94101f8c300`. Review the exact final diff and
only then run:

```
node qa/yard-canonical-acceptance/seal.mjs --reviewed-final-source
```

The seal covers every final changed source byte and removed runtime URL, excluding
itself. Commit that manifest with exactly the listed changes. A changed source,
missing file, extra committed file, or second workflow mutation fails preflight.
The manifest is provenance, not a substitute for source review. Exclude local
provenance, unpublished asset work, credentials and unrequested historical QA
changes before sealing. Do not reuse historical preview source-pin checks.

Publishing the new branch `qa/yard-canonical-dynamic-20261006` would trigger the
single workflow `.github/workflows/yard-canonical-dynamic.yml`. It accepts only a
non-forced first branch-creation push and run attempt 1. Reruns and later pushes do
not execute the job. There is no PR, dispatch, schedule, deployment, image push,
secret, cache, persistent environment, or production connection in this lane.
Publication must be separately authorized by the coordinating agent/user.

## Exact build and run

The standard `ubuntu-24.04` job has a hard 10-minute timeout, Node 24, locked
pnpm 10.28.2, one Chromium, zero test retries, and one disposable `postgres:15`
service. Database/user/password are all fixed `ccgh_merge_ci`, on loopback:5432.
Environment guards reject other databases, credentials, ports, Redis, dotenv,
Node preload flags and inherited policy-loader switches. Test identities are
random UUIDs with exact fixture prefixes; deletion rechecks their ownership.

The build script runs the actual application entry twice, serially:

```
NODE_ENV=production VITE_YARD_PIP_PREVIEW=false VITE_BUILD_ID=<exact commit> pnpm run build
NODE_ENV=production VITE_YARD_PIP_PREVIEW=true VITE_BUILD_ID=<exact commit> pnpm run build
```

Each build must pass current exhaustive emitted import/URL closure and
`runBuildPerfGuard`; off-mode must exclude optional code and assets, while
on-mode must keep them out of the startup shell. The API bridge serves the exact
on-mode `dist`, with ordinary App, auth, Express routes, Socket.IO, outbox and
PostgreSQL. No phone fixture entry or replaced snapshot/store is used.

The sole test-only source loader changes one reviewed literal capability
`false` to `true` in memory. It requires canonical-locations.mjs SHA256
`95920c2c086631a3afe87492e204fbe5a56d7d34565ddf9774334fd90e818429`, plus
unchanged protocol and geometry hashes. Product source retains the false flag.
This tests enabled canonical behavior; it is not production rollout approval.

The workflow runs guard/source tests, then the existing real multi-process
PostgreSQL CAS/exactly-once test once, then both builds, then:

```
pnpm exec playwright test --config qa/yard-canonical-acceptance/config.mjs
```

Browser global timeout is 220 seconds; the API bridge watchdog is 240 seconds.
One test has a 190-second timeout. The DB test retains its 180-second bound.
These upper bounds do not sum to a promised runtime: the whole job is killed at
10 minutes. Expected runtime must be measured by the first authorized run.

## Evidence and meaning

- Actual two-owned-leaf inventory: place two via UI, reload, move one, pick up both.
- The first place response is held after real commit, then dropped. The actual
  durable outbox retries the same nonce, receives a duplicate response, empties,
  and leaves one debit and one receipt. No fake successful response is supplied.
- Actor is hidden/frozen while the exact response is pending. Source tests also
  cover unknown authoritative state, which browser tests do not fabricate.
- Real two-prop normal inspection; preferred front blocked selects another
  reachable anchor; valid target `(35,115)` reports no reachable anchor.
- Actual authenticated remote move and deletion during approach, followed by
  the app's own snapshot refresh; supported root/feet remain fixed during recovery.
  The refresh notification and pointercancel are explicitly synthetic events.
- Fixed secondary prop native crop samples record pixel RMS and bounded best
  displacement, together with prop/camera matrices and actual surface CSS origin.
  World-coordinate equality alone is not considered raster proof.
- Pointercancel, resize during drag, portrait recovery, mode off/on, lazy worker
  creation and retirement; known CPU/RGBA/raster/capacity limits remain enforced.
- All nine AGENTS HUD viewports, extended `375x812`, and a separate DPR3 phone:
  no horizontal scroll, reachable unclipped 44px controls and focusable dialogs.
  DPR2 English and DPR3 Cyrillic crops retain native pixel dimensions, and actual
  Nunito Latin/Cyrillic font transfers plus computed family are required.
- One continuous native WebM retains actual timing; no retiming/interpolation or
  screenshot-generated animation. This is desktop software-rendered Chromium,
  not evidence of hardware phone FPS or native Telegram lifecycle delivery.

The artifact contains summaries, bounded TAP, WebP matrix views, four native PNG
HUD/dialog crops, two stationary prop crops and one native clip. It must total
at most 8 MiB before upload, with retention exactly 3 days. Over-budget evidence
is preserved in the job and upload refused; failures are never relabelled success.
No full source bundle, DB dump, trace or broad video collection is uploaded.

Mechanical browser pass still requires visual review of clipping, readability,
layering, artwork and motion. Real iOS/Android GPU, Telegram safe-area changes,
trusted app background/foreground events and subjective animation quality remain
outside this finite lane. The current raster is intentionally 390×648 at DPR1;
DPR2/3 HUD typography does not make the scene a high-DPI render.
