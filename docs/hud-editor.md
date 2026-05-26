# HUD/UI Layout Editor

The HUD editor is a pre-deploy tool for tuning registered UI regions, HUD panels, action logs, bottom docks, and Pixi safe/reserve areas across CC-GH games. It is not a player feature and it does not write source files from the browser.

## Enablement

Open the local app with `?hudEditor=1`. Add `?hudPreview=1` to route the resolver through a fixed preview preset. In development, `Ctrl+Alt+H` toggles the editor and stores `ccgh:hud-editor-enabled`.

Ordinary runtime uses repo defaults only. Local layout overrides are ignored unless editor/dev override mode is explicitly active.

## Viewport And Profiles

The editor shows actual viewport, optional preview viewport, semantic profile, orientation, aspect ratio, DPR, and safe-area insets.

Production runtime selects semantic profiles, not exact device defaults. Exact presets are QA aids:

- 320x568 and 568x320
- 360x800
- 375x812
- 384x832
- 390x844 and 844x390
- 393x873
- 412x915
- 414x896 and 896x414
- 430x932
- 768x1024
- 1024x768
- 1280x720

Orientation is derived from dimensions: `width >= height` is landscape, otherwise portrait. `visualViewport` is used when available, and resize, orientationchange, visualViewport resize, and visualViewport scroll are observed.

Profile selection first matches orientation plus width/height/aspect constraints. It then falls back to the nearest same-orientation profile, `phone-default-portrait`, game base defaults, and emergency defaults.

## Region Modes

Regions are described by capabilities and a mode:

- `anchored`: anchor, x/y, width/height/min/max, z-index.
- `dock`: edge, offset, thickness/reserve, alignment, max width/height.
- `flow`: direction, gap, wrap, row/column limits, alignment.
- `stack`: ordered horizontal or vertical stacks.
- `freeform`: explicit x/y/width/height for debug or dev panels.
- `reserveOnly`: no visible DOM transform; affects safe/reserve values.
- `custom`: game-specific adapter receives resolved values or registers measurable bounds.

This keeps layout contracts shared without forcing every game into absolute positioning.

## Editing

Tap a region outline to select it. Drag region boxes with pointer or touch; editor handles stop propagation so Pixi does not receive drag gestures. Arrow keys nudge the selected region. `Shift` uses a coarse step, `Alt` uses a fine step, and snap-to-grid applies to drag/nudge when enabled. `Escape` deselects first, then closes the editor layer.

The inspector only shows fields relevant to the selected region's mode and capabilities. It also reports source, group, notes, warnings, and active profile.

Warnings include local override active, missing profile override, region outside viewport, horizontal scroll risk, unknown imported regions, and reserve/playfield concerns.

Use `Hide panels` when the toolbar or inspector covers the game. This hides the toolbar and inspector while leaving guide/region boxes and a small `Show editor` button. Use it when a target is underneath the panels: hide panels, select or drag the region, then show the inspector again. Turn off `Grid`, `Safe`, `Pixi`, `Thumb`, and `Labels` when you need a cleaner visual inspection without closing editor mode or losing local overrides.

## Practical Usage Guide

1. Start with the game and viewport you want to tune.
2. Check the toolbar: active game, semantic profile, orientation, actual viewport, preview frame if enabled, aspect ratio, and DPR.
3. Turn on `Labels` and select the smallest region that matches your intent.
4. Use the row/container region, such as `bottomDock`, only when you want to move or reserve the whole surface.
5. Use individual sub-regions, such as `bottomDock.blox`, when you want to move one tab button without changing the whole dock.
6. Use asset regions, such as `gardenSignAsset`, `bloxBoardFrameAsset`, `match3BoardFrameAsset`, `mergeActionGenerateAsset`, `yardCompanionAsset`, or `settlementPrimaryBuildAsset`, when you want to move, resize, scale, rotate, or fade a visual asset without changing the gameplay data behind it.
7. Use coordinate-space regions, such as Settlement construction slots, when you need to tune authored map coordinates that drive ghosts, anchors, or built objects.
8. Drag for coarse visual placement, then use inspector fields for exact values.
9. Use arrow keys for nudging: plain arrows use the current step, `Shift` is coarse, `Alt` is fine.
10. Use `Snap` and the grid size selector when aligning multiple regions.
11. Toggle `Grid`, `Safe`, `Pixi`, `Thumb`, and `Labels` independently; visual QA is easier when only one guide layer is visible at a time.
12. Use `Hide panels` for a clean inspection pass, then `Show editor` to continue editing.
13. Export the game or all games after each meaningful tuning pass.

