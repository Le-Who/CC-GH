# 🎮 Game Hub — Discord Embedded Activity

> A 5-in-1 social game hub built as a **Discord Embedded App Activity**. Cozy Farm, Brain Blitz trivia, Gem Crush match-3, Building Blox puzzle, and Gacha Merge — all in one app with a unified pet companion, resource economy, and offline simulation.

**Current version: v10.0.1** (ACID Postgres Migration, Stateless Scaling, Redis Read-Through Cache)

---

## 📸 Overview

| Feature                   | Description                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- |
| 🌱 **Cozy Farm**          | Plant, water, harvest crops · Buy plots · Seed shop with 8 crop types        |
| 🧠 **Brain Blitz**        | Solo trivia + async duels via invite codes · 3 difficulty tiers              |
| 💎 **Gem Crush**          | 8×8 match-3 with cascades, combos, and leaderboard · 3 game modes · Juicy UI |
| 🧱 **Building Blox**      | 10×10 block puzzle · 12 pieces · cross-device sync · touch drag · Juicy UI   |
| 🔮 **Gacha Merge**        | 7×9 merge board · 2 chains × 8 levels · generators + gacha + daily free pull |
| 📋 **Pet Orders**         | Quest system: farm crops + merge items → tiered rewards + affection levels   |
| 📋 **Quest Dropdown**     | Non-blocking dropdown with progress bars, click-outside-to-close             |
| 🐾 **Pet Companion**      | Free-roaming pet with smart docking · Auto-water/harvest/plant abilities     |
| 🏠 **Pet Room**           | 4×4 decoratable grid · Decorations from Merge pipeline · Stat bonuses        |
| ⚡ **Energy System**      | Native dialog overlays · 2.5-min regen · Gates match-3 and trivia plays      |
| 💣 **Farm Uproot**        | Hold-to-confirm 2.5s removal of unwanted crops (no refund)                   |
| 🔓 **Progressive Unlock** | Seeds gated by harvests, quests, gold, plots, days · unlock celebrations     |
| 🌟 **Featured Shelf**     | Vertical sidebar left of farm, 4-seed rotation, curated by purchase history  |
| 🎨 **4 Themes**           | Neon Night · Cozy Day · Soft Fantasy · Minimal Calm · Seasonal auto-rotate   |
| 🔥 **Streaks & Boosters** | Daily login streaks with multipliers · Timed farm boosters (2× growth)       |
| 🏆 **Achievements**       | Server-validated milestones · Badges tab in farm panel                       |
| ⭐ **Season Pass**        | Free + premium tracks · Event-gated rewards                                  |
| 💾 **Offline Simulation** | Auto-harvest, auto-plant, auto-water while away · Welcome-back report        |
| 🏠 **GameStore**          | Zustand-inspired slice pattern for state isolation between games             |
| 🔐 **Discord OAuth2**     | Dual-mode auth (token + userId fallback) · Scoped CORS origins               |
| 📱 **Navigation**         | Persistent bottom tab bar with Native HTML5 View Transitions                 |
| ✨ **Nav Shimmer + Dots** | Active tab shimmer effect · Green notification dot on Farm when crops ready  |
| 🔤 **Emoji Consistency**  | Robust font stack: Noto Color Emoji + Apple/Segoe fallbacks                  |
| ⚡ **Zero-GC Drags**      | CSS Custom Properties & Sub-pixel caching for 60fps mobile drag-and-drop     |
| 📱 **Mobile Shop Drawer** | Framer Motion bottom-sheet for inventory (swipeable 3-snap positions)        |
| ✨ **Compact Mobile UX**  | Responsive navigation (48-68px) and HUD overflow menu for small viewports    |
| 🧱 **Upstash Redis**      | Distributed player cache + atomic SET NX idempotency deduplication           |
| 🌍 **Optimistic Sync**    | Debounced & batched Firestore sync with direct Express loopback dispatch     |

---

## ⚙️ Tech Stack

