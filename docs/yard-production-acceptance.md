# Bounded ordinary-production acceptance

This independent manual lane adds six serial cases to the existing reviewed
59-case candidate evidence. It does not replace that evidence or run another
110-minute trajectory. There is no deployment, image push, production database,
real Telegram credential, policy loader, alternative Vite build, or clock override.

## Required immutable inputs

Run `.github/workflows/yard-production-acceptance.yml` only after:

1. The final compatible **closed A** commit is published as an immutable GHCR
   image. A must already contain the all-marker quarantine and interrupted-outbox
   retention fix, including its frontend. An earlier unpatched image is not valid.
2. The separately reviewed active promotion is applied to **B**, including its
   active contract and exact requiredClosedPredecessor matching A.
3. Ordinary UI/guard CI has passed for the relevant commits.

Supply `active_commit`, `closed_commit` (both full 40-character SHAs), and
`closed_digest` (`sha256:` plus 64 hex characters). Repository comes from the
workflow's own repository, never arbitrary input. Missing or mismatched inputs
fail closed. The workflow verifies the active promotion contract, pulls A by
registry digest, and builds B with the unchanged Dockerfile, standard build and
`CMD ["node", "server.js"]`. B is tested by its immutable local image ID and exact
OCI source revision. A's registry digest is checked independently.

The final published B registry digest is a later deployment identity. This lane
records its locally tested B image ID; it must not be presented as a registry
publication or as verification of a different later image.

## Six cases and evidence

- Production auth, Socket.IO, all eight actual current-hour admissions, migration
  once, one durable command receipt, bad auth and foreign account rejection, and
  nonce replay after a real B container restart. Seeds select a native outcome;
  fixtures contain only ordinary historical inputs, no runtime, authored plan,
  altered timestamp, substituted policy or simulated service result.
- Mochi, Pebble and Basil: three actual production-browser cases. Each verifies
  exact final-image manifest bytes, attributed atlas pixels and HTTP bytes,
  reload, and migration/visit preservation at a real phone viewport with DPR2.
- Same origin and browser storage, service workers enabled: A → B → A through
  the actual periodic build/version update manager. Warm Mochi/Pebble metadata
  is checked against each image, including A's false / B's bounded true / A's
  false wrappers. A real UI collect commits on B, the network proxy drops its
  response, and A must preserve the nonce, B save and receipts read-only. The
  browser's own exact-nonce 409/ROLLOUT_PAUSED response must be observed, and its
  durable rollout-paused item must survive processing and A's subsequent reload.
- A rejects each JSON marker class, including malformed/future storage, without
  changing Yard or the marker; an untouched account remains on legacy behavior.

The lane inspects eight released actor IDs, ten unique ready bindings, six prop
profiles, source-obstacle identities and the image-owned active contract. The
server is never imported into a custom test factory: Docker runs its normal CMD.
Both A and B share one disposable PostgreSQL15 service. A loopback reverse proxy
only switches the upstream or drops a response; it never fabricates app data.

The native service chooses the real current-hour opportunity. Fixtures use a
saved cursor immediately before that opportunity and a native seed search for
100–110 minute visitors, leaving at least 40 minutes at seeding even near the
next hour. The service, browser and fixture process retain the system clock.
The browser portion has a 12-minute global deadline, zero retries and one worker;
the workflow has a bounded build/setup allowance. A 15-minute parent deadline
and SIGINT/SIGTERM handlers terminate owned process groups before cleanup.
Health and upstream requests have deadlines; proxy teardown destroys upgraded
peers as well as ordinary sockets. Named probe and app containers are recorded
before launch, then removed with bounded commands on success or failure.

## Results and limits

`test-results/yard-production/` contains immutable inputs/image IDs, image-owned
compatibility and active identities, actual metadata from both images, browser
traces/screenshots, production logs, current-time admissions, receipts, warm-cache
transition evidence, and the exact six-case JSON report. `PASS.json` is emitted
only for six passed tests with no skipped, unexpected or flaky result and
successful cleanup. Old success/report/fault/metadata files are removed before
starting. The report, image evidence and final proof are bound to the current
parent-owned run UUID and exact image inputs.

Local development can run `node --test tests/yard-production-contract.test.mjs`
without installation or Docker. Those guard/proxy checks are not the production
proof. The full lane is deliberately blocked until the frozen A and active B
exist; do not guess A, flip a policy with a loader, or relabel candidate evidence.
