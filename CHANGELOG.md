# Changelog

## Unreleased

### Client

- Moved live game clear/reward notices into the lower in-game HUD action log for Blox, Gem Crush, Merge, and Bubbo, and removed Bubbo's redundant live subtitle so the playfield is not covered during active shots.
- Reworked Garden Shelf plant action affordances so details and watering controls sit outside the plant art instead of overlapping the pots.
- Refined Cozy Yard HUD and visitor placement so bottom dock atlas icons no longer clip and layable visitor poses stay visually on their occupied decorations.
- Restored the Gacha Merge live Pixi scene by routing split-scene art lookups through the exported shared graphics manifest helper instead of a private runtime variable.
- Reduced Gacha Merge browser-runtime load by rendering the static Pixi board on demand, running the Pixi ticker only while merge feedback effects are active, loading only the requested Pixi scene builder at runtime, patching changed Merge board cells incrementally, and serializing pending Merge actions so free-tap claiming cannot overlap generator taps.
- Reduced Garden Shelf mobile overlay cost by disabling expensive blur on coarse pointers, containing overlay paint/layout work, deferring confetti to a dynamic effect import, and expanding the daily quest template reserve to reduce near-repeat assignments.
- Refined Cozy Yard mobile HUD and visitor staging: the activity pill now localizes active visitor counts, bottom dock labels render above icons, tool-drawer buttons no longer get covered by the activity chip, and decor-local visitor offsets are scaled before projection so pets stay visually attached to their decorations.
- Tightened Gem Crush live board fitting with a small measured HUD reserve buffer so the board stays clear of the top HUD on narrow mobile webviews.
- Added a shared Telegram game UX foundation: static game registry, adaptive per-game HUD descriptors, receipt-backed reliable action helpers, transient reward/status event feedback, Telegram Back Button handling, closing confirmation for active/pending runs, and hidden-Farm compatibility in the runtime registry.
- Refined live game surfaces for mobile Telegram play: Blox now previews optimistic placements and predicted line clears, Gem Crush restores snapshot runs before defaults and emits combo/match feedback, Merge uses server-derived cooldown timing plus generator source chips and safer valuable-item trash confirmation, Bubbo moves finish/settle controls into pause with resume/pressure/aim-assist cues, Brain Blitz records real answer elapsed time with a reveal phase, and Cozy Yard shifts more persistent HUD into an activity pill plus tool drawer.
- Split the monolithic Pixi scene module into per-game scene builders behind the existing stable `src/game-runtime/scenes.js` export surface, keeping Farm hidden but available for runtime compatibility.
- Fixed Garden Shelf plant-details affordances so the explicit details button does not steal ordinary tap-to-grow/harvest behavior, and fixed the production Garden chunk crash by reading Garden i18n inside each plant spot.
- Moved app-shell motion wrappers off the startup `framer-motion` dependency and replaced them with CSS transitions for profile popovers, active game frames, in-game HUDs, pause overlays, and transient event cards.
- Loaded the Telegram Mini App SDK progressively from the platform layer instead of preloading it in startup HTML, while preserving `window.Telegram.WebApp.initData` auth fallback, swipe locking, haptics, Back Button, and closing confirmation behavior.

