# Changelog

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

### API

- Added `GET /api/player/snapshot` and `POST /api/player/mutate` as the new task-oriented player sync layer for Farm, Blox, Match-3, Merge, Pet, Room, and quest actions.
- Added normalized inventory payloads covering seeds, harvested crops, merge board item counts, room inventory, and rewards, replacing the old `harvested`/`inventory` split on the React client.
- Added durable room placement/pickup mutations plus compatibility `/api/pet/room/place` and `/api/pet/room/pickup` wrappers.
- Added a test-only in-memory player store for Playwright web-server runs when `DATABASE_URL` is intentionally empty.

### Operations

- Rewrote README and `.env.example` for Telegram/VPS operations.
- Updated CI and deploy workflows to build the Vite app, run cleanup checks, push the GHCR image, and restart the VPS compose stack.
- Removed the retired client bundle build from package scripts and Docker production image assembly.
- Isolated the production compose project as `ccgh` with unique app/PostgreSQL/Redis containers, localhost-only app publishing, and no bundled Caddy container.
- Added a manual Caddy provisioning workflow for the shared VPS host proxy route `games.tri.mom -> 127.0.0.1:18080`.
- Hardened deployment safety checks so the CC-GH workflow refuses reserved bot/Caddy ports and avoids destructive global Docker pruning.
- Required Docker Compose v2 for deployment and stopped falling back to legacy Python `docker-compose` v1, avoiding the `ContainerConfig` recreate failure on VPS deploys.
