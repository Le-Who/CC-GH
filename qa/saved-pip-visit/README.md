# Saved Pip R1 visual qualification

## Result

Native qualification passed in GitHub run [37577182143](https://github.com/Le-Who/CC-GH/actions/runs/37577182143), commit `e4e477973aa386a331cf339ca9bdeb819737216f`: 31 Node tests with none skipped, 60 phase PNGs across three viewports, and seven sampled 1× clips. The complete 102-file archive is preserved in Library. Exact repeat/scrub/fresh-renderer pixel comparisons passed at retreat-mid in each viewport; this is not an every-pose pixel-equality claim. The earlier local Chromium permission failure remains historical evidence in `browser-probe.txt`.

The genuine saved visit is `visit_v2_rs_7391a59e452822c1096b299310893dd3`, replayed from a committed synthetic-account transaction. Its presentation plan hash matches the saved proposal. This packet never invents or substitutes a route.

Technical CPU checks passed: 18 actual-model poses, 1,800 repeated evaluations, all 11 bones' local translation, quaternion, scale, and world matrices. Same-time, reverse/random scrubbing, and newly parsed model comparisons have maximum delta 0. Across 71 phase, stage and gesture boundaries, the maximum native matrix delta from 0.001 ms before to the boundary is 7.99×10⁻¹⁵. These checks do not establish native pixels, compositor clipping, animation quality, or continuous duration.

Four borrowed assets and 53 relevant baseline source files are pinned by the provenance files. Pip R1, background, planter, and food art are unchanged. Artifact counts in provenance are authoritative.

## Integration finding and verified correction

The original live food selector rejected the genuinely worn `uses:1` target because its legacy `canonicalStorageValid` accepts only `uses:0`. The failure is preserved in `legacy-food-selector-failure.json`.

The final packet now consumes the exact source-generated v3 snapshot from the fresh transaction replay. It preserves `uses:1`, `storageVersion:3`, `canonicalVisitProtocol:"yard-canonical-authoritative/v1"`, and `mutable:false`. The explicit version-aware food seam selects `kibble`. Seven selector checks pass: genuine v3 and legacy unused compatibility, plus rejection of unversioned/v2 used targets, wrong protocol, future version, and exhausted wear. This is source/CPU verification, not evidence of a released API or integrated gameplay host.

## Prepared native capture

`index.html`, `harness.mjs`, and `run-native.mjs` use the actual direct Three renderer, unchanged source assets, camera projection, source sampler, lighting recipe and resource admission. There is no substitute character or trajectory. The fixture mounts only the renderer at canonical gameplay pixel density; it does not reconstruct the app HUD or certify full UI behavior. Viewports are 320×568 DPR1, 390×844 DPR2, and 844×390 DPR1, with mobile/touch contexts.

`capture-plan.json` requests 20 lossless PNG frames per viewport and seven 1× transition segments: entrance/approach/peek, three sparse gestures, retreat through 84% release into neutral rest, neutral rest, and exit. Captured WebM originals include startup and are preserved, with an explicit performance-time/server-time trace. A reviewer must inspect the clips in real time. The runner compares exact retreat-mid PNGs after repeated same-time evaluation, scrubbing, and renderer replacement.

The runner checks every pinned source/asset hash before Chromium and checks each source response again. The packet has been syntax checked and all 44 browser-import graph modules compile in memory with no warnings. Native execution was verified in the run above. No continuous 45-minute or 110-minute test, ordinary app navigation, full Yard acceptance, or deployment is implied.

## Execution in an authorized native environment

Use Node 24, Chromium, and the repository's existing @playwright/test. No package mutations are required. Set `YARD_SOURCE_ROOT` to the exact source checkout, `YARD_ASSET_ROOT` to its byte-verified assets, `YARD_DEPENDENCY_ROOT` to its package root, and `YARD_OVERLAY_ROOTS` to the colon-separated sealed overlay directories (or an empty value after those files have been integrated). Optionally set `CHROMIUM_EXECUTABLE` to the installed Chromium binary and `YARD_VISUAL_OUTPUT` to a directory with sufficient reserved capacity. The default source and asset root is the integrated checkout.

Commands from this packet directory:

- `node --import ./register.mjs ./qualify-cpu.mjs`
- `node ./run-native.mjs`

`prepare-inputs.mjs` copies the exact source-generated snapshot, verifies its relationship to the saved player, and checks the saved proposal hash against the supplied plan. The final packet already contains this verified v3 projection; CI does not need to regenerate it. The runner serves files by Playwright request interception and does not require a local HTTP listener. It still requires a permitted Chromium process.

## Acceptance scope

Independent review inspected entrance/exit boundary pixels, selected phase frames, and timestamped clip frames. Native entrance/exit, retreat and quiet rest are visible. Rear-facing sparse gestures remain subtle at gameplay scale. Full-speed continuous full-stay inspection, ordinary UI integration, and artistic acceptance remain owed. Technical results and artistic conclusions are separate.

## Integrated-checkout CI command

After placing this packet in `qa/saved-pip-visit` and integrating the six pinned overlay source modules into the exact baseline checkout, run from the repository root:

```sh
YARD_SOURCE_ROOT="$PWD" YARD_ASSET_ROOT="$PWD" YARD_DEPENDENCY_ROOT="$PWD" \
YARD_OVERLAY_ROOTS='' \
node --import ./qa/saved-pip-visit/register.mjs ./qa/saved-pip-visit/qualify-cpu.mjs
YARD_SOURCE_ROOT="$PWD" YARD_ASSET_ROOT="$PWD" YARD_DEPENDENCY_ROOT="$PWD" \
YARD_OVERLAY_ROOTS='' \
node --import ./qa/saved-pip-visit/register.mjs ./qa/saved-pip-visit/verify-food-projection.mjs
YARD_SOURCE_ROOT="$PWD" YARD_ASSET_ROOT="$PWD" YARD_DEPENDENCY_ROOT="$PWD" \
YARD_OVERLAY_ROOTS='' YARD_VISUAL_OUTPUT="${RUNNER_TEMP:-/tmp}/saved-visit-native-evidence" \
node ./qa/saved-pip-visit/run-native.mjs
```

An existing authorized CI job must retain the complete PNG/WebM/JSON output. This packet does not create or dispatch a job. Review the exact overlay hashes before integrating.
