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

let firestore = null;
let playersCol = null;

try {
  firestore = new Firestore(); // Uses Application Default Credentials
  playersCol = firestore.collection("players");
  console.log("🔥 Firestore initialized successfully.");
} catch (e) {
  console.warn("⚠️ Firestore init failed, falling back to memory:", e.message);
}

/* ─── Persistence ─── */

/**
 * v5.0.1: Recursively sanitize data for Firestore.
 * Firestore rejects `undefined` values with "invalid nested entity".
 * This converts undefined → null and ensures arrays are dense.
 */
function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
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
      const snapshot = await playersCol.limit(1000).get();
      if (!snapshot.empty) {
        snapshot.forEach((doc) => {
          players.set(doc.id, doc.data());
        });
        console.log(
          `🔥 DB loaded from Firestore: ${players.size} players in hot-cache`,
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
      process.exit(0);
    })
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
    p.farm.coins = 0;
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

  if (NeedsSaveSync) {
    debouncedSavePlayer(userId);
  }

  return p;
}
