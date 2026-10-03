# Future active Yard v2 PostgreSQL gate

This adds a separate opt-in persistence gate. It does not activate Yard v2, change
release policies, alter package/CI defaults, or replace any existing legacy gate.
Unselected skips and offline checks are not PostgreSQL evidence.

## Fixture and required proof

The fixture is created with `ensurePersistentPlayerYard`, serialized, and inspected
again. `_yardV2` must have `yard-persistent/v1`, version 1, real runtime and migration
records. An opaque marker is not accepted as a valid v2 save.

The supported paid action is `yard.fixGoodie` on an already owned, placed, worn
Sun Cushion. Its current release repair price is **24 treats**. Kibble and buying
Sun Cushion are free. The later reviewed r3 food binding also admits paid Berry
Plate purchases; this gate continues to use the deterministic cushion repair.
The test makes no availability or price override. A changed catalog requires an
explicit fixture review, not accepting a free operation as a debit test.

Each repair has a new `yard-v2:pg-repair:<UUID>` intent. A successful persisted
`yard-action-receipt/v1` must match the action, payload digest, nonce and server
time. A generic `_actionReceipts` entry or a 200 response alone cannot satisfy it.

The selected real-database suite requires PostgreSQL15 and includes:

- committed repair with its entire reply withheld; a new process reads it, the
  parent DB pool is closed/reopened, and another process replays it ten days later;
- the same intent in two distinct OS processes: one debit, one repair, one v2
  receipt, one duplicate reply;
- Garden R2 buyPlant and Yard repair after both workers read the same real
  `_version`: both survive, with a genuine losing CAS callback rerun;
- exact historical Merge grant replay in fresh processes: stock, essence, crafts,
  ledger, epoch/fence and granted Yard counts stay unchanged;
- rejected debit and conflicting nonce: no partial repair, no adjacent progress
  loss, stable rejected receipt/replay.

The fixture obtains both inventory-only Merge outputs from actual domain crafts
(`living_arbor`, `echo_chimes`, quantity 2 each). It preserves counts above 999,
105 pending gifts, 110 photos, opaque Yard/player fields and purchases. This models
already-existing grants; it does not enable these projects in the release service.

## Offline checks

```sh
node --test --test-concurrency=1 \
  tests/yard-v2-pg-fixture.test.mjs tests/yard-v2-pg-guard.test.mjs \
  tests/garden-r2-pg-guard.test.mjs tests/yard-merge-v3-preservation.test.mjs \
  tests/yard-inventory-only.test.mjs
```

These use the real pure Yard/Merge source and existing legacy tests. They do not
exercise PostgreSQL, distributed CAS, network loss, or live deployment. The PG
worker has no modeled SQL or memory fallback and refuses startup without its
guarded IPC parent. Fixture insertion/deletion is restricted to generated
`yard_v2_pg_<UUIDv4>` IDs. Production accounts are refused.

## Explicit CI invocation

Reuse the existing disposable `postgres:15` CI service; do not install a local DB.
Do not invoke with production credentials or a production database name.

```yaml
- name: Future active Yard v2 PostgreSQL15 persistence and OCC
  env:
    YARD_V2_PG_TEST: '1'
    YARD_V2_PG_TARGET: integrated
    CI: 'true'
    NODE_ENV: test
    DATABASE_URL: postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci
    REDIS_URL: ''
    NODE_OPTIONS: ''
  run: node --test --test-concurrency=1 tests/yard-v2-postgres.test.mjs
```

Integrated mode imports actual `routes/player.js` and `playerManager.js`, with no
overlays. Its real-route preflight must produce a paid v2 repair and durable receipt
before initializing the DB. The currently active legacy route is intentionally
insufficient. No `continue-on-error`, status-only assertion or memory substitution
is appropriate for this gate.

For the still-inactive candidate, set `YARD_V2_PG_TARGET=candidate` and
`YARD_CANDIDATE_CI=1`. The guarded loader first runs the existing production hash
contract and only then registers candidate source overlays in the parent and each
worker. It loads actual DB/Express dependencies, not candidate dependency doubles.
A stale base contract fails before database initialization. Candidate-mode success
proves that candidate only and cannot stand in for integrated-mode evidence.

## Conditions before making the gate mandatory

1. Explicitly rebase/review the inactive candidate against the current production
   routes, playerManager, Garden/account fences and Merge composition. Preserve the
   hash guard; do not suppress it to obtain a green run.
2. Integrate Yard v2 at the actual persistence entrypoints. Actual migrations,
   snapshots and Yard mutation route must preserve valid stored v2 state, unknown
   fields, existing grants and durable receipts. Keep the bounded action policy.
3. Run **integrated** mode on the real disposable PostgreSQL15 service, including
   every subtest, with nonzero CAS retry assertions. Then add this step alongside
   existing gates. Preserve current legacy checks as separate compatibility proof;
   their opaque `_yardV2`/old nonce/Berry Plate scenario is not future-v2 proof.

This does not authorize activation/deployment. Real Telegram gestures, browser/art
acceptance, HTTP authentication, Redis and production data migration remain
separate release checks.

## Local evidence on 4e659a05b7de9d2c714182edb7d7225623627f06

- Offline slice: 26 passed, 0 failed, 0 skipped.
- Selected integrated preflight: failed on missing durable v2 receipt before DB
  initialization, confirming the current active route is still legacy.
- Windows candidate preflight stopped because checkout CRLF bytes differed from
  pinned LF Git blobs. This was not source drift: expected hash, Git blob and
  CRLF-normalized working bytes match. The unchanged guard passes all 18
  production fingerprints in the parent Linux checkout; no rebase is required
  solely for this line-ending mismatch.
- Docker/PostgreSQL executables unavailable; no installations attempted. Every
  real PostgreSQL subtest is **not run**, not passed.

Logs live in `output/yard-v2-pg/` in the isolated QA checkout.
