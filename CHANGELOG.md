# Changelog

## v6.2.1 — 2026-02-22

### Performance & UX — 7-Fix Optimization Pass

Comprehensive performance audit and remediation. Zero breaking changes, 318/318 tests pass.

#### 1. `effects.js` — Shared Effects Module (DRY)

- **New module** `public/js/effects.js` — centralised source of truth for all visual/audio effects.
- **`perlinShake(el, intensity, durationMs)`**: Removed 39-line duplicate from `match3.js` and 30-line duplicate from `blox.js` (−120 lines total). Now a single versioned export with a **Page Visibility gate** — skips animation when tab is backgrounded (Discord Electron iframe focus).
- **`colorSplash(el, color)`**: Inset box-shadow flash with zero layout impact.
- **`debounce(fn, wait)`**: Utility with `.cancel()` / `.flush()` used for П7 timer fixes.
- **`SoundEngine`**: Web Audio API synthesiser + `navigator.vibrate()`. See П6 below.
- Registered in `server.js` import map for content-hash cache busting.

#### 2. Farm Dirty-Check — O(1) Reference Equality

- `syncFromStore()` in `farm.js` previously serialised all plots via `JSON.stringify(storeState.plots)` on every call.
- The local growth timer calls this **every ~1 second**, producing ~**3,600 `JSON.stringify` calls per hour**.
- **Fix**: Replaced with a simple reference equality check (`storeState === _lastStoreRef`). Object identity is guaranteed by GameStore's immutable-update pattern — if the reference didn't change, the data didn't change.

#### 3. Merge Generator Panel — Conditional Re-render

- `GameStore.subscribe("merge", ...)` previously called both `_renderBoard()` **and** `_renderGeneratorPanel()` on every state change, including drag/merge operations that don't touch generator data.
- **Fix**: Panel re-renders only when `generatorState`, `generators`, or `lastFreePull` actually changes. Board renders unconditionally. Eliminates 4–7 `createElement` + `addEventListener` calls per user drag.

#### 4. Timer Leak Cleanup — 3 Modules

- `match3.js`, `blox.js`, and `merge.js` each maintained a permanent `setInterval` that ran indefinitely after module initialisation, regardless of whether the screen was active.
- **Fix**: All three replaced with `debounce(fn, 3000)` from `effects.js`. Debounced functions are cancelled in new `onLeave()` callbacks called by `shared.js` during screen navigation.
- **Page Visibility gate**: Sync skips when `document.hidden` (tab backgrounded) — reduces background network load on Discord mobile.
- `merge.js`: `_idleHintTimer` and `_cooldownTimer` cleared in `onLeave()`. `onLeave` added to public API and wired into `shared.js` `triggerScreenCallbacks()`.

#### 5. Welcome-Back Modal — Native `<dialog>`

- `showWelcomeBack()` in `farm.js` was creating a raw `div.overlay` appended to `<body>`.
- This bypassed `goToScreen()`'s `querySelectorAll("dialog[open]")` cleanup, meaning the overlay could persist invisibly after navigation.
- **Fix**: Migrated to native `<dialog>` via `safeShowModal()` — consistent with the project-wide overlay convention (v4.14+). Gains: native focus-trap, Escape-to-close, backdrop click-to-close, and correct `goToScreen` cleanup.

#### 6. SoundEngine — Web Audio + Vibration API

- **Zero assets**: All sounds synthesised programmatically using `OscillatorNode` + exponential gain ramp. No files, no network requests, no permissions required.
- **`navigator.vibrate()`**: Short haptic patterns on Android (Discord mobile). Silently ignored on desktop/iOS.
- **Triggers wired**:
  - `match3.js`: invalid swap → `SoundEngine.error()`, match cascade → `.match()` / `.combo(n)`, game over → `.gameOver()`
  - `farm.js`: harvest → `SoundEngine.harvest()`
  - `merge.js`: successful merge → `SoundEngine.merge()`
- Volume: default 40%, stored in `localStorage('hub_sfx_vol')`, range 0–1.

#### Version Bumps

- `package.json`: 6.2.0 → 6.2.1
- `match3.js`, `blox.js`, `farm.js`, `merge.js` headers: `v6.2.0` → `v6.2.1`

#### Tests

- **318/318 pass**, 0 failures. (+1 test picked up by runner from new module structure.)

---

## v6.2.0 — 2026-02-22

### UX/UI Overhaul — 7-Task Code Audit

Seven user-requested UX improvements across Pet, Quest Log, Match-3, Blox, and Farm screens.

#### 1. Pet Panel Cleanup (`pet.js`)

- **Removed Quests tab**: Quests are now exclusively accessed via the HUD dropdown — eliminates redundancy.
- **Removed Stats tab button**: Stats display directly without tab switching. Cleaner UI with fewer clicks.

#### 2. Quest Log → Non-Blocking Dropdown (`index.html`, `hud.js`, `hud.css`)

- **Dropdown menu**: Converted from modal `<dialog>` to absolute-positioned dropdown anchored below the HUD button.
- **Progress bars**: Each quest requirement now shows a visual fill bar (`have / need`) with green glow when complete.
- **`_getPlayerQty()` helper**: Calculates current inventory for real-time progress display.
- **Click-outside-to-close**: Auto-dismisses when clicking outside the dropdown panel.

#### 3. Overlay Dismiss Buttons (`index.html`, `blox.js`, `match3.js`, `base.css`)

- **"👁️ Just Looking" button**: Added to both Blox and Match-3 pause overlays. Closes the overlay without affecting game state — players can browse screens freely.
- **`.btn-dismiss` CSS**: Dashed border, low-opacity style that brightens on hover.

#### 4. Cascade Animation Speed (`match3.js`)

- **+15% base timing**: `BASE_HIGHLIGHT_DUR` 200→230ms, `BASE_POP_DUR` 220→250ms, `BASE_FALL_WAIT` 200→230ms.
- **Flatter decay curve**: `SPEED_DECAY` 0.85→0.92 — higher combos remain readable.
- **Speed floor**: Added `SPEED_FLOOR = 0.65` — cascades never run faster than 65% of base speed.

#### 5. Farm Shop Improvements (`farm.js`, `farm.css`)

- **Empty plot → shop redirect**: Clicking an empty plot without a seed selected scrolls to the shop section with a toast hint.
- **Growth time labels**: New `_formatGrowthTime(ms)` helper formats growth times as `2m 15s` / `1h 30m`. Shown as `⏰ [time]` on seed cards.
- **Sort by price**: Seeds in the shop grid are sorted by `seedPrice` ascending.
- **`.seed-grow-time` CSS**: Subtle gold label for growth time display.

#### 6. Nav Tab Shimmer + Notification Dots (`base.css`, `farm.js`)

- **Shimmer effect**: Active nav tab has a subtle diagonal light sweep animation (`navShimmer` keyframes, 4s cycle).
- **Farm notification dot**: Green pulsing `nav-notify-dot` appears on the Farm tab when any crop is fully grown. Auto-managed by `_updateFarmNavDot()` in the render cycle.
- **Dot CSS**: `.dot-green` (harvest) and `.dot-red` (alert) variants with box-shadow glow.

#### Version Bumps

- `package.json`: 6.1.1 → 6.2.0
- All CSS/JS file headers: `v6.1.1` → `v6.2.0`

#### Tests

- **317/317 pass**, 0 failures.

---

## v6.1.1 — 2026-02-22

### Bug Fixes — Firestore + UI Input Freeze

#### Firestore: Merge Board Nested Entity (`playerManager.js`, `mergeRoutes.js`)

- **`sanitizeForFirestore()`**: Now auto-detects `Array<Array>` and JSON-stringifies — Firestore fundamentally rejects nested arrays. Fixes `INVALID_ARGUMENT: Property merge contains an invalid nested entity` crash.
- **`hydrateMergeBoard()`**: New helper in `mergeRoutes.js` — parses JSON-stringified board back to 2D array on read. Handles Firestore object→array conversion. Called in all 6 merge endpoints.

#### UI Input Freeze v1 — Pointer Event Traps (`merge.js`, `shared.js`, `hud.js`)

- **Removed `setPointerCapture`** on merge drag — document-level listeners already handle `pointermove`/`pointerup` globally. Pointer capture leak was the primary freeze cause.
- **`_forceCleanupDrag()`**: Cleans orphan ghost divs + stale `_dragState` at start of every new drag. 5-second safety timeout force-cleans stuck drags.
- **`api()` AbortController**: 8-second hard timeout on fetch — prevents perceived freeze on slow server responses.
- **`goToScreen()` dialog cleanup**: Closes all `dialog[open]` elements before screen transition.
- **Backdrop click-to-close**: Added to crop picker, quest log, and energy modal dialogs.

#### UI Input Freeze v2 — View Transitions + Dialog Stacking (`shared.js`, `hud.js`, `main.js`)

- **View Transition safety wrapper**: `try/catch` + 500ms `skipTransition()` timeout. Prevents `::view-transition` pseudo-layer from permanently blocking pointer events in Discord Electron.
- **`safeShowModal(el)`**: New centralized modal opener — closes all open dialogs before showing a new one, adds backdrop click-to-close. Used by energy modal, quest log, econ-guide.
- **`_feedFromModal` try/finally**: Guaranteed button re-enable after network error — buttons no longer stay permanently disabled.

#### Version Bumps

- `package.json`: 6.1.0 → 6.1.1
- All JS/CSS file headers: `v6.1.0` → `v6.1.1`

---

## v6.1.0 — 2026-02-22

### UX/UI Audit — 5 Feature Implementation

Five user-requested UX improvements across Farm, Merge, Pet, and global emoji rendering.

#### 1. Quest Log HUD (`hud.js`, `hud.css`, `index.html`)

