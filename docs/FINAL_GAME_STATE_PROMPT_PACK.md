# CC-GH Final Game State Prompt Pack

This document turns the MapleStory-style reference prompt into repo-specific final-state prompts for the CC-GH games.

Use these prompts one game at a time. They are written for a coding/design agent working inside the current React/Vite/PixiJS Telegram Mini App, not for a standalone HTML prototype.

## Shared CC-GH Requirements

Every final game state must respect these project-level constraints:

- Build inside the existing CC-GH stack: React 19, Vite 7, PixiJS 8 where the game already uses Pixi, shared `src/app` shell, `/api/player/mutate` state flow, runtime assets through `public/assets/manifest.json` and `public/assets-runtime/manifest.json`.
- Keep the Telegram Mini App experience mobile-first. Never optimize only for desktop Chrome.
- Do not rely on hover-only affordances. Every important action must work with touch.
- Keep transient live-game events in the lower HUD or action log unless a modal is intentional.
- Keep thumb-reachable controls clear of the active playfield.
- Use the explicit viewport QA matrix for UI, HUD, Pixi, dock, responsive, and touch changes: 320x568, 390x844, 414x896, 768x1024, 1024x768, 1280x720, plus at least one `deviceScaleFactor: 2` pass.
- For touch QA, use `isMobile: true` and `hasTouch: true`.
- For Telegram-like constraints, verify no horizontal scroll at 320px, no clipped dock labels/icons, no HUD overlap over Pixi playfields, reachable/focusable dialogs, practical 44x44 CSS px tap targets, pointer cleanup on blur/visibility changes, and resize/redraw after viewport changes.
- Run visual QA separately from functional QA. Visible clipping, cut-off controls, unreadable labels, weak contrast, broken layering, or awkward motion are bugs even when tests pass.
- UI text must be localizable through existing i18n paths. Do not bake readable text into generated art. For English screenshots, use short English labels only. For production, support both English and Russian where the game surface already does.
- Use generated or authored image assets through the existing asset pipeline. Do not replace production art with CSS-shape placeholders, emoji placeholders, or external remote images.
- Keep gameplay semantics server-safe. Shared pure game logic belongs in `game-logic/` or `src/game-core/` as appropriate; client scenes should render and collect input, not invent conflicting rules.
- Preserve existing external contracts unless a specific prompt section explicitly asks to change them.

## Separate Detailed Asset Segment

This segment is the asset checklist for final production work. Treat it as a separate deliverable from code. Each game can be implemented in phases, but the final target should not rely on placeholder art, emoji stand-ins, CSS-only objects for primary game pieces, or remote images.

### Global Asset Rules

- Source assets should live under `assets-source/` when they are intermediate, editable, generated, keyed, or large.
- Runtime fallback assets should live under `public/games/<game>/...`.
- Built production runtime assets should be emitted through the existing asset pipeline into `public/assets-runtime/<game>/...` and referenced by `public/assets-runtime/manifest.json`.
- Manual override paths should remain available through `public/assets/manifest.json`.
- Transparent PNG is preferred for source sprites, icons, objects, and FX. Runtime WebP is preferred where the pipeline already emits it.
- Prefer transparent source sheets. If the generator paints a visual checkerboard or flat background instead of real alpha, remove it locally by sampling the sheet border and flood-filling background-like pixels. Do not require a fixed chroma-key color; if a temporary flat background is unavoidable, choose a per-sheet color that does not appear in the subject art.
- Source-sheet grid cells may be used only to locate the intended object or animation phase. Final runtime sprites must be cropped from connected visible pixels plus safe padding, not from fixed equal boxes.
- Do not bake readable UI text, numbers, prices, timers, counters, HP/XP bars, cooldown fills, labels, or language-specific copy into images.
- Asset names must be stable and semantic. Avoid hash names in source paths; hashes are for generated runtime output.
- Keep safe padding around every sprite. No alpha should touch crop edges unless the asset is intentionally full-bleed.
- Provide anchor notes for sprites that need gameplay alignment: bottom-center for plants, center-cell for merge objects, pivot/cannon-base for Bubbo, activity anchors for Yard visitors.
- Each state that players need to distinguish should have distinct art or a distinct runtime effect: selected, valid target, invalid target, pending, ready, cooldown, locked, disabled, rewarded.
- Every final art set needs mobile QA at actual gameplay scale, not only source resolution.
- Audio should be included as final polish where it affects feedback. Keep it optional-toggle friendly and short enough for Telegram/mobile use.

### Garden Shelf Assets

Target paths:
- Source: `assets-source/imagegen/garden-shelf/`
- Runtime fallback: `public/games/garden-shelf/`
- Runtime build: `public/assets-runtime/garden-shelf/`

Required scene and shell assets:
- `assets_shelf.png`: complete shelf structure, warm indoor garden material, no plants baked into slots.
- `assets_garden_sign.png`: garden name/sign backing with empty text area.
- `assets_garden_bottom_plank.png`: bottom plank/control backing.
- `assets_garden_cog.png`: settings cog or settings affordance art.
- `shelf_slot_empty.png`: empty plant spot, readable but quiet.
- `shelf_slot_locked.png`: locked spot/locked plant preview backing.
- `shelf_unlock_glow.png`: shelf unlock highlight.
- `garden_shadow_soft.png`: reusable soft contact shadow for pots if not included per plant.

Required plant assets:
- 14 plant families x 4 phases = 56 plant phase sprites.
- Families: `daisy`, `lavender`, `basil`, `rosemary`, `monstera`, `succulent`, `pothos`, `strawberry`, `bonsai`, `string_of_pearls`, `orchid`, `venus_flytrap`, `moon_cactus`, `fern`.
- Phases per family: `sprout`, `young`, `growing`, `mature`.
- Recommended source naming: `families/<plant>-keyed.png` and `families/<plant>-transparent.png` for each 1x4 family sheet.
- Final runtime sheet: `assets_transparent.png`.
- Sprite metadata: `sprites.json`, with exact rectangles for all 56 phase frames.
- Each plant phase must be bottom-anchored except hanging plants, which need a top-hanging anchor note.
- Mature phase must be clearly more valuable/readable than phase 3 without exceeding slot bounds.

Required UI and icon assets:
- `icon_plant.png`
- `icon_water.png`
- `icon_upgrade.png`
- `icon_collect.png`
- `icon_quest.png`
- `icon_level_up.png`
- `icon_offline.png`
- `icon_language.png`
- `icon_info.png`
- `icon_close.png`
- `detail_panel.png`: empty panel backing for focused plant details.
- `quest_panel.png`: empty panel backing for story/daily quests.
- `level_reward_panel.png`: empty modal backing for level-up reward.
- `offline_panel.png`: empty modal/backing for welcome-back earnings.
- `button_primary.png`, `button_secondary.png`, `button_danger.png`: optional image-backed buttons if CSS buttons are not enough.

Required FX assets:
- `fx/water-splash.png`
- `fx/leaf-glint.png`
- `fx/coin-glint.png`
- `fx/gold-sparkle.png`
- `fx/xp-leaf-sparkle.png`
- `fx/care-sprout.png`
- `fx/unlock-burst.png`
- `fx/level-confetti.png`
- `fx/tap-ring.png`

Required audio:
- `sfx_plant.wav`
- `sfx_water.wav`
- `sfx_collect.wav`
- `sfx_upgrade.wav`
- `sfx_level_up.wav`
- `sfx_quest_claim.wav`

### Building Blox Assets

Target paths:
- Source: `assets-source/imagegen/blox/`
- Runtime fallback: `public/games/blox/`
- Runtime build: `public/assets-runtime/blox/`

