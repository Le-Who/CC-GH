/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Player Factory & Energy System
 *  Default player creation and energy regen.
 * ═══════════════════════════════════════════════════
 */

import { ECONOMY } from "./economy.js";
import { createDefaultYardState } from "./yard.js";

/* ═══════════════════════════════════════════════════
 *  PLAYER FACTORY & TYPES
 * ═══════════════════════════════════════════════════ */

/**
 * @typedef {Object} FarmPlot
 * @property {number} id
 * @property {string|null} crop
 * @property {number|null} plantedAt
 * @property {boolean} watered
 */

/**
 * @typedef {Object} PlayerState
 * @property {string} id
 * @property {string} username
 * @property {number} schemaVersion
 * @property {number} _lastSeen
 * @property {boolean} _onboarded
 * @property {Object} resources
 * @property {number} resources.gold
 * @property {Object} resources.energy
 * @property {number} resources.energy.current
 * @property {number} resources.energy.max
 * @property {number} resources.energy.lastRegenTimestamp
 * @property {number} resources.gachaTokens
 * @property {Object} pet
 * @property {Object} room
 * @property {Object} yard
 * @property {Object} farm
 * @property {number} farm.xp
 * @property {number} farm.level
 * @property {FarmPlot[]} farm.plots
 * @property {Object.<string, number>} farm.inventory
 * @property {Object.<string, number>} farm.harvested
 * @property {Object} merge
 * @property {Object} trivia
 * @property {Object} match3
 * @property {Object} blox
 * @property {Object} garden
 * @property {Object} streak
 * @property {Object} achievements
 * @property {Object} journal
 * @property {Object} cosmetics
 * @property {Object} seasonPass
 * @property {Object} boosters
 * @property {Object} stats
 * @property {number} stats.totalHarvests
 * @property {number} stats.totalGoldEarned
 */

/**
 * Creates the Garden Shelf state stored in the shared player document.
 * Garden gold itself remains the top-level shared resource.
 */
export function createDefaultGardenState(now = Date.now()) {
  return {
    totalGoldEarned: 0,
    level: 1,
    xp: 0,
    shelvesUnlocked: 1,
    plants: [],
    lastTick: now,
    offlineEarnings: null,
  };
}

/**
 * Creates a default player state object.
 * @param {string} userId 
 * @param {string} username 
 * @param {number} [now]
 * @returns {PlayerState}
 */
export function createDefaultPlayer(userId, username, now = Date.now()) {
  const BOARD_ROWS = 7,
    BOARD_COLS = 9;
  return {
    id: userId,
    username: username || "Player",
    schemaVersion: 11,
    _lastSeen: now,
    _onboarded: false,
    resources: {
      gold: ECONOMY.GOLD_START,
      energy: {
        current: ECONOMY.ENERGY_START,
        max: ECONOMY.ENERGY_MAX,
        lastRegenTimestamp: now,
      },
      gachaTokens: 0,
    },
    pet: {
      name: "Buddy",
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      skinId: "basic_dog",
      stats: { happiness: 100, fullness: 0 },
      lastDigestionTimestamp: now,
      activeOrders: [],
      affectionXp: 0,
      affectionLevel: 1,
      abilities: { autoHarvest: false, autoWater: false, autoPlant: false },
    },
    room: { decorations: [], inventory: [], wallpaper: "default" },
    yard: createDefaultYardState(now, {
      pet: {
        name: "Buddy",
        skinId: "basic_dog",
      },
      room: { decorations: [], inventory: [], wallpaper: "default" },
    }),
    farm: {
      xp: 0,
      level: 1,
      plots: Array.from({ length: 6 }, (_, i) => ({
        id: i,
        crop: null,
        plantedAt: null,
        watered: false,
      })),
      inventory: { strawberry: 5 },
      harvested: {},
    },
    merge: {
      board: Array.from({ length: BOARD_ROWS }, () =>
        Array(BOARD_COLS).fill(null),
      ),
      generators: ["textile"], // Unlocked generator chain IDs
      inventory: [], // Unplaced items from gacha
      lastFreePull: 0, // Timestamp of last daily free pull
      lastFreeTaps: 0,
      freeTapCharges: 0,
      generatorState: {
        // Per-chain cooldown tracking
        textile: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
      },
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
      activeGame: false,
    },
    garden: createDefaultGardenState(now),
    bubbo: {
      highScore: 0,
      totalGames: 0,
      currentGame: null,
    },
    streak: { current: 0, best: 0, lastLoginDate: null, bonusMultiplier: 1 },
    achievements: {},
    journal: { discovered: [] },
    cosmetics: { activePlotTheme: "default", ownedThemes: ["default"] },
    seasonPass: { season: 1, xp: 0, tier: 0, claimed: [] },
    boosters: { fertilizer: { active: false, expiresAt: 0 } },
    stats: { totalHarvests: 0, totalGoldEarned: ECONOMY.GOLD_START },
  };
}

/* ═══════════════════════════════════════════════════
 *  ENERGY SYSTEM — Lazy Passive Regeneration
 * ═══════════════════════════════════════════════════ */
export function calcRegen(player, now = Date.now()) {
  const e = player.resources.energy;
  const maxEnergy = e.max;

  if (e.current >= maxEnergy) {
    e.lastRegenTimestamp = now;
    return;
  }
  const delta = now - e.lastRegenTimestamp;
  const regenAmount = Math.floor(delta / ECONOMY.ENERGY_REGEN_INTERVAL_MS);
  if (regenAmount > 0) {
    const newEnergy = Math.min(maxEnergy, e.current + regenAmount);
    e.current = newEnergy;
    if (newEnergy < maxEnergy) {
      e.lastRegenTimestamp = now - (delta % ECONOMY.ENERGY_REGEN_INTERVAL_MS);
    } else {
      e.lastRegenTimestamp = now;
    }
  }
}

/* ═══════════════════════════════════════════════════
 *  PET SATIETY — Digestion Calculation (time-travel-proof)
 * ═══════════════════════════════════════════════════ */
export function calculateSatietyDelta(
  petState,
  currentTime,
  roomBonuses = { fullnessRate: 1, happinessRate: 1 },
) {
  const fullness = petState?.stats?.fullness ?? 0;
  const lastTs = petState?.lastDigestionTimestamp ?? currentTime;
  const rawDelta = Math.max(0, currentTime - lastTs);
  // Cap offline progress at 24 hours to prevent time-travel exploits
  const cappedDelta = Math.min(rawDelta, ECONOMY.SATIETY_OFFLINE_CAP_MS);

  const decayRate = ECONOMY.SATIETY_DECAY_PER_HOUR * roomBonuses.fullnessRate;
  const digested = Math.floor(cappedDelta / 3_600_000) * decayRate;

  return {
    fullness: Math.max(0, fullness - digested),
    lastDigestionTimestamp: currentTime,
  };
}