- **📋 HUD button**: New circular `quest-log-btn` in `top-hud` between Gold display and `?` guide button.
- **Smart badge**: Green bouncing badge appears when any quest can be fulfilled (checks `resources.harvested` + `merge.board` against order requirements).
- **Quest Log dialog**: Native `<dialog>` modal renders all active pet orders with emoji-rich requirement display (`_formatReq`) and reward summary (`_formatReward`).
- **Submit/Generate**: Submit button validates requirements client-side, calls `POST /api/quests/submit` with optimistic UI + rollback. Generate button calls `POST /api/quests/generate` when < 3 active orders.
- **Auto-generate**: On first open with 0 orders, automatically generates quests via sessionStorage gate.
- **Import**: `MERGE_CHAINS` added to `hud.js` imports for merge item display names in quest requirements.

#### 2. Merge Magnetic Flow (`merge.js`, `merge.css`)

- **Drag match highlight**: On `pointerdown`, all board cells containing items matching the dragged item's ID receive `.merge-cell--match-highlight` (golden glow `box-shadow`). Cleared on `pointerup`.
- **Idle hints (7s)**: After 7 seconds of inactivity, `_showIdleHint()` finds the first mergeable pair (same ID, not max level) and adds `.merge-cell--hint` wiggle animation. Timer resets on any board render.
- **CSS**: `merge-cell--match-highlight` (golden glow), `merge-cell--hint` (wiggle `rotate ±3deg`).

#### 3. Merge Fuel Slot (`merge.js`, `merge.css`)

- **`_selectedFuel{}`**: Per-chain crop memory. Saved on crop picker selection.
- **1-click generator tap**: `_tapWithFuel(chainId)` checks if remembered fuel has stock > 0 → instant `tapGenerator()`. Falls back to crop picker only when fuel exhausted or never selected.
- **Fuel badge**: When a generator has remembered fuel with stock > 0, a `.merge-fuel-badge` button shows `🥕 ×12` next to the generator button. Click changes fuel.

#### 4. Farm Uproot 💣 (`farm.js`, `farm.css`, `routes/farm.js`)

- **💣 button**: Rendered on every un-matured plot, positioned `top:6px; left:6px` — mirrors 💧 water button on `right:6px`.
- **Hold-to-confirm (2.5s)**: `pointerdown` starts timeout; adds `.farm-uproot-holding` (expanding red pulse animation). Release/cancel clears timer. Fires `uproot(plotId)` on completion.
- **`uproot()` function**: Optimistic clear (no refund), calls `POST /api/farm/uproot`.
- **Server endpoint**: `POST /api/farm/uproot` — validates plot exists, crop not ready (harvest instead), clears plot. Hard write-off: seed is lost.
- **Guard**: Mature crops show "🌾 Already ready — harvest it!" toast instead of uprooting.

#### 5. Emoji Font Stack (`base.css`)

- **Robust `font-family`**: `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`.
- **Cross-platform**: Noto Color Emoji (Chrome/Edge COLRv1), Apple Color Emoji (Safari/iOS), Segoe UI Emoji (Windows).
- **Emoji inventory**: ~80 unique codepoints identified across the project for future Noto subset optimization.

#### Version Bumps

- `package.json`: 6.0.1 → 6.1.0
- All 19 CSS/JS file headers: `v6.0.0` → `v6.1.0`

#### Tests

- **164/164 pass** (14 syntax + 59 unit + 91 API/UX), 0 failures.

---

## v6.0.1 — 2026-02-22

### MIME Type Fix — `game-logic.js` Module Loading

Fixed `Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"` error. Root cause: `game-logic.js` lives in the project root (not `public/`), and client-side imports used `../../game-logic.js` to escape the static dir. Express's SPA catch-all returned `index.html` instead of the JS file.

#### Server (`server.js`)

- **Explicit `/game-logic.js` route** — serves the root-level file with `Content-Type: application/javascript`.
- **Import Map integration** — added `game-logic.js` to content-hash cache-busting system.
- **Strict 404 middleware** — requests for `.js`, `.css`, `.json`, `.png` etc. that don't match any static file or explicit route now return `404 Asset not found` instead of falling through to the SPA catch-all. Prevents future HTML masking of missing assets.

#### Client imports

- Fixed `pet.js`, `hud.js`, `farm.js`, `merge.js` — changed `../../game-logic.js` → `/game-logic.js` (absolute path resolved by Import Map).

#### Test fixes (3 pre-existing failures)

- **Watering multiplier expectations** (`game-logic-stress.test.js`): Updated stale comments and expected values to match v6.0 crop timers (corn is 1hr→0.55, golden is 30min→0.6).
- **Sell-price monotonicity** (`game-logic-stress.test.js`): Rewritten to compare within same `CROP_TIERS` tier only. Golden Rose is an intentional prestige outlier (exempt via `PRESTIGE_CROPS` set).
- **Fully-grown render skip** (`ux.test.js`): Fixed elapsed times from hardcoded 30s/60s to `CROPS.*.growthTime` (strawberry 5min, tomato 15min).

#### Version alignment

- All CSS headers bumped to `v6.0.0` (was `v5.0.0`/`v5.2.0`): `base.css`, `farm.css`, `trivia.css`, `pet.css`, `hud.css`.
- All JS headers bumped to `v6.0.0` (was `v5.0.0`): `shared.js`, `store.js`, `hud.js`, `farm.js`, `crops.js`, `main.js`, `match3/engine.js`, `blox/pieces.js`, `trivia.js`.
- README: Crop growth times updated (15s-120s → 5min-8hr), test count 273→285.

#### Economy Reset Migration (Schema v4→v5)

Old crop timers (15s-120s) allowed 20-240× faster gold/XP farming than the v6.0 rebalance (5min-8hr). Existing players receive a one-time reset on first login:

- **Gold** → 100🪙 (`GOLD_START`)
- **Farm XP/Level** → 0/1
- **Active crop plots** → cleared (old timers invalid)
- **Match-3 sessions** → cleared (prevent gold-accounting bugs)
- **`_lastSeen`** → now (prevent stale offline simulation)
- **Compensation** → +5 gacha tokens 🎰
- **Preserved:** pet level/abilities, pet affection, purchased farm plots, merge board, M3/Blox high scores, trivia stats.

#### Gacha Merge + Pet Orders — Audit Fixes (10)

> Deep audit of merge board, quest system, and cross-module patterns.

- **🔴 Quest reward display** — fixed `o.reward.maxEnergy` → `o.reward.energyMaxBoost`; now shows all 4 currencies (gold, affection, tokens, energy) via `_formatReward()` helper.
- **🔴 Quest requirement names** — raw IDs (`strawberry`, `textile_0`) replaced with emoji + display names via `CROPS` + `MERGE_CHAINS` imports and `_formatReq()` helper.
- **🟡 Generate orders button** — quest tab was non-functional (no way to call `/api/quests/generate`). Added auto-generate on first view + "🔄 Get Orders" button when < 3 active.
- **🟡 Gacha currency label** — button showed `🪙` (gold) but costs gacha tokens. Changed to `(10 Tokens)`.
- **🟡 Crop picker `<dialog>`** — migrated from manual `div` overlay to native `<dialog>` + `.showModal()`/`.close()`. Free focus trapping + Escape key.
- **🟡 Empty-board onboarding** — new players see "🌱 Tap a generator…" hint on empty 7×9 board. Auto-removed on first item spawn.
- **🟢 Version headers** — `merge.js` and `merge.css` bumped from `v7.0` → `v6.0.0`.
- **🟢 `__harvested` rename** — 17 refs across `merge.js`, `pet.js`, `hud.js`, `farm.js` renamed to `harvested` (drop leaky double-underscore convention).
- **🟢 Trash rollback fix** — `trashMergeItem()` now uses proper `oldBoard` snapshot (was mutating the already-set `newBoard`).
- **🟢 Double render** — removed redundant `_renderBoard()` + `_renderGeneratorPanel()` from inside `onEnter()` try block.

#### Tests

- **285/285 pass**, 0 failures.

---

## v6.0.0 — 2026-02-22

### Gacha Merge Mini-Game + Pet Order System

Major feature release: a 5th game screen with a server-authoritative merge board and a quest system linking Farm + Merge into a unified economy loop.

#### New Files

- **`routes/mergeRoutes.js`** [NEW] — 6 server endpoints: `/api/merge/state`, `/tap`, `/merge`, `/gacha`, `/free-pull`, `/trash`. All economic transactions validated server-side.
- **`routes/questRoutes.js`** [NEW] — 3 server endpoints: `/api/quests/active`, `/generate`, `/submit`. Tiered order generation (easy/medium/hard) with weighted difficulty based on pet affection level.

#### Core Logic (`game-logic.js`)

- **`MERGE_CHAINS`** — 2 chains × 8 levels: Textile (Thread → Legendary Tapestry 🧵→👑) and Wood (Twig → Legendary Throne 🌿→👑).
- **`CROP_TIERS` + `TIER_YIELD`** — Generator fuel system: cheap crops yield 2-3 items, mid crops 3-4, expensive crops 4-5.
- **`QUEST_TIERS`** — Tiered multi-currency rewards: Easy (gold+affectionXp), Medium (+gachaTokens), Hard (+energy max boost).
- **7 new ECONOMY constants**: `GACHA_PULL_COST` (10), `GENERATOR_TAP_LIMIT` (40), `GENERATOR_COOLDOWN_MS` (4hr), `DAILY_FREE_PULL`, `TOKEN_FARM_DROP_CHANCE` (2%), `TOKEN_BONUS_THRESHOLDS` (score-based).
- **Schema v4**: `createDefaultPlayer()` includes `merge` state (7×9 board, generators, inventory, generatorState, lastFreePull) and pet `affectionXp`/`affectionLevel`.

#### Merge Engine (`public/js/merge.js`) [REWRITE]

- Server-validated actions with optimistic UI + automatic rollback on failure.
- Ghost-Pattern drag-and-drop: separate `<div>` clone appended to `<body>`, `pointermove` via rAF, spring-return cubic-bezier animation for failed merges.
- Generator panel: tap buttons with cooldown display, gacha roll (10 tokens), daily free pull (UTC), trash mode toggle, crop picker modal with tier-colored borders.
- 8-level progressive glow borders via `data-level` CSS attribute, legendary pulse animation.

#### Merge Styles (`public/css/merge.css`) [REWRITE]

