# CC-GH UI/UX Mental Map

Date: 2026-05-16

This document is the working map for how UI assets, runtime functions, and layout responsibilities should relate across CC-GH screens. It exists to prevent the failure mode visible in recent mobile captures: decorative panel art, text, controls, and game-state functions drifting into separate coordinate systems.

## Core Principles

- Mobile first: every surface must fit at 320x568 before desktop polish is considered done.
- One surface, one job: panel art provides material and slots; React/Pixi owns dynamic text, state, counters, and input.
- No baked dynamic data: localized labels, prices, timers, rewards, and counters stay in DOM/Pixi text.
- No hover-only affordances: every function must be reachable by tap, keyboard focus, and visible state.
- Protect the playfield: HUDs and action docks must not cover hittable Pixi cells, bubbles, gems, merge objects, or settlement controls.
- Buttons are function-first: primary starts/resumes/claims, secondary changes setup, danger exits/destructs, disabled explains unavailable state without looking tappable.
- Dialogs are reachable surfaces: role dialog, focus target, close/exit path, no horizontal scroll, practical 44x44 CSS px tap targets.

## Shared Shell

| Surface | Function | Asset contract | Layout contract |
|---|---|---|---|
| Topbar | App identity, profile/status/theme | `hub-panel`, stat chip art, icon images | Header stays compact; resource chips are scan-first and never wrap into the game frame. |
| Resource chips | Gold, garden XP, quest entry, game HUD descriptors | Semantic stat icons from game assets | Numeric text must be centered on the chip reading lane; chip labels can truncate, values cannot disappear. |
| Active game frame | Hosts game DOM/Pixi shell | Game-specific shell background plus `ui-surfaces` panels | In play mode the frame fills available height; overlays center inside frame, not the browser page. |
| Bottom tabs | Navigation between visible games | Hub/yard dock material | At 320px labels/icons do not clip; touch targets remain usable even when labels shorten. |
| Event log | Live game feedback | DOM HUD chips, not modal art | Live-game events stay in the lower HUD/action log unless the game intentionally opens a dialog. |

## Screen Surface Map

`src/app/screenSurfaceAssets.js` is the semantic map. Runtime CSS and components should use it conceptually even when a component imports direct CSS variables. Screen-level panel art lives under `public/games/ui-surfaces/`; game objects, board pieces, plants, bubbles, and merge items are separate gameplay assets.

## Garden Shelf

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Live shelf | Inspect growth, collect, open plant detail | Shelf/garden panel art frames plants; plant state is DOM/Pixi content | Plants stay visually central; detail buttons must not overlap adjacent slots. |
| Plant detail sheet | Collect, store, water/care, upgrade income, delete | `garden-dialog-panel` frames detail; plant sprite and economics are dynamic | Bottom sheet scrolls vertically only; close button remains 44x44; action grid wraps before clipping. |
| Seed shop/inventory | Buy/select seeds, inspect stock | Dialog panel plus seed/card assets | Cards use grid/list lanes; prices and counts are DOM text. |
| Quest dialog | Review daily/story/locked goals, claim rewards | Dialog art gives parchment frame; quest rows are transparent content lanes | Scroll area is inside parchment, not over frame; close button uses close icon art; claim button aligns to row end. |
| Settings dialog | Theme/audio/language choices | Same dialog material, segmented/toggle controls | Choices are large enough for thumb input and visible focus. |
| Offline/reward dialogs | Explain return rewards/level ups | Reward icon art plus dialog panel | Primary claim/dismiss is the visual end state; no hidden second action. |

## Building Blox

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Menu | Start or resume planning from a clear board state | Wood/gold dialog art provides parchment and bottom slots; mode/status text is dynamic | Header, brief, metrics, and buttons anchor to named lanes, not generic top-left padding. |
| Live playfield | Place tray pieces and clear lines | Pixi board/tray assets own play area; DOM HUD owns score/reward/pause | HUD stays above board; tray remains thumb reachable; pointer sessions clean on blur/visibility. |
| Pause | Resume, restart, end run, exit | Same dialog art; pause copy and status are DOM | Resume sits in the parchment action lane; restart/end/exit sit in bottom slots and never cross frame hardware. |
| Result/settle | Confirm run value and next action | Result surface plus dynamic score/reward | Peak/end feedback should be clear; primary action is restart or return. |
| Buttons | Start/resume primary, restart secondary, end run neutral, exit danger | Transparent hitboxes over authored slots | Hitbox can be transparent, but label/icon must be centered in the intended slot. |

## Gem Crush

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Mode menu | Pick Classic/Timed/Star Drop, start, reshuffle, exit | Potion/wood dialog art frames mode cards and bottom actions | Mode cards use a vertical stack on narrow screens; active state is visible without hover. |
| Live board | Swap gems, track score/moves/time/combo | Pixi board owns cells; DOM HUD owns counters/pause | Board top is below HUD; HUD never covers swappable cells. |
| Compact pause | Resume/end/new/exit without changing active mode | Compact dialog, no full setup controls | Active run cannot accidentally mutate mode. |
| Result/end | Show score/reward and next action | Result panel with dynamic metrics | Metrics have stable lanes and readable contrast. |

