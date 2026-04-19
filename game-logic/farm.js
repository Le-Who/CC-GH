/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Farm Growth & Offline Simulation
 *  Growth calculations, watering, offline progress engine.
 * ═══════════════════════════════════════════════════
 */

import { ECONOMY } from "./economy.js";
import { CROPS, CROP_TIERS } from "./crops.js";
import { getScaledTime } from "./helpers.js";

/* ═══════════════════════════════════════════════════
 *  FARM — Growth Calculations
 * ═══════════════════════════════════════════════════ */
export function getWateringMultiplier(crop) {
  const cfg = CROPS[crop];
  if (!cfg) return 0.7;
  if (cfg.growthTime >= 3_600_000) return 0.55; // 1h+
  if (cfg.growthTime >= 900_000) return 0.6; // 15min+
  return 0.7;
}

export function getGrowthPct(plot, now = Date.now()) {
  if (!plot.crop || !plot.plantedAt) return 0;
  const cfg = CROPS[plot.crop];
  if (!cfg) return 0;
  const elapsed = now - plot.plantedAt;
  const mult = plot.watered ? getWateringMultiplier(plot.crop) : 1;
  const time = getScaledTime(cfg.growthTime) * mult;
  return Math.min(1, elapsed / time);
}

export function farmPlotsWithGrowth(farm, now = Date.now()) {
  return farm.plots.map((pl) => {
    const cfg = pl.crop ? CROPS[pl.crop] : null;
    // effectiveGrowthTime = dev-mode-scaled base growth time, WITHOUT the
    // watering multiplier baked in. The client always applies wateringMultiplier
    // itself based on the live plot.watered state — this avoids double-
    // multiplication when a water-ack arrives and updates both watered + eff.
    const baseMs = cfg ? getScaledTime(cfg.growthTime) : 0;
    const waterMult = pl.crop ? getWateringMultiplier(pl.crop) : 1;
    return {
      ...pl,
      growth: getGrowthPct(pl, now),
      growthTime: cfg ? cfg.growthTime : 0,
      effectiveGrowthTime: baseMs, // only scale — no water mult
      wateringMultiplier: waterMult,
    };
  });
}


/* ═══════════════════════════════════════════════════
 *  OFFLINE PROGRESS — Fullness-based simulation loop
 *  v6.2.2: Pet works using its own Fullness (not player Energy).
 *  Self-sustain: pet auto-eats cheap-tier crops when hungry.
 *  Priority: Harvest → Plant → Water
 * ═══════════════════════════════════════════════════ */
export const OFFLINE_THRESHOLD_MS = 120000; // 2 minutes

/** Cost in fullness points per offline action */
const OFFLINE_HARVEST_COST = 2; // per crop harvested
const OFFLINE_PLANT_COST = 4; // per seed planted