- Glassmorphism board grid (7×9, `contain: layout style paint`).
- 8-level progressive glow (L0 gray → L7 gold pulse).
- Crop picker modal overlay with tier-colored left borders.
- Generator panel with cooldown/gacha/free/trash state styles.
- Responsive breakpoints for mobile.

#### Pet Orders (`public/js/pet.js`)

- `affectionXp` / `affectionLevel` added to pet slice.
- `submitOrder()` refactored from client-only deduction to async `POST /api/quests/submit` with optimistic UI + full rollback on server rejection.
- Reward summary toast: gold🪙, affectionXp💕, gachaTokens🎰, energyMaxBoost⚡max.
- Affection level-up notification.

#### Token Economy Integration

- **Match-3** (`routes/match3.js`): 1 base + up to 3 bonus tokens on game-end (score thresholds: 1000/2000/3500).
- **Blox** (`routes/blox.js`): Same formula.
- **Farm** (`routes/farm.js`): 2% RNG token drop on harvest.
- **Schema migration** (`playerManager.js`): v3→v4 migration adds merge state + pet affection fields for existing players.

#### Server (`server.js`)

- Mount `mergeRoutes` and `questRoutes`.
- Added `merge.js` to import-map `jsModules` array for cache busting.

#### Bug Fix

- **`tokenReward` scoping bug** (`routes/match3.js`): Variable was declared with `let` inside an `if` block but referenced in the response JSON outside that scope — always returned 0. Fixed by hoisting declaration to handler level.

#### Tests

- Updated `unit.test.js`: `schemaVersion` assertion 3→4, added merge board (7×9) + generators + affection field assertions. **59/59 pass.**
- **105/105 total tests pass** (unit 59, API 26, GCP 20).

#### Version Bumps

- `package.json`: 5.2.0 → 6.0.0
- `merge.js` header: v7.0
- `merge.css` header: v7.0

---

## v5.2.0 — 2026-02-21

### Visual Polish — Immersive Enhancements

Six performance-safe visual features across Match-3 and Blox. All compositor-only (`transform`, `opacity`, `box-shadow`) — zero layout thrashing.

#### Match-3

- **Squash & Stretch** — Gems deform during falls (stretch on drop `scaleY(1.14)`, squash on landing `scaleX(1.14)`), settling via spring bounce to natural scale.
- **Perlin Noise Screen Shake** — Replaced repeating CSS keyframe shakes with JS-driven simplex noise for organic, non-repeating vibration with linear decay. Used on invalid swaps (3px, 400ms) and big combos (6px, 500ms).
- **Color Splash** — Board container background briefly flares with the dominant gem color (`--gem-color`) on matches ≥3, using CSS `box-shadow: inset` with 600ms fade-out.
- **Ambient Dust Particles** — Subtle floating particles via CSS `::before` pseudo-element on `.m3-board-container`, using layered `radial-gradient` sprites animated with `ambientDrift` (18s loop).
- **Danger Vignette** — Red pulsing vignette on screen edges when Time Attack timer reaches ≤15s. Uses `::after` pseudo-element with `radial-gradient` and `dangerPulse` opacity animation (1.2s).

#### Building Blox

- **Perlin Noise Screen Shake** — Same organic shake for invalid placements (3px, 350ms) and multi-line clears (5px, 450ms).
- **Drag-Tilt** — Dragged pieces tilt toward the movement direction via `rotateZ`, using velocity delta with LERP smoothing (factor 0.15, clamped ±8°).
- **Ambient Dust Particles** — Same particle layer on `.blox-layout` with cyan/purple/orange palette (20s loop).

#### Infrastructure

- Version bump: `5.1.0` → `5.2.0` in `package.json`, `match3.css`, `blox.css`, `match3.js`, `blox.js`, `base.css`
- New UX tests: squash & stretch, color splash, danger vignette, ambient dust, drag-tilt

---

## v5.1.0 — 2026-02-21

### Fluid Hub — Visual Enhancements

Four performance-safe visual improvements across Match-3 and Blox, all using compositor-only CSS properties (`transform`, `opacity`) and lightweight JS patterns.

#### 1. Contextual Neon Glow (`match3.css`)

- Each gem type now defines `--gem-color` CSS custom property
- `m3MatchGlow` keyframes use `var(--gem-color)` so match highlights glow in the gem's own color (fire=red, water=blue, etc.)
- Pop flash uses `mix-blend-mode: screen` for additive blending

#### 2. Springy LERP UI (`match3.css`, `match3.js`, `blox.css`, `blox.js`)

