## [10.4.4] - 2026-03-27

### Blox & Match-3 Engine Atomization + Performance Fix

#### Blox Engine Atomization (`src/vanilla/blox/engine.js`) [NEW]
- Extracted 5 pure stateless functions (`createEmptyBoard`, `canPlace`, `placePiece`, `canAnyPieceFit`, `getCenterOffset`) into a shared engine module.
- Both `blox.js` (vanilla DOM facade) and `useBloxEngine.js` (Zustand store) now import from `engine.js`, eliminating ~50 lines of duplicated game logic.
- Single source of truth for piece placement validation, game-over detection, and board initialization.

#### Layout Thrashing Fix — Drag Performance (`blox.js`, `match3.js`)
- **Root cause**: `getBoundingClientRect()` called every `requestAnimationFrame` inside `pointermove` for the micro-parallax tilt effect. This forced synchronous layout recalculation while CSS custom properties were being mutated, causing severe FPS drops during piece dragging.
- **Fix**: Introduced `_cachedTiltRect` / `_cachedBoardRect` caches invalidated only on `resize`/`scroll` events. Eliminates forced reflows during the drag-and-drop hot path.

#### Test Regression Fix (`tests/ux.test.js`)
- Updated `showWelcomeBack` test to reference `farm/index.js` (modularized path) instead of legacy `farm.js`.
- Fixed regex to capture the full function body by matching the unindented closing brace (`^\}`) instead of inner braces.

#### Tests — **444/444 pass**, 0 failures.

## [10.4.3] - 2026-03-27

### Codebase & Supabase Polish
- **Database Optimization**: Added `(id, (data->>'_version'))` and `updated_at` indexes to both Prod and Test Supabase instances to ensure optimal lookup speed for OCC locking.
- **Frontend Cleanup**: Scrubbed legacy `console.warn` outputs related to `hub:state-desync` from vanilla JS game engines to declutter production console logs.
- **Type Safety**: Provided strict JSDoc `@typedef` blocks in `game-logic/player.js` for IDE autocompletion of Player, Farm, Merge, and Pet states.

## [10.4.2] - 2026-03-27

### The "3-Second Desync" Express 5 Bugfix
- **Root cause**: Express 5.2.1 internals call `res.setHeader()` and `res.getHeader()` when `res.json()` is executed. The previous `mockRes` in `routes/batch.js` lacked these native methods, throwing a hidden `TypeError` and returning `500` for every batched request. This perfectly aligned with the 3000ms debounce timer on the frontend, triggering a frustrating reverting of the UI every 3 seconds.
- **Fix**: Added `setHeader` and `getHeader` to `mockRes`, restoring zero-TCP-overhead loopbacks (`app.handle`) and rate-limiter bypasses.

## [10.4.0] - 2026-03-27

### Synchronization Hardening — Zero Data Loss Architecture

Critical architectural fixes targeting silent data loss during OCC collisions, TCP socket exhaustion in batch processing, and incomplete auto-healing coverage. **All tests pass.**

#### Critical: OCC Data Loss Fix (`playerManager.js`)
- **Root cause**: `asyncFn(player)` was guarded by `if (attempt === 1)` — OCC retries saved **unmodified state** to DB, silently erasing the player's last action (plants disappearing, watering reverting).
- **Fix**: Removed the `attempt === 1` guard. Business logic now re-executes on every retry attempt against freshly-loaded DB state, guaranteeing mutations are never silently dropped.

#### Batch Router Rewrite — Zero-Loopback (`routes/batch.js`)
- **Eliminated HTTP loopback**: Replaced `fetch('http://127.0.0.1:PORT/...')` with in-process `app.handle(mockReq, mockRes)` dispatch. Removes TCP socket overhead, double JSON serialization, and rate-limiter re-evaluation for sub-requests.
- **Mount order fix** (`server.js`): Moved `/api/batch` mount before the SPA catch-all to prevent GET sub-requests from hitting the HTML fallback.
- **Rate limiter bypass** (`middleware/rateLimit.js`): Internal batch dispatches (`req._isBatchInternal`) skip rate limiting since the parent `/api/batch` request is already rate-limited.

#### Universal Auto-Healing (`hub:state-desync`)
- **Match-3** (`match3.js`): Added `hub:state-desync` listener — calls `restoreGame()` to re-sync all saved modes from server.
- **Building Blox** (`blox.js`): Added `hub:state-desync` listener — re-fetches `/api/blox/state` and applies server-authoritative board/tray/score.
- **Trivia** (`trivia.js`): Added `hub:state-desync` listener — resets to menu on sync failure (trivia is session-based, no persistent client state to heal).
- Previously only Farm, HUD, Merge, and Pet had desync listeners.

---

## [10.3.0] - 2026-03-26

### Supabase Database Hardening & Hybrid OCC Locks

Comprehensive architectural refactoring to eliminate transaction contention and lock waits, shifting to a lock-free optimistic concurrency control model with an in-process mutex. **435/435 tests pass.**

#### Database Security & Integrity
- **B-Tree Indexing**: Created `idx_player_events_user_id` to eliminate full table scans during fetch operations.
- **Relational Integrity**: Added `ON DELETE CASCADE` foreign keys from `player_events` to `players` and `auth_sessions` to `auth_users` to automatically clear orphaned records.
- **RLS "Deny All" Policies**: Hardened the PostgREST API with fallback `USING (false)` RLS policies on all operational tables (`players`, `player_events`, `auth_users`, `auth_sessions`).
- **View Security**: Revoked public and authenticated access from `player_stats_view` to prevent unauthorized aggregation queries.

#### Hybrid OCC Locking (playerManager.js)
- **In-Process Mutex**: Implemented a per-player Promise-chain mutex to serialize concurrent HTTP requests belonging to the same `userId` within a single Node.js instance. Eliminated database overhead for local synchronization.
- **Optimistic Concurrency Control (OCC)**: Replaced blocking `SELECT ... FOR UPDATE` transactions with lock-free reads and an atomic `UPDATE ... WHERE _version = oldVersion`. Drastically reduced lock waits (from 46ms down to <1ms).
- **Retry Jitter**: Handled horizontal scaling races (cross-instance collisions) with a bounded 3-attempt jittered retry loop.
- **Deadlock Eradication**: Removed `sql.begin` completely. No long-lived transactions block the connection pool during asynchronous route logic.