## Gacha Merge

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Live board | Generate, merge, sell/trash, manage sources | Pixi board/items own interaction; DOM dock owns actions | Docks avoid board cells and block nav-swipe inside interactive areas. |
| Recipe book | Discover merge chains | Dialog/drawer rail art plus dynamic recipes | Dense, scrollable, no dashboard-card pileup. |
| Item book | Inspect owned/discovered items | Library rail/list art plus item sprites | Item text stays outside sprite pixels; selected state is explicit. |
| Exchange/shop | Spend resources and inspect offers | Exchange icon/surface art plus dynamic price text | Prices are not baked; unavailable states are disabled, not hidden. |
| Pause | Recover/exit active run safely | Dialog art and transparent buttons | Resume/restart/exit are separated by consequence. |

## Bubbo Bubbo

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Start menu | Choose Classic/Timed, preview saved run, start/new/exit | Dialog art gives parchment and bottom slots; bubble field remains background context | Pause copy cannot collide with mode cards; saved-run banner has a reserved lane. |
| Live field | Aim/fire, read next/current bubble and pressure | Pixi field/cannon owns action; DOM bottom HUD owns score/limit/pressure/pause | Bottom HUD reserves cannon/playfield space and remains thumb reachable. |
| Pause | Resume/end/restart/exit active run | Same dialog frame, recovery copy, status chips | Action stack is placed in functional lanes, not arbitrary flow. |
| Result | Understand run outcome and choose restart/exit | Dialog frame with result content; no oversized translucent card covering the frame | Metric chips use dark text on parchment and remain inside the inner panel. |
| Buttons | Start/resume primary, new field secondary, exit danger | Transparent hitboxes over authored bottom slots | Labels truncate only as a last resort; icons remain visible. |

## Brain Blitz / Trivia

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Menu | Choose solo/duel and enter room | Trivia dialog plus button art | Setup choices are grouped by mode and do not look like generic forms. |
| Question | Read prompt, answer, see timer | Question panel art plus answer button states | Question text wraps in panel; answer buttons are at least 44px high. |
| Answer reveal | Learn correct/incorrect result | Correct/danger answer state art | Feedback is immediate and visually distinct without relying on color alone. |
| Duel room | Show readiness/ticket/status | Duel room panel/ticket assets | Readiness actions are clear and focusable. |
| Results/history | Show score and return/retry | Result panel/trophy art | Primary next action is visible above secondary history. |

## Cozy Yard

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Live yard | Feed/play/decorate companion | Yard background and pet sprites own scene; DOM dock owns tools | Scene stays inspectable; dock does not cover pet focal area. |
| Food/goodies/shop | Pick inventory or purchase | Yard panel/button/photo assets | Repeated items can use cards; avoid nested card frames. |
| Petbook/album | Browse companion records/photos | Photo frame assets plus dynamic metadata | Media remains inspectable; captions do not cover images. |
| Gifts/repair/remodel/expansion/daily/companion/settings | Secondary management | Yard panel surfaces | Open as drawers/panels, not permanent overlays. |

## Settlement / Town

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Live settlement | Inspect and place town objects | Pixi/canvas scene plus settlement HUD art | Right panel and bottom nav must never clip at 320px. |
| Construction | Pick category/build/place | Construction panel assets and dynamic cards | Panel clears bottom dock; placement hint remains visible. |
| Inventory | Inspect resources and selected item | Inventory rows/chips | Required rows are visible and reachable on small mobile. |
| World map | Choose expedition/marker | Map base/marker assets | Map and action card stay inside viewport. |
| Bottom nav | Switch town panels | Settlement dock/button assets | Full/short labels swap before clipping; tap targets stay practical. |

## Hidden Farm Compatibility

| Window/control | Player job | Asset/function relationship | Layout rules |
|---|---|---|---|
| Live field | Plant/harvest existing compatibility state | Farm panel/plot assets | Hidden tab still keeps runtime asset contract valid. |
| Shop/bag/plot detail/journal/season | Legacy management | Farm compatibility surfaces | Keep documented and tested so re-exposure does not need emergency UI work. |

## Implementation Rules

- Prefer shared shell primitives (`GameShell`, `GamePlayHud`, `PanelButton`, `PauseBrief`) before inventing one-off game CSS.
- When decorative art contains button slots, use transparent hitboxes, but anchor them with named phase selectors (`menu`, `paused`, `result`) and stronger play-mode selectors.
- Do not let global play-mode mobile CSS override game-specific frame geometry.
- If text does not fit the authored lane, reduce copy length or clamp the secondary copy; do not push controls into the frame border.
- If a generated asset forces bad text contrast or unusable slot geometry, regenerate or replace that asset. Do not compensate with random absolute offsets.

## QA Checklist

- Core HUD/WebView matrix: 320x568, 360x800, 390x844, 414x896, 568x320, 844x390, 768x1024, 1024x768, 1280x720.
- Extended/rotating phone checks for risky typography, dock, and HUD work: 375x812, 384x832, 393x873, 412x915, 430x932.
- At least one `deviceScaleFactor: 2` pass.
- Mobile contexts use `isMobile: true` and `hasTouch: true`.
- No horizontal scroll at 320px.
- Bottom docks do not clip labels/icons.
- HUDs do not overlap Pixi playfields.
- Dialogs are reachable, focusable, and have visible dismiss/exit paths.
- Practical tap targets are at least 44x44 CSS px.
- Pointer sessions clean up on blur/visibility changes.
- Pixi canvas resizes after viewport changes.
- Visual QA is separate from functional QA: visible clipping, unreadable contrast, broken layering, or awkward motion is a bug even when tests pass.
