# 🎮 Game Hub — Discord Embedded Activity

> A 4-in-1 social game hub built as a **Discord Embedded App Activity**. Cozy Farm, Brain Blitz trivia, Gem Crush match-3, and Building Blox puzzle — all in one app with a unified pet companion, resource economy, and offline simulation.

**Current version: v4.12.3**

---

## 📸 Overview

| Feature                   | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| 🌱 **Cozy Farm**          | Plant, water, harvest crops · Buy plots · Seed shop with 8 crop types    |
| 🧠 **Brain Blitz**        | Solo trivia + async duels via invite codes · 3 difficulty tiers          |
| 💎 **Gem Crush**          | 8×8 match-3 with cascades, combos, and leaderboard · 3 game modes        |
| 🧱 **Building Blox**      | 10×10 block puzzle · 12 pieces · cross-device sync · touch drag          |
| 🐾 **Pet Companion**      | Free-roaming pet with smart docking · Auto-water/harvest/plant abilities |
| ⚡ **Energy System**      | Quick-feed modal · 3-min regen · Gates match-3 and trivia plays          |
| 💾 **Offline Simulation** | Auto-harvest, auto-plant, auto-water while away · Welcome-back report    |
| 🏠 **GameStore**          | Zustand-inspired slice pattern for state isolation between games         |
| 🔐 **Discord OAuth2**     | Dual-mode auth (token + userId fallback)                                 |
| 📱 **Mobile Nav**         | Bottom tab bar with emoji icons on touch devices                         |

---

## ⚙️ Tech Stack

| Layer        | Technology                               |
| ------------ | ---------------------------------------- |
| **Runtime**  | Node.js 20                               |
| **Frontend** | Vanilla JS + CSS (zero build step)       |
| **Backend**  | Express.js 4.18                          |
| **Storage**  | Google Cloud Storage (local fallback)    |
| **Auth**     | Discord Embedded App SDK 1.0             |
| **State**    | GameStore (Zustand-inspired vanilla JS)  |
| **Testing**  | Node.js built-in `node:test` (zero deps) |

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
├── server.js              # Express composition root (~220 lines)
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
│   │   ├── shared.js      # Discord SDK, auth, navigation, HUD, pet docking
│   │   ├── farm.js        # Farm module (plots, shop, buy-plot, optimistic updates)
│   │   ├── trivia.js      # Trivia (solo + duels, lobby, history)
│   │   ├── match3.js      # Match-3 engine (swap animation, cascades, leaderboard)
│   │   ├── blox.js        # Building Blox (persistence, pause, touch drag, ghost)
│   │   ├── pet.js         # Pet companion (roam, sleep, auto-water, abilities)
│   │   └── store.js       # GameStore (Zustand-like slice manager)
│   └── css/               # Modular CSS (base, farm, trivia, match3, blox, hud, pet)
├── tests/
│   ├── unit.test.js       # 49 unit tests (pure functions)
│   ├── api.test.js        # 24 API integration tests
│   ├── blox.test.js       # 30 Building Blox tests
│   ├── match3.test.js     # 12 tile clearing tests
│   ├── ux.test.js         # 42 UX diagnostic tests
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
npm test          # All 184 tests (unit + API + blox + match3 + UX + GCP + perf)
npm run test:perf # Performance benchmarks only
```

| Type     | File                   | Tests |
| -------- | ---------------------- | ----: |
| **Unit** | `tests/unit.test.js`   |    49 |
| **API**  | `tests/api.test.js`    |    24 |
| **Blox** | `tests/blox.test.js`   |    30 |
| **M3**   | `tests/match3.test.js` |    12 |
| **UX**   | `tests/ux.test.js`     |    42 |
| **GCP**  | `tests/gcp.test.js`    |    12 |
| **Perf** | `tests/perf.test.js`   |    15 |

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
| 🍅 Tomato      | 15s    |  15🪙 |       5🪙 |
| 🌽 Corn        | 30s    |  30🪙 |      12🪙 |
| 🌻 Sunflower   | 60s    |  80🪙 |      30🪙 |
| 🌹 Golden Rose | 90s    | 150🪙 |      60🪙 |
| 🫐 Blueberry   | 20s    |  20🪙 |       8🪙 |
| 🍉 Watermelon  | 75s    | 120🪙 |      45🪙 |
| 🎃 Pumpkin     | 120s   | 250🪙 |     100🪙 |
| 🌾 Wheat       | 45s    |  50🪙 |      18🪙 |

**Purchasable plots** (6 free → max 12): doubling cost 200 → 400 → 800 → 1600 → 3200 → 6400🪙

---

## 💾 Persistence Strategy

> Each game uses the persistence approach best suited to its gameplay pattern:

- **Farm & Pet**: Server-authoritative — all state on server, client polls and pushes via REST API.
- **Match-3**: Client-side `localStorage` + server `sync-modes` for cross-device persistence. Server for leaderboard.
- **Blox**: Client-side `localStorage` + server `sync` for cross-device resume. Server for leaderboard.
- **Trivia**: Ephemeral — no persistence between sessions (each game is fresh).

---

## 📝 License

This project is proprietary. All rights reserved.
