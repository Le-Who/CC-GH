/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Core Game Logic (Extracted for Testability)
 *  Pure functions with no side-effects or I/O dependencies
 * ═══════════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════
 *  ECONOMY CONFIG
 * ═══════════════════════════════════════════════════ */
export const ECONOMY = {
  ENERGY_MAX: 20,
  ENERGY_START: 20,
  ENERGY_REGEN_INTERVAL_MS: 150 * 1000, // 2.5 minutes (was 5 min)
  GOLD_START: 100,
  COST_MATCH3: 5,
  COST_TRIVIA: 3,
  REWARD_MATCH3_WIN: 40,
  REWARD_MATCH3_LOSE: 5,
  REWARD_TRIVIA_WIN: 25,
  REWARD_TRIVIA_LOSE: 5,
  FEED_ENERGY: 2,
  FEED_PET_XP: 10,
  COST_BLOX: 4,
  REWARD_BLOX_WIN: 35,
  REWARD_BLOX_LOSE: 5,
};

/**
 * Progressive gold reward for Match-3 based on score.
 * - score < 0 or 0: REWARD_MATCH3_LOSE
 * - 1..999: proportional (score / 1000) × base
 * - 1000..1999: base + 5% per 100 points
 * - 2000..2999: + 10% per 100 points
 * - 3000..3999: + 20% per 100 points
 * - 4000+: rate doubles each 1000 (capped at 200%)
 */
export function calcGoldReward(score) {
  const BASE = ECONOMY.REWARD_MATCH3_WIN;
  if (typeof score !== "number" || score <= 0)
    return ECONOMY.REWARD_MATCH3_LOSE;
  if (score < 1000)
    return Math.max(
      ECONOMY.REWARD_MATCH3_LOSE,
      Math.floor(BASE * (score / 1000)),
    );

  let gold = BASE; // 1000 points = full base reward
  const tiers = [
    { min: 1000, max: 1999, ratePer100: 0.05 },
    { min: 2000, max: 2999, ratePer100: 0.1 },
    { min: 3000, max: 3999, ratePer100: 0.2 },
  ];

  for (const tier of tiers) {
    if (score < tier.min) break;
    const inTier = Math.min(score, tier.max + 1) - tier.min;
    const steps = Math.floor(inTier / 100);
    gold += Math.floor(steps * tier.ratePer100 * BASE);
  }

  // Beyond 4000: continue doubling, cap at 200% per 100 pts
  if (score >= 4000) {
    let tierStart = 4000;
    let rate = 0.4;
    while (tierStart <= score) {
      const tierEnd = tierStart + 999;
      const inTier = Math.min(score, tierEnd + 1) - tierStart;
      const steps = Math.floor(inTier / 100);
      gold += Math.floor(steps * rate * BASE);
      tierStart += 1000;
      rate = Math.min(rate * 2, 2.0);
    }
  }
  return gold;
}

/* ═══════════════════════════════════════════════════
 *  CROP DEFINITIONS
 * ═══════════════════════════════════════════════════ */
export const CROPS = {
  strawberry: {
    id: "strawberry",
    name: "Strawberry",
    emoji: "🍓",
    growthTime: 15000,
    sellPrice: 15,
    seedPrice: 5,
    xp: 5,
  },
  tomato: {
    id: "tomato",
    name: "Tomato",
    emoji: "🍅",
    growthTime: 30000,
    sellPrice: 30,
    seedPrice: 10,
    xp: 10,
  },
  corn: {
    id: "corn",
    name: "Corn",
    emoji: "🌽",
    growthTime: 45000,
    sellPrice: 50,
    seedPrice: 20,
    xp: 15,
  },
  sunflower: {
    id: "sunflower",
    name: "Sunflower",
    emoji: "🌻",
    growthTime: 60000,
    sellPrice: 80,
    seedPrice: 35,
    xp: 25,
  },
  golden: {
    id: "golden",
    name: "Golden Rose",
    emoji: "🌹",
    growthTime: 90000,
    sellPrice: 150,
    seedPrice: 60,
    xp: 50,
  },
  blueberry: {
    id: "blueberry",
    name: "Blueberry",
    emoji: "🫐",
    growthTime: 20000,
    sellPrice: 20,
    seedPrice: 8,
    xp: 8,
  },
  watermelon: {
    id: "watermelon",
    name: "Watermelon",
    emoji: "🍉",
    growthTime: 75000,
    sellPrice: 120,
    seedPrice: 45,
    xp: 35,
  },
  pumpkin: {
    id: "pumpkin",
    name: "Pumpkin",
    emoji: "🎃",
    growthTime: 120000,
    sellPrice: 250,
    seedPrice: 100,
    xp: 80,
  },
};

