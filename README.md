# Game Hub Telegram Mini App

CC-GH is a multi-game Telegram Mini App deployed as an isolated VPS Docker Compose stack. The client is a React/Vite shell with PixiJS game surfaces, authenticated REST APIs, and authenticated Socket.IO state sync. PostgreSQL is the durable source of player state; Redis is used for cache, nonce, and rate-limit acceleration.

## Verified Stack

| Layer | Runtime |
| --- | --- |
| Client shell | React 19, Vite 7, Telegram Mini App SDK |
| Game rendering | PixiJS 8 |
| Client state helpers | Zustand, IndexedDB/localStorage Yard outbox, local browser storage for dev user id and Garden Shelf idle fallback; Garden Shelf progress and spendable gold are shared Hub player state |
| API | Express 5 |
| Realtime | Socket.IO |
| Durable storage | Self-hosted PostgreSQL |
| Cache / nonce / rate limit | Self-hosted Redis with in-memory fallbacks |
| Edge proxy | Host-level Caddy on the VPS |
| Package manager | pnpm 10.28.2 through Corepack |
| Container runtime | Node 24 Alpine image |
| Game asset helpers | Pixi Assets, GSAP, `@pixi/ui`, `@pixi/sound`, `pixi-filters`, `typed-signals`, and Spine Pixi v8 support libraries |

## Games