- Mode cards in Match-3 use staggered entrance with spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`) and `transition-delay: calc(var(--i) * 0.06s)`
- Blox pause buttons cascade in with `animation-delay: calc(var(--i) * 0.07s)`
- Blox ghost cells have smooth `transition: opacity 0.08s ease-out` for LERP-style grid snapping

#### 3. Pseudo-3D Parallax (`match3.css`, `match3.js`, `blox.css`, `blox.js`)

- Both game boards respond to mouse cursor with micro-tilt (`rotateX`/`rotateY`, ±2.5°)
- `perspective: 800px` on parent containers creates depth
- rAF-gated mousemove listener — zero layout thrashing
- Smoothed via `transition: transform 0.15s ease-out` on the board element

#### 4. Hit-Stop & Kinematic Gravity (`match3.js`)

- Big matches (≥5 gems) trigger a 40ms hit-stop freeze before the pop phase
- Fall duration formula changed from linear (`0.25 + (dist-1) * 0.04`) to sqrt-based (`0.18 + √dist * 0.12`) — short falls are snappier, long falls feel heavier

#### Tests (`ux.test.js`)

- Updated gravity timing invariants for new sqrt formula (5 tests)
- Added contextual gem glow CSS validation (2 tests)
- Added board tilt rotation bounds verification (4 tests)
- Fixed `.m3-board` containment test regex to avoid matching `.m3-board-container > .m3-board`
- **280 tests pass** (was 273)

#### Version Bumps

- `package.json`: 5.0.1 → 5.1.0
- `match3.css`, `match3.js`: v5.0.2 → v5.1.0
- `blox.css`, `blox.js`: v5.0.0 → v5.1.0

## v5.0.2 — 2026-02-21

### Match-3 — Cascade Animation Redesign

Cascade animation was unreadable — impossible to track which gems matched and how pieces moved. Additionally, a visual/logical desync meant selected gems couldn't be swapped despite appearing valid.

**Root cause**: Sparse diff optimization (v5.0.1) updated only 3–10 cells per cascade step, leaving stale CSS classes (`popping`, inline transforms) on untouched cells. The `board[][]` data reflected the correct final state, but DOM cells showed outdated types and positions.

#### Animation Fix (`match3.js`, `match3.css`)

- **Swap snapback eliminated**: Board data + cell content are now updated _before_ clearing CSS `translate()` transforms. Previously, transforms were cleared first → gems snapped back to original positions showing the old type, then cascade updated them — causing a misleading visual snapback.
- **Phased cascade**: Rewrote `animateCascade()` from 2-phase (pop → fall) to 4-phase pipeline:
  1. **Matched highlight** (200ms) — `.matched-highlight` golden glow on all matched gems so player sees _what_ matched
  2. **Pop** (220ms) — `.popping` scale→0 with white flash
  3. **Explicit cleanup + full sync** — removes `.popping`, then syncs all 64 cells to `board[][]` (type, icon, className)
  4. **Fall with column-stagger** — `.falling` with `x * 30ms` delay per column → organic wave effect
- **~40% faster cascade**: Total per-step time reduced from ~1010ms (350+360+300) to ~620ms (200+220+200). Each successive step accelerates ×0.85.
- **Post-cascade full sync**: `renderBoard(false)` called after `animateCascade()` completes — guarantees zero desync survivors.
- **CSS durations synced**: `.popping` 0.36→0.22s, `.matched-highlight` 0.35→0.2s — CSS animations now fit within their JS phase windows.
- **Swap jerk eliminated**: Added `.m3-board.batch-update` CSS rule + forced layout flush during swap transform cleanup. The base `.m3-cell` transition no longer re-animates the secondary piece back to its grid position.

#### State Desync Fix (`match3.js`, `engine.js`)

- **Board Snapshots**: `resolveBoard()` now attaches a frozen `boardSnapshot` (via `cloneBoard()`) to each cascade step. The cascade animation syncs DOM against these intermediate snapshots instead of the globally-mutated `board[][]`, preventing false highlights on gems that haven't moved yet.
- **Dataset-type self-healing guard**: `onCellClick()` now checks `cell.dataset.type !== board[y][x]` before processing. On mismatch, triggers `renderBoard(false)` to heal the desync automatically.
- **Full board sync in cascade**: After each cascade step's pop phase, all 64 cells are synchronized — eliminates the class of bugs where sparse diff left cells visually stale.

### CSS

- **New `.matched-highlight`**: Golden pulse glow (`m3MatchGlow` keyframes) — `box-shadow` ring + `scale(1.15)` — highlights matched gems before pop.
- **New `.m3-board.batch-update`**: Transition suppression during programmatic DOM updates.

### Time Attack Bug Fixes (`match3.js`, `routes/match3.js`)

- **Score carryover fix**: Force-set `$("m3-score").textContent = "0"` on fresh start to prevent `animateNumber` from visually interpolating from the old session's score.
- **403 "Invalid session" fix**: Resume path now fires `/api/game/start` with `isResume: true` (fire-and-forget). Server registers a session stub without charging energy, so `/api/game/end` no longer 403s.
- **Timer label fix**: `m3-moves-label` now dynamically shows "Time" for timed mode instead of blank or "Moves".

### Blox — Clearing Animation Cutoff Fix

- **Dynamic timeout**: `renderBoard()` timeout now calculated from `(staggerIdx - 1) * staggerDelay + SHATTER_DUR + 20ms` instead of hardcoded 300ms. Fixes animation being cut short on multi-line clears.
- **Adaptive stagger**: Step reduced from 20ms→10ms for multi-line clears (>1 line), keeping total animation snappy while preserving the wave dissolve effect.

## v5.0.1 — 2026-02-21

### Performance — Visual Smoothness (Match-3 + Blox)

5 performance bottlenecks identified with 9 solutions each; best aspects synthesized into unified fixes across 4 files.

#### Match-3

- **`will-change` cleanup**: Removed permanent `will-change: transform` from all 64 `.m3-cell` elements (64 GPU layers → auto-promote only during animation). Kept `will-change` on `.popping`, `.falling`, `.entering`, `.reshuffling` classes.
- **Filter-free hover**: Replaced `filter: brightness(1.12)` / `brightness(0.92)` on `:hover` / `:active` with `border-color: rgba(255,255,255,0.25)`. Removed `filter 0.18s ease` from base transition. Eliminates full-cell repaints during rapid mouse movement across the 8×8 grid.
- **`text-shadow` on `.gem-icon`**: Replaced `filter: drop-shadow(0 2px 4px)` with `text-shadow: 0 2px 4px` — cheaper for emoji/text rendering (no filter repaint per cell).
- **Sparse cascade diff**: `animateCascade()` now iterates only affected cells from `step.cleared`, `step.fallen`, `step.filled` (typically 3–10 per step) instead of all 64 cells. Tracks `_prevCascadeChanged` for stale CSS property cleanup between steps.
- **Reduced backdrop blur**: `.m3-board` `backdrop-filter` reduced from `blur(12px)` to `blur(4px)`, background opacity increased to `rgba(30, 32, 50, 0.92)`. ~70% blur computation savings.

#### Blox

- **Clearing `will-change` removed**: `.blox-cell.clearing` no longer sets `will-change: transform, opacity` — browser auto-promotes during `bloxShatter` animation.
- **Staggered clearing**: Each clearing cell gets `animationDelay = idx × 20ms`, so only 2–3 cells are GPU-promoted simultaneously (previously all 10–20 at once).
- **Faster clearing**: Animation shortened from `0.28s + 0.1s delay` to `0.24s` (no delay). `renderBoard()` timeout reduced 380ms → 300ms. `checkDelay` reduced 430ms → 350ms.
- **Reduced backdrop blur**: `.blox-board` receives same treatment: `blur(12px)` → `blur(4px)`, `rgba(30, 32, 50, 0.92)`.

### Star Drop — Color Redesign

All 3 drop gem colors radically changed to occupy unique hue gaps with zero overlap against any of the 6 regular gem types:

| Drop Gem     | Old Color                                | New Color                          | Hue Gap                              |
| ------------ | ---------------------------------------- | ---------------------------------- | ------------------------------------ |
| 💰 Gold Bag  | Rose-gold H:35° (near `light` amber)     | **Hot pink / magenta** H:330°      | Between `dark` 280° and `fire` 0°    |
| 🌾 Seed Pack | Emerald H:160° (near `earth` green)      | **Chartreuse / lime-yellow** H:80° | Between `light` 50° and `earth` 120° |
| ⚡ Energy    | Violet H:280° (overlapped `dark` purple) | **Indigo / deep blue** H:240°      | Between `water` 220° and `dark` 265° |

### Bug Fixes

#### Firestore — Nested Array Rejection (Critical)

- **Root cause**: Firestore does not support nested arrays (arrays inside arrays). Both `blox.savedState.board` (10×10 2D) and `match3.savedModes[mode].board` (8×8 2D) violated this constraint, causing `INVALID_ARGUMENT: Property blox/match3 contains an invalid nested entity` on every save.
- **Fix — JSON-stringify on write**: `routes/blox.js` `/api/blox/sync` now `JSON.stringify(savedState)` before storing; `/api/blox/state` parses back. `routes/match3.js` `/api/game/sync-modes` does the same for `savedModes`. Both have legacy fallback for pre-stringify data.
- **Fix — Recursive sanitizer**: Added `sanitizeForFirestore()` in `playerManager.js` — recursively strips `undefined` → `null` and ensures dense arrays before every Firestore `.set()` call (both `debouncedSavePlayer` and `gracefulShutdown`).

#### Blox — Ghost Breathing Animation Restart

- **Root cause**: `mousemove` handler called `clearGhost()` + `showGhostAt()` on every pixel of movement. Removing and re-adding the `ghost` CSS class restarted the 1.2s `ghostBreathe` animation from frame 0, causing janky flickering and unnecessary GPU work.
- **Fix**: Added `_lastGhostKey` position cache (`selectedPiece,row,col`). Ghost is only cleared and re-shown when the cursor enters a **different grid cell**. Within the same cell, the breathing animation runs uninterrupted.

#### Match-3 — Gem Visual Displacement After Swap

- **Root cause**: `attemptSwap()` sets `transform: translate()` on both cells for the swap slide animation. After `await sleep(200)`, the sparse cascade diff only clears transforms on cells in `step.cleared/fallen/filled`. If the non-matching swapped cell wasn't in those sets, its residual `translate()` persisted, visually displacing the gem to another cell's position.
- **Fix**: Added explicit `transform/transition/zIndex` cleanup on both swapped cells immediately after the 200ms slide animation completes, before cascade begins.

### Tests

- Updated "Star Drop — Color Uniqueness" tests: all 3 drop gems now pass strict non-overlap checks against all regular gems (old `drop_energy`/`dark` exception removed).
- 273 tests passing (178 in targeted suites).

### Version Headers

- All CSS file headers aligned to `v5.0.0` (6 files updated from stale `v4.9`–`v4.16.0`).
- `ux.test.js` section header updated from `v4.5.3` → `v5.0.0`.

## v5.0.0 — 2026-02-21

### ES Module Migration

All 8 frontend JS modules converted from IIFE pattern to native ES Modules. Single `<script type="module">` entry point replaces 9 script tags.

#### Architecture

- **`main.js`** — new entry point; DOMContentLoaded orchestrator importing all modules
- **Module registry** (`setModules()` in `shared.js`) — avoids circular imports between core utils and game modules
- **`setWaterFn()`** setter in `pet.js` — resolves pet→farm circular dependency
- **Import map** — server generates `<script type="importmap">` from content hashes; automatic cache busting, zero manual `?v=` bumps

#### Modules Converted

- `store.js`, `shared.js`, `hud.js`, `pet.js`, `farm.js`, `trivia.js`, `match3.js`, `blox.js`
- All `typeof` runtime guards removed (ESM guarantees import resolution)

#### Module Decomposition (Phase 4)

- **`match3/engine.js`** — pure game logic extracted (generateBoard, findMatches, resolveBoard, hasValidMoves, calcGoldReward, hydration helpers)
- **`blox/pieces.js`** — static piece definitions (GRID, PIECE_COUNT, 12 shapes)

#### Infrastructure

- `index.html` — 9 `<script>` tags → `<script type="module" src="js/main.js">`
- `server.js` — `getIndexHtml()` injects `<script type="importmap">` with MD5 content hashes for all JS modules + sub-modules
- `discord-sdk.js` remains IIFE (classic `<script>` — must load before ES modules)

#### Post-Migration Audit Cleanup

- **`crops.js`** — new module centralizing crop data fetch/cache; eliminates `window.__cropsPromise` and `window.__cropsCache` globals
- Removed deprecated `navBarAutoHide()` (empty body, v5 persistent nav)
- Fixed `applyScreenPosition()` → `applyScreenClasses()` (renamed function reference)
- Removed redundant `"use strict"` from ESM IIFE closures (`blox.js`, `pet.js`)
- Updated stale match3.js header to `@see ./match3/engine.js`
- **Button binding SRP** — moved 16 game-specific button bindings from `shared.js` `bindNavigation()` into `trivia.js` (12), `match3.js` (3), `blox.js` (1); `bindNavigation()` now handles only navigation (arrows, dots, tabs)

#### Full-Stack Audit Fixes

- **🔴 Data loss fix** — `routes/resources.js` called deprecated no-op `debouncedSaveDb()`; replaced with `debouncedSavePlayer(userId)` for sell-crop and pet-feed persistence
- **Sell-price fix** — sell-crop was using a hardcoded formula (strawberry=10🪙) instead of `CROPS.sellPrice` (strawberry=15🪙); now uses canonical data
- **DRY constants** — `BLOX_PIECES` (110 lines) and `GEM_TYPES`/`BOARD_SIZE` removed from `game-logic.js`, re-exported from client sub-modules (`blox/pieces.js`, `match3/engine.js`)
- **Cache performance** — `Cache-Control: no-store` on all JS/CSS replaced with caching-friendly policy; import-map hashes handle invalidation
- **Scalability guard** — `loadDb()` Firestore read now uses `.limit(1000)` to prevent unbounded memory growth

## v4.16.0 — 2026-02-21

### DOM-Cached Rendering (Third Performance Audit)

#### Building Blox (`blox.js`)

- **Cached board cells** (`_boardCells[][]`): `renderBoard()` creates 100 `div` elements once and caches them in a 2D array. All subsequent renders diff-update only `className` and `style.background` — zero `innerHTML`, zero `createElement`, zero GC pressure.
- **O(1) cell access**: `clearLines()` and `showGhostAt()` use `_boardCells[r][c]` direct array lookup instead of `querySelector('[data-r=...][data-c=...]')`.
- **Ghost tracking array** (`_ghostCells[]`): `showGhostAt()` pushes cells to tracking array; `clearGhost()` iterates only ghosted cells instead of `querySelectorAll('.ghost')` over all 100 nodes.

#### Gem Crush (`match3.js`)

- **Cached board cells** (`_m3Cells[][]`): `renderBoard()` creates 64 cells once. Subsequent renders and `animateCascade()` steps diff-update existing DOM nodes — eliminating 64× `createElement` + 64× `addEventListener` per cascade step.
- **Event delegation**: Single `click` listener on `.m3-board` replaces 64 per-cell closures. Cell coordinates read from `dataset.x`/`dataset.y` on the clicked target.
- **O(1) `getCell()`**: `_m3Cells[y][x]` direct access replaces `querySelector('.m3-cell[data-x=...][data-y=...]')`.

#### Navigation (`shared.js`)

- **Cached nav collections**: `_cachedScreens[]`, `_cachedNavDots[]`, `_cachedNavTabs[]` populated once at `DOMContentLoaded`. `applyScreenClasses()` and `updateNavUI()` iterate cached arrays — zero `querySelectorAll` per screen transition.

## v4.15.3 — 2026-02-20

### Performance Optimizations (Second Audit)

- **Trivia timer DOM cache** (`trivia.js`): Cached `timerFillEl` and `timerTextEl` refs at `startTimer()`. Added `lastDanger` diff guard — eliminates `getElementById` × 2 and redundant `classList.toggle` per rAF frame (~60fps).
- **Farm glow compositor-only** (`farm.css`): Replaced paint-heavy `box-shadow` animation on `.farm-plot.ready` with `::after` pseudo + `opacity` animation. Only the compositor runs now — zero repaint across 6–9 simultaneous plots.
- **HUD aurora animation gate** (`hud.css` + `hud.js`): Gated `auroraShift` animation behind `.aurora-active` class. Animation only runs while energy is regenerating; stops when full — eliminates continuous `background-position` repaint.
- **Toast `will-change` lifecycle** (`base.css`): Moved `will-change: transform, opacity` from `.toast` to `.toast.show`. GPU composite layers now only exist during visible toast animation.
- **Cache-busting params** (`index.html`): Updated all 15 CSS/JS `?v=` params from stale `4.9`/`4.11` to `4.15.3` — ensures browsers serve latest code after deploy.
- **Duel history render cache** (`trivia.js`): Added `_lastHistoryJSON` cache to skip DOM rebuild on unchanged data in `renderDuelHistory()`.

## v4.15.2 — 2026-02-20

### Performance Optimizations

- **Resize throttling** (`shared.js`): Replaced raw `resize` listener with `requestAnimationFrame` guard. Prevents layout thrashing (alternating DOM reads/writes at 60fps) during window resize.
- **Farm growth tick visibility gate** (`farm.js`): `startLocalGrowthTick()` now skips `render()` entirely when the farm screen is not active (`HUB.currentScreen !== 2`). Badge updates throttled to fire only when the harvestable-plot count actually changes.
- **Pet heart particle pool** (`pet.js`): Replaced `createElement`/`remove` churn with ring-buffer object pool of 5 pre-created `<span>` elements (same pattern as Match-3/Blox float points). Eliminates GC pressure on rapid pet clicks.
- **HUD regen timer optimization** (`hud.js`): Cached all DOM refs (`$energyText`, `$goldText`, `$regenFill`, `$energyEl`) at init. Added early return when energy is full (skips all DOM ops). Regen fill width only written when the value actually changes. Page Visibility API gate pauses the 1s timer when tab is hidden.
- **Farm water button delegation** (`farm.js`): Removed per-element `addEventListener` from `rebuildPlot()`. Water button clicks now routed through the grid's single event delegation handler, eliminating closure creation on every DOM rebuild.

## v4.15.1 — 2026-02-20

### Bug Fixes

- **Match-3 session loss between visits**: Sessions vanished on re-entry because `init()` skipped localStorage and relied solely on the server, which used a 2s debounced Firestore write. If the tab closed during the debounce window or Cloud Run cold-started, `savedModes` was lost. Fix: `init()` now pre-loads localStorage, `restoreGame()` merges server + localStorage (server wins per-mode, localStorage fills gaps), and `beforeunload` snapshots the active game into `savedModes` + writes localStorage before the server flush.
- **Blox tab-close data race**: Added `localStorage.setItem()` in Blox `beforeunload` handler as safety net against server debounce race (same pattern as Match-3 fix).

### UX Improvements

#### Building Blox

- **Floating score points**: Object-pooled `+pts` text floats above the board on every line clear. Uses ring-buffer pool of 5 pre-created DOM nodes (ported from Match-3 pattern) with scattered CSS trajectories via `--float-dx`/`--float-rot` custom properties.
- **Radial petrification game-over**: When no pieces fit, filled blocks "freeze" from center outward — each cell's `transition-delay` is calculated as Euclidean distance from board center × 60ms. Cells turn gray (`#475569`), lose pseudo-3D shadows, and gain `grayscale(0.8)` filter before the game-over overlay appears.

