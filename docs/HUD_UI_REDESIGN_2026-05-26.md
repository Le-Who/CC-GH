# HUD/UI Redesign 2026-05-26

This document is the production contract for the current HUD/UI rebuild. The visible game scope is `garden`, `blox`, `match3`, `merge`, `bubbo`, `trivia`, `room`, and `settlement`. `farm` remains hidden legacy in `GAME_REGISTRY`; the generator keeps a new compatible panel asset for it, but it is not treated as a visible game redesign.

Generated outputs:

- AI visual reference board: `assets-source/imagegen/hud-redesign/references/reference-board-ai.png`
- Per-game mobile reference PNGs: `assets-source/imagegen/hud-redesign/references/*-hud-reference.png`
- Per-asset imagegen source files: `assets-source/imagegen/hud-redesign/asset-sources/<game>/<asset>.source.chromakey.png`
- Per-game postprocessed chromakey assets: `assets-source/imagegen/hud-redesign/assets/<game>/*.chromakey.png`
- Runtime transparent assets: `public/games/hud-redesign/<game>/*.png`
- Per-icon semantic source art: `assets-source/imagegen/hud-redesign/semantic-icons/<game>/<icon>.source.*`
- Runtime semantic icons: `public/games/hud-redesign/<game>/semantic-icons/*.png`
- Rebuilt shared screen surfaces: `public/games/ui-surfaces/*.png`
- Machine-readable manifest: `assets-source/imagegen/hud-redesign/hud-redesign-manifest.json`
- Asset QA contact reference: `assets-source/imagegen/hud-redesign/references/standalone-asset-contact.png`

All production references are image-generated screenshots, not SVG wireframes. Chromakey source assets are standalone generated, textless, data-free UI skins derived from the visual direction of those references; they are not screenshot crops, atlas/sheet crops, or programmatic SVG/vector placeholder drawings. Each production HUD/UI asset must start as its own image-generated source file, not as a shared sheet. They must not bake numbers, labels, filled progress bars, or gameplay state into the artwork. Source assets use a flat chromakey background that is not used as an asset color; runtime copies use transparent backgrounds.

Semantic compact icons are data-free, textless runtime art normalized from production source assets into one source file and one runtime file per icon. They are fixed internal composition for existing HUD chips, panel buttons, Yard dock buttons, and compact action buttons; they do not add new layout regions unless the parent region itself changes safe area, reserves, dock size, or editor-tunable placement.

## Game HUD Metrics And Layouts

### Garden Shelf

Required indicators: gold, level/xp, growth stage, production readiness, water/tap cooldown, quest claim state, inventory/shop state.

Layout:

- `topMetricPlaque`: gold, level/xp, settings.
- `questBadge`: claimability and quest count.
- `shelfPlayfield`: plants, phases, production timers, tappable growth area.
- `lowerQuestSheet`: quest progress and reward.
- `bottomToolDock`: shop, water, collect, pot, tasks.

### Blox

Required indicators: score, lines, reward track, reward chest tier, available tray pieces, selected piece, valid/invalid placement feedback.

Layout:

- `topScoreRail`: score, stars/rewards, pause.
- `boardField`: grid and placement preview.
- `pieceTray`: three pieces and selected state.
- `rewardRail`: lines and reward progress.
- `feedbackBand`: combo and invalid-placement feedback outside the board.

### Gem Crush

Required indicators: score, moves/time, combo, mode/target, reward chest tier, selected gem, cascade/lock state, reward drops, shuffle booster charge.

Layout:

- `topPotionRail`: score, moves/time, combo, pause.
- `gemBoard`: board, selected gem, cascade focus.
- `boosterBar`: selected gem, boosters, reward drops.
- `modeStrip`: target/mode state.
- `lowerActionReserve`: hint/reward/pause affordances without covering the board.

### Alchemy Merge