| Layer        | Technology                               |
| ------------ | ---------------------------------------- |
| **Runtime**  | Node.js 20                               |
| **Frontend** | React 19 + Vite 7 + Tailwind CSS v3      |
| **Backend**  | Express.js 5.x                           |
| **Database** | Supabase PostgreSQL                      |
| **Cache**    | Upstash Redis (REST)                     |
| **Auth**     | Discord Activity SDK 1.0 + Simple Auth   |
| **State**    | React Hooks + Vanilla Bridges            |
| **Testing**  | Node.js built-in `node:test` (367 pass)  |

---

## 🚀 Quick Start

```bash
npm install
npm run dev
# → http://localhost:8090
```

### Environment Variables

| Variable                | Required | Description                       |
| ----------------------- | -------- | --------------------------------- |
| `DISCORD_CLIENT_ID`     | ✅       | Discord app client ID             |
| `DISCORD_CLIENT_SECRET` | ✅       | Discord app client secret         |
| `DISCORD_REDIRECT_URI`  | ✅       | OAuth2 redirect URI               |
| `DATABASE_URL`          | ✅       | Supabase Transaction Pooler URL (port 6543) |
| `UPSTASH_REDIS_URL`     | ✅       | Redis REST URL for caching and nonces       |
| `UPSTASH_REDIS_TOKEN`   | ✅       | Redis REST token                            |
| `PORT`                  | ❌       | Server port (default: `8090`)     |
| `SIMPLE_AUTH_ENABLED`   | ❌       | Enable username/password auth (default: `false`) |
| `CUSTOM_DOMAIN`         | ❌       | Custom domain for CORS allowlist              |

---

## 🏗 Project Structure

```
├── server.js              # Express composition root (~350 lines)
├── playerManager.js       # Player state, persistence, schema migration
├── game-logic.js          # Pure functions (crops, energy, offline simulation)
├── db.js                  # Postgres Connection Pool adapter
├── redisAdapter.js        # Redis cache and idempotency nonce adapter
├── routes/                # Feature-specific Express routers
│   ├── farm.js            # /api/farm/* + /api/content/crops
│   ├── resources.js       # /api/resources/* + /api/pet/* + sell-crop
│   ├── trivia.js          # Solo trivia + duel rooms + history
│   ├── match3.js          # /api/game/* (state, start, move, end, sync)
│   ├── blox.js            # /api/blox/* (start, end, state, sync)
│   ├── mergeRoutes.js     # /api/merge/* (state, tap, merge, gacha, free-pull, trash)
│   ├── questRoutes.js     # /api/quests/* (active, generate, submit)
│   ├── achievements.js    # /api/achievements/* (milestones, badges)
│   ├── events.js          # /api/events/* (seasonal events)
│   ├── seasonpass.js      # /api/seasonpass/* (free + premium tracks)
│   └── leaderboard.js     # Match-3 + Blox leaderboards
├── data/
│   ├── questions.json     # Trivia question bank
│   └── migrate-on-cloud.js # Idempotent Firestore → Postgres migration script (Cloud Run Job)
├── src/                   # Client source (Vite + React)
│   ├── main.jsx           # React entry point, CSS imports, font loading
│   ├── App.jsx            # Root component, tab routing, modal orchestration
│   ├── components/
│   │   ├── HUD.jsx        # Energy + Gold display (Zustand-subscribed)
│   │   ├── BottomNav.jsx  # 6-tab bottom nav with framer-motion transitions
│   │   ├── VanillaShell.jsx # Bridge: mounts vanilla HTML + boots vanilla main.js
│   │   ├── GameStoreUI.jsx # Gacha / Cozy Pass / Bundles / Currency modals
│   │   ├── QuestUI.jsx    # Quest log dropdown with progress bars
│   │   ├── PetInfoUI.jsx  # Pet profile card (mood, affection, abilities)
│   │   ├── PetRoomUI.jsx  # 4×4 decoratable pet room with inventory
│   │   └── WelcomeScreen.jsx # Onboarding overlay (pet naming, free seed)
│   ├── store/
│   │   └── gameStore.js   # Zustand store with slice pattern
│   └── vanilla/           # Vanilla JS game modules
│       ├── main.js        # Boot orchestrator, module registry
│       ├── shared.js      # HUB state, auth, navigation, toast, themes
│       ├── store.js       # GameStore proxy (vanilla → Zustand bridge)
│       ├── hud.js         # Energy + Gold HUD, regen timer
│       ├── pet.js         # Pet companion (roam, sleep, auto-water, abilities)
│       ├── farm.js        # Farm module (plots, shop, featured shelf, badges)
│       ├── trivia.js      # Trivia (solo + duels, lobby, history)
│       ├── match3.js      # Match-3 (swap animation, cascades, leaderboard)
│       ├── blox.js        # Building Blox (pause, touch drag, ghost)
│       ├── merge.js       # Gacha Merge (server-validated D&D, generators)
│       ├── quest.js       # Quest dropdown (vanilla side)
│       ├── effects.js     # Particle pool, sound engine, perlin shake
│       └── css/           # Modular CSS (base, farm, trivia, match3, blox, merge, hud, pet)
├── tests/
│   ├── unit.test.js       # Unit tests (pure functions)
│   ├── api.test.js        # API integration tests
│   ├── blox.test.js       # Building Blox tests
│   ├── match3.test.js     # Tile clearing tests
│   ├── ux.test.js         # UX invariant tests (pet transitions, farm ticks)
│   ├── gcp.test.js        # GCP resilience tests
│   ├── perf.test.js       # Performance benchmarks
│   ├── game-logic-stress.test.js # Stress tests (100× offline sim)
│   ├── farm.test.js       # Farm-specific tests
│   ├── store.test.js      # GameStore slice tests
│   └── syntax.test.js     # ESM parse validation (all .js files)
├── Dockerfile             # Cloud Run deployment (node:20-alpine)
└── .github/
    └── workflows/
        └── ci.yml         # CI: test on Node 20+22, Docker build
```

