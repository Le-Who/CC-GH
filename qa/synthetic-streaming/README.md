# Isolated synthetic browser streaming QA

This is test code, not runtime activation, final art, a source renderer, a native-source pilot, or an eight-actor acceptance test. Every pixel is generated deterministically on the ordinary CI runner. No external artwork is an input. Generated pages stay on that ephemeral runner; the workflow uploads no artifact and creates no cache.

The harness exercises actual Chromium fetch, streaming byte readers, SHA-256, createImageBitmap, canvas drawing and requestAnimationFrame. It preserves the pinned R5 atlas/runtime-cell implementation and changes only the isolated bounded encoded transport candidate. It does not modify the game or protected source.

The generator makes 125 temporal cells in 28 immutable content-hashed WebP pages. Pages contain three, four or five cells, with 10-pixel transparent crop edges and 2-pixel transparent gutters. Original synthetic RGBA, exact crops, reembedded RGBA, alpha and gutters are verified. WebP q90 RGB loss is measured, not called lossless. Generator output logs every exact dimension, compressed byte length and SHA. Browser pixel comparisons cover each page length outside timing, with an explicit two-channel-value opaque-ground canvas-round-trip tolerance.

The workload samples 124 source windows at 50 ms each over a real 6.2-second interval. The last source cell is storage-only. There is one complete aggregate prepare per animation tick, with no wait-for-ready or slow clock inside the interval. Initial current/next decoded pages and up to two future encoded pages are warmed separately and timed. No stale replacement pose is drawn when a cell is pending.

Cases: one owner, eight aliases of one URL, eight distinct synthetic owners at 8 ms and 80 ms HTTP response delay; an eight-owner 240 ms stress case; serial baselines at 8/80 ms; a portrait 80 ms prefetch case. Distinct owners replicate the same synthetic page bytes at separate URLs; they do not represent eight real actor inventories. HTTP delay is injected by the loopback server before response bytes; decode and drawing are real browser work without an injected decode delay. This measures a bounded synthetic browser workload, not real network/mobile hardware performance or visual/HUD quality.

Reports separate never-sampled source windows, sampled-but-never-ready windows, windows with any pending tick, pending actor samples and pending ticks. A nominal deadline miss makes the CI check fail; serial baselines and 240 ms stress are reported without forcing them to pass. Failed historical runs must remain linked alongside any later correction; a favorable repeat cannot establish zero stalls.

Decoded ownership stays capped at 64 MiB, 16 page slots and one decode reservation. Encoded staging has four network jobs, 24 URL owners, 2 MiB of retained/reserved buffers and 256 KiB per page. Additional conservative application-owned encoded copies are disclosed separately. Browser network caches/buffers, codec workspace, GPU memory, garbage-collector retention and process RSS are outside those ledgers.

The phone portrait and landscape DPR2 cases instantiate two canvas backings and reserve the shared UI/catalog, sixteen still owners, and cottage/mask bytes. Those reserved assets are not actually drawn. The static target is already in the still reserve and is not charged twice. Full sixteen-page capacity rejects desktop 1280x720 DPR2 and phone DPR3 before allocating their backing stores. Desktop DPR1 is only a capacity calculation, not a hardware/UI acceptance claim.

Run ordinary unit checks with `npm test`. Fixture generation and browser timing intentionally require CI. The workflow uses one standard public Ubuntu runner, timeout 10 minutes, read-only contents, credential persistence disabled, no environment, no secrets, no deploy, no cache or artifact upload. Its push trigger is restricted to the isolated QA branch. No pull request is opened because the repository's general pull-request workflow would start a much broader CI matrix.

## Preserved prior evidence

Earlier native software-canvas timing was variable: a quiet normal eight-owner run drew 992/992 windows but had five pending actor samples; a quiet 80 ms prefetch run drew 982/992, comprising eight never-sampled windows and two sampled-never-ready windows, with nineteen pending actor samples. A loaded run drew 885/992, while another earlier favorable run drew 992/992 but still had pending samples. These are historical native measurements, not browser or art qualification, and are not overwritten by this synthetic check.

The three R5 vendor hashes are asserted by tests. Candidate prefetch source is isolated under `src/`; any ordinary correctness fix and its first failing run must be documented separately.

## First browser run and fixture correction

[Run 37323285517](https://github.com/Le-Who/CC-GH/actions/runs/37323285517), commit c397f864e0738f26dbf3f2cc87bf7fcae97f76b7, failed and remains valid negative evidence. Its first synthetic noise recipe produced 138,624–177,570-byte pages, substantially above the intended roughly 42–62 KB workload. Eight distinct URL owners failed closed at the encoded-capacity boundary during warmup; later cases were not run. One owner and eight aliases had zero pending samples, but the 80 ms one-owner case missed one unsampled source window during an rAF gap. Pixel comparisons were exact for the three tested page lengths. This is not a zero-stall qualification.

The revised deterministic generator calibrates only its noise coverage to 44/52/55 KB targets for three/four/five-cell pages, within 15%, before any browser timing. It allows at most five encodes per page and logs the actual bytes and noise coverage. Geometry, edge/gutter proof, source clock, budgets and cache code are unchanged. This fixes an unrepresentative test input; it does not relabel the initial oversized-input failure as a pass or choose fixture parameters using timing results.

[Run 37323945664](https://github.com/Le-Who/CC-GH/actions/runs/37323945664), commit d0101c9ec0dfc253b5e6f74f9566267fea53d7b5, stopped at the generator's byte-range assertion before browser timing. Recipe v3 restricts the contrasting stripe pattern to the calibrated noisy patch as well as logging every calibration attempt. Both earlier failures remain preserved; no cache implementation or acceptance threshold was relaxed.
