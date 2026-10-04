# First compatible ACTIVE maintenance release

Prepared implementation, awaiting independent source review. No workflow, image
publication, merge or deployment was launched by this preparation. No real release
record or invocation is included: an accepted, deployed ACTIVE B2 does not yet
exist in the preparation inputs. Missing identities fail before Docker/PG startup.

## Minimal path for Settlement

1. Finish B2's actual published-image nine-case acceptance and deployment. Freeze
   the healthy ACTIVE commit, tree, registry digest, image ID, full image-owned
   compatibility output and successful GitHub run/attempt/artifact identities.
2. Independently review the bootstrap capsule and Settlement change. The initial
   B2 anchor is immutable. The immediate predecessor P is that accepted/live B2.
   Inventory every P-to-C blob/mode change; no wildcard path exemption is used.
3. Put the exact approved maintenance contract in C. Its bootstrap hash refers to
   a separately approved capsule containing every path in BOOTSTRAP_PATHS. The
   capsule itself is external to C, avoiding self-referential hash cycles.
4. Merge only after independent source review. The first bootstrap must register
   its new workflow_dispatch files on the repository's default branch. During
   this explicit bootstrap hold, automatic deployment fails closed because no
   approved maintenance request was supplied. The live image remains P. This is
   not a CLOSED reset, and it needs no branch-protection administration.
5. Run the source-only maintenance image workflow with its independently approved
   build-request bytes and SHA-256. It verifies the whole source difference and
   authoritative P receipt, then pushes only a maintenance-C tag. Its result is
   explicitly built-not-runtime-accepted and contains the real registry digest.
   It cannot satisfy the acceptance or deployment validators.
6. Create and review the final request using that actual digest. Run manual Game
   Hub CI with maintenance_request_json and maintenance_request_sha256. The
   MAINTENANCE branch requires source/receipt verification, ordinary build/runtime
   checks and affected-game unit checks. Its aggregate remains preflight only.
7. With explicit authorization for the live switch, run the maintenance release
   workflow using the same exact source/image request and deploy=true. It runs
   the genuine P-to-C-to-P image/API/PG/browser/SW lane once. Only success permits
   the existing locked deployment procedure to switch to that same digest. The
   pre-switch guard rechecks that the live healthy rollback image is exactly P.

The separate acceptance-only workflow supports inspection without any live
switch. Running it first and later launching a release repeats acceptance; that
is optional, not required for the minimal conditional-release path.

## Immutable proof and exact source boundary

I is the first accepted ACTIVE B2, P the immediate accepted/live ACTIVE release,
C the proposed candidate. C must descend from P; P must descend from I. The full
P-to-C Git-tree difference, including additions, removals and modes, must equal
the reviewed record. Only the exact record blob and a separately approved first
bootstrap capsule are treated as control metadata.

The first Settlement payload also needs five separately reviewed QA paths: its
acceptance workflow, settlement-natural-raster-policy, settlement-assets,
verify-settlement-illustrated-ui and the Yard/Garden copy test. The bootstrap may
carry a separate `cc-gh-yard-settlement-qa-bootstrap/v1` capsule whose raw SHA-256,
canonical source-manifest SHA-256 and all five before/after Git blobs are covered
by the approved bootstrap bytes. The exact five-path inventory is fixed in the
verifier. Partial, changed, extra or replayed capsules fail. These paths remain
protected in ordinary release records. The actual final capsule is absent until
the canonical source bytes and real accepted B2 base are independently reviewed;
that absence blocks a candidate containing any of these files.

The original ACTIVE contract, actor/media readiness bytes, CLOSED archives,
initial dispatcher, promotion generator and CLOSED receipt verifier remain
unchanged. The complete historical promotion/closure check reads I's Git bytes,
including its exact CLOSED ancestor. Current runtime behavior is tested on C.
There is no recursive replay of every historical release and no repeat native
110-minute run. Two initial-promotion extension test cases apply to I rather than
C; the maintenance controller explicitly substitutes I's pinned historical proof
and its own complete-tree/bootstrap negatives for those two cases. Ordinary data,
loading-graph, runtime and affected-game assertions still run on C.

Compatible maintenance refuses changes to Yard release/storage code, migrations,
historical evidence, proof machinery, workflow/package/build infrastructure and
DB schema unless the exact first bootstrap capsule authorizes its fixed tooling
inventory. A later attempt to replay or enlarge that capsule fails. Normal game
changes cannot amend the guards. Storage/protocol evolution needs a separately
reviewed route; it is not part of this implementation.

## Trust inputs and receipt collection

The expected request and record hashes are external approved inputs. They are not
read from a candidate field saying it was reviewed. A request pins the exact
trusted controller commit, candidate commit/tree, record hash, predecessor receipt
locator, and optional bootstrap bytes/hash. A final request also pins the actual
candidate registry digest. A source-only build request has a different format
and has no candidate-digest field at all.

The receipt adapter reads only the fixed Le-Who/CC-GH GitHub API, with repository
ID 1162268629. It verifies the exact successful push/dispatch run and attempt,
source tree, reviewed workflow/CI bytes, required job and step outcomes, latest
per-job retry records, actual acceptance artifact and exact image proof. It
rechecks run stability at the end. PR-head ambiguity, a missing/skipped test,
wrong repository/source/image, partial pages or a changed run blocks release.

Artifact downloads strip the GitHub token before following the allowlisted signed
storage URL. The bounded ZIP reader extracts selected JSON in memory, never files
or executable content. The adapter's collector returns collected-unapproved
output; source review must approve its exact normalized receipt hash before it
can become a predecessor input.

