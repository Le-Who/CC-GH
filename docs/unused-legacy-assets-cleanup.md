# Unused legacy asset cleanup, 2026-10-04

Base: `67dd04ebcacc46dabefe525614a6eb17dda44d5a`.

## Result

- Deleted **163 unused files, 14,128,062 bytes** from the current Git tree. This includes 148 imported Bubbo/Puzzling Potions sample-game files (122 PNGs, 18 WAVs, 2 MP3s, 2 fonts, and 4 Spine metadata files), 14 unused Merge exports, and one unreferenced surface atlas.
- Preserved **33 source/QA files** byte-for-byte where they are images, moving them outside `public/`. Extraction manifests have updated destination metadata.
- Removed **48 files, 11,227,855 bytes (10.71 MiB)** from Vite's unconditional public-copy input. This is deployment-size reduction, not a claim that every removed file previously downloaded at startup.
- No renderer, active runtime URL, pipeline key, frozen Yard input, license, Git history, remote artifact, rollout flag, or production deployment was changed.

Per-file decisions, source hashes, byte counts, and source-only destinations are in [the machine-readable inventory](unused-legacy-assets-inventory.json). The Git deletion patch is recoverable; no history was rewritten.

## Reference audit and retained closure

The audit covered imports, absolute and relative literal URLs, CSS URLs/custom properties, manual and generated manifests, interpolated paths/catalog IDs, preload code, backend static serving, Vite copying, Docker copying, generator inputs/outputs, and test/document-only references. A missing full filename match was never sufficient reason to delete a file.

| Family | Current consumers and decision |
| --- | --- |
| Old `assets-source/games/bubbo-bubbo` and `puzzling-potions` imports | No current executable source, build script, recovery fixture, or test reads these directories. The manual manifest had descriptive source strings, now corrected. Obsolete directory listings in the historical asset brief were updated. Current `assets-source/imagegen` production originals and upstream license files remain. |
| Match-3 semantic PNGs | Eight keys in `assetBundles.js`, `assets-pipeline.config.mjs`, and `GAME_ASSET_BUNDLES.match3` remain. Current generation reads `assets-source/imagegen/match3`, not the removed upstream artwork. |
| Garden source sheet and quest panel | Real `LegacyPlantArt` fallback in `GardenViewShared.tsx`, pipeline key `gardenShelf.sheet.transparent`, and shared `src/index.css` chip skin remain. `Art(name)` constructs `/games/garden-v2/${name}.webp`; these apparently unreferenced filenames are used. |
| Legacy Merge | `LegacyMergeGame.jsx` and `mergeScene.js` construct `gachaMerge.${section}.${id}` keys. All 71 currently generated Merge entries and all 48 item files remain. `itemPanel`/`recipePanel` exports are conservatively retained because the legacy renderer still names these keys. Fourteen unused exports have no renderer ID, manual override, or pipeline entry. Three additional PNGs remain as HUD generator inputs under source-only `semantic-inputs/`. |
| Legacy Yard | `CompanionYardGame.jsx`, the Yard catalog, CSS menu-panel URLs and pipeline enumerate backgrounds, food, goodies/worn/broken variants, visitors/poses, companions, expressions, mementos, UI and FX. All runtime PNG/WebP art and all 119 generated entries remain. Editable `HUD.svg` moved to source storage; the runtime `HUD.png` remains. This preserves the unmigrated-account bridge and rollback path. |
| Current-four and family Yard | All `public/assets/yard-*` media and metadata, proof/handoff inputs, `recovery-tools/yard-family-frozen`, runtime mapping, hashes and 706-file delivery contract remain unchanged. Source proof data is not treated as unused game art. |
| HUD exports | `shell.jsx` constructs semantic-icon URLs dynamically, so every referenced icon remains. Active CSS/HUD skins remain. Only unused duplicate `screen-panel`, `dialog-panel`, `tool-slot` exports and unused generic panel copies move to `assets-source/imagegen/hud-redesign/qa-exports`; source originals and chromakey/export QA remain. Both extraction manifests move to source storage. |
| Settlement | `assetRegistry.js` constructs sprite/processed paths from explicit registries and IDs; originals, trimmed variants, manifests and generation inputs remain. No deletion based solely on a missing literal full path. |
| Pet SVGs, icons, thumbnails, audio hooks | Explicit `game-logic/pet-assets.js` and manual manifest references remain. Manifest PWA icons, computed home-thumbnail URLs, shared shell SVGs and all current v2/v3 art remain. |

`loadAssetPipelineEntries()` still returns **199 entries**. The content and 199 keys of `public/assets-runtime/manifest.json` are unchanged. No frozen Yard delivery proof regeneration is needed.

## Shipping boundary and regressions