#### Test Suite Hardening
- **Production Database Safety Guard**: Adjusted tests to strictly abort if `DATABASE_URL` points to the production Supabase project reference (`dhrsygifwgtezdijjtwx`), strictly allowing test Supabase instances.
- **Test Isolation**: Improved `clearAllPlayers` and `beforeEach` to respect the newly established foreign key constraints (`DELETE FROM player_events` first).

---
## [10.2.0] - 2026-03-26

### Architectural Hardening & Auto-Healing (12 Fixes)

Comprehensive 3-round architectural refactoring focusing on state synchronization, concurrency locks, and mobile UX. **435/435 tests pass.**

#### Global Auto-Healing architecture
- **`hub:state-desync` Event System**: Implemented across all 5 stateful engines (Farm, HUD, Merge, Pet/Room, Match3/Blox). The central `apiBatched` queue now instantly fires a global desync broadcast upon any `4xx/5xx` backend failure, automatically triggering all engines to silently re-fetch their authoritative states without user disruption.
- **Optimistic Rollback**: Integrated snapshot-restore logic into `hud.js` pet feeding. Network denials now effortlessly "bounce" visual sliders and quantities back to their initial state.
- **`MobileShopDrawer` Safety**: Swapped standalone `window.HUB.api()` calls in React to `apiBatched()`, placing inventory sales firmly inside the auto-healing safety net.

#### Concurrency & Network Resilience
- **Batch Router Throttle** (`batch.js`): Rewrote the `/api/batch` router loop from a synchronous `for...of` iteration into chunked parallel execution (`max concurrency: 3`). Fully eliminates intermittent Supabase Connection Pool exhaustion (504 timeouts) during cross-game action sprays.
- **Strict In-Flight Locks**: Placed strict mutability flags in `farm.js` (`plantingInFlight`) and `trivia.js` (`_startSoloInFlight`), blocking rapid-click double execution bugs before network promises can resolve.
- **Clock Drift Heartbeat**: Injected a lightweight 5-minute interval (`api("/api/farm/state")`) that continuously self-corrects the client's `clockDelta` representation to prevent iOS sleep-mode drift.

#### Mobile UX & GC Optimization
- **Farm Panel Overflow** (`base.css` / `farm.css`): Fixed a viewport calculation where farm interface tabs were shoved behind the 68px Bottom Navigation bar on tiny screens. Enforced rigid `max-height: 50vh`.
- **Background CPU Throttle** (`hud.js` / `pet.js`): Halted the `setInterval` HUD energy regen ticks and Pet satiety polling whenever `document.hidden` is true. Eliminates phantom DOM reflows and background battery sink.

---
## [10.1.5] - 2026-03-18

### Pet Naming Loop & Farm Sync Resilience

Fixed two critical persistence and network-race issues causing poor user experience:

#### Pet Naming Prompt Loop Fix
- **Root cause:** Welcome screen relied on `localStorage.getItem("gh_onboarded")`, which is wiped between sessions in Discord Embedded App iframes context.
- **Fix:** Implemented a server-side `_onboarded` flag stored securely in PostgreSQL. The `WelcomeScreen` now performs a robust 3-tier check (Server-side flag → Implicit rename signal → Local fallback) to guarantee returning users skip the onboarding flow seamlessly.

#### Farm Action Rollback Prevention
- **Root cause:** The optimistic API batches actions with a 3-second debounce (`apiBatched`), but incoming cross-tab / server broadcasts (`farm_state_sync`) were unconditionally applied. If a broadcast arrived while a local action was still in the debounce queue, the plot would "flicker" back to its old state (e.g. unplanted/unwatered) until the server eventually resolved the batch.
- **Fix:** Introduced `optimisticActionTimestamps` to track real-time local mutations for `plant`, `water`, `harvest`, and `uproot`. The `farm_state_sync` event listener now securely ignores incoming payload updates for any plot modified by the local user within the last 5 seconds. Actions are now 100% resilient and visually seamless.

---
## [10.1.4] - 2026-03-17

### Match-3 UX/UI Visual Improvements (5 Features)

Comprehensive visual juice pass for the Match-3 game module, fixing the cascade disappearing-gems bug and adding 4 new interaction feedback systems.

#### Cascade Disappearance Fix (Adaptive Thresholding + Hit-Stop)
- **Root cause**: `SPEED_FLOOR` at `0.65` allowed animation durations to drop below browser rendering thresholds (~130ms), so CSS transitions couldn't complete before DOM updates replaced them.
- **Fix**: `SPEED_FLOOR` raised from `0.65` → `0.80` (minimum ~200ms per phase). Added cinematic hit-stop pauses: **100ms** for 5+ matches with `perlinShake`, **60ms** for match-4.

#### Hint System (Wiggle + Glow)
- After **4.5 seconds** of player inactivity, one valid-move gem receives `hint-pulse` class with subtle wiggle animation (±4° rotation) and pulsing glow in the gem's own `--gem-color`. Clears on any interaction.

#### Grand Match Feedback (Directional Laser + Text Popup)
- **Match 4**: Directional CSS laser beam (`laserH`/`laserV`) shoots through the matched row/column.
- **Match 5+**: Radial explosion particles + animated "MEGA!" / "AWESOME!" text popup with spring overshoot and drift-up fade (`m3GrandPop` keyframe).

#### Masked Drop Spawning (Squash & Stretch)
- `.m3-board` now has `overflow: hidden` + CSS `mask-image` gradient at the top edge. New gems start from `y + 4` cells above (instead of `y + 1`), creating a visible "drop from reservoir" effect leveraging the existing `m3Fall` squash/stretch physics.

#### Misclick Rubber Band Bounce
- On invalid swap, both gems slide **50%** toward each other with spring cubic-bezier, slight head-shake rotation (±3°), then bounce back after 150ms. Replaces the old `perlinShake` full-board shake for a more intuitive "these can't swap" signal.

#### Tests — **393/393 pass**, 0 failures.

---

## [10.1.3] - 2026-03-17

### Engine Hot-Path Optimization (Zero Array Allocation Iteration)

Replaced multiple arrays allocations and memory overhead generated by `Object.values().reduce()` and `Object.values().some()` logic hooks with more memory-friendly implementations on core hot paths.

#### High-Performance Iterations
- **Store Evaluators** (`useFarmEngine.js`): Fixed computation of `totalHarvests` on every Zustand state flush within the `getUnlockedSeeds` engine by migrating `.reduce` iterations to an explicitly guarded `for...in` loop.
- **Vanilla Sync** (`farm.js`): Refactored `_getPlayerStats` to compute `totalHarvests` using the same `for...in` optimization to keep memory allocation low for headless/server contexts.
- **UI Render Hooks** (`BottomNav.jsx`): Replaced inline `Object.values(farmInventory).some(...)` evaluation with a new memoized Zustand selector `useHasFarmItems`. Avoids recomputing array logic on every small UI interaction by pushing derivations directly into the store.