#### Match-3 (Gem Crush)

- **Deadlock reshuffle animation**: When no valid moves remain after a cascade, the board reshuffles with a 3D card-flip wave (`rotateY` 0→90→90→0) instead of silently regenerating. Each cell flips at a diagonal-wave delay (`(col + row) × 0.04s`); gem types change mid-flip while invisible. Drop tokens are preserved during reshuffle.

## v4.15.0 — 2026-02-20

### Juicy UI — Visual Overhaul (Match-3 + Building Blox)

#### Match-3 (Gem Crush)

- **Spring-physics fall**: 5-keyframe bounce animation with overshoot → settle, replacing the simple 2-step drop.
- **Organic hover/active**: Back-ease `cubic-bezier(0.175, 0.885, 0.32, 1.275)` on cells with brightness shift and gem-icon micro-rotation.
- **Flash-pop clear**: Matched gems flash to `brightness(2.8)` before shattering, creating a more satisfying destruction effect.
- **Wave entrance**: Board fill uses diagonal wave delay (`col * 0.05s + row * 0.05s`) with spring overshoot and rotation.
- **GPU-optimized drop-gem glow**: Replaced expensive `box-shadow` animation with `::after` pseudo-element using `opacity`/`transform` only (compositor-only properties).
- **Scattered float-points**: Score popups now arc along random trajectories via `--float-dx` and `--float-rot` CSS custom properties.
- **Combo banner vibration**: New `m3ComboPop` keyframe with spring-pop entrance and micro-rotation wobble.
- **Intensity-scaled shake**: `combo >= 3` triggers heavy 2D screen shake with rotation (`shake-heavy` class).

#### Building Blox

- **Pseudo-3D blocks**: Filled cells get inner bevel highlight + shadow (`inset ±2px`) for a tactile, neumorphic look.
- **Breathing ghost**: Placement preview pulses `opacity 0.35→0.7` via `ghostBreathe` animation, inviting the player to release.
- **Flash-then-shatter clear**: Two-phase line clear — 100ms white brightness flash, then 280ms shatter-down with opacity fade.
- **Elevated lift**: Piece pickup immediately scales to `1.05` with `translateY(-4px)` and deep `box-shadow: 0 12px 28px` shadow.
- **GPU-accelerated drag**: `moveDragPreview()` now uses `transform: translate3d()` instead of `left/top` for smooth 60-120fps compositing.
- **Hit-stop freeze**: Multi-line clears (≥2) add 120ms cinematic pause before game-over check, letting the player absorb the impact.
- **Heavy shake**: Multi-line clears trigger `bloxShakeHeavy` with 2D translation + rotation.

### Visual UX Performance & Physics

#### Match-3

- **Dynamic gravity**: Fall animation now uses CSS variable `--drop-dist` (set per gem by JS) to scale `translateY` distance proportionally to actual rows traveled. Duration scales via `--fall-dur`: `0.25s` base + `0.04s` per extra row, capped at `0.55s`. Short falls are snappy; long cascades are dramatic.
- **Object-pooled float points**: Replaced `createElement`/`remove` pattern with a ring-buffer pool of 8 pre-created `.m3-float-points` DOM nodes. Eliminates GC pauses during intense combo cascades.
- **CSS containment**: Added `contain: layout style paint` to `.m3-board`, isolating repaints from surrounding page elements.

#### Building Blox

- **Compositor-safe transitions**: Replaced `transition: all 0.18s` on `.blox-cell` with explicit `transform`, `opacity`, `border-color`, `background` — prevents layout thrashing when hovering over the 100-cell grid.
- **Spring return animation**: Pieces dropped outside the board or in invalid positions now visually spring back to their tray slot via `bloxSpringReturn` keyframes (400ms with overshoot bounce) instead of vanishing instantly.
- **CSS containment**: Added `contain: layout style paint` to `.blox-board`.

### Tests

- 10 new UX invariant tests (194 total): dynamic gravity timing, transition safety, CSS containment, pool capacity, spring return duration.

### Bug Fixes

- **Modal scrollbar flash**: `<dialog>` overlays briefly showed horizontal then vertical scrollbars during `modalPop` scale animation. Root cause: user-agent `overflow: auto` on `<dialog>` combined with `scale(0.9→1)` caused intermediate-size overflow recalculation. Fix: added `overflow: hidden`, `max-width/height` constraints, scrollbar suppression (`scrollbar-width: none` + `::-webkit-scrollbar`) on `.modal`; `contain: layout` and `width: min()` on `.modal-card`.

### Cross-Device State Sync Fixes

- **M3 board hydration**: `restoreGame()` now calls `hydrateBoard()` on all server `savedModes` boards. Firestore converts 2D arrays to objects — without hydration, `board[y][x]` returned `undefined` on cross-device restore.
- **M3 dropStars hydration**: Added `hydrateArray()` utility and applied in `restoreDropState()`. Firestore converted `[{x,y}]` to `{0:{x,y}}`, breaking `for..of` iteration.
- **Blox auto-apply server state**: `init()` now loads and applies server state to in-memory variables immediately, making Resume work correctly with cross-device data.
- **Blox graceful pieceId fallback**: `loadState()` now falls back to the "dot" piece for unknown piece IDs instead of discarding the entire save.
- **Tab-close state flush**: Both games now use `fetch({keepalive: true})` on `beforeunload` to guarantee state delivery when the browser closes during the 2s server-side debounce window. Uses `fetch` instead of `sendBeacon` to preserve Discord auth headers.

## v4.14.3 — 2026-02-20

### Deployment & Data Recovery

- **Express 5.x Routing Crash**: Swapped deprecated wildcard string route `app.get("*")` to RegExp `app.get(/.*/)` in `server.js`.
- **Missing `saveDb` Export**: Removed stale import from `playerManager.js` that crashed the server on start.
- **Discord Auth Missing in Production**: Cloud Run was deployed without `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` env vars, causing all users to fall into demo mode with random IDs. Fixed deploy command to include all Discord credentials.
- **Player Data Restoration**: Migrated 11 players from legacy `hub-db.json` (GCS bucket) into Firestore. Wrote a one-off migration script with recursive sanitization for Firestore constraints (no `undefined`, no nested arrays).