- Vite normally copies all of `public/`; moving source-only exports out removes them from both development serving and production builds.
- `retired-public-assets.mjs` now fails Vite configuration if an old generator or stale checkout reintroduces any retired/source-only public path. It does not silently delete local files.
- The existing `perf-build-guard.mjs` also rejects these paths in final `dist`, and rejects literal retired JS/CSS references.
- The HUD and old sheet generators now route required source-only exports outside `public/`, and the sheet generator skips the newly deleted Merge outputs while retaining sheet cell positions.
- `.dockerignore` already excludes `assets-source/*` (except the build cache). Docker's final image copies `dist/`, not `public/` or `assets-source/`. These changes preserve that boundary.
- Tests pin image hashes across moves, verify every current pipeline input exists, verify frozen Yard inputs still exist, reject reintroduced imports, scan runtime source/manifest/preload references, and simulate stale public and dist copies.

## Public inventory

Counts and byte sizes below compare committed public input before and after cleanup. Generated family media materialized by Vite is separately pinned and unchanged.

| Public family | Before files | Before bytes | After files | After bytes |
| --- | ---: | ---: | ---: | ---: |
| `public/assets-runtime/companion-yard` | 119 | 3030868 | 119 | 3030868 |
| `public/assets-runtime/gacha-merge` | 71 | 1854108 | 71 | 1854108 |
| `public/assets-runtime/garden-shelf` | 1 | 738042 | 1 | 738042 |
| `public/assets-runtime/manifest.json` | 1 | 10009 | 1 | 10009 |
| `public/assets-runtime/puzzling-potions` | 8 | 78158 | 8 | 78158 |
| `public/assets/game-shell-cycle.svg` | 1 | 1501 | 1 | 1501 |
| `public/assets/game-shell-meditation.svg` | 1 | 1657 | 1 | 1657 |
| `public/assets/manifest.json` | 1 | 4428 | 1 | 4449 |
| `public/assets/yard-mika` | 46 | 10688359 | 46 | 10688359 |
| `public/assets/yard-mochi` | 52 | 11923605 | 52 | 11923605 |
| `public/assets/yard-pebble` | 58 | 22809531 | 58 | 22809531 |
| `public/assets/yard-pip` | 103 | 25104528 | 103 | 25104528 |
| `public/games/blox-v2` | 18 | 2044056 | 18 | 2044056 |
| `public/games/bubbo-bubbo` | 1 | 1053 | 1 | 1053 |
| `public/games/bubbo-v2` | 14 | 2034652 | 14 | 2034652 |
| `public/games/companion-yard` | 132 | 54344370 | 131 | 53360436 |
| `public/games/gacha-merge` | 90 | 13624701 | 73 | 12660503 |
| `public/games/garden-living` | 56 | 15532436 | 56 | 15532436 |
| `public/games/garden-shelf` | 2 | 2896894 | 2 | 2896894 |
| `public/games/garden-v2` | 10 | 414024 | 10 | 414024 |
| `public/games/home-thumbnails` | 9 | 53708 | 9 | 53708 |
| `public/games/hud-redesign` | 103 | 11315396 | 82 | 4638545 |
| `public/games/match3-v2` | 21 | 4784724 | 21 | 4784724 |
| `public/games/merge-lab-v3` | 23 | 1746934 | 23 | 1746934 |
| `public/games/puzzling-potions` | 9 | 319416 | 9 | 319416 |
| `public/games/settlement` | 425 | 55825603 | 425 | 55825603 |
| `public/games/trivia-v2` | 10 | 243008 | 10 | 243008 |
| `public/games/ui-surfaces` | 18 | 7392192 | 9 | 4789320 |
| `public/icons` | 2 | 830046 | 2 | 830046 |
| `public/pets` | 9 | 7291 | 9 | 7291 |
| `public/sw-api-privacy.js` | 1 | 344 | 1 | 344 |

## Validation

- PASS: 27 focused asset/runtime/build-guard/HUD source-export tests, including actual PNG alpha/chromakey checks. Image QA used the existing cloud tool's Sharp 0.35.4 through an untracked local symlink; nothing was installed. Project-declared Sharp is ^0.34.5, so this is supplemental image validation, not a frozen-lockfile build.
- PASS: 28 additional service-worker/Yard atlas, source-hash, inventory and Merge-v3 preservation tests.
- PASS: Frozen Yard preflight: all 706 files / 192,653,433 bytes verified with `runtimeActivated: false`; no generated media written.
- PASS: Node syntax checks for changed executable modules; `git diff --check`.
- Full Vite build, lockfile-complete test suite, and browser/network QA are not claimed: this checkout lacks `vite`, `svgo`, `@playwright/test`, and the project dependency tree. No dependency installation, network workaround, push, or deployment was attempted.

This conservative cleanup preserves named fallbacks, source originals and ambiguous dynamically addressed art. It does not claim that retained source/QA art is a startup download, or that deletion alone fixes a rendering flash.