Required board assets:
- `background.png`: quiet tabletop/blueprint/workshop background.
- `board_frame.png`: 10x10 board frame with transparent center.
- `cell_empty.png`: normal empty cell.
- `cell_valid.png`: valid placement preview cell.
- `cell_invalid.png`: invalid placement preview cell.
- `cell_selected.png`: selected tray-piece footprint cell.
- `cell_clear_row.png`: row clear highlight cell.
- `cell_clear_col.png`: column clear highlight cell.
- `cell_pending.png`: pending authoritative mutation state.
- `grid_shadow.png`: subtle board drop shadow or table contact shadow.

Required block and piece assets:
- `block_tile_blue.png`
- `block_tile_green.png`
- `block_tile_orange.png`
- `block_tile_yellow.png`
- `block_tile_purple.png`
- `block_tile_red.png`
- `block_tile_cyan.png`
- `block_tile_pink.png`
- `block_tile_gray.png`
- `piece_dot.png`
- `piece_h2.png`
- `piece_v2.png`
- `piece_l3.png`
- `piece_l3r.png`
- `piece_h3.png`
- `piece_v3.png`
- `piece_sq.png`
- `piece_t4.png`
- `piece_s4.png`
- `piece_i4.png`
- `piece_i5.png`
- Piece thumbnails may be generated from `block_tile_*` at runtime, but final art review still needs the 12 canonical preview silhouettes above.

Required tray and HUD assets:
- `tray_panel.png`: bottom tray backing.
- `tray_slot_empty.png`
- `tray_slot_selected.png`
- `hud_bar.png`: empty HUD backing.
- `pause_panel.png`: empty pause panel backing.
- `result_panel.png`: empty result panel backing.
- `icon_score.png`
- `icon_lines.png`
- `icon_reward.png`
- `icon_restart.png`
- `icon_settle.png`
- `icon_exit.png`

Required FX assets:
- `fx/place_settle.png`
- `fx/valid_glow.png`
- `fx/invalid_pulse.png`
- `fx/row_wipe.png`
- `fx/column_wipe.png`
- `fx/multi_clear_burst.png`
- `fx/tray_refill.png`
- `fx/reward_spark.png`

Required audio:
- `sfx_pickup.wav`
- `sfx_place.wav`
- `sfx_invalid.wav`
- `sfx_clear_line.wav`
- `sfx_tray_refill.wav`
- `sfx_run_end.wav`

### Gem Crush Assets

Target paths:
- Source: `assets-source/imagegen/match3/`
- Runtime fallback: `public/games/puzzling-potions/images/`
- Runtime build: `public/assets-runtime/puzzling-potions/`

Required normal token assets:
- `piece-dragon.png`: fire token.
- `piece-frog.png`: water token.
- `piece-newt.png`: earth token.
- `piece-snake.png`: air token.
- `piece-spider.png`: light token.
- `piece-yeti.png`: dark token.

Required special and drop assets:
- `special-row.png`: horizontal clear.
- `special-column.png`: vertical clear.
- `special-blast.png`: area blast.
- `special-colour.png`: colour clear/prism.
- `drop-gold.png`
- `drop-seeds.png`
- `drop-energy.png`

Required board assets:
- `background-table.png`: alchemy tabletop background.
- `board-frame.png`: 8x8 board frame with transparent center.
- `cell-empty.png`
- `cell-selected.png`
- `cell-hint.png`: optional suggested move highlight.
- `cell-invalid.png`: optional invalid swap feedback.
- `shelf-block.png`: repeatable fallback board/cell material.

Required UI assets:
- `hud-bar.png`: empty HUD backing.
- `menu-panel.png`: setup/pause/result backing.
- `mode-card-classic.png`
- `mode-card-timed.png`
- `mode-card-drop.png`
- `timer-ring.png`: empty ring/backing only, live fill rendered in code.
- `moves-badge.png`
- `combo-badge.png`
- `reward-badge.png`
- `button-primary.png`
- `button-secondary.png`

Required FX assets:
- `fx-clear-burst.png`
- `fx-swap-trail.png`
- `fx-invalid-swap.png`
- `fx-cascade-dust.png`
- `fx-row-clear.png`
- `fx-column-clear.png`
- `fx-blast-clear.png`
- `fx-colour-clear.png`
- `fx-drop-credit.png`
- `fx-combo-pop.png`

Required audio:
- `sfx-swap.wav`
- `sfx-invalid.wav`
- `sfx-match.wav`
- `sfx-cascade.wav`
- `sfx-special.wav`
- `sfx-drop-credit.wav`
- `sfx-mode-start.wav`
- `bgm-game.mp3` and `bgm-main.mp3` only if the final audio budget allows.

### Gacha Merge / Alchemy Table Assets

Target paths:
- Source: `assets-source/imagegen/gacha-merge/`
- Runtime fallback: `public/games/gacha-merge/`
- Runtime build: `public/assets-runtime/gacha-merge/`

Required table and board assets:
- `backgrounds/table.png`: full-bleed top-down alchemy table matching the attached reference direction.
- `backgrounds/table_mobile_safe.png`: optional narrower composition preserving the central 7x5 board crop.
- `ui/boardFrame.png`: parchment/brass frame around the board.
- `ui/cellEmpty.png`
- `ui/cellOccupied.png`
- `ui/cellSelected.png`
- `ui/cellTarget.png`
- `ui/cellInvalid.png`: recommended for rejected drag targets.
- `ui/cellTrashTarget.png`: recommended for trash mode.
- `ui/itemShadow.png`: reusable soft cell contact shadow if not baked into item art.
- `fx/recipeGlow.png`
- `fx/essenceOrb.png`
- `fx/missPuff.png`
- `fx/itemLiftGlow.png`
- `fx/perfectReactionBurst.png`
- `fx/discoveryBurst.png`

Required HUD, action, and drawer assets:
- `ui/hudBar.png`
- `ui/actionDock.png`
- `ui/libraryRail.png`
- `ui/libraryPanel.png`
- `ui/exchangePanel.png`
- `ui/recipePanel.png`: recommended if Recipe Book needs a distinct backing.
- `ui/itemPanel.png`: recommended if Items needs a distinct backing.
- `ui/sourceChipFree.png`
- `ui/sourceChipCrop.png`
- `ui/sourceChipEmpty.png`
- `ui/hudIconItems.png`
- `ui/hudIconRecipes.png`
- `ui/hudIconExchange.png`
- `ui/hudIconEssence.png`
- `ui/hudIconMode.png`
- `ui/hudIconPause.png`
- `ui/actionIconGenerate.png`
- `ui/actionIconDaily.png`
- `ui/actionIconTokens.png`
- `ui/actionIconTrash.png`
- `ui/actionIconFreeTaps.png`
- `ui/actionIconFuel.png`
- `ui/actionIconClose.png`
- `ui/actionIconBack.png`
- `ui/exchangeIconTreats.png`
- `ui/exchangeIconShinyTreat.png`
- `ui/exchangeIconFuture.png`

Required merge item assets:
- 48 total item assets, one transparent 2.5D object per item. Recommended source size is 512x512 or 768x768 per object with consistent bottom-center anchor and a safe object footprint that fits one 7x5 cell.
- Flora chain: `items/seed.png`, `items/sprout.png`, `items/herb.png`, `items/blossom.png`, `items/vine.png`, `items/grove.png`, `items/lifebloom.png`, `items/world_tree.png`.
- Earth chain: `items/dust.png`, `items/clay.png`, `items/sand.png`, `items/stone.png`, `items/ore.png`, `items/crystal.png`, `items/geode.png`, `items/monolith.png`.
- Water chain: `items/dew.png`, `items/droplet.png`, `items/stream.png`, `items/spring.png`, `items/pond.png`, `items/tide.png`, `items/rainstone.png`, `items/ocean_heart.png`.
- Fire chain: `items/ember.png`, `items/flame.png`, `items/coal.png`, `items/kiln.png`, `items/forge.png`, `items/sunshard.png`, `items/phoenix_ash.png`, `items/solar_core.png`.
- Air chain: `items/breeze.png`, `items/cloud.png`, `items/spark.png`, `items/bolt.png`, `items/lightning.png`, `items/storm_cell.png`, `items/aurora.png`, `items/tempest_crown.png`.
- Alchemy chain: `items/mud.png`, `items/brick.png`, `items/glass.png`, `items/vial.png`, `items/elixir.png`, `items/lens.png`, `items/astrolabe.png`, `items/philosopher_stone.png`.

