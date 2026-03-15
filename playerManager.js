/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Player Manager
 *  Hot-cache in-memory state backed by Google Cloud Firestore
 *  v8.0: Optional Upstash Redis read-through / write-through layer
 * ═══════════════════════════════════════════════════════
 */

import path from "path";
import { fileURLToPath } from "url";
import { Firestore } from "@google-cloud/firestore";
import { ECONOMY, createDefaultPlayer } from "./game-logic.js";
import {
  initRedis, isRedisEnabled, redisGetPlayer, redisSetPlayer,
  redisDeletePlayer, redisBulkLoad, redisShutdown,
} from "./redisAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ═══════════════════════════════════════════════════
 *  FIRESTORE & STATE INIT
 * ═══════════════════════════════════════════════════ */
export const players = new Map(); // userId -> { resources, pet, farm, trivia, match3 }
const pendingSaves = new Map(); // userId -> timeoutId
const playerLocks = new Map(); // userId -> Promise (mutex for concurrency)
const SAVE_DELAY_MS = 2000; // Debounce threshold for rapid actions
const MAX_CACHE_SIZE = 10000; // LRU eviction threshold

let firestore = null;
let playersCol = null;
let usersCol = null;    // Simple-auth: username → password_hash
let sessionsCol = null; // Simple-auth: token → { userId, username, createdAt }

/**
 * Executes an async function exclusively per player, preventing race conditions like double-spends.
 * v7.3: Backpressure — rejects with QUEUE_FULL if pending lock depth exceeds MAX_QUEUE_DEPTH.
 */
const MAX_QUEUE_DEPTH = 5;
const lockQueueDepth = new Map(); // userId -> number of pending locks

export async function withPlayerLock(userId, asyncFn) {
  const depth = lockQueueDepth.get(userId) || 0;

  // v7.3: Backpressure — reject if too many requests queued for this player
  if (depth >= MAX_QUEUE_DEPTH) {
    const err = new Error("QUEUE_FULL");
    err.statusCode = 429;
    throw err;
  }

  lockQueueDepth.set(userId, depth + 1);
  const currentLock = playerLocks.get(userId) || Promise.resolve();
  
  // Create a new lock that waits for the previous one
  const nextLock = currentLock.then(async () => {
    return await asyncFn();
  }).catch((err) => {
    // Prevent a failed lock from breaking the chain
    throw err;
  }).finally(() => {
    const d = (lockQueueDepth.get(userId) || 1) - 1;
    if (d <= 0) lockQueueDepth.delete(userId);
    else lockQueueDepth.set(userId, d);
  });
  
  playerLocks.set(userId, nextLock.catch(() => {})); // Store silent-catch to not crash unhandled extensions
  return nextLock;
}

/**
 * Initialize Firestore connection. Call from server start() instead of
 * module-level init — improves testability and prevents import-time crashes.
 */
export function initFirestore() {
  if (playersCol) return; // Already initialized
  try {
    const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
    const DB_ID = process.env.FIRESTORE_DB_ID || "game-hub-db";

    const firestoreConfig = { databaseId: DB_ID };
    if (PROJECT_ID) {
      firestoreConfig.projectId = PROJECT_ID;
    }

    firestore = new Firestore(firestoreConfig);
    playersCol = firestore.collection("players");
    usersCol = firestore.collection("users");
    sessionsCol = firestore.collection("sessions");
    console.log(
      `🔥 Firestore initialized successfully. (Project: ${PROJECT_ID || "default"}, DB: ${DB_ID})`,
    );
  } catch (e) {
    console.warn(
      "⚠️ Firestore init failed, falling back to memory:",
      e.message,
    );
  }

  // v8.0: Initialize Redis (feature-flagged via env vars)
  initRedis();
}

/** Accessor for users collection (simple-auth) */
export function getUsersCol() {
  return usersCol;
}

/** Accessor for sessions collection (simple-auth) */
export function getSessionsCol() {
  return sessionsCol;
}

/* ─── Persistence ─── */

/**
 * v5.0.1: Recursively sanitize data for Firestore.
 * Firestore rejects `undefined` values with "invalid nested entity".
 * This converts undefined → null and ensures arrays are dense.
 *
 * v6.1.1: Also detects nested arrays (array containing arrays) and
 * JSON-stringifies them — Firestore fundamentally rejects Array<Array>.
 * This fixes merge.board (7×9 2D array) and any future nested-array fields.
 */
