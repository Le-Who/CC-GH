# Finite native Yard redraw qualification

This packet targets one new commit on `67d68fec4b750c5ead5b759ebbfec3239d6f3da5`, one new branch `qa/yard-placement-redraw-20261006`, and one standard Ubuntu Actions job with a ten-minute maximum. Attempts above one and subsequent branch pushes do not run. No deployment, secrets, asset upload, remote fixture, paid API, or Work/Codex task is involved.

## What is fresh

- Both ordinary default and explicitly enabled preview production builds, including the existing asset, startup, closure, GPU and CPU resource guards.
- The unchanged `qa/yard-canonical-acceptance/hud.spec.mjs`: all eleven accepted viewport/locale tuples, touch and DPR2 checks, inventory/shop/placed controls, and compact landscape dialog reachability. These remain baseline rendering.
- One continuous, untrimmed DPR2 mobile Chromium recording using real Express authentication and disposable PostgreSQL. It buys two pots through the real UI, places both, enters move mode, moves the pointer through six steps while held, cancels, re-enters, commits a changed blocker position, then completes the alternate inspection route. No screenshot, canvas readback, playback-speed change, frame insertion or frame removal is used in this recorded context.
- Explicit warm selection `?yardPipPreview=1&yardPipGrounding=pip-garden-grounding-v1`, with scene, renderer and contact-shadow recipe assertions at every boundary. A separate unrecorded context verifies the missing selector stays baseline. This recording checks integrated behavior; prior run37529243802 remains the paired art comparison. No claim of fresh full acquisition recovery coverage replaces the four prior acquisition cases.
- Synchronous presentation, lifecycle, pause-clock, pointer/ownership, admission/resource, opt-in and invalid-size source guards remain required. These are source checks, not compositor proof.

## Encoded-frame gate

The untouched raw clip includes purchases and both initial placements. The measured interval starts only after the second placement is committed and the stage is unobscured. At that point the recorder adds a fixed sixteen-CSS-pixel diagnostic square in the document's top-left corner. It has no layout footprint or pointer handling, remains outside the scene crop, and changes no scene pixels or rendering implementation.

Magenta means the stage is exposed. A MutationObserver follows the actual native dialog's `open` attribute and changes the square to cyan while the dialog obscures the crop. Native `showModal()` places its `::backdrop` above this square: the existing CSS is `#253c307a`, so cyan composites to approximately `[18,162,156]`. VP8/yuv420p codec fixtures verify marker quantization separately from the unchanged scene-dropout threshold. Only that distinct neighborhood (each channel within16) identifies dialog occlusion. Raw cyan, dimmed magenta and unknown colors fail after arming. The observer runs before paint without a timer or RAF, so the first encoded frame after dialog close is again stage-visible and measured; no close/resize boundary is discarded.

Every post-arm encoded frame is accounted for as an exposed-stage sample or an explicitly listed modal-occluded sample. Exact frame/time intervals and counts are retained. The receipt requires four exposed intervals separated by three dialog intervals (move selection before cancel, move selection before commit, inspection selection), a recognized marker throughout, and at least ten final exposed route samples. Unobscured stage samples must contain zero flat/dropout frames. The detector makes no scene-continuity claim for pixels covered by the dialog. Missing marker, missing/truncated interval evidence, decoder failure, unexpected phase count or invalid crop fails closed. The full raw video is never trimmed or modified.

The fixed340×280 crop at25,100 must remain inside the actual stage at all recorded transition boundaries, including the reduced stage during placement controls. Offline Node code decodes the completed recording through FFmpeg and detects the known CSS background (`166,189,106`, tolerance8, at least95% of crop) or another nearly uniform missing scene (maximum channel standard deviation2). This gate targets complete-stage dropouts; human review still checks any partial/layer dropout, actor/prop visibility, motion, lighting and HUD appearance. Encoded25fps samples are not physical-device frame timings.

The exact detector was run against preserved original run37507167039's raw WebM, SHA256 `ff54410518a69cebcdeda4d8b25d38e41ec5cd209825cd7f148bbd39103959d6`. It finds exactly frame117/4.68s and frame124/4.96s in the historical post-ready range. `original-failure.json` retains that result and provenance. The raw original remains unchanged in the prior preserved evidence; this branch does not re-upload it as a new asset.

## Gate and evidence semantics

A successful job requires source/build/browser gates, every one of the eleven HUD cases, complete functional transitions, raw video preservation and zero encoded flat/dropout frames in every exposed-stage interval. The receipt still says visual review required. There is no automatic subjective visual acceptance and no production activation.

All newly persisted originals are losslessly archived together using the previously tested package helper. The upload, summary and outer archive allowance must fit8MiB; retention is three days. No video truncation or evidence subset is used to obtain a pass. Over-budget output is an explicit failure. Because GitHub cannot retain an over-cap full artifact within this limit, only the bounded failure summary would be downloadable in that case; complete originals remain in the failed job until runner removal. The prior eleven-HUD artifact was3.08MiB including its outer allowance, leaving approximately5.3MiB for the continuous video and new diagnostics.

## Assemble and seal

1. Independently review and apply the existing three-file redraw patch and nine-file warm runtime patch to the exact67d parent; their shared scene file must combine hunks, never overwrite one patch with the other's full file.
2. Copy this packet's `changes` files into the candidate checkout. The exact union is `allowed-files.json`; no package, lockfile, runtime asset, API, economy, database or deployment path is allowed.
3. Review the final combined diff, then set `allowed-files.json`'s `finalized` to true. Run `node qa/yard-placement-redraw/seal.mjs` before committing. It refuses extra/missing dirty files and writes every actual combined file's byte count and SHA256. The manifest itself is the only non-self-hashed path.
4. Run the source checks and syntax/discovery checks without starting a local browser or server. Do not infer a browser pass from these.
5. Only after coordinator review, publish the one exact commit on the one new branch. The guarded push is the sole Actions trigger. Do not dispatch or rerun.
6. Download and inspect the unchanged native video and original HUD images, alongside the encoded frame report and exact source receipt, before accepting visual behavior.

Each of the three post-arm dialogs remains open for 200 ms before its action, making its native occlusion observable in the 25 fps stream. This is ordinary UI waiting; the scene clock and route speed are unchanged. The QA-local inspect helper retains the shared target, plan-count and phase assertions after one dialog opening.