Merge item art rules:
- All 48 items must be generated as separate files. Do not generate a combined item sheet for final production art.
- Every item must be usable independently in the game and in discovery drawers.
- The object should have a clear top/front face, readable silhouette, and consistent light direction.
- Do not include cell backgrounds, labels, level numbers, or UI badges inside item art.
- Higher tiers should show material evolution, not just bigger scale.
- Top tiers should feel aspirational but still fit in a single board cell.

Required audio:
- `sfx-generate.wav`
- `sfx-pickup.wav`
- `sfx-merge.wav`
- `sfx-recipe.wav`
- `sfx-miss.wav`
- `sfx-trash.wav`
- `sfx-essence.wav`
- `sfx-discovery.wav`
- `sfx-exchange.wav`

### Bubbo Bubbo Assets

Target paths:
- Source: `assets-source/imagegen/bubbo-bubbo/`
- Runtime fallback: `public/games/bubbo-bubbo/`
- Runtime build: `public/assets-runtime/bubbo/`

Required field and background assets:
- `images/background-tile.png`: readable playfield background.
- `images/game-side-border.png`: optional side border for larger screens.
- `images/top-tray.png`: optional pressure/top field frame.
- `images/danger-line.png`: danger threshold marker.
- `images/pressure-row-accent.png`: visual treatment for pending row `-1`.
- `images/field-mask.png`: optional mask/soft vignette that does not hide bubbles.

Required bubble assets:
- `images/bubble-mint.png`
- `images/bubble-amber.png`
- `images/bubble-coral.png`
- `images/bubble-sky.png`
- `images/bubble-berry.png`
- `images/bubble-shine.png`: reusable highlight if bubbles are composited.
- `images/bubble-shadow.png`: reusable shadow if not included per bubble.
- `images/bubble-glow.png`: selected/current bubble glow.
- `images/bubble-reserve-base.png`
- `images/bubble-reserve-ring.png`

Required cannon and aiming assets:
- `images/cannon-main.png`
- `images/cannon-barrel.png`
- `images/cannon-top.png`
- `images/cannon-arrow.png`
- `images/bottom-tray.png`
- `images/laser-line.png`
- `images/laser-line-glow.png`
- `images/shot-visualiser.png`
- `images/wall-bank-spark.png`

Required UI assets:
- `images/info-bg.png`
- `images/pause-panel.png`
- `images/results-panel-base.png`
- `images/results-panel-points-total.png`
- `images/results-panel-points-breakdown.png`
- `images/button-flat.png`
- `images/button-flat-small.png`
- `images/icon-pause.png`
- `images/icon-back.png`
- `images/icon-sound-on.png`
- `images/icon-sound-off.png`

Required FX assets:
- `fx/pop-mint.png`
- `fx/pop-amber.png`
- `fx/pop-coral.png`
- `fx/pop-sky.png`
- `fx/pop-berry.png`
- `fx/island-drop.png`
- `fx/pressure-shift.png`
- `fx/sparse-refill.png`
- `fx/score-pop.png`
- `fx/timed-finish.png`

Required audio:
- `audio/cannon-move.wav`
- `audio/bubble-land-sfx.wav`
- `audio/bubbles-falling.wav`
- `audio/powerup-super.wav`
- `audio/powerup-time.wav`
- `audio/powerup-bomb.wav`
- `audio/primary-button-press.wav`
- `audio/secondary-button-press.wav`
- `audio/bubbo-bubbo-bg-music.wav` if final audio budget allows.

### Brain Blitz Assets

Target paths:
- Source: `assets-source/imagegen/trivia/`
- Runtime fallback: `public/games/trivia/`
- Runtime build: `public/assets-runtime/trivia/`

Required screen and panel assets:
- `background-quiz-room.png`: quiet quiz/study background that does not reduce text readability.
- `panel-menu.png`: menu panel backing.
- `panel-question.png`: current question card backing.
- `panel-duel-room.png`: duel invite/ready panel backing.
- `panel-results.png`: results panel backing.
- `panel-history.png`: history/list backing.
- `timer-ring-empty.png`: empty timer ring/backing only.
- `timer-urgent-glow.png`: timer urgency accent.

Required answer/button state assets:
- `answer-default.png`
- `answer-hover-focus.png`
- `answer-selected.png`
- `answer-correct.png`
- `answer-incorrect.png`
- `answer-disabled.png`
- `button-primary.png`
- `button-secondary.png`
- `button-danger.png`

Required icon and badge assets:
- `icon-solo.png`
- `icon-duel.png`
- `icon-ready.png`
- `icon-refresh.png`
- `icon-category.png`
- `icon-difficulty.png`
- `icon-streak.png`
- `icon-score.png`
- `icon-time.png`
- `badge-easy.png`
- `badge-medium.png`
- `badge-hard.png`
- `badge-all.png`
- `badge-winner.png`
- `badge-loser.png`
- `trophy-result.png`
- `duel-ticket.png`

Optional category assets:
- `category-general.png`
- `category-science.png`
- `category-history.png`
- `category-games.png`
- `category-nature.png`
- `category-culture.png`
- These should stay optional unless categories become fixed product surfaces.

Required FX assets:
- `fx-correct-pop.png`
- `fx-incorrect-shake.png`
- `fx-streak-flare.png`
- `fx-time-warning.png`
- `fx-result-confetti.png`

Required audio:
- `sfx-answer-tap.wav`
- `sfx-correct.wav`
- `sfx-incorrect.wav`
- `sfx-next-question.wav`
- `sfx-timer-warning.wav`
- `sfx-results.wav`

### Cozy Yard Assets

Target paths:
- Source: `assets-source/games/companion-yard/`
- Runtime fallback: `public/games/companion-yard/`
- Runtime build: `public/assets-runtime/companion-yard/`

Required remodel/background assets:
- `backgrounds/meadow.png`: Morning Meadow.
- `backgrounds/moon_garden.png`: Moon Garden.
- `backgrounds/tea_house.png`: Tea House.
- For each remodel, include a playzone note or overlay guide in source docs showing safe placement and visitor walkable areas.
- Optional future remodel source files should follow `backgrounds/<remodel_id>.png`.

Required food assets:
- `foods/empty_bowl.png`
- `foods/kibble.png`
- `foods/berry_plate.png`
- `foods/bonito_bowl.png`
- Optional serving-state variants: `_full`, `_half`, `_empty` if food depletion becomes visible inside the scene.

Required goodie assets:
- 11 goodies x 3 condition variants = 33 goodie sprites.
- Goodies: `yarn_mouse`, `sun_cushion`, `cardboard_cottage`, `fountain_bowl`, `cozy_chair`, `snack_table`, `leaf_pot`, `moss_rug`, `cloud_bed`, `moon_lamp`, `book_nook`.
- Variants per goodie: base/fresh, `_worn`, `_broken`.
- Required files:
  - `goodies/yarn_mouse.png`, `goodies/yarn_mouse_worn.png`, `goodies/yarn_mouse_broken.png`
  - `goodies/sun_cushion.png`, `goodies/sun_cushion_worn.png`, `goodies/sun_cushion_broken.png`
  - `goodies/cardboard_cottage.png`, `goodies/cardboard_cottage_worn.png`, `goodies/cardboard_cottage_broken.png`
  - `goodies/fountain_bowl.png`, `goodies/fountain_bowl_worn.png`, `goodies/fountain_bowl_broken.png`
  - `goodies/cozy_chair.png`, `goodies/cozy_chair_worn.png`, `goodies/cozy_chair_broken.png`
  - `goodies/snack_table.png`, `goodies/snack_table_worn.png`, `goodies/snack_table_broken.png`
  - `goodies/leaf_pot.png`, `goodies/leaf_pot_worn.png`, `goodies/leaf_pot_broken.png`
  - `goodies/moss_rug.png`, `goodies/moss_rug_worn.png`, `goodies/moss_rug_broken.png`
  - `goodies/cloud_bed.png`, `goodies/cloud_bed_worn.png`, `goodies/cloud_bed_broken.png`
  - `goodies/moon_lamp.png`, `goodies/moon_lamp_worn.png`, `goodies/moon_lamp_broken.png`
  - `goodies/book_nook.png`, `goodies/book_nook_worn.png`, `goodies/book_nook_broken.png`