function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    // v6.1.1: If any element is itself an array, stringify the whole thing.
    // Firestore cannot store nested arrays (e.g. board[7][9]).
    const hasNestedArray = obj.some((el) => Array.isArray(el));
    if (hasNestedArray) {
      return JSON.stringify(obj);
    }
    const result = [];
    for (let i = 0; i < obj.length; i++) {
      result[i] = sanitizeForFirestore(obj[i] !== undefined ? obj[i] : null);
    }
    return result;
  }
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = sanitizeForFirestore(val !== undefined ? val : null);
  }
  return result;
}

export async function loadDb() {
  if (playersCol) {
    try {
      // v7.3: Paginated loading — removes 1000-player cap
      let lastDoc = null;
      const PAGE_SIZE = 500;
      let totalLoaded = 0;
      let lastSnapshotSize = 0;
      do {
        let query = playersCol.orderBy("__name__").limit(PAGE_SIZE);
        if (lastDoc) query = query.startAfter(lastDoc);
        const snapshot = await query.get();
        if (snapshot.empty) break;
        snapshot.forEach((doc) => {
          players.set(doc.id, doc.data());
        });
        totalLoaded += snapshot.size;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        lastSnapshotSize = snapshot.size;
        if (snapshot.size < PAGE_SIZE) break; // Last page
      } while (lastSnapshotSize === PAGE_SIZE);
      if (totalLoaded > 0) {
        console.log(
          `🔥 DB loaded from Firestore: ${totalLoaded} players in hot-cache (paginated)`,
        );
      } else {
        console.log("🔥 Firestore DB is empty. Starting fresh.");
      }

      // v8.0: Bulk-populate Redis with loaded players
      if (isRedisEnabled()) {
        await redisBulkLoad(players);
      }

      return;
    } catch (e) {
      console.error("❌ Firestore read error:", e);
    }
  } else {
    console.log("  DB: starting fresh (no existing data found, no Firestore)");
  }
}

const maxWaitSaves = new Map(); // userId -> timestamp of first unsaved change
const MAX_WAIT_MS = 10000;

/**
 * Debounced save function for an individual player.
 * Prevents hammering Firestore on rapid clicks (e.g. harvesting crops).
 * v7.3: Guaranteed Max-Wait prevents starvation if player clicks continuously.
 */
export function debouncedSavePlayer(userId) {
  if (!playersCol) return; // Silent fallback if Firestore is missing

  const now = Date.now();
  let firstTrigger = maxWaitSaves.get(userId);
  if (!firstTrigger) {
    firstTrigger = now;
    maxWaitSaves.set(userId, firstTrigger);
  }

  // Calculate dynamic delay: standard debounce, UNLESS we hit the max-wait ceiling
  const elapsed = now - firstTrigger;
  const timeRemaining = Math.max(0, MAX_WAIT_MS - elapsed);
  const nextDelay = Math.min(SAVE_DELAY_MS, timeRemaining);

  if (pendingSaves.has(userId)) {
    clearTimeout(pendingSaves.get(userId));
  }

  const timeoutId = setTimeout(async () => {
    pendingSaves.delete(userId);
    maxWaitSaves.delete(userId); // reset max-wait tracker

    const playerData = players.get(userId);
    if (!playerData) return;

    try {
      // v8.0: Write-through to Redis (non-blocking, fire-and-forget)
      if (isRedisEnabled()) {
        redisSetPlayer(userId, playerData).catch(() => {});
      }

      await playersCol.doc(userId).set(sanitizeForFirestore(playerData));
      playerData._saveError = false; // Reset circuit breaker on success
    } catch (e) {
      console.error(`❌ Failed to save player ${userId} to Firestore:`, e);
      playerData._saveError = true; // Trip the circuit breaker
    }
  }, nextDelay);

  pendingSaves.set(userId, timeoutId);
}