- Garden Shelf: ported React/Tailwind idle terrarium with responsive shelf/sign/bottom-plank art, transparent sprite-sheet plants, visible locked plant previews, slower growth/economy pacing, growth-phase tap acceleration, detailed-view plant arrows near the focused plant, clearer tap gold/XP feedback, Garden story quests plus three daily quest portions with server-synced claimed ids and endowed-progress cues, a duplicate-safe Level Up-ready garden XP action with a reward modal, watering-ready indicators, mature plant gold collection, stash/inventory placement, watering, evolution, offline earnings that stay visible until explicit collection, server-backed garden-state sync with local offline fallback, English/Russian Garden UI settings, and shared Hub gold for all spend/earn flows.
- Building Blox: Pixi board surface with tap fallback, tray-to-board drag, capture-point anchored carried pieces, separate snapped placement footprint previews, authoritative placement, row/column clear metadata, cell-flash plus line-wipe feedback, tray refill settle cues, saved state, rewards, and leaderboard reads.
- Gem Crush: Pixi board surface using tracked Puzzling Potions art, Classic, Timed, and Star Drop mode selection, tap-pair fallback, directional pointer-session swipe swapping, live HUD-aware board placement, resize-redraw handling, special row/column/blast/colour pieces, special-clear backfill, repeated Star Drop bottom-token auto-crediting, staged cascade board snapshots with textured fall/fill pieces, delayed tween cleanup that prevents stuck overlay pieces after cascades, short input locks, saved mode sync, and reward settlement.
- Gacha Merge / Alchemy Table: server-validated board state, drag/tap merging, pointer-session drag feedback, match and recipe glow paths, lower thumb-reachable rectangular board placement, a live bottom source dock that explains generator inputs, in-scene Items, Recipes, and Exchange drawers, mobile-readable free-tap claiming and generator controls, crafted Essence rewards for successful reactions, exchange offers for Cozy Yard treats and shiny treats, daily/tokens/trash controls grouped by outcome, one random generator without category picking, crop fuel, gacha pulls, daily free pull, paced free-tap recharges that bank up to 30 taps across the day, a bank-full label when all free taps are already available, trash mode, alchemy-style recipes, and Cozy Yard goodie drops.
- Bubbo Bubbo: Pixi pressure shooter using tracked Bubbo Bubbo art, Classic 36-shot and Timed 90-second modes, distinct five-color play, seeded procedural waves, a playable pending pressure row above the visible field, no-penalty sparse-field refill after strong clears, smoothed continuous descent, stabilized pressure-row insertion, wall-bank aiming, constant path-distance projectile motion, same-color cluster popping, multi-color support-cut island drops, capped lightweight falling motion, server-backed run lifecycle, and reward settlement.
- Brain Blitz: React-first trivia flow, category/difficulty selection, solo sessions, in-memory duel rooms, question-preserving pause state, and the shared in-game pause/result overlay shell.
- Cozy Yard: mixed-pet idle collector replacing the old Pet Room tab. Players use a standalone mobile-style yard HUD with atlas-backed icons scaled to the button affordance, open all food/goodies/shop/petbook/album/gift/settings screens inside the playfield, freely place and move every interactive goodie by yard coordinates clamped to the active remodel's playable area, wait server-simulated classic-hour visitor windows, watch pets enter the yard and interact with item-specific activity anchors and pose-specific visitor art inside the same playzone, collect gifts and mementos, repair worn goodies, start with Morning Meadow plus Moon Garden backgrounds, buy Tea House from the shop background section, and configure a helper home companion with no real-money paths. Goodie metadata distinguishes layable surfaces from movement blockers: visitors pin to stationary poses on layables and render above the occupied decoration, while non-layable goodies become simple route obstacles. Yard actions use a durable client outbox with entity-level pending visuals so weak connections retry silently instead of showing tap-then-rollback behavior.

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
2. `App.jsx` initializes Telegram platform helpers, installs the PWA update manager, and fetches `/api/config`. The Telegram SDK is loaded progressively by `src/platform/telegram.js` and `src/platform/useTelegramGameNavigation.js`; auth can still read `window.Telegram.WebApp.initData` synchronously while Back Button, haptics, closing confirmation, and swipe locking stay best-effort platform enhancements.
3. `src/app/gameRegistry.js` defines visible game metadata and keeps Farm registered but hidden for runtime compatibility. `src/app/useGameHudDescriptors.js` maps the active game plus snapshot/local run state into semantic HUD chips, so Blox/Gem/Merge/Bubbo/Trivia/Yard no longer fall back to generic gold/energy/token stats during live play.
4. `src/game-state/useGameHub.js` loads `/api/player/snapshot` and sends all new-stack gameplay commands through `/api/player/mutate`. Receipt-backed gameplay calls can use `performReliableAction()` and deterministic client action ids; Yard actions still first enter a durable outbox with `clientActionId`, `entityKey`, retry timing, reconnect/focus/visibility drains, and IndexedDB storage with localStorage fallback.
5. `src/game-state/inventory.js` normalizes seeds, harvested crops, merge board counts, yard food/goodie inventories, and rewards so legacy Farm resources, Merge, Bag, and Cozy Yard use one inventory shape.
6. Garden Shelf mounts as a React game under `src/games/garden-shelf/` with sprite-sheet assets in `public/games/garden-shelf/`, lazy Garden-only quest styling, daily quest generation in shared `game-logic/`, explicit plant details affordances that preserve ordinary tap behavior, and synced quest/level state in the shared player snapshot; Cozy Yard mounts as a React game under `src/games/companion-yard/` with starter assets in `public/games/companion-yard/`, a HUD sprite sheet, masked split goodies/companions/visitor poses, manifest-backed background overrides, DOM-rendered visitor movement layers constrained by `game-logic/yard-playzones.js`, an activity pill, and internal HUD-launched game screens instead of below-stage menus; Blox, Match-3, Merge, and Bubbo lazy-load the Pixi runtime only when the player shows intent to open a Pixi tab.
7. `src/game-runtime/LazyPixiSceneHost.jsx` imports `PixiGameHost` and the Pixi scene builders behind a dynamic import. `src/game-runtime/scenes.js` remains the stable public export, while per-game builders live under `src/game-runtime/scenes/`. `src/game-runtime/assetBundles.js` first tries generated content-hashed assets from `public/assets-runtime/manifest.json`, registers Pixi bundles with `Assets.addBundle`, and falls back to versioned legacy `/games/*` paths when a generated asset is missing. Cozy Yard keeps editable PNG fallbacks in `public/games/companion-yard/**`, while the generated runtime emits compact WebP-only Yard entries to stay inside the `/assets-runtime` payload budget.
8. Pixi gameplay surfaces opt out of Telegram viewport swipes during pointer gestures and use the shared `createPointerSession()` state machine for pointer id tracking, derived taps, drag thresholds, blur/visibility cleanup, and RAF-coalesced drag visuals. `PixiGameHost` captures gestures on the active canvas target so embedded browser wrappers do not steal Pixi pointer input.
9. Gameplay enters a shared immersive mobile shell across Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Cozy Yard. Live play hides Hub chrome and keeps only a compact in-game HUD visible; pause/menu/result surfaces render as accessible dialog overlays over the playfield, focus the first actionable control, and expose explicit Exit-to-Hub navigation. `useTelegramGameNavigation()` maps Telegram Back Button presses to close-panel, pause-run, or exit-to-hub actions, and closing confirmation is enabled only for active runs or pending reliable actions. Garden Shelf keeps its own idle-game shelf UI inside the hub tab.
10. Blox, Gem Crush, Gacha Merge, and Bubbo tune their Pixi board geometry for mobile thumb reach: playfields stay as large as the viewport allows, reserve room for compact HUD/tray controls, and sit lower in fullscreen play instead of pinning to the top edge. Blox can locally preview valid placements and predicted line clears before the authoritative mutation returns. Gacha Merge measures its live status strip and bottom control dock before fitting the board, keeps Library/Items/Exchange as in-scene drawers, uses source chips for generator input, and keeps generator/gacha/trash/pause controls reachable without covering the merge grid. Gem Crush measures the live HUD before fitting the board, restores saved runs before default creation, and redraws Pixi scenes on container or WebView viewport changes instead of waiting for pause/resume state updates. Bubbo stores the pending pressure row as gameplay state, renders it as hittable virtual row `-1`, carries a row-offset phase through pressure shifts, refills sparse boards back to at least three playable rows without pressure or danger penalty, and keeps finish/settle controls out of the live shot HUD.
11. Shared UI theme tokens in `src/index.css` drive Hub chrome, glass menus, Garden Shelf sheets/modals, and in-game HUD surfaces. The default light theme remains active, while the optional dark theme reuses the older matte Garden Shelf material language with lower mobile blur and a persisted topbar toggle.
12. Shared in-game pause menus stay intentionally narrow: one primary Resume action, one short first-run explanation, one inline status row, and only the secondary actions needed to recover, restart/end, or exit. Active pause states do not repeat HUD stat cards, leaderboards, setup panels, or mode selectors; Blox, Gem Crush, Merge, Bubbo, Brain Blitz, and Cozy Yard each keep their own preserved-state contract while avoiding duplicate finish/restart controls. Cozy Yard keeps its food, goodies, shop, petbook, album, gifts, remodel, expansion, helper, camera, sound, and settings interactions on HUD-launched in-game surfaces.
13. `src/services/updateManager.js` manually registers the PWA service worker, polls uncached `/api/config`, compares the server `buildId` with the injected client build id, and clears service workers/caches once before reloading with a cache-busting query when a stale build is detected.
14. Socket.IO listens for `player_sync` events and ignores stale sequence numbers.

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