- Every goodie source must include visual size and anchor notes matching `yard-catalog.js`.

Required visitor assets:
- 8 visitors x 4 states = 32 visitor sprites minimum.
- Visitors: `mika_cat`, `pebble_pup`, `mochi_bunny`, `pip_hamster`, `willow_fox`, `basil_turtle`, `starlit_fox`, `sage_turtle`.
- Minimum states per visitor: base/default preview plus three pose-specific states.
- Existing pose examples to preserve or improve:
  - `mika_cat.png`, `mika_cat_sit.png`, `mika_cat_pounce.png`, `mika_cat_nap.png`
  - `pebble_pup.png`, `pebble_pup_sniff.png`, `pebble_pup_sit.png`, `pebble_pup_roll.png`
  - `mochi_bunny.png`, `mochi_bunny_stretch.png`, `mochi_bunny_nibble.png`, `mochi_bunny_nap.png`
  - `pip_hamster.png`, `pip_hamster_sit.png`, `pip_hamster_peek.png`, `pip_hamster_nibble.png`
  - `willow_fox.png`, `willow_fox_peek.png`, `willow_fox_listen.png`, `willow_fox_curl.png`
  - `basil_turtle.png`, `basil_turtle_watch.png`, `basil_turtle_soak.png`, `basil_turtle_rest.png`
  - `starlit_fox.png`, `starlit_fox_watch.png`, `starlit_fox_glow.png`, `starlit_fox_curl.png`
  - `sage_turtle.png`, `sage_turtle_watch.png`, `sage_turtle_soak.png`, `sage_turtle_rest.png`
- Pose art must be anchor-compatible with goodie activity anchors. Do not crop tails, ears, or shells.

Required companion and expression assets:
- `companions/cat.png`
- `companions/dog.png`
- `companions/bunny.png`
- `companions/fox.png`
- `companions/hamster.png`
- `companions/turtle.png`
- `expressions/ecstatic.png`
- `expressions/happy.png`
- `expressions/content.png`
- `expressions/neutral.png`
- `expressions/sad.png`
- `expressions/miserable.png`

Required memento, gift, and album assets:
- `mementos/mika_bell.png`
- `mementos/pebble_tag.png`
- `mementos/mochi_ribbon.png`
- `mementos/pip_seed.png`
- `mementos/willow_leaf.png`
- `mementos/basil_pebble.png`
- `mementos/starlit_charm.png`
- `mementos/sage_shell_chip.png`
- `ui/gift_box.png`
- `ui/gift_ready.png`
- `ui/photo_frame.png`
- `ui/photo_favorite.png`
- `ui/stamp.png`
- `ui/daily_letter.png`

Required HUD and screen assets:
- `HUD.png`: 5x5 icon sheet or equivalent split icons.
- Icons needed: food, goodies, shop, petbook, album, gifts, tools, repair, remodel, expansion, daily, companion, camera, sound on, sound off, settings, close, back, confirm, cancel, move, store, buy, place, collect.
- `ui/panel_food.png`
- `ui/panel_goodies.png`
- `ui/panel_shop.png`
- `ui/panel_petbook.png`
- `ui/panel_album.png`
- `ui/panel_gifts.png`
- `ui/panel_settings.png`
- `ui/bottom_dock.png`
- `ui/activity_pill.png`

Required FX assets:
- `fx/visitor_arrive.png`
- `fx/visitor_leave.png`
- `fx/gift_pop.png`
- `fx/memento_glow.png`
- `fx/photo_flash.png`
- `fx/repair_spark.png`
- `fx/place_goodie.png`
- `fx/move_goodie.png`
- `fx/remodel_transition.png`
- `fx/pending_sync.png`

Required audio:
- `sfx-place-goodie.wav`
- `sfx-set-food.wav`
- `sfx-visitor-arrive.wav`
- `sfx-gift.wav`
- `sfx-photo.wav`
- `sfx-repair.wav`
- `sfx-buy.wav`
- `sfx-remodel.wav`
- `bgm-yard.mp3` if final audio budget allows.

### Farm Assets

Target paths:
- Source: `assets-source/imagegen/farm/`
- Runtime fallback: `public/games/farm/`
- Runtime build: `public/assets-runtime/farm/`

Required field and plot assets:
- `background-field.png`: outdoor crop-field background.
- `plot-empty.png`
- `plot-selected.png`
- `plot-locked.png`
- `plot-pending.png`
- `plot-watered-overlay.png`
- `plot-ready-overlay.png`
- `plot-disabled-overlay.png`
- `plot-theme-default.png`
- `plot-theme-stone.png`
- `plot-theme-flower.png`
- `plot-theme-moon.png`

Required crop assets:
- 8 crops x 4 growth phases = 32 crop phase sprites.
- Crops: `strawberry`, `blueberry`, `tomato`, `golden_rose`, `corn`, `sunflower`, `watermelon`, `pumpkin`.
- Phases per crop: `seed`, `sprout`, `growing`, `ready`.
- Required naming: `crops/<crop>_seed.png`, `crops/<crop>_sprout.png`, `crops/<crop>_growing.png`, `crops/<crop>_ready.png`.
- Crop art must be outdoor/farm-plot oriented and visually distinct from Garden Shelf potted plants.

Required inventory/shop assets:
- `seeds/strawberry_packet.png`
- `seeds/blueberry_packet.png`
- `seeds/tomato_packet.png`
- `seeds/golden_rose_packet.png`
- `seeds/corn_packet.png`
- `seeds/sunflower_packet.png`
- `seeds/watermelon_packet.png`
- `seeds/pumpkin_packet.png`
- `harvest/strawberry.png`
- `harvest/blueberry.png`
- `harvest/tomato.png`
- `harvest/golden_rose.png`
- `harvest/corn.png`
- `harvest/sunflower.png`
- `harvest/watermelon.png`
- `harvest/pumpkin.png`
- `boosters/fertilizer.png`
- `boosters/watering_can.png`
- `boosters/harvest_basket.png`

Required UI assets:
- `ui/hud_bar.png`
- `ui/side_panel.png`
- `ui/shop_panel.png`
- `ui/bag_panel.png`
- `ui/badges_panel.png`
- `ui/journal_panel.png`
- `ui/season_panel.png`
- `ui/icon_gold.png`
- `ui/icon_xp.png`
- `ui/icon_plot.png`
- `ui/icon_seed.png`
- `ui/icon_harvest.png`
- `ui/icon_water.png`
- `ui/icon_uproot.png`
- `ui/icon_buy_plot.png`
- `ui/icon_theme.png`

Required FX assets:
- `fx/plant_puff.png`
- `fx/water_splash.png`
- `fx/growth_glow.png`
- `fx/harvest_pop.png`
- `fx/offline_report.png`
- `fx/booster_flash.png`
- `fx/level_up.png`

Required audio:
- `sfx-plant.wav`
- `sfx-water.wav`
- `sfx-harvest.wav`
- `sfx-buy-seeds.wav`
- `sfx-buy-plot.wav`
- `sfx-uproot.wav`
- `sfx-booster.wav`

