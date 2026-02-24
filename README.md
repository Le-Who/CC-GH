# 🎮 Game Hub — Discord Embedded Activity

> A 5-in-1 social game hub built as a **Discord Embedded App Activity**. Cozy Farm, Brain Blitz trivia, Gem Crush match-3, Building Blox puzzle, and Gacha Merge — all in one app with a unified pet companion, resource economy, and offline simulation.

**Current version: v7.2.0**

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
| ⚡ **Energy System**      | Native dialog overlays · 2.5-min regen · Gates match-3 and trivia plays      |
| 💣 **Farm Uproot**        | Hold-to-confirm 2.5s removal of unwanted crops (no refund)                   |
| 🔓 **Progressive Unlock** | Seeds gated by harvests, quests, gold, plots, days · unlock celebrations     |
| 🌟 **Featured Shelf**     | 4-seed rotating shelf, curated by purchase history, refreshes every 4 hours  |
| 🎨 **4 Themes**           | Neon Night · Cozy Day · Soft Fantasy · Minimal Calm · Seasonal auto-rotate   |
| 💾 **Offline Simulation** | Auto-harvest, auto-plant, auto-water while away · Welcome-back report        |
| 🏠 **GameStore**          | Zustand-inspired slice pattern for state isolation between games             |
| 🔐 **Discord OAuth2**     | Dual-mode auth (token + userId fallback)                                     |
| 📱 **Navigation**         | Persistent bottom tab bar with Native HTML5 View Transitions                 |
| ✨ **Nav Shimmer + Dots** | Active tab shimmer effect · Green notification dot on Farm when crops ready  |
| 🔤 **Emoji Consistency**  | Robust font stack: Noto Color Emoji + Apple/Segoe fallbacks                  |

---

## ⚙️ Tech Stack

| Layer        | Technology                               |
| ------------ | ---------------------------------------- |
| **Runtime**  | Node.js 20                               |
| **Frontend** | React 18 + Vite + Tailwind CSS v3        |
| **Backend**  | Express.js 5.x                           |
| **Database** | Google Cloud Firestore                   |
| **Storage**  | Google Cloud Storage (legacy backup)     |
| **Auth**     | Discord Embedded App SDK 1.0             |
| **State**    | Zustand (React) + GameStore proxy        |
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
├── server.js              # Express composition root (~350 lines)
├── playerManager.js       # Player state, persistence, schema migration
├── game-logic.js          # Pure functions (crops, energy, offline simulation)
├── storage.js             # GCS + local file persistence adapter
├── routes/                # Feature-specific Express routers
│   ├── farm.js            # /api/farm/* + /api/content/crops
│   ├── resources.js       # /api/resources/* + /api/pet/* + sell-crop
│   ├── trivia.js          # Solo trivia + duel rooms + history
│   ├── match3.js          # /api/game/* (state, start, move, end, sync)
│   ├── blox.js            # /api/blox/* (start, end, state, sync)
│   ├── mergeRoutes.js     # /api/merge/* (state, tap, merge, gacha, free-pull, trash)
│   ├── questRoutes.js     # /api/quests/* (active, generate, submit)
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
│   │   ├── hud.js         # Energy + Gold HUD, regen timer, Quest Log
│   │   ├── pet.js         # Pet companion (roam, sleep, auto-water, abilities)
│   │   ├── farm.js        # Farm module (plots, shop, buy-plot, optimistic updates)
│   │   ├── trivia.js      # Trivia (solo + duels, lobby, history)
│   │   ├── match3.js      # Match-3 barrel (swap animation, cascades, leaderboard)
│   │   ├── match3/
│   │   │   └── engine.js   # Pure game logic (generateBoard, findMatches, resolveBoard)
│   │   ├── blox.js        # Building Blox barrel (pause, touch drag, ghost)
│   │   ├── blox/
│   │   │   └── pieces.js   # Static piece definitions (12 shapes)
│   │   └── merge.js       # Gacha Merge engine (server-validated D&D, generators)
│   └── css/               # Modular CSS (base, farm, trivia, match3, blox, merge, hud, pet)
├── tests/
│   ├── unit.test.js       # 59 unit tests (pure functions)
│   ├── api.test.js        # 26 API integration tests
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
npm test          # All 343 tests (unit + API + blox + match3 + UX + GCP + perf + stress + syntax)
npm run test:perf # Performance benchmarks only
```

| Type       | File                              | Tests |
| ---------- | --------------------------------- | ----: |
| **Unit**   | `tests/unit.test.js`              |    59 |
| **API**    | `tests/api.test.js`               |    26 |
| **Blox**   | `tests/blox.test.js`              |    30 |
| **M3**     | `tests/match3.test.js`            |    12 |
| **UX**     | `tests/ux.test.js`                |    75 |
| **GCP**    | `tests/gcp.test.js`               |    20 |
| **Perf**   | `tests/perf.test.js`              |    15 |
| **Stress** | `tests/game-logic-stress.test.js` |    58 |
| **Syntax** | `tests/syntax.test.js`            |    14 |

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

## 💾 Persistence Strategy

> Each game uses the persistence approach best suited to its gameplay pattern:

- **Farm & Pet**: Server-authoritative — all state in Firestore, client polls and pushes via REST API.
- **Match-3**: Client-side `localStorage` + server `sync-modes` for cross-device persistence. Server for leaderboard. Firestore board data includes automatic object→array hydration.
- **Blox**: Client-side `localStorage` + server `sync` for cross-device resume. Server for leaderboard. Firestore board/tray data includes automatic hydration.
- **Merge**: Fully server-authoritative — all actions validated on server (`/api/merge/*`). Client uses optimistic updates with automatic rollback on rejection.
- **Quests**: Server-authoritative — order generation, requirement validation, item deduction, and reward granting all server-side (`/api/quests/*`).
- **Trivia**: Ephemeral — no persistence between sessions (each game is fresh).

---

## 🔬 Architecture Evolution & Updates

Older architecture evolution changes can be found in `legacy_readme.md`.

### ✅ Completed in v7.2.0

1. **Player Experience Overhaul**:
   - **Progressive Seed Unlocking**: 6 crops gated by player milestones (harvests, quests, gold, plots, days).
   - **Featured Seed Shelf**: 4-seed rotating shelf with untried seed prioritization and live countdown.
   - **4 Themes**: Neon Night, Cozy Day, 🌸 Soft Fantasy (plum/lavender dark), 🍃 Minimal Calm (zen white/sage).
   - **Seasonal auto-rotation**: Month-based theme suggestion (Spring → Soft Fantasy, Summer → Cozy Day).
2. **Juice Animations**:
   - Trivia: 3D card flip, correct pop, streak glow, stagger-fade answers.
   - Merge: magnetic pull, collide flash, gacha capsule bounce, rarity light spear.
   - Pet: tap bounce, heart burst, dust puff.
   - Match-3: spring swap. Blox: place bounce.
3. **Psychological Marketing Integration** (v6.3.0):
   - GameStore with Decoy bundle & Scarcity timers.
   - Quest Log with Goal-Gradient effect.
   - Welcome Back modal (Zeigarnik effect).
   - Match-3 particle splash (Peak-End Rule), Pet renaming (IKEA Effect).

---

## 📝 License

This project is proprietary. All rights reserved.