- Added Garden Shelf daily quests as three daily portions of three moderately simple tasks, with deterministic daily rotation, endowed-progress cues, daily claimed state, and a HUD quest entry replacing the old Plants stat chip.
- Fixed Garden Shelf Level Up spam so rapid repeated taps send only one level-up mutation and cannot replay the reward modal, and adjusted the plant detail header so Income no longer sits under the close button.
- Fixed Cozy Yard layable goodie interactions so seated/stationary visitors stay pinned to the occupied decoration and render above it, while the HUD atlas icons now scale to match the large button affordances.
- Fixed the Gacha Merge full free-tap bank state so a capped bank shows a bank-full label instead of a misleading recharge timer.
- Added Garden Shelf quests with one-time claimed state, localized quest copy, reward claiming, and a Level Up reward modal while keeping quest styling lazy-loaded with the Garden game chunk instead of the startup CSS bundle.
- Added a compact profile popover in the Hub topbar and removed the always-visible profile strip so the main shell leaves more vertical room for live game surfaces.
- Refined Gacha Merge mobile live controls so the free-tap claim remains readable in the bottom action strip, the Pixi canvas exposes measured board geometry for smoke tests, and Items/Recipes/Exchange drawers stay reachable during active play.
- Constrained Cozy Yard placements and visitor motion to remodel-specific playzones for Morning Meadow, Moon Garden, and Tea House, preventing freely placed goodies or roaming pets from landing on non-playable background art.
- Reworked Cozy Yard into a standalone mobile-style yard screen: all food, goodies, shop, petbook, album, gift, repair, remodel, expansion, daily letter, helper, camera, sound, and settings interactions now open as in-game HUD surfaces instead of below-stage menus.
- Added Cozy Yard free goodie placement and movement with percent-based yard coordinates, a placement confirmation dock, migrated legacy slot fallbacks, and the new `yard.moveGoodie` mutation.
- Added the Cozy Yard HUD sprite assets under `public/games/companion-yard/HUD.*` and wired the runtime controls to the PNG sheet.
- Refined Garden Shelf touch feedback: growing plants can be tapped slightly more often than mature earners, detailed-view arrows sit beside the focused plant, the garden XP chip turns into a Level Up action when ready, and tap rewards now surface clearer gold/XP feedback.
- Reworked Gacha Merge live controls so Items and Recipes open their library overlays instead of pause, while the source dock groups generator, daily, token, and trash actions with clearer labels and generation hints.
- Refreshed Cozy Yard production art with split interactive goodie assets, split companion sprites, pose-specific common/uncommon/rare visitor sprites, and the new Meadow, Tea House, and Moon Garden backgrounds.
- Repaired Bubbo as a single gameplay layer: pending pressure rows are stored as playable state, rendered and targeted as virtual row `-1`, pressure shifts consume the pending row before generating the next one, sparse boards refill back to at least three playable rows without pressure penalty, and the menu now offers Classic 36-shot and Timed 90-second unlimited-shot runs.
- Added capped lightweight Bubbo falling motion with deterministic stagger, sway, spin, wobble, and reduced-motion fallback while keeping effects on the existing Pixi ticker/particle path.
- Added a durable Cozy Yard outbox for `yard.*` actions using IndexedDB with localStorage fallback, entity-level conflict locks, retry on timeout/network errors, reconnect/focus/visibility drains, and pending bowl/slot/shop/gift visuals instead of tap-then-rollback UX.
- Split the Pixi runtime and scene builders out of the initial React app chunk through a lazy `LazyPixiSceneHost`, with tab hover/focus/pointerdown preloading and a recoverable load-error panel for failed dynamic imports.
- Added Neko-like hybrid Cozy Yard visitor presentation: pets now move in from yard edges, settle onto goodie activity anchors, perform item-specific poses, lightly roam around the selected object, and leave through the yard instead of appearing as static badges inside a slot.
- Added manifest-backed Cozy Yard asset resolution so `graphics.games.companionYard.backgrounds.<remodel_id>` can override remodel backgrounds while direct replacement of `public/games/companion-yard/backgrounds/<remodel_id>.png` remains supported.
- Replaced the old Pet Room tab with Cozy Yard, an original mixed-pet idle collector with food bowls, placeable goodies, classic-hour server visits, gifts, petbook, album metadata, mementos, worn/fixable goodies, expansion, remodels, and helper companion configuration.
- Added a persisted light/dark UI theme toggle. The light theme remains the default, while the dark theme reuses the older matte Garden Shelf surface treatment across Hub chrome, Garden Shelf modals/sheets, shared glass menus, and in-game HUD overlays.
- Centralized the shared glass UI tokens for Hub stats, game menu overlays, HUDs, Garden Shelf panels, and bottom navigation, with reduced mobile blur and reduced-transparency fallbacks to keep the Telegram webview readable and cheaper to composite.
- Reworked pause overlays into concise recovery menus with accessible dialog focus, 44px-plus touch targets, one primary Resume action, one inline status row, and no duplicated HUD stat cards, leaderboards, setup panels, or repeated finish controls during active runs.
- Fixed Gem Crush live layout so the Pixi board reserves the measured HUD height, stays clear of the stats strip on wide/short webviews, and redraws on container or Telegram viewport resize without requiring pause/resume.
- Fixed Garden Shelf offline rewards disappearing after a brief flash by preserving locally generated `offlineEarnings` through authoritative `garden.sync` payload refreshes until the player explicitly collects the reward.
- Fixed Gem Crush post-move visual desync by starting delayed Pixi effect tweens when their delay reaches zero and by avoiding fallback emoji/icon drawing on top of textured Puzzling Potions pieces.
- Moved Bubbo onto the shared `GameShell` overlay/HUD path instead of its one-off shell wrapper so start, live, and pause states use the same glass menu implementation as Blox, Gem Crush, and Merge.
- Refreshed Garden Shelf with the new transparent plant sheet, shelf/sign/bottom-plank/cog art, an in-game settings panel for sound and English/Russian language switching, visible locked plant previews, watering-ready droplet indicators, and slower growth/economy pacing for a longer idle progression curve.
- Moved Garden Shelf level, plant, shelf, growth, and offline-earnings state into the shared player snapshot with a throttled `garden.sync` mutation and realtime propagation, leaving local storage as a fallback instead of the cross-device source of truth.
- Replaced the visible Farm game tab with a Garden Shelf port, including the original shelf/terrarium React UI, sprite-sheet plant rendering, plant shop, stash/inventory flow, watering, upgrades, offline earnings, and Garden Shelf assets under `public/games/garden-shelf/`.
- Removed the duplicate Garden Shelf in-game `Gold Balance` / `Current Phase` header, adapted the shared Hub resource strip for Garden-specific `Gold`, `Garden Lv`, and `Plants`, and made Garden Shelf purchases, sales, taps, passive income, and offline income use the same shared Hub gold balance as the other games.
- Fixed Bubbo pressure-row descent by carrying an explicit row-offset phase through pressure shifts, shot targeting, clusters, and scene rendering so newly inserted rows move the field down without horizontally rearranging existing bubbles.
- Reworked Gacha Merge live play around a bottom control dock: generator tap, gacha, free pull, daily free taps, trash, and pause are available after start without covering the board.
- Replaced category-specific Gacha Merge generator cards with one random generator and added alchemy-style recipe merges such as `sand + lightning -> glass`.
- Added a manual PWA update manager that compares injected client build ids with uncached `/api/config`, unregisters stale service workers, clears runtime caches, and reloads once with a cache-busting build query.
- Versioned Pixi `/games/*` asset URLs with the current build id so tracked Bubbo Bubbo and Puzzling Potions art refreshes cleanly after deploys.
- Added scene-local Gem Crush animation queues from `attemptMatch3Move().steps`, including swap ghosts, cascade pulses, fall/fill tweens, invalid-swap nudges, and input locking while cascades resolve.
- Re-tuned Gem Crush cascade timing toward faster parallel Match-3 motion: shorter swap/input locks, compact clear/fall/fill stages, subtler easing, and reduced per-cell staggering so cascades read as one smooth board event instead of a slow serial queue.
- Extended Gem Crush cascade presentation with staged board snapshots, textured fall/fill pieces, special-clear backfill, and repeated Star Drop bottom-token collection so tokens that fall into the bottom during backfill auto-credit instead of sitting on the board.
- Added Building Blox line-wipe effects from authoritative `clear.rows` and `clear.cols`, clearer cell flash passes, stronger clear ripples, sparkle feedback, and tray refill settle cues.
- Refined Bubbo Bubbo with distinct sky/berry colors, a larger mobile playfield, pre-spawned pressure rows above the visible field, constant path-distance projectile travel, smoothed pressure descent in the Pixi ticker, pressure-row insertion without board snap-back, and a lower-glare cozy pink/green play palette.
- Reworked Gacha Merge into a compact touch-first menu, lower thumb-reachable live board, live trash/pause HUD controls, larger readable item tokens, and manifest-ready item icon slots for future production assets.
- Removed generic in-game `Menu` labels and the duplicate Blox `Sound` button in favor of explicit setup, end-run, stop-play, trash, pause, and exit actions.
- Added tracked Bubbo Bubbo and Puzzling Potions asset bundles under `public/games/` and preloaded them through the Pixi game host before scene construction.
- Completed Bubbo Bubbo as a pressure shooter with seeded procedural waves, continuous descent, pressure row shifts, same-color cluster popping, multi-color support-cut island drops, visible falling clusters, and pressure-aware danger/overflow finishing.
- Reworked Farm, Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Cozy Yard into one immersive game shell that hides Hub chrome during play, keeps only compact in-game HUD controls visible, and opens pause/menu/result surfaces as overlays over the playfield with explicit Exit-to-Hub navigation.
- Hardened Farm, Blox, Gem Crush, Merge, and Bubbo pointer gestures with a shared pointer-session state machine covering pointer ids, derived taps, drag thresholds, blur/visibility cleanup, and requestAnimationFrame-coalesced drag overlays.
- Fixed Gem Crush touch reliability by capturing pointer gestures on the Pixi canvas target, disabling hit capture on decorative Pixi layers, and resolving long mobile swipes by direction instead of the final release cell.
- Reworked Building Blox drag-and-drop so tray pieces are centered, the carried piece stays aligned to the original grab point even after scaling to board cells, board placement uses the ghost anchor, and the snapped footprint preview remains separate from the finger-following piece.
- Moved Blox and Gem Crush playfields into larger fullscreen mobile layouts with lower thumb-reachable board placement and refreshed the shared game shell/menu palette toward the cozy pastel nature direction from the Figma design brief.
- Exposed authoritative Gacha Merge Yard goodie drops in the live HUD/pause status and removed the stale room-drop client field from merge feedback.
- Extended Gem Crush with Puzzling Potions art, special row/column/blast/colour pieces, Star Drop token preservation, timed countdown finishing, and non-mutating invalid swaps.
- Added the Pixi helper dependencies needed for the tracked game asset/runtime path: GSAP, `@pixi/ui`, `@pixi/sound`, `pixi-filters`, `typed-signals`, and Spine Pixi v8 support.