#### Tests — **328/328 pass**, 0 failures.

---

## [10.1.2] - 2026-03-16
### E2E Testing & AAA Refactoring

Comprehensive testing overhaul achieving lightning-fast validation and browser-level stability. 328/328 tests passing across all tiers.

#### Integration Test Refactoring (AAA Pattern)
- **Direct Database Injection**: Refactored `api.test.js` to strictly adhere to the Arrange-Act-Assert layout. Eliminated slow and flaky API-driven test setup (e.g., repeatedly calling `/api/farm/state`) in favor of direct PostgreSQL `INSERT` provisioning via the new `injectTestPlayer()` utility.
- **Edge Case Coverage**: Expanded unit tests (`unit.test.js`) to cover obscure offline simulation edge cases, including clock-skew negative limits and energy max-out skips.

#### Playwright E2E Testing
- **Core Farm Loop Validation**: Introduced `tests/e2e/farm.spec.js` using Playwright to exercise the complete `buy -> plant -> water -> wait -> harvest -> sell` engine lifecycle within a headless Chromium engine.
- **Natural Tick Observability**: Hardened E2E testing to successfully wait out natural 30-second crop growth cycles without relying on dangerous `__DEV_MODE__` clock hacks that subvert `requestAnimationFrame`.
- **Race Condition Mitigations**: Implemented strict `page.waitForResponse` barriers against `/api/batch` to ensure the fast client Optimistic UI doesn't outpace the server's Postgres lock resolution.

---

## [10.1.1] - 2026-03-16

### Systematic Debugging & Core Engine Audit

Comprehensive security, desync, and performance audit covering Farm, Match-3, Merge, and Blox engines.

#### Farm Module 
- **Inventory & Crop Selling Recovery**: Fixed a bug where missing fallback parameters in `syncToStore` caused sold or fed crops to vanish locally without triggering cross-tab sync broadcasts, preventing local inventory updates.
- **Race Condition Prevention**: Enforced strict `withPlayerLock` and bounds-checking, resolving visually jumping empty plots and missing plant occurrences under poor network connectivity.
- **UI Element Crash**: Fixed initialization crashes relating to obsolete DOM properties (`farm-coins`, `farm-xp`, `farm-level`).
- **Disappearing Planted Seeds**: Fixed a V10 Postgres migration oversight where Express Response closures interrupted database `UPDATE` locks, permanently dropping state updates upon planting or watering seeds.
- **Global Welcome Back Notification**: Restricted the `offlineReport` dialog exclusively to the Farm tab (id: `2`), eliminating invasive popups blocking Match-3 and Trivia sessions. Ambient toast notifications serve as fallback.
- **Batched Request Desynchronization**: Resolved a native Node.js Exception where the `express.json()` parser recursively consumed batched mock requests in `server.js`. The dispatcher has been migrated to standard `fetch()` loopbacks.
- **Flickering Plant Layout Wobbles**: Enforced a strict static width on the DOM node containing the `growth-time-label` and restricted the `.farm-plot` flexbox transitions to transform and opacity. This prevents the text countdown shifts from constantly invalidating the layout center on every `setInterval` tick.
#### Match-3 & Blox Modules 
- **Match-3 Freezes**: Hardened `animateCascade` and `attemptSwap` functions, adding explicit type checking and `sleep` boundaries to prevent the engine from locking the board indefinitely upon concurrent or rapid swaps.
- **Blox Persistence Check**: Verified ghost piece D&D interactions and guaranteed clean `getCenterOffset` targeting math. No severe desyncs found.

#### Merge Module & Core Bridges 
- **Merge State Fallback Healing**: Introduced `syncMergeStateFallback()` which executes aggressively in the background if a batched Optimistic UI action crashes, automatically repairing visual desynchronization and resetting `generatorState` locks.
- **Bridge Idempotency**: Audited `apiBatched`, `useGameBridge.js`, and `realtime.js`. Confirmed strict monotonic execution paths via `nonce` duplication filtering without recursive React re-renders.

#### Tests — **325/325 pass**, 0 failures.

---

## [10.1.0] - 2026-03-16

- **Cross-Tab Object Sync**: Implemented seamless multi-tab state synchronization using `localStorage` events backed by `Supabase Realtime Broadcast`. Farm, inventory, and resources now instantaneously sync across concurrent devices and tabs.
- **Activity Feed**: Added live multiplayer event streaming. `player_events` table captures harvest, plant, sell, and feed actions. Displayed via React overlay driven by Supabase Postgres Subscriptions.
- **Player Stats Journal**: Introduced `player_stats_view` Materialized View to aggregate lifetime player interactions. Included a concurrent background refresh loop for rapid front-end statistical queries without O(N) penalties.
- **Zero-Loading Screen**: Migrated initial bootstrap load to `idb-keyval`, delivering immediate UI paint from indexedDB cache while background-syncing with the server.

---

## [10.0.1] - 2026-03-15

### Data Migration Recovery & Deployment Fixes

#### Root Cause
After the v10.0.0 Supabase PostgreSQL launch, all existing players received **"Invalid username or password"** errors. The initial migration only transferred the `players` Firestore collection; the `users` and `sessions` collections were not migrated.

#### Fix
- **`data/migrate-on-cloud.js`**: New idempotent migration script using `@google-cloud/firestore` + `postgres` that UPSERTs all three collections (`users` → `auth_users`, `sessions` → `auth_sessions`, `players` → `players`) via bulk idempotent UPSERTs.
- Deployed as a **Google Cloud Run Job** (`gcloud run jobs deploy migrate-job`) to leverage the GCP service account's native Firestore access without requiring local credentials.
- Recovery verified: **2 auth_users**, **23 auth_sessions**, **56 players** confirmed in Postgres post-migration with valid bcrypt `$2b$10$` password hashes.

#### Deployment Fixes
- **Dockerfile scope**: The migration script is stored in `data/` to ensure it is included in the production Docker image's `COPY` directive.
- **Cloud Run Job**: `--execute-now --wait` flag used to execute, monitor, and verify the migration in a single atomic command.

#### Tests — **367/367 pass**, 0 failures.

---

## [9.0.0] - 2026-03-15

