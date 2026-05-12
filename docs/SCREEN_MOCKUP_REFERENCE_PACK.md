# Full Screen UI Mockup Reference Pack

Date: 2026-05-11

This pack is the screen-level reference layer for replacing semi-transparent DOM/glass overlays with purpose-made game UI surfaces. The generated atlas images live in `assets-source/imagegen/screen-mockups/`.

These are reference mockups, not direct runtime screenshots. Use them to generate final separated screen/interface assets through the existing image-generation and `generate2dsprite` cutout pipeline, then wire those assets through the current runtime manifest seams.

## Non-Negotiable Rules

- No semi-transparent glass cards as the primary menu, pause, HUD, result, shop, quest, or drawer material.
- Buttons, stat chips, tabs, cards, docks, and dialog frames must be authored game-art surfaces, not generic translucent rectangles placed above generated art.
- Do not bake localized text, counters, prices, timers, or dynamic labels into generated images. Leave clean title bands, plaques, bars, and icon slots for React/Pixi text.
- Keep the active playfield clear. HUD and thumb controls must not cover hittable Pixi cells, bubbles, or board interactions.
- Use mobile-first safe areas: 320x568 must not horizontally scroll, bottom docks must not clip labels/icons, and practical tap targets should stay at least 44x44 CSS px.
- Treat each screen as responsive material: generate clean surfaces that can be sliced, scaled, or composed for 320, 390, 414, tablet portrait, tablet landscape, and desktop smoke.

## Generated Atlas Files

| Area | Reference atlas | Covered screen families |
|---|---|---|
| Shared Game Hub shell | `assets-source/imagegen/screen-mockups/game-hub-shell-screen-atlas.png` | hub/garden tab shell, active game shell, profile/status panel, global settings/theme/audio/language panel |
| Garden Shelf | `assets-source/imagegen/screen-mockups/garden-shelf-screen-atlas.png` | live shelf garden, plant detail, seed shop/inventory, quest sheet, settings, offline/level reward |
| Building Blox | `assets-source/imagegen/screen-mockups/building-blox-screen-atlas.png` | start/menu, live playfield/HUD/tray, pause, result/settle |
| Gem Crush | `assets-source/imagegen/screen-mockups/gem-crush-screen-atlas.png` | mode menu, live board/HUD, pause, result/end |
| Gacha Merge | `assets-source/imagegen/screen-mockups/gacha-merge-screen-atlas.png` | live board/HUD/action dock, recipe book, item book, exchange drawer, pause |
| Bubbo Bubbo | `assets-source/imagegen/screen-mockups/bubbo-bubbo-screen-atlas.png` | mode/start menu, live field/HUD/cannon, pause, result |
| Brain Blitz | `assets-source/imagegen/screen-mockups/brain-blitz-screen-atlas.png` | solo/duel menu, question, answer reveal, duel room, results, pause/history |
| Cozy Yard | `assets-source/imagegen/screen-mockups/cozy-yard-screen-atlas.png` | live yard, food, goodies, shop, petbook, album, gifts, repair, remodel, expansion, daily, companion/settings |
| Cozy Farm legacy | `assets-source/imagegen/screen-mockups/cozy-farm-legacy-screen-atlas.png` | live field, seed shop, bag/inventory, plot detail, journal/season/badges |

## Per-Game Direction

### Shared Shell

Goal: make the header, global resource chips, profile/status surface, settings, and bottom dock feel like authored game UI. The shell should adapt between hub screens and immersive Pixi play without leaving generic translucent chrome on top of game art.

Generate next:

- `gameHub.headerResourceBar`
- `gameHub.bottomDock`
- `gameHub.statusPanel`
- `gameHub.settingsPanel`
- `gameHub.tabActiveStates`

### Garden Shelf

Goal: a cozy indoor shelf garden where plant, quest, shop, settings, and reward surfaces are carved wood/parchment/botanical materials. The plant detail sheet should not look like a glass modal over the plant art.

Generate next:

- live shelf screen reference split into shelf frame, sign, lower plank, empty/locked slots, HUD chips
- plant detail panel, care action buttons, upgrade/collect/water states
- seed shop and inventory cards
- quest sheet with story/daily/locked/claimable/claimed states
- settings panel and offline/level reward panels

### Building Blox