### API

- Reworked Garden Shelf daily quest selection to rotate each 3x3 daily group by deterministic lanes across days, reducing adjacent-day repeats without changing rewards, ids, claim reset semantics, or the three-section unlock order.
- Added shared Garden daily quest state normalization and progress recording to the player snapshot so daily quests reset by day while preserving same-day claimed ids across syncs.
- Hardened `garden.sync` against stale post-level-up payloads so an older client cannot reopen a level reward that was already claimed.
- Pruned Merge exchange claim buckets to a small recent retention window in both the player mutate path and the legacy merge route path.
- Preserved Garden Shelf `claimedQuests` through `garden.sync` with server-side id sanitization so claimed quest rewards stay shared across devices.
- Added commit-success hooks to `withPlayerLock()` and moved Farm/resource analytics event inserts behind them so OCC retry losers cannot double-record side effects.
- Extended `/api/health` with actual Redis availability, `player_stats_view` refresh state, and explicit process-local Brain Blitz duel-room scope/counts while preserving the legacy `postgres` and `redis` booleans.
- Added optional `clientActionId` and `intentServerTime` metadata to `POST /api/player/mutate`, plus per-player idempotency receipts capped at 200 entries or 72 hours. Duplicate `clientActionId + action + payloadHash` requests replay the saved result metadata without repeating side effects, while the same id with a different payload returns a terminal conflict.
- Made the HTTP Yard mutation path server-time-authoritative so request `payload.now` cannot advance visits, gifts, rewards, or daily letters; direct test/helper calls can still inject a clock through function options.
- Extended Cozy Yard goodie catalog data with activity anchors, capacity, layering, condition variants, and backward-compatible visitor motion fields while preserving the existing `yard.*` mutate action names.
- Added server-owned `yard` player state, schema migration from old Pet/Room starter data, deterministic offline visitor simulation, `meta.yardCatalog`, realtime yard sync, and the new `yard.*` mutate action family. Old `/api/player/mutate` `pet.*`, `quest.*`, and `room.*` gameplay actions were replaced, while legacy room placement wrapper endpoints now return 410 replacement errors.
- Added `buildId` to `/api/config` and `/api/health`, with no-store headers on `/api/config`, while preserving existing public endpoint names and player mutate contracts.
- Refactored legacy locked route handlers so `withPlayerLock()` callbacks return structured mutation results and HTTP responses are sent only after the lock resolves.
- Tightened Gacha Merge mutations around server-time daily free pull/free-tap resets, full-board pull rejection before spend/stamp, explicit Yard goodie rewards, and trash receipts.
- Added `garden.goldDelta` to the player mutate API so Garden Shelf gold changes update shared player resources with the same insufficient-gold guard as the other Hub games.
- Extended the internal `bubbo.start` and `bubbo.sync` current-game payloads with optional `board`, `pendingRow`, `seed`, `waveIndex`, `rowOffset`, `pressure`, `mode`, `timeLeft`, and `shotsFired` fields while keeping the existing mutate action names and older snapshot fallbacks.