### Frontend Hotfixes (Phase 2 Residuals)

- **`applyScreenPosition` undefined**: Replaced deprecated DOM call in `shared.js` with its View Transitions replacement `applyScreenClasses()`.
- **Building Blox crash on launch**: Converted `blox-pause-overlay` from legacy `<div>` to native `<dialog>` element.
- **Match-3 Game Over overlay stuck**: Converted `m3-overlay` from `<div>` to `<dialog>`, replaced stale `classList.remove("show")` calls with `.close()`.
- **Match-3 Pause overlay invisible**: `m3-pause-overlay` was a `<dialog>` in HTML but JS used `classList.add("show")` — replaced with `.showModal()`/`.close()`.
- **Energy Modal crash**: Fixed `hud.js` assigning `.onclick` to nonexistent `energy-modal-close` element; switched to native `<dialog>` `.showModal()`/`.close()`.
- **Economy Guide `?` button dead**: JS referenced `econ-guide-overlay` but HTML ID is `econ-guide-modal`. Fixed ID and switched to dialog API.
- **Black text in dialogs**: Added `color: inherit` to `.modal` CSS to override browser default black text on `<dialog>` elements.

### Architecture

- **SmartLoader removed**: Replaced dynamic `document.createElement("script")` lazy loading with static `<script>` tags for all 4 game modules. Eliminates caching bugs from Discord's CDN proxy serving stale scripts.
- **Content-hash cache busting**: Server's `getIndexHtml()` replaces `?v=` on all script/CSS tags with per-file MD5 hashes at startup. No more version-string cache misses.

### Firestore Compatibility

- **Match-3 `board.map` crash**: Firestore converts 2D arrays to objects with numeric keys. Added `hydrateBoard()` helper in `match3.js` to convert back.
- **Blox board/tray hydration**: Same Firestore object→array fix applied to `blox.js` for both `board` and `tray` data.

### UX

- **Toasts repositioned**: Moved toast container from centered to bottom-right to avoid blocking the game board during play.

### Tech Stack

- **Express 5.x**: Upgraded from Express 4.18 to Express 5.2.1.
- **Firestore**: Replaced GCS JSON file persistence with Google Cloud Firestore for player data.

## v4.14.0 — 2026-02-20

### UI/UX Refactoring (v5 Phase 2)

- **Native View Transitions**: Replaced brittle CSS `-vw` screen track translations with the `document.startViewTransition()` API for smooth, native-feeling screen routing.
- **Persistent Navigation**: Eliminated the jarring `nav-hidden` auto-hide mechanic. The Bottom Nav Bar is now persistently visible.
- **Dynamic CSS Constraints**: Refactored Building Blox and Match-3 layouts to use CSS `flex: 1` scaling, fitting the game boards within the safe area between the TopHUD and Nav Bar without overlap or scrolling.
- **Standardized `<dialog>` Overlays**: Upgraded all custom inline `.overlay` modals (Game Over, Pause, Economy Guide, Energy Prompt) to use native HTML5 `<dialog>` elements with built-in `::backdrop` dimming, guaranteeing perfect z-index focus trapping.
- **Centralized Toast Queue**: Replaced disjointed `showToast` functions scattered across game modules with a unified global `ToastManager` queue. Toasts now stack neatly above the Nav Bar dynamically, holding a maximum of 3 notifications to prevent screen clutter.

## v4.13.0 — 2026-02-20

### Project & UX Analysis Complete

Conducted a deep architectural and visual analysis across the entire `CC-GH` codebase. Identified core software limitations (e.g., imperative `.innerHTML` manipulation, fragile manual state management, in-memory DB constraints) and UX issues (brittle `translateX` navigation, blocking overlays, jumpy progress bars).

### Synthesized Architectural Roadmap

- **Componentization**: Transitioning to native ES Modules (`type="module"`) with Web Components for encapsulated DOM rendering—preserving the zero-build philosophy while eliminating global scope pollution.
- **State & Network Sync**: Moving from manual REST polling/retries to a robust WebSocket-based protocol for deterministic state updates.
- **Backend Robustness**: Upgrading the in-memory player Map to disk-backed SQLite or Redis for concurrent scalability and crash safety.

### Synthesized UX/UI Roadmap

- **View Transitions API**: Replacing the brittle `-200vw` layout track with native HTML5 View Transitions for seamless, responsive navigation.
- **Native Dialogs & Smart Queues**: Standardizing all overlays to use the native `<dialog>` element for perfect z-index trapping, and implementing a centralized Toast Queue Manager.
- **Persistent UX**: Adapting game boards to fit dynamically between the TopHUD and a persistently visible Nav Bar, avoiding the jarring auto-hide mechanic.

## v4.12.3 — 2026-02-19

### Blox Cross-Device Sync

- **Server-side board persistence**: Added `savedState` to player data with automatic migration.
- **New endpoints**: `POST /api/blox/state` (fetch saved board), `POST /api/blox/sync` (push board to server).
- **Client sync**: `saveState()` fire-and-forgets to server after every piece placement. `init()` fetches server state and merges into localStorage for cross-device resume.
- **Bug fix**: Removed stale `closeLeaderboard` reference in Match-3 `init()` that crashed on load.

## v4.12.2 — 2026-02-19

### Match-3 Inline Leaderboard

- **Always-visible leaderboard**: Panel docked right of the board on desktop (≥680px), mirroring Blox left-side pattern. No more toggling.
- **Mobile toggle**: On narrow screens (<640px), leaderboard is hidden by default with a toggle button. Removed old fixed slide-in panel, backdrop, and close button.
- **Simplified JS**: Removed `openLeaderboard()`/`closeLeaderboard()`/`lbVisible` — replaced with single `toggleLeaderboard()` using `.show-mobile` class.

## v4.12.1 — 2026-02-19

### Match-3 Star Drop Persistence Fix

- **Star Drop state loss**: `restoreGame()` now hydrates last-mode board from `savedModes` instead of generating a fresh board. Drop tokens (`💰🌾⚡`) are correctly restored on re-entry.
- **DRY helper**: Added `restoreDropState(saved)` — shared by both `restoreGame()` and `startGame()` resume paths, eliminating the root asymmetry.
- **Saved-session badges**: Mode cards now show `▶ 120pts · 18 moves` when a saved session exists, informing players before they click.
- **CSS**: Added `has-save` styling for mode card description text (accent color + bold).

## v4.12.0 — 2026-02-19

### Server Modularization

Refactored monolithic `server.js` (1542 lines) into a modular composition root (~220 lines) with feature-specific route modules. Zero functional changes — all 184 tests passing.

- **`playerManager.js`** [NEW]: Extracted player state management, persistence (GCS + local fallback), schema migration, and graceful shutdown.
- **`data/questions.json`** [NEW]: Extracted hardcoded trivia question bank from server.js.
- **`routes/farm.js`** [NEW]: Farm endpoints (`/api/farm/*`, `/api/content/crops`).
- **`routes/resources.js`** [NEW]: Resource and Pet endpoints (`/api/resources/*`, `/api/pet/*`, `/api/farm/sell-crop`).
- **`routes/trivia.js`** [NEW]: Solo and Duel Trivia endpoints, room management, history.
- **`routes/match3.js`** [NEW]: Match-3 game endpoints (`/api/game/*`).
- **`routes/blox.js`** [NEW]: Building Blox endpoints (`/api/blox/*`).
- **`routes/leaderboard.js`** [NEW]: Match-3 and Blox leaderboard endpoints.
- **`server.js`** [MODIFIED]: Now a composition root — imports, configures, and mounts all route modules.

### Deployment Fix

- **Dockerfile**: Added `COPY playerManager.js`, `COPY routes/`, `COPY data/` — missing modules caused `ERR_MODULE_NOT_FOUND` on Cloud Run.
- **`.dockerignore`**: Changed `data/` → `data/hub-db.json` — `data/questions.json` was being excluded from the Docker build context.

### Housekeeping

- `package.json` version bumped to `4.12.0`.
- Updated all README files with new project structure and test counts.

## v4.11.1 — 2026-02-19

### Bug Fixes

- **Farm harvest stuck** (Bug 1): Crops couldn't be harvested immediately after growth completed. Root cause: harvest guard required stale server-side `plot.growth` (refreshed only every 30s) AND `startLocalGrowthTick` stopped rendering entirely when all crops finished. Fix: trust local clock-corrected growth (server validates on harvest API); do one final render on the growing→done transition.
- **Blox leaderboard 500** (Bug 2): `/api/blox/leaderboard` crashed when iterating players whose DB records pre-dated the Blox feature (`p.blox` undefined). Fix: optional chaining `p.blox?.highScore`.
- **Match-3 cross-device desync** (Bug 3): Server stored only one `currentGame` — multi-mode sessions (Classic/Timed/Drop) existed only in device-local `localStorage` and couldn't cross devices. Fix: added `savedModes` field to server player record, new `/api/game/sync-modes` endpoint, `persistSavedModes()` syncs to server, `restoreGame()` merges server modes.

## v4.11.0 — 2026-02-19

### UX/UI Audit — Phase 3 (Cognitive Load Reduction)

- **Farm shop FAB** (7.1): Floating 🛒 button on farm screen opens shop tab directly.
- **Match-3 recommended badge** (7.2): "⭐ Recommended" badge on Classic mode for first 3 games, auto-hides after.
- **Trivia settings panel** (7.3): ⚙️ Settings toggle exposes category and difficulty selectors. Defaults: All/Medium.
- **Farm growth time estimate** (7.4): "~45s left" / "~2m left" label below growth bar on each plot.
- **Energy tutorial tooltip** (7.6): One-time tooltip on energy pill explaining how energy works. Auto-dismisses after 10s.
- **Economy guide overlay** (7.7): `?` button in TopHUD opens a flow diagram showing the full economy loop.

### Housekeeping

