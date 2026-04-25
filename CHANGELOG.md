# Changelog

## Unreleased

### Client

- Added tracked Bubbo Bubbo and Puzzling Potions asset bundles under `public/games/` and preloaded them through the Pixi game host before scene construction.
- Completed Bubbo Bubbo as a pressure shooter with seeded procedural waves, continuous descent, pressure row shifts, same-color cluster popping, multi-color support-cut island drops, visible falling clusters, and pressure-aware danger/overflow finishing.
- Reworked Farm, Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Pet Room into one immersive game shell that hides Hub chrome during play, keeps only compact in-game HUD controls visible, and opens pause/menu/result surfaces as overlays over the playfield with explicit Exit-to-Hub navigation.
- Hardened Farm, Blox, Gem Crush, Merge, and Bubbo pointer gestures with a shared pointer-session state machine covering pointer ids, derived taps, drag thresholds, blur/visibility cleanup, and requestAnimationFrame-coalesced drag overlays.
- Extended Gem Crush with Puzzling Potions art, special row/column/blast/colour pieces, Star Drop token preservation, timed countdown finishing, and non-mutating invalid swaps.
- Added the Pixi helper dependencies needed for the tracked game asset/runtime path: GSAP, `@pixi/ui`, `@pixi/sound`, `pixi-filters`, `typed-signals`, and Spine Pixi v8 support.

### API

- Extended the internal `bubbo.start` and `bubbo.sync` current-game payloads with optional `board`, `seed`, `waveIndex`, and `pressure` fields while keeping the existing mutate action names and older snapshot fallbacks.

### Tests

- Added Bubbo unit coverage for deterministic seeded waves, pressure row shifts, overflow/danger handling, continuous pressure progression, and disconnected multi-color island drops.
- Added pointer-session unit coverage for tap derivation, mismatched pointer ids, drag classification, and cancellation cleanup.
- Expanded Match-3 pure-engine coverage for specials, drop-token seeding, invalid swaps, and special-triggered moves.
- Updated Playwright minigame and gesture coverage for rapid Farm/Blox/Gem/Merge/Bubbo taps and drags, immersive compact-webview sizing across desktop and mobile Chromium, pause overlays without Hub chrome, Exit-to-Hub restoration, and playfield geometry dominance.

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
