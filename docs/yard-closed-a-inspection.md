# Collect the exact closed A promotion inputs

QA-only preparation. Root owns publication and launch. Apply this patch only to
an isolated `qa/yard-closed-a-inspection` branch based on merged A, never to A/B
or the production branch. It adds only a dedicated workflow, collector, focused
tests and this note. It never builds/pushes an image or starts server.js/DB/SSH.

Fixed reviewed identities:
- A commit: 962323817b77eff1a4a20be71b38f8d462b9054f
- A tree: 0e872a180c5f8d8f0983ea651b1aa865252d359e
- A deploy run: 37190465940 (must finish successfully)
- Public health: https://games.tri.mom/api/health, normal TLS, no redirects.

Before publishing the isolated QA branch, root supplies the real observed
published digest and completed deploy attempt in `.github/yard-inspection-target.json`.
That file is intentionally absent from this patch. Its exact three keys are
`format: "yard-closed-a-inspection/v1"`, `imageDigest` (real `sha256:` digest), and
`runAttempt` (actual positive integer). No fabricated sample values or latest tag.
Missing/invalid target fails before login/pull. Root first independently verifies
that the digest is the output actually published by the specified A deploy run.

The one bounded job uses the existing ephemeral GitHub token with contents,
packages and Actions read permissions. It sparse-checks out the three receipt
modules at exact A and imports A's unchanged authoritative CI verifier. This
requires all CLOSED jobs, matrix shards, proof steps and the full deploy run to
have succeeded, allowing genuine targeted reruns. Current A source/tree must
match the fixed identities. It pulls only the supplied immutable registry digest.

Only sanitized Id/RepoDigests/OCI revision/baked APP_BUILD_ID are retained. The
compatibility probe executes the image ID in a named, read-only, no-network,
capability-dropped container, with no mounts or environment injection. A fresh
private CID file and ownership label bind cleanup to this invocation; an
existing-name collision never authorizes removal. Cleanup must succeed before any verified output is written. Public health has one
15-second request and must be HTTP200/status ok/postgres true/buildId exact A.
A connection failure means collection failed; it does not diagnose an outage.

On success the run-specific artifact contains:
- A-image.json
- A-compatibility.json
- A-health.json
- A-ci-receipt-verified.json
- A-closed-inputs.json (the exact `closed` section for promotion)
- INSPECTION-RECEIPT.json (source/QA/run provenance and every file SHA256)

The collector does not output arbitrary image environment, token values, player
rows or health internals. No report is uploaded unless collection succeeds. Root
retrieves the actual artifact, checks its GitHub API digest and file hashes, then
uses A-closed-inputs.json to fill the prepared promotion inputs. Final transition
approval must still supply acceptance.reviewReference. The existing pre-switch
guard must independently bind the actual live container to this healthy A image;
the collector does not claim that public health alone proves the live digest.

After extracting and verifying the artifact, filling inputs needs no Docker:

```js
const input = JSON.parse(readFileSync('promotion-inputs.partial.json'));
input.closed = JSON.parse(readFileSync('A-closed-inputs.json'));
input.acceptance.reviewReference = actualFinalApprovalReference;
validateActivationInputs(input);
writeFileSync('promotion-inputs.verified.json', JSON.stringify(input, null, 2));
```

Then use the existing `scripts/yard-active-promotion.mjs` from exact clean A,
with the verified inputs and a new external output directory. Review the 21-file
overlay and short parity result. Ordinary B build/image/API/PG/warm-cache checks
remain mandatory; no new 110-minute native run follows from this collection.
