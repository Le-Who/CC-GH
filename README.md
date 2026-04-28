# Game Hub Telegram Mini App

CC-GH is a multi-game Telegram Mini App deployed as an isolated VPS Docker Compose stack. The client is a React/Vite shell with PixiJS game surfaces, authenticated REST APIs, and authenticated Socket.IO state sync. PostgreSQL is the durable source of player state; Redis is used for cache, nonce, and rate-limit acceleration.

## Verified Stack

| Layer | Runtime |
| --- | --- |
| Client shell | React 19, Vite 7, Telegram Mini App SDK |
| Game rendering | PixiJS 8 |
| Client state helpers | Zustand, local browser storage for dev user id and Garden Shelf idle fallback; Garden Shelf progress and spendable gold are shared Hub player state |
| API | Express 5 |
| Realtime | Socket.IO |
| Durable storage | Self-hosted PostgreSQL |
| Cache / nonce / rate limit | Self-hosted Redis with in-memory fallbacks |
| Edge proxy | Host-level Caddy on the VPS |
| Package manager | pnpm 10.28.2 through Corepack |
| Container runtime | Node 22 Alpine image |
| Game asset helpers | Pixi Assets, GSAP, `@pixi/ui`, `@pixi/sound`, `pixi-filters`, `typed-signals`, and Spine Pixi v8 support libraries |

## Games

- Garden Shelf: ported React/Tailwind idle terrarium with responsive shelf/sign/bottom-plank art, transparent sprite-sheet plants, visible locked plant previews, slower growth/economy pacing, tap acceleration, watering-ready indicators, mature plant gold collection, stash/inventory placement, watering, evolution, offline earnings that stay visible until explicit collection, server-backed garden-state sync with local offline fallback, English/Russian Garden UI settings, and shared Hub gold for all spend/earn flows.
- Building Blox: Pixi board surface with tap fallback, tray-to-board drag, capture-point anchored carried pieces, separate snapped placement footprint previews, authoritative placement, row/column clear metadata, cell-flash plus line-wipe feedback, tray refill settle cues, saved state, rewards, and leaderboard reads.
- Gem Crush: Pixi board surface using tracked Puzzling Potions art, Classic, Timed, and Star Drop mode selection, tap-pair fallback, directional pointer-session swipe swapping, special row/column/blast/colour pieces, special-clear backfill, repeated Star Drop bottom-token auto-crediting, staged cascade board snapshots with textured fall/fill pieces, delayed tween cleanup that prevents stuck overlay pieces after cascades, short input locks, saved mode sync, and reward settlement.
- Gacha Merge: server-validated board state, drag/tap merging, pointer-session drag feedback, match highlights, compact touch-first generator menus, lower thumb-reachable rectangular board placement, live trash/pause HUD controls, larger manifest-replaceable item tokens, generators, crop fuel, gacha pulls, daily free pull, separate daily free-tap allowance, trash mode, and Cozy Yard goodie drops.
- Bubbo Bubbo: Pixi pressure shooter using tracked Bubbo Bubbo art, distinct five-color play, seeded procedural waves, larger mobile playfield, pre-spawned pressure waves above the visible field, smoothed continuous descent, stabilized pressure-row insertion, wall-bank aiming, constant path-distance projectile motion, same-color cluster popping, multi-color support-cut island drops, visible falling clusters, server-backed run lifecycle, and reward settlement.
- Brain Blitz: React-first trivia flow, category/difficulty selection, solo sessions, in-memory duel rooms, and the shared in-game pause/result overlay shell.
- Cozy Yard: mixed-pet idle collector replacing the old Pet Room tab. Players place food and goodies, wait server-simulated classic-hour visitor windows, collect gifts and mementos, build a petbook, store compact album-photo metadata, repair worn goodies, expand/remodel the yard, and configure a helper home companion with no real-money paths.

## Architecture

The production entry point is `server.js`.

Startup order:

1. Load environment through `dotenv/config`.
2. Initialize PostgreSQL with `initDb()` and create the runtime schema through `ensureDbSchema()`.
3. Initialize Redis if `REDIS_URL` exists.
4. Attach Socket.IO to the same HTTP server.
5. Refresh `player_stats_view` every 5 minutes.
6. Serve Vite `dist/` assets when present and fall back to the root `index.html` template for app routes.

Backend module boundaries:

