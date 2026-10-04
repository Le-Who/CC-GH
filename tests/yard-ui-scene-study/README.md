# Actual Yard DOM + static Canvas art study

This optional entry renders the current, unmodified `CourtyardGame`, its CSS, existing production `src/fonts.css` declarations, RU labels, wooden UI surfaces and real catalog previews together with a Canvas2D source-art composition. It is an art/layout study. It does not establish gameplay, animation, collisions, API behavior, update/rollback safety or release acceptance.

The existing `yard-redesign-preview` fixtures and tests remain unchanged. This entry reuses their translation/HUD wrappers and mutation-blocked transport, then supplies a separate fictional fixed snapshot. The genuine `yard-ui-functional-qa` lane is unchanged. No app/server flags, production imports or saved state are rewritten.

The fixed owner is fictional. Balances are 1,250 treats and 12 shiny treats. Saved IDs and coordinates are derived from the explicitly selected source manifest: Moon Lamp, Sun Cushion, Yarn Mouse and Fountain Bowl. The checked study placements are Moon60,40, cushion64,68, mouse72,54 and fountain40,40. This keeps the source author’s reviewed cushion position identical in the DOM fixture and Canvas. The single reserved fixture visit is Basil (`basil_turtle`) at the fountain. There are no bowl, gift, album or other actor render claims. The original 54,66 cushion comparison overlapped the frozen Basil silhouette; that comparison does not establish placement validity. Selected study coordinates remain art/scale inputs, not saved-player mutations or validator acceptance.

DOM supplies the header, both currency chips, dock, status, dialog, item cards, labels and controls. The Canvas contains only the source environment and props/one frozen Basil pose. A harness-only rule hides the old background image because the Canvas draws the selected scene plate. No screenshot HUD, duplicated UI drawing, recreated controls or changed production layout CSS is used. The existing catalog previews remain the same authored objects; they are not substituted with the scene-study renders.

## Input boundary

The scene author's separate package must provide:

- `preview/yard-coherent-frame/static-scene-adapter.mjs`, exporting `createStaticCourtyardScene(canvas, {onError, inputsUrl})` and returning `ready`, a diagnostics object, and the ordinary scene lifecycle methods.
- Its adjacent `composition-study.mjs`, `model.mjs` and `environment-perimeter.mjs`, plus the model's normal `src/games/companion-yard-v2/scene-layout.mjs` and `game-logic/yard-playzones.js` dependencies.
- One explicitly selected manifest below `public/yard-static-study/`, including the frozen layout, frame/prop placements and six relative, hash-identified image URLs. The six IDs are `plate`, `plate10`, `subject`, `moon`, `cushion` and `mouse`; their filenames and hashes come from the selected manifest. The earlier revised-azimuth images are comparison-only and are not the selected capture.

No manifest/camera is selected by default. The browser URL must supply `sceneInputs=/yard-static-study/<selected>.json`, and the capture command requires the same path in `YARD_SCENE_STUDY_INPUTS`. The selected package must contain exactly those four reviewed prop IDs; the fixture derives their coordinates from its frozen records. It hashes the selected manifest and compares that identity, camera and frame/time with the Canvas adapter’s diagnostics. Manifest URLs are restricted to the local study directory.

The adapter’s diagnostics must expose `inputSha256`, `cameraDirection`, `sourceFrame` and `sourceTimeMs` from the actual selected input. Frame/time expectations are not hardcoded by this harness. The adapter decodes the six real images, checks their hashes/dimensions, draws the composition at the actual Canvas CSS size and DPR, and resizes using the actual scene box. Its readiness, failures, media receipts, source frame and composition metrics are saved with the screenshots. The scene remains a static frame; elapsed browser time is not animation evidence. Each drawn prop/composite pivot must equal the renderer’s projection of the corresponding fixed snapshot coordinate.

## Bounded capture

The separate workflow triggers only on the exact `qa/yard-ui-scene-study` branch, with read-only repository permission and no deployment or application server. Its explicit selected manifest is `/yard-static-study/inputs-elevation45-original-azimuth.json`, using 45° elevation with the original azimuth `[5.66, -8, 9.799775507632814]`. The workflow and browser pin manifest SHA256 `8916da3249a78b7b5b6f5371276f93a1cd99c48997214f3df07c136b3c840e85` and check that direction against the selected frame and projection input. The scene author’s exact frozen package must be present before publishing that branch. It records the exact commit/tree, component/harness source hashes, selected camera/frame/placements and verified media hashes. The baseline UI is commit `8a5bfc0b6c7d2aaf66d205d5dbf51d68a60a2f0d`, tree `7a5ea1ff031f6b46d8727d89b5201e37dc54bcb4`, including the actual-C-tested storage recovery.

Run only after the source-art choice and combined source review, in an authorized browser-capable environment with the repository's existing dependencies:

`YARD_SCENE_STUDY_INPUTS=/yard-static-study/inputs-elevation45-original-azimuth.json pnpm exec playwright test --config tests/yard-ui-scene-study/playwright.config.mjs`

This separate config runs one case at 320×568, 390×844/DPR2 and 844×390. Each captures the actual normal screen and the actual open placed-item catalogue, producing six labelled viewport PNGs and six metric JSONs. Before each screenshot it decodes all four surface URLs read from the actual production CSS custom properties, and explicitly loads the existing production Nunito 400/600/800/900 Cyrillic/Latin faces before awaiting `document.fonts.ready`. Metrics record the declared font stack and registered faces; a missing Nunito registration or failed decode fails the capture. No substitute font declaration or dependency is added. It also checks loaded catalog images, Canvas/media readiness, source identity, matching DOM/Canvas dimensions, opaque scene coverage, both currency chips, no horizontal overflow, unclipped fixed controls, 44px targets, and real Escape/close interactions. It intercepts any `/api/` attempt as a failure and never returns a successful mutation response.

Retain original PNGs/JSONs and failure traces once; no HTML report or duplicate attachment copies are required. The Playwright config has one worker and no retries. Preparing these files does not launch a service, browser, CI job or publication.