- Cache-busting: CSS `?v=4.9` → `?v=4.11` in `index.html`.
- `package.json` version bumped to `4.11.0`.

## v4.10.0 — 2026-02-19

### UX/UI Audit — Phase 2 (Accessibility + Consistency)

- **Gold color brightened** (5.2): `--gold` changed from `#fbbf24` → `#f5cf50` for better contrast on dark glass panels (~5.5:1 ratio on `#1e1b2e` surfaces).
- **Button style convention** (6.5): `btn-danger` (red gradient) and `btn-success` (green gradient) standardized in `base.css`. Convention established: primary=purple, success/confirm=green, danger=red. Duplicate `btn-danger` removed from `blox.css`.

> **Note:** Items 5.1, 5.4, 5.5, 5.6, 6.1, 6.2, 6.4 were already implemented in Phase 1 (v4.9).

## v4.9.1 — 2026-02-19

### Bug Fixes

- **Screen headers hidden**: Removed per-game `<h2>` headers (`display: none`) — nav bar already provides game labels. Reclaims ~70px of vertical space, fixing Blox piece tray being clipped behind the nav bar and farm plots being partially obscured.
- **Match-3 cross-device desync**: `restoreGame()` now treats server state as authoritative — clears localStorage `savedModes` entirely and replaces with only the server's active session. Prevents stale sessions from device A appearing on device B.

## v4.9.0 — 2026-02-19

### UX/UI Audit — Phase 1 (Navigation, Visual Polish, Feedback)

#### Navigation Overhaul

- **Universal bottom nav bar**: Now visible on ALL devices (was mobile-only). Desktop nav dots removed — single navigation paradigm everywhere.
- **Auto-hide during gameplay**: Nav bar slides away during active Blox/Match-3 sessions via `.nav-hidden` class, recoverable on game-over/pause. `navBarAutoHide(hide)` helper in `shared.js`.
- **Periodic arrow flash** (desktop): Nav arrows flash subtly every 90 seconds to remind pointer users of swipe navigation.
- **Swipe hint re-show**: Swipe hint now re-shows after 3 days (was fire-once). Uses timestamp (`hub_swipe_hint_ts`) instead of boolean flag.

#### Visual Polish

- **Warm pastel overlay accents**: Game-over (gold `#f5cf50`), energy confirm (green `#a8d8a8`), pause (lavender `#c4b5e0`) overlays now have colored top borders for visual typing.
- **Toast tinted backgrounds**: Success/error/info toasts get subtle background tints matching their border color + leading emoji icons (✅/❌/ℹ️).
- **Stats bar labels**: Bumped from `0.6rem` → `0.72rem` with emoji icon prefixes (🏆, 🪙, ⭐, 🔥, 📊, 🏅) for scan-ability.
- **Blox ghost cell**: Dashed border + lower opacity (`0.45`) for better valid/occupied distinction.
- **Match-3 mode card lift**: Active mode card lifts `translateY(-2px)` with deeper shadow for clear selection state.
- **Crop emoji enlarged**: `2rem` → `2.3rem` for better readability on farm plots.

#### Touch & Interaction

- **Buy-bar stepper buttons**: `26×26px` → `38×38px` for reliable mobile tapping (item 3.3).
- **Seed card min-height**: 88px floor prevents cramped touch targets on small seed cards.
- **Farm inventory buttons**: Mobile min-height `36px` → `44px` for Apple HIG compliance.
- **Base button padding**: `11px` → `13px` for all `.btn` elements.

#### Consistency & Layout

- **Card/stats-bar widths**: Standardized from `min(520px, calc(100vw-80px))` → `min(480px, calc(100vw-60px))` across all game screens.
- **Overlay z-index**: Bumped from `200` → `250` to layer above nav bar correctly.
- **Inline styles → utility classes**: Game-over overlays replaced inline font/color with `.overlay-score` and `.overlay-detail` classes.
- **Farm tab warm fill**: Active farm panel tab background bumped to `0.1` opacity with `0.78rem` font.
- **Text contrast**: `--text-dim` brightened from `#94a3b8` → `#a3b1c6` for fine-print readability.

#### Feedback & Animations

- **Plant bounce** (`plantBounce`): Subtle scale pulse on harvest (wired via `.plant-bounce` class).
- **Screen shake** (`screenShake`): Dramatic shake for Blox game-over (wired via `.screen-shake` class).
- **Farm tab gold pulse**: Nav tab gets `navTabFarmPulse` animation + badge pulse when crops are ready (`.farm-ready` class on nav tab).

### Version Bump

- All CSS/JS/HTML version query strings → `v4.9`. File headers bumped in `base.css`, `farm.css`, `match3.css`, `blox.css`, `shared.js`.

## v4.8.1 — 2026-02-19

### Bug Fixes

- **Blox leaderboard alignment**: Leaderboard panel was shifted too far left and pushed the game board off-center. `blox-lb-panel` is now `position: absolute; right: calc(50% + 220px)` — floats to the left of the centered board without affecting layout flow. Game area is always centered on the player's screen.
- **Blox board centering**: Removed `gap` and `align-items` from `.blox-main` flex container so the board+tray column is the sole flex child driving centering.

### Version Bump

- `blox.css` header → `v4.8.1`.

## v4.8.0 — 2026-02-19

### Bug Fixes

- **Energy pill regen bar clipping**: Added `overflow: hidden` to `.hud-energy` so the aurora fill bar stays within the pill's rounded boundary at all widths (previously overflowed at 1-5%).

### Match-3 UX Overhaul

- **Mode persistence**: The last-played mode is always pre-highlighted in the mode selector bar. Players no longer see "no mode selected" on screen re-entry or after game-over.
- **Auto-start on piece interaction**: Touching/clicking the board when no game is active auto-triggers the energy confirmation for the pre-selected mode — no need to manually click a mode card first.
- **Energy confirmation dialog**: New `confirmAndStart()` shows "Spend 5⚡ to play Classic?" before deducting energy. Saved sessions resume for free (no confirmation). Replaces the old silent energy deduction on mode card click.
- **Simplified game-over overlay**: Removed "Play Again" button. Shows score, best score, and "🎉 New Record!" congrats when applicable. Single "✅ OK" dismiss returns the player to the board with the mode bar visible.
- **Mode card routing**: Clicking a mode card when no game is active routes through `confirmAndStart()`. During an active game, it switches modes directly.

### Version Bump

- All file headers, `package.json` → `v4.8.0`.

## v4.7.0 — 2026-02-19

### Bug Fixes

- **Blox premature game-over**: `clearLines()` now clears `board[][]` synchronously; the 300ms `setTimeout` only handles the visual `.clearing` CSS animation. The game-over check (`canAnyPieceFit()`) is deferred until after the animation completes, ensuring it runs against the correct board state.
- **Match-3 API race condition**: Removed the duplicate fire-and-forget `/api/game/move` call inside the game-over branch of `attemptSwap()`. This call raced with `/api/game/end`, causing 400 "no active game" errors on the server.

### Tests

- 4 new game-over correctness tests in `blox.test.js` — verifies synchronous line clearing and correct `canAnyPieceFit()` behaviour after clears.

### Version Bump

- All file headers, `package.json` → `v4.7.0`.

## v4.6.0 — 2026-02-18

### Bug Fixes

- **Play Again button not working**: `showModeSelector()` now dismisses the game-over overlay (`#m3-overlay`) and pause overlay before showing mode selection. Previously the game-over overlay stayed on top, blocking all interaction. Also resets `gameActive`, `gamePaused`, and `swipeBlocked` for clean state.

### Global Version Constant

- **Single source of truth**: Server reads `package.json` version at startup, injects `window.__APP_VERSION__` into HTML via `<!--APP_VERSION_INJECT-->` placeholder.
- **SmartLoader auto-sync**: `shared.js` SmartLoader reads `window.__APP_VERSION__` for cache-bust — no more hardcoded version strings.
- **Version badge auto-sync**: `{{APP_VERSION}}` placeholder in badge div, replaced by server.
- **Eliminates manual updates**: Only `package.json` and file headers need manual version bumps on release.

### Star Drop Visual Enhancement

- **Unique colors**: Drop gems now use radial gradients with hues that don't overlap any of the 6 regular gem types:
  - 💰 Gold Bag: rose-gold metallic (`#ffe4c4 → #e6a654 → #c4803d`)
  - 🌾 Seed Pack: deep emerald (`#b4ffd0 → #10b981 → #047857`)
  - ⚡ Energy: electric violet (`#e0c3fc → #a855f7 → #7c3aed`)
- **Unique borders**: Thick white border (3px, 85% opacity) + animated `dropBorderPulse` glow with per-type `--drop-color` custom property. Glow expands outward in sync with existing `dropGlow` pulse.
- **3D inner glow**: Radial gradient placed at 35% 35% creates a gem-like highlight that no regular flat-gradient tile has.

### Version Bump

- All file headers, `package.json` → `v4.6.0`.

## v4.5.3 — 2026-02-18

### Match-3 Mode Selector Fix (Critical)

- **Mode selector always accessible**: `init()` eagerly creates the mode selector so it exists for `hideModeSelector()`. After "Continue", mode switcher bar appears inline — player can always switch modes.
- **`onEnter()` state handling**: Properly distinguishes active game → pause overlay, saved sessions → continue overlay, no sessions → mode selector directly. Previously showed pause overlay in all cases.
- **"New Game" / "Play Again" → mode selector**: Both `m3-btn-start` and `btn-m3-play-again` now open the mode selector instead of calling `startGame()` directly.
- **`showModeSelector` exported**: Available to external callers (`shared.js` wiring).

### UX Button Hierarchy

- **Continue is primary**: When saved sessions exist, "▶ Continue" is `btn-primary` (first, most prominent), "🎮 New Game" is `btn-secondary`, "🛑 End All Sessions" is `btn-muted` (small, transparent, least prominent).
- **DOM reordering**: Buttons dynamically reordered each time the pause overlay opens to ensure correct visual hierarchy regardless of initial HTML order.
- **Handler reset**: All button `onclick` handlers reset on each overlay open to prevent leaking handlers from prior overlay states.
- **`.btn-muted` CSS class**: New button style — transparent, dim, small text — for destructive-but-rare actions.
- **`.overlay-actions`**: Flex column layout for consistent vertical button stacking.

