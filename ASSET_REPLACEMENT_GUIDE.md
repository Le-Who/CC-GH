# Asset Replacement Guide

This guide covers replaceable visual and audio assets for the CC-GH Telegram Mini App.

## Where Assets Live

- App icons: `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Pet bodies and expressions: `public/pets/*.svg`
- Bubbo, Gem Crush, Garden Shelf, and Cozy Yard legacy/runtime fallback art: `public/games/**`
- Gacha Merge production slots: `public/games/gacha-merge/{backgrounds,ui,fx,items}/`
- Manual override manifest: `public/assets/manifest.json`
- Generated runtime manifest: `public/assets-runtime/manifest.json`
- Editable source/provenance files: `assets-source/**`
- Built production output: `dist/` after `pnpm run build`
- Full production-art backlog and per-game sheet brief: `docs/GAME_ASSET_SHEET_BRIEF.md`

Files under `public/` are served from the site root. For example:

```text
public/pets/basic_dog_body.svg -> /pets/basic_dog_body.svg
public/assets/sfx/tap.webm -> /assets/sfx/tap.webm
```

Files under `assets-source/` are not served by the app. Keep raw upstream exports, editable SVG sources, PSD/Figma exports, and other provenance files there instead of under `public/`.

## Optimized Runtime Pipeline

`pnpm run assets:build` writes optimized, content-hashed runtime files into:

```text
public/assets-runtime/
```

`pnpm run build` runs this step automatically before Vite. Do not edit `public/assets-runtime/**` by hand; change the source/fallback asset, then regenerate.

The current runtime has two supported resolver shapes:

```text
Cozy Yard and Gacha Merge:
public/assets/manifest.json manual override
-> public/assets-runtime/manifest.json generated asset
-> stable public/games fallback path or procedural fallback

Bubbo, Gem Crush, and Garden Shelf:
public/assets-runtime/manifest.json generated asset
-> stable public/games fallback path
-> procedural fallback where the game supports it
```

`src/game-runtime/assetBundles.js` is the Pixi/runtime bundle resolver and intentionally stays generated-first for Bubbo, Gem Crush, and Garden Shelf. Do not assume `graphics.games.gardenShelf` in `public/assets/manifest.json` changes Garden Shelf art unless the Garden resolver is explicitly updated.

Default output policy:

- Pixi game PNG/JPEG source art generates lossless WebP primary plus optimized PNG fallback, because Pixi receives a source list and can use the fallback.
- Garden Shelf, app icons, and Cozy Yard runtime PNG art generate WebP-only outputs where the app does not use a second generated source.
- SVG source art is optimized with SVGO and keeps `viewBox`.
- Content-hashed files are safe for immutable browser/CDN caching.
- `public/assets-runtime/manifest.json` is short-lived and should be fetched with `no-cache`.

## Pet Graphics

Pet body files must keep this naming pattern:

```text
public/pets/<skin_id>_body.svg
```

Current skin ids:

```text
basic_dog
basic_cat
basic_bunny
```

Expression overlays must keep this naming pattern:

```text
public/pets/expr_<expression>.svg
```

Current expressions:

```text
ecstatic
happy
content
neutral
sad
miserable
```

Recommended pet SVG setup:

- Use a square viewBox, ideally `0 0 512 512`.
- Keep transparent background.
- Keep body and face overlays aligned to the same viewBox.
- Avoid embedded external images inside SVG; use pure SVG shapes or committed raster files.

## PWA Icons

Replace both icon files together:

```text
public/icons/icon-192.png
public/icons/icon-512.png
```

Requirements:

- PNG format.
- Exact sizes: `192x192` and `512x512`.
- Keep important artwork inside the center safe area because `icon-512.png` is also used as maskable.

After replacing icons, run:

```bash
pnpm run assets:build
pnpm run build
```

## Game Scene Graphics

The current scenes are not one generic manifest bucket. Keep replacements on the supported per-game seams:

```text
Garden Shelf: public/games/garden-shelf/assets_*.png -> generated gardenShelf.* runtime keys
Cozy Yard: public/games/companion-yard/{backgrounds,foods,goodies,visitors,companions}/ -> generated companionYard.* runtime keys
Gacha Merge: public/games/gacha-merge/{backgrounds,ui,fx,items}/ -> generated gachaMerge.* runtime keys
Bubbo: public/games/bubbo-bubbo/images/*.png and assets_bubbo_balls.png -> generated bubbo.* runtime keys listed in src/game-runtime/assetBundles.js
Gem Crush / Match-3: public/games/puzzling-potions/images/{piece-*.png,shelf-block.png,special-*.png,background-table.png,board-frame.png,cell-empty.png,cell-selected.png,hud-bar.png,menu-panel.png,fx-clear-burst.png,drop-*.png} -> generated match3.* runtime keys listed in src/game-runtime/assetBundles.js
```

Building Blox, Brain Blitz, and legacy Cozy Farm are still mostly procedural/DOM surfaces. Add proposed keys and resolver code before shipping new production art for those games.

The current Garden Shelf and Match-3 revamp keeps image-generation provenance in project-specific folders and never in a mixed atlas:

```text
assets-source/imagegen/garden-shelf/existing-8-transparent.png
assets-source/imagegen/garden-shelf/families/*-keyed.png
assets-source/imagegen/garden-shelf/families/*-transparent.png
assets-source/imagegen/match3/pieces-keyed.png
assets-source/imagegen/match3/pieces-transparent.png
assets-source/imagegen/match3/specials-drops-keyed.png
assets-source/imagegen/match3/specials-drops-transparent.png
assets-source/imagegen/match3/ui-keyed.png
assets-source/imagegen/match3/ui-transparent.png
assets-source/imagegen/match3/background-table-keyed.png
assets-source/imagegen/match3/background-table-transparent.png
```

Run `node scripts/generate-themed-match3-garden-assets.mjs` after changing those sources. The script writes Garden runtime sheets and slices the Match-3 sheets into the 21 active `match3.*` files. HUD/backplate source art must stay empty decorative backing only: no baked score, labels, filled bars, meter fills, or pre-rendered progress state.
The current image-generation key is `#123456`; keep keyed sources project-specific and remove it with hard alpha/no despill so plant flowers, pot accents, and Match-3 piece colors are not washed out.

Recommended image formats:

- WebP for backgrounds and spritesheets.
- PNG only when alpha fidelity is more important than file size.
- SVG for simple UI marks and pet overlays.

Keep large backgrounds compact after `pnpm run assets:build`; generated `/assets-runtime/*` files are the production payload, while large editable source files belong under `assets-source/`.

## Merge Alchemy Table Assets

Merge supports manual override paths through:

```text
public/assets/manifest.json -> graphics.games.gachaMerge
```

Generated runtime assets can also be placed under:

```text
public/games/gacha-merge/backgrounds/table.png
public/games/gacha-merge/ui/libraryRail.png
public/games/gacha-merge/ui/libraryPanel.png
public/games/gacha-merge/ui/exchangePanel.png
public/games/gacha-merge/ui/actionDock.png
public/games/gacha-merge/ui/hudBar.png
public/games/gacha-merge/ui/hudIconItems.png
public/games/gacha-merge/ui/hudIconRecipes.png
public/games/gacha-merge/ui/hudIconExchange.png
public/games/gacha-merge/ui/hudIconEssence.png
public/games/gacha-merge/ui/hudIconMode.png
public/games/gacha-merge/ui/hudIconPause.png
public/games/gacha-merge/ui/actionIconGenerate.png
public/games/gacha-merge/ui/actionIconDaily.png
public/games/gacha-merge/ui/actionIconTokens.png
public/games/gacha-merge/ui/actionIconTrash.png
public/games/gacha-merge/ui/boardFrame.png
public/games/gacha-merge/ui/cellEmpty.png
public/games/gacha-merge/ui/cellOccupied.png
public/games/gacha-merge/ui/cellSelected.png
public/games/gacha-merge/ui/cellTarget.png
public/games/gacha-merge/fx/essenceOrb.png
public/games/gacha-merge/fx/recipeGlow.png
public/games/gacha-merge/items/<live_item_id>.png
```

The asset pipeline maps those files to stable keys such as `gachaMerge.background.table`, `gachaMerge.ui.hudBar`, `gachaMerge.ui.boardFrame`, `gachaMerge.fx.essenceOrb`, and `gachaMerge.items.seed`, and places any generated entries in `pixi.merge`. If a slot is absent, the scene keeps its procedural Alchemy Table fallback with colored tokens and level badges. Keep item icons square, transparent, and readable at `48x48`; board/cell art should survive scaling across the 7x5 grid. HUD and action icons are rendered by DOM controls over generated art, so they need clean silhouettes at `20-24px`. HUD/dock/panel backing art must be empty decorative surfaces only: no baked scores, labels, filled bars, meter fills, or pre-rendered progress state. Recipe/item drawers use `libraryPanel`, Exchange uses `exchangePanel`, and both panel surfaces are treated as 2:3 artwork with a centered safe content area; do not stretch panel art to arbitrary ratios. Bottom dock art sits behind live React controls, so keep it low-contrast under labels and buttons.

## Cozy Yard Assets

Cozy Yard is catalog-driven. The authoritative ids and balance data live in:

```text
game-logic/yard-catalog.js
```

Runtime art lives in:

```text
public/games/companion-yard/backgrounds/<remodel_id>.png
public/games/companion-yard/foods/<food_id>.png
public/games/companion-yard/goodies/<goodie_id>.png
public/games/companion-yard/goodies/<goodie_id>_worn.png
public/games/companion-yard/goodies/<goodie_id>_broken.png
public/games/companion-yard/visitors/<visitor_id>.png
public/games/companion-yard/companions/<species>.png
```

The checked-in editable starter sources live under `assets-source/games/companion-yard/source-svg/` and `assets-source/games/companion-yard/source-sheets/`. The app loads the PNG/WebP runtime paths above or their generated `/assets-runtime/` equivalents.

Register replacement paths in:

```text
public/assets/manifest.json -> graphics.games.companionYard
```

Backgrounds can be changed in either of two supported ways:

```text
public/games/companion-yard/backgrounds/<remodel_id>.png
```

or with a manifest override:

```json
{
  "graphics": {
    "games": {
      "companionYard": {
        "backgrounds": {
          "meadow": "/assets/yard-backgrounds/my-meadow.webp",
          "tea_house": "/assets/yard-backgrounds/my-tea-house.png"
        }
      }
    }
  }
}
```

Manifest values win when present; missing keys fall back to generated `/assets-runtime/companion-yard/**` entries, then committed `public/games/companion-yard/**` paths.

The current Cozy Yard HUD icon atlas is a direct CSS sprite at `public/games/companion-yard/HUD.png` with `HUD.svg` as the editable/source reference. It is not collected by `scripts/assets-pipeline.config.mjs` today; add it to the pipeline before treating it as a generated runtime key.

Recommended formats:

- PNG for transparent visitors, companions, foods, and goodies.
- WebP or PNG for full-scene remodel backgrounds.
- SVG only for source sketches or simple marks; runtime scene and sprite paths should stay PNG/WebP.

Goodie interaction placement is data-driven. Each `YARD_GOODIES` entry can define:

```text
capacity          maximum simultaneous visitors for the goodie
activities        per-goodie anchor points with pose, x/y offset, layer, facing, and roam amount
conditionVariants attraction/activity changes for worn and broken states
frontAssetKey     optional future overlay sprite for objects that should cover part of a pet
```

Use `layer: "back"` when the pet should appear behind the object and `layer: "front"` when it should appear in front. Keep x/y offsets small and verify the result on mobile so pets do not cover bowls or HUD controls.

To add a new visitor:

1. Add the visitor id, species, rarity, preferred food/goodie tags, pose variants, gift table, and memento threshold to `YARD_VISITORS`.
2. Add `public/games/companion-yard/visitors/<visitor_id>.png`.
3. Add or reuse attraction tags on foods/goodies so the visitor has reachable conditions.
4. Run `pnpm test` and a Room/Yard Playwright smoke test.

To add a new goodie:

1. Add the goodie id, slot size, tags, cost, durability, fix cost, capacity, activity anchors, condition variants, and asset key to `YARD_GOODIES`.
2. Add the three runtime sprites: `<goodie_id>.png`, `<goodie_id>_worn.png`, and `<goodie_id>_broken.png`.
3. Add the id to a starter inventory, shop-only catalog entry, or reward drop path if it should be obtainable.
4. Validate placement, pickup, worn/fix, visitor attraction, activity layering, selected-visitor photo capture, and mobile layout.

To add food:

1. Add the food id, cost, duration, servings, attraction tags, and rarity/gift modifiers to `YARD_FOODS`.
2. Add `public/games/companion-yard/foods/<food_id>.png`.
3. Verify `yard.buyFood`, `yard.setFood`, and visitor generation with that food.

To add a remodel or expansion layout:

1. Add the remodel id, display metadata, cost, unlock level, theme class, and asset key to `YARD_REMODELS`.
2. Add `public/games/companion-yard/backgrounds/<remodel_id>.png`.
3. If the remodel changes placement geometry, update `YARD_SLOT_LAYOUTS` without changing existing slot ids.
4. Verify mobile layout so the yard remains visible behind the setup panel and in live shell mode.

Album photos store compact render metadata only. Do not save binary screenshots or base64 art in player JSON.

## Audio

Audio is opt-in and muted by default. Missing audio files fall back to short synthesized UI tones.

Register SFX in:

```text
public/assets/manifest.json
```

Supported SFX keys:

```text
tap
success
warning
error
merge
clear
harvest
gacha
```

Recommended paths:

```text
public/assets/sfx/tap.webm
public/assets/sfx/success.webm
public/assets/sfx/warning.webm
public/assets/sfx/error.webm
public/assets/sfx/merge.webm
public/assets/sfx/clear.webm
public/assets/sfx/harvest.webm
public/assets/sfx/gacha.webm
```

Recommended formats:

- WebM/Opus for small modern browser assets.
- MP3 fallback only if a target Telegram client cannot play WebM.
- Keep SFX below 150 ms where possible.
- Normalize levels so no sound is much louder than the rest.

Example manifest entry:

```json
{
  "audio": {
    "sfx": {
      "tap": "/assets/sfx/tap.webm",
      "success": "/assets/sfx/success.webm"
    }
  }
}
```

## Validation After Replacement

Run these checks after replacing assets:

```bash
pnpm run assets:build
pnpm run build
pnpm test
pnpm exec playwright test tests/e2e/farm.spec.js tests/e2e/minigames.spec.js tests/e2e/gestures.spec.js
```

For production Docker validation:

```bash
docker build -t game-hub-ci .
```

If the browser still shows old graphics after deploy, use:

```text
/api/clear-cache
```

or clear Telegram Mini App cache from the client.