- `middleware/auth.js` validates Telegram Mini App init data, gates dev auth, and resolves every request to a canonical account id.
- `accountManager.js` owns account and identity lookup/creation.
- `playerManager.js` owns player mutation serialization, JSON state migration, optimistic concurrency control, Redis write-through, and realtime emission.
- `db.js` owns the current runtime PostgreSQL schema creation.
- `redisAdapter.js` owns player cache helpers, nonce checks, pub/sub helper, and Redis lifecycle.
- `routes/*` expose game, economy, leaderboard, event, quest, achievement, season, and batch APIs.
- `game-logic/` contains shared pure domain logic. The root `game-logic.js` is a compatibility barrel and should remain stable.
- `src/platform/telegram.js`, `src/services/apiClient.js`, and `src/services/realtimeClient.js` form the client platform/auth/sync boundary.

Frontend flow:

1. `src/main.jsx` mounts `src/App.jsx`.
2. `App.jsx` initializes Telegram platform helpers, installs the PWA update manager, and fetches `/api/config`.
3. `src/game-state/useGameHub.js` loads `/api/player/snapshot` and sends all new-stack gameplay commands through `/api/player/mutate`.
4. `src/game-state/inventory.js` normalizes seeds, harvested crops, merge board counts, yard food/goodie inventories, and rewards so legacy Farm resources, Merge, Bag, and Cozy Yard use one inventory shape.
5. Garden Shelf mounts as a React game under `src/games/garden-shelf/` with sprite-sheet assets in `public/games/garden-shelf/`; Cozy Yard mounts as a React game under `src/games/companion-yard/` with starter assets in `public/games/companion-yard/`; Blox, Match-3, Merge, and Bubbo Pixi scenes mount through `PixiGameHost`.
6. `src/game-runtime/assetBundles.js` preloads tracked game art from `public/games/bubbo-bubbo/` and `public/games/puzzling-potions/` before Pixi scene builds, appends the current build id to `/games/*` asset URLs, then the scenes keep procedural fallbacks for missing optional art.
7. Pixi gameplay surfaces opt out of Telegram viewport swipes during pointer gestures and use the shared `createPointerSession()` state machine for pointer id tracking, derived taps, drag thresholds, blur/visibility cleanup, and RAF-coalesced drag visuals. `PixiGameHost` captures gestures on the active canvas target so embedded browser wrappers do not steal Pixi pointer input.
8. Gameplay enters a shared immersive mobile shell across Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Cozy Yard. Live play hides Hub chrome and keeps only a compact in-game HUD visible; pause/menu/result surfaces render as overlays over the playfield and expose explicit Exit-to-Hub navigation. Garden Shelf keeps its own idle-game shelf UI inside the hub tab.
9. Blox, Gem Crush, Gacha Merge, and Bubbo tune their Pixi board geometry for mobile thumb reach: playfields stay as large as the viewport allows, reserve room for compact HUD/tray controls, and sit lower in fullscreen play instead of pinning to the top edge. Bubbo renders the next pressure row just above the field and carries a row-offset phase through pressure shifts so row insertion descends existing bubbles without visual reordering.
10. Shared UI theme tokens in `src/index.css` drive Hub chrome, glass menus, Garden Shelf sheets/modals, and in-game HUD surfaces. The default light theme remains active, while the optional dark theme reuses the older matte Garden Shelf material language with lower mobile blur and a persisted topbar toggle.
11. Shared in-game menus use explicit action labels for pause, setup, end-run, trash, and exit controls; redundant generic `Menu` and duplicate `Sound` buttons are intentionally avoided.
12. `src/services/updateManager.js` manually registers the PWA service worker, polls uncached `/api/config`, compares the server `buildId` with the injected client build id, and clears service workers/caches once before reloading with a cache-busting query when a stale build is detected.
13. Socket.IO listens for `player_sync` events and ignores stale sequence numbers.

## Data And Control Flow

All production mutations should follow this shape:

```text
Telegram Mini App
  -> Authorization: tma <Telegram initData>
  -> Express route
  -> requireAuth
  -> resolveUser returns canonical account id
  -> withPlayerLock(accountId, handler)
  -> Postgres JSONB state update with _version OCC
  -> optional Redis cache write-through
  -> Socket.IO player_sync to the account room
```

`withPlayerLock()` is the mutation contract. It serializes mutations for a player inside one Node process with a promise-chain mutex, then uses `_version` optimistic concurrency control on `players.data` as the cross-instance safety net. Route handlers may be retried on OCC collision, so handler code must be safe when re-applied against fresh state. Fire-and-forget analytics inserts are currently accepted as duplicate-tolerant.