Required indicators: essence, free taps, fuel/tokens, generator cooldown, selected cell, trash mode, active drawer.

Layout:

- `topResourceRail`: essence, fuel, generator cooldown, pause.
- `mergeBoard`: source board and selected cell.
- `trashModeDock`: trash mode and generator state.
- `drawerStrip`: active drawer or inventory surface.
- `bottomActionDock`: generate, free taps, library.

### Bubbo

Required indicators: score, shots/time, danger/pressure, reward chest tier, current bubble, next bubble, remaining bubbles, mode, bubble-swap charge.

Layout:

- `topDangerRail`: score, shots/time, danger, pause.
- `bubbleField`: bubble cluster and clear aim line.
- `cannonZone`: current and next bubble.
- `bottomCommandBar`: mode, powerups, remaining count.
- `feedbackPocket`: combo feedback outside the firing lane.

### Trivia

Required indicators: score, streak, timer, question index, answer reveal state, duel room/status, history, solo lifeline charges.

Layout:

- `topQuestionRail`: timer, streak, question index, pause.
- `questionPanel`: category and question.
- `answerGrid`: answers and reveal states.
- `helpDock`: ask/reveal/history.
- `progressRail`: score and reward progression.

### Cozy Yard

Required indicators: treats, shiny treats, gifts, visitors, pending sync, active tool/screen, placement draft.

Layout:

- `edgeCurrencyStack`: currency, gifts, visitors, settings.
- `yardStage`: gameplay scene, decor, placement draft.
- `activeToolCard`: current tool and cooldown.
- `bottomDock`: food, goodies, shop, petbook, album, gifts.
- `syncNotice`: pending sync feedback.

### Settlement

Required indicators: core resources, morale, population, prestige, collect readiness, selected building/slot, active panel, construction/research/world-map state.

Layout:

- `topResourceRibbon`: resources, morale, population.
- `mapCanvas`: Pixi map and coordinate-space anchors.
- `leftToolRail`: build, goals, inventory, council.
- `mobileBottomSheet`: selected building and construction state.
- `bottomNav`: build, research, world, shop.

Settlement keeps its custom Pixi/canvas adapters and coordinate-space layout registrations. The redesign updates the visual kit and layout version without moving authored map coordinates into one-off constants.

## Implementation Notes

Compact HUD and dock labels are not visible layout text. Live-game stat chips, compact action buttons, Garden top metrics, and Yard bottom dock buttons render as centered icon plus value or icon-only controls. The human label must remain available through `aria-label`, `title` or `data-tooltip`, and the shared press/focus tooltip. Tooltip state must clear on `pointerup`, `pointercancel`, `blur`, visibility changes, and route changes. Visible compact labels must not reserve space, push icons, or change generated asset alignment.

The redesign may expose lightweight mechanics when the HUD references need them:

- Reward chest progress is shared by score-driven games through `game-logic/hud-bonuses.js`; the server/client settled reward calculators include the same deterministic bonus tiers shown in visible HUD reward values.
- Gem Crush gets one real in-run `Mix` shuffle booster that regenerates the active board and syncs the run.
- Bubbo gets one real `Swap` charge that swaps the current and next bubble.
- Trivia solo mode gets real server-backed `50/50` and `Hint` lifelines through `/api/trivia/lifeline`; client questions still do not expose `correctAnswer` directly.

The rebuild uses `scripts/generate-hud-redesign-pack.mjs` as the canonical asset generator. Do not hand-edit generated PNGs. If a future layout or visual primitive changes, update the generator, regenerate with `pnpm run hud-redesign:generate`, then run:

```sh
pnpm run hud-layout:validate
node --test tests/hud-redesign-pack.test.js tests/ui-screen-surfaces.test.js tests/hud-layout.test.js tests/hud-bonuses.test.js
```

For browser QA, use the full HUD/WebView viewport matrix from `AGENTS.md` after broad HUD, Pixi, dock, or touch changes.