### V9 Stateless Architecture & Extracted React Hooks UI

Massive milestone release decoupling the vanilla JS game logic engines from their UI bindings, transitioning the backend to a fully stateless distributed cache, and purging legacy DOM manipulators.

#### Core Architecture
- **Stateless Upstash Redis Architecture**: `playerManager.js` completely rewritten to use a Redis cache as the primary traffic layer, flushing to Firestore only on debounce timeouts. Uses distributed locks (`SETNX`) to ensure horizontal scalability across multiple server instances.
- **Service Worker / PWA Support**: Implemented `vite-plugin-pwa` to cache core assets, icons, and JS bundles locally. Minimizes cold boot load times and provides a robust, installable manifest.
- **React Hooks UI Layer**: Eliminated the tightly-coupled `GameStore` logic. Fully extracted `useFarmEngine`, `useMatch3Engine`, `useBloxEngine`, `useHUDEngine`, and `useMergeEngine` to serve as pure, distinct data bridges.
- **Headless Engine Isolation**: The vanilla engines now run entirely headless, calculating game logic state purely, while the React UI layer pulls from the exposed custom Hooks.

#### Bug Fixes & Dead Code Pruning
- **Concurrency Locks**: Fixed a severe race-condition in `farm.js` where rapid clicking could bypass the queue and cause desynced watering timers or phantom crops.
- **Blox Drag Performance**: Refactored drag logic to fix severe frame lag and piece-dropping issues during cross-screen puzzle manipulation.
- **Dead Legacy Cleanups**: Safely deleted 4 obsolete vanilla files (`quest.js`, `store-ui.js`, `hud.css`, `store.css`) and gutted obsolete DOM manipulation queries out of `hud.js` following the UI migration to React.
- **Strict Lint Validation**: Cleared out all ghost variables and unused imports (`import React from 'react'`) from the codebase, satisfying strict native JSX ESLint constraints.
- **Save Data Wipe Prevention**: Fixed an architectural flaw where non-blocking read-routes could trigger a simultaneous synchronous `getPlayer()` initialization on server boot before the Redis/Firestore pipeline returned the actual save data, overwriting legitimate profiles with blank Level 1 bases. Added `ensurePlayerLoaded` to the authorization middleware.
- **HUD Engine Exception**: Fixed a legacy `G.animateGoldChange is not a function` Uncaught TypeError cascading from vanilla scripts during reward granting by piping a CustomEvent down to the new React `HUD` view to orchestrate `framer-motion` floating coin animations.

- **Match-3 Zombie State Leak**: Fixed an issue where the game would drop into `-1 MOVES`. Wrapped endgame sync in `try/finally` blocks and guarded the initialization step to prevent users from reviving and playing concluded sessions indefinitely.
- **Pet Naming Loop**: Fixed a bug where `pet.js` would continually prompt the user for their pet's name on launch, conflicting with the React onboarding flow.
- **Farm UI & UX Design Overhaul**: Redesigned the seed shop UI. Fixed horizontal tab truncation via `flex-wrap`, widened the Featured shelf to prevent text cut-offs, completely removed the redundant dual-coins HUD, and rehoused the 'Buy' quantity stepper into elegant glassmorphism pills to cure severe element clipping.

#### Tests — **342/342 pass**, 0 failures.

---

## [8.0.0] - 2026-03-15

### Architecture & Mobile UX Redesign

Comprehensive 9-fix architecture update targeting scalable distributed caching, offline fault tolerance, and compact mobile viewport optimization. 345/345 tests pass.

#### Critical Architecture & Caching
- **Upstash Redis Adapter** (`redisAdapter.js`): Implemented a complete read-through/write-through cache layer with `@upstash/redis` REST SDK. Features bulk pipeline loading on startup and gracefully degrades to in-memory maps if `UPSTASH_REDIS_URL` is omitted.
- **Distributed Nonce Deduplication** (`server.js`, `redisAdapter.js`): The `/api/batch` endpoint now uses atomic Redis `SET NX` with a 5-minute TTL to guarantee strict cross-instance idempotency for batched client requests.
- **Batch Endpoint Refactor** (`server.js`): Eliminated the `fetch(localhost)` antipattern. Batched requests now use direct Express `app.handle()` dispatch with mock req/res objects, cutting overhead and eliminating connection exhaustion.

#### High Reliability Fixes
- **Graceful Shutdown Drain** (`playerManager.js`): PM2/Docker SIGTERM now explicitly `await Promise.all()` on all pending player operation lock chains before flushing to Firestore, preventing data corruption during deployment restarts.
- **Offline Simulation Guard** (`game-logic.js`): Added strict `isNaN` and bounds-checking for the `_lastSeen` timestamp in `processOfflineActions`. Prevents runaway integer-overflow simulations caused by corrupted client clocks or payload tampering.

#### Mobile UX & Responsive UI
- **Framer Motion Shop Drawer** (`MobileShopDrawer.jsx`, `BottomNav.jsx`): Replaced the massive full-screen farm shop with a swipeable, 3-snap (30%, 55%, 90%) bottom-sheet drawer using `framer-motion`. Added a contextual "Bag" icon to the bottom nav when the inventory is non-empty.
- **Compact Viewport HUD** (`HUD.jsx`, `base.css`): At `< 500px` height, the HUD collapses into a single-line layout, shrinking resource pills and tucking actions into a "⋮" overflow menu to maximize vertical game space.
- **Responsive Navigation** (`base.css`): Bottom nav height dynamically shrinks from `68px` → `56px` → `48px` on compact screens by fading out text labels and reducing icon scales.
- **GameStore & Touch Targets** (`GameStoreUI.jsx`, `base.css`): Constrained store modal to `calc(100dvh - 100px)` preventing overflow clipping on iOS. Injected `@media (pointer: coarse)` CSS enforcement guaranteeing `44px` minimum touch targets across all major action buttons.

---

## [7.6.0] - 2026-03-14

### Phase 18: Final Quality Audit & Verification
Conducted a full pass to ensure `0` ESLint warnings and `0` failing tests across the entire 346 test suite.
- **chore(lint):** Configured `eslint.config.mjs` to systematically ignore prefixed `_` unused variables and `e`/`_err` catch handlers.
- **fix(vanilla):** Removed obsolete imports, unused DOM queries, and ghost variables across `hud.js`, `farm.js`, `main.js`, `match3.js`, `merge.js`, `blox.js`, and `pet.js`.
- **fix(auth):** Renamed shadowed exception variables to satisfy strict linting.
- **fix(tests):** Removed an overly strict `ux.test.js` regex assertion that erroneously forced `main.js` to retain an unused `safeShowModal` import.
- **fix(shared):** Fixed a memory leak in the swipe-to-dismiss toast notification (`onPointerUp`) by explicitly detaching window `pointer` and `touch` listeners upon release.