Client REST calls are made through `api()`, which adds Telegram or dev auth and uses an 8 second timeout by default. `createBatcher()` can group client requests into `/api/batch`; the server dispatches sub-requests through the Express router stack without network loopback, limits sub-request concurrency to 3, and uses nonce dedupe through Redis or an in-memory fallback.

## Auth Contract

Production requests must send:

```http
Authorization: tma <Telegram initData>
```

The server validates init data with `TELEGRAM_BOT_TOKEN`, applies `TELEGRAM_INIT_DATA_TTL_SECONDS` when set, resolves the Telegram user to `acct:<uuid>`, and ignores caller-supplied user ids for authorization.

Local development can use:

```http
Authorization: dev <stable-dev-user-id>
```

That path only works when `DEV_AUTH_ENABLED=true` and `NODE_ENV` is not `production`.

Socket.IO uses the same auth model through handshake data:

- `{ initData }` for Telegram.
- `{ devUserId }` for local development when dev auth is enabled.

## Persistence And Schema

PostgreSQL is the durable source of truth. Runtime schema creation currently lives in `db.js` and includes:

- `players(id text primary key, data jsonb, updated_at timestamptz)`
- `accounts`
- `account_identities`
- `player_events`
- `player_stats_view` materialized view plus indexes

`migrations/001_accounts_identity.sql` is an identity-table bootstrap migration, not a complete schema history. `scripts/migrate-accounts.mjs` migrates legacy player ids to canonical `acct:<uuid>` ids and supports `--dry-run`, `--apply`, and `--verify`.

Player JSON schema migrations are applied in `playerManager.js::applyMigrations()` during player mutation/loading. This is separate from SQL schema creation. Keep both migration paths in mind when changing saved state.

Redis is optional in local/test contexts but expected in the compose stack. It stores:

- player cache entries with a 24 hour TTL;
- batch nonce keys with a 5 minute TTL;
- distributed fixed-window rate-limit counters.

If Redis is unavailable, rate limits and nonce dedupe fall back to process-local memory. That fallback is acceptable for local and single-instance operation, but it is not distributed.

## API Surface

Public unauthenticated APIs:

- `GET /api/config` returns uncached client config plus `appVersion` and `buildId`.
- `GET /api/health` returns app liveness plus `version` and `buildId`.
- `GET /api/health/ping`
- `GET /api/content/crops`
- leaderboard reads

Authenticated gameplay APIs:

- New-stack player snapshot/mutations: `GET /api/player/snapshot`, `POST /api/player/mutate`
- Typed mutate actions include `garden.goldDelta`, `garden.sync`, `farm.plant`, `farm.harvest`, `farm.harvestAll`, `farm.buySeeds`, `farm.sellCrop`, `farm.buyPlot`, `farm.activateBooster`, `farm.buyTheme`, `farm.setTheme`, `merge.tap`, `merge.merge`, `merge.gacha`, `merge.freePull`, `merge.claimFreeTaps`, `merge.trash`, `blox.start`, `blox.place`, `blox.sync`, `blox.end`, `match3.start`, `match3.syncMode`, `match3.end`, `bubbo.start`, `bubbo.sync`, `bubbo.end`, `yard.buyFood`, `yard.setFood`, `yard.buyGoodie`, `yard.placeGoodie`, `yard.pickupGoodie`, `yard.fixGoodie`, `yard.collectGifts`, `yard.capturePhoto`, `yard.favoritePhoto`, `yard.setRemodel`, `yard.buyExpansion`, `yard.claimDailyLetter`, and `yard.configureCompanion`.
- Legacy Farm/resource state APIs retained where still mounted for economy compatibility: `/api/farm/*`, `/api/resources/state`. The old `/api/player/mutate` Pet, quest, and Room gameplay actions are not preserved; legacy Pet/Room/quest route wrappers now return 410 replacement errors.
- Merge: `/api/merge/*`
- Match-3: `/api/game/*`
- Blox: `/api/blox/*`
- Trivia: `/api/trivia/*`
- Achievements, events, and season pass: `/api/achievements/*`, `/api/events/*`, `/api/season-pass/*`. Legacy `/api/quests/*` routes remain mounted only to return 410 for retired Pet Orders clients.
- Batched dispatch: `POST /api/batch`

Operational/admin APIs:

- `GET /api/admin/account-report` requires normal auth plus `X-Admin-Token`.
- `GET /api/clear-cache` sends `Clear-Site-Data` for client recovery.

## Configuration

Copy `.env.example` and set:

- `NODE_ENV`
- `PORT`
- `APP_HOST_PORT`
- `CUSTOM_DOMAIN`
- `PUBLIC_APP_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `ADMIN_TOKEN`
- `DEV_AUTH_ENABLED`
- `APP_BUILD_ID`

The compose stack also uses `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` to provision PostgreSQL. In production, GitHub Actions writes `/opt/game-hub/.env` from repository secrets; do not commit production `.env` files.
`APP_BUILD_ID` is written from the GitHub commit SHA during deployment and mirrored into the Docker build as `VITE_BUILD_ID` so HTML, `/api/config`, the update manager, and versioned `/games/*` assets agree on cache freshness.

Playwright web-server runs with `NODE_ENV=test`, `DEV_AUTH_ENABLED=true`, and an empty `DATABASE_URL`; in that mode only, `withPlayerLock()` uses a process-local player store so browser smoke tests can exercise authenticated mutations without a local Postgres tenant. Production and normal development still require PostgreSQL for durable player state.

## Development

Install and run:

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install
pnpm dev
pnpm run dev:server
```

Vite proxies `/api` to `http://localhost:8090`. For local browser auth, set `DEV_AUTH_ENABLED=true` and keep `NODE_ENV` outside `production`.

Useful checks:

```bash
pnpm run build
pnpm test
pnpm run test:cleanup
docker build -t game-hub-ci .
```

`pnpm test` runs the Node test suite listed in `package.json`. It includes pure Bubbo pressure/drop coverage, pointer-session cleanup coverage, Blox drag geometry coverage, shared theme/shell guards, and Match-3 resolution plus animation-delay checks for bonus-block backfill, cascade snapshots, stuck overlay prevention, and Star Drop bottom-token auto-crediting. Playwright e2e specs are separate; the current focused gameplay checks are:

```bash
pnpm exec playwright test tests/e2e/minigames.spec.js tests/e2e/gestures.spec.js
pnpm exec playwright test tests/e2e/garden-shelf.spec.js tests/e2e/glass-ui.spec.js --project=mobile-chrome --workers=1
```

## Asset Replacement

Replaceable app graphics and audio are registered through `public/assets/manifest.json`. Existing pet SVGs and PWA icons remain compatible, while missing custom scene art or SFX falls back to procedural Pixi graphics and synthesized UI tones.

Tracked game source art lives under `public/games/bubbo-bubbo/`, `public/games/puzzling-potions/`, `public/games/garden-shelf/`, and `public/games/companion-yard/`. The Bubbo/Puzzling Potions normalized `images/` folders are loaded by `src/game-runtime/assetBundles.js`; Companion Yard loads PNG starter backgrounds, food, goodies, worn/broken variants, visitors, and companion species from its React module.

Cozy Yard content ids, rarity weights, attraction tags, durability, rewards, remodel metadata, slots, and asset keys are authored in `game-logic/yard-catalog.js`. Replace or add runtime art through `graphics.games.companionYard` in `public/assets/manifest.json`, keeping catalog ids and file names aligned.

Gacha Merge item icons can be replaced through `graphics.games.gachaMerge.items` in `public/assets/manifest.json`; empty keys keep the larger procedural token fallback until production art is added.

See `ASSET_REPLACEMENT_GUIDE.md` for exact file names, recommended formats, audio keys, rebuild steps, and validation commands.

## Account Migration

Create a PostgreSQL dump and Redis data backup before applying the account migration.

```bash
pnpm run migrate:accounts -- --dry-run
pnpm run migrate:accounts -- --apply
pnpm run migrate:accounts -- --verify
```

The migration creates `accounts` and `account_identities`, maps legacy player rows to canonical `acct:<uuid>` ids, preserves `players.data`, and stores the previous player id as a `legacy` identity for lookup.

Rollback is operational: restore the PostgreSQL dump and Redis volume backup taken before `--apply`.

## Deployment

The deployment target is an isolated `ccgh` Docker Compose project on the same VPS as `gemaibotv2`. CC-GH does not run its own Caddy container. The app binds only to localhost (`127.0.0.1:${APP_HOST_PORT:-18080}`), while the host-level Caddy route proxies `https://games.tri.mom` to that local port.

Required GitHub Actions secrets:

- `VPS_HOST`, `VPS_USERNAME`, `VPS_SSH_KEY`, `VPS_PORT`
- `CUSTOM_DOMAIN` (`games.tri.mom`)
- `PUBLIC_APP_URL` (`https://games.tri.mom`)
- `APP_HOST_PORT` (`18080`)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `ADMIN_TOKEN`

Run the manual `Provision CC-GH Caddy Route` workflow once after DNS points `games.tri.mom` at the VPS. It creates `/etc/caddy/sites-enabled/ccgh.caddy`, validates Caddy, and reloads it without touching the bot webhook container.

```bash
docker compose -p ccgh pull app
docker compose -p ccgh up -d --remove-orphans
```

The deploy workflow builds and pushes a GHCR image, copies `docker-compose.yml` to `/opt/game-hub`, writes the production `.env`, verifies that `APP_HOST_PORT` is not reserved or owned by another process, restarts only the `ccgh` compose project, removes stale failed app-recreate containers named like `*_ccgh-app`, and runs local plus public health checks. Deployment requires Docker Compose v2 through `docker compose`; legacy Python `docker-compose` v1.29.2 is intentionally rejected because it can fail with `KeyError: 'ContainerConfig'` when recreating app containers from modern image metadata.

Current workflow trigger note: CI is configured for the `game-hub` branch, while deploy is configured for `codex/telegram-pixi-vps-migration`. Keep this intentional or align it before changing the release branch model.

## Operations

Health:

- `/api/health` returns `ok` only when PostgreSQL responds to `SELECT 1`; otherwise it returns `degraded`.
- `/api/health/ping` is a simple 200 `PONG`.

Cache and sync:

- Use `/api/clear-cache` if stale service-worker or browser storage state blocks a client.
- The app also performs build-id freshness checks through `/api/config`; when the server build differs from the injected client build, it unregisters service workers, deletes caches, and reloads once with `?build=<id>`.
- The PWA config precaches hashed built assets, keeps HTML navigation network-only, excludes `/api/config` from runtime API caching, uses short NetworkFirst caching for other API GET requests, and keeps CacheFirst for fonts.
- Runtime `/games/*` asset URLs include the client build id as a query parameter so Pixi art refreshes with each deployed build.
- Socket clients disconnect while the document is hidden and reconnect on visibility return.

Security-sensitive behavior:

- Production auth must come from Telegram init data.
- Dev auth must remain disabled in production.
- CORS allows Telegram origins and configured app domains; development mode is intentionally permissive.
- The admin account report requires both user auth and `X-Admin-Token`.

Cleanup gate:

- `pnpm run test:cleanup` scans active files for retired platform names.
- Retired migration scratch files and legacy archive stubs are removed from the active tree; add new archive material only as an intentional documented artifact.

## Known Limitations And Technical Debt

Verified current limitations:

- SQL schema evolution is split between runtime `CREATE IF NOT EXISTS` statements, one SQL migration file, and JSON-state migrations. A dedicated ordered migration runner would make deploys and rollback reasoning safer.
- `withPlayerLock()` retries route handlers after OCC collisions. This protects state but makes duplicate-tolerant side effects an implicit requirement. Analytics inserts are currently fire-and-forget and can duplicate during retries.
- Redis fallbacks for nonce dedupe and rate limiting are process-local. They are not safe as distributed guarantees if the app scales beyond one Node instance without Redis.
- CI and deploy workflows target different branches. This may be intentional during migration, but it is a release-risk if the active production branch changes.
- Brain Blitz duel rooms are held in process memory, so they are not durable across restarts and are not shared across instances.
- `player_stats_view` refresh is timer-based and logs failures; there is no external scheduler or alerting in this repo.

Improvement backlog:

1. Add an explicit migration runner and make `db.js` schema creation a bootstrap fallback instead of the primary schema history.
2. Refactor route handlers to return structured mutation results instead of writing to `res` inside `withPlayerLock()` callbacks.
3. Move duplicate-sensitive side effects behind commit-success hooks so OCC retries cannot double-record them.
4. Broaden Playwright e2e beyond the focused minigame/gesture specs to cover full economy loops, trivia duel edge cases, and Cozy Yard long-idle visitor flows.
5. Align CI/deploy branch triggers with the current release model.
6. Persist or explicitly scope trivia duel rooms depending on whether cross-instance play is required.
7. Add operational checks for materialized-view refresh failures and Redis availability.

## Must-Preserve Invariants

- `Authorization: tma <initData>` is the production auth contract.
- Caller-supplied `userId` must not authorize access to another account.
- Canonical account ids use `acct:<uuid>` after identity migration.
- `game-logic.js` remains a compatibility import surface.
- PostgreSQL remains the source of truth for player saves.
- Redis acceleration must not be required for correctness in local/test single-instance operation.
- Socket.IO `player_sync.seq` must remain monotonic per player so clients can drop stale events.
- The VPS app must remain bound to localhost behind host-level Caddy.
