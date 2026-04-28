/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Player Manager (v10.0 — Postgres ACID)
 *  Relational database primary architecture using PostgreSQL.
 *  Redis retained strictly as a read-through cache and rate-limiter.
 *
 *  v10.0: Replaced document-store persistence with PostgreSQL
 *         optimistic concurrency control.
 *         Global `players` Map completely eliminated for true
 *         horizontal scaling.
 * ═══════════════════════════════════════════════════════
 */

import crypto from "crypto";
import { ECONOMY, createDefaultPlayer, createDefaultGardenState, createDefaultYardState, checkAchievements } from "./game-logic.js";
import { getDb } from "./db.js";
import { getIO } from "./socketManager.js";
import {
  isRedisEnabled,
  redisSetPlayer,
  redisGetOrLoadPlayer,
} from "./redisAdapter.js";

/* ═══════════════════════════════════════════════════
 *  HYBRID LOCKING: In-Process Mutex + OCC Safety Net
 *
 *  Layer 1: In-process Promise-chain mutex per accountId
 *           → serializes requests within a single Node instance
 *           → zero DB overhead, zero lock contention
 *
 *  Layer 2: OCC _version nonce on UPDATE
 *           → distributed safety net for horizontal scaling
 *           → catches races between multiple Node instances
 * ═══════════════════════════════════════════════════ */

/** @type {Map<string, Promise<any>>} */
const _mutexChain = new Map();
const _memoryPlayers = new Map();

/**
 * Acquires an in-process mutex for the given account ID.
 * Concurrent calls for the same account are queued and executed serially.
 * Different accounts proceed in parallel with no contention.
 */
function _acquireMutex(userId, fn) {
  const prev = _mutexChain.get(userId) || Promise.resolve();
  const next = prev
    .catch(() => {}) // swallow previous errors so chain doesn't break
    .then(() => fn());
  _mutexChain.set(userId, next);
  // Cleanup entry when chain completes to prevent memory leak
  next.finally(() => {
    if (_mutexChain.get(userId) === next) _mutexChain.delete(userId);
  });
  return next;
}

function allowMemoryPlayerStore() {
  return process.env.NODE_ENV === "test";
}

function emitPlayerSync(userId, player) {
  const io = getIO();
  if (!io) return;
  io.to(userId).emit("player_sync", {
    seq: player._syncSeq,
    serverTime: Date.now(),
    payload: {
      resources: player.resources,
      harvested: player.farm.harvested,
      plots: player.farm.plots,
      merge: player.merge,
      garden: player.garden,
      yard: player.yard,
      pet: player.pet,
      achievements: player.achievements,
    },
  });
}

/**
 * Executes an async function exclusively per player.
 *
 * 1. Acquires in-process mutex (serializes within this Node instance).
 * 2. UPSERTs the player (DO NOTHING if exists).
 * 3. Fetches current state & _version without DB locks.
 * 4. Executes route handler (re-applied on every OCC retry attempt).
 * 5. Saves state back using OCC (UPDATE ... WHERE _version = old).
 * 6. If OCC fails (multi-instance race), retries up to 3 times.
 *
 * CRITICAL: asyncFn is called on EVERY retry attempt against freshly-loaded
 * state. This ensures mutations are never silently dropped during OCC
 * collisions. The HTTP response (res.json) is only sent on the first
 * attempt; subsequent calls to res.json are harmlessly ignored by Express.
 */
