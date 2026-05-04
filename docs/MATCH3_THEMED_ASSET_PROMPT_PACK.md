# Match-3 Themed Asset Prompt Pack

This pack defines the current standalone visual direction for Match-3: an alchemy-table / puzzling-potions skin that keeps the existing gameplay contracts and replaces the generic shared-glass look with game-specific board, HUD, menu, piece, drop, and FX art.

## Runtime Contract

Active source files live under:

```text
public/games/puzzling-potions/images/
```

Image-generated source and cutout files live under:

```text
assets-source/imagegen/match3/pieces-keyed.png
assets-source/imagegen/match3/pieces-transparent.png
assets-source/imagegen/match3/specials-drops-keyed.png
assets-source/imagegen/match3/specials-drops-transparent.png
assets-source/imagegen/match3/ui-keyed.png
assets-source/imagegen/match3/ui-transparent.png
assets-source/imagegen/match3/background-table-keyed.png
assets-source/imagegen/match3/background-table-transparent.png
```

Generate Match-3 in its own image-generation calls. Never combine these sheets with Garden Shelf plants or Merge/Alchemy Table assets.

Generated runtime keys are loaded through `pixi.match3`:

```text
match3.piece.dragon
match3.piece.frog
match3.piece.newt
match3.piece.snake
match3.piece.spider
match3.piece.yeti
match3.shelf.block
match3.special.blast
match3.special.column
match3.special.colour
match3.special.row
match3.background.table
match3.board.frame
match3.board.cell
match3.board.cellSelected
match3.ui.hudBar
match3.ui.menuPanel
match3.fx.clearBurst
match3.drop.gold
match3.drop.seeds
match3.drop.energy
```

## Shared Chroma-Key Rule

Use keyed source art, then remove the key locally:

```text
The background must be one perfectly flat solid #123456 chroma-key color, with no shadows, gradients, texture, reflections, floor plane, lighting variation, vignette, checkerboard, or transparent-looking effect. Do not use #123456 anywhere in the subject, frame, panel, potion, creature, tile, glow, or decoration.
```

## Reference Art Prompt

```text
Use case: stylized-concept
Asset type: themed reference art for a mobile Match-3 game
Primary request: Create a cohesive alchemy-table art direction reference for a Puzzling Potions style Match-3 board.

Scene: warm tabletop alchemy workshop, compact board area, brass and wood frame, potion ingredient tokens, soft emerald highlights, amber reward light, cranberry accent details, no readable text. The game should feel standalone and handcrafted rather than generic glass UI. Visual tone: cozy, tactile, magical, readable on mobile, not dark horror, not neon sci-fi.

Deliverable: one clean reference image showing board frame, cell tile style, HUD bar style, menu panel style, six normal pieces, four special pieces, three drop tokens, and clear-burst FX. Use a perfectly flat #123456 chroma-key background outside the objects. No labels, no typography, no UI copy.
```

## Normal Pieces Sheet Prompt

```text
Use case: game-asset-sheet
Asset type: transparent-centered Match-3 normal pieces
Canvas and layout: one sheet on flat #123456 chroma-key, 2 rows x 3 columns, six centered circular potion-creature tokens, generous gutters, no labels.

Pieces:
1. Dragon fire token: warm red-orange orb, tiny dragon-wing silhouette, amber rim.
2. Frog water token: green-blue orb, friendly frog face marks, pale aqua rim.
3. Newt earth token: green herb/newt silhouette, moss-gold rim.
4. Snake air token: teal orb, curled snake/wind ribbon, cream rim.
5. Spider light token: golden orb, tiny web/spider motif, bright yellow rim.
6. Yeti dark token: lavender-purple orb, soft yeti face/fur shape, pale violet rim.

Style: crisp mobile sprites, readable at 48-72 px, centered, high contrast edges, consistent size and rim thickness, no letters, no numbers, no text, no shadows on the chroma-key background.
```

## Specials And Drops Prompt

