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
| Edge proxy | Caddy |

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
- `CUSTOM_DOMAIN`
- `PUBLIC_APP_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `ADMIN_TOKEN`

The compose stack also uses `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` to provision the local database service.

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

The deployment target is one app container behind Caddy, one PostgreSQL service, and one Redis service.

```bash
docker compose pull app
docker compose up -d --remove-orphans
```

GitHub Actions builds and pushes the GHCR image, copies `docker-compose.yml` to the VPS, writes only Telegram/VPS environment values, and restarts compose.

## Cleanup Gate

`pnpm run test:cleanup` scans active runtime, docs, workflow, and test files for retired platform names. Historical references belong only in archive files such as `legacy_changelog.md`.
