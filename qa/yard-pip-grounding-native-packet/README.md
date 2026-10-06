# One private R1 garden-grounding comparison

This is one unaccepted art candidate, `pip-garden-grounding-v1`, beside the exact existing R1 baseline. Preparation runs source checks and a private build only. No browser, listener, external job, publication or production activation is performed by this packet's preparer. Native images and motion remain unmeasured until the reviewed finite lane runs. Stop after this candidate if the garden screenshots and real walking slice do not show a clear benefit.

## Artistic hypothesis and exact parameters

The current cool, broadly filled actor and T2 props read as pasted onto the warmer garden. Keep the existing upper-left key direction and every light position. Give that key more influence, reduce the white fill/rim, and make the current contact lobes slightly wider and easier to read. All colors below are linear RGB, not sRGB hex values.

| Parameter | Exact baseline | One candidate |
|---|---|---|
| Ambient color / intensity | (.78,.83,.93) / .55 | (.86,.87,.82) / .55 |
| Key color / intensity | (1,1,1) / 1.8 | (.99,.96,.88) / 2.15 |
| Fill color / intensity | (1,1,1) / .76 | (.93,.96,1) / .44 |
| Rim color / intensity | (1,1,1) / 1.2 | (1,.98,.94) / .42 |
| Body lobe radii / strength | .34 × .44 / .21 | .39 × .49 / .29 |
| Each paw lobe radii / strength | .13 × .105 / .29 | .15 × .12 / .37 |

The key remains at relative (-2.4,4,3), fill at (2.5,2.4,1.7), and rim at (0,2.8,-2). The mild key tint and neutral ambient retain room for white belly/face readability. No blanket tint, tone-map change, material/coat change or image is added. Contact radii are source-space coefficients multiplied by the same 16/12 world scale. The body offset (+.02,-.025), each actual sole center, axes, height broadening, exponential paw-height attenuation, root-height attenuation and raised-support hiding are unchanged. The source contact version remains `pip-flat-ground-contact-v1`; the diagnostic recipe identity is separately recorded.

The approved geometry, dimensions, surface density, planner, route timing, item footprints, economy and saved state remain unchanged. Pip GLB stays 3,972,384 bytes / SHA256 `74edd9400bcb69266ce670c977f05bf3ae8c62b448877f4ee34967565815c45b`; T2 stays 120,776 bytes / `c2f7c317511cfd84605bde3f6e32ffd24d35ee66a3d8bc365ae8d0742557f3fd`.

## Narrow implementation

Only two existing modules have private overlays: the contact module gets the two bounded numerical profiles and diagnostic selector; the optional renderer forwards that selector. The actual scene lighting is first created unchanged, then the QA renderer-factory wrapper adjusts only the four existing light colors/intensities. All baseline light parameters are asserted before changes; restoring baseline uses their exact original values. No scene/resource-cap overlay, quality-copy module, copy texture, render target, new geometry buffer or material texture is used. The production tree is untouched.

The audited Vite entry overlay, current static fixture, asset closure, bounded diagnostics, correctness receipt and lossless packager are reused. The historical rejected filter packet at parent commit is not compiled into this lane. The emitted module graph explicitly rejects its copy/resource modules and requires the actual scene and planner worker.

## Exact source and lane boundary

- Parent: `9275f870f923184f15bc03a25979ac2667566ac2`, tree `b967bfaf977338ba521f87efe1bf3816ec6fb659`
- That parent is product `2e28925ee2b235abeee01a48f03ede9cae211a3a` plus the already-public 35-file historical QA packet. Every parent tree entry, including historical QA, stays byte-identical
- New branch: `qa/yard-pip-grounding-ab-20261006`
- New workflow: `.github/workflows/yard-pip-grounding-ab.yml`
- New packet prefix: `qa/yard-pip-grounding-native-packet/`
- One added commit on the exact parent, first-created branch push only, attempt 1, zero retries, no dispatch/PR/schedule trigger
- Preflight checks the exact parent/tree, every unchanged tree entry, complete additions-only allowlist/hash manifest, original source pins, successful product correctness receipt and other workflow triggers before setup
- One standard `ubuntu-24.04` job, maximum 10 minutes; native child hard timeout 240 seconds, internal 225-second watchdog allowing cleanup; artifact retention 3 days
- Locked pnpm 10.28.2 with lifecycle scripts disabled and one official locked Chromium; no database, secrets, cache, deployment, model/asset generation or external API