## Prompt 1 - Garden Shelf

```text
I want to finish Garden Shelf as a premium mobile idle terrarium game inside the CC-GH Telegram Mini App.

The final game must feel calm, tactile, collectible, and alive. The player should understand at a glance that this is their personal plant shelf: a cozy indoor garden where plants grow over time, can be tapped, watered, upgraded, arranged, inspected, and celebrated.

Core identity:
- Garden Shelf is not a generic resource panel. It is an interactive shelf scene.
- The player owns named garden progress, shared Hub gold, Garden XP, unlocked shelves, plant inventory, daily quests, story quests, and offline earnings.
- The visual tone is cozy indoor botanical fantasy: warm wood shelves, ceramic pots, soft daylight, small magical glints, readable plant silhouettes, and gentle motion.
- The game should feel relaxing but not passive. There should always be one clear next action: collect, water, plant, upgrade, open a shelf, claim a quest, or level up.

Scene layout:
- Render the main shelf as the first screen, not a landing page.
- Use responsive shelf art with a garden sign, bottom plank, settings/quest affordances, and plant slots that remain readable on 320px width.
- Support up to 5 shelves with 3 spots per shelf.
- Locked plant previews should be visible enough to create desire, but clearly marked as locked.
- Plant detail navigation should keep arrows and water/info actions outside the focused plant so the plant art is not covered.
- The bottom control region must stay thumb-safe and must not hide mature-plant feedback.

Plant behavior:
- Include the complete 14-plant catalog: daisy, lavender, basil, rosemary, monstera, succulent, pothos, strawberry, bonsai, string of pearls, orchid, Venus flytrap, moon cactus, and fern.
- Every plant has four growth phases: sprout, young, growing, mature.
- Each phase should be visually distinct. Do not use duplicate-looking growth steps.
- Tapping immature plants accelerates growth with a short 500ms cadence.
- Mature plants produce gold and Garden XP, with clear but lightweight feedback.
- Watering should be a meaningful cooldown action with distinct ready, cooling, and rewarded states.
- Upgrades should make a plant feel stronger without changing its species identity.

Idle and progression:
- Passive production and offline earnings must be visible, honest, and collected intentionally.
- Garden XP should be the main live progression surface. Level Up should be duplicate-safe and should show a reward modal when ready.
- Story quests and daily quests should be reachable from the shelf and should show endowed progress without feeling like a separate admin page.
- Daily quests should rotate from a deeper deterministic reserve so adjacent days do not look repetitive.

Animation and feedback:
- Plants breathe or sway subtly without expensive continuous effects.
- Tap, water, collect, quest claim, unlock, and level up feedback should be smooth and brief.
- Use small leaf glints, water splashes, coin glints, and XP leaf sparkles as separate assets or runtime FX.
- Avoid heavy blur and expensive overlays on coarse pointers.
- Respect reduced-motion preferences while keeping state changes legible.

UI:
- Top shelf/status content should show garden name, garden level as subordinate context, Garden XP progress, shared gold, income rate, and quest readiness.
- Settings must include language support.
- Detail sheets must be portalized or otherwise escape transformed ancestors so they fit real mobile viewports.
- Dialogs must be focusable, dismissible by explicit close and outside tap where appropriate, and not trapped under the bottom dock.

Asset requirements:
- Use `public/games/garden-shelf/` and the generated runtime manifest as the asset contract.
- Keep plant sprites on transparent sheets with accurate sprite metadata.
- Do not mix Garden Shelf plant generation with Match-3, Merge, HUD parts, or reference art sheets.
- No baked labels, prices, XP values, or meter fills inside plant/shelf images.

Acceptance criteria:
- A new player can plant, grow, water, collect, upgrade, unlock, and level up without reading external instructions.
- Returning after offline time shows understandable earnings and keeps them visible until collection.
- Every visible control works on touch at 320x568 without horizontal scroll or clipped labels.
- Garden state sync remains server-backed with local fallback and does not duplicate level rewards or quest rewards.
```

## Prompt 2 - Building Blox

```text
I want to finish Building Blox as a polished mobile block-placement puzzle inside the CC-GH Telegram Mini App.

The final game must feel like a fast, satisfying, thoughtful board puzzle: the player drags or taps pieces from a tray onto a 10x10 grid, clears full rows and columns, earns score and rewards, and can instantly understand why a move is valid or invalid.

Core identity:
- Building Blox is a touch-first spatial puzzle, not a desktop drag demo.
- The player sees a 10x10 board, a three-piece tray, live score, cleared lines, current reward, saved run state, and end/restart controls.
- Every move should feel deliberate, snappy, and legible.
- The game should reward planning without slowing down quick play.

Visual direction:
- Use a cozy construction-table or magical blueprint style: carved board frame, clear 10x10 cells, tactile colorful blocks, subtle brass/wood or slate/painted-material accents.
- Blocks should read clearly at small mobile sizes. Shape recognition is more important than decoration.
- The board surface should be quiet enough that previews and placed blocks dominate.
- Use distinct colors for the current piece family, but avoid a one-note palette.
- Do not use emoji or CSS placeholder blocks in the final art.

Gameplay:
- Keep the authoritative 10x10 grid and the existing 3-piece tray contract.
- Include dot, 2-line, 3-line, L, square, T, S, 4-line, and 5-line pieces from the shared piece library.
- Support tray-to-board drag with capture-point anchored carried pieces.
- Support tap fallback: tap a tray piece, then tap a valid target cell.
- Show the snapped placement footprint before release.
- Show predicted row/column clears while the player hovers or drags over a valid placement.
- Reject invalid placement with a short, non-blocking "No fit" feedback event in the lower HUD/action log.
- Refill the tray only after all three pieces are placed, with a settle cue.
- End the run only when no remaining piece can fit, or when the player intentionally settles.

Animation and feedback:
- Pieces should lift slightly while dragged and settle into cells with a short scale/ease motion.
- Valid previews should glow softly; invalid previews should be clear but not alarming.
- Completed rows/columns should flash, then wipe out in a readable direction.
- Multi-line clears should feel more rewarding through a stronger but still lightweight effect.
- Avoid full-board redraw jank. Update only changed cells when practical.

UI and shell:
- Live HUD should show score, lines, and current reward.
- Pause menu should be compact: resume, short rule reminder, status row, restart/end/exit only where needed.
- Keep the tray in thumb reach without covering the grid.
- Keep all live events in the lower HUD/action log, not centered over the board.

Development requirements:
- Use existing shared Blox domain logic from `game-logic/blox-engine.js` and `game-logic/blox-pieces.js`.
- Pixi scene code should render the board and pointer sessions, but the rules must stay shared and server-safe.
- Use `createPointerSession()` and preserve blur/visibility cleanup.
- Keep saved state and leaderboard reads compatible with the current routes and player snapshot.

Asset requirements:
- Create separate board frame, empty cell, selected/valid/invalid preview, block material, tray, clear wipe, and HUD accent assets.
- Do not bake score, line counts, rewards, or labels into images.
- All assets must remain readable at 320px wide.

Acceptance criteria:
- The player can complete multiple placements by drag or tap only.
- Predicted clears match authoritative clears.
- No mobile swipe gesture changes tabs while manipulating pieces.
- The board, tray, HUD, and dialogs fit the full viewport QA matrix without clipped text or horizontal scroll.
```

## Prompt 3 - Gem Crush

