# Private Pip quality comparison

This source-only QA lane leaves every existing tracked file at parent `2e28925ee2b235abeee01a48f03ede9cae211a3a`, tree `2085edce91144f22d1695a93630c52d3006647e3`, unchanged. It adds one workflow and this private packet. It never activates, deploys or publishes a renderer candidate or new asset.

The prerequisite correctness run `37520075881` passed: 11 HUD cases, 31 source checks and both production builds. All 59 original evidence files were rehashed. `proof/receipt.json` and `proof/MANIFEST.sha256.json` preserve the exact original bytes; `correctness-proof.json` pins their hashes and the archive identities. The separately checked private v1 build compiled the real consumer and closed 2,358 files with unchanged source hashes. Native quality and visual acceptance remain unmeasured until this lane runs.

## Exact source and launch boundaries

- Branch: `qa/yard-pip-quality-ab-20261006`
- New workflow: `.github/workflows/yard-pip-quality-ab.yml`
- One commit on the specified parent, first-created branch push only, attempt 1; no dispatch, branch update, retry, PR or scheduled trigger
- `file-allowlist.json` lists every allowed new path. `reviewed-source.json` contains every non-self byte count/hash and the exact protected base-tree digest
- After coordinator review, `node qa/yard-pip-quality-native-packet/qa/seal.mjs --reviewed-final-source` may regenerate the manifest before committing; the seal does not commit or publish
- Preflight runs before dependency installation and checks event, exact parent/tree, clean checkout, new-file allowlist, source hashes, four original overlay pins, actual successful correctness receipt and every inherited workflow push trigger
- Official pnpm 10.28.2, frozen lockfile with ignored lifecycle scripts, and its locked Chromium are the only setup. No cache, secret input, database, deployment or asset generation is involved

## What the experiment exercises

The private build uses the real application entry, `YardReleaseGame`, `CourtyardGame`, current scene owner, canonical-item scene and planner, approved R1/coat, authored T2 instances and exact existing public assets. The build-only loader injects through the existing renderer factory seam. The ordinary runtime, default-off behavior, rollback and production source files stay unchanged.

The existing static transport fixture supplies two current-registry-validated T2 records at `(98,118)` and `(72,145)`. The real UI enters canonical items and selects an inspection. The real planner settles before one actual actor pose is held. This fixture does not requalify authentication, acquisition, API mutation or persistence. All non-GET/authenticated/out-of-closure requests fail. Hashed static files are fulfilled by the browser driver without an HTTP listener.

One viewport, 390×844 at DPR2, one browser/context/page and one renderer owner are allowed. Actual WebGL backing must be 390×648. The actor-only proof redraws immediately before each 16-row read, requires at least 64 pixels at alpha byte 230 or higher, and rejects empty/prop-only/shadow-only/translucent baselines. Exactly one off-vs-identity comparison must match all 1,010,880 output-encoded premultiplied RGBA8 bytes. External Node assembly independently rechecks identity. Any actor, identity, resource or native technical failure blocks all later candidates and timing.

The separate contact candidate only changes existing body/foot strengths from .21/.29 to .25/.35. Exterior filtering keeps baseline contact. Native 390×648 RGBA, light/dark composites and actual DPR2 garden/white/black PNGs use the same held actor, camera, props and presentation. DOM/CSS backgrounds never change transparent GL clear. Added/removed alpha support, changed interior texels, unstable repeated frames, changed separated contact-prop pixels or changed fixed garden pixels fail. Both T2 instances independently require separated opaque coverage.

Props-only diagnostic visibility legitimately changes its selected T2 anchor. The QA guard derives that anchor from held T2 position/camera matrices, while actor/camera/surface/point/alpha fields stay exact. Only the two reconstructed diagnostic anchor coordinates allow 1e-9 raster pixels of matrix roundoff. Normal/actor frames require exact equality. Node regression coverage uses the real parsed R1 and optional renderer, with synthetic readback explicitly not treated as native evidence.

After technical gates, this same owner collects three warmups plus 20 measured frames per off/contact/identity/exterior mode, with no readPixels, screenshot or download inside measured intervals. Median/p95 CPU submission and total renderer-call timing, calls, triangles and copies are recorded. GPU completion, compositor completion and real-device cost remain unmeasured. Images require separate visual review: reject blur, dark/colored fringe, silhouette growth or thinning, washed-out eyes/fur, or no real benefit regardless of timing. Nothing auto-selects or activates a candidate. No motion/viewport matrix is repeated.

## Memory and evidence

Limits stay 64 MiB owned RGBA, 16 MiB known app CPU and 12 MiB estimated GPU. One live copy is 1,010,880 bytes, old/new reservation 2,021,760 bytes, and the triangle is 36 CPU/36 GPU bytes. Estimated GPU is 12,116,432 bytes; known app CPU including background, bone and two QA row arrays is 15,162,752 bytes. The worst canonical owned-RGBA reservation is 65,275,724 bytes; runtime records actual current totals.

The browser retains only two 24,960-byte readback arrays, cleared on disposal. Full-frame assembly, compression and screenshot comparisons live in Node outside the app ledger: six retained raw frames total 6,065,280 bytes; one repeat peaks at seven/7,076,160 bytes plus diagnostic strings and screenshot decode. JS, serialization, driver/program/compositor allocation and physical GPU residency/release are unknown. Off/contact in this admitted owner retain the copy reservation and are not fresh baseline-owner measurements.

Node diagnostics are count/UTF-8 bounded, preserve omission counts and first fatal evidence after overflow, and serialize against a reserved 128-KiB report allowance before writing. Browser shader/storage logs are bounded. Oversized detail becomes an explicit bounded failure receipt.

The existing unchanged `qa/yard-canonical-acceptance/package-evidence.mjs` and `evidence-zip.py` preserve every generated stage/native original in one verified lossless ZIP. Group prefixes only prevent filename collisions; an origin map preserves names. No raw original is filtered. Transfer is at most 8,388,608 bytes including summary and a 4,096-byte outer upload-wrapper allowance. Over-cap or unsafe evidence yields a bounded failure summary and fails the lane. Retention is three days, outer compression level zero.

## Execution and failure behavior

The job is capped at 10 minutes; the browser deadline is 240 seconds. There is one native run and zero retries. Fixed source-validation, exclusive private-build and packaging directories are separate under RUNNER_TEMP. Failure staging never precreates the build directory. Every PREFLIGHT/DEPENDENCIES/SOURCE/BUILD/BROWSER outcome is recorded; missing, skipped or failed stages cannot appear green. Cleanup disposes the copy, restores backgrounds and removes the direct canvas without claiming physical driver release.

Source checks run the 12 focused quality tests, eight harness tests, six CI coupling tests and five existing lossless-packager tests. The 53-test broad preview result is reused. The path audit resolves actual installed Playwright 1.58.2 paths with no launch/listener/browser/database connection. Local preparation passed 12/12 probe tests and the combined 19/19 harness/CI/packager checks. The exact event/tree preflight remains enforced on the eventual committed lane.
