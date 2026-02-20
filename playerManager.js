/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Player Manager
 *  In-memory player state, persistence (GCS + local), schema migration
 * ═══════════════════════════════════════════════════════
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initStorage, gcsRead, gcsWrite, getBucket } from "./storage.js";
import { ECONOMY, createDefaultPlayer } from "./game-logic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ═══════════════════════════════════════════════════
 *  SHARED STATE
 * ═══════════════════════════════════════════════════ */
export const players = new Map(); // userId -> { resources, pet, farm, trivia, match3 }
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const LOCAL_DB_PATH = path.join(DATA_DIR, "hub-db.json");

/* ─── Persistence ─── */
export async function loadDb() {
  // Try GCS first
  const gcsData = await gcsRead("hub-db.json");
  if (gcsData) {
    try {
      const parsed = JSON.parse(gcsData);
      for (const [k, v] of Object.entries(parsed)) players.set(k, v);
      console.log(`  DB loaded from GCS: ${players.size} players`);
      return;
    } catch (e) {
      console.error("GCS DB parse error:", e);
    }
  }
  // Fallback to local file
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, "utf-8");
      const data = JSON.parse(raw);
      for (const [k, v] of Object.entries(data)) players.set(k, v);
      console.log(`  DB loaded from local file: ${players.size} players`);
      return;
    }
  } catch (e) {
    console.error("Local DB load error:", e);
  }
  console.log("  DB: starting fresh (no existing data found)");
}

export async function saveDb() {
  const obj = Object.fromEntries(players);
  const json = JSON.stringify(obj, null, 2);
  await gcsWrite("hub-db.json", json);
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOCAL_DB_PATH, json);
  } catch (e) {
    console.error("Local DB save error:", e);
  }
}

let saveTimeout = null;
export function debouncedSaveDb() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveDb(), 3000);
}

/* ─── Graceful Shutdown ─── */
export const gracefulShutdown = async () => {
  console.log("\n  Saving DB before shutdown...");
  if (saveTimeout) clearTimeout(saveTimeout);
  await saveDb();
  process.exit(0);
};
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

/* ─── Player Factory with Schema Migration ─── */
export function getPlayer(userId, username) {
  let p = players.get(userId);
  if (!p) {
    p = createDefaultPlayer(userId, username);
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
    debouncedSaveDb();
  }
  if (username) p.username = username;
  // ─── Blox Schema Migration ───
  if (!p.blox) {
    p.blox = { highScore: 0, totalGames: 0, savedState: null };
    debouncedSaveDb();
  }
  if (p.blox && !("savedState" in p.blox)) {
    p.blox.savedState = null;
    debouncedSaveDb();
  }
  // ─── Match-3 savedModes migration ───
  if (p.match3 && !p.match3.savedModes) {
    p.match3.savedModes = {};
    debouncedSaveDb();
  }
  return p;
}