## Selecting The Right Target

The editor intentionally exposes different levels of control:

- Whole layout surfaces: `appTopbar`, `globalStats`, `bottomDock`, `gameplayHud`, `eventLog`.
- Individual controls: `bottomDock.garden`, `bottomDock.blox`, `bottomDock.match3`, `bottomDock.merge`, `bottomDock.bubbo`, `bottomDock.trivia`, `bottomDock.room`, `bottomDock.settlement`.
- Visual assets:
  `gardenSignAsset`,
  `bloxBackgroundAsset`,
  `bloxBoardFrameAsset`,
  `bloxTrayPanelAsset`,
  `match3BackgroundAsset`,
  `match3BoardFrameAsset`,
  `mergeTableAsset`,
  `mergeBoardFrameAsset`,
  `mergeActionGenerateAsset`,
  `bubboBottomTrayAsset`,
  `bubboCannonAsset`,
  `triviaBackgroundAsset`,
  `triviaQuestionSurfaceAsset`,
  `yardBackgroundAsset`,
  `yardCompanionAsset`,
  `settlementPrimaryBuildAsset`,
  `settlementCollectAsset`.
- Settlement construction placement anchors:
  `settlementConstructionSlot.southwest-terrace`,
  `settlementConstructionSlot.west-meadow`,
  `settlementConstructionSlot.market-corner`,
  `settlementConstructionSlot.river-bend`.
- Safe/reserve adapters: `pixiPlayfieldReserve` and game-specific reserve regions.
- Custom measured adapters: Settlement/Yard/Garden surfaces that should be measured or constrained without being rewritten into a generic DOM layout.

If a drag changes inspector values but not the screen, first check the selected region mode and notes. `reserveOnly` regions intentionally do not move DOM; they affect Pixi/layout reserves. If the target is a row but you meant one button, select the corresponding `bottomDock.*` sub-region.

Pixi asset regions are visual calibration handles. They move or scale visual sprites such as frames, table art, tray panels, or cannon art, but they do not move gameplay hit targets or rules. Keep Pixi frame assets aligned with the underlying playfield unless a deliberate visual offset is being tested.

## Settlement Building Placement Coordinates

Settlement construction slot regions are map-coordinate adapters, not generic DOM assets. Their `x`, `y`, and `scale` values are authored coordinates in the Settlement source map coordinate space. The same resolved values drive the construction ghost, the placement ring, the confirm affordance, and the built building sprite for that slot.

Use `?hudEditor=1&panel=construction` and switch to Town/Settlement. Turn on labels, select a region like `settlementConstructionSlot.southwest-terrace`, and either drag the region box or type exact `x`, `y`, and `scale` values in the inspector. The editor converts drag movement from screen pixels back into `settlementMap` coordinates before saving overrides.

When tuning these slots, keep `Grid` and `Labels` on until the right slot is selected, then use `Hide panels` for visual inspection. Export the Settlement layout and promote it like other HUD defaults. Do not edit only `CONSTRUCTION_PANEL_DATA.placementSlots` for deploy calibration unless the HUD default is updated too; repo defaults are the production layout contract.

## Pixi Safe/Reserve Values

Pixi reserve values come from the resolved `pixiPlayfieldReserve` region. `PixiGameHost` passes `hudLayout`, `layoutSafeArea`, `hudReserves`, and individual top/bottom/left/right reserves into scene state. It also publishes reserve values as `data-hud-reserve-*` on `.pixi-host`.

