# Final Game UI Goal Plan

Date: 2026-05-11

This goal turns the existing final visual asset pass into a per-game production UI direction. The runtime rule is conservative: preserve gameplay semantics, board geometry, server action names, Telegram navigation, and the current generated asset pipeline. New visual work must fit the existing `GameShell`, `GamePlayHud`, Pixi scene, and asset manifest seams.

## Global Acceptance

- Every visible game gets a distinct visual identity instead of inheriting only the shared glass shell.
- Mobile-first layout remains the default: no 320px horizontal scroll, no clipped bottom dock labels/icons, no HUD collision with the Pixi playfield, and practical 44px tap targets.
- Live-game events stay in compact HUD/action-log space unless the game intentionally opens a modal or pause/result dialog.
- Generated UI assets are referenced by stable semantic paths or runtime manifest keys. New art should use the `generate2dsprite` cutout workflow only when an actual missing asset is identified.
- Do not bake readable UI text, counters, timers, prices, or localized copy into images.

## Game Mockups And Implementation Targets

### Garden Shelf

Screens:

- Hub/live garden: sign, shelf, settings cog, garden HUD stats, quest entry, plant taps.
- Plant detail sheet: large plant stage, care/collect/water actions, level/progress.
- Quest sheet: story/daily quest list, claimable states, locked states.
- Offline/reward overlays: short result cards, not persistent playfield coverage.

Visual direction: cozy indoor shelf garden with warm wood, soft leaf highlights, ceramic pots, and handwritten sign energy. Current generated plant/shelf/sign assets remain the reference.

Asset status: current Garden Shelf source/runtime assets are sufficient. Future missing art should be generated as isolated plant/UI family sheets and cut by connected visible pixels plus safe padding.

### Building Blox

Screens:

- Menu: board preview, best score/reward, start.
- Live HUD: score, lines, reward, compact event log, pause.
- Pause: frozen-board recovery, tray count, restart/end/exit.
- Result/settle state: reward-forward panel when a run ends.

Visual direction: toy-block construction table with tactile plastic tiles, blueprint grid, snap feedback, and sturdy board frame. Existing `public/games/blox/*` UI assets are the reference and must back the HUD/menu chrome.

Asset status: generated Blox HUD, pause panel, board, tray, cells, pieces, icons, and FX already exist. This pass wires the DOM HUD/menu to those assets.

### Gem Crush / Puzzling Potions

Screens:

- Mode menu: classic/timed/drop cards.
- Live HUD: score, moves/time, combo, pause.
- Pause: compact mode-preserving recovery.
- Result/end: settle/restart/exit.

Visual direction: potion-library puzzle table with dark varnished wood, warm brass labels, creature gem pieces, and magical shelf framing. Current Puzzling Potions art remains the reference.

Asset status: current Match-3 background, board, HUD, menu, pieces, specials, and drops are sufficient.

### Gacha Merge / Alchemy Table

Screens:

- Live board: top alchemy HUD, library/exchange drawers, bottom generate/trash/gacha dock.
- Recipe book: discovered/locked recipe cards.
- Item book: chain progress and quantities.
- Exchange: essence offers and limits.
- Pause: mode/status recovery.

Visual direction: alchemy workbench with leather/wood rails, glowing essence, compact tool icons, and bottom thumb controls. Existing generated Gacha Merge assets remain authoritative.

Asset status: current table, board cells, action dock, HUD bar, drawers, item icons, and FX are sufficient.

### Bubbo Bubbo

Screens:

- Menu: mode picker, saved-run resume, local field preview.
- Live HUD: bottom bubble tray HUD, score, shots/time, pressure, event log.
- Pause: shot/queue/pressure frozen recovery.
- Result: pressure-tone result card and restart/exit.

Visual direction: soft arcade bubble launcher with mint/sky/coral bubbles, visible pressure rails, rounded field mask, and toy-cannon controls. Existing Bubbo images and FX are the reference.

Asset status: current bubble field, tray, cannon, pause, result, and pressure art are sufficient. This pass uses those assets in the DOM shell where possible.

### Brain Blitz / Trivia

