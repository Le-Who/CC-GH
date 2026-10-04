# Yard environment scene-render probe

This isolated static Canvas page combines the four authored environmental exports with the actual one-second Basil/Fountain source clip. It is a presentation experiment, not eight-actor, gameplay, API, save or release acceptance.

The page imports the exact source-owned `scene-layout.mjs` and `environment-layout.mjs`, the unchanged production `AtlasCache`, and the original `yard-playzones.js` mask. Ground paint uses `conservativeMaskStrips` through the shared environmental renderer; the earlier diagnostic raw-strip array is not consumed. Uniform artwork fit, sprites, gate and diagnostic anchors share one camera projection. The gate remains at 90,68; Fountain at 40,40. The bowl's 25,83 position is a labelled diagnostic crosshair, not an invented new-camera bowl image. Anchors/mask guides can be toggled.

Play uses the real monotonic clock for exactly 1000 ms, sampling the 26 original 25 Hz rows from source 4000 through 5000 ms inclusive. It then holds the endpoint, without looping or retiming. A missing atlas keeps the last complete canvas, including its previous backing/CSS dimensions, while the source clock continues. A requested resize commits only when the requested native frame is ready; media waits and requested/displayed source indices are recorded separately. Reset returns to the exact first source sample. Only the visible and next pages are selected in the unchanged production cache, with one decode at a time.

The 64 MiB ledger includes retained/pending atlas images, all four environment images, the DPR-scaled canvas and conservative old/intermediate/new allocations during resize. It does not claim to measure browser-process RAM or GPU-driver allocations. Each environment file is SHA-verified before decoding. CI also hashes actual HTTP response bodies for all nine WebPs and source modules.

The static server permits only GET/HEAD access to frozen manifest-listed files. It has no API or persistence handlers. No application startup, player account, server snapshot, save or economy operation is used.

## Checks and evidence

Run source checks with `node --test preview/yard-environment-probe/source-checks.test.mjs`. Browser CI uses the existing repository's frozen pnpm lockfile and official Playwright runner:

```sh
pnpm exec playwright test -c preview/yard-environment-probe/playwright.config.mjs
```

The dedicated push-only workflow is `.github/workflows/yard-environment-preview.yml`, restricted to branch `qa/yard-environment-preview`, with `contents: read` and sparse checkout. It does not trigger the separate UI-preview job or production deployment. It captures 320×568, 390×844 at DPR2 and 844×390 landscape. Each case records initial, held-endpoint and anchor/mask screenshots, a short real-time video, and JSON containing source clocks, decoded budgets, HTTP hashes and errors. A delayed-page resize case verifies that the old canvas remains pixel-identical until the new frame and viewport can commit together. A delayed real ImageBitmap decode checks teardown closure. Failed cases retain partial JSON plus their trace/video/screenshot. Browser JSON reports the actual distinct source indices displayed; CI establishes clock and endpoint behavior, not a guarantee that every native row was displayed under load.

The initial source preparation passed seven probe checks and the shared modules' ten tests. Browser capture remains pending the parent's authorized push; the blocked local browser route was not retried. A screenshot or source test alone must not be described as real-time browser acceptance. Landscape here is a diagnostic uniform fit, not a finished landscape UI.

The public raster payload is 1,638,232 bytes across nine WebPs. Environmental decoded bytes are 7,730,176; each full six-frame atlas is 5,898,240 bytes, and the maximum visible-plus-next pair is 11,796,480 bytes, before the explicit canvas allocation. Exact source and file hashes are in `payload-manifest.json`.
