## [6.3.0] - 2026-02-23

### Added
- Migrated to React 18 via Vite. The legacy Vanilla JS engine is now encapsulated inside `VanillaShell.jsx`.
- Integrated Zustand state management, syncing seamlessly with traditional backend data.
- Tailwind V3 utilized for all new TopHUD, GameStoreUI, QuestUI, and PetInfoUI components.
- Fully modernized UX with Framer Motion spring animations.

# Changelog

## v6.3.0 — 2026-02-23

### Psychological Marketing UX/UI Integration

Major feature release focusing on behavioral psychology and dark-pattern-free engagement loops (Sprints 1-3).
Integrated Nudge Theory, the Zeigarnik Effect, the Peak-End Rule, and the IKEA Effect into core gameplay interactions.

#### 1. GameStore (Decoy Effect & Scarcity)

- Added `store.js` and `store-ui.js` with a new reactive `MonetizationStore` container.
- **Decoy Effect**: Added an inferior "decoy" bundle to make the target bundle look vastly superior.
- **Scarcity & Urgency**: Implemented a rotating daily special with a countdown timer.
- **Foot-in-the-Door**: Added a completely free daily retention bundle to train users on the checkout flow.

#### 2. Quest System Upgrade (Goal-Gradient Effect)

- Converted hardcoded quests to a dynamic reactive menu in `quest.js`.
- Progress bars now start at 25% (visual head start) to simulate the **Goal-Gradient Effect**, driving completion rates.
- Quests auto-subscribe to the `GameStore` state singleton for instant reactivity.

#### 3. Welcome Back Modal (Zeigarnik Effect)

- Modified `game-logic.js` to identify "open loops" (e.g. unharvested crops, partially fed pets).
- `farm.js` now natively renders these unfinished tasks as blinking alerts upon return.

#### 4. Micro-Interactions & Polish (Peak-End Rule)

- **Peak-End Rule**: Game Over modal in Match-3 now features an explosive, physics-driven CSS-only particle scatter `m3-splash-particle`.
- **IKEA Effect**: New naming prompt `promptForPetName` allows the player to rename their companion pet upon level-up or at start, boosting emotional attachment.
- **Nudge Theory Fluidity**: `scroll-behavior: smooth` and `cubic-bezier` spring transition variables applied to quest dropdowns and global panels for fluid, satisfying UX.

#### Engineering & Tests

- 100% test coverage maintained (322/322 tests pass).

---

## v6.2.3 — 2026-02-22

### Bug Fixes — Pet Drag, Farm Timers, Shop Display, UI Freeze

Six bug fixes targeting gameplay regressions and a critical UI unresponsiveness issue.

#### 1. Pet Drag Flyoff (`pet.js`)

- **Root cause**: Each `pointermove` frame re-read `getComputedStyle().transform.m41`, which already included the resolved `translateX(-50%)` pixel offset (~24px). Adding `dx` to this value each frame caused compounding leftward drift.
- **Fix**: Absolute X position captured **once** on `pointerdown` and tracked via accumulated deltas — no computed style reads during drag. Removed `translateX(-50%)` from drag/drop transforms entirely.

#### 2. Farm Timer Label Static (`farm.js`)

- **Root cause**: The `render()` diff-update path updated `.growth-bar-fill` width but **never** refreshed `.growth-time-label` text content. The 500ms growth tick moved the bar, but the timer text stayed frozen at its initial value.
- **Fix**: Diff-update now calls `formatTimeLeft(plot, pct)` on every tick to update the label. Also removes uproot 💣 button when crop reaches harvest-ready.

#### 3. Shop "undefined" Card + Wrong Growth Times (`farm.js`)

- **"undefined" card**: API `/api/content/crops` returns `{ ...CROPS, __hash: "..." }`. The `__hash` key is a string, not a crop object — iterating it produced an empty card with "undefined" name/price/emoji.
- **Wrong growth times**: The `crops` variable (populated from API/localStorage cache) could contain stale `growthTime` values from older game versions.
- **Fix**: Added `.filter()` to exclude non-object entries and `__hash`-prefixed keys. Shop now uses `CROPS_CONFIG[id]?.growthTime` (canonical import from `game-logic.js`) instead of relying on the cached API data.

#### 4. Toast Event Listener Memory Leak (`shared.js`)

- **Root cause**: `showToast()` attached `window.addEventListener("mousemove", ...)` and `window.addEventListener("mouseup", ...)` for swipe-to-dismiss on **every** toast, but **never removed** them. After dozens of toasts, thousands of orphaned listeners ran on every mouse pixel, causing `[Violation] Forced reflow` and main-thread lockups.
- **Fix**: Move/up listeners now attach on `mousedown`/`touchstart` only, and are removed immediately in the `mouseup`/`touchend` handler.

#### 5. safeShowModal Backdrop Click Trap (`shared.js`)

- **Root cause**: The backdrop click-to-close listener used `{ once: true }`. If a user clicked **inside** the dialog first (e.g., missed a button), the event bubbled to `<dialog>`, consumed the one-shot listener without closing, and destroyed the only close mechanism. The invisible `::backdrop` then permanently trapped all pointer events until `ESC` was pressed.
- **Fix**: Replaced with a persistent `click` listener that checks `e.target === dialogEl` and validates via `getBoundingClientRect()` bounds. Self-removes only when actually closing the dialog.

#### 6. Centralized Modal Opening (`blox.js`, `match3.js`, `merge.js`)

- **6 direct `.showModal()` calls** across Blox (2), Match-3 (3), and Merge (1) bypassed the anti-stacking logic in `safeShowModal()`.
- **Fix**: All replaced with `safeShowModal()` — ensures any previously open dialog is closed before showing a new one, and all modals get the fortified backdrop click handler.

#### Version Bumps

- `package.json`: 6.2.2 → 6.2.3

#### Tests

- **320/320 pass**, 0 failures.

---

## v6.2.2 — 2026-02-22

### Offline Economy Rebalance — Autonomous Pet

Critical UX fix: players no longer return to 0 Energy after being away. The pet's offline automation now runs on its own **Fullness** gauge instead of draining the player's Energy.

#### Core Mechanic Change (`game-logic.js`)

- **`processOfflineActions()`** completely rewritten:
  - **Auto-Harvest**: costs **2 Fullness** per crop (was 1 Energy).
  - **Auto-Plant**: costs **4 Fullness** per seed (was 2 Energy).
  - **Auto-Water**: still free (ability-gated only).
  - **Player Energy**: **never modified** during offline simulation.
- **Self-Sustain (Auto-Eat)**: When the pet's fullness runs out mid-session, it automatically eats **cheap-tier crops only** (`strawberry`, `blueberry` — `CROP_TIERS[id] === "cheap"`) from the player's inventory to refuel. Mid and expensive crops (tomato, golden, corn, sunflower, watermelon, pumpkin) are never consumed.
- **Report fields**: `energyConsumed` removed, replaced with `fullnessConsumed` and `foodEaten: { [cropId]: count }`.

#### Welcome-Back Dialog (`farm.js`)

- Updated to display `🍖 fullness used` and `🐾 Pet ate: 🍓×N` instead of `⚡ energy used`.

#### Tests

- **320/320 pass**, 0 failures (+2 new tests for auto-eat and mid/expensive food protection).
- 100× stress test now asserts energy is **never modified** (was: "never below 0").

#### Version Bumps

- `package.json`: 6.2.1 → 6.2.2

---

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