export function processOfflineActions(player, now = Date.now()) {
  // Guard: skip simulation entirely for players without valid _lastSeen
  // (new players, corrupted data) — prevents runaway epoch-scale elapsed times
  if (!player._lastSeen || typeof player._lastSeen !== "number" || isNaN(player._lastSeen)) {
    player._lastSeen = now;
    return null;
  }

  const lastSeen = player._lastSeen;
  const rawElapsed = now - lastSeen;
  // Cap offline progress at 24 hours to prevent extreme runaway simulations
  // and handle potential clock-skew in the future.
  const elapsed = Math.max(0, Math.min(rawElapsed, ECONOMY.SATIETY_OFFLINE_CAP_MS));
  player._lastSeen = lastSeen + elapsed;

  // Only simulate if away for more than 2 minutes
  if (elapsed < OFFLINE_THRESHOLD_MS) return null;

  const simNow = lastSeen + elapsed;

  const pet = player.pet;
  const report = {
    offlineMinutes: Math.round(elapsed / 60000),
    harvested: {},
    planted: {},
    autoWatered: 0,
    fullnessConsumed: 0,
    foodEaten: {},
    xpGained: 0,
    openLoops: [], // Zeigarnik Effect triggers
  };

  // Helper: try to refuel pet by eating cheap crops from inventory
  function tryRefuel(needed) {
    const cheapIds = Object.keys(player.farm.inventory).filter(
      (id) =>
        CROP_TIERS[id] === "cheap" &&
        CROPS[id] &&
        player.farm.inventory[id] > 0,
    );
    // Sort by lowest fullnessYield first (eat the least valuable first)
    cheapIds.sort(
      (a, b) => (CROPS[a].fullnessYield || 0) - (CROPS[b].fullnessYield || 0),
    );
    let gained = 0;
    for (const id of cheapIds) {
      while (gained < needed && player.farm.inventory[id] > 0) {
        player.farm.inventory[id]--;
        const yield_ = CROPS[id].fullnessYield || 5;
        gained += yield_;
        pet.stats.fullness = Math.min(
          ECONOMY.SATIETY_MAX,
          pet.stats.fullness + yield_,
        );
        report.foodEaten[id] = (report.foodEaten[id] || 0) + 1;
      }
      if (gained >= needed) break;
    }
    return gained;
  }

  // Helper: spend fullness (auto-eat if needed), returns true if affordable
  function spendFullness(cost) {
    if (pet.stats.fullness >= cost) {
      pet.stats.fullness -= cost;
      report.fullnessConsumed += cost;
      return true;
    }
    // Try to refuel
    const deficit = cost - pet.stats.fullness;
    tryRefuel(deficit);
    if (pet.stats.fullness >= cost) {
      pet.stats.fullness -= cost;
      report.fullnessConsumed += cost;
      return true;
    }
    return false; // Can't afford even after eating
  }

  // Step 1: Auto-Harvest (costs fullness per crop)
  if (pet.abilities.autoHarvest) {
    for (const plot of player.farm.plots) {
      if (plot.crop && plot.plantedAt && getGrowthPct(plot, simNow) >= 1) {
        if (!spendFullness(OFFLINE_HARVEST_COST)) break;
        const cfg = CROPS[plot.crop];
        if (!cfg) continue;
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

  // Step 2: Auto-Plant (costs fullness per seed)
  if (pet.abilities.autoPlant) {
    const seedIds = Object.keys(player.farm.inventory).filter(
      (id) => CROPS[id] && player.farm.inventory[id] > 0,
    );
    for (const plot of player.farm.plots) {
      if (seedIds.length === 0) break;
      if (!plot.crop) {
        if (!spendFullness(OFFLINE_PLANT_COST)) break;
        const idx = Math.floor(Math.random() * seedIds.length);
        const seedId = seedIds[idx];
        player.farm.inventory[seedId]--;
        if (player.farm.inventory[seedId] <= 0) {
          seedIds.splice(idx, 1);
        }
        report.planted[seedId] = (report.planted[seedId] || 0) + 1;
        plot.crop = seedId;
        plot.plantedAt = lastSeen + Math.floor(Math.random() * elapsed);
        plot.watered = false;
      }
    }
  }

  // Step 3: Auto-Water (free, ability-gated)
  if (pet.abilities.autoWater) {
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

  // Zeigarnik Effect: Identify open loops (unfinished tasks)
  for (const plot of player.farm.plots) {
    if (plot.crop && plot.plantedAt) {
      const pct = getGrowthPct(plot, simNow);
      if (pct > 0 && pct < 1) {
        report.openLoops.push({
          type: "crop",
          name: CROPS[plot.crop]?.emoji || plot.crop,
          progress: Math.floor(pct * 100),
        });
      }
    }
  }

  const hadActivity =
    report.fullnessConsumed > 0 ||
    report.autoWatered > 0 ||
    Object.keys(report.foodEaten).length > 0 ||
    report.openLoops.length > 0;
  return hadActivity ? report : null;
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
  if (!q || !q.correctAnswer || !q.wrongAnswers) return undefined;
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
