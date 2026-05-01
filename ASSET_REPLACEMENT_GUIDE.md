# Asset Replacement Guide

This guide covers replaceable visual and audio assets for the CC-GH Telegram Mini App.

## Where Assets Live

- App icons: `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Pet bodies and expressions: `public/pets/*.svg`
- Cozy Yard runtime art: `public/games/companion-yard/**`
- Manual override manifest: `public/assets/manifest.json`
- Generated runtime manifest: `public/assets-runtime/manifest.json`
- Editable source/provenance files: `assets-source/**`
- Built production output: `dist/` after `pnpm run build`

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

The runtime resolution order is:

```text
public/assets/manifest.json manual override
-> public/assets-runtime/manifest.json generated asset
-> stable legacy public/games or public/pets fallback path
-> procedural/synthesized fallback where the game supports it
```

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

The current Pixi scenes have procedural fallback graphics, so the app works even when custom scene art is not present.
To add replaceable scene art, place files under `public/assets/` and register them in:

```text
public/assets/manifest.json
```

Suggested paths:

```text
public/assets/backgrounds/farm.webp
public/assets/backgrounds/blox.webp
public/assets/backgrounds/match3.webp
public/assets/backgrounds/merge.webp
public/games/companion-yard/backgrounds/meadow.png
public/assets/sprites/crops.webp
public/assets/sprites/gems.webp
public/assets/sprites/merge-items.webp
```

Recommended image formats:

- WebP for backgrounds and spritesheets.
- PNG only when alpha fidelity is more important than file size.
- SVG for simple UI marks and pet overlays.

Keep large backgrounds under roughly 500 KB each for Telegram mobile startup speed.

## Merge Alchemy Table Assets

Merge supports manual override paths through:

```text
public/assets/manifest.json -> graphics.games.gachaMerge
```

Generated runtime assets can also be placed under:

```text
public/games/gacha-merge/backgrounds/table.png
public/games/gacha-merge/ui/libraryRail.png
public/games/gacha-merge/ui/exchangePanel.png
public/games/gacha-merge/fx/essenceOrb.png
public/games/gacha-merge/fx/recipeGlow.png
public/games/gacha-merge/items/<live_item_id>.png
```

The asset pipeline maps those files to stable keys such as `gachaMerge.background.table`, `gachaMerge.fx.essenceOrb`, and `gachaMerge.items.seed`. If a path is empty or a runtime file is missing, the Pixi scene uses the procedural Alchemy Table fallback with colored tokens and level badges. Keep item icons square, transparent, and readable at `48x48`; UI panels should be slice-friendly or safely scalable at mobile widths.

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

The checked-in editable starter sources live under `assets-source/games/companion-yard/source-svg/`. The app loads the PNG/WebP runtime paths above or their generated `/assets-runtime/` equivalents.

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

Manifest values win when present; missing keys fall back to the committed `public/games/companion-yard/**` paths.

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