```text
Use case: game-asset-sheet
Asset type: Match-3 special pieces and drop tokens
Canvas and layout: one sheet on flat #123456 chroma-key, 2 rows x 4 columns, centered transparent-ready sprites.

Sprites:
special_row: horizontal beam token with amber line and warm red base.
special_column: vertical beam token with blue/aqua line and cool base.
special_blast: starburst bomb token with orange-gold center and cranberry base.
special_colour: prism token with four color facets on a deep violet base.
drop_gold: round gold coin/reward token, no currency text.
drop_seeds: green seed leaf token, visible seed/leaf motif.
drop_energy: blue energy bolt token, compact lightning silhouette.
fx_clear_burst: transparent radial clear burst, amber center with emerald outer spark.

Constraints: no text, no labels, no chroma-key color inside sprites, clear alpha-safe silhouettes, consistent centered anchoring.
```

## Board And UI Sheet Prompt

```text
Use case: game-ui-asset-sheet
Asset type: standalone Match-3 board and HUD UI art
Canvas and layout: flat #123456 chroma-key with separate UI objects, no text.

Objects:
background-table: seamless warm wood/alchemy table tile, subtle grain and magic linework, no labels.
board-frame: square brass-and-wood board frame with transparent center, rounded corners, collectible tabletop feel.
cell-empty: individual rounded tile, warm brown inset, readable when repeated 8x8.
cell-selected: transparent selected-cell outline with amber/cream glow, no filled center.
hud-bar: wide top HUD backing, warm wood/brass, readable over gameplay, empty decorative backing only. No baked score, no filled progress bars, no meter fill, no pre-rendered numbers, no text.
menu-panel: tall rounded pause/start panel backing, warm alchemy table material, empty content area only. No baked buttons, no filled bars, no text.
shelf-block: repeatable warm shelf/cell texture for legacy fallback.

Mobile constraints: touch-first, no tiny ornate details that blur below 44 px, strong edge contrast, no heavy glass blur, no oversized decorative blobs, no text baked into art, no filled meter art that would conflict with live gameplay state.
```

## Background Table Prompt

```text
Use case: game-ui-texture
Asset type: Match-3 background-table tile only for a standalone alchemy-table / Puzzling Potions mobile game
Primary request: Create one square seamless warm wood and brass alchemy tabletop texture object on a perfectly flat solid #123456 chroma-key background.

Object: a square tabletop tile with warm brown planks, subtle brass inlay lines, faint engraved alchemy circles and botanical marks, soft amber and emerald accent marks, no readable text. It must be repeatable enough for a mobile game background and readable behind an 8x8 Match-3 board.

Constraints: no board frame, no cells, no HUD, no panels, no tokens, no plants, no labels, no text, no numbers, no filled bars, no screenshots, no scenery. Background outside the object must be exactly flat #123456, and #123456 must not appear inside the object.
```

## Local Generation And Cutout Workflow

1. Generate keyed PNG sources with `#123456` background in separate calls: normal pieces, specials/drops, UI objects, background table.
2. Save keyed source files under `assets-source/imagegen/match3/`.
3. Remove the sampled border key locally with hard alpha and no despill; save alpha PNGs beside each keyed source.
4. Run `node scripts/generate-themed-match3-garden-assets.mjs`; the script detects real alpha groups, filters stray neighboring components, adds runtime-safe internal padding, and writes the sliced images into `public/games/puzzling-potions/images/`.
5. Run `pnpm run assets:build` so `public/assets-runtime/manifest.json` publishes the 21-key `pixi.match3` bundle.
6. Verify Match-3 in browser on desktop and mobile-sized viewports.

## Acceptance Criteria

- Live board uses `match3.board.frame`, `match3.board.cell`, and `match3.board.cellSelected`.
- Drop mode uses real `drop_gold`, `drop_seeds`, and `drop_energy` art.
- Clear cascades use `match3.fx.clearBurst`.
- Live HUD and menu use themed CSS backed by `hud-bar.png` and `menu-panel.png`, not the classic shared glass surface.
- Existing rules and `/api/player/mutate` actions remain unchanged.
