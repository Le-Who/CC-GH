# Two-phase Yard deployment and rollback boundary

This is an operational preparation, not permission to deploy either phase now.
Both phases are internal steps of the final authorized release after all final
source/media/native-duration/pair acceptance and applicable exact-tree CI.

## Why two images are necessary

The existing deployment rollback restores the captured prior image and prior
`.env`, without restoring the database. This is correct only if the prior image
can read or quarantine every state the candidate might persist. Once `_yardV2`
exists, the old `84d252d4` image is not a safe fallback: it can invoke the legacy
normalizer/simulator without durable Yard receipt semantics.

The new guard is read-only and runs after the target image is pulled but before
stale-container cleanup or `RELEASE_SWITCH_STARTED=1`. It does not query real
production during tests/preparation. At actual deployment it queries only
`SELECT count(*) FROM players WHERE data ? '_yardV2'`; null/future markers count.
No player row, save, credential or receipt is output. A query error blocks.

## Phase A: closed, compatible bridge

1. Assemble and independently review the complete closed player wiring, exact
   owned media delivery, rollback guard and CLOSED preservation contract. Run
   all required CI/build/browser/HTTP/PostgreSQL checks for this exact image.
   This is part of the final rollout; do not publish an unfinished bridge merely
   because implementation exists.
2. Keep `YARD_PLAYER_RELEASE_POLICY.enabled:false`; source acceptance changes
   remain separately reviewed. The image-owned compatibility command derives
   its state from that policy, runs the actual closed adapter against ephemeral
   malformed/future/null sentinels, and proves no local save bytes change.
3. Populate `requiredLegacyPredecessor` in the reviewed closed policy only after
   resolving the actual healthy production registry digest. Its build must be
   the audited `84d252d4bee6ed75fe8d32c07ebdef4c9270c629`; the verified historical digest is
   `sha256:729955b34481c629980e5a04606a88531d9ba1691e69312c9dcd366571e4380d`,
   from successful deploy 37142937097 / deploy job 111267308840 and image job
   111267028671 (2026-10-03 18:41:59 UTC). This establishes historical identity,
   not present live state; the guard still checks the running predecessor. An absent probe does not admit an arbitrary image.
   The guard checks candidate registry digest plus OCI source-revision label,
   captured prior image identity, and exact healthy prior build. If the prior
   image lacks a compatibility command, **any** existing `_yardV2` marker
   blocks the switch, even when the candidate is closed. Do not delete those
   markers, reinterpret unknown markers as absent or restore a backup to pass.
   A discovered existing marker requires a reviewed compatible recovery target.
4. Deploy A using the ordinary verified database backup, switch and local/public
   health checks. Unmigrated accounts stay legacy; A creates no `_yardV2` records.
   A failed deployment can safely return to the pinned unaware old image only
   under the verified known-writer assumption: that audited old image and A
   cannot create persistent markers, no independent Yard writer exists, and
   all deployment procedures hold the same server-side release lock. The guard
   repeats the marker count and running-image check immediately before returning;
   this reduces observation races but is not an atomic database write fence.
   If unknown writers cannot be excluded, do not deploy based on this guard.
5. Verify exact A build/digest, closed mode, a normal authenticated legacy
   snapshot and ordinary game behavior. Confirm the aggregate marker count is
   still zero. Record A's actual immutable registry digest and build SHA for B.
   Do not use a guessed tag, mutable `latest`, local image ID in place of registry
   digest, or a health payload alone as compatibility evidence.

## Phase B: reviewed activation

1. Build the explicit ACTIVE release contract. The current CLOSED contract and
   negative controls intentionally reject enabled flags; do not remove those
   checks, blanket-refresh hashes or try to pass B through the CLOSED contract.
   Add an independently reviewed active contract tied to exact accepted proof
   references, final source/media closures, delivery-map digest, roster/prop
   registrations, expected policy values and the separate gate-transition
   provenance record described in `yard-player-rollout-integration.md`.
2. Retain closed-mode counterexamples: a build claiming CLOSED with an enabled
   player/source gate must fail; an ACTIVE build with missing/unaccepted proof,
   wrong roster, changed semantic source or missing predecessor must fail. Each
   mode has its own positive contract, rather than an always-closed assertion
   or a runtime bypass. Existing test-only acceptance options do not become
   production wiring and test manifests do not become acceptance records.