### Operations

- Ran an objective indefinite epoch perf loop using `perf:guard` as source of truth. Kept loop-based Cozy Yard visitor/activity selection, compact generated runtime manifest output, and a per-call Garden Shelf/Farm cheap-refuel id cache; rejected Yard, Bubbo, Merge, and Player micro-targets after repeat guard regressions or non-reproducible p95, and stopped only after the explicit finalization request without loosening budgets or changing gameplay semantics.
- Ran an indefinite conservative route-CSS perf loop using `perf:guard` as source of truth. Moved game-specific styles into lazy chunks for Merge, Brain Blitz, hidden Farm compatibility, Garden Shelf, Cozy Yard, and Bubbo, cutting guarded startup CSS from `94,016B` raw / `17,160B` gzip to `67,267B` raw / `12,672B` gzip without loosening budgets or changing gameplay.
- Ran a conservative Garden/UI follow-up perf loop using `perf:guard` as source of truth. Kept a Yard simulation total-visit cache and per-root asset-entry cache after repeat guard wins, kept small CSS/DOM cleanups as non-counted UI cleanup, rejected snapshot/Blox micro-optimizations after noisy or regressed p95, and stopped before gameplay-semantic changes.
- Ran the Garden/Merge/Yard conservative follow-up perf loop with repeat-3 guard evidence. Reverted the Yard and Merge micro-optimizations after p95 regressions, kept split Pixi scene import pruning as code-quality cleanup, repaired guard-discovered Merge browser cadence/long-task misses with on-demand Pixi rendering, scene-specific runtime chunks, incremental board patching, and action serialization, and stopped without loosening budgets or changing gameplay semantics.
- Ran a conservative Telegram UX performance loop using `perf:guard` as source of truth. Kept startup shell and Telegram SDK lazy-loading wins plus a Merge hydration null fast path; stopped by rule after three consecutive rejected/sub-threshold attempts without loosening budgets or changing gameplay semantics.
- Restored the tracked asset replacement guide and tightened the game asset sheet brief around the current generated-runtime/manual-manifest contract, including legacy and hidden art surfaces that are not live override paths today.
- Reduced guarded startup JS by splitting broad Vite vendor chunks into dependency-family chunks and deferring the realtime client module until the app boot effect, while keeping Pixi and runtime art lazy.
- Fixed Playwright browser perf parity so `perf:guard:browser` builds production Vite assets before starting the test-mode server, preventing browser smoke runs from leaving a dev/test build that fails `perf:guard:build`.
- Reduced startup font payload by replacing broad Fontsource imports with explicit WOFF2 Latin, Latin-ext, and Cyrillic faces, cutting guarded startup CSS while preserving the existing English/Russian typography and browser perf budgets.
- Kept the production build guard inside the existing startup CSS budget by moving Garden-only quest/level-up styling into the lazy Garden Shelf CSS chunk instead of loosening `perf:guard:build`.
- Optimized perf-guard hot paths without changing gameplay semantics: Bubbo pressure/shot traversal and normalization, Merge generator empty-cell selection, current-schema player migrations, snapshot achievement metadata, and runtime asset entry scanning now do less repeat allocation while keeping existing budgets intact.
- Added per-entry runtime asset encoding so Cozy Yard keeps editable PNG source/fallback art while generated runtime Yard assets ship as compact WebP-only files under the existing build payload budgets.
- Added an ordered SQL migration runner backed by `schema_migrations`, keeping `db.js` schema creation as a first-start compatibility fallback for legacy bootstrap objects.
- Backfilled SQL schema history through `migrations/002_player_state_and_stats.sql` and narrowed `db.js` bootstrap to migration-first compatibility fallback.
- Aligned CI branch filters with the deploy/current remote HEAD branch `codex/telegram-pixi-vps-migration`.
- Added `pnpm run perf:guard`, a gameplay hot-path performance budget runner with p50/p95/max timings and an ignored JSON report under `artifacts/perf/`.
- Hardened `perf:guard` with focused `--suite` runs, report summary metadata, and Player JSON migration/snapshot budgets separate from SQL migration history.
- Expanded the performance guard into Node hot-path, Vite build-artifact, and Chromium runtime layers with `perf:guard:build`, `perf:guard:browser`, `perf:guard:all`, repeated focused suite support, and `docs/PERF_GUARD.md` research notes.
- Extended perf guards for the generated asset pipeline with Node runtime-asset suites, build-time `/assets-runtime` manifest/payload budgets, content-hash filename checks, and browser asset-runtime coverage in `perf:guard:browser`.
- Propagated the GitHub commit SHA as `BUILD_ID`, `VITE_BUILD_ID`, and `APP_BUILD_ID` through Docker build, Compose runtime, and the deploy workflow.
- Removed obsolete benchmark/check scratch scripts, legacy README/changelog stubs, and stale eslint report artifacts from the active tree, then tightened the cleanup allowlist.

