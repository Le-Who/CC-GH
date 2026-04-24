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

### Operations

- Rewrote README and `.env.example` for Telegram/VPS operations.
- Updated CI and deploy workflows to build the Vite app, run cleanup checks, push the GHCR image, and restart the VPS compose stack.
- Removed the retired client bundle build from package scripts and Docker production image assembly.
- Isolated the production compose project as `ccgh` with unique app/PostgreSQL/Redis containers, localhost-only app publishing, and no bundled Caddy container.
- Added a manual Caddy provisioning workflow for the shared VPS host proxy route `games.tri.mom -> 127.0.0.1:18080`.
- Hardened deployment safety checks so the CC-GH workflow refuses reserved bot/Caddy ports and avoids destructive global Docker pruning.