Screens:

- Menu: category, difficulty, solo, duel creation, join code.
- Question: question card, answer grid, timer bar, reveal state.
- Duel room: invite/status/readiness.
- Results: score result, back/setup.
- Pause/history: compact run recovery plus recent duel history.

Visual direction: quiz-room stage with cards, tickets, category badges, answer plates, and result trophy. Existing Trivia UI assets should replace the remaining generic glass cards.

Asset status: generated Trivia panels, answer states, buttons, badges, timer, result trophy, and category icons already exist. This pass wires them through CSS.

### Cozy Yard / Companion Yard

Screens:

- Yard live: background remodel, bowls, placed goodies, visitors, activity pill, bottom dock.
- Food/goodies/shop/petbook/album/gifts/repair/remodel/expansion/daily/settings panels.
- Placement mode: visible target slots, pending sync states, repair movement.

Visual direction: cozy garden postcard with soft object cards, tactile bottom dock, visible visitors, and paper-like panels. Existing generated Yard backgrounds, HUD sheet, panels, visitors, goodies, and FX remain the reference.

Asset status: current Yard assets are sufficient. This pass preserves the existing component-level asset resolver.

### Farm

Screens:

- Hidden legacy entry: side panel shop/bag/badges/journal/season.
- Live farm: field HUD, selected seed, harvest action.
- Shop/bag panels: seed purchase, inventory, theme picker.

Visual direction: seed-packet farm notebook with earthy field background, practical side panel, crop/plot icons, and low-friction harvest controls.

Asset status: current Farm field, plot, crop, seed packet, UI panel, HUD, button, and icon assets are sufficient. Farm remains hidden from navigation.

## QA Matrix

Required viewport passes:

- 320x568 mobile touch
- 390x844 mobile touch
- 414x896 mobile touch
- 768x1024 tablet portrait
- 1024x768 tablet landscape
- 1280x720 desktop smoke
- At least one high-DPI pass with `deviceScaleFactor: 2`

Functional checks:

- Open each visible tab.
- Start/pause/resume one Pixi-backed run where the UI exposes those controls.
- Open/close Trivia menu/question/pause surfaces where feasible.
- Open/close Yard screen panels and verify focusable dialogs.
- Verify no horizontal scroll at 320px and tap targets remain at least 44px where practical.

## Screen Regeneration Follow-Up

Date: 2026-05-11

This pass completes the immediate screen-surface cleanup from the latest screenshots. The production rule is now stricter than the earlier plan: pause, result, setup, shop, inventory, and side-panel screens should read as purpose-made game UI surfaces, not as translucent glass over stretched playfield art.

Implemented runtime targets:

- Building Blox: top HUD remains horizontally centered during the entry animation, HUD reserve is measured from the actual DOM chrome, the board can grow on wider/taller WebView surfaces, and tray controls stay centered under the board instead of spanning the whole viewport.
- Blox pause/result: generated `pause_panel`, `result_panel`, and button assets provide the visible screen surface.
- Bubbo: pause and result screens use the generated pause/result panels and flat button art with opaque inner content.
- Puzzling Potions: setup/pause/result overlays keep the generated menu panel and generated primary/secondary button chrome as the visible material.
- Brain Blitz: pause/history/result screens use generated menu/result panels and button variants.
- Gacha Merge: pause recovery uses the generated exchange/recipe/item panel family instead of generic glass.
- Companion Yard: active yard sub-screens select the matching generated panel art for food, goodies, shop, petbook, album, gifts, settings, repair, remodel, expansion, daily, and companion views.
- Garden Shelf: detail, quest, reward, and modal sheets use generated panel/button surfaces and opaque backing.
- Farm: legacy farm menus use the generated side-panel and button assets, preserving hidden-game status.

Acceptance additions:

- Generated screen art must be kept at its intended aspect ratio or used as contained panel material; do not stretch it to arbitrary full-screen shapes.
- Semi-transparent glass may only be used as a minor inner highlight. It must not be the primary pause/result/menu material.
- Large screens should use available room for the active board where the game's play model allows it, while still preserving HUD and thumb-control clearance.