### Tests

- Added focused Garden daily quest coverage for adjacent-day variety, no day-plus-three replay, claim reset safety, reward tier balance, and daily section ordering.
- Updated browser smoke coverage for the Bubbo live HUD subtitle removal and reran mobile minigame, Garden Shelf, Cozy Yard, and perf browser guards around the new HUD/action-log flow.
- Added regression coverage for Garden Shelf mobile overlay blur removal, dynamic confetti loading, expanded daily quest rotation, Gacha Merge split-scene asset helpers and mobile scene smoke, Cozy Yard localized activity status/bottom-label geometry/decor-anchored visitors, i18n keys used through local `text()` helpers, and stabilized mobile minigame smoke around hidden Yard tools and Blox HUD selection.
- Added Telegram game UX foundation coverage for the hidden Farm registry contract, reliable action id policy, adaptive HUD descriptors, null local HUD state, Match-3 snapshot-first restoration, Merge server clock derivation, and real Trivia question timing.
- Added focused gameplay regression coverage for Blox non-mutating placement previews, Bubbo pressure labels and aim assist, split Pixi scene runtime assertions, and the Garden details-label i18n path caught by the browser guard.
- Added Garden Shelf unit coverage for daily quest reset/portion unlocking/endowed progress, ready quest counts, stale sync after level-up, and rapid Level Up click suppression in mobile Playwright.
- Added Cozy Yard unit and mobile Playwright coverage for pinned stationary visitor motion and HUD-screen readability, plus Merge exchange-claim retention coverage.
- Added unit and Chromium Playwright coverage for Garden quest id persistence, duplicate-safe Garden Level Up requests, the Level Up reward modal, Merge mobile dock/readable free taps, exchange/drawer discovery updates, and Cozy Yard playzone clamping.
- Verified the conservative perf loop with full Node tests plus `perf:guard:all`, covering Node, build-budget, and Chromium runtime guards without loosening budgets.
- Added Cozy Yard unit and Playwright coverage for free-coordinate goodie placement, `yard.moveGoodie`, HUD-launched in-game screens, and mobile placement confirmation.
- Added asset-pipeline coverage for WebP-only runtime entries and hardened the runtime asset browser smoke around Cozy Yard lazy loading.
- Added `tests/operational-debt.test.js` for SQL migration discovery/application, mutation commit hooks, Redis health reporting, and `player_stats_view` refresh status capture.
- Expanded operational debt coverage for complete numbered SQL migration history and the rule that locked route callbacks must not write Express responses directly.
- Added Merge regression coverage for random generator output, recipe Yard goodie rewards, server-time free pull/free-tap resets, full-board spend guards, trash receipts, and live HUD reward text.
- Added Cozy Yard long-idle regression coverage for capped offline returns, reload replay prevention, and future timestamp clamping on reconnect.
- Added `tests/perf-guard.test.js` to keep Blox, Gem Crush, Merge, Bubbo, Garden Shelf, Brain Blitz, and Cozy Yard hot-path budgets explicit in the Node suite.
- Extended perf guard tests to require unique suite ids, valid p95/p99-tail budgets, focused-run support, summary metadata, raw max spike diagnostics, and Player JSON current/legacy migration plus snapshot suites.
- Added asset-pipeline perf contract coverage for pipeline entry scanning, generated-manifest parsing, Pixi bundle mapping, runtime asset build budgets, and required content-hashed `/assets-runtime` payloads.
- Added build-budget tests and a Chromium runtime perf smoke for startup Pixi laziness, Gacha Merge live-frame cadence, long tasks, and long animation frames when supported.
- Added Playwright coverage proving per-game pause menus preserve active gameplay context, stay compact, hide active Gem Crush mode changes, keep Resume as the primary recovery action, and work across Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Cozy Yard.
- Added unit/store coverage for HTTP Yard time authority, idempotent Yard purchases/gift collection/daily letters, terminal client-action conflicts, outbox timeout/network persistence, success removal, storage restore, and companion-config coalescing.
- Verified production builds keep Pixi out of the startup HTML and initial app chunk, moving the runtime to async chunks while keeping the initial app chunk below the previous Vite large-chunk warning threshold.
- Added unit and Playwright coverage for Cozy Yard activity anchors, old active-visitor snapshot normalization, broken-goodie visitor attraction, multi-visitor large-goodie anchors, manifest background overrides, layered visitor rendering, and selected-visitor photo capture.
- Added unit and Playwright coverage for Cozy Yard default creation, Pet/Room starter migration, deterministic visits, rare visitor conditions, gifts/mementos, durability/fix, expansion/remodel validation, invalid `yard.*` payload rejection, and Room-tab replacement UI smoke checks.
- Added mobile Playwright glass UI smoke coverage for the light and dark Hub surfaces plus Garden settings, Garden seed shop, Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Cozy Yard start/live/pause menus.
- Added Garden Shelf Playwright coverage proving generated offline rewards stay visible until the player clicks `Collect Gold`.
- Added Match-3 scene coverage for delayed effect tween startup and a mobile consecutive-swap screenshot after real cascades to guard against stuck top-row overlay pieces.
- Added Gem Crush Playwright coverage for live HUD overlap and immediate Pixi board recentering after viewport resize on desktop and mobile Chromium, with gesture tests now using the scene's actual board geometry.
- Added shell/theme regression guards proving the matte Garden Shelf palette exists as a global dark theme and that players can switch it from the shared topbar.
- Extended Garden Shelf Playwright coverage for the new responsive asset art, locked plant previews, watering indicator, and Russian language switch on desktop and mobile Chromium.
- Added update-manager core tests for build-id comparison, reload guarding, corrupt guard recovery, and cache-busting URL generation.
- Added unit/e2e coverage for Garden Shelf shared-gold spending and the removal of the duplicate in-game gold header.
- Added Garden Shelf Playwright smoke coverage and replaced old Farm UI e2e expectations with the new visible game list.
- Added Bubbo coverage for sky/berry color separation and sky-cluster popping without adjacent berry false positives.
- Added Blox mutate coverage proving `blox.place` returns authoritative cleared row/column indices and clears the saved board synchronously.
- Added Match-3 coverage that cascade animation step snapshots end at the final board and invalid swaps expose no animation steps.
- Added Match-3 engine coverage for bonus-block backfill, repeated Star Drop bottom-token crediting, and cascade board snapshots that end at the final board.
- Added Bubbo unit coverage for deterministic seeded waves, pressure row shifts, overflow/danger handling, continuous pressure progression, and disconnected multi-color island drops.
- Added pointer-session unit coverage for tap derivation, mismatched pointer ids, drag classification, and cancellation cleanup.
- Added Blox scene geometry coverage for capture-point anchored dragging, centered fallback pickup, board-scale ghost alignment, and ghost-anchor board targeting.
- Expanded Match-3 pure-engine coverage for specials, drop-token seeding, invalid swaps, and special-triggered moves.
- Updated Playwright minigame and gesture coverage for rapid Farm/Blox/Gem/Merge/Bubbo taps and drags, long Gem Crush touch swipes, immersive compact-webview sizing across desktop and mobile Chromium, pause overlays without Hub chrome, Exit-to-Hub restoration, and playfield geometry dominance.