export async function withPlayerLock(userId, asyncFn, username = null) {
  const sql = getDb();
  if (!sql) {
    if (!allowMemoryPlayerStore()) {
      throw new Error("DATABASE_URL must be configured for v10.0 Postgres migration.");
    }
    return _acquireMutex(userId, async () => {
      const displayName = username || `Player_${userId.slice(-4)}`;
      let player = _memoryPlayers.get(userId);
      if (!player) {
        player = createDefaultPlayer(userId, displayName);
        player._version = crypto.randomUUID();
      }
      player = applyMigrations(player);
      if (username && player.username !== username) player.username = username;
      player._lastSeen = Date.now();

      const handlerResult = await asyncFn(player);
      checkAchievements(player);
      player._syncSeq = Number(player._syncSeq || 0) + 1;
      player._version = crypto.randomUUID();
      _memoryPlayers.set(userId, player);
      emitPlayerSync(userId, player);
      return handlerResult === undefined ? player : handlerResult;
    });
  }

  return _acquireMutex(userId, async () => {
    try {
      const displayName = username || `Player_${userId.slice(-4)}`;
      const defaultPlayer = createDefaultPlayer(userId, displayName);
      defaultPlayer._version = crypto.randomUUID();

      // 1. Guarantee row exists without bumping state
      await sql`
        INSERT INTO players (id, data, updated_at)
        VALUES (${userId}, ${defaultPlayer}, now())
        ON CONFLICT (id) DO NOTHING
      `;

      const OCC_RETRIES = 3;
      for (let attempt = 1; attempt <= OCC_RETRIES; attempt++) {
        // 2. Lock-free fetch (always get fresh state on each attempt)
        const [row] = await sql`SELECT data FROM players WHERE id = ${userId}`;
        if (!row) throw new Error(`FATAL: Player row missing for ${userId}`);

        let playerRaw = row.data;
        let player = applyMigrations(playerRaw);
        const oldVersion = playerRaw._version || "0";

        // Reconcile standard state
        if (username && player.username !== username) {
          player.username = username;
        }
        player._lastSeen = Date.now();

        // 3. Execute Route Handler on EVERY attempt
        // On retries, asyncFn re-applies the mutation against fresh DB state.
        // res.json() calls on attempt >= 2 are harmlessly ignored (headersSent).
        // Side-effects like player_events INSERTs use .catch() (fire-and-forget)
        // so a duplicate analytics row is acceptable vs silent data loss.
        const handlerResult = await asyncFn(player);

        // Global safeguard: Verify all achievements automatically before DB freeze
        // even if the route neglected to evaluate or return them.
        checkAchievements(player);

        // 4. Generate next OCC version and realtime sequence.
        player._syncSeq = Number(player._syncSeq || 0) + 1;
        player._version = crypto.randomUUID();

        // 5. Save back using OCC (Atomic Update)
        const [updatedRow] = await sql`
          UPDATE players
          SET data = ${player}, updated_at = now()
          WHERE id = ${userId}
            AND COALESCE(data->>'_version', '0') = ${oldVersion}
          RETURNING id
        `;

        if (updatedRow) {
          // Success!
          if (isRedisEnabled()) {
            await redisSetPlayer(userId, player).catch((err) =>
              console.error("Redis write-through failed:", err.message)
            );
          }

          // Emit authenticated realtime sync.
          emitPlayerSync(userId, player);
          
          return handlerResult === undefined ? player : handlerResult;
        }

        // OCC collision (multi-instance race) — retry with fresh state
        console.warn(`[OCC] Retry ${attempt}/${OCC_RETRIES} for ${userId} — re-applying mutation against fresh state.`);
        if (attempt < OCC_RETRIES) {
          await new Promise((r) => setTimeout(r, 15 + Math.random() * 30));
        }
      }

      throw new Error(`[OCC] Max retries exhausted for ${userId}. Extreme cross-instance contention.`);
    } catch (err) {
      if (err.message === "EXPRESS_RESPONSE_ABORT") {
        return err.result;
      }
      console.error(`[withPlayerLock] Unhandled exception for user ${userId}:`, err);
      throw err;
    }
  });
}

/**
 * Ensures a player is loaded and readable (e.g. for GET requests).
 * Performs a lock-free SELECT without `FOR UPDATE`.
 */
export async function ensurePlayerLoaded(userId) {
  if (isRedisEnabled()) {
    await redisGetOrLoadPlayer(userId, _postgresLoadOnly);
    return;
  }
  await _postgresLoadOnly(userId);
}

/**
 * Read-only fetch from Postgres. No locking.
 */