/* ─── Graceful Shutdown ─── */
export const gracefulShutdown = async () => {
  console.log("\n  Flushing pending saves before shutdown...");

  // v8.0: Drain any in-flight player lock chains before flushing
  const lockDrainPromises = [];
  for (const [, lockPromise] of playerLocks.entries()) {
    lockDrainPromises.push(lockPromise.catch(() => {}));
  }
  if (lockDrainPromises.length > 0) {
    await Promise.all(lockDrainPromises);
  }

  if (!playersCol) {
    await redisShutdown();
    process.exit(0);
    return;
  }

  const flushPromises = [];
  for (const [userId, timeoutId] of pendingSaves.entries()) {
    clearTimeout(timeoutId);
    const playerData = players.get(userId);
    if (playerData) {
      flushPromises.push(
        playersCol.doc(userId).set(sanitizeForFirestore(playerData)),
      );
    }
  }
  pendingSaves.clear();
  maxWaitSaves.clear();

  try {
    await Promise.all(flushPromises);
    console.log(
      `🔥 Flushed ${flushPromises.length} players to Firestore. Bye!`,
    );
    await redisShutdown();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error flushing during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

/* ─── Player Factory with Schema Migration ─── */
export function getPlayer(userId, username) {
  let p = players.get(userId);

  // If player returned while being evicted, rescue them (cancel eviction)
  if (p && p._isEvicting) {
    p._isEvicting = false;
  }

  let NeedsSaveSync = false;

  if (!p) {
    // LRU eviction: remove oldest entries when cache is full
    if (players.size >= MAX_CACHE_SIZE) {
      let oldestKey = null;
      // Find the first key that isn't already in the process of evicting
      for (const key of players.keys()) {
        const data = players.get(key);
        if (!data._isEvicting) {
          oldestKey = key;
          break;
        }
      }

      if (oldestKey) {
        const oldData = players.get(oldestKey);
        oldData._isEvicting = true; // Mark as flushing

        // Flush pending save asynchronously BEFORE eviction, guarded by player lock
        withPlayerLock(oldestKey, async () => {
          if (pendingSaves.has(oldestKey)) {
            clearTimeout(pendingSaves.get(oldestKey));
            pendingSaves.delete(oldestKey);
          }
          if (playersCol) {
            await playersCol
              .doc(oldestKey)
              .set(sanitizeForFirestore(oldData))
              .catch((e) => console.error(`Eviction save failed for ${oldestKey}:`, e));
          }
          // Only delete if they didn't return during the I/O pause
          if (oldData._isEvicting) {
            players.delete(oldestKey);
          }
        });
      }
    }
    p = createDefaultPlayer(userId, username);
    players.set(userId, p);
    NeedsSaveSync = true;
  } else {
    // True LRU: refresh position by moving to the end of the Map
    players.delete(userId);
    players.set(userId, p);
  }

  // ─── Schema Migration ───
  if (!p.schemaVersion || p.schemaVersion < 2) {
    // Reset economy to fair defaults
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
        coins: 0,
        xp: 0,
        level: 1,
        plots: Array.from({ length: 6 }, (_, i) => ({
          id: i,
          crop: null,
          plantedAt: null,
          watered: false,
        })),
        inventory: {},
        harvested: {},
      };
    }
    // Add missing fields
    if (!p.pet) {
      p.pet = {
        name: "Buddy",
        level: 1,
        xp: 0,
        xpToNextLevel: 100,
        skinId: "basic_dog",
        stats: { happiness: 100 },
        abilities: { autoHarvest: false, autoWater: false, autoPlant: false },
      };
    }
    if (!p.farm.harvested) p.farm.harvested = {};
    // Clear stale game sessions
    if (p.trivia) p.trivia.session = null;
    if (p.match3) p.match3.currentGame = null;
    if (p.match3 && !p.match3.savedModes) p.match3.savedModes = {};
    p.schemaVersion = 2;
    NeedsSaveSync = true;
  }

  // ─── Schema v3 Migration (Economy Rebalance + Satiety + Gacha Merge) ───
  if (p.schemaVersion < 3) {
    // Pet satiety fields
    if (!p.pet.stats) p.pet.stats = { happiness: 100 };
    if (!("fullness" in p.pet.stats)) p.pet.stats.fullness = 0;
    if (!p.pet.lastDigestionTimestamp)
      p.pet.lastDigestionTimestamp = Date.now();
    if (!p.pet.activeOrders) p.pet.activeOrders = [];
    if (!p.pet.abilities) p.pet.abilities = {};
    if (!("autoPlant" in p.pet.abilities)) p.pet.abilities.autoPlant = false;
    // Gacha tokens
    if (!("gachaTokens" in p.resources)) p.resources.gachaTokens = 0;
    p.schemaVersion = 3;
    NeedsSaveSync = true;
  }

  // ─── Schema v4 Migration (Gacha Merge + Affection) ───
  if (p.schemaVersion < 4) {
    // Merge board state
    if (!p.merge) {
      const BOARD_ROWS = 7,
        BOARD_COLS = 9;
      p.merge = {
        board: Array.from({ length: BOARD_ROWS }, () =>
          Array(BOARD_COLS).fill(null),
        ),
        generators: ["textile"],
        inventory: [],
        lastFreePull: 0,
        generatorState: {
          textile: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
        },
      };
    }
    // Pet affection
    if (!("affectionXp" in p.pet)) p.pet.affectionXp = 0;
    if (!("affectionLevel" in p.pet)) p.pet.affectionLevel = 1;
    p.schemaVersion = 4;
    NeedsSaveSync = true;
  }

  // ─── Schema v5 Migration (Economy Rebalance Reset — v6.0 crop timer 20-240× slowdown) ───
  if (p.schemaVersion < 5) {
    // Gold → starter amount (100🪙) — old rates were 20-240× inflated
    p.resources.gold = ECONOMY.GOLD_START;

    // Farm XP/level → fresh start
    p.farm.xp = 0;
    p.farm.level = 1;

    // Ensure starter seeds exist
    if (!p.farm.inventory) p.farm.inventory = {};
    p.farm.inventory.strawberry = Math.max(p.farm.inventory.strawberry || 0, 5);
    // v7.3: Removed planter re-addition (phantom item fix)

    // Clear active plots (crops planted under old timers are invalid)
    if (p.farm.plots) {
      for (const plot of p.farm.plots) {
        plot.crop = null;
        plot.plantedAt = null;
        plot.watered = false;
      }
    }

    // Clear M3/Blox sessions (prevent gold-accounting bugs)
    if (p.match3) {
      p.match3.currentGame = null;
      p.match3.savedModes = {};
    }

    // Prevent stale offline simulation on first post-migration login
    p._lastSeen = Date.now();

    // Legacy compensation: 5 gacha tokens
    p.resources.gachaTokens = (p.resources.gachaTokens || 0) + 5;

    p.schemaVersion = 5;
    NeedsSaveSync = true;
  }

  if (username && p.username !== username) {
    p.username = username;
    NeedsSaveSync = true;
  }

  // ─── Blox Schema Migration ───
  if (!p.blox) {
    p.blox = { highScore: 0, totalGames: 0, savedState: null };
    NeedsSaveSync = true;
  }
  if (p.blox && !("savedState" in p.blox)) {
    p.blox.savedState = null;
    NeedsSaveSync = true;
  }

  // ─── Match-3 savedModes migration ───
  if (p.match3 && !p.match3.savedModes) {
    p.match3.savedModes = {};
    NeedsSaveSync = true;
  }

  // ─── Schema v6 Migration (Retention + Monetization + Cosmetics) ───
  if (!p.schemaVersion || p.schemaVersion < 6) {
    if (!p.streak)
      p.streak = {
        current: 0,
        best: 0,
        lastLoginDate: null,
        bonusMultiplier: 1,
      };
    if (!p.achievements) p.achievements = {};
    if (!p.journal) p.journal = { discovered: [] };
    if (!p.cosmetics)
      p.cosmetics = { activePlotTheme: "default", ownedThemes: ["default"] };
    if (!p.seasonPass)
      p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
    if (!p.boosters)
      p.boosters = { fertilizer: { active: false, expiresAt: 0 } };
    // Clean up phantom planter from v5 migration
    if (p.farm?.inventory?.planter !== undefined)
      delete p.farm.inventory.planter;
    p.schemaVersion = 6;
    NeedsSaveSync = true;
  }

  // ─── Schema v7 Migration (Room system) ───
  if (!p.schemaVersion || p.schemaVersion < 7) {
    if (!p.room)
      p.room = { decorations: [], inventory: [], wallpaper: "default" };
    p.schemaVersion = 7;
    NeedsSaveSync = true;
  }

  if (NeedsSaveSync) {
    debouncedSavePlayer(userId);
  }

  return p;
}