## [11.0.0] - 2026-04-24

### Telegram Mini App and VPS Runtime

- Replaced the old embedded-activity runtime with a Telegram-first React/Vite shell and PixiJS 8 game host.
- Added production auth through `Authorization: tma <Telegram initData>` with server-side init-data validation and canonical `acct:<uuid>` account ids.
- Added dev-only auth through `Authorization: dev <stable-dev-user-id>` gated by `DEV_AUTH_ENABLED=true` and disabled in production.
- Added account identity tables, migration SQL, and `scripts/migrate-accounts.mjs` with `--dry-run`, `--apply`, and `--verify` modes.
- Switched realtime authentication to Socket.IO handshake auth and added monotonic `player_sync` sequence handling.
- Standardized VPS deployment around app, PostgreSQL, Redis, and Caddy services.
- Added a platform cleanup guard that fails active files containing retired platform residue outside archive files.

### Client

- Replaced the runtime shell with typed React tabs, Telegram safe-area CSS variables, haptic helpers, authenticated API client, and realtime client.
- Added reusable `PixiGameHost` and initial Pixi scenes for Farm, Blox, Match-3, and Merge.
- Kept Trivia React-first while preserving the game hub navigation contract.
- Rebuilt the game surface around a shared Zustand hub, normalized inventory, richer Pixi scenes, Farm Bag/shop/journal/season panels, Blox tray play, Match-3 mode play, Merge generators/trash/free taps, Trivia solo/duel controls, and the animated Pet Room.
- Stabilized Pixi v8 lifecycle so active scenes receive state updates without full remounts and clean up ticker/listener/canvas state on tab changes.
- Added a Telegram play-mode layout that prioritizes canvas height in compact desktop and mobile webviews, hides nonessential profile chrome during board games, and keeps the game frame clear of the bottom nav.
- Reworked Blox, Match-3, and Merge drag/aim feedback so pointer movement updates lightweight Pixi overlay layers instead of rebuilding the whole scene tree on every move.
- Added Bubbo Bubbo as a new Pixi bubble-shooter tab with bank-shot aiming, projectile motion, cluster popping, drop scoring, and compact HUD integration.

