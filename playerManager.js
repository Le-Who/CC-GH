/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Player Manager (v10.0 — Postgres ACID)
 *  Relational database primary architecture using Postgres.
 *  Redis retained strictly as a read-through cache & rate-limiter.
 *
 *  v10.0: Replaced Firestore & Redis SETNX with Postgres 
 *         row-level locking (SELECT ... FOR UPDATE).
 *         Global `players` Map completely eliminated for true
 *         horizontal scaling.
 * ═══════════════════════════════════════════════════════
 */

import { ECONOMY, createDefaultPlayer } from "./game-logic.js";
import { getDb } from "./db.js";
import {
  isRedisEnabled,
  redisSetPlayer,
  redisGetOrLoadPlayer,
} from "./redisAdapter.js";

/* ═══════════════════════════════════════════════════
 *  POSTGRES ACID LOCK & STATE INIT
 * ═══════════════════════════════════════════════════ */

/**
 * Executes an async function exclusively per player, using Postgres row-level locks.
 * 
 * 1. Reads from Redis BEFORE opening the transaction.
 * 2. Opens Postgres transaction.
 * 3. UPSERTS the player to ensure the row exists.
 * 4. SELECTs the row FOR UPDATE (acquires ACID lock).
 * 5. Applies backward-compatible schema migrations.
 * 6. Executes route handler logic.
 * 7. UPSERTs mutated result back to Postgres.
 * 8. Writes thru to Redis synchronously before returning.
 */
export async function withPlayerLock(userId, asyncFn, username = null) {
  const sql = getDb();
  if (!sql) {
    throw new Error("DATABASE_URL must be configured for v10.0 Postgres migration.");
  }



  try {
    return await sql.begin(async (tx) => {
    // 1. Guarantee row exists before locking (UPSERT -> DO NOTHING)
    // v10.1: Cleaner default name (omit sa_ prefix or raw IDs)
    const displayName = username || `Player_${userId.slice(-4)}`;
    const defaultPlayer = createDefaultPlayer(userId, displayName);
    
    await tx`
      INSERT INTO players (id, data, updated_at)
      VALUES (${userId}, ${defaultPlayer}, now())
      ON CONFLICT (id) DO NOTHING
    `;

    // 2. Acquire ACID row lock
    const [row] = await tx`
      SELECT data FROM players WHERE id = ${userId} FOR UPDATE
    `;

    // 3. Reconcile state & Apply Migrations
    let playerRaw = row.data;
    let player = applyMigrations(playerRaw);

    // v10.1: Sync username from current auth session to ensure leaderboard accuracy
    if (username && player.username !== username) {
      player.username = username;
    }

    // v10.2: Sync _lastSeen to current time after every active session.
    // This ensures that manual actions "count" as activity, preventing
    // subsequent offline simulations from overlapping with these actions.
    player._lastSeen = Date.now();

    // 4. Execute Route Handler
    const result = await asyncFn(player);

    // 5. Save back to DB within transaction
    await tx`
      UPDATE players SET data = ${player}, updated_at = now()
      WHERE id = ${userId}
    `;

    // 6. Write-through to Redis cache
    if (isRedisEnabled()) {
      await redisSetPlayer(userId, player).catch((err) => console.error("Redis write-through failed:", err.message));
    }

    return result || player;
    });
  } catch (err) {
    if (err.message === "EXPRESS_RESPONSE_ABORT") {
      return err.result;
    }
    console.error(`[withPlayerLock] Unhandled exception for user ${userId}:`, err);
    throw err;
  }
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
  if (!sql) return null;
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
  const currentSchemaVersion = 7;
  
  if (!p) return null;

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
        plot.crop = null; plot.plantedAt = null; plot.watered = false;
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

  return p;
}