`withPlayerLock()` is the mutation contract. It serializes mutations for a player inside one Node process with a promise-chain mutex, then uses `_version` optimistic concurrency control on `players.data` as the cross-instance safety net. Route handlers may be retried on OCC collision, so handler code must be safe when re-applied against fresh state. Locked route handlers return structured mutation results and send HTTP responses after the lock resolves. Duplicate-sensitive side effects belong behind `afterPlayerCommit()` hooks; fire-and-forget analytics inserts must be duplicate-tolerant if they are not commit gated.

Client REST calls are made through `api()`, which adds Telegram or dev auth and uses an 8 second timeout by default. `createBatcher()` can group client requests into `/api/batch`; the server dispatches sub-requests through the Express router stack without network loopback, limits sub-request concurrency to 3, and uses nonce dedupe through Redis or an in-memory fallback.

`POST /api/player/mutate` accepts optional `clientActionId` and `intentServerTime` metadata. Receipt-backed actions are deduplicated inside `withPlayerLock()` by `clientActionId + action + payloadHash`; replaying the same id and payload returns the saved result metadata without repeating side effects, while reusing the same id with a different payload returns a terminal conflict. Receipts are kept on the player document for the most recent 200 successful actions or 72 hours. Yard economy time remains server-authoritative in the HTTP route: request `payload.now` is ignored for rewards, visits, gifts, and daily letters, while direct test/helper calls can still inject a clock through function options.

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

PostgreSQL is the durable source of truth. `db.js` applies ordered SQL files from `migrations/*.sql` once through the `schema_migrations` table, then runs compatibility `CREATE IF NOT EXISTS` fallback for old deployments or partial local databases. The numbered SQL history includes:

- `players(id text primary key, data jsonb, updated_at timestamptz)`
- `accounts`
- `account_identities`
- `player_events`
- `player_stats_view` materialized view plus indexes
- `schema_migrations`

`migrations/001_accounts_identity.sql` creates the canonical account identity tables. `migrations/002_player_state_and_stats.sql` creates the player state table, player event table, stats view, and supporting indexes. Add future SQL changes as new numbered migration files instead of expanding runtime compatibility fallback. `scripts/migrate-accounts.mjs` migrates legacy player ids to canonical `acct:<uuid>` ids and supports `--dry-run`, `--apply`, and `--verify`.

