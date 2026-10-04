# Parent-only PostgreSQL acceptance

Not executed on the Windows recovery executor. This checkpoint does not claim
PostgreSQL acceptance. Use the existing disposable PostgreSQL15 service in CI.
No production/profile/release gate changes are required or authorized.

The new CI step selects integrated repository source and no candidate overlays:

```sh
YARD_FAMILY_PG_TEST=1 YARD_V2_PG_TEST=1 YARD_V2_PG_TARGET=integrated \
YARD_CANDIDATE_CI= CI=true NODE_ENV=test REDIS_URL= NODE_OPTIONS= \
DATABASE_URL=postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci \
pnpm run test:yard-family:pg
```

The script expands to:

```sh
node --test --test-concurrency=1 tests/yard-family-postgres.test.mjs
```

Both explicit opt-ins, loopback port 5432, exact disposable database/user,
empty Redis and runtime injections, and PostgreSQL major version 15 are checked
before application access. Only generated `yard_v2_pg_<uuid-v4>` IDs are touched;
cleanup deletes those exact IDs. No SQL mock, unit-loader, memory fallback or
release policy override is used. Closed candidate profiles are enabled only by
the same trusted test fixture used in native acceptance tests. These tests
exercise the actual Yard domain service through real `withPlayerLock` and CAS;
they do not prove family activation in the HTTP/player release path.

Twelve native scenarios cover Willow/Starlit/Basil/Sage with post-admission
new/worn/broken conditions (uses 0, durability-1, 2*durability-1). Native UUID seed
selection is confirmed by actual simulation. Check one serving, one wear use,
one petbook visit, the exact authored condition/clip receipt, saved reload and
read-only presentation, pool restart, completion-1, completion CAS races, one
gift ledger, same-collect-nonce CAS races, lost reply, ten-day replay and payload
conflict. A separate Garden purchase/family gift collect race checks both
effects survive a genuine CAS collision, preserves Merge/fence/opaque fields,
and replays both receipts without extra effects. The shared process harness
requires distinct OS PIDs, equal loaded versions and a callback rerun on CAS loss.

The memory/native condition suite covers all seven wear boundaries and duration
witnesses separately; do not count it as PostgreSQL proof. Full 28-pair/mixed
choreography, Mochi native 110 minutes, production asset URL and complete full-
duration gameplay remain separate acceptance gates even if this PG suite passes.
