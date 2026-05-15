# Settlement Region Asset Cleanup

## Rationale

The previous Settlement map stack split the playfield into a scenic background,
a separate island/ground layer, and multiple road overlays. That did not match
the mockup direction, where forests, rivers, cliffs, paths, pads, and plaza read
as one continuous isometric region. It also made the runtime fragile: a polished
foreground field could still look pasted onto unrelated terrain underneath it.

The replacement uses one runtime map asset:

- `public/games/settlement/map-region-settlement-playable.webp`

This asset is a 4096x2304 opaque WebP region. It includes the forest valley,
river, waterfalls, cliffs, bridges, roads, central plaza, and empty construction
pads in one image. It intentionally does not include UI, text, characters,
completed buildings, selection overlays, or resource icons because those remain
runtime layers.

## Source And Preparation

The selected source image and generation record live under:

- `assets-source/imagegen/settlement/map/map-region-settlement-playable-source.png`
- `assets-source/imagegen/settlement/map/map-region-settlement-playable-prompt.md`
- `assets-source/imagegen/settlement/map/playable-region-manifest.json`

`pnpm run settlement:region:prepare` converts the checked-in source PNG to the
runtime WebP. The script does not stitch in the retired forest background or
old road art.

## Deleted Runtime Assets

These files were removed because the new region asset replaces their runtime
roles:

- `public/games/settlement/map-background-forest-valley.webp`
- `public/games/settlement/map-ground-settlement-base.webp`
- `public/games/settlement/road-network-village.webp`
- `public/games/settlement/road-network-town.webp`
- `public/games/settlement/road-network-city.webp`
- `public/games/settlement/road-network-capital.webp`
- `public/games/settlement/road-main-isometric.webp`
- `public/games/settlement/road-cross-isometric.webp`
- `public/games/settlement/road-plaza-market.webp`

The rejected interim `map-field-settlement-playable.webp` and its source
manifest were also removed because that asset was a symbolic node-board field
and did not match the mockup.

## Runtime Cleanup

- `MAP_ASSETS` now exposes only `region` for the map base.
- Settlement Pixi preload now loads `MAP_ASSETS.region`.
- The old road container, road fade effect, staged road metadata, and unused
  PNG helper were removed.
- Existing Settlement coordinate data is mapped onto the 16:9 region at runtime
  so buildings, props, villagers, construction preview, and VFX remain separate
  interactive layers.

## Validation Contract

`tests/settlement-assets.test.js` asserts that the obsolete background, ground,
field, and road assets stay deleted and that the runtime asset list contains the
single region asset. `pnpm run settlement:assets:audit` must continue to report
zero runtime PNG/JPG files, zero missing processed textures, and zero asset
scan failures.
