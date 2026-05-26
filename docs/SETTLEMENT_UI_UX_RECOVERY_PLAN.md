# Settlement UI/UX Recovery Plan

Date: 2026-05-15

This file parks the settlement recovery plan so the implementation can return to it without losing scope.

## Target

Bring the Settlement game to a playable, mobile-first UI/UX state where every visible screen has a clear job, every control has a reachable target, and the game uses detailed stylized bitmap assets for visual surfaces instead of flat SVG-like placeholders.

## Mental Map

1. City view: pan/zoom map, select buildings, read state from HUD, collect ready resources, react to notices.
2. Building detail: inspect one building, understand its role, see production/cost, start upgrades, see timers.
3. Construction: choose a category and item, choose an empty map plot, confirm construction, select the built object, demolish it if needed.
4. Inventory and warehouse: see all resources, capacity pressure, selected resource details, adjust or boost capacity.
5. Goals and village news: see immediate tasks, claim ready rewards, keep live-game events in lower HUD or action log.
6. Council and research: receive recommendations, inspect technology state, start research only when requirements and resources are clear.
7. World map: choose route filters, inspect expedition cards, understand locked/busy/available states, start a single expedition.
8. HUD and navigation: show only core top resources on the map, keep the full resource list in inventory, keep bottom/left controls thumb-reachable and away from the Pixi playfield.

## Design Rules

- Mobile first: core HUD/WebView matrix is 320x568, 360x800, 390x844, 414x896, 568x320, 844x390, 768x1024, 1024x768, 1280x720. Add a rotating extended phone pass such as 375x812, 384x832, 393x873, 412x915, or 430x932 for risky typography, dock, and HUD work.
- At least one high-DPI pass with `deviceScaleFactor: 2`.
- Touch QA must use `isMobile: true` and `hasTouch: true`.
- No horizontal scroll at 320px.
- Top HUD must not overlap itself or hide core resources.
- Bottom dock must not clip icons or labels.
- Dialogs and panels must stay reachable and focusable.
- Tap targets should be at least 44x44 CSS px where practical.
- Pixi pointer sessions must clean up on blur/visibility changes.
- Pixi canvas must resize after viewport changes.
- Visual QA is separate from functional QA.

## Implementation Pass

1. Replace the fake construction confirmation with real state: selected slot, occupied slots, paid cost, visible built WebP sprite, and demolition.
2. Make construction placement legible: multiple WebP-backed ghost plots, selected plot state, clear confirm instruction, and no faint Graphics-only placeholder.
3. Reduce top HUD to core resources; move the complete resource picture into Inventory.
4. Rework Inventory into a warehouse view with a selected-resource summary, capacity pressure bars, and clearer capacity actions.
5. Rework World Map layout so the WebP map, filters, cards, rewards, difficulty, and action buttons cannot overlap at narrow widths.
6. Tighten panel layout and responsive CSS so text uses available space without clipping or stacking over controls.
7. Validate with focused store tests, build, and Playwright viewport matrix.

## Acceptance Checks

- Construction can build and demolish at runtime.
- A built construction item is selectable on the map and visible as an actual bitmap building.
- An occupied plot cannot be built over.
- Top HUD shows a stable core set and never depends on hiding resources because of overlap.
- Inventory is the authoritative full resource/warehouse screen.
- World map uses the generated WebP base and marker/chrome assets, with no legacy flat map layer visible.
- All named mobile/tablet/desktop viewport passes have no horizontal scroll, no clipped primary controls, and no unreadable overlap.