### API

- Added `GET /api/player/snapshot` and `POST /api/player/mutate` as the new task-oriented player sync layer for Farm, Blox, Match-3, Merge, Pet, Room, and quest actions.
- Added normalized inventory payloads covering seeds, harvested crops, merge board item counts, room inventory, and rewards, replacing the old `harvested`/`inventory` split on the React client.
- Added durable room placement/pickup mutations plus compatibility `/api/pet/room/place` and `/api/pet/room/pickup` wrappers.
- Added a test-only in-memory player store for Playwright web-server runs when `DATABASE_URL` is intentionally empty.
- Added server-backed Bubbo run lifecycle actions (`bubbo.start`, `bubbo.sync`, `bubbo.end`), schema migration defaults, and bounded reward calculation.

### Operations

- Rewrote README and `.env.example` for Telegram/VPS operations.
- Updated CI and deploy workflows to build the Vite app, run cleanup checks, push the GHCR image, and restart the VPS compose stack.
- Removed the retired client bundle build from package scripts and Docker production image assembly.
- Isolated the production compose project as `ccgh` with unique app/PostgreSQL/Redis containers, localhost-only app publishing, and no bundled Caddy container.
- Added a manual Caddy provisioning workflow for the shared VPS host proxy route `games.tri.mom -> 127.0.0.1:18080`.
- Hardened deployment safety checks so the CC-GH workflow refuses reserved bot/Caddy ports and avoids destructive global Docker pruning.
- Required Docker Compose v2 for deployment and stopped falling back to legacy Python `docker-compose` v1, avoiding the `ContainerConfig` recreate failure on VPS deploys.
- Removed the obsolete Compose `version` attribute and added cleanup for stale failed app-recreate containers named like `*_ccgh-app` before `docker compose up`.
- Moved Blox pure engine and piece definitions into server-copied `game-logic/` modules so production containers no longer import missing `src/game-core/*` files at startup.
- Added Pixi pointer drag/swipe interactions for Blox, Match-3, and Merge, with canvas gesture isolation, ghost previews, match highlights, and reduced-motion-aware React transitions.
- Added desktop/mobile Playwright coverage for compact play-mode canvas sizing and Bubbo smoke rendering.
- Added opt-in UI audio with `public/assets/manifest.json` fallbacks, plus `ASSET_REPLACEMENT_GUIDE.md` for replacing icons, pet art, scene graphics, and sound effects.
- Reworked Playwright e2e startup to use a fresh test port/build, replaced stale legacy auth assertions, and added canvas drag/swipe smoke coverage.