---

## 🧪 Testing

```bash
npm test          # All 367 tests across 11 suites
npm run test:perf # Performance benchmarks only
```

| Type       | File                              | Count |
| ---------- | --------------------------------- | ----: |
| **Unit**   | `tests/unit.test.js`              |    53 |
| **API**    | `tests/api.test.js`               |    38 |
| **Blox**   | `tests/blox.test.js`              |    30 |
| **M3**     | `tests/match3.test.js`            |    12 |
| **UX**     | `tests/ux.test.js`                |    72 |
| **ACID**   | `tests/db.test.js`                |    20 |
| **Perf**   | `tests/perf.test.js`              |    15 |
| **Stress** | `tests/game-logic-stress.test.js` |    57 |
| **Farm**   | `tests/farm.test.js`              |    30 |
| **Store**  | `tests/store.test.js`             |    10 |
| **Syntax** | `tests/syntax.test.js`            |    48 |

---

## 🚢 Deployment

```bash
# Google Cloud Run (build + deploy in one step)
gcloud run deploy game-hub \
  --source . \
  --region europe-west4 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "DISCORD_CLIENT_ID=...,DISCORD_CLIENT_SECRET=...,DISCORD_REDIRECT_URI=...,DATABASE_URL=...,UPSTASH_REDIS_URL=...,UPSTASH_REDIS_TOKEN=..."
```

---

## 🐾 Pet System

| Level | Ability                                              |
| ----: | ---------------------------------------------------- |
|    3+ | 🌾 **Auto-Harvest** — harvests ready crops offline   |
|    5+ | 💧 **Auto-Water** — waters 2 plots every 10s         |
|    7+ | 🌱 **Auto-Plant** — replants harvested plots offline |

Smart docking: pet roams within stats-bar bounds on game screens, full ground on farm. Smooth 0.5s transition between screens.

---

## 🌱 Farm System

