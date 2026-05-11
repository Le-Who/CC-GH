# Final Game State Asset Progress

Last updated: 2026-05-10

## Scope

This file marks the completed visual asset pass generated from `docs/FINAL_GAME_STATE_PROMPT_PACK.md` with the `generate2dsprite` workflow.

Included:

- raw/generated source sheets under `assets-source/imagegen/`
- separated transparent runtime fallback PNGs under `public/games/`
- rebuilt runtime assets under `public/assets-runtime/`
- asset-pipeline coverage for the new visual sets
- key-color leak verification for generated and runtime PNG outputs
- Blox and Farm Pixi runtime bundle/fallback keys
- Blox and Farm scene rendering against generated sprite assets instead of shape-only placeholders

Not included in this visual sprite pass:

- prompt-pack audio WAV/MP3 generation and audio manifest integration
- full UI/gameplay rewrites to consume every optional decorative image outside the final sprite runtime wiring

## Completion Status

Visual asset pass: DONE

Generated/processed fallback assets:

- Building Blox: 53 assets
- Brain Blitz / Trivia: 45 assets
- Farm: 90 assets
- Garden Shelf support: 24 assets
- Gem Crush / Puzzling Potions support: 20 assets
- Gacha Merge support: 19 assets
- Bubbo Bubbo support: 46 assets
- Cozy Yard / Companion Yard support: 40 assets

Total separated visual assets written by the processing pass: 337.

Runtime manifest output:

- total assets in `public/assets-runtime/manifest.json`: 542
- `pixi.blox`: 53 entries
- `pixi.bubbo`: 47 entries
- `pixi.farm`: 90 entries
- `pixi.match3`: 51 entries
- `pixi.merge`: 90 entries

Machine-readable status:

- `assets-source/imagegen/final-game-state-asset-status.json`

QC contact sheets:

- `assets-source/imagegen/qc-contact-sheets/blox.png`
- `assets-source/imagegen/qc-contact-sheets/blox-readable.png`
- `assets-source/imagegen/qc-contact-sheets/bubbo-bubbo.png`
- `assets-source/imagegen/qc-contact-sheets/companion-yard.png`
- `assets-source/imagegen/qc-contact-sheets/farm.png`
- `assets-source/imagegen/qc-contact-sheets/gacha-merge.png`
- `assets-source/imagegen/qc-contact-sheets/garden-shelf.png`
- `assets-source/imagegen/qc-contact-sheets/puzzling-potions.png`
- `assets-source/imagegen/qc-contact-sheets/puzzling-potions-readable.png`
- `assets-source/imagegen/qc-contact-sheets/trivia.png`

## Cutout And Key-Color Status

Legacy final-state pass used `#FF00FF` as a temporary key for older generated sheets. That is not the required method for new Blox, Match-3, or Garden Shelf source art.

Readable Blox/Match-3 correction pass: no fixed chroma-key export. Source sheets are background-cleaned with border sampling plus connected-component cutouts, and outputs reject opaque `#FF00FF` or `#123456` pixels.

Processing rule:

- prefer real alpha from image generation
- if the generator paints a background, sample the sheet border and flood-fill background-like pixels instead of relying on one fixed key color
- use source-sheet grid cells only to locate intended objects; final runtime bounds come from connected visible pixels plus safe padding
- reject opaque `#FF00FF` and `#123456` pixels as key-color leakage in readability outputs
- protect legitimate interior purple/magenta/blue art by avoiding broad global scrubs on existing non-keyed runtime assets

Verified result:

- generated asset status leak count: 0
- generated legacy grid-sliced outputs with opaque edge pixels: 0 of 333
- post-build exact/strict key-color scan across `public/games`, `public/assets-runtime`, and `dist/assets-runtime`: 0 leaks

## Runtime Wiring

Completed:

- `blox.*` and `blox.fx.*` keys are available through the runtime manifest and legacy `/games/blox/` fallbacks.
- `farm.*`, `farm.crops.*`, `farm.fx.*`, `farm.harvest.*`, `farm.seeds.*`, and `farm.ui.*` keys are available through the runtime manifest and legacy `/games/farm/` fallbacks.
- Blox renders the generated background, board frame, cell, block tile, tray, piece preview, and clear-effect art.
- Blox cells are laid out inside the measured transparent opening of the generated board frame, not over the decorative frame border.
- Blox tray previews render from live piece cells and color mappings, so preview shape, color, and block scale match board placement.
- Farm renders the generated field background, plot bases/overlays, crop phase art, and plot interaction effects.

Latest visual correction pass (2026-05-10):

- tightened Blox board cell spacing and mapped grid placement to the board-frame inner opening so cells remain inside frame borders
- normalized tray preview rendering to live piece-cell geometry and piece colors, removing mismatched fixed preview silhouettes
- regenerated readable Blox block tiles/cells/clear FX and composed Blox piece previews from those generated block tiles
- regenerated Match-3 normal pieces, special pieces, drops, and clear-burst art with distinct silhouettes, then switched runtime drawing to preserve source aspect ratio instead of forcing every piece into a square sprite
- added `pnpm run assets:readability` as the reproducible pixel-component cutout pass for the readable Blox/Match-3 sources

## Verification

Commands completed:

- `node scripts\process-final-game-state-assets.mjs`
- `pnpm run assets:build`
- `node --test --test-concurrency=1 tests/assets-pipeline.test.js tests/asset-runtime.test.js tests/perf-guard.test.js tests/perf-build-guard.test.js tests/sceneGeometry.test.js`
- `pnpm run build`
- `pnpm run perf:guard -- --suite assets.pipeline-entry-scan`
- `pnpm exec playwright test tests/e2e/mobile-ui-matrix.spec.js --project=chromium --workers=1`
- `pnpm test`
- strict key-color leak scan across generated/runtime/dist PNG outputs
- alpha-edge scan across generated legacy grid-sliced outputs
- visual screenshot QA across 320x568, 390x844 at DPR 2, 414x896, 768x1024, 1024x768, and 1280x720
- `git diff --check`

Result:

- focused tests: 31 passed
- full test suite: 448 passed
- production build: passed
- asset perf guard: passed
- mobile functional QA: passed
- visual viewport QA: passed
- key-color scan: 0 exact/strict `#FF00FF` leaks in the legacy final-state outputs
- readability key-color scan: 0 opaque `#FF00FF` or `#123456` leaks in the Blox/Match-3 component-cut outputs
- alpha-edge scan: 0 opaque border pixels in generated legacy grid-sliced outputs
- whitespace check: no errors; line-ending warnings only in generated/rewritten files

## Remaining Work

The remaining prompt-pack asset category is audio. Audio is outside the `generate2dsprite` visual cutout workflow and should be handled as a separate pass against `src/services/audioManager.js` and `public/assets/manifest.json`.