/* ═══════════════════════════════════════════════════
 *  MATCH-3 CONSTANTS
 * ═══════════════════════════════════════════════════ */
export const GEM_TYPES = ["fire", "water", "earth", "air", "light", "dark"];
export const BOARD_SIZE = 8;

/* ═══════════════════════════════════════════════════
 *  PLAYER FACTORY
 * ═══════════════════════════════════════════════════ */
export function createDefaultPlayer(userId, username, now = Date.now()) {
  return {
    id: userId,
    username: username || "Player",
    schemaVersion: 2,
    _lastSeen: now,
    resources: {
      gold: ECONOMY.GOLD_START,
      energy: {
        current: ECONOMY.ENERGY_START,
        max: ECONOMY.ENERGY_MAX,
        lastRegenTimestamp: now,
      },
    },
    pet: {
      name: "Buddy",
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      skinId: "basic_dog",
      stats: { happiness: 100 },
      abilities: { autoHarvest: false, autoWater: false, autoPlant: false },
    },
    farm: {
      coins: 0,
      xp: 0,
      level: 1,
      plots: Array.from({ length: 6 }, (_, i) => ({
        id: i,
        crop: null,
        plantedAt: null,
        watered: false,
      })),
      inventory: { strawberry: 5, planter: 2 },
      harvested: {},
    },
    trivia: {
      totalScore: 0,
      totalCorrect: 0,
      totalPlayed: 0,
      bestStreak: 0,
      session: null,
    },
    match3: {
      highScore: 0,
      totalGames: 0,
      currentGame: null,
    },
    blox: {
      highScore: 0,
      totalGames: 0,
    },
  };
}

/* ═══════════════════════════════════════════════════
 *  ENERGY SYSTEM — Lazy Passive Regeneration
 * ═══════════════════════════════════════════════════ */
export function calcRegen(player, now = Date.now()) {
  const e = player.resources.energy;
  if (e.current >= e.max) {
    e.lastRegenTimestamp = now;
    return;
  }
  const delta = now - e.lastRegenTimestamp;
  const regenAmount = Math.floor(delta / ECONOMY.ENERGY_REGEN_INTERVAL_MS);
  if (regenAmount > 0) {
    const newEnergy = Math.min(e.max, e.current + regenAmount);
    e.current = newEnergy;
    if (newEnergy < e.max) {
      e.lastRegenTimestamp = now - (delta % ECONOMY.ENERGY_REGEN_INTERVAL_MS);
    } else {
      e.lastRegenTimestamp = now;
    }
  }
}

/* ═══════════════════════════════════════════════════
 *  OFFLINE PROGRESS — Energy-based simulation loop
 *  Priority: Harvest → Plant → Water
 * ═══════════════════════════════════════════════════ */
export const OFFLINE_THRESHOLD_MS = 120000; // 2 minutes

