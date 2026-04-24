# Asset Replacement Guide

This guide covers replaceable visual and audio assets for the CC-GH Telegram Mini App.

## Where Assets Live

- App icons: `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Pet bodies and expressions: `public/pets/*.svg`
- Asset manifest: `public/assets/manifest.json`
- Built production output: `dist/` after `pnpm run build`

Files under `public/` are served from the site root. For example:

```text
public/pets/basic_dog_body.svg -> /pets/basic_dog_body.svg
public/assets/sfx/tap.webm -> /assets/sfx/tap.webm
```

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
public/assets/backgrounds/room.webp
public/assets/sprites/crops.webp
public/assets/sprites/gems.webp
public/assets/sprites/merge-items.webp
```

Recommended image formats:

- WebP for backgrounds and spritesheets.
- PNG only when alpha fidelity is more important than file size.
- SVG for simple UI marks and pet overlays.

Keep large backgrounds under roughly 500 KB each for Telegram mobile startup speed.

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
