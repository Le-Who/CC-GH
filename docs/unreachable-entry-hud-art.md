# Retire five unreachable shared HUD exports

Base: `53e5fbf6b7b774ccf35ade0244dc6690519ea15f`, following the bounded entry
fixture correction. This supersedes the proposed compatibility-only HTTP 200
classification; retaining unused files only for a historical proof was not
justified.

## Exact consumer audit

| Retired public path | Why no supported live consumer remains |
| --- | --- |
| `/games/hud-redesign/blox/metric-chip.webp` | Current Blox renders its `bx-*` HUD. The shared metric variable only feeds global `.stat-chip`, generic game stats and generic event-log CSS. Immersive global stats are hidden from route selection onward. `GamePlayHud` and `GameEventLog` have no runtime callers. |
| `/games/hud-redesign/bubbo/metric-chip.webp` | Current Bubbo renders its `bb-*` HUD; the same unused shared consumers apply. |
| `/games/hud-redesign/match3/metric-chip.webp` | Current Match3 renders its `m3-*` HUD; the same unused shared consumers apply. |
| `/games/hud-redesign/merge/metric-chip.webp` | Merge v3 renders `ml-*` controls. The retained `LegacyMergeGame` fallback also renders custom `merge-hud-*` controls, not shared metric chips or generic event-log components. |
| `/games/ui-surfaces/yard-panel.webp` | This is an unused generic dialog fallback, not the live Yard dock. Every one of the twelve supported `.yard-game-screen[data-yard-screen]` states supplies its own `--yard-screen-panel-art`; the base rule also provides the Shop panel. The live dock uses `room/dock-panel.webp`. |

Relevant runtime sources: `src/App.jsx`, `src/app/gameChunks.jsx`,
`src/app/shell.jsx`, current game presentations, `LegacyMergeGame.jsx`,
`CompanionYardGame.jsx`, and `companion-yard.css`.

The HUD editor changes visibility/geometry/style parameters; it does not render
these files as asset thumbnails, choose these URLs, or override the immersive
CSS rule that hides global stats. No non-game screen, selected Yard dialog,
closed legacy Yard route or Legacy Merge state was found to consume the five
exports. Mere remaining CSS-variable declarations were not counted as use.

## Retirement and preservation

Five byte-identical WebP exports move from `public/` to the established
`assets-source/imagegen/hud-redesign/qa-exports/` archive. This removes 371,894
bytes from the published asset set. Original standalone source art and Git
history remain intact.

The source-only policy now prevents publishing or regenerating these five
paths. The source generator already honors that policy. Generator/source
inventories mark the archived outputs `runtime: false`; the public manual
manifest already contains none of these five references. Dead CSS URLs and the
unused Yard dialog fallback are removed. Current Yard panel selection,
controllers, state, saves and assets remain unchanged.

`docs/entry-hud-retirement-inventory.json` records each exact old/new path, byte
count and SHA-256. The historical twelve-file WebP proof JSON is unchanged.
Its native pixel check reads archived paths for these five exports and current
public paths for the other seven. The browser proof now requires no runtime
request plus HTTP 404 (never SPA HTML) for the retired paths, then verifies the
archived bytes and browser decode dimensions. The other seven exports still
require actual page requests.

## Evidence and limits

- The new focused retirement test passes: exact five-path classification,
  archive SHA-256/length, absent public files, source URL removal, source-only
  generator metadata and all twelve current Yard screen skins.
- All five archived images decode with installed Pillow to the exact width,
  height, RGBA length and RGBA SHA-256 in the unchanged historical proof.
- 49 focused entry/browser-contract/Home/runtime-URL/HUD tests pass.
- HUD validation passes for eight games/fifteen presets, with the same existing
  Blox/Match3 reserve warnings. Syntax/diff checks pass.
- Full asset-pipeline/Sharp, build and genuine browser retirement/404 validation
  require the next CI run. No local dependency install or browser restriction
  was bypassed, and no full-suite pass is claimed.

The rejected compatibility-only patch must not be applied alongside this one.