export function processOfflineActions(player, now = Date.now()) {
  const lastSeen = player._lastSeen || now;
  const elapsed = now - lastSeen;
  player._lastSeen = now;

  // Only simulate if away for more than 2 minutes
  if (elapsed < OFFLINE_THRESHOLD_MS) return null;

  const e = player.resources.energy;
  const report = {
    offlineMinutes: Math.round(elapsed / 60000),
    harvested: {},
    planted: {},
    autoWatered: 0,
    energyConsumed: 0,
    xpGained: 0,
  };

  // Step 1: Auto-Harvest (1 energy per crop)
  if (player.pet.abilities.autoHarvest && e.current > 0) {
    for (const plot of player.farm.plots) {
      if (e.current < 1) break;
      if (plot.crop && plot.plantedAt && getGrowthPct(plot, now) >= 1) {
        const cfg = CROPS[plot.crop];
        if (!cfg) continue;
        e.current -= 1;
        report.energyConsumed += 1;
        report.harvested[plot.crop] = (report.harvested[plot.crop] || 0) + 1;
        player.farm.harvested[plot.crop] =
          (player.farm.harvested[plot.crop] || 0) + 1;
        player.farm.xp += cfg.xp;
        report.xpGained += cfg.xp;
        plot.crop = null;
        plot.plantedAt = null;
        plot.watered = false;
      }
    }
  }

  // Step 2: Auto-Plant (2 energy per plant, random seed)
  if (player.pet.abilities.autoPlant && e.current >= 2) {
    const seedIds = Object.keys(player.farm.inventory).filter(
      (id) => CROPS[id] && player.farm.inventory[id] > 0,
    );
    for (const plot of player.farm.plots) {
      if (e.current < 2 || seedIds.length === 0) break;
      if (!plot.crop) {
        const idx = Math.floor(Math.random() * seedIds.length);
        const seedId = seedIds[idx];
        player.farm.inventory[seedId]--;
        if (player.farm.inventory[seedId] <= 0) {
          seedIds.splice(idx, 1);
        }
        e.current -= 2;
        report.energyConsumed += 2;
        report.planted[seedId] = (report.planted[seedId] || 0) + 1;
        plot.crop = seedId;
        plot.plantedAt = lastSeen + Math.floor(Math.random() * elapsed);
        plot.watered = false;
      }
    }
  }

  // Step 3: Auto-Water (free, ability-gated)
  if (player.pet.abilities.autoWater) {
    for (const plot of player.farm.plots) {
      if (plot.crop && !plot.watered) {
        plot.watered = true;
        report.autoWatered++;
      }
    }
  }

  // Update farm level
  const newLevel = Math.floor(player.farm.xp / 100) + 1;
  player.farm.level = newLevel;

  const hadActivity = report.energyConsumed > 0 || report.autoWatered > 0;
  return hadActivity ? report : null;
}

/* ═══════════════════════════════════════════════════
 *  FARM — Growth Calculations
 * ═══════════════════════════════════════════════════ */
export function getWateringMultiplier(crop) {
  const cfg = CROPS[crop];
  if (!cfg) return 0.7;
  if (cfg.growthTime >= 60000) return 0.55;
  if (cfg.growthTime >= 30000) return 0.6;
  return 0.7;
}

export function getGrowthPct(plot, now = Date.now()) {
  if (!plot.crop || !plot.plantedAt) return 0;
  const cfg = CROPS[plot.crop];
  if (!cfg) return 0;
  const elapsed = now - plot.plantedAt;
  const mult = plot.watered ? getWateringMultiplier(plot.crop) : 1;
  const time = cfg.growthTime * mult;
  return Math.min(1, elapsed / time);
}

/**
 * Progressive gold reward for Building Blox based on lines cleared.
 * Similar curve to calcGoldReward but tuned for block puzzle pace.
 */
export function calcBloxReward(score) {
  const BASE = ECONOMY.REWARD_BLOX_WIN;
  if (typeof score !== "number" || score <= 0) return ECONOMY.REWARD_BLOX_LOSE;
  if (score < 100)
    return Math.max(ECONOMY.REWARD_BLOX_LOSE, Math.floor(BASE * (score / 100)));
  let gold = BASE;
  if (score >= 100)
    gold += Math.floor(((Math.min(score, 300) - 100) / 50) * 0.08 * BASE);
  if (score >= 300)
    gold += Math.floor(((Math.min(score, 600) - 300) / 50) * 0.15 * BASE);
  if (score >= 600) gold += Math.floor(((score - 600) / 50) * 0.25 * BASE);
  return Math.min(gold, 400);
}