Player JSON schema migrations are applied in `playerManager.js::applyMigrations()` during player mutation/loading. This is separate from SQL schema creation. Keep both migration paths in mind when changing saved state.

Redis is optional in local/test contexts but expected in the compose stack. It stores:

- player cache entries with a 24 hour TTL;
- batch nonce keys with a 5 minute TTL;
- distributed fixed-window rate-limit counters.

If Redis is unavailable, rate limits and nonce dedupe fall back to process-local memory. That fallback is acceptable for local and single-instance operation, but it is not distributed.

## API Surface

Public unauthenticated APIs:

- `GET /api/config` returns uncached client config plus `appVersion` and `buildId`.
- `GET /api/health` returns app liveness plus `version`, `buildId`, PostgreSQL status, Redis availability details, `player_stats_view` refresh state, and process-local Brain Blitz duel-room scope/counts.
- `GET /api/health/ping`
- `GET /api/content/crops`
- leaderboard reads

Authenticated gameplay APIs:

- New-stack player snapshot/mutations: `GET /api/player/snapshot`, `POST /api/player/mutate`
- `POST /api/player/mutate` body shape is `{ action, payload, clientActionId?, intentServerTime? }`. The optional metadata is currently used by the Yard outbox and idempotency layer; existing callers that only send `{ action, payload }` remain supported.
- Typed mutate actions include `garden.goldDelta`, `garden.sync`, `garden.levelUp`, `farm.plant`, `farm.harvest`, `farm.harvestAll`, `farm.buySeeds`, `farm.sellCrop`, `farm.buyPlot`, `farm.activateBooster`, `farm.buyTheme`, `farm.setTheme`, `merge.tap`, `merge.merge`, `merge.gacha`, `merge.freePull`, `merge.claimFreeTaps`, `merge.trash`, `blox.start`, `blox.place`, `blox.sync`, `blox.end`, `match3.start`, `match3.syncMode`, `match3.end`, `bubbo.start`, `bubbo.sync`, `bubbo.end`, `yard.buyFood`, `yard.setFood`, `yard.buyGoodie`, `yard.placeGoodie`, `yard.moveGoodie`, `yard.pickupGoodie`, `yard.fixGoodie`, `yard.collectGifts`, `yard.capturePhoto`, `yard.favoritePhoto`, `yard.setRemodel`, `yard.buyExpansion`, `yard.claimDailyLetter`, and `yard.configureCompanion`.
- Garden Shelf `garden.sync` payloads preserve sanitized story quest ids, daily quest state, and authoritative post-level-up state so quest rewards and level rewards remain one-time across devices, while the authoritative `garden.levelUp` mutation grants the level reward only once per in-flight action key.
- Merge exchange claim buckets are normalized to a small recent retention window during both player mutate and legacy merge route writes so daily exchange history does not grow without bound.
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
- `ASSET_BASE_URL`

The compose stack also uses `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` to provision PostgreSQL. In production, GitHub Actions writes `/opt/game-hub/.env` from repository secrets; do not commit production `.env` files.
`APP_BUILD_ID` is written from the GitHub commit SHA during deployment and mirrored into the Docker build as `VITE_BUILD_ID` so HTML, `/api/config`, and the update manager agree on app freshness. Runtime art uses content-hashed `/assets-runtime/*` URLs; legacy `/games/*` fallbacks still receive a build-id query. `ASSET_BASE_URL` is optional and only prefixes generated runtime assets for a future static asset domain/CDN.

Playwright web-server builds the Vite app with `NODE_ENV=production`, then runs `server.js` with `NODE_ENV=test`, `DEV_AUTH_ENABLED=true`, and an empty `DATABASE_URL`; in server test mode only, `withPlayerLock()` uses a process-local player store so browser smoke tests can exercise authenticated mutations without a local Postgres tenant. Production and normal development still require PostgreSQL for durable player state.

## Development

Install and run:

```bash
# Use Node 24 LTS.
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install
pnpm dev
pnpm run dev:server
```

Vite proxies `/api` to `http://localhost:8090`. For local browser auth, set `DEV_AUTH_ENABLED=true` and keep `NODE_ENV` outside `production`.

Useful checks:

```bash
pnpm run assets:build
pnpm run build
pnpm test
pnpm run test:perf
pnpm run perf:guard
pnpm run perf:guard:build
pnpm run perf:guard:browser
pnpm run perf:guard:all
pnpm run test:cleanup
docker build -t game-hub-ci .
```

