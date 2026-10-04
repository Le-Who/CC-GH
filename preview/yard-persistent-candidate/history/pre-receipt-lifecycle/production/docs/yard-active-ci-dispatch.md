# Exact-tree CLOSED / ACTIVE CI

Install this dispatch machinery, the reviewed promotion tools, production-image
acceptance lane and rollback outbox fix in CLOSED A before freezing/publishing A.
This patch does not change any release flag or generate an active overlay.

`scripts/yard-ci-dispatch.mjs --plan` first rejects dirty/untracked source. A
closed commit must pass the existing full `verify-production.mjs`, including its
entire historical transfer graph. An active commit must pass the promotion
contract, ordinary runtime semantics and a Git-tree comparison against its exact
ancestor A. Outside the eight promoted existing files and thirteen explicitly
named new contract/archive files, every Git object, path, type and mode must be
identical. Existing file modes are preserved; new proof files must be regular
100644 files. A history-directory prefix is never an allowlist.

The workflow keeps all existing CLOSED commands and suites. For ACTIVE B those
jobs explicitly check out A, verify its full contract again, and report A's SHA
in verified step summaries and artifact metadata. Existing check names stay stable
so repository required-check settings need no change. Their green status is CLOSED-source evidence,
not a claim that those closed assertions ran against B. For CLOSED runs A is the
workflow's own checked commit. The six-file candidate transformer stays strict.

The ACTIVE-only job checks out B, runs its ordinary Vite build, built-media and
loading-budget tests, and `yard-active-runtime-checks.mjs`. That script uses
ordinary on-disk production modules: eight adapters, actual default admissions,
condition/food restrictions, migration/archive preservation, completion/replay,
unsupported actions and future/null storage. No loader or acceptance options are
used. The independent production-image job then builds ordinary B with its exact
build/revision identity, pulls exact A and runs the real API/PG/warm-cache A-B-A
lane. Every ACTIVE-required job must succeed in the final `release-ready` gate;
its CLOSED expectation for those two jobs is an explicit skip, not ignored failure.

The existing Docker gate and deployment compatibility/pre-switch logic are
unchanged. Reusable CI failure blocks publication. There is no new 110-minute
duration run: accepted historical duration and reviewed equivalence remain
scoped to their real source identities.

The reusable `deploy.validate` caller grants `packages: read` alongside its
existing `contents: read`, matching the ACTIVE production job's read-only pull
of this repository's exact A image. No write scope, persistent credential or
new secret is added. Before A is frozen, integrate the exact ci.yml/deploy.yml
changes through their existing protected workflow transfer proofs. Do not
replace old pins silently. Final readiness requires a complete `--plan` pass on
that clean committed integration; checks against the prior tree are narrower.

Local execution of the new dispatch negative tests needs only Node/Git and a
readable complete closed source checkout. In the tiny author workspace use
`YARD_DISPATCH_TEST_SOURCE_ROOT=/path/to/closed node --test tests/yard-active-dispatch.test.mjs`.
The override selects read-only test inputs, never release mode or runtime policy.
Real B build/image/browser execution awaits a reviewed promotion and exact A
identity; local synthetic Git-tree tests are not that release proof.
