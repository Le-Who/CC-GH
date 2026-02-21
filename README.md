# 🎮 Game Hub — Discord Embedded Activity

> A 4-in-1 social game hub built as a **Discord Embedded App Activity**. Cozy Farm, Brain Blitz trivia, Gem Crush match-3, and Building Blox puzzle — all in one app with a unified pet companion, resource economy, and offline simulation.

**Current version: v5.1.0**

---

## 📸 Overview

| Feature                   | Description                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- |
| 🌱 **Cozy Farm**          | Plant, water, harvest crops · Buy plots · Seed shop with 8 crop types        |
| 🧠 **Brain Blitz**        | Solo trivia + async duels via invite codes · 3 difficulty tiers              |
| 💎 **Gem Crush**          | 8×8 match-3 with cascades, combos, and leaderboard · 3 game modes · Juicy UI |
| 🧱 **Building Blox**      | 10×10 block puzzle · 12 pieces · cross-device sync · touch drag · Juicy UI   |
| 🐾 **Pet Companion**      | Free-roaming pet with smart docking · Auto-water/harvest/plant abilities     |
| ⚡ **Energy System**      | Native dialog overlays · 2.5-min regen · Gates match-3 and trivia plays      |
| 💾 **Offline Simulation** | Auto-harvest, auto-plant, auto-water while away · Welcome-back report        |
| 🏠 **GameStore**          | Zustand-inspired slice pattern for state isolation between games             |
| 🔐 **Discord OAuth2**     | Dual-mode auth (token + userId fallback)                                     |
| 📱 **Navigation**         | Persistent bottom tab bar with Native HTML5 View Transitions                 |

---

## ⚙️ Tech Stack

| Layer        | Technology                                 |
| ------------ | ------------------------------------------ |
| **Runtime**  | Node.js 20                                 |
| **Frontend** | Vanilla JS + CSS · ES Modules (import map) |
| **Backend**  | Express.js 5.x                             |
| **Database** | Google Cloud Firestore                     |
| **Storage**  | Google Cloud Storage (legacy backup)       |
| **Auth**     | Discord Embedded App SDK 1.0               |
| **State**    | GameStore (Zustand-inspired vanilla JS)    |
| **Testing**  | Node.js built-in `node:test` (zero deps)   |

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
| `PORT`                  | ❌       | Server port (default: `8090`)     |
| `GCS_BUCKET`            | ❌       | GCS bucket for persistent storage |

---

## 🏗 Project Structure

```
├── server.js              # Express composition root (~320 lines)
├── playerManager.js       # Player state, persistence, schema migration
├── game-logic.js          # Pure functions (crops, energy, offline simulation)
├── storage.js             # GCS + local file persistence adapter
├── routes/                # Feature-specific Express routers
│   ├── farm.js            # /api/farm/* + /api/content/crops
│   ├── resources.js       # /api/resources/* + /api/pet/* + sell-crop
│   ├── trivia.js          # Solo trivia + duel rooms + history
│   ├── match3.js          # /api/game/* (state, start, move, end, sync)
│   ├── blox.js            # /api/blox/* (start, end, state, sync)
│   └── leaderboard.js     # Match-3 + Blox leaderboards
├── data/
│   └── questions.json     # Trivia question bank
├── public/
│   ├── index.html         # Single-page shell (4-screen sliding track)
│   ├── js/
│   │   ├── main.js        # ES Module entry point (boot orchestrator)
│   │   ├── shared.js      # HUB state, auth, navigation, toast, device detection
│   │   ├── store.js       # GameStore (Zustand-like slice manager)
│   │   ├── crops.js       # Crop metadata fetch/cache (replaces window globals)
│   │   ├── hud.js         # Energy + Gold HUD, regen timer
│   │   ├── pet.js         # Pet companion (roam, sleep, auto-water, abilities)
│   │   ├── farm.js        # Farm module (plots, shop, buy-plot, optimistic updates)
│   │   ├── trivia.js      # Trivia (solo + duels, lobby, history)
│   │   ├── match3.js      # Match-3 barrel (swap animation, cascades, leaderboard)
│   │   ├── match3/
│   │   │   └── engine.js   # Pure game logic (generateBoard, findMatches, resolveBoard)
│   │   ├── blox.js        # Building Blox barrel (pause, touch drag, ghost)
│   │   └── blox/
│   │       └── pieces.js   # Static piece definitions (12 shapes)
│   └── css/               # Modular CSS (base, farm, trivia, match3, blox, hud, pet)
├── tests/
│   ├── unit.test.js       # 49 unit tests (pure functions)
│   ├── api.test.js        # 24 API integration tests
│   ├── blox.test.js       # 30 Building Blox tests
│   ├── match3.test.js     # 12 tile clearing tests
│   ├── ux.test.js         # 52 UX diagnostic tests
│   ├── gcp.test.js        # 12 GCP resilience tests
│   └── perf.test.js       # 15 performance benchmarks
├── Dockerfile             # Cloud Run deployment (node:20-alpine)
└── .github/
    └── workflows/
        └── ci.yml         # CI: test on Node 20+22, Docker build
```

---

## 🧪 Testing

```bash
npm test          # All 273 tests (unit + API + blox + match3 + UX + GCP + perf + stress + syntax)
npm run test:perf # Performance benchmarks only
```