**8 crops** with progressive pricing (v6.0 economy rebalance):

| Crop           | Growth |  Sell | Seed Cost |
| -------------- | ------ | ----: | --------: |
| 🍓 Strawberry  | 5 min  |  15🪙 |       5🪙 |
| 🫐 Blueberry   | 7 min  |  20🪙 |       8🪙 |
| 🍅 Tomato      | 15 min |  30🪙 |      10🪙 |
| 🌹 Golden Rose | 30 min | 150🪙 |      60🪙 |
| 🌽 Corn        | 1 hr   |  50🪙 |      20🪙 |
| 🌻 Sunflower   | 2 hr   |  80🪙 |      35🪙 |
| 🍉 Watermelon  | 4 hr   | 120🪙 |      45🪙 |
| 🎃 Pumpkin     | 8 hr   | 250🪙 |     100🪙 |

**Purchasable plots** (6 free → max 12): doubling cost 200 → 400 → 800 → 1600 → 3200 → 6400🪙

---

## 💾 Persistence & Architecture (v10.0 Postgres ACID)

> Game Hub uses a highly parallelized stateless architecture backed by **PostgreSQL** and **Upstash Redis**.

### Architecture & Data Flow

1. **Traffic Layer (REST API)**: Requests arrive at Node.js and are authenticated via Discord OAuth or Simple Auth. Rate limits are evaluated in Redis.
2. **Read-Through Cache (Redis)**: `ensurePlayerLoaded` executes a sub-millisecond Redis `GET`. If the user data exists, routing proceeds. If absent, the data is pulled from Postgres into Redis.
3. **Concurrency Boundary (Postgres `SELECT FOR UPDATE`)**: Mutating endpoints (like planting crops) are wrapped in `withPlayerLock(userId)`. This utilizes Postgres native ACID properties:
    * It executes `INSERT ... ON CONFLICT DO NOTHING` to guarantee the row exists safely.
    * It executes `SELECT ... FOR UPDATE` to exclusively lock the user's row, preventing double-spend race conditions.
4. **Execution & Write-Through Layer**: The route handler mutates the loaded JSONB state. It returns the modified object, which is synchronously `UPDATE`d in Postgres within the transaction, and then fire-and-forget written-through to Redis before the lock is released.

### ⚠️ Known Limitations (Supabase Free Tier)
- **7-Day Auto Pause:** Supabase Free projects pause after 7 days of inactivity. This is mitigated by a GitHub Action cron job (`.github/workflows/supabase-keepalive.yml`) that pings the server every 3 days.
- **Connection Limits**: Supabase Free supports ~20 direct connections. You **MUST** use the Supabase Transaction Pooler URL (`port 6543`) in your `DATABASE_URL` environment variable, or the app will immediately crash Node.js with connection exhaustion during load spikes. `db.js` explicitly caps the internal Node pool to 8 to survive this limit.

---

## 🔬 Architecture Evolution & Updates

Older architecture evolution changes can be found in `legacy_readme.md`.

### ✅ Completed in v7.4.0

1. **Mobile Performance & UI Architecture Optimization**:
   - **Merge D&D Lag**: Removed blurred ghost element in favor of hardware-accelerated `translate3d` + `opacity`.
   - **Touch Capture Conflicts**: Resolved gesture conflicts between Discord app swiping and board dragging via `HUB.swipeBlocked` logic.
   - **Effects.js WAAPI**: Refactored particle systems (coins, water) to Web Animations API out of the main thread, eliminating garbage collection pauses.
   - **Paint Flashing**: Migrated box-shadow animations to pseudo-elements with opacity transitions.
   - **CPU Bound Cloning**: Replaced `JSON.parse(JSON.stringify)` with native `structuredClone` for deep matrix copies, slashing 50ms lockups.
   - **Zustand Reactivity**: Implemented atomic selectors in HUD to prevent cascading re-renders during Match-3/Merge gameplay.
   - **Blox Layout Thrashing**: Converted JS window `resize` listeners to purely native CSS `clamp()` logic.
   - **Gacha Memory Leaks**: Guarded delayed asynchronous DOM manipulations against screen exit (orphan timers).
   - **FOUT**: Implemented system-ui fallbacks to prevent flash of unstyled text over slow 3G.