```text
I want to finish Gem Crush as a polished Puzzling Potions-style Match-3 game inside the CC-GH Telegram Mini App.

The final game must feel like a complete potion-board puzzle: bright readable tokens, satisfying swaps, clean cascades, special pieces, multiple modes, saved runs, and reward settlement. It should feel handcrafted and magical, not like a generic glass UI skin.

Core identity:
- Gem Crush is an 8x8 Match-3 game with Classic, Timed, and Star Drop modes.
- The player swaps neighboring tokens to make matches of 3 or more.
- Classic mode uses move pressure.
- Timed mode uses a 90-second clock.
- Star Drop mode adds bottom-crediting drop tokens for gold, seeds, and energy.
- Active runs lock their mode so pause cannot accidentally change the rules.

Visual direction:
- Use a warm alchemy-table / Puzzling Potions art direction.
- Tokens should look like crisp collectible potion-creature gems: dragon, frog, newt, snake, spider, and yeti motifs.
- Special pieces should be visually distinct: row clear, column clear, blast, and colour clear.
- Drop tokens should clearly represent gold, seeds, and energy without using text.
- Board, HUD, and menu surfaces should feel standalone and themed, not inherited generic glass.

Gameplay:
- Directional swipe swapping must work on touch with short input locks.
- Tap-pair fallback must work for players who do not swipe.
- Invalid swaps should move out and back quickly without desync.
- Matches should clear, cascades should fall/fill with staged snapshots, and no overlay pieces should get stuck after cascades.
- Special pieces must trigger clear behavior matching their label.
- Star Drop tokens should auto-credit when they reach the bottom, repeatedly if cascades keep delivering them.
- Reshuffle is allowed only where it does not violate active-run mode locking.

Animation and feedback:
- Swap movement should be quick and elastic enough to feel responsive.
- Matches should pop with a clear burst and short score feedback in the lower HUD/action log.
- Cascades should preserve board readability: falling pieces should follow direct paths, not teleport.
- Combo feedback should be strong enough to notice but should not cover cells the player needs to inspect.
- Use the ticker only for active motion and feedback.

UI and shell:
- Live HUD should show score, moves or time, and combo.
- Mode setup should be outside active play and should not reappear as active-run clutter.
- Pause/result overlays should be compact and accessible.
- Board fitting must measure HUD chrome before sizing the board.
- Board should redraw after container and Telegram WebView viewport changes.

Development requirements:
- Use the current `src/game-core/match3/engine.js` rules and preserve serialized saved-mode hydration.
- Use the generated `pixi.match3` runtime bundle when available and stable public fallbacks otherwise.
- Keep `/api/player/mutate` actions compatible with existing saved mode and reward settlement.

Asset requirements:
- Use separate assets for six normal pieces, four special pieces, three drop tokens, board frame, empty cell, selected cell, HUD bar, menu panel, background table, shelf/block fallback, and clear-burst FX.
- Do not bake text, numbers, meter fills, or labels into art.
- Final tokens must remain readable at 48-72px.

Acceptance criteria:
- A player can start each mode, swap by touch, trigger cascades, create/use special pieces, settle rewards, pause/resume, and return to the exact board state.
- Star Drop credits bottom tokens correctly across repeated cascades.
- No stuck overlay pieces remain after animations.
- The 8x8 board is playable and readable at 320x568 and high DPI.
```

## Prompt 4 - Gacha Merge / Alchemy Table

```text
I want to finish Gacha Merge as a self-contained Alchemy Table game inside the CC-GH Telegram Mini App.

The final game surface must look and feel like the attached alchemy-table reference: a warm top-down wooden workbench with shelves, books, candles, brass tools, bottles, herbs, crystals, and a large central parchment board. The interactive grid already exists; preserve it as a real 7-row x 5-column gameplay board. The cells should be visible on the parchment surface, and 2.5D merge objects should sit on top of those cells with consistent bases, shadows, scale, and selection feedback.

Core identity:
- This is not a generic merge grid. It is an in-scene magical workbench.
- The player generates materials, drags or taps pairs, discovers alchemy recipes, earns Essence, opens Items/Recipes/Exchange drawers, and trades Essence into other game rewards.
- The full loop must be available from inside the scene, not buried in pause-only menus.
- The table should feel collectible, mysterious, and readable, with the board always remaining the star.

Required table surface:
- Central board: parchment or vellum playmat with a subtle 7x5 grid, softly rounded cells, gold/brass corner ornaments, and no baked text.
- Surrounding workbench: dark warm wood, botanical sketches, open recipe book, quill, glass potion bottles, herbs, lantern, astrolabe, compass, crystals, cloth, and small lab instruments.
- Props may frame the board but must never obscure cells, object bases, or bottom controls.
- On narrow mobile, preserve the central board crop and push decorative props behind or outside the active play region.
- Use the existing reference asset path as inspiration: `dist/assets-runtime/gacha-merge/backgrounds/table.158385b7.webp`.

Merge objects:
- Every item must be a separate transparent 2.5D object asset, not a flat badge or emoji.
- Objects should share a consistent isometric/top-down lighting angle so they sit naturally on the table.
- Each chain should have a distinct material identity:
  - Flora: seed, sprout, herb, blossom, vine, grove, lifebloom, world tree.
  - Earth: dust, clay, sand, stone, ore, crystal, geode, monolith.
  - Water: dew, droplet, stream, spring, pond, tide, rainstone, ocean heart.
  - Fire: ember, flame, coal, kiln, forge, sunshard, phoenix ash, solar core.
  - Air: breeze, cloud, spark, bolt, lightning, storm cell, aurora, tempest crown.
  - Alchemy: mud, brick, glass, vial, elixir, lens, astrolabe, philosopher stone.
- Higher-level objects should look more valuable and magical without becoming too large for a cell.
- Selection, target, occupied, and empty states should use separate cell assets and subtle FX.

Gameplay:
- Preserve the 7x5 board contract and server-validated board state.
- Support drag-to-merge and tap-pair merging.
- Matching identical chain-level pairs should upgrade within the chain where the rules allow.
- Cross-chain recipes should discover meaningful alchemy results, not arbitrary shortcuts.
- Failed attempts should give a small miss feedback without punishing the player.
- Trash mode must be explicit and safe, with a confirmation for valuable items.
- The random generator should create materials from free taps first, then crop fuel when selected.
- Free taps recharge every 20 minutes and bank up to 30.
- Daily drop, token pull, generator, trash, mode, Items, Recipes, Exchange, and pause controls must be reachable during play.

Discovery and economy:
- Items drawer shows known and undiscovered items without spoiling everything.
- Recipe Book shows known recipes and hidden recipe silhouettes/hints.
- Perfect reactions and first discoveries should produce stronger feedback.
- Essence rewards must be server-authoritative and use the existing `calculateMergeEssenceReward` model.
- Exchange should trade crafted Essence for Cozy Yard treats, shiny treats, and future game slots without creating unbounded claim history.

Animation and feedback:
- Dragged objects should lift from the table and snap back or merge with a short arc.
- Valid targets should glow before release.
- Successful merges should show recipe glow, object pop, Essence orb, and a lower HUD log entry.
- Effects should stay lightweight on the existing Pixi ticker path.
- Changed-cell patching should avoid redrawing the entire scene for every generator action.

UI and shell:
- Keep a live status strip and bottom action dock that explain the current source: free taps, chosen crop fuel, or empty state.
- In-scene drawers must be aspect-correct, reachable, focusable, and readable at 320px.
- Bottom controls must not cover the board or hide the last row of cells.
- Live game events should stay in the lower HUD/action log.

Asset requirements:
- Separate assets: table background, board frame, empty/occupied/selected/target cells, action dock, HUD bar, action icons, drawer panels, Essence orb, recipe glow, and every merge item.
- No baked readable text, no baked counters, no filled bars.
- Generated assets should enter `public/games/gacha-merge/{backgrounds,ui,fx,items}` and the runtime manifest through the existing asset pipeline.

Acceptance criteria:
- The game is fully playable from the Alchemy Table scene on mobile.
- The board visually matches the attached table direction while preserving the existing cells.
- 2.5D objects sit convincingly on cells and remain readable at 320x568.
- Items, Recipes, Exchange, generator, free taps, daily drop, token pull, and trash mode work without leaving live play.
```

## Prompt 5 - Bubbo Bubbo

