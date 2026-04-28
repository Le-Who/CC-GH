# Changelog

## Unreleased

### Client

- Replaced the old Pet Room tab with Cozy Yard, an original mixed-pet idle collector with food bowls, placeable goodies, classic-hour server visits, gifts, petbook, album metadata, mementos, worn/fixable goodies, expansion, remodels, and helper companion configuration.
- Added a persisted light/dark UI theme toggle. The light theme remains the default, while the dark theme reuses the older matte Garden Shelf surface treatment across Hub chrome, Garden Shelf modals/sheets, shared glass menus, and in-game HUD overlays.
- Centralized the shared glass UI tokens for Hub stats, game menu overlays, HUDs, Garden Shelf panels, and bottom navigation, with reduced mobile blur and reduced-transparency fallbacks to keep the Telegram webview readable and cheaper to composite.
- Fixed Garden Shelf offline rewards disappearing after a brief flash by preserving locally generated `offlineEarnings` through authoritative `garden.sync` payload refreshes until the player explicitly collects the reward.
- Fixed Gem Crush post-move visual desync by starting delayed Pixi effect tweens when their delay reaches zero and by avoiding fallback emoji/icon drawing on top of textured Puzzling Potions pieces.
- Moved Bubbo onto the shared `GameShell` overlay/HUD path instead of its one-off shell wrapper so start, live, and pause states use the same glass menu implementation as Blox, Gem Crush, and Merge.
- Refreshed Garden Shelf with the new transparent plant sheet, shelf/sign/bottom-plank/cog art, an in-game settings panel for sound and English/Russian language switching, visible locked plant previews, watering-ready droplet indicators, and slower growth/economy pacing for a longer idle progression curve.
- Moved Garden Shelf level, plant, shelf, growth, and offline-earnings state into the shared player snapshot with a throttled `garden.sync` mutation and realtime propagation, leaving local storage as a fallback instead of the cross-device source of truth.
- Replaced the visible Farm game tab with a Garden Shelf port, including the original shelf/terrarium React UI, sprite-sheet plant rendering, plant shop, stash/inventory flow, watering, upgrades, offline earnings, and Garden Shelf assets under `public/games/garden-shelf/`.
- Removed the duplicate Garden Shelf in-game `Gold Balance` / `Current Phase` header, adapted the shared Hub resource strip for Garden-specific `Gold`, `Garden Lv`, and `Plants`, and made Garden Shelf purchases, sales, taps, passive income, and offline income use the same shared Hub gold balance as the other games.
- Fixed Bubbo pressure-row descent by carrying an explicit row-offset phase through pressure shifts, shot targeting, clusters, and scene rendering so newly inserted rows move the field down without horizontally rearranging existing bubbles.
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
- Extended Gem Crush with Puzzling Potions art, special row/column/blast/colour pieces, Star Drop token preservation, timed countdown finishing, and non-mutating invalid swaps.
- Added the Pixi helper dependencies needed for the tracked game asset/runtime path: GSAP, `@pixi/ui`, `@pixi/sound`, `pixi-filters`, `typed-signals`, and Spine Pixi v8 support.

### API

- Added server-owned `yard` player state, schema migration from old Pet/Room starter data, deterministic offline visitor simulation, `meta.yardCatalog`, realtime yard sync, and the new `yard.*` mutate action family. Old `/api/player/mutate` `pet.*`, `quest.*`, and `room.*` gameplay actions were replaced, while legacy room placement wrapper endpoints now return 410 replacement errors.
- Added `buildId` to `/api/config` and `/api/health`, with no-store headers on `/api/config`, while preserving existing public endpoint names and player mutate contracts.
- Added `garden.goldDelta` to the player mutate API so Garden Shelf gold changes update shared player resources with the same insufficient-gold guard as the other Hub games.
- Extended the internal `bubbo.start` and `bubbo.sync` current-game payloads with optional `board`, `seed`, `waveIndex`, `rowOffset`, and `pressure` fields while keeping the existing mutate action names and older snapshot fallbacks.

### Operations

- Propagated the GitHub commit SHA as `BUILD_ID`, `VITE_BUILD_ID`, and `APP_BUILD_ID` through Docker build, Compose runtime, and the deploy workflow.
- Removed obsolete benchmark/check scratch scripts, legacy README/changelog stubs, and stale eslint report artifacts from the active tree, then tightened the cleanup allowlist.

### Tests

- Added unit and Playwright coverage for Cozy Yard default creation, Pet/Room starter migration, deterministic visits, rare visitor conditions, gifts/mementos, durability/fix, expansion/remodel validation, invalid `yard.*` payload rejection, and Room-tab replacement UI smoke checks.
- Added mobile Playwright glass UI smoke coverage for the light and dark Hub surfaces plus Garden settings, Garden seed shop, Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Cozy Yard start/live/pause menus.
- Added Garden Shelf Playwright coverage proving generated offline rewards stay visible until the player clicks `Collect Gold`.
- Added Match-3 scene coverage for delayed effect tween startup and a mobile consecutive-swap screenshot after real cascades to guard against stuck top-row overlay pieces.
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