async function _postgresLoadOnly(userId) {
  const sql = getDb();
  if (!sql) return _memoryPlayers.get(userId) || null;
  try {
    const [row] = await sql`SELECT data FROM players WHERE id = ${userId}`;
    return row ? row.data : null;
  } catch (e) {
    console.error(`Postgres load failed for ${userId}:`, e.message);
    return null;
  }
}

/* ─── Graceful Shutdown ─── */
// v10.0: Handled in db.js internally. No pending queues exist.
export const gracefulShutdown = async () => {
    console.log("Shutting down cleanly (no pending queues in v10).");
    process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

/* ─── Schema Migration Factory ─── */
/**
 * Applies necessary schema migrations continuously on load.
 * NOTE: getPlayer() no longer returns from a local Map. It is
 * strictly a migration pipeline used by withPlayerLock.
 */
export function applyMigrations(p) {
  const currentSchemaVersion = 11;
  
  if (!p) return null;

  if (!p.garden) p.garden = createDefaultGardenState(Date.now());
  if (!p.yard) p.yard = createDefaultYardState(Date.now(), { pet: p.pet, room: p.room });

  // v8.1: Early-return
  if (p.schemaVersion >= currentSchemaVersion) {
    return p;
  }

  if (!p.schemaVersion || p.schemaVersion < 2) {
    p.resources = {
      gold: ECONOMY.GOLD_START,
      energy: {
        current: ECONOMY.ENERGY_START,
        max: ECONOMY.ENERGY_MAX,
        lastRegenTimestamp: Date.now(),
      },
    };
    if (!p.farm) {
      p.farm = {
        coins: 0, xp: 0, level: 1,
        plots: Array.from({ length: 6 }, (_, i) => ({
          id: i, crop: null, plantedAt: null, watered: false,
        })),
        inventory: {}, harvested: {},
      };
    }
    if (!p.pet) {
      p.pet = {
        name: "Buddy", level: 1, xp: 0, xpToNextLevel: 100,
        skinId: "basic_dog", stats: { happiness: 100 },
        abilities: { autoHarvest: false, autoWater: false, autoPlant: false },
      };
    }
    if (!p.farm.harvested) p.farm.harvested = {};
    if (p.trivia) p.trivia.session = null;
    if (p.match3) p.match3.currentGame = null;
    if (p.match3 && !p.match3.savedModes) p.match3.savedModes = {};
    p.schemaVersion = 2;
  }

  if (p.schemaVersion < 3) {
    if (!p.pet.stats) p.pet.stats = { happiness: 100 };
    if (!("fullness" in p.pet.stats)) p.pet.stats.fullness = 0;
    if (!p.pet.lastDigestionTimestamp) p.pet.lastDigestionTimestamp = Date.now();
    if (!p.pet.activeOrders) p.pet.activeOrders = [];
    if (!p.pet.abilities) p.pet.abilities = {};
    if (!("autoPlant" in p.pet.abilities)) p.pet.abilities.autoPlant = false;
    if (!("gachaTokens" in p.resources)) p.resources.gachaTokens = 0;
    p.schemaVersion = 3;
  }

  if (p.schemaVersion < 4) {
    if (!p.merge) {
      const BOARD_ROWS = 7, BOARD_COLS = 9;
      p.merge = {
        board: Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null)),
        generators: ["textile"], inventory: [], lastFreePull: 0,
        lastFreeTaps: 0,
        freeTapCharges: 0,
        generatorState: { textile: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 } },
      };
    }
    if (!("affectionXp" in p.pet)) p.pet.affectionXp = 0;
    if (!("affectionLevel" in p.pet)) p.pet.affectionLevel = 1;
    p.schemaVersion = 4;
  }

  if (p.schemaVersion < 5) {
    p.resources.gold = ECONOMY.GOLD_START;
    p.farm.xp = 0;
    p.farm.level = 1;
    if (!p.farm.inventory) p.farm.inventory = {};
    p.farm.inventory.strawberry = Math.max(p.farm.inventory.strawberry || 0, 5);
    if (p.farm.plots) {
      for (const plot of p.farm.plots) {
        if (plot.crop !== null || plot.plantedAt !== null || plot.watered !== false) {
          plot.crop = null; plot.plantedAt = null; plot.watered = false;
        }
      }
    }
    if (p.match3) {
      p.match3.currentGame = null;
      p.match3.savedModes = {};
    }
    p._lastSeen = Date.now();
    p.resources.gachaTokens = (p.resources.gachaTokens || 0) + 5;
    p.schemaVersion = 5;
  }

  if (!p.blox) {
    p.blox = { highScore: 0, totalGames: 0, savedState: null };
  }
  if (p.blox && !("savedState" in p.blox)) {
    p.blox.savedState = null;
  }
  if (p.match3 && !p.match3.savedModes) {
    p.match3.savedModes = {};
  }

  if (!p.schemaVersion || p.schemaVersion < 6) {
    if (!p.streak) p.streak = { current: 0, best: 0, lastLoginDate: null, bonusMultiplier: 1 };
    if (!p.achievements) p.achievements = {};
    if (!p.journal) p.journal = { discovered: [] };
    if (!p.cosmetics) p.cosmetics = { activePlotTheme: "default", ownedThemes: ["default"] };
    if (!p.seasonPass) p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
    if (!p.boosters) p.boosters = { fertilizer: { active: false, expiresAt: 0 } };
    if (p.farm?.inventory?.planter !== undefined) delete p.farm.inventory.planter;
    p.schemaVersion = 6;
  }

  if (!p.schemaVersion || p.schemaVersion < 7) {
    if (!p.room) p.room = { decorations: [], inventory: [], wallpaper: "default" };
    p.schemaVersion = 7;
  }

  if (!p.schemaVersion || p.schemaVersion < 8) {
    if (!p.stats) {
      let estHarvests = 0;
      if (p.farm?.harvested) {
        estHarvests = Object.values(p.farm.harvested).reduce((a, b) => a + (Number(b) || 0), 0);
      }
      p.stats = {
        totalHarvests: estHarvests,
        totalGoldEarned: p.resources?.gold || ECONOMY.GOLD_START,
      };
    }
    p.schemaVersion = 8;
  }

  if (!p.schemaVersion || p.schemaVersion < 9) {
    if (!p.bubbo) {
      p.bubbo = { highScore: 0, totalGames: 0, currentGame: null };
    }
    p.schemaVersion = 9;
  }

  if (!p.schemaVersion || p.schemaVersion < 10) {
    if (!p.garden) p.garden = createDefaultGardenState(Date.now());
    p.schemaVersion = 10;
  }

  if (!p.schemaVersion || p.schemaVersion < 11) {
    if (!p.yard) p.yard = createDefaultYardState(Date.now(), { pet: p.pet, room: p.room });
    p.schemaVersion = 11;
  }

  if (!p.bubbo) {
    p.bubbo = { highScore: 0, totalGames: 0, currentGame: null };
  }
  if (p.bubbo && !("currentGame" in p.bubbo)) {
    p.bubbo.currentGame = null;
  }

  if (!p.merge) {
    const BOARD_ROWS = 7, BOARD_COLS = 9;
    p.merge = {
      board: Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null)),
      generators: ["textile"],
      inventory: [],
      lastFreePull: 0,
      lastFreeTaps: 0,
      freeTapCharges: 0,
      generatorState: {
        textile: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
      },
    };
  }
  if (!p.merge.generators) p.merge.generators = ["textile"];
  if (!p.merge.generatorState) p.merge.generatorState = {};
  if (p.merge.lastFreePull == null) p.merge.lastFreePull = 0;
  if (p.merge.lastFreeTaps == null) p.merge.lastFreeTaps = 0;
  if (p.merge.freeTapCharges == null) p.merge.freeTapCharges = 0;
  for (const chainId of p.merge.generators) {
    if (!p.merge.generatorState[chainId]) {
      p.merge.generatorState[chainId] = {
        tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
        cooldownEnd: 0,
      };
    }
  }

  return p;
}