```text
I want to finish Bubbo Bubbo as a polished pressure bubble shooter inside the CC-GH Telegram Mini App.

The final game must feel simple, fast, and satisfying: aim a bubble, bank off walls, match colors, clear clusters, drop unsupported islands, and survive the pressure row before the field reaches the danger line.

Core identity:
- Bubbo Bubbo is a mobile-first Pixi bubble shooter, not a decorative minigame.
- It has Classic mode with 36 shots and Timed mode with 90 seconds.
- The top pending pressure row is a real gameplay target, not a preview decoration.
- The player should always understand the next shot, queued bubble, pressure status, danger line, and recent clear events.

Field layout:
- Use an 11-row x 9-column hex-style bubble field with five readable colors: mint, amber, coral, sky, and berry.
- Render the pending row as virtual row `-1` above the visible field.
- Ground the cannon and reserve/queue in the bottom tray while keeping the playfield clear.
- Camera does not scroll; the board must fit the mobile game shell and resize/redraw after viewport changes.
- On narrow mobile, preserve aiming space and keep controls below the field.

Gameplay:
- Drag or touch aim should show a clear trajectory line with wall-bank reflection.
- Projectile motion should use constant path-distance speed, not frame-dependent jumps.
- A shot attaches to the nearest valid empty bubble cell.
- Three or more same-color bubbles pop.
- Unsupported multi-color islands drop after cluster clears.
- Pressure advances at intervals and inserts the pending row smoothly.
- Sparse fields after strong clears should auto-refill to at least three playable rows without punishment.
- Classic mode ends when shots run out or the danger condition resolves.
- Timed mode ends at 90 seconds and should not impose a shot limit.

Animation and feedback:
- Cannon rotation must be smooth and responsive.
- Fired bubbles should travel along the preview path and attach cleanly.
- Pops should feel snappy through scale, alpha, and small sparkle/ripple effects.
- Dropped islands should fall with capped lightweight motion.
- Pressure descent should be continuous and readable, not a sudden row teleport.
- Heavy effects should be avoided; use existing Pixi ticker/render path efficiently.

UI and shell:
- Live HUD should be Bubbo-specific: score, shots or time, pressure label, next bubble, and a recent clear/action log in the lower panel.
- Finish/settle controls must stay out of the live shot HUD.
- Pause menu should be compact and preserve shot, queue, pressure phase, row offset, and mode.
- Live events should not cover the playfield.

Art direction:
- Use polished arcade-cute bubble shooter art: glossy but readable bubbles, soft space/fantasy background, tactile cannon, compact bottom tray, clear danger line.
- Avoid noisy backgrounds that hide bubbles.
- Bubbles must remain distinguishable by color and shape/value at high DPI and small mobile sizes.

Development requirements:
- Preserve the pure Bubbo engine in `src/game-core/bubbo/engine.js`.
- Store pending row, row offset, pressure phase, score, mode, shots/time, current bubble, and queue as real run state.
- Keep server-backed run lifecycle and reward settlement compatible with existing player mutations.
- Use shared pointer-session cleanup for blur and visibility changes.

Asset requirements:
- Separate assets for bubble sheet, cannon body/barrel/top, bottom tray, background tile, laser/trajectory line, danger line, pressure row accent, pop FX, drop FX, and HUD accents.
- No baked counters, score, pressure labels, or mode text in images.

Acceptance criteria:
- The player can complete a Classic run and a 90-second Timed run by touch only.
- Pending row is hittable and participates in cluster/anchor logic.
- Strong clears do not leave the player waiting on an empty field.
- The whole scene fits 320x568 without HUD overlap or clipped controls.
```

## Prompt 6 - Brain Blitz