`pnpm test` runs the Node test suite listed in `package.json`. It includes pure Bubbo pending-row, pressure/drop, sparse-refill, and timed-state coverage, pointer-session cleanup coverage, Blox drag geometry coverage, Garden Shelf daily quest and duplicate Level Up guards, Merge exchange-claim pruning, shared theme/shell guards, the `perf:guard` budget contract, and Match-3 resolution plus animation-delay checks for bonus-block backfill, cascade snapshots, stuck overlay prevention, and Star Drop bottom-token auto-crediting. `pnpm run perf:guard` runs hot-path budgets directly and writes an ignored JSON report to `artifacts/perf/perf-guard-report.json`; budgets cover Blox fit/placement, Gem Crush board generation/matches/swaps/Star Drop, Merge hydration/generator/recipe mutations, Bubbo pressure/shots, Garden Shelf offline simulation, Brain Blitz question picking, Cozy Yard visitor/long-idle simulation, Player JSON migration/snapshot paths, and runtime asset pipeline scan/manifest/bundle mapping. The guard fails on p95 and p99 tail regressions, while raw max spikes are reported as diagnostics so isolated VM/GC noise does not fail CI. `pnpm run perf:guard:build` checks Vite build artifact budgets plus generated `/assets-runtime` manifest and payload budgets after `pnpm run build`, and `pnpm run perf:guard:browser` runs Chromium runtime smoke for lazy startup, generated asset loading, and Gacha Merge live-play frame cadence. Use `pnpm run perf:guard -- --suite player.build-snapshot --repeat 3` for a focused repeated budget pass. The design rationale and budget policy live in `docs/PERF_GUARD.md`. Playwright e2e specs are separate; the current focused gameplay checks are:

```bash
pnpm exec playwright test tests/e2e/minigames.spec.js tests/e2e/gestures.spec.js
pnpm exec playwright test tests/e2e/garden-shelf.spec.js tests/e2e/glass-ui.spec.js --project=mobile-chrome --workers=1
pnpm exec playwright test tests/e2e/companion-yard.spec.js --project=mobile-chrome --workers=1
pnpm exec playwright test tests/e2e/multi-game-logic-smoke.spec.js --project=chromium --workers=1
```

## Asset Replacement

Replaceable app graphics and audio are registered through `public/assets/manifest.json`. Generated optimized runtime art is written to `public/assets-runtime/manifest.json` by `pnpm run assets:build`, which runs automatically before `pnpm run build`. Manual manifest overrides win over generated assets, and missing custom scene art or SFX still falls back to procedural Pixi graphics and synthesized UI tones.

Browser-served runtime fallbacks live under `public/games/bubbo-bubbo/`, `public/games/puzzling-potions/`, `public/games/garden-shelf/`, and `public/games/companion-yard/`. Editable source exports and upstream raw assets live under `assets-source/` and are not copied into the production runtime image. Bubbo, Gem Crush, Garden Shelf, and Cozy Yard resolve generated WebP/PNG/SVG runtime assets first, then fall back to the stable public paths. Cozy Yard source sheets are kept under `assets-source/games/companion-yard/source-sheets/`; the runtime-facing split files are the stable `public/games/companion-yard/{backgrounds,companions,goodies,visitors}/` PNGs.

Cozy Yard content ids, rarity weights, attraction tags, durability, rewards, remodel metadata, starter slots, activity anchors, surface/blocking metadata, visitor stationary poses, visitor capacity, and asset keys are authored in `game-logic/yard-catalog.js`. Runtime placement state stores percent-based `x`/`y` yard coordinates for freely placed goodies while preserving legacy slot ids as migration/fallback data; those points are clamped through `game-logic/yard-playzones.js` so Morning Meadow, Moon Garden, and Tea House placements and visitor motion stay inside the active background's playable art. Replace remodel backgrounds either by overwriting `public/games/companion-yard/backgrounds/<remodel_id>.png` or by setting `graphics.games.companionYard.backgrounds.<remodel_id>` in `public/assets/manifest.json`; other runtime art can use the same `graphics.games.companionYard` manifest bucket while keeping catalog ids and file names aligned. Morning Meadow and Moon Garden are starter-owned remodels; Tea House is the first shop-owned background. Pose-specific visitor assets use `<visitor_id>_<pose>.png` keys, with the base `<visitor_id>.png` kept as the default preview/fallback. Cozy Yard HUD controls are cut from the 5x5 alpha-cleaned `public/games/companion-yard/HUD.png`; `HUD.svg` is kept as the editable source/export reference for that sprite sheet.