### ✅ Completed in v7.3.x

1. **Architecture Resilience & Concurrency Audit** (v7.3.6):
   - **Double-Spend Fix:** Developed a zero-dependency async mutex (`withPlayerLock`) for `playerManager.js`. Ensures perfect serialization of simultaneous requests from the same user.
   - **Persistence Circuit Breaker:** `debouncedSavePlayer` Firestore failures now actively mark users with `_saveError = true` tripping an Express middleware 503 boundary to halt state divergence on DB outage.
   - Integration tests updated to validate HTTP 400 rejection streams under race conditions (e.g. `gcp.test.js`).
2. **Security & Architecture Audit — Phase 2** (v7.3.5):
   - CSP `frame-ancestors` replaces `X-Frame-Options` for Discord iframe compatibility.
   - Scoped CORS origins (Discord-only in production), wildcard removed.
   - `calcGoldReward` DoS safety cap, buy-seeds amount validation (anti-exploit).
   - Rate limiter ordering fixed (now before all routes, including `/api/token`).
   - Quest merge-board hydration, leaderboard 30s TTL cache, duel history O(1).
   - Global Express 5 error handler, rate limiter cleanup consolidation.
   - `plotId` integer validation on 4 farm endpoints, `blox.activeGame` schema fix.
2. **Security & Architecture Audit** (v7.3.4):
   - Blox session validation (anti-gold-exploit) + anti-cheat score ceilings.
   - Rate limiter mount order fixed (before route handlers).
   - CORS + security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
   - Firestore init refactored to lazy `initFirestore()` factory.
   - LRU eviction (10K cap) for in-memory player cache.
   - Shared helpers (`randInt`, `pick`, `calcTokenReward`) extracted to `game-logic.js`.
   - Recurring events fixed with year-normalization.
   - Merge board coordinate validation, pet name XSS sanitization.
   - Dead code removal (`farm.coins`), `.unref()` for clean test shutdown.
3. **Retention & Monetization Ready** (v7.3.0):
   - Post-game summary cards, tomorrow preview, weekly stats.
   - Daily login streaks with escalating multipliers.
   - Timed farm boosters (2× growth, 1.5× harvest).
   - Achievements, seasonal events, season pass (free + premium tracks).
   - Per-route rate limiting for API abuse prevention.
4. **Pet Room — Phase 3** (v7.3.0):
   - 4×4 decoratable room grid with stat-boosting decorations.
   - `PetRoomUI.jsx` component with tile placement and inventory.
   - Room decorations from Merge pipeline with rarity tiers.
5. **Farm Panel Expansion** (v7.3.0+):
   - Badges, Journal (crop discovery), and Season Pass tabs.
   - 30-second onboarding redesign with invisible tutorials.
6. **Prod-Readiness Audit** (v7.3.3):
   - Featured shelf repositioned to left sidebar (absolute positioning).
   - Pet profile mood meter and affection level restored.
   - HUD gold counter stabilized, dead imports removed.

### ✅ Completed in v7.2.x

1. **Player Experience Overhaul**:
   - **Progressive Seed Unlocking**: 6 crops gated by player milestones.
   - **Featured Seed Shelf**: 4-seed rotating vertical sidebar.
   - **4 Themes**: Neon Night, Cozy Day, Soft Fantasy, Minimal Calm + seasonal auto-rotation.
2. **Juice Animations**: Trivia 3D flip, Merge magnetic pull, Pet tap bounce, Match-3 spring swap, Blox place bounce.
3. **Psychological Marketing** (v6.3.0): Decoy bundles, Goal-Gradient quests, Zeigarnik welcome-back, Peak-End particles.

---

## 📝 License

This project is proprietary. All rights reserved.
