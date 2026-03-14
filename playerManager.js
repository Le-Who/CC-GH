/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Player Manager
 *  Hot-cache in-memory state backed by Google Cloud Firestore
 * ═══════════════════════════════════════════════════════
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Firestore } from "@google-cloud/firestore";
import { ECONOMY, createDefaultPlayer } from "./game-logic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ═══════════════════════════════════════════════════
 *  FIRESTORE & STATE INIT
 * ═══════════════════════════════════════════════════ */
export const players = new Map(); // userId -> { resources, pet, farm, trivia, match3 }
const pendingSaves = new Map(); // userId -> timeoutId
const SAVE_DELAY_MS = 2000; // Debounce threshold for rapid actions
const MAX_CACHE_SIZE = 10000; // LRU eviction threshold

let firestore = null;
let playersCol = null;
let usersCol = null;    // Simple-auth: username → password_hash
let sessionsCol = null; // Simple-auth: token → { userId, username, createdAt }

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
      return;
    } catch (e) {
      console.error("❌ Firestore read error:", e);
    }
  } else {
    console.log("  DB: starting fresh (no existing data found, no Firestore)");
  }
}

/**
 * Debounced save function for an individual player.
 * Prevents hammering Firestore on rapid clicks (e.g. harvesting crops).
 */
export function debouncedSavePlayer(userId) {
  if (!playersCol) return; // Silent fallback if Firestore is missing

  if (pendingSaves.has(userId)) {
    clearTimeout(pendingSaves.get(userId));
  }

  const timeoutId = setTimeout(async () => {
    pendingSaves.delete(userId);
    const playerData = players.get(userId);
    if (!playerData) return;

    try {
      await playersCol.doc(userId).set(sanitizeForFirestore(playerData));
    } catch (e) {
      console.error(`❌ Failed to save player ${userId} to Firestore:`, e);
    }
  }, SAVE_DELAY_MS);

  pendingSaves.set(userId, timeoutId);
}

/* ─── Graceful Shutdown ─── */
export const gracefulShutdown = async () => {
  console.log("\n  Flushing pending Firestore saves before shutdown...");
  if (!playersCol) {
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

  Promise.all(flushPromises)
    .then(() => {
      console.log(
        `🔥 Flushed ${flushPromises.length} players to Firestore. Bye!`,
      );
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Error flushing to Firestore during shutdown:", err);
      process.exit(1);
    });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

/* ─── Player Factory with Schema Migration ─── */
export function getPlayer(userId, username) {
  let p = players.get(userId);
  let NeedsSaveSync = false;

  if (!p) {
    // LRU eviction: remove oldest entries when cache is full
    if (players.size >= MAX_CACHE_SIZE) {
      const oldestKey = players.keys().next().value;
      if (oldestKey) {
        // Flush pending save before eviction
        if (pendingSaves.has(oldestKey)) {
          clearTimeout(pendingSaves.get(oldestKey));
          pendingSaves.delete(oldestKey);
          const oldData = players.get(oldestKey);
          if (oldData && playersCol) {
            playersCol
              .doc(oldestKey)
              .set(sanitizeForFirestore(oldData))
              .catch(() => {});
          }
        }
        players.delete(oldestKey);
      }
    }
    p = createDefaultPlayer(userId, username);
    players.set(userId, p);
    NeedsSaveSync = true;
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