3. Compatibility is inspected by running the pristine previous image ID in an
   isolated `docker run --network none`, without mounts, database credentials or
   service environment. It does not execute compatibility code in the mutable
   running container. Only explicit exit42 from the fixed file-existence probe
   means the command is absent; all Docker/permission/command errors block.
   In the reviewed activation commit, set the exact approved source/profile
   transitions and player policy. Set `requiredClosedPredecessor` in code to
   `{buildId: A_FULL_COMMIT_SHA, imageDigest: A_REGISTRY_SHA256_DIGEST}` using
   verified actual values. This is not an environment setting or HTTP input.
   Defaults remain null; an enabled image without the exact pin is unshippable.
4. Run full required CI against B and compare final production witness behavior
   with accepted temporal evidence. A changed gate field is accounted for by
   explicit non-kinematic transition provenance, not by relabeling an old run.
   Image build identity, manifests and closed predecessor must be final before
   B's deployment. Any rebuild with a different A registry digest requires a new
   reviewed pin rather than substituting the digest during deployment.
5. Immediately before switching, the guard must find the actual running prior
   image is A, with the pinned repository digest and matching OCI revision, its
   image-owned policy is closed, its quarantine check passes, and its current
   local health reports exactly A and is healthy. An unrelated compatible image,
   old image, already-enabled predecessor, wrong digest, changed running image,
   missing proof or failed count blocks before any live switch.
6. Keep the ordinary fresh checked database backup. The workflow tags the exact
   verified prior local image `yard-rollback-<A_SHA>` so image pruning cannot
   discard it merely as dangling. The existing failure trap restores A and its
   environment, never restores the database, and never returns to 84 directly.
7. Verify exact B health, actual authenticated persistent snapshot/roster/assets,
   durable commands and fresh-read persistence. On failure after any migration,
   rollback A renders persistent accounts read-only and does not replay legacy
   normalization; unmigrated accounts remain legacy. Do not automatically replay
   commands with new intent IDs or restore original input archives. Existing
   pending-outbox/response-loss behavior remains an integration QA requirement.

## Subsequent releases

The initial activation policy pins an exact closed predecessor deliberately.
A later enabled deployment from an already-enabled image will fail this initial
activation guard. Plan a separately reviewed steady-state transition contract
with exact compatible predecessor identities and the same minimum storage
support, or use a new closed bridge. Do not remove the predecessor requirement
or make a mutable environment override to get a later deployment through.
Any manual rollback must respect the same compatibility floor. Application-only
rollback does not mean database rollback; a data restore is separate and may
lose subsequent purchases, gifts and adjacent-game progress.

## Files and tests

- `release-policy.mjs`: code-owned verified historical legacy pin and initially-null closed predecessor pin.
- `scripts/yard-release-compatibility.mjs`: image-owned, zero-network/DB command.
- `scripts/verify-yard-rollback-target.mjs`: pure input/identity/phase verifier.
- `scripts/yard-pre-switch-guard.sh`: bounded image/health/count collection; no
  schema/data mutation; isolated candidate verifier has networking disabled.
- `.github/workflows/deploy.yml`: copy the helper, invoke before any live switch,
  retain the verified previous image; existing backup/health/rollback unchanged.
- `tests/yard-rollback-guard.test.mjs`: identity/mode/count negative cases and the
  actual shell under hermetic Docker/curl stubs, including query failure and a
  changed prior image, missing/wrong legacy pin, probe errors and a marker appearing on recheck. No live database, Docker service or website was accessed.

Validation: 26 tests passed (16 new plus all 10 existing release/backup/rollback
checks), no failures or skips. Live image/DB deployment behavior remains to be
verified in the authorized release environment; the tests are not a deployment.

The workflow acquires a nonblocking `flock` on `/opt/game-hub/.release.lock`
before saving environment or switching; it is held through the failure trap and
rollback. Existing GitHub deployment concurrency remains enabled. Manual release
procedures must share the lock. This lock serializes deployments, not arbitrary
SQL writers; its scope must not be overstated.

All Docker client calls made by the pre-switch helper have a 30-second timeout
with a further 5-second kill deadline. Both PostgreSQL count observations run
with session `default_transaction_read_only=on`, a 10-second statement timeout
and a 3-second lock timeout. Missing timeout support, Docker deadline expiry,
SQL deadline/lock failure or a failed probe blocks the deployment. Curl health
checks retain their explicit connect/total deadlines.

SCP writes compose/helper files only to
`/opt/game-hub/releases/<candidate-build>-<workflow-run>-<attempt>/`. The deploy
step checks both staged files and promotes them into the effective live paths
only after acquiring the release lock. Uploading a waiting job cannot overwrite
files belonging to the active lock owner. Staging does not grant permission to
deploy; all acceptance, identity and compatibility checks still apply.
