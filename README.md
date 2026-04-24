# Game Hub Telegram Mini App

CC-GH is a five-game Telegram Mini App running on a VPS Docker stack. The client is a React/Vite shell with PixiJS game surfaces, authenticated REST APIs, and authenticated Socket.IO sync.

## Stack

| Layer | Runtime |
| --- | --- |
| Client shell | React 19, Vite, Telegram Mini App SDK |
| Game rendering | PixiJS 8 |
| API | Express 5 |
| Realtime | Socket.IO |
| Database | Self-hosted PostgreSQL |
| Cache/nonce/rate limit | Self-hosted Redis |
| Edge proxy | Host-level Caddy on the VPS |

## Games

- Cozy Farm: server-authoritative economy, offline simulation, quests, achievements, and season progress.
- Building Blox: Pixi board surface backed by shared pure puzzle logic.
- Gem Crush: Pixi board surface with preserved saved modes and scoring contracts.
- Gacha Merge: server-validated board state, generators, inventory, and free-tap allowance.
- Brain Blitz: React-first trivia flow with Telegram sharing/start-param friendly UX.

## Auth Contract

Production requests must send:

```http
Authorization: tma <Telegram initData>
```

The server validates init data with `TELEGRAM_BOT_TOKEN`, resolves the Telegram user to a canonical account id (`acct:<uuid>`), and ignores caller-supplied user ids for authorization. Local development can use:

```http
Authorization: dev <stable-dev-user-id>
```

That path only works when `DEV_AUTH_ENABLED=true` and `NODE_ENV` is not `production`.

## Environment

Copy `.env.example` and set:

- `PORT`
- `APP_HOST_PORT`
- `CUSTOM_DOMAIN`
- `PUBLIC_APP_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `ADMIN_TOKEN`

The compose stack also uses `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` to provision the local database service. In production, GitHub Actions writes `/opt/game-hub/.env` from repository secrets; do not commit production `.env` files.

## Development

```bash
pnpm install
pnpm dev
pnpm run dev:server
```

Useful checks:

```bash
pnpm run build
pnpm test
pnpm run test:cleanup
docker build -t game-hub-ci .
```

## Account Migration

Create a PostgreSQL dump and Redis data backup before applying the account migration.

```bash
pnpm run migrate:accounts -- --dry-run
pnpm run migrate:accounts -- --apply
pnpm run migrate:accounts -- --verify
```

The migration creates `accounts` and `account_identities`, maps every existing player row to a canonical `acct:<uuid>` id, preserves `players.data`, and stores the previous player id as a `legacy` identity for lookup.

Rollback is operational: restore the PostgreSQL dump and Redis volume backup taken before `--apply`.

## Deployment

The deployment target is an isolated `ccgh` Docker Compose project on the same VPS as `gemaibotv2`. CC-GH does not run its own Caddy container. The app binds only to localhost (`127.0.0.1:${APP_HOST_PORT:-18080}`), while the host-level Caddy route proxies `https://games.tri.mom` to that local port.

Required GitHub Actions secrets for this repository:

- `VPS_HOST`, `VPS_USERNAME`, `VPS_SSH_KEY`, `VPS_PORT`
- `CUSTOM_DOMAIN` (`games.tri.mom`)
- `PUBLIC_APP_URL` (`https://games.tri.mom`)
- `APP_HOST_PORT` (`18080`)
- `TELEGRAM_BOT_TOKEN` (the same token as the Telegram bot that launches the Mini App)
- `TELEGRAM_BOT_USERNAME` (`b0b_bot`)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `ADMIN_TOKEN`

Run the manual `Provision CC-GH Caddy Route` workflow once after DNS points `games.tri.mom` at the VPS. It creates `/etc/caddy/sites-enabled/ccgh.caddy`, validates Caddy, and reloads it without touching the bot webhook container.

```bash
docker compose -p ccgh pull app
docker compose -p ccgh up -d --remove-orphans
```

GitHub Actions builds and pushes the GHCR image, copies `docker-compose.yml` to `/opt/game-hub`, writes only Telegram/VPS environment values, verifies that `APP_HOST_PORT` is not one of the reserved bot/Caddy ports, restarts only the `ccgh` compose project, and runs local plus public health checks.

## Cleanup Gate

`pnpm run test:cleanup` scans active runtime, docs, workflow, and test files for retired platform names. Historical references belong only in archive files such as `legacy_changelog.md`.