### Phase 17: Mobile Optimizations - Core Lifecycle & Event Loops
Completed a thorough pass on reducing background CPU wakeups and React overhead for mobile devices.

- **feat(shared):** Exposed `HUB.onScreenChange` event bus for localized game lifecycle management.
- **perf(pet):** Unified `autoWaterTimer` and `_digestionTimer` into a single 1s tick that halts via `document.hidden`.
- **perf(trivia):** Replaced hard 16ms JS `requestAnimationFrame` timer bar with GPU-accelerated CSS `transition`.
- **perf(match3):** Implemented double-buffered global `_dirtyPool` to achieve zero-allocation array caching during cascade loops.
- **perf(merge):** Explicitly suspend `_cooldownTimer` when `HUB.currentScreen` changes.
- **perf(farm):** Hooked `stopLocalGrowthTick` into new `onLeave` lifecycle to stop polling off-screen.
- **perf(react):** Downgraded React-bound `framer-motion` tap/hover events on `HUD.jsx` and `BottomNav.jsx` to sub-millisecond CSS pseudo-classes.
- **perf(react):** Wrapped `App.jsx` modal callbacks in `useCallback` to prevent breaking `React.memo` on child components.
- **perf(ui):** Added `loading="lazy" decoding="async"` to massive SVG and pet asset renders in `PetRoomUI.jsx` to unblock rasterizer threads.

## [7.5.0] - 2026-03-14
### Mobile Performance Phase 2 (Zero-GC & Responsive UI)

Comprehensive 9-fix architecture update targeting mobile latency, garbage collection spikes, and perceived performance in weak network environments. 346/346 tests pass.

#### Critical Fixes

- **Zero-GC Drags** (`merge.js`, `blox.js`): Replaced JS-driven `transform` string concatenations with CSS Custom Properties (`--x`, `--y`). Introduced Sub-pixel Caching to ignore sub-0.5px movements, drastically reducing main-thread heap allocations and eliminating drag stutters.
- **Match-3 Matrices** (`match3/engine.js`): Rewrote `findMatches` and `resolveBoard` algorithms from functional array-mapping to purely imperative loops over a pre-allocated single `Uint8Array` buffer. Added heuristic skipping to ignore clean rows/columns, cutting computational complexity to O(k).
- **Global GC & RAM Reset** (`main.jsx`, `shared.js`): Implemented strict Event-Driven Garbage Collection on route changes (`hub:route-leave`). React unmounts trigger targeted sweeps of `VanillaShell` closures, preventing memory bloat across hour-long sessions.

#### High Fixes

- **CSS Bypass Modals** (`GameStoreUI`, `QuestUI`, `PetInfoUI`): Refactored heavy React modal dialogs to use `createPortal`. Toggling a global `.modal-open` class on `document.body` bypasses full-tree reconciliations and rigidly disables background scroll/interaction on iOS Safari.
- **Page Visibility RAF Controller** (`shared.js`): Intercepted native `requestAnimationFrame`. When the app goes to the background (`document.hidden`), all RAF loops are completely suspended and queued, eliminating phantom battery drain and preventing logic de-sync on iOS.
- **Double Buffering Trivia Loads** (`trivia.js`): Offloaded image decoding for trivia cards. Images are fetched and fully instantiated in memory (`new Image().src = ...`) before being swapped onto the active DOM layer, eradicating the "white flash" image load phase.

#### Medium/UX Fixes

- **Optimistic Sync Queue** (`playerManager.js`, client APIs): Firestore writes are now decoupled from UI interaction. Operations like planting seeds instantly update the local state while network requests are batched and deferred. On failure, a graceful auto-rollback occurs.
- **Exclusive DOM Events** (`index.css`, `index.html`): Enforced `touch-action: pan-x pan-y` at the root while locking specific game canvases with `touch-action: none`. Added `user-select: none` globally to prevent accidental text-selection highlights during fast tapping.
- **Farm DOM Flattening** (`farm.js`): Re-engineered the Farm grid matrix to eliminate nested flexboxes/divs. Moved layout control entirely to CSS Grid with Just-In-Time `will-change: transform` injection during harvest animations.

---

## [7.5.0] - 2026-03-14

### Mobile Performance Phase 2 (Zero-GC & Responsive UI)

Comprehensive 9-fix architecture update targeting mobile latency, garbage collection spikes, and perceived performance in weak network environments. 346/346 tests pass.

#### Critical Fixes

- **Zero-GC Drags** (`merge.js`, `blox.js`): Replaced JS-driven `transform` string concatenations with CSS Custom Properties (`--x`, `--y`). Introduced Sub-pixel Caching to ignore sub-0.5px movements, drastically reducing main-thread heap allocations and eliminating drag stutters.
- **Match-3 Matrices** (`match3/engine.js`): Rewrote `findMatches` and `resolveBoard` algorithms from functional array-mapping to purely imperative loops over a pre-allocated single `Uint8Array` buffer. Added heuristic skipping to ignore clean rows/columns, cutting computational complexity to O(k).
- **Global GC & RAM Reset** (`main.jsx`, `shared.js`): Implemented strict Event-Driven Garbage Collection on route changes (`hub:route-leave`). React unmounts trigger targeted sweeps of `VanillaShell` closures, preventing memory bloat across hour-long sessions.

#### High Fixes

- **CSS Bypass Modals** (`GameStoreUI`, `QuestUI`, `PetInfoUI`): Refactored heavy React modal dialogs to use `createPortal`. Toggling a global `.modal-open` class on `document.body` bypasses full-tree reconciliations and rigidly disables background scroll/interaction on iOS Safari.
- **Page Visibility RAF Controller** (`shared.js`): Intercepted native `requestAnimationFrame`. When the app goes to the background (`document.hidden`), all RAF loops are completely suspended and queued, eliminating phantom battery drain and preventing logic de-sync on iOS.
- **Double Buffering Trivia Loads** (`trivia.js`): Offloaded image decoding for trivia cards. Images are fetched and fully instantiated in memory (`new Image().src = ...`) before being swapped onto the active DOM layer, eradicating the "white flash" image load phase.

#### Medium/UX Fixes