```text
I want to finish Brain Blitz as a polished mobile trivia game inside the CC-GH Telegram Mini App.

The final game must feel like a quick, fair, readable quiz arena: pick a category and difficulty, answer timed questions, build streaks, play solo or duel, pause safely, and see results without losing context.

Core identity:
- Brain Blitz is a React-first trivia game, not a Pixi board game.
- It supports solo sessions and duel rooms.
- It should feel fast and competitive, but calm enough for mobile reading.
- The most important surface is the current question: text, answers, timer, reveal state, score, and streak.

Game modes:
- Solo mode starts immediately with selected category and difficulty.
- Duel mode creates a room, shows an invite code, lets players join/ready, starts a shared question flow, and shows results.
- Categories may be blank for "Any".
- Difficulty supports easy, medium, hard, and all.
- A session should preserve the current question and timer state while paused.

Question flow:
- Each question has a visible timer.
- Answers should be large touch targets with clear selected, correct, incorrect, disabled, and reveal states.
- Submitting an answer shows a short 1.1s reveal before advancing.
- Correctness, correct answer, points, streak, and timing should be clear.
- Network errors should show a concise recoverable message, not break the session.

Visual direction:
- Use a playful quiz-show / study-card style that fits the broader cozy game hub.
- Avoid a marketing landing page. The first screen is the actual menu with category, difficulty, solo, duel, join, and history surfaces.
- Use restrained color: readable cards, strong answer contrast, progress/timer emphasis, subtle celebratory results.
- Avoid decorative backgrounds behind long question text that reduce readability.

UI and shell:
- Live HUD should show title, category/difficulty subtitle, score, streak, and time.
- Pause overlay should be compact: resume, status, and exit/restart only where needed.
- Results should show score, streak, duel outcome if applicable, and a clear way back to menu.
- Join code input and ready/start controls must be reachable and focusable on mobile.
- On 320px width, answer text must wrap cleanly and never overflow its button.

Timing and fairness:
- Time sent to the server should reflect the actual local answer timing.
- Do not allow duplicate answer submission during reveal.
- Duel status polling should not start the duel twice or lose the room id.
- Pausing should freeze the local interaction surface without corrupting server answer state.

Development requirements:
- Preserve current `/api/trivia/*` route contracts and player snapshot scoring.
- Keep i18n in existing translation files.
- Keep question selection and client-question shaping server-side.
- Make error states explicit and testable.

Asset requirements:
- Optional visual assets: quiz panel backing, answer button states, timer ring, duel badge, result trophy, category icons.
- Do not bake question text, answers, invite codes, scores, or timers into art.

Acceptance criteria:
- A player can complete a solo session by touch only.
- Two players can create/join/ready/play a duel without stale room UI.
- Answer reveal states are readable, timed, and non-overlapping.
- The question card, answers, timer, and pause/results overlays fit the mobile QA matrix.
```

## Prompt 7 - Cozy Yard

```text
I want to finish Cozy Yard as a premium mixed-pet idle collector inside the CC-GH Telegram Mini App.

The final game must feel like a living yard diorama: place food and goodies, wait for visitors, watch pets move and interact, collect gifts and mementos, take photos, remodel the yard, repair worn items, and build a gentle collection over time.

Core identity:
- Cozy Yard replaces the old Pet Room with a self-contained yard game.
- It is inspired by classic visitor-collector loops, but it must be original and integrated with CC-GH economy and mobile shell.
- The player should feel ownership over the yard layout, visitors, photo album, gift collection, remodels, and helper companion.
- There are no real-money paths.

Scene layout:
- The first screen is the live yard scene with a standalone mobile-style HUD.
- Yard backgrounds include Morning Meadow, Moon Garden, and Tea House, with support for more remodels.
- Goodies are freely placed by yard coordinates and clamped to the active remodel playzone.
- Food bowls, goodies, visitors, companion, gifts, activity status, and bottom dock must all fit without covering the play area.
- Bottom dock labels sit above icons for mobile readability and must not clip at 320px.

Visitor simulation:
- Food attracts visitors over classic-hour windows.
- Visitors should enter, roam, settle, interact with goodies, leave gifts, and become entries in the Petbook.
- Goodies define activity anchors, capacity, layable surfaces, blocking behavior, visual anchors, and condition variants.
- Layable surfaces should allow stationary poses on top of the decoration.
- Non-layable goodies become route obstacles.
- Visitor names should stay hidden during live play unless focused/hovered so they do not cover the yard.

Gameplay loops:
- Food: set bowls, buy food, watch duration/servings, and refill when empty.
- Goodies: buy, place, move, store, repair worn/broken variants, and inspect interactions.
- Shop: food, goodies, backgrounds/remodels, and future expansion items.
- Petbook: visitor species, rarity, visit count, known/unknown states, mementos.
- Album: take photos, favorite photos, keep captions.
- Gifts: collect pending gifts and special mementos.
- Daily letter: claim daily stamps/rewards.
- Companion helper: configure home companion and helper refill behavior.

Visual direction:
- Cozy illustrated yard diorama with soft hand-painted backgrounds, clear walkable areas, readable decoration silhouettes, and expressive pet poses.
- Characters should be cute and charming without becoming childish stickers.
- Art should support multiple remodel moods: warm meadow, moonlit garden, quiet tea house.
- Decoration condition variants must be visible: fresh, worn, broken.

Motion and feedback:
- Visitor movement should be calm, believable, and bounded to playzones.
- Interactions should use pose-specific art and short transitions, not teleporting.
- Pending server actions should show entity-level pending visuals.
- Weak connections should retry through the outbox silently where safe instead of showing tap-then-rollback behavior.
- Gift collection, new visitor, memento, photo, repair, and remodel changes need small clear feedback in the lower HUD/action log.

UI and shell:
- Open all food, goodies, shop, petbook, album, gifts, remodel, expansion, helper, camera, sound, and settings screens inside the playfield.
- Dialogs must be bounded above the bottom dock and remain focusable.
- Shop rows need aligned thumbnails, descriptions, prices, and action buttons in a thumb-safe mobile grid.
- Keep localizations complete in English and Russian.

Development requirements:
- Use `game-logic/yard-catalog.js` for catalog truth and `game-logic/yard-playzones.js` for placement/motion bounds.
- Preserve durable client outbox with `clientActionId`, entity-level pending visuals, retry timing, reconnect/focus/visibility drains, IndexedDB, and localStorage fallback.
- Keep server-simulated time authoritative for visits, gifts, and daily letters.
- Use manifest-backed background overrides and stable asset ids.

Asset requirements:
- Separate assets for remodel backgrounds, foods, goodies base/worn/broken variants, companion bodies, visitor base and pose-specific art, HUD icon sheet, gift/memento/photo accents.
- No baked labels, prices, counts, or visitor names in art.

Acceptance criteria:
- A player can set food, place/move goodies, wait for visitors, collect gifts, repair items, buy a remodel, take a photo, and inspect Petbook/Album on mobile.
- Visitors stay inside the active playzone and interact with placed goodies at correct anchors.
- Outbox retry behavior prevents visible rollback during weak network conditions.
- All bottom dock and dialog surfaces pass 320x568 and high-DPI QA.
```

## Prompt 8 - Farm (Hidden Legacy Candidate)

```text
I want to finish Farm as a hidden-but-shippable farming game candidate inside the CC-GH Telegram Mini App, or use this prompt as the retirement target if Farm is brought back into the visible game registry.

The final game must feel like a compact, touch-first crop field that feeds the wider hub economy: plant seeds, water crops, harvest resources, buy seeds, unlock plots, manage a bag, earn XP, and send harvested crops into systems such as Gacha Merge fuel.

Core identity:
- Farm is a Pixi field plus React side panels.
- It should be simple, deterministic, and useful, not a second idle garden.
- The core loop is plot action: empty plot plants the selected seed, growing crop waters if dry, mature crop harvests.
- Long press uproots planted crops.

Field layout:
- The first live screen should show the farm field with plots large enough for touch.
- Plot states must be visually distinct: empty soil, planted seed, growing crop, watered crop, ready harvest, pending mutation, disabled/locked.
- Selected seed and available seed count must be visible during live play.
- HUD should show gold, plot count, selected seed count, farm level, and XP.
- Side panel tabs: shop, bag, badges, journal, season.

Gameplay:
- Planting consumes seed inventory.
- Watering accelerates growth through the shared watering multiplier.
- Harvesting adds harvested crops and XP.
- Harvest All is a deliberate HUD or panel action.
- Buy Seeds supports quantity selection and clear affordability feedback.
- Buy Plot unlocks new farm capacity.
- Fertilizer/boosters should be explicit and not silently applied.
- Themes should be cosmetic and should not change crop growth math unless explicitly designed.

Offline and helper behavior:
- Offline progress should be bounded and explain what happened: harvested, planted, watered, food eaten, XP gained, and open loops.
- Pet/helper automation should consume fullness according to existing rules and never produce runaway epoch-scale progress.
- Open loops should guide the next visit: crops part-grown, dry plots, full inventory, ready harvests.

Visual direction:
- Use a small storybook farm patch with warm soil, readable crop sprites, seed packets, water glints, harvest basket, and seasonal accents.
- Keep it visually distinct from Garden Shelf: outdoor crop plots, not indoor plant shelves.
- Avoid cluttered scenery behind plots.

UI and shell:
- All plot actions must be touch-first.
- Side panels should be reachable without covering all plots unless paused.
- Bag controls must have real click handlers and deterministic action results.
- Journal should explain crop unlocks, timing, yield, and fuel value.
- Season tab can show long-term goals only if it is backed by real state.

Development requirements:
- Use `game-logic/farm.js`, `game-logic/crops.js`, and `/api/player/mutate` farm actions as source of truth.
- Preserve inventory normalization shared with Merge and Bag.
- Keep Farm hidden in `gameRegistry` unless product direction explicitly makes it visible again.
- If the game remains hidden, keep its code path compatible enough that economy resources do not rot.

Asset requirements:
- Separate assets for soil plot states, crop growth phases, water effect, harvest effect, seed packet icons, booster icons, field background, plot theme variants, and compact HUD accents.
- No baked quantities, prices, timers, or labels in art.

Acceptance criteria:
- If visible, a player can plant, water, harvest, buy seeds, buy plots, use Bag, inspect Journal, and harvest all by touch only.
- If hidden, tests still protect the farm state/economy paths used by Merge fuel and inventory.
- Offline simulation is bounded and reports understandable results.
- The field and side panels fit the mobile QA matrix without stealing navigation swipes.
```

## Open Questions To Confirm

1. Should `Farm` remain hidden forever, return as a visible game, or be treated only as an economy backend for Merge fuel?
2. Do you want these prompts to become implementation specs under `docs/superpowers/specs/`, or should they stay as reusable prompt-pack material?
3. Should all games share one broad "cozy magical tabletop" world style, or should each game keep a stronger separate identity?
4. For `Merge/Alchemy Table`, should the 7x5 board size remain fixed permanently, or can final art imply a larger table while gameplay still exposes 7x5 cells?
5. For `Merge`, should every item in all six chains be upgraded to full 2.5D object art, or should the first production pass prioritize low/mid-tier items and fall back for rare top tiers?
6. For `Garden Shelf`, should plant arrangement become more freeform, or should the 5 shelves x 3 spots structure remain the final contract?
7. For `Cozy Yard`, should the helper companion be purely utility, or should it become a visible character with its own relationship/progression?
8. For `Brain Blitz`, should duel rooms stay in-memory for now, or should final state require durable/reconnectable duel sessions?
9. For `Bubbo`, should final scoring prioritize survival, clear size, speed, bank shots, or mode-specific leaderboards?
10. For `Blox`, should the final theme be construction/blueprint, magical mosaic, or toy-block workshop?
11. For `Gem Crush`, should Star Drop become the main mode or remain one of three equal modes?
12. Should final prompts include exact asset counts and file names for every game, similar to the MapleStory prompt, or is the current asset-contract level enough?
