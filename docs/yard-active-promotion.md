# Reviewed Yard promotion machinery

These tools prepare a reviewable overlay; they do not apply it, publish it or
activate any running process. They have no placeholder predecessor or fallback
acceptance input. The source checkout must be the clean exact commit of the
closed image supplied in the input record.

Run `node scripts/yard-active-promotion.mjs --source-root CLOSED_CHECKOUT --inputs VERIFIED_INPUTS.json --output NEW_OVERLAY_DIRECTORY`.

The explicit input record has format `yard-active-inputs/v1`, repository
`le-who/cc-gh`, and these required fields:

- `closed.buildId`: full verified closed image source commit.
- `closed.imageDigest`: immutable registry digest, including `sha256:`.
- `closed.image`: Docker image inspection result, with `Id`, `RepoDigests` and
  `Config.Labels["org.opencontainers.image.revision"]`.
- `closed.compatibility`: output of that pristine image's existing
  `scripts/yard-release-compatibility.mjs`; it must be closed, quarantine-verified
  and support `yard-persistent/v1`.
- `acceptance.reviewReference`: explicit review approving this transition.
- `acceptance.nativeDuration`, `acceptance.eightPlayer` and
  `acceptance.geometryEquivalence`: each has `reference`, `artifactSha256` and
  `sourceCommit`. `eightPlayer.runId` must be the already accepted `37181170572`.

Retrieve real image/evidence outputs through the authorized release workflow.
The tool checks supplied identities and hashes; it does not authenticate an
external claim or independently approve an artifact. Input examples containing
fabricated credentials/digests are deliberately not provided. Unit-test inputs
are synthetic, in-memory only, and are not release receipts.

The tool validates all eight closed fingerprints and compares the existing
strict candidate transformer. It emits six source files, two manifest wrappers,
eight byte-preserved originals, four archived CLOSED verification files and
`game-logic/yard-v2/active-release-contract.json`. The five historical source/media
closure manifests remain unchanged. A separate report records exact parity of
profiles, props, registry, scene, 24 source preflight results and eight native
admission/completion/collect/replay outcomes between the passed candidate
transformation and the promoted production bytes. Only those short deterministic
checks rerun; no native 110-minute browser run is started.

Mochi's wrapper promotes top-level `playbackReady` and `runtimeActivated`; nested
source manifests retain both false flags. Pebble promotes only `playbackReady`.
Mika, Pip, family, all atlas/still bytes and calibration descriptors are unchanged.
The new source policy has revision `yard-player-rollout/active-r1` and freezes the
exact supplied closed predecessor. No production environment/query bypass exists.

After root review applies the overlay, run
`node scripts/yard-active-contract.mjs APPLIED_CHECKOUT` in a fresh process without
policy hooks. `verifyPromotionContract({rootDir})` checks every transition, the
archived CLOSED verifier files and all historical closure members against the
closed Git commit. Changed manifest/profile bytes are resolved through their
preserved originals for historical verification; the active files separately
must equal the exact defined promotion. Contract files do not hash themselves.

`await verifyActiveRuntime('/app')` is the image-safe semantic check. It reads
only backend source and the active contract copied by the existing Dockerfile.
It returns eight actors, six props, ten ready bindings, policy revision and
canonical-JSON contract SHA-256. It needs no tests, public source tree, recovery
files or Git. Run it alongside the existing image-owned compatibility command.

## Integration boundary

This patch intentionally does not rewrite the existing CLOSED verifier, its
negative controls, the candidate six-source transformer or CI. They must remain
available against the preserved closed A artifact. Root must explicitly select
the ACTIVE verifier and ordinary production-image acceptance lane for B; an
ACTIVE tree must not be fed through the old CLOSED default assertions. A branch
with these preparation tools alone remains closed.

Before deployment, require final root review, ordinary production-image API/PG
acceptance, warm service-worker A-to-B-to-A verification and the existing
pre-switch guard. The latter independently checks the actual live predecessor
against the code-owned digest, healthy build and quarantine capability. No
production marker query, migration or deployment happens during preparation.