### Version Bump

- All file headers, cache-bust strings, package.json → `v4.5.3`.

## v4.5.2 — 2026-02-18

### Stale Cache Fix (Critical)

- **Cache-bust audit**: All `?v=4.1` strings in `index.html` (7 CSS + 4 JS) and `shared.js` SmartLoader updated to `?v=4.5.2`. Server content-hash injection still runs at runtime, but source now matches.
- **SmartLoader**: Dynamically created `<script>` tags now use `?v=4.5.2` instead of stale `?v=4.1`.

### Test Script Fix (Critical)

- **`npm test` now runs all 167 tests**: Added `blox.test.js` (26), `match3.test.js` (12), `ux.test.js` (29), `gcp.test.js` (20) to `package.json` test script. Previously only 80 of 167 tests ran.

### Header Audit

- **All file headers aligned to `v4.5.2`**: `shared.js`, `store.js`, `hud.js`, `pet.js`, `farm.js`, `trivia.js`, `blox.js`, `match3.js`, `match3.css`, `blox.css`, `blox.test.js`.
- **Version badge**: `index.html` badge updated to `v4.5.2`.

### Docs

- **README**: Fixed Demo Showcase `3-in-1 Hub` → `4-in-1 Hub`.

## v4.5.1 — 2026-02-18

### Match-3 Session Persistence (Critical)

- **Save on creation**: New games stashed into `savedModes` immediately after board generation — game state now survives page reload even without making any moves.
- **Persist after every swap**: `savedModes` updated and written to `localStorage` after each successful gem swap — mid-game progress never lost.
- **Zero-move boards saved**: Removed `score > 0` gate — boards with no moves made are preserved when switching modes (no energy re-charge).
- **Resume overlay**: When saved sessions exist after reload, pause overlay shows "▶ Continue" + "🛑 End All Sessions" + "🎮 New Game" instead of just "New Game".
- **Auto-classic start**: If no saved sessions exist on first launch, classic mode starts automatically (no manual mode selection needed).

## v4.5 — 2026-02-18

### Match-3 Mode Selector UX

- **Mode selector always accessible**: Shown directly on init and onEnter — no more invisible "New Game" gate required to browse modes
- **Energy denial → mode selector**: When energy check fails, user returns to mode selector instead of being trapped with stale `gameMode`
- Header bumped to v4.5

### Farm UX

- **Click-to-water**: Tapping a growing, unwatered plant now triggers watering instead of showing "Still growing" toast — eliminates frustration with small water button
- Updated toast: "💧 Already watered! Growing…" for already-watered plants

### Notification Badge Fix (Critical)

- **Wrong screen index**: `updateFarmBadge()` used hardcoded screen `1` (Blox) instead of `2` (Farm) — clicking the badge navigated to Blox instead of Farm
- **Direction arrows**: Fixed `point-left`/`point-right` logic for 4-screen layout
- Farm module bumped from v3.3 → v4.5

### Toast System

- **Deduplication**: Same message within 1.5s is suppressed (prevents toast stacking from rapid actions)
- **Color variants**: `showToast(msg, "success"|"error"|"info")` for context-appropriate left-border colors
- Duration extended 2.1s → 2.5s

### Stale Cache Fix

- **In-game version badge**: Fixed stale `v4.1` → `v4.5` in `index.html`

## v4.4 — 2026-02-17

### Match-3 Critical Fixes

- **Energy Guard Fix**: Energy check now runs _before_ `gameMode` mutation. Previously, failing the energy check left `gameMode` corrupted, causing board state to copy across modes. `match3.js`.
- **State Persistence**: `savedModes` now persisted to `localStorage` (`m3_saved_modes`). Game states for each mode survive page reload — no more lost progress. `match3.js`.
- **Restore Continuity**: `restoreGame()` now populates `savedModes` from server data, so "Continue" works correctly on first entry after reload. `match3.js`.

### Blox Mobile Fixes

- **Touch Drag Freeze**: Removed `renderTray()` call during `touchstart` — it was destroying the DOM touch target mid-event, causing browsers to cancel the touch sequence. Now uses CSS `.dragging` class for visual feedback. `blox.js`, `blox.css`.
- **Ghost Alignment**: Ghost preview now aligned with the lifted drag preview by offsetting `getBoardTarget()` coordinates by `liftY`. `blox.js`.
- **Lift Reduced 15%**: Touch lift factor reduced from 2.5× to 2.125× cell size for better finger proximity. `blox.js`.

## v4.3.1 — 2026-02-17

### Hotfix

- **Blox Startup Crash**: Fixed `SyntaxError: Identifier 'dragPreviewEl' has already been declared` caused by duplicate variable declaration in v4.3. `blox.js`.

## v4.3 — 2026-02-17

### Critical Fixes

- **Match-3 Star Drop Deadlock**: Added `hasValidMoves()` check after board generation and star placement. If no moves are possible, the board is regenerated until playable. `match3.js`.
- **Match-3 State Persistence**: Switching modes (Classic/Timed/Drop) now saves the previous game state (board/score/timer). Returning resumes where you left off without consuming energy. `match3.js`.
- **Match-3 Timer Fix**: Fixed "Time Attack" timer bleeding into other modes. Timer is now properly cleared on mode switch. `match3.js`.
- **Blox Mobile Drag**: Drag preview now scaled to **1:1 board size** (was mini) and offset above finger for better visibility. `blox.js`.
- **Touch Stability**: Added `touch-action: none` to full gameplay containers to prevent browser scrolling interference. `blox.css`, `match3.css`.

## v4.2 — 2026-02-17

### Improvements

- **Blox PC Drag**: Added mouse drag-and-drop (click-hold). `blox.js`.
- **Blox Stability**: Fixed mobile touch piece-stuck issue. `blox.js`.
- **Match-3 Pause**: Added pause/continue overlay to match Blox UX. `match3.js`.
- **Match-3 Swipe**: Added touch/mouse swipe gesture for gem swapping. `match3.js`.
- **Star Drop Logic**: Bonus items now preserved during gravity/cascades. `match3.js`.

## v4.1 — 2026-02-17

### UX Overhaul

- **Mobile Bottom Nav Bar**: 60px tab bar (emoji+labels), touch devices only. `base.css`, `shared.js`, `index.html`.
- **Blox Persistence**: `localStorage` save/restore board+tray+score. `blox.js`.
- **Blox Pause Overlay**: Frosted-glass overlay (New/Continue/End). Replaces old start button. `blox.css`, `index.html`.
- **Blox Ghost Fix**: Board-level `mousemove` + `click` with center-of-mass offset. No per-cell gap flicker, placement matches ghost exactly. `blox.js`.
- **Blox Touch Drag**: Tray→board drag with floating preview + `HUB.swipeBlocked`. `blox.js`, `blox.css`.
- **Match-3 Sidebar**: Vertical mode selector left of board on desktop >680px. `match3.css`.
- **Match-3 Mode Switch**: Non-active modes clickable during play (toast, no `confirm()`). `match3.js`.
- **Match-3 Descriptions**: 0.68rem, readable text. Star Drop moves 20→30. `match3.js`, `match3.css`.
- **Farm Mobile Buttons**: Sell/Feed enlarged (8px×14px, 0.82rem, 36px min-height) at <640px. `farm.css`.

### Bugfixes (same day)

- `confirm()` blocked by Discord sandbox — replaced with toast+direct switch.
- Ghost/placement offset mismatch — unified `getTargetFromEvent()` for both.

---

## v4.0 — 2026-02-17

### New: Building Blox 🧱

- 10×10 grid block puzzle, 12 piece shapes, ghost preview, progressive scoring.
- Energy cost 4⚡. Server endpoints: `/api/blox/start`, `/api/blox/end`.
- `blox.test.js`: 26 tests (shapes, placement, clearing, scoring, game-over, reward).

### Match-3 Mode Selector Fix

- Removed absolute sidebar (clipped by `overflow-x: hidden`). Inline horizontal cards.

### Navigation: 3→4 screens

- Screen order: Trivia → Blox → Farm → Match-3. Farm remains default (index 2).

---

## v3.3 — 2026-02-17

- Match-3 mode selector auto-shown on first visit (was blank screen).
- Energy HUD tooltip: fixed 5min→2.5min interval; `syncFromServer` smart-merge.
- Pet profile: removed duplicate feed section, added Auto-Plant ability display.
- Farm emojis: pre-populate from `localStorage` cache before API.
- Test fix: `ux.test.js` `getWateringMultiplier` was testing default, not crop-specific.
- Removed dead `feedPet()`/`renderFeedButtons()` from `pet.js`.

## v3.2 — 2026-02-17

- `gcp.test.js`: 20 resilience tests (latency, concurrency, payload, save stress, stale reconnect, idempotency).
- Test audit: removed `match3.test.js` skip clause, pet flicker tests assert real buffers.

## v3.1.1 — 2026-02-17 (hotfix)

- `STAR_TYPE` undefined crash → `DROP_TYPES.includes()`.
- `[object Object]` reward display → compact text preview.
- Mode selector sidebar: absolute left of board (reverted in v4.0).
- Cache bust all `?v=3.0` → `?v=3.1`.

## v3.1 — 2026-02-17

- **Farm**: Gold sync instant, harvest persist, sell button, feed pet, water timeout, `/api/farm/sell-crop`.
- **Match-3**: Star Drop 3 types, Time Attack timer-only, play-again flow.
- **Energy**: Regen 150s (was 300s), aurora pill gradient.
- **CSS**: `.farm-inv-btn.sell/.feed`, `.drop-gold/.drop-seeds/.drop-energy`.
- **Tests**: 12 tile clearing tests.

## v3.0 — 2026-02-17

- 7 hotfixes: farm panel overlay, harvest sync, toast XP-only, per-plot version, energy trust server, mode selector fix, regen bar fill.