For retention beyond 14 days, the optional reviewed-archive mode reads one small
immutable JSON at release-evidence/yard/P_COMMIT/receipt.json in this same repo,
pinned to an exact source commit and SHA-256. It contains the previously verified
PASS, image identity and artifact metadata. The adapter still rechecks GitHub
run/jobs and source/workflow identity. There is no automatic fallback to an
unverified copy and no new service, storage account, credential or access grant.
The collector can produce the archive only from successfully verified evidence.

## Runtime compatibility and rollback

The existing v1 CLOSED and initial-activation branches remain in place. Without
any maintenance record, the image capability returns the original v1 declaration.
A record cannot enable a CLOSED release. For maintenance it declares v2 with the
same immutable initial activation, exact requiredActivePredecessor, approved-record
fingerprint and readable/writable yard-persistent/v1 with no migration.

The v2 pre-switch verifier independently requires the external approval hash,
actual candidate/P image IDs, registry digests, OCI/build identities, production
command/environment, healthy exact P, image-owned capability bytes and the
verified accepted-P receipt. It accepts the initial v1 ACTIVE B2 only as the exact
first anchor; later P must preserve the v2 lineage. Metadata alone is not enough:
real persistence/replay and image tests must also pass.

The maintenance shell preserves the existing read-only bounded SQL marker query,
Docker timeouts, live-image re-observation and private scratch cleanup. Its three
additional inputs are the independently approved record hash, exact record file
and verified predecessor receipt. The normal eight-argument initial guard does
not silently authorize a v2 candidate. The release workflow calls the maintenance
entry only after successful image acceptance, under the existing deployment lock,
rollback-image capture, health checks and restoration logic. No image is rebuilt
between acceptance and the live switch.

## Genuine image acceptance

The runner pulls and inspects exact P/C registry objects before launching any
service and runs containers by their verified image IDs. It reuses the bounded
internal Docker bridge, strict owned loopback relays, ordinary server/auth policy,
owned PostgreSQL15 fixtures, process deadlines and teardown. No test policy loader,
synthetic server response, altered clock or live-player database is used.

Six base cases are mandatory: API progress and receipt replay across P-C-P;
one-origin warm-SW update/rollback with a committed lost response and retained
outbox; invalid/future-marker preservation in both ACTIVE images; authentic Merge
Moon Lamp to Yard placement; explicitly fixture-assisted Blox finishes funding a
real Merge pack; and eight-route Home ownership/reload. Every affected game also
gets an actual-image viewport/navigation/reload case. Settlement exercises narrow
portrait, standard portrait, landscape and desktop geometry/control reachability.
Its separately reviewed bug-specific tests are still required; generic smoke
coverage does not establish every intended Settlement interaction.
The final copy payload explicitly names Yard and Garden as affected games; Garden
runs its existing interaction, local-state, navigation and release-integration
unit cases, the reviewed copy test, and its actual `.gs2-stage` browser route.

The warm lane admits a genuine current-hour Mochi visit and checks P, C, rollback
P and restored C separately. Browser/SW-delivered Mochi and Pebble metadata must
equal that image's exact metadata bytes. Actor-specific atlas attribution must
show changed opaque pixels on the actual scene canvas; the drawn page's browser,
HTTP and image-disk byte hashes must agree. This is fresh delivered-byte evidence,
not an assumption that an earlier activation test covered the new rollout.

Persisted progress comparisons retain all economic values, receipts, migration
backup and unrelated Garden/Merge fields. Only full-energy lastRegenTimestamp may
stay unchanged or advance monotonically inside the real same-host observation
window. Returned clocks must be no later than serverTime, and persisted clocks
must be no earlier than the reply. Each cross-version observation compares with
its immediate predecessor. Below-full energy and every economic drift still fail.

The report validator requires the complete exact case-name inventory, one passed
attempt each, zero skips/failures/flakiness and exact C/P/request identities. PASS
is written only after all checks and bounded teardown succeed. The release job
revalidates the exact proof and preflight bundle before staging any host action.
An acceptance-only run or skipped deploy job cannot become an accepted P receipt.

## Implemented files and validation

The source router adds an explicit MAINTENANCE phase to CI while retaining the
original CLOSED/initial-activation route. The final aggregate encodes all required
success/skip states; an absent approved request stops the maintenance route.
Publisher, acceptance-only and conditional-release workflows are separate so an
image build cannot be confused with successful acceptance. Existing token scopes
are used: read-only receipt/image checks and package write only in the explicit
candidate publisher. No persistent credentials are added.

Local tests cover real tiny Git transitions, exact bootstrap drift and replay,
request/build-request separation, authoritative API responses and failures,
archival source pins, receipt/image/storage negatives, v1 fallback, malformed ZIP,
real extracted CI aggregate execution, and exact browser report inventory.
Initial CLOSED receipt controls are rerun against the clean actual A2 source.
YAML and embedded shell/JS syntax are checked independently.

Not run here: Docker, PostgreSQL/browser/SW maintenance execution or any live
switch. The real B2 anchor, its final registry receipt and C's actual published
digest remain necessary external inputs. The current local source is based on
reviewed B2 tooling and approved tree d3b5af1f7d6c60c7a154165a36a67ee878b79e30;
that draft source identity is not represented as a healthy deployed anchor.

## Required next dependencies versus optional extensions

Required: independent review of this frozen patch; genuinely accepted/live B2
receipt and image metadata; exact reviewed bootstrap and Settlement diff; actual
C image digest; manual CI preflight; explicit live-switch authorization; and a
successful final real P-C-P lane. Any missing value or failed check blocks progress.

Optional: archive the already verified small receipt before artifact expiration;
run acceptance-only before conditional release; broaden the game-specific browser
matrix after reviewing another game's concrete change. Schema migrations,
automatic approval discovery, persistent bots, new services and recursive release
history machinery are excluded.