Existing Pixi resize/update flow remains active. If reserves change without container dimensions changing, the host schedules a scene resize/update.

Pixi asset regions are published by scenes through the shared Pixi asset adapter. The editor shows DOM handles over those published bounds; the Pixi scene consumes the same resolved region values for x/y, scale, opacity, rotation, and visibility. This keeps the editor contract shared without turning gameplay nodes into DOM nodes.

Settlement uses custom adapters for canvas/HUD/panel registrations and construction-slot coordinate regions rather than being rewritten into the shared Pixi host.

## Local Overrides

Editor overrides are stored in `localStorage` under `ccgh:hud-layout-overrides:v1`. They are saved debounced and applied only while editor/dev override mode is active.

Use toolbar reset actions for selected region, current profile, current game, or all local overrides.

## Export And Import

`Export game` exports the active game. `Export all` exports every visible game. `Copy JSON` copies the visible export. `Import JSON` validates before applying; malformed JSON and invalid schema are rejected without crashing the app.

Imported unknown local region ids are quarantined as warnings in the editor path. Repo defaults must not contain unknown region ids.

## Promotion And Validation

Browser export does not write source files. Save the export as an artifact, then promote it locally:

```bash
pnpm run hud-layout:validate
pnpm run hud-layout:promote -- path/to/export.json
```

If pnpm argument forwarding is unavailable:

```bash
node scripts/hud-layout-promote.mjs path/to/export.json
```

Promotion validates schema, game ids, region ids, profiles, merge/fallback behavior, and numeric ranges before writing `src/app/hud-layout/defaultLayouts/{gameId}.json`.

## Pre-Deploy Workflow

1. `corepack enable`
2. `corepack prepare pnpm@10.28.2 --activate`
3. `pnpm install`
4. Start the app with the existing package script, usually `pnpm run dev`.
5. Open `/?hudEditor=1`, optionally with `&hudPreview=1`.
6. Tune each visible game across phone portrait, phone landscape, tablet portrait, tablet landscape, and desktop landscape.
7. Export all layouts.
8. Save the export to an artifacts path.
9. Promote the export into repo defaults.
10. Run `pnpm run hud-layout:validate`.
11. Run tests and build.
12. Run viewport/orientation QA.
13. Commit defaults, docs, tests, and any adapter changes.

## Adding A Region

1. Decide whether the region is visual-only, layout-affecting, safe-area-affecting, Pixi-affecting, coordinate/anchor-tunable, or custom.
2. Register id/capabilities in `src/app/hud-layout/registry.js`.
3. Add a base default in the game JSON.
4. Add semantic profile overrides only where needed.
5. Connect through `HudRegion`, `HudEditableRegion`, `useHudRegion`, `data-hud-region`, the Pixi asset adapter, a coordinate-space adapter, or a custom adapter.
6. Add validation/test coverage.
7. Run portrait and landscape QA.

## Troubleshooting

Editor not visible: confirm `?hudEditor=1`, localStorage flag, and no production/admin guard blocking debug UI.

Import rejected: validate the JSON shape, schema version, game id, region ids, and numeric fields with `pnpm run hud-layout:validate` or the promote script.

Local overrides not applying: confirm editor mode is active; production player flow intentionally ignores local overrides.

Layout differs in Telegram: check `visualViewport`, safe-area variables, stable height, and run a mobile/touch pass.

Orientation mismatch: verify actual dimensions; the resolver does not rely only on `screen.orientation`.

Pixi scene not resizing: check `pixiPlayfieldReserve`, `data-hud-reserve-*`, and whether the scene reacts to resize/update.

Settlement slot box not visible: open the construction panel with `panel=construction`, pan/zoom the Settlement map until the slot is in view, and keep labels enabled. Slot regions follow the camera and represent source map coordinates, so they can be offscreen when the map camera is elsewhere.

Horizontal scroll at 320px: inspect bottom dock, max widths, transformed regions, and any game-specific panels that bypass the registry.