- **Optimistic Sync Queue** (`playerManager.js`, client APIs): Firestore writes are now decoupled from UI interaction. Operations like planting seeds instantly update the local state while network requests are batched and deferred. On failure, a graceful auto-rollback occurs.
- **Exclusive DOM Events** (`index.css`, `index.html`): Enforced `touch-action: pan-x pan-y` at the root while locking specific game canvases with `touch-action: none`. Added `user-select: none` globally to prevent accidental text-selection highlights during fast tapping.
- **Farm DOM Flattening** (`farm.js`): Re-engineered the Farm grid matrix to eliminate nested flexboxes/divs. Moved layout control entirely to CSS Grid with Just-In-Time `will-change: transform` injection during harvest animations.

---

## [7.4.0] - 2026-03-14

Comprehensive 9-fix performance and UI reliability audit specifically targeting mobile layout thrashing, frame drops, and garbage collection pauses. 346/346 tests pass.

#### Critical Fixes

- **CPU Bound Deep Cloning** (`merge.js`, `match3.js`): Replaced slow, blocking `JSON.parse(JSON.stringify(board))` calls with native `structuredClone()`, cutting frame drops on budget devices during state commits.
- **Effects.js WAAPI** (`effects.js`): Particle systems (coins, droplets) rewritten to use the Web Animations API (`Element.animate()`). Animation calculation is offloaded to the browser's Compositor Thread, avoiding main-thread math and `setTimeout` GC spikes.
- **Merge D&D Layout Thrashing** (`merge.js`): The blurred Ghost Element caused severe GPU strain. Removed `backdrop-filter: blur`, replacing it with `translate3d` and `opacity: 0.8`. Added array caching for match-targets (`_cachedMatchTargets`) on `pointerdown` to completely eliminate DOM `getBoundingClientRect()` calls inside `requestAnimationFrame`.

#### High Fixes

- **React Span Re-renders** (`HUD.jsx`): Subscribing to bulk `shared` state triggered global React re-renders on arbitrary background game updates. Implemented atomic shallow selectors (`s.resources?.gold`, `s.slices.shared?.energy.current`), isolating the HUD update cycle.
- **Blox Responsive Thrashing** (`main.js`, `match3.css`, `blox.css`): Eliminated JS `resize` event listeners that calculated cell sizes pixel-by-pixel. Transferred responsibility to CSS using `clamp()` fluid typography, zeroing out script overhead.
- **Gacha Orphan Timers** (`merge.js`): Navigating away from the Merge screen mid-gacha roll previously leaked `setTimeout` callbacks that tried to manipulate a non-existent DOM. Added strict `HUB.currentScreen === 4` checks before phase execution.

#### Medium/UX Fixes

- **Touch Swipe Conflicts** (`merge.js`): Integrated `HUB.swipeBlocked` on `pointerdown` to prevent Discord/OS back-gestures from firing while actively dragging a merge item.
- **Paint Flashing** (`match3.css`, `blox.css`): Heavy `box-shadow` CSS animations replaced with `::after` pseudo-elements. Only the `opacity` property is animated, allowing GPU-accelerated compositing without repaints.
- **Flash of Unstyled Text** (`base.css`): Hard reliance on custom fonts caused invisible texts on slow 3G. Injected native system fallbacks (`system-ui, -apple-system, sans-serif`) globally.

#### Tests — **346/346 pass**, 0 failures.

---

## [7.3.5] - 2026-02-28

### Security & Architecture Audit — Phase 2

Comprehensive 20-fix audit covering security, architecture, bugs, code duplication, performance, and input validation. 10 files modified, 345/345 tests pass.

#### Critical Fixes

- **Discord iframe blocked** (`server.js`): `X-Frame-Options: SAMEORIGIN` prevented the app from loading inside Discord's Activity iframe. Replaced with CSP `frame-ancestors` directive scoping to Discord domains (`discord.com`, `*.discord.com`, `*.discordsays.com`).
- **Rate limiter ordering** (`server.js`): `authLimiter` and `defaultLimiter` were mounted after `/api/token` route — token exchange was unprotected against brute-force. Moved rate limiter `app.use()` calls before all route handlers.
- **`calcGoldReward` DoS** (`game-logic.js`): Unbounded `while` loop could freeze the event loop with crafted extreme scores (e.g., `9e15`). Added `SCORE_CAP = 50_000` iteration guard.

#### High Fixes

- **Duel interval leak** (`trivia.js`): `setInterval` for duel room cleanup lacked `.unref()`, preventing clean process exit in tests and after SIGTERM.
- **Missing `blox.activeGame`** (`game-logic.js`): `createDefaultPlayer()` didn't include `activeGame: false` in `blox` — field was `undefined` for new players from Firestore.
- **Quest merge-board crash** (`questRoutes.js`): `/api/quests/submit` validated merge items on `p.merge.board` without calling `hydrateMergeBoard()`. Firestore-stored boards (JSON strings or objects with numeric keys) caused silent validation failures.
- **SDK bundle path** (`server.js`): In production (Docker), `sdkBundleCache` read from `src/vanilla/` which isn't copied to the container. Added fallback: `public/js/` → `src/vanilla/`.

#### Medium Fixes

- **Wildcard CORS** (`server.js`): `Access-Control-Allow-Origin: *` replaced with scoped Discord origins in production (discord.com, ptb, canary, discordsays). Dev mode retains permissive CORS.
- **Gold duplication exploit** (`farm.js`): `/api/farm/buy-seeds` accepted `amount: -1` from client, producing negative cost → free gold. Now validates as positive integer, capped at 1000.
- **Vestigial `farm.coins`** (`farm.js`): Removed dead `coins: p.farm.coins` from `/api/farm/plant` response.
- **Duplicated chain-unlock** (`mergeRoutes.js`): Identical 10-line unlock block in `/gacha` and `/free-pull` extracted to `tryUnlockChain()` helper.
- **No error handler** (`server.js`): Added global Express 5 error handler (`app.use((err, …) => …)`) to catch unhandled async rejections.
- **Rate limiter cleanup** (`rateLimit.js`): 3 separate `setInterval` cleanup loops (one per limiter) consolidated to single module-level interval via `ensureCleanup()`.
- **Leaderboard O(N)** (`leaderboard.js`): Full player-map sort on every request replaced with 30-second TTL cache for both Match-3 and Blox leaderboards.

#### Low Fixes