Goal: a tactile construction table with blocky HUD, sturdy board, tray, pause, and result panels. Pause/result must be opaque board material, not generic dark translucent boxes.

Generate next:

- menu board preview and start/result frame
- live HUD bar and tray/dock surfaces
- pause recovery frame with status rows
- result/settle panel
- button states: primary, secondary, danger, disabled, selected

### Gem Crush

Goal: potion-library puzzle UI with ornate mode cards, brass/potion HUD, compact pause, and result panels. Keep all board state dynamic and avoid baked scores or localized labels.

Generate next:

- mode menu panel and three mode card surfaces
- live HUD bar with score/moves/time/combo slots
- compact pause panel
- result/end panel
- button states and chip backgrounds

### Gacha Merge

Goal: alchemy workbench UI where drawers and action docks are real illustrated surfaces. Recipe, item, and exchange panels need dense but readable mobile card layouts without web-dashboard cards.

Generate next:

- live top HUD, side tool rail, bottom generate/trash/gacha/daily dock
- recipe book drawer
- item book drawer
- exchange offers drawer
- pause recovery panel
- selected/trash/pending/sync state surfaces

### Bubbo Bubbo

Goal: soft arcade bubble UI with a clear cannon zone, pressure indicators, mode cards, pause, and result surfaces. Avoid pale translucent blocks over the purple panel.

Generate next:

- start/menu panel with mode cards and saved-run banner
- live bottom HUD/tray, current/next holders, pressure chip
- pause recovery panel
- result card
- danger/pressure accents and button states

### Brain Blitz

Goal: quiz-room card UI with answer-state art, duel ticket surfaces, timer and trophy identity. Do not bake question or answer copy into images.

Generate next:

- solo/duel setup panel
- question card and answer button states
- answer reveal state overlays
- duel room ticket/readiness panel
- results trophy panel
- pause/history panel

### Cozy Yard

Goal: cozy postcard yard with paper/wood panels and a tactile dock. Every sub-screen is an in-scene panel, not a frosted overlay. The atlas combines companion/settings visually; final generation should split them.

Generate next:

- live yard HUD, bottom dock, side tools, activity pill
- food, goodies, shop, petbook, album, gifts, repair, remodel, expansion, daily, companion, and settings panels
- placement mode dock, playzone guide, confirm/cancel buttons
- pending/sync visual state

### Cozy Farm Legacy

Goal: seed-packet notebook farming UI for the hidden compatibility screen. Keep it ready as a future asset set without exposing the tab.

Generate next:

- live field HUD and selected plot state
- seed shop panel
- bag/inventory panel
- crop/plot detail panel
- journal/season/badge panel

## Generation Workflow

1. Use the atlas as a visual reference only. If using built-in image reference/edit mode, first load the local atlas image so the reference is visible to the image tool.
2. Generate one screen family at a time. Do not request one massive mixed atlas as a final runtime asset.
3. For each family, generate separated source assets: background/frame, panel shell, buttons, stat chips, icons, state badges, and FX. Keep dynamic text out.
4. Process final sprites/panels with alpha-aware cutouts and safe padding. Reject opaque key-color leaks and crop-edge contacts.
5. Wire outputs through stable semantic keys under `public/games/<game>/...` and `public/assets-runtime/manifest.json`.
6. Run the AGENTS mobile QA matrix before claiming the runtime UI is fixed.

## Runtime Mapping

Implementation has a semantic UI-surface contract in `src/app/screenSurfaceAssets.js`. It maps every visible game screen family, plus the legacy farm reference, to committed UI-only assets under `public/`.

The mapping intentionally reuses existing generated UI surfaces where they already match the screen atlas direction: Blox panels/buttons, Bubbo trays/panels, Puzzling Potions menu/HUD/buttons, Gacha Merge HUD/drawers/exchange, Brain Blitz panels/buttons/answers, Garden Shelf panels/buttons, and Cozy Yard screen panels/dock/buttons. Gameplay tokens, board pieces, plants, bubbles, and merge items remain outside this UI pass.

## Rejection Checklist

Reject generated output if any of these are visible:

- translucent glass is the main panel material
- text, prices, timers, or labels are baked into image pixels
- controls clip at 320px or require hover
- HUD overlaps a Pixi playfield
- bottom dock labels/icons are cut off
- buttons look like generic CSS blocks pasted over art
- important dynamic content areas are too decorative for runtime text