After independent coordinator review, install only the paths in `file-allowlist.json`. `qa/seal.mjs --reviewed-final-source` regenerates exact reviewed hashes on the specified parent without committing or launching anything. The preparer does not publish or invoke that review acknowledgment.

## What the finite native run captures

One browser, three sequential contexts, no overlap. Each preceding page/context/renderer is disposed before the next starts. Viewport is 390×844, DPR2; actual world WebGL raster remains 390×648. This is Chromium evidence, not a phone GPU/FPS measurement.

1. Measurement owner: enter canonical items through the real UI, select the first of the same two current T2 records at (98,118) and (72,145), click Inspect, wait for the real planner to settle, then hold that actual rendered pose. There is no skeletal or route injection. Capture exact baseline and candidate RGBA, unscaled black/white native composites, and actual DPR2 garden screenshots. Check actor and both independent T2 coverage, unchanged opaque actor alpha, exact candidate repeat, exact baseline restoration, fixed garden pixels outside the union of both contact footprints, unchanged pose/camera/presentation/records/resources, and unchanged calls/triangles/copies. Color change and white-region brightness statistics inform visual review; neither proves improvement.
2. Clean baseline motion owner: repeat that UI route at the application's unchanged real 1× clock. No hold, readPixels, isolation, screenshot or diagnostic background in this context. Preserve the complete raw Playwright video, including startup and final settled hold.
3. Clean candidate motion owner: repeat the same route with the single recipe. Apply the same clean-video constraints, prove real movement, alternating planted feet, lifted feet, actual sole-centered shadow and exact height attenuation. Both motion owners and the still owner must end with exactly equal settled samples. Keep raw clips untouched; any later startup trim must be one contiguous interval at original speed.

Motion telemetry starts immediately before the real Inspect click and is bounded to 32 observations, sampled at 250 ms plus movement/stationary transitions, with omitted-observation counts and a separate complete final sample. It never changes the clock or pose. Each complete bounded trace is preserved as a separate lossless JSON original; the 128-KiB report retains its filename/count and final sample. Recordings preserve every visible frame independently of telemetry sampling.

The static transport fixture is current-registry-validated and read-only. Every non-GET, authenticated or out-of-closure request fails. It does not requalify authentication, acquisition, server mutation or persistence. Browser requests are fulfilled from the hashed closure with no HTTP listener.

## Resource and evidence bounds

Original caps remain 64 MiB owned RGBA, 16 MiB known CPU buffers, 12 MiB estimated GPU. Existing contact remains 60 CPU bytes, 60 GPU bytes, one draw/two triangles. Geometry is 4,028,332 bytes; estimated GPU remains 10,094,636 bytes. There are zero copy textures and zero added draws. Known CPU including encoded background, bone texture and one still-only 24,960-byte row scratch is 15,137,756 bytes; motion contexts omit that scratch. The row scratch is released on disposal. Full-frame assembly and screenshot decoding occur in Node, outside the app ledger. JS object overhead, transient serialization, compositor/driver allocation and physical GPU release are unknown.

Three warmups and 20 measured submissions per held mode report CPU submission only. No screenshot/readback/download occurs inside the measured intervals. GPU/compositor completion and real-device cost are not claimed.

Every stage/native original, including both raw videos and failures, is handed to the unchanged audited `qa/yard-canonical-acceptance/package-evidence.mjs` and `evidence-zip.py`. A deterministic lossless ZIP rehashes every original; the origin map records only group-prefix renames. The total upload bound is 8,388,608 bytes including summary and a 4,096-byte outer-wrapper allowance. No lossy recompression or omission is allowed. Over-cap/unsafe/failed evidence yields an explicit bounded failure receipt, never a partial green upload. Missing/failed/skipped stages, missing video owners, missing exact-pose proof or failed disposal cannot become green.

## Review decision

Accept only if the actual garden screenshots and clean walking/contact video visibly improve environmental coherence while preserving the white belly/face, eyes and fur detail. Reject orange cast, crushed body shading, oversized/floating contact, new haloing or no useful visual improvement. A mechanical pass does not activate the recipe or imply art acceptance.

Preparation verification: 12/12 focused grounding/real-renderer/raster checks and 22/22 harness/CI/lossless-packager checks passed. One private real-app build compiled the actual scene, renderer, recipe and planner and closed 2,358 files. No local native run occurred. Final local validation details and the source-only proposal patch are provided beside this packet rather than included as runtime assets.