- **`plotId` validation** (`farm.js`): 4 endpoints (plant, water, harvest, uproot) now validate `plotId` as integer within bounds, preventing `undefined` plot access.
- **Missing `room.inventory`** (`game-logic.js`): `createDefaultPlayer()` room object now includes `inventory: []`.
- **Duel history O(N)** (`trivia.js`): `.unshift()` (O(N)) replaced with `.push()` (O(1)) + reverse-on-read in history endpoint.
- **Graceful shutdown** (`playerManager.js`): `process.exit()` moved to `.then()` chain after flush, ensuring log message completes before exit.

#### Tests — **345/345 pass**, 0 failures.

---

## [7.3.4] - 2026-02-28

### Security & Architecture Audit

Comprehensive 19-fix audit covering security, architecture, bugs, code duplication, performance, and maintainability. 10 files modified, 388/388 tests pass.

#### Critical Fixes

- **Blox gold exploit** (`blox.js`): `/api/blox/end` lacked session validation — players could call `/end` repeatedly without `/start` for infinite gold. Added `activeGame` flag set in `/start`, validated and cleared in `/end`.
- **Anti-cheat score ceilings** (`blox.js`, `match3.js`): Client-reported scores were accepted without bounds. Added plausibility ceilings (Blox: 10K, Match-3: 30K) — suspiciously high scores are logged and rejected with zero reward.
- **Rate limiter bypass** (`server.js`): `authLimiter` and `defaultLimiter` were mounted AFTER route handlers, so they never fired. Moved rate limiter `app.use()` calls before route mounts.
- **Variable shadowing** (`questRoutes.js`): `for (const req of order.requirements)` shadowed the Express `req` parameter. Renamed to `requirement`.

#### Architecture & Scalability

- **Firestore factory** (`playerManager.js`): Replaced module-level `new Firestore()` with lazy `initFirestore()` called from `start()`. Prevents import-time crashes and enables mocking in tests.
- **LRU player cache** (`playerManager.js`): `players` Map now has a 10,000-entry eviction threshold. Oldest entries are flushed to Firestore before deletion.
- **Shared helpers** (`game-logic.js`): Extracted `randInt()`, `pick()`, `calcTokenReward()` — eliminated 3 duplicate definitions across `mergeRoutes.js` and `questRoutes.js`.
- **Recurring events** (`game-logic.js`): `getActiveEvents()` now normalizes event dates to the current year for `recurring: true` events, including year-crossing support (Dec→Jan).

#### Bug Fixes

- **Merge coordinate validation** (`mergeRoutes.js`): Added `validCoord()` check for `/merge/merge` and `/merge/trash` — prevents out-of-bounds board access. Fixed validation order (check coords before accessing cells).
- **Pet name XSS** (`resources.js`): `cleanName` now strips HTML tags via regex before truncation.
- **Leaderboard room filter** (`leaderboard.js`): Removed broken room filter stub that used incorrect user-ID prefix matching on an already-filtered array.
- **Dead `farm.coins`** (`game-logic.js`, `playerManager.js`): Removed `coins: 0` from `createDefaultPlayer()` and `farm.coins = 0` from v2 migration — field was never read or written by any route.
- **`isDirectRun` detection** (`server.js`): Fragile `endsWith` path check replaced with `URL` comparison for Windows compatibility.
- **Stale test** (`farm.test.js`): `schemaVersion` assertion updated from 6 to 7 (v7 room migration).

#### DRY & Performance

- **Gacha token calculation** (`match3.js`, `blox.js`): Inline token-threshold loops replaced with shared `calcTokenReward(score)` from `game-logic.js`.
- **Leaderboard rank** (`match3.js`): Replaced O(N log N) full sort + `findIndex` with O(N) count of higher scores.

#### Security Hardening

- **CORS headers** (`server.js`): Added `Access-Control-Allow-Origin`, methods, headers, and `OPTIONS` preflight handler.
- **Security headers** (`server.js`): Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Timer cleanup** (`middleware/rateLimit.js`): Added `.unref()` to `setInterval` cleanup timer so tests can exit cleanly.

#### Tests — **388/388 pass**, 0 failures.

---

## [7.3.3] - 2026-02-24

### Prod-Readiness Audit

Comprehensive codebase audit with systematic root cause investigation — 6 issues found and fixed.

#### Featured Seeds Shelf Repositioned (`farm.css`)

- **Root cause**: `position: sticky; top: 0` in normal document flow pushed farm tiles down instead of sitting to their left.
- **Fix**: Changed to `position: absolute; right: calc(100% + 12px); top: 0` — mirrors the `.farm-panel` pattern on the right. Farm tiles remain centered.
- Mobile fallback (≤640px): `position: static` with horizontal strip layout.

#### Dead Import Removed (`main.js`)

- `import { GameStore as MonetizationStore } from "./store-ui.js"` — imported but never used.

#### Farm Panel Tabs Fixed (`farm.js`)

- Badges, Journal, and Season tabs had no `onclick` handlers wired in `init()`. Only Inventory and Shop worked.
- **Fix**: Added `switchFarmTab()` bindings for all 3 missing tabs.

#### HUD Gold Counter Stabilized (`HUD.jsx`)

- `key={shared.gold}` on `<motion.span>` caused a full remount + animation on every gold change.
- **Fix**: Replaced with a plain `<span>`.

#### Pet Profile Mood & Affection Restored (`PetInfoUI.jsx`)

- **Regression**: Pet profile card was missing 🧠 Mood meter, mood labels, and 💕 Affection display.
- **Fix**: Added animated progress bar with color-coded labels (Ecstatic → Miserable) + affection level pill.

#### Tests — **345/345 pass**, 0 failures.

---

## [7.3.2] - 2026-02-24

### Farm Onboarding Redesign & Interface Audit

- Redesigned new-player onboarding: 30-second core loop with invisible tutorials, early rewards, gradual system reveal.
- Fixed Featured Seeds block pushing farm tiles vertically.
- Amount stepper UX improvements for seed purchases.
- Tab state indicators made more visible and intuitive.
- Pet behavior corrected during sleep mode.
- Critical seed planting bug fixed.

---

## [7.3.1] - 2026-02-24

### Deployment Bug Fixes

Critical post-deployment fixes for the Discord Activity environment.

- **CSP font loading**: Google Fonts blocked by Discord's `style-src` CSP. Bundled `@fontsource/bungee`, `@fontsource/nunito`, `@fontsource/varela-round` as local npm packages.
- **Pet naming bug**: Name assigned during onboarding not persisted to pet data.
- **401 Unauthorized errors**: Discord SDK token not forwarded to API calls — fixed auth initialization order.
- **React hooks order** (`PetInfoUI.jsx`): `useState` calls placed after early return → Error #310. Moved all hooks to top of component.
- **Loading screen**: Race condition between `bootComplete` flag and React mount resolved.

