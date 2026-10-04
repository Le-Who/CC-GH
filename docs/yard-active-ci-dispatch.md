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

The workflow keeps all existing CLOSED commands and suites. By default, ACTIVE B
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


## Reusing exact CLOSED acceptance

An optional `closed.ciReceipt` in the verified promotion inputs contains only
`runId`, `runAttempt`, and `workflowPath` (`.github/workflows/ci.yml` or
`.github/workflows/deploy.yml`). It is preserved in the existing ACTIVE contract;
there is no extra production path or new promotion allowance. Do not supply it
until that exact closed A run has completed successfully.

Without this field, the original CLOSED suites run on A again. With it, B runs a
read-only receipt job instead. A supplied invalid or unavailable receipt blocks
acceptance; it never silently converts a failed proof into a skip. The job uses
only its existing ephemeral GitHub job token with `actions: read`; the reusable
deploy caller grants the same read permission. The reusable workflow defaults
to contents:read, so ordinary jobs do not inherit Actions reads from that caller.
The production image job retains its explicit packages:read. No token creation
or write API is involved.

The verifier accepts only a same-repository `push` or `workflow_dispatch` run
whose exact `head_sha` is A. Those events make the reviewed default checkout and
CLOSED dispatch select that exact commit. A pull-request head SHA is insufficient
because its merge checkout can differ; PR receipts are refused in this bounded
implementation. Workflow path and ID must match the known CI or deploy workflow.
The complete run must be successful, including a deploy run when selected.

The verifier reads the run, the pinned attempt, workflow identity and every job
page from GitHub, then checks the run has not changed. The required inventory is
the CLOSED plan, main tests, player integration, four eight-player viewport jobs,
actual browser discovery and every source-owned browser group, touch, Mochi,
Docker, and the CLOSED aggregate. The actual test and source-verification steps
must also have succeeded. ACTIVE lanes and the receipt lane must have been
skipped in A, preventing circular reuse. Deploy validation uses the exact
`validate / ` job prefix; unrelated deployment jobs cannot satisfy a check.

For a targeted rerun, each job's latest attempt at or before the pinned run
attempt is authoritative. A later successful replacement may supersede an older
failure without rerunning successful siblings. Missing/duplicate jobs, a newer
failed replacement, incomplete pages or a changed run fail closed. The output
records every accepted job ID/attempt/link and workflow byte hashes.

B still freshly verifies the 21-path tree boundary, checks out exact A to run its
full original CLOSED contract, and runs its ordinary ACTIVE build, runtime,
metadata, loading/budget and production image/API/PostgreSQL/warm-cache tests.
The image lane still independently binds A's immutable digest, build identity
and quarantine capability. Source CI evidence does not certify the image.

The aggregate accepts exactly three states: CLOSED with fresh CLOSED suites;
ACTIVE with fresh CLOSED suites; or ACTIVE with skipped CLOSED suites and a
successful authoritative receipt. Both ACTIVE jobs must succeed in either
ACTIVE state. Existing check names and Docker dependencies remain unchanged.