| Type       | File                              | Tests |
| ---------- | --------------------------------- | ----: |
| **Unit**   | `tests/unit.test.js`              |    49 |
| **API**    | `tests/api.test.js`               |    26 |
| **Blox**   | `tests/blox.test.js`              |    30 |
| **M3**     | `tests/match3.test.js`            |    12 |
| **UX**     | `tests/ux.test.js`                |    52 |
| **GCP**    | `tests/gcp.test.js`               |    12 |
| **Perf**   | `tests/perf.test.js`              |    15 |
| **Stress** | `tests/game-logic-stress.test.js` |    64 |
| **Syntax** | `tests/syntax.test.js`            |    13 |

---

## 🚢 Deployment

```bash
# Google Cloud Run (build + deploy in one step)
gcloud run deploy game-hub \
  --source . \
  --region europe-west4 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "DISCORD_CLIENT_ID=...,DISCORD_CLIENT_SECRET=...,DISCORD_REDIRECT_URI=...,GCS_BUCKET=..."
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

**8 crops** with progressive pricing:

| Crop           | Growth |  Sell | Seed Cost |
| -------------- | ------ | ----: | --------: |
| 🍓 Strawberry  | 15s    |  15🪙 |       5🪙 |
| 🍅 Tomato      | 30s    |  30🪙 |      10🪙 |
| 🌽 Corn        | 45s    |  50🪙 |      20🪙 |
| 🌻 Sunflower   | 60s    |  80🪙 |      35🪙 |
| 🌹 Golden Rose | 90s    | 150🪙 |      60🪙 |
| 🫐 Blueberry   | 20s    |  20🪙 |       8🪙 |
| 🍉 Watermelon  | 75s    | 120🪙 |      45🪙 |
| 🎃 Pumpkin     | 120s   | 250🪙 |     100🪙 |

**Purchasable plots** (6 free → max 12): doubling cost 200 → 400 → 800 → 1600 → 3200 → 6400🪙

---

## 💾 Persistence Strategy

> Each game uses the persistence approach best suited to its gameplay pattern:

- **Farm & Pet**: Server-authoritative — all state in Firestore, client polls and pushes via REST API.
- **Match-3**: Client-side `localStorage` + server `sync-modes` for cross-device persistence. Server for leaderboard. Firestore board data includes automatic object→array hydration.
- **Blox**: Client-side `localStorage` + server `sync` for cross-device resume. Server for leaderboard. Firestore board/tray data includes automatic hydration.
- **Trivia**: Ephemeral — no persistence between sessions (each game is fresh).

---

## 🔬 Architecture Evolution (v5 Roadmap)

### ✅ Completed in v5.0.2

1. ~~**Cascade Animation Redesign**~~: Rewrote `animateCascade()` from 2-phase to 4-phase pipeline (matched-highlight → pop → full-sync → column-staggered fall). Adaptive speed curve (×0.85 per step). Post-cascade `renderBoard()` sync.
2. ~~**State Desync Self-Healing**~~: Dataset-type guard in `onCellClick()` + full 64-cell sync between cascade phases eliminates visual/logical desync.

### ✅ Completed in v5.0.1

1. ~~**Visual Smoothness Performance Audit**~~: Removed permanent `will-change` on 64 cells, eliminated `filter: brightness()` hover repaints, sparse cascade diff (3–10 cells vs 64), staggered Blox clearing, reduced `backdrop-filter: blur(12px)` → `blur(4px)` on both boards.
2. ~~**Star Drop Color Redesign**~~: All 3 drop gems given unique hues: 💰 hot pink H:330°, 🌾 chartreuse H:80°, ⚡ indigo H:240° — zero overlap with any regular gem.
3. ~~**Firestore Nested-Array Fix**~~: `savedState`/`savedModes` JSON-stringified before Firestore write + recursive `sanitizeForFirestore()` strips `undefined` values.
4. ~~**Blox Ghost Animation Fix**~~: Position-diffed ghost rendering prevents `ghostBreathe` CSS animation restart on every mouse pixel.
5. ~~**Match-3 Swap Displacement Fix**~~: Inline `transform` cleanup after swap slide prevents gem displacement from sparse cascade diff.

### ✅ Completed in v5.0.0

1. ~~**Native ES Modules**~~: All 8 frontend modules migrated from IIFE to native `import`/`export`. Single module entry point (`main.js`). Server-injected import map for automatic cache busting.
2. ~~**Module Decomposition**~~: `match3/engine.js` (pure logic) and `blox/pieces.js` (static data) extracted as sub-modules.

### ✅ Completed in v4.14–v4.16

3. ~~**Native View Transitions + Persistent Navigation**~~: Implemented in v4.14.0.
4. ~~**Standardized `<dialog>` Overlays + Toast Queue**~~: All overlays migrated in v4.14.0–v4.14.3.
5. ~~**Juicy UI Foundation**~~: Spring physics, GPU-optimized animations, dynamic gravity, CSS containment, object-pooled float points. Implemented in v4.15.0–v4.15.3.
6. ~~**DOM-Cached Rendering**~~: Zero-innerHTML diff-update for Blox/Match-3. Event delegation, ghost tracking, cached nav. Implemented in v4.16.0.

### Planned

7. **Extended Decomposition**: Extract `match3/modes.js`, `match3/persistence.js`, `blox/drag.js` — requires shared state-object refactor.
8. **WebSocket State Sync**: Real-time bidirectional sync replacing `api()` fetch + optimistic fallbacks.

---

## 📝 License

This project is proprietary. All rights reserved.