---

## [6.2.2] - 2026-03-14

### Fixed
- **Match-3 Validation Null Issue**: Fixed a crash where navigating away during early Match-3 board animations caused a `TypeError: Cannot read properties of null (reading 'classList')` by adding explicit DOM node existence checks.
- **Match-3 UI Deadlock**: Fixed an issue where navigating away from a game of Match-3 mid-animation left the internal engine state permanently greyed-out and frozen (`isAnimating = true`) causing the game to be unplayable when returning.

---

## [7.3.0] - 2026-02-24

### Feature Release — Retention, Monetization Ready, Pet Room

11 new features across retention, monetization readiness, scalability, and pet room.

#### Retention Hooks (`farm.js`, `match3.js`, `blox.js`, `trivia.js`)

- **Post-Game Cards**: End-of-game summary with stats, streaks, and "tomorrow preview" (Zeigarnik Effect).
- **Weekly Stat Tracking**: Aggregated weekly performance metrics.
- Integrated into game-over handlers for all 4 game modes.

#### Streak & Booster Systems (`game-logic.js`, `playerManager.js`, `farm.js`)

- Daily login streaks with escalating multipliers and grace period.
- Timed farm boosters: 2× growth speed, 1.5× harvest value. Visual booster button.

#### Achievement System (`routes/achievements.js`, `game-logic.js`)

- Server-validated achievement tracking with tiered milestones. New route: `/api/achievements/*`.

#### Events & Season Pass (`routes/events.js`, `routes/seasonpass.js`)

- Time-limited seasonal events with bonus objectives. New route: `/api/events/*`.
- Season pass scaffold: free + premium tracks. New route: `/api/seasonpass/*`.

#### Rate Limiting (`server.js`)

- Per-route rate limiting to prevent API abuse.

#### Pet Room — Phase 3 (`PetRoomUI.jsx`, `game-logic.js`)

- **4×4 decoratable room grid** — place decorations earned from Merge pipeline.
- `ROOM_DECORATIONS` config: 10+ items with rarity, emoji, and stat bonuses (`happinessRate`, `affectionXpMult`, `fullnessRate`).
- `computeRoomBonuses()` — pure function for aggregate bonuses.
- New React component: `PetRoomUI.jsx` with grid rendering, tile tap placement, and inventory management.

#### Farm Panel Expansion (`farm.js`)

- Badge rendering (`renderBadges()`), Journal tab for crop discovery (`renderJournal()`), Season pass progress (`renderSeasonPass()`).

---

## [7.2.1] - 2026-02-24

### Bug Fix Sprint — Game Menus & Interactions

- **Quest list**: Opening quest log caused other content to vanish — z-index/visibility conflicts resolved.
- **Gacha rolls**: Failing due to incorrect token validation — auth header forwarding fixed.
- **Trivia buttons**: Answer buttons not responding — event delegation fix.
- **Shop button**: 🛒 button not opening seed shop — wired to `GameStoreUI` state.
- **Pet SVG flickering**: Roam→dock transition flicker — CSS transition timing adjusted.
- **Pet tap behavior**: Repeated tapping no longer toggling profile rapidly; click-outside dismiss added.
- **Seeds shop UX**: Improved scrolling, card sizing, and touch targets.

#### Tests — **345/345 pass**, 0 failures.

---

## [7.2.0] - 2026-02-24

### Added — Player Experience Overhaul (P2 + P3)

#### Progressive Seed Unlocking (`game-logic.js`, `farm.js`)

- 8 crops now have `unlockCondition` fields: 2 always-available (🍓 Strawberry, 🫐 Blueberry), 6 with progression gates (first harvest, first quest, gold earned, plots bought, total harvests, days active).
- `getUnlockedSeeds(playerStats)` — pure function evaluates conditions against player stats.
- Locked crops display as 🔒 cards with condition labels in the seed shop.
- Unlock celebration toasts on first discovery.

#### Featured Seed Shelf (`farm.js`, `htmlContent.html`)

- 4-seed rotating shelf above farm plots, changes every 4 hours via deterministic seeded shuffle.
- Prioritizes 1 untried seed + 3 profit-ranked familiar seeds.
- Live countdown timer with auto-refresh on rotation boundary.

#### New Themes (`soft-fantasy.css`, `minimal-calm.css`, `shared.js`)

- 🌸 **Soft Fantasy** — dark plum/rose/lavender dreamscape palette with purple-tinted dreamy glows.
- 🍃 **Minimal Calm** — stone white/sage zen palette. Disables neon glows, increases border-radius, reduces particle intensity by 50%.
- `VALID_THEMES` expanded to 6 options: `neon-night`, `cozy-day`, `soft-fantasy`, `minimal-calm`, `seasonal`, `auto`.
- **Seasonal auto-rotation**: `_getSeasonalTheme()` maps month → theme (Spring → soft-fantasy, Summer → cozy-day, Autumn/Winter → neon-night).

#### Juice Animations

- **Trivia** (`trivia.css`): `triviaCardFlip` 3D entrance, `triviaCorrectPop` button expand, `triviaStreakGlow` escalating gold glow, stagger-fade answer buttons (50ms each).
- **Merge** (`merge.css`): `mergePull` magnetic attraction, `mergeCollide` brightness flash, `gachaCapsuleDrop` double bounce entrance, `gachaReveal` rarity light spear.
- **Pet** (`pet.css`): `petTapBounce` squash+jump on tap, `petHeartBurst` expanding heart particles, `petDustPuff` direction-change dust cloud.
- **Match-3** (`match3.css`): `m3SwapSpring` overshoot bounce on valid gem swap.
- **Blox** (`blox.css`): `bloxPlaceBounce` squash+settle on piece placement.

### Fixed (Audit)

- **Theme CSS not bundled**: `main.jsx` was missing imports for `soft-fantasy.css` and `minimal-calm.css` — themes had no visual effect at runtime.
- **Seasonal theme flash**: `index.html` early theme script set `data-theme="seasonal"` raw (no CSS rules), causing flash of unstyled content. Now resolves to actual month-based theme before first paint.

### Tests

- **343/343 pass**, 0 failures (+21 new tests: progressive unlocking, featured shelf, themes, juice keyframes, audit regressions).

---

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