/* Building Blox — Piece Definitions
 * Each piece is an array of [row, col] offsets from top-left corner.
 */
export const BLOX_PIECES = [
  // 1-cell
  { id: "dot", cells: [[0, 0]], color: "#94a3b8" },
  // 2-cell
  {
    id: "h2",
    cells: [
      [0, 0],
      [0, 1],
    ],
    color: "#60a5fa",
  },
  {
    id: "v2",
    cells: [
      [0, 0],
      [1, 0],
    ],
    color: "#60a5fa",
  },
  // 3-cell L
  {
    id: "l3",
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    color: "#f97316",
  },
  {
    id: "l3r",
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
    ],
    color: "#f97316",
  },
  {
    id: "h3",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    color: "#22c55e",
  },
  {
    id: "v3",
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    color: "#22c55e",
  },
  // Tetrominos (4-cell)
  {
    id: "sq",
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    color: "#fbbf24",
  },
  {
    id: "t4",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
    color: "#a78bfa",
  },
  {
    id: "s4",
    cells: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    color: "#ef4444",
  },
  {
    id: "i4",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    color: "#06b6d4",
  },
  // Pentomino (5-cell)
  {
    id: "i5",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    color: "#e879f9",
  },
];

export function farmPlotsWithGrowth(farm, now = Date.now()) {
  return farm.plots.map((pl) => {
    const cfg = pl.crop ? CROPS[pl.crop] : null;
    return {
      ...pl,
      growth: getGrowthPct(pl, now),
      growthTime: cfg ? cfg.growthTime : 0,
      wateringMultiplier: pl.crop ? getWateringMultiplier(pl.crop) : 1,
    };
  });
}

/* ═══════════════════════════════════════════════════
 *  MATCH-3 — Board Generation & Match Detection
 * ═══════════════════════════════════════════════════ */
export function randomGem() {
  return GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
}

export function generateBoard() {
  const board = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    board[y] = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      let gem;
      do {
        gem = randomGem();
      } while (
        (x >= 2 && board[y][x - 1] === gem && board[y][x - 2] === gem) ||
        (y >= 2 && board[y - 1]?.[x] === gem && board[y - 2]?.[x] === gem)
      );
      board[y][x] = gem;
    }
  }
  return board;
}

export function findMatches(board) {
  const matches = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE - 2; x++) {
      if (
        board[y][x] &&
        board[y][x] === board[y][x + 1] &&
        board[y][x] === board[y][x + 2]
      ) {
        let end = x;
        while (end < BOARD_SIZE && board[y][end] === board[y][x]) end++;
        matches.push({
          type: board[y][x],
          gems: Array.from({ length: end - x }, (_, i) => ({ x: x + i, y })),
        });
        x = end - 1;
      }
    }
  }
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE - 2; y++) {
      if (
        board[y][x] &&
        board[y][x] === board[y + 1][x] &&
        board[y][x] === board[y + 2][x]
      ) {
        let end = y;
        while (end < BOARD_SIZE && board[end][x] === board[y][x]) end++;
        matches.push({
          type: board[y][x],
          gems: Array.from({ length: end - y }, (_, i) => ({ x, y: y + i })),
        });
        y = end - 1;
      }
    }
  }
  return matches;
}

/* ═══════════════════════════════════════════════════
 *  TRIVIA — Question Selection
 * ═══════════════════════════════════════════════════ */
export function pickQuestions(questions, count = 5, difficulty = "all") {
  let pool = [...questions];
  if (difficulty && difficulty !== "all")
    pool = pool.filter((q) => q.difficulty === difficulty);
  return pool
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(count, pool.length));
}

export function makeClientQuestion(q, index, total) {
  const answers = [q.correctAnswer, ...q.wrongAnswers].sort(
    () => Math.random() - 0.5,
  );
  return {
    question: q.question,
    answers,
    category: q.category,
    difficulty: q.difficulty,
    points: q.points,
    timeLimit: q.timeLimit,
    index,
    total,
  };
}