Gacha Merge / Alchemy Table art can be replaced through `graphics.games.gachaMerge` in `public/assets/manifest.json` or generated from `public/games/gacha-merge/{backgrounds,ui,fx,items}` into `/assets-runtime`; empty keys keep the procedural table, glow, and token fallbacks until production art is added.

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

Current workflow trigger note: CI and deploy both target `codex/telegram-pixi-vps-migration`, which is also the current remote HEAD branch for this repo.

## Operations

Health:

- `/api/health` returns `ok` when PostgreSQL responds to `SELECT 1`, configured Redis responds to `PING`, and the last `player_stats_view` refresh attempt has no recorded error; otherwise it returns `degraded`.
- The health payload keeps the legacy `postgres` and `redis` booleans and adds `redisStatus`, `playerStatsView`, and `triviaDuelRooms` details for operational checks.
- `/api/health/ping` is a simple 200 `PONG`.

Cache and sync:

- Use `/api/clear-cache` if stale service-worker or browser storage state blocks a client.
- The app also performs build-id freshness checks through `/api/config`; when the server build differs from the injected client build, it unregisters service workers, deletes caches, and reloads once with `?build=<id>`.
- The PWA config precaches hashed shell assets, keeps HTML navigation network-only, excludes `/api/config` from runtime API caching, uses short NetworkFirst caching for other API GET requests, and keeps CacheFirst caches for fonts and lazily loaded runtime art.
- Runtime `/assets-runtime/*` files use content-hashed names and immutable cache headers; `/assets-runtime/manifest.json` and `/assets/manifest.json` stay no-cache. Legacy `/games/*` fallback URLs keep the client build-id query.
- The initial app chunk must not eagerly import or preload Pixi runtime modules. Pixi scene code loads through the async `LazyPixiSceneHost` path, with tab hover/focus/pointerdown preloading to hide latency when the player intends to open a Pixi game.
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

- Player JSON migrations remain in `playerManager.js::applyMigrations()` and are separate from SQL schema migrations.
- Redis fallbacks for nonce dedupe and rate limiting are process-local. They are not safe as distributed guarantees if the app scales beyond one Node instance without Redis.
- Brain Blitz duel rooms are explicitly process-local and are reported in `/api/health`; they are not durable across restarts and are not shared across instances.
- `player_stats_view` refresh is timer-based and exposed through `/api/health`; there is still no external scheduler or alerting in this repo.

Addressed in the current branch:

- Added an ordered SQL migration runner backed by `schema_migrations`, backfilled SQL history through `002_player_state_and_stats.sql`, and kept `db.js` schema creation as compatibility fallback.
- Refactored remaining locked route handlers to return structured mutation results instead of writing Express responses inside `withPlayerLock()` callbacks.
- Moved Farm/resource analytics writes behind `afterPlayerCommit()` so losing OCC retry attempts cannot double-record events.
- Tightened Gacha Merge daily reset, generator, recipe, trash, reward-drop, and Cozy Yard goodie integration semantics around authoritative mutation results.
- Hardened Cozy Yard long-idle/reconnect simulation so capped offline returns do not replay extra visitor or gift windows on reload.
- Aligned CI and deploy workflow branch filters to `codex/telegram-pixi-vps-migration`.
- Added `/api/health` details for actual Redis availability, materialized-view refresh success/failure, and Brain Blitz process-local room scope.

Improvement backlog:

1. Broaden Playwright e2e beyond the focused minigame/gesture specs to cover full economy loops, trivia duel edge cases, Cozy Yard long-idle visitor flows, and additional viewport-change cases outside Gem Crush.
2. Decide whether Brain Blitz duels need durable cross-instance storage; current product scope is explicitly process-local.
3. Add external scheduler/alerting for materialized-view refresh failures and Redis outages if the VPS moves beyond in-app health checks.

## Must-Preserve Invariants

- `Authorization: tma <initData>` is the production auth contract.
- Caller-supplied `userId` must not authorize access to another account.
- Canonical account ids use `acct:<uuid>` after identity migration.
- `game-logic.js` remains a compatibility import surface.
- PostgreSQL remains the source of truth for player saves.
- Redis acceleration must not be required for correctness in local/test single-instance operation.
- Socket.IO `player_sync.seq` must remain monotonic per player so clients can drop stale events.
- The VPS app must remain bound to localhost behind host-level Caddy.
