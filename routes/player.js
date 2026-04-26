import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  ACHIEVEMENTS,
  BOOSTER_CONFIG,
  BOARD_COLS,
  BOARD_ROWS,
  CROPS,
  CROP_TIERS,
  ECONOMY,
  MERGE_CHAINS,
  PLOT_THEMES,
  ROOM_DECORATIONS,
  SEASON_PASS,
  TIER_YIELD,
  PIECES,
  PIECE_COUNT,
  calcBloxReward,
  calcGoldReward,
  calcRegen,
  calcTokenReward,
  checkAchievements,
  farmPlotsWithGrowth,
  getGrowthPct,
  getUnlockedSeeds,
  hydrateMergeBoard,
  processOfflineActions,
  updateStreak,
  validCoord,
  createEmptyBoard,
  canAnyPieceFit,
  canPlace,
  calcBubboReward,
  placePiece,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

const MAX_PLOTS = 12;
const BUY_PLOT_BASE_COST = 200;

function parseJsonValue(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  return raw && typeof raw === "object" ? raw : fallback;
}

function countMergeItems(board = []) {
  const counts = {};
  for (const row of board) {
    for (const item of row || []) {
      if (!item?.id) continue;
      counts[item.id] = (counts[item.id] || 0) + 1;
    }
  }
  return counts;
}

function normalizeResources(p) {
  return {
    ...(p.resources || {}),
    harvested: { ...(p.farm?.harvested || {}) },
    harvestedCrops: { ...(p.farm?.harvested || {}) },
  };
}

function getFarmStats(p) {
  let totalHarvests = p.stats?.totalHarvests || 0;
  if (totalHarvests === 0 && p.farm?.harvested) {
    totalHarvests = Object.values(p.farm.harvested).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  return {
    totalHarvests,
    goldEarned: p.stats?.totalGoldEarned || p.resources?.gold || 0,
    questsCompleted: p.questsCompleted || 0,
    plotsBought: p.farm?.plots?.length || 6,
    bestStreak: p.streak?.best || 0,
  };
}

function buildInventory(p) {
  hydrateMergeBoard(p);
  const roomInventory = Array.isArray(p.room?.roomInventory)
    ? p.room.roomInventory
    : Array.isArray(p.room?.inventory)
      ? p.room.inventory
      : [];
  return {
    seeds: { ...(p.farm?.inventory || {}) },
    harvested: { ...(p.farm?.harvested || {}) },
    harvestedCrops: { ...(p.farm?.harvested || {}) },
    mergeItems: countMergeItems(p.merge?.board || []),
    mergeInventory: Array.isArray(p.merge?.inventory) ? [...p.merge.inventory] : [],
    roomInventory: [...roomInventory],
    rewards: {
      gachaTokens: p.resources?.gachaTokens || 0,
      gold: p.resources?.gold || 0,
      energy: p.resources?.energy || null,
    },
  };
}

function buildAchievements(p) {
  const badges = {};
  for (const [id, badge] of Object.entries(ACHIEVEMENTS)) {
    badges[id] = {
      id,
      name: badge.name,
      emoji: badge.emoji,
      desc: badge.desc,
      reward: badge.reward,
      unlocked: !!p.achievements?.[id],
      seen: !!p.achievements?.[id]?.seen,
      unlockedAt: p.achievements?.[id]?.unlockedAt || null,
    };
  }
  return badges;
}

function buildSeasonPass(p) {
  if (!p.seasonPass) p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
  let currentTier = 0;
  for (let i = SEASON_PASS.tiers.length - 1; i >= 0; i--) {
    if (p.seasonPass.xp >= SEASON_PASS.tiers[i].xp) {
      currentTier = i;
      break;
    }
  }
  p.seasonPass.tier = currentTier;
  return {
    season: SEASON_PASS.season,
    name: SEASON_PASS.name,
    xp: p.seasonPass.xp,
    currentTier,
    claimed: [...(p.seasonPass.claimed || [])],
    tiers: SEASON_PASS.tiers.map((tier, i) => ({
      ...tier,
      unlocked: p.seasonPass.xp >= tier.xp,
      claimed: p.seasonPass.claimed?.includes(i) || false,
    })),
  };
}

export function buildSnapshot(p, extras = {}) {
  hydrateMergeBoard(p);
  calcRegen(p);
  const farmStats = getFarmStats(p);
  const bloxSaved = parseJsonValue(p.blox?.savedState, null);
  const savedModes = parseJsonValue(p.match3?.savedModes, {});
  const roomInventory = Array.isArray(p.room?.roomInventory)
    ? p.room.roomInventory
    : Array.isArray(p.room?.inventory)
      ? p.room.inventory
      : [];

  return {
    serverTime: Date.now(),
    player: {
      id: p.id,
      username: p.username,
      onboarded: !!p._onboarded,
      schemaVersion: p.schemaVersion,
      syncSeq: p._syncSeq || 0,
    },
    resources: normalizeResources(p),
    inventory: buildInventory(p),
    farm: {
      ...(p.farm || {}),
      plots: farmPlotsWithGrowth(p.farm),
      unlockedSeeds: getUnlockedSeeds(farmStats),
      stats: farmStats,
      cosmetics: p.cosmetics || { activePlotTheme: "default", ownedThemes: ["default"] },
      boosters: p.boosters || {},
      journal: p.journal || { discovered: [] },
      seasonPass: buildSeasonPass(p),
      streak: p.streak || null,
    },
    blox: {
      ...(p.blox || {}),
      savedState: bloxSaved,
      highScore: p.blox?.highScore || 0,
    },
    bubbo: {
      ...(p.bubbo || {}),
      currentGame: p.bubbo?.currentGame || null,
      highScore: p.bubbo?.highScore || 0,
      totalGames: p.bubbo?.totalGames || 0,
    },
    match3: {
      ...(p.match3 || {}),
      currentGame: p.match3?.currentGame || null,
      game: p.match3?.currentGame || null,
      highScore: p.match3?.highScore || 0,
      savedModes,
    },
    merge: {
      ...(p.merge || {}),
      itemCounts: countMergeItems(p.merge?.board || []),
    },
    trivia: p.trivia || {},
    pet: p.pet || {},
    room: {
      ...(p.room || {}),
      inventory: roomInventory,
      roomInventory,
    },
    achievements: {
      badges: buildAchievements(p),
      raw: p.achievements || {},
      totalUnlocked: Object.keys(p.achievements || {}).length,
      totalBadges: Object.keys(ACHIEVEMENTS).length,
    },
    meta: {
      crops: CROPS,
      mergeChains: MERGE_CHAINS,
      roomDecorations: ROOM_DECORATIONS,
      plotThemes: PLOT_THEMES,
      boosters: BOOSTER_CONFIG,
      seasonPass: SEASON_PASS,
      economy: ECONOMY,
    },
    ...extras,
  };
}

function ok(action, p, extras = {}) {
  return {
    status: 200,
    body: {
      success: true,
      action,
      ...extras,
      snapshot: buildSnapshot(p, extras.snapshotExtras || {}),
    },
  };
}

function fail(status, error, extras = {}) {
  return { status, body: { success: false, error, ...extras } };
}

function ensureMergeState(p) {
  hydrateMergeBoard(p);
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
}

function emptyMergeCells(board) {
  const cells = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      if (!board[r]?.[c]) cells.push([r, c]);
    }
  }
  return cells;
}

function unlockMergeChain(p, chainId) {
  if (!p.merge.generators.includes(chainId)) {
    p.merge.generators.push(chainId);
  }
  if (!p.merge.generatorState[chainId]) {
    p.merge.generatorState[chainId] = {
      tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
      cooldownEnd: 0,
    };
  }
}

function randomRoomDecoration(p, chance = 0.08) {
  if (Math.random() > chance) return null;
  if (!p.room) p.room = { decorations: [], inventory: [], wallpaper: "default" };
  const ids = Object.keys(ROOM_DECORATIONS);
  const owned = new Set([...(p.room.decorations || []), ...(p.room.inventory || []), ...(p.room.roomInventory || [])]);
  const candidates = ids.filter((id) => !owned.has(id));
  if (!candidates.length) return null;
  const id = candidates[Math.floor(Math.random() * candidates.length)];
  if (!Array.isArray(p.room.inventory)) p.room.inventory = [];
  p.room.inventory.push(id);
  p.room.roomInventory = [...p.room.inventory];
  return id;
}

function makeBloxTray() {
  return Array.from({ length: PIECE_COUNT }, () => ({
    piece: PIECES[Math.floor(Math.random() * PIECES.length)],
    placed: false,
  }));
}

function clearBloxLines(board) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < board.length; r++) {
    if (board[r].every(Boolean)) rows.push(r);
  }
  for (let c = 0; c < board[0].length; c++) {
    let full = true;
    for (let r = 0; r < board.length; r++) {
      if (!board[r][c]) {
        full = false;
        break;
      }
    }
    if (full) cols.push(c);
  }
  for (const r of rows) {
    for (let c = 0; c < board[r].length; c++) board[r][c] = null;
  }
  for (const c of cols) {
    for (let r = 0; r < board.length; r++) board[r][c] = null;
  }
  const cleared = rows.length + cols.length;
  return { rows, cols, cleared, points: cleared ? cleared * 10 + Math.max(0, cleared - 1) * 10 : 0 };
}

function normalizeBloxSaved(savedState, p) {
  const saved = savedState && typeof savedState === "object" ? savedState : {};
  const board = Array.isArray(saved.board) ? saved.board : createEmptyBoard();
  const tray = Array.isArray(saved.tray) && saved.tray.length ? saved.tray : makeBloxTray();
  return {
    board,
    tray,
    score: Number(saved.score) || 0,
    linesCleared: Number(saved.linesCleared) || 0,
    highScore: Math.max(Number(saved.highScore) || 0, Number(p.blox?.highScore) || 0),
    gameActive: saved.gameActive ?? !!p.blox?.activeGame,
  };
}

export async function applyAction(p, action, payload = {}) {
  switch (action) {
    case "garden.goldDelta": {
      const amount = Math.trunc(Number(payload.amount) || 0);
      if (!Number.isFinite(amount) || amount === 0) return fail(400, "invalid gold delta");
      if (Math.abs(amount) > 1_000_000_000) return fail(400, "gold delta too large");
      if (!p.resources) p.resources = {};
      p.resources.gold = Math.max(0, Math.trunc(Number(p.resources.gold) || 0));
      if (amount < 0 && p.resources.gold < Math.abs(amount)) {
        return fail(400, "not enough gold", { cost: Math.abs(amount) });
      }
      p.resources.gold += amount;
      if (amount > 0 && p.stats) {
        p.stats.totalGoldEarned = (p.stats.totalGoldEarned || 0) + amount;
      }
      return ok(action, p, { goldDelta: amount, reason: payload.reason || "garden" });
    }
    case "farm.refresh": {
      const offlineReport = processOfflineActions(p);
      const streakResult = updateStreak(p);
      const newAchievements = checkAchievements(p);
      return ok(action, p, { offlineReport, streakResult, newAchievements });
    }
    case "farm.plant": {
      const { plotId, cropId = "strawberry" } = payload;
      if (!CROPS[cropId]) return fail(400, "unknown crop");
      const idx = Number(plotId);
      if (!Number.isInteger(idx) || idx < 0 || idx >= p.farm.plots.length) return fail(400, "invalid plot");
      const plot = p.farm.plots[idx];
      if (plot.crop) return fail(400, "plot occupied");
      if ((p.farm.inventory[cropId] || 0) <= 0) return fail(400, "no seeds");
      p.farm.inventory[cropId] -= 1;
      plot.crop = cropId;
      plot.plantedAt = Date.now();
      plot.watered = false;
      return ok(action, p, { plotId: idx, cropId, newAchievements: checkAchievements(p) });
    }
    case "farm.water": {
      const idx = Number(payload.plotId);
      if (!Number.isInteger(idx) || idx < 0 || idx >= p.farm.plots.length) return fail(400, "invalid plot");
      const plot = p.farm.plots[idx];
      if (!plot.crop || plot.watered) return fail(400, "cannot water");
      plot.watered = true;
      return ok(action, p, { plotId: idx });
    }
    case "farm.harvest": {
      const idx = Number(payload.plotId);
      if (!Number.isInteger(idx) || idx < 0 || idx >= p.farm.plots.length) return fail(400, "invalid plot");
      const plot = p.farm.plots[idx];
      if (!plot.crop) return fail(400, "nothing to harvest");
      if (getGrowthPct(plot, Date.now() + 2500) < 1) return fail(400, "crop not grown", { serverTime: Date.now() });
      const cropId = plot.crop;
      const cfg = CROPS[cropId];
      p.farm.harvested[cropId] = (p.farm.harvested[cropId] || 0) + 1;
      p.farm.xp += cfg.xp;
      p.farm.level = Math.floor(p.farm.xp / 100) + 1;
      if (p.stats) p.stats.totalHarvests = (p.stats.totalHarvests || 0) + 1;
      if (!p.journal) p.journal = { discovered: [] };
      if (!p.journal.discovered.includes(cropId)) p.journal.discovered.push(cropId);
      if (!p.seasonPass) p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
      p.seasonPass.xp += cfg.xp;
      let tokenDrop = false;
      if (Math.random() < ECONOMY.TOKEN_FARM_DROP_CHANCE) {
        p.resources.gachaTokens = (p.resources.gachaTokens || 0) + 1;
        tokenDrop = true;
      }
      plot.crop = null;
      plot.plantedAt = null;
      plot.watered = false;
      return ok(action, p, { plotId: idx, cropId, tokenDrop, newAchievements: checkAchievements(p) });
    }
    case "farm.harvestAll": {
      const harvested = [];
      for (let i = 0; i < p.farm.plots.length; i++) {
        const plot = p.farm.plots[i];
        if (!plot.crop || getGrowthPct(plot, Date.now() + 2500) < 1) continue;
        const cropId = plot.crop;
        const cfg = CROPS[cropId];
        p.farm.harvested[cropId] = (p.farm.harvested[cropId] || 0) + 1;
        p.farm.xp += cfg.xp;
        if (p.stats) p.stats.totalHarvests = (p.stats.totalHarvests || 0) + 1;
        if (!p.journal) p.journal = { discovered: [] };
        if (!p.journal.discovered.includes(cropId)) p.journal.discovered.push(cropId);
        if (!p.seasonPass) p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
        p.seasonPass.xp += cfg.xp;
        plot.crop = null;
        plot.plantedAt = null;
        plot.watered = false;
        harvested.push({ plotId: i, cropId });
      }
      p.farm.level = Math.floor(p.farm.xp / 100) + 1;
      if (!harvested.length) return fail(400, "nothing ready");
      return ok(action, p, { harvested, newAchievements: checkAchievements(p) });
    }
    case "farm.uproot": {
      const idx = Number(payload.plotId);
      if (!Number.isInteger(idx) || idx < 0 || idx >= p.farm.plots.length) return fail(400, "invalid plot");
      const plot = p.farm.plots[idx];
      if (!plot.crop) return fail(400, "nothing to uproot");
      plot.crop = null;
      plot.plantedAt = null;
      plot.watered = false;
      return ok(action, p, { plotId: idx });
    }
    case "farm.buySeeds": {
      const { cropId, amount = 1 } = payload;
      const cfg = CROPS[cropId];
      if (!cfg) return fail(400, "unknown crop");
      const qty = Math.max(1, Math.min(1000, Math.floor(Number(amount) || 1)));
      const cost = cfg.seedPrice * qty;
      if (p.resources.gold < cost) return fail(400, "not enough gold", { cost });
      p.resources.gold -= cost;
      p.farm.inventory[cropId] = (p.farm.inventory[cropId] || 0) + qty;
      return ok(action, p, { cropId, amount: qty, cost });
    }
    case "farm.sellCrop": {
      const { cropId, amount = 1 } = payload;
      const cfg = CROPS[cropId];
      const qty = Math.max(1, Math.floor(Number(amount) || 1));
      if (!cfg) return fail(400, "unknown crop");
      if ((p.farm.harvested[cropId] || 0) < qty) return fail(400, "no harvested crop to sell");
      p.farm.harvested[cropId] -= qty;
      if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
      const soldFor = cfg.sellPrice * qty;
      p.resources.gold += soldFor;
      if (p.stats) p.stats.totalGoldEarned = (p.stats.totalGoldEarned || 0) + soldFor;
      return ok(action, p, { cropId, amount: qty, soldFor });
    }
    case "farm.buyPlot": {
      const currentPlots = p.farm.plots.length;
      if (currentPlots >= MAX_PLOTS) return fail(400, "max plots reached");
      const cost = BUY_PLOT_BASE_COST * Math.pow(2, currentPlots - 6);
      if (p.resources.gold < cost) return fail(400, "not enough gold", { cost });
      p.resources.gold -= cost;
      p.farm.plots.push({ id: currentPlots, crop: null, plantedAt: null, watered: false });
      return ok(action, p, { plotCount: p.farm.plots.length, cost, newAchievements: checkAchievements(p) });
    }
    case "farm.activateBooster": {
      const boosterId = payload.boosterId || "fertilizer";
      const cfg = BOOSTER_CONFIG[boosterId];
      if (!cfg) return fail(400, "unknown booster");
      if (p.boosters?.[boosterId]?.active && p.boosters[boosterId].expiresAt > Date.now()) return fail(400, "booster already active");
      if (p.resources.gold < cfg.cost) return fail(400, "not enough gold");
      p.resources.gold -= cfg.cost;
      if (!p.boosters) p.boosters = {};
      p.boosters[boosterId] = { active: true, expiresAt: Date.now() + cfg.durationMs };
      return ok(action, p, { boosterId });
    }
    case "farm.buyTheme": {
      const { themeId } = payload;
      const theme = PLOT_THEMES[themeId];
      if (!theme) return fail(400, "unknown theme");
      if (!p.cosmetics) p.cosmetics = { activePlotTheme: "default", ownedThemes: ["default"] };
      if (p.cosmetics.ownedThemes.includes(themeId)) return fail(400, "already owned");
      if (p.resources.gold < theme.cost) return fail(400, "not enough gold");
      p.resources.gold -= theme.cost;
      p.cosmetics.ownedThemes.push(themeId);
      return ok(action, p, { themeId });
    }
    case "farm.setTheme": {
      const { themeId } = payload;
      if (!PLOT_THEMES[themeId]) return fail(400, "unknown theme");
      if (!p.cosmetics) p.cosmetics = { activePlotTheme: "default", ownedThemes: ["default"] };
      if (!p.cosmetics.ownedThemes.includes(themeId)) return fail(400, "theme not owned");
      p.cosmetics.activePlotTheme = themeId;
      return ok(action, p, { themeId });
    }
    case "pet.feed": {
      const { cropId } = payload;
      const cfg = CROPS[cropId];
      if (!cfg) return fail(400, "unknown crop");
      if ((p.farm.harvested[cropId] || 0) <= 0) return fail(400, "no harvested crop to feed");
      if (!p.pet.stats) p.pet.stats = { happiness: 100, fullness: 0 };
      if (p.pet.stats.fullness >= 100) return fail(400, "pet is full");
      p.farm.harvested[cropId] -= 1;
      if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
      p.pet.stats.fullness = Math.min(100, (p.pet.stats.fullness || 0) + (cfg.fullnessYield || 10));
      p.pet.stats.happiness = Math.min(100, (p.pet.stats.happiness || 80) + 3);
      p.pet.xp = (p.pet.xp || 0) + ECONOMY.FEED_PET_XP;
      p.resources.energy.current = Math.min(p.resources.energy.max, p.resources.energy.current + (cfg.energyYield || 1));
      while (p.pet.xp >= p.pet.xpToNextLevel) {
        p.pet.xp -= p.pet.xpToNextLevel;
        p.pet.level += 1;
        p.pet.xpToNextLevel = Math.floor(p.pet.xpToNextLevel * 1.25);
        if (p.pet.level >= 3) p.pet.abilities.autoHarvest = true;
        if (p.pet.level >= 5) p.pet.abilities.autoWater = true;
        if (p.pet.level >= 7) p.pet.abilities.autoPlant = true;
      }
      return ok(action, p, { cropId, newAchievements: checkAchievements(p) });
    }
    case "pet.rename": {
      const newName = String(payload.newName || "").trim().slice(0, 16);
      if (!newName) return fail(400, "invalid name");
      p.pet.name = newName;
      p._onboarded = true;
      return ok(action, p, { pet: p.pet });
    }
    case "quest.generate": {
      const tiers = ["easy", "medium", "hard"];
      if (!p.pet.activeOrders) p.pet.activeOrders = [];
      if (p.pet.activeOrders.length >= 3) return fail(400, "max active orders reached (3)");
      const slots = 3 - p.pet.activeOrders.length;
      const cropIds = Object.keys(CROPS);
      const generated = [];
      for (let i = 0; i < slots; i++) {
        const lvl = p.pet.affectionLevel || 1;
        const tier = lvl < 3 ? "easy" : lvl < 6 ? tiers[Math.floor(Math.random() * 2)] : tiers[Math.floor(Math.random() * tiers.length)];
        const cropId = cropIds[Math.floor(Math.random() * cropIds.length)];
        const qty = tier === "easy" ? 1 + Math.floor(Math.random() * 3) : tier === "medium" ? 2 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 6);
        const order = {
          id: randomUUID(),
          tier,
          requirements: [{ type: "crop", id: cropId, qty }],
          reward: {
            gold: tier === "easy" ? 50 : tier === "medium" ? 140 : 320,
            affectionXp: tier === "easy" ? 14 : tier === "medium" ? 32 : 64,
            gachaTokens: tier === "hard" ? 2 : tier === "medium" ? 1 : 0,
            energyMaxBoost: 0,
          },
        };
        generated.push(order);
      }
      p.pet.activeOrders.push(...generated);
      return ok(action, p, { newOrders: generated, orders: p.pet.activeOrders });
    }
    case "quest.submit": {
      hydrateMergeBoard(p);
      const { orderId } = payload;
      const idx = (p.pet.activeOrders || []).findIndex((order) => order.id === orderId);
      if (idx < 0) return fail(400, "order not found");
      const order = p.pet.activeOrders[idx];
      const mergeCounts = countMergeItems(p.merge.board);
      for (const req of order.requirements || []) {
        if (req.type === "crop" && (p.farm.harvested[req.id] || 0) < req.qty) return fail(400, `not enough ${req.id}`, { need: req.qty });
        if (req.type === "merge" && (mergeCounts[req.id] || 0) < req.qty) return fail(400, `not enough ${req.id} on board`, { need: req.qty });
      }
      for (const req of order.requirements || []) {
        if (req.type === "crop") {
          p.farm.harvested[req.id] -= req.qty;
          if (p.farm.harvested[req.id] <= 0) delete p.farm.harvested[req.id];
        } else if (req.type === "merge") {
          let remaining = req.qty;
          for (const row of p.merge.board) {
            for (let c = 0; c < row.length && remaining > 0; c++) {
              if (row[c]?.id === req.id) {
                row[c] = null;
                remaining--;
              }
            }
          }
        }
      }
      const reward = order.reward || {};
      p.resources.gold += reward.gold || 0;
      p.resources.gachaTokens = (p.resources.gachaTokens || 0) + (reward.gachaTokens || 0);
      if (reward.energyMaxBoost) p.resources.energy.max += reward.energyMaxBoost;
      p.pet.affectionXp = (p.pet.affectionXp || 0) + (reward.affectionXp || 0);
      let affectionLeveledUp = false;
      let xpNeeded = (p.pet.affectionLevel || 1) * 100;
      while (p.pet.affectionXp >= xpNeeded) {
        p.pet.affectionXp -= xpNeeded;
        p.pet.affectionLevel = (p.pet.affectionLevel || 1) + 1;
        xpNeeded = p.pet.affectionLevel * 100;
        affectionLeveledUp = true;
      }
      p.pet.activeOrders.splice(idx, 1);
      p.questsCompleted = (p.questsCompleted || 0) + 1;
      return ok(action, p, { reward, affectionLeveledUp, newAchievements: checkAchievements(p) });
    }
    case "room.place": {
      const { decoId } = payload;
      if (!ROOM_DECORATIONS[decoId]) return fail(400, "unknown decoration");
      if (!p.room) p.room = { decorations: [], inventory: [], wallpaper: "default" };
      const inv = p.room.roomInventory || p.room.inventory || [];
      const idx = inv.indexOf(decoId);
      if (idx < 0) return fail(400, "decoration not owned");
      inv.splice(idx, 1);
      p.room.inventory = [...inv];
      p.room.roomInventory = [...inv];
      p.room.decorations = [...(p.room.decorations || []), decoId];
      return ok(action, p, { decoId });
    }
    case "room.pickup": {
      const { decoId } = payload;
      if (!p.room?.decorations?.includes(decoId)) return fail(400, "decoration not placed");
      p.room.decorations = p.room.decorations.filter((id) => id !== decoId);
      const inv = p.room.roomInventory || p.room.inventory || [];
      inv.push(decoId);
      p.room.inventory = [...inv];
      p.room.roomInventory = [...inv];
      return ok(action, p, { decoId });
    }
    case "merge.tap": {
      const { chainId = "textile", cropId } = payload;
      ensureMergeState(p);
      const chain = MERGE_CHAINS[chainId];
      if (!chain) return fail(400, "invalid chainId");
      if (!p.merge.generators.includes(chainId)) return fail(400, "generator locked");
      const state = p.merge.generatorState[chainId];
      const now = Date.now();
      if (now >= state.cooldownEnd) {
        state.tapsLeft = ECONOMY.GENERATOR_TAP_LIMIT;
        state.cooldownEnd = 0;
      }
      if (state.tapsLeft <= 0) return fail(400, "generator cooling down", { cooldownEnd: state.cooldownEnd });
      const empty = emptyMergeCells(p.merge.board);
      if (!empty.length) return fail(400, "board full");
      const freeTapCharges = Math.max(0, Number(p.merge.freeTapCharges) || 0);
      const usedFreeTap = freeTapCharges > 0;
      if (usedFreeTap) {
        p.merge.freeTapCharges = freeTapCharges - 1;
      } else {
        if (!cropId || !CROPS[cropId]) return fail(400, "invalid crop for energy");
        if ((p.farm.harvested[cropId] || 0) <= 0) return fail(400, "not enough crops");
        p.farm.harvested[cropId] -= 1;
        if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
      }
      state.tapsLeft -= 1;
      if (state.tapsLeft <= 0) state.cooldownEnd = now + ECONOMY.GENERATOR_COOLDOWN_MS;
      const tier = CROP_TIERS[cropId] || "cheap";
      const yieldCfg = TIER_YIELD[tier] || TIER_YIELD.cheap;
      const spawnCount = usedFreeTap ? 1 : Math.floor(Math.random() * (yieldCfg.max - yieldCfg.min + 1)) + yieldCfg.min;
      const spawned = [];
      for (let i = 0; i < spawnCount; i++) {
        const cells = emptyMergeCells(p.merge.board);
        if (!cells.length) break;
        const [r, c] = cells[Math.floor(Math.random() * cells.length)];
        const rand = Math.random();
        let level = 0;
        if (rand > 0.95 && chain.items.length > 2) level = 2;
        else if (rand > 0.8 && chain.items.length > 1) level = 1;
        p.merge.board[r][c] = { id: chain.items[level], chainId, level };
        spawned.push({ r, c, item: p.merge.board[r][c] });
      }
      return ok(action, p, { chainId, spawned, usedFreeTap });
    }
    case "merge.merge": {
      const { fromR, fromC, toR, toC } = payload;
      ensureMergeState(p);
      if (!validCoord(fromR, BOARD_ROWS) || !validCoord(fromC, BOARD_COLS) || !validCoord(toR, BOARD_ROWS) || !validCoord(toC, BOARD_COLS)) return fail(400, "invalid coordinates");
      const src = p.merge.board[fromR][fromC];
      const dst = p.merge.board[toR][toC];
      if (!src || !dst) return fail(400, "empty cell");
      if (src.chainId !== dst.chainId || src.level !== dst.level) return fail(400, "chain/level mismatch");
      const chain = MERGE_CHAINS[src.chainId];
      if (!chain || src.level >= chain.items.length - 1) return fail(400, "max level reached");
      const level = src.level + 1;
      p.merge.board[toR][toC] = { id: chain.items[level], chainId: src.chainId, level };
      p.merge.board[fromR][fromC] = null;
      const roomDrop = level >= 4 ? randomRoomDecoration(p, 0.18) : null;
      return ok(action, p, { newItem: p.merge.board[toR][toC], roomDrop, newAchievements: checkAchievements(p) });
    }
    case "merge.gacha":
    case "merge.freePull": {
      ensureMergeState(p);
      const free = action === "merge.freePull";
      if (free) {
        const today = new Date().toISOString().slice(0, 10);
        if (new Date(p.merge.lastFreePull || 0).toISOString().slice(0, 10) === today) return fail(400, "free pull already used today");
        p.merge.lastFreePull = Date.now();
      } else {
        if ((p.resources.gachaTokens || 0) < ECONOMY.GACHA_PULL_COST) return fail(400, "not enough tokens", { required: ECONOMY.GACHA_PULL_COST });
        p.resources.gachaTokens -= ECONOMY.GACHA_PULL_COST;
      }
      const cells = emptyMergeCells(p.merge.board);
      if (!cells.length) return fail(400, "board full");
      const chainIds = Object.keys(MERGE_CHAINS);
      const chainId = chainIds[Math.floor(Math.random() * chainIds.length)];
      const chain = MERGE_CHAINS[chainId];
      const [r, c] = cells[Math.floor(Math.random() * cells.length)];
      p.merge.board[r][c] = { id: chain.items[0], chainId, level: 0 };
      unlockMergeChain(p, chainId);
      const roomDrop = randomRoomDecoration(p, free ? 0.04 : 0.12);
      return ok(action, p, { spawned: { r, c, item: p.merge.board[r][c] }, chainId, roomDrop });
    }
    case "merge.claimFreeTaps": {
      ensureMergeState(p);
      const today = new Date().toISOString().slice(0, 10);
      if (new Date(p.merge.lastFreeTaps || 0).toISOString().slice(0, 10) === today) return fail(400, "already claimed today");
      p.merge.lastFreeTaps = Date.now();
      p.merge.freeTapCharges = (Number(p.merge.freeTapCharges) || 0) + 30;
      return ok(action, p, { freeTapCharges: p.merge.freeTapCharges });
    }
    case "merge.trash": {
      const { r, c } = payload;
      ensureMergeState(p);
      if (!validCoord(r, BOARD_ROWS) || !validCoord(c, BOARD_COLS)) return fail(400, "invalid coordinates");
      if (!p.merge.board[r]?.[c]) return fail(400, "empty cell");
      p.merge.board[r][c] = null;
      return ok(action, p, { r, c });
    }
    case "blox.start": {
      calcRegen(p);
      if (p.resources.energy.current < ECONOMY.COST_BLOX) return fail(400, "NOT_ENOUGH_ENERGY", { required: ECONOMY.COST_BLOX, current: p.resources.energy.current });
      p.resources.energy.current -= ECONOMY.COST_BLOX;
      p.blox.totalGames = (p.blox.totalGames || 0) + 1;
      p.blox.activeGame = true;
      const savedState = { board: createEmptyBoard(), tray: makeBloxTray(), score: 0, linesCleared: 0, highScore: p.blox.highScore || 0, gameActive: true };
      p.blox.savedState = JSON.stringify(savedState);
      return ok(action, p, { savedState });
    }
    case "blox.place": {
      let saved = normalizeBloxSaved(parseJsonValue(p.blox.savedState, null), p);
      if (!saved.gameActive) return fail(400, "No active Blox session");
      const pieceIdx = Number(payload.pieceIdx);
      const row = Number(payload.row);
      const col = Number(payload.col);
      const trayItem = saved.tray[pieceIdx];
      if (!trayItem || trayItem.placed) return fail(400, "invalid piece");
      if (!canPlace(saved.board, trayItem.piece, row, col)) return fail(400, "invalid placement");
      placePiece(saved.board, trayItem.piece, row, col);
      saved.tray[pieceIdx] = { ...trayItem, placed: true };
      const clear = clearBloxLines(saved.board);
      saved.score += trayItem.piece.cells.length + clear.points;
      saved.linesCleared += clear.cleared;
      if (saved.tray.every((item) => item.placed)) saved.tray = makeBloxTray();
      if (!canAnyPieceFit(saved.board, saved.tray)) {
        saved.gameActive = false;
        p.blox.activeGame = false;
        p.blox.highScore = Math.max(p.blox.highScore || 0, saved.score);
        const goldReward = calcBloxReward(saved.score);
        const tokenReward = calcTokenReward(saved.score);
        p.resources.gold += goldReward;
        p.resources.gachaTokens = (p.resources.gachaTokens || 0) + tokenReward;
        saved.highScore = p.blox.highScore;
      }
      p.blox.savedState = JSON.stringify(saved);
      return ok(action, p, { savedState: saved, clear });
    }
    case "blox.sync": {
      const savedState = normalizeBloxSaved(payload.savedState, p);
      p.blox.savedState = JSON.stringify(savedState);
      p.blox.activeGame = !!savedState.gameActive;
      p.blox.highScore = Math.max(p.blox.highScore || 0, savedState.highScore || 0, savedState.score || 0);
      return ok(action, p, { savedState });
    }
    case "blox.end": {
      const score = Number(payload.score) || normalizeBloxSaved(parseJsonValue(p.blox.savedState, null), p).score || 0;
      if (!p.blox.activeGame && score > 0) return fail(403, "No active Blox session");
      const goldReward = score > 10000 ? 0 : calcBloxReward(score);
      const tokenReward = score > 10000 ? 0 : calcTokenReward(score);
      p.resources.gold += goldReward;
      p.resources.gachaTokens = (p.resources.gachaTokens || 0) + tokenReward;
      p.blox.highScore = Math.max(p.blox.highScore || 0, score);
      p.blox.activeGame = false;
      p.blox.savedState = null;
      return ok(action, p, { score, goldReward, tokenReward });
    }
    case "match3.start": {
      const mode = payload.mode || "classic";
      calcRegen(p);
      if (!payload.isResume) {
        if (p.resources.energy.current < ECONOMY.COST_MATCH3) return fail(400, "NOT_ENOUGH_ENERGY", { required: ECONOMY.COST_MATCH3, current: p.resources.energy.current });
        p.resources.energy.current -= ECONOMY.COST_MATCH3;
        p.match3.totalGames = (p.match3.totalGames || 0) + 1;
      }
      p.match3.currentGame = { score: 0, movesLeft: mode === "timed" ? 999 : 30, combo: 0, mode };
      return ok(action, p, { mode });
    }
    case "match3.syncMode": {
      if (payload.savedModes && typeof payload.savedModes === "object") p.match3.savedModes = JSON.stringify(payload.savedModes);
      if (payload.game && typeof payload.game === "object") p.match3.currentGame = payload.game;
      return ok(action, p);
    }
    case "match3.end": {
      const score = Number(payload.score) || 0;
      if (!p.match3.currentGame && score > 0 && !payload.fromQuit) return fail(403, "Invalid session");
      let goldReward = 0;
      let tokenReward = 0;
      if (score > 0 && score <= 30000) {
        goldReward = calcGoldReward(score);
        tokenReward = calcTokenReward(score);
        p.resources.gold += goldReward;
        p.resources.gachaTokens = (p.resources.gachaTokens || 0) + tokenReward;
        p.match3.highScore = Math.max(p.match3.highScore || 0, score);
      }
      p.match3.currentGame = null;
      return ok(action, p, { score, goldReward, tokenReward });
    }
    case "bubbo.start": {
      calcRegen(p);
      if (!p.bubbo) p.bubbo = { highScore: 0, totalGames: 0, currentGame: null };
      if (p.resources.energy.current < ECONOMY.COST_BUBBO) return fail(400, "NOT_ENOUGH_ENERGY", { required: ECONOMY.COST_BUBBO, current: p.resources.energy.current });
      p.resources.energy.current -= ECONOMY.COST_BUBBO;
      p.bubbo.totalGames = (p.bubbo.totalGames || 0) + 1;
      p.bubbo.currentGame = {
        score: 0,
        shotsLeft: Math.max(0, Number(payload.shotsLeft) || 36),
        board: Array.isArray(payload.board) ? payload.board : undefined,
        seed: typeof payload.seed === "string" ? payload.seed.slice(0, 80) : undefined,
        waveIndex: Math.max(0, Number(payload.waveIndex) || 0),
        rowOffset: Math.abs(Math.floor(Number(payload.rowOffset) || 0)) % 2,
        pressure: Math.max(0, Number(payload.pressure) || 0),
      };
      return ok(action, p, { game: p.bubbo.currentGame });
    }
    case "bubbo.sync": {
      if (!p.bubbo) p.bubbo = { highScore: 0, totalGames: 0, currentGame: null };
      if (payload.game && typeof payload.game === "object") {
        p.bubbo.currentGame = {
          score: Math.max(0, Number(payload.game.score) || 0),
          shotsLeft: Math.max(0, Number(payload.game.shotsLeft) || 0),
          board: Array.isArray(payload.game.board) ? payload.game.board : p.bubbo.currentGame?.board,
          seed: typeof payload.game.seed === "string" ? payload.game.seed.slice(0, 80) : p.bubbo.currentGame?.seed,
          waveIndex: Math.max(0, Number(payload.game.waveIndex) || Number(p.bubbo.currentGame?.waveIndex) || 0),
          rowOffset: Math.abs(Math.floor(Number(payload.game.rowOffset ?? p.bubbo.currentGame?.rowOffset) || 0)) % 2,
          pressure: Math.max(0, Number(payload.game.pressure) || 0),
        };
      }
      return ok(action, p);
    }
    case "bubbo.end": {
      if (!p.bubbo) p.bubbo = { highScore: 0, totalGames: 0, currentGame: null };
      const score = Number(payload.score) || p.bubbo.currentGame?.score || 0;
      if (!p.bubbo.currentGame && score > 0 && !payload.fromQuit) return fail(403, "Invalid Bubbo session");
      let goldReward = 0;
      let tokenReward = 0;
      if (score > 0 && score <= 25000) {
        goldReward = calcBubboReward(score);
        tokenReward = calcTokenReward(score);
        p.resources.gold += goldReward;
        p.resources.gachaTokens = (p.resources.gachaTokens || 0) + tokenReward;
        p.bubbo.highScore = Math.max(p.bubbo.highScore || 0, score);
      }
      p.bubbo.currentGame = null;
      return ok(action, p, { score, goldReward, tokenReward });
    }
    default:
      return fail(400, "unknown action", { action });
  }
}

export default function playerRoutes(requireAuth, resolveUser) {
  const router = Router();

  router.get("/api/player/snapshot", requireAuth, async (req, res, next) => {
    try {
      const { userId, username } = resolveUser(req);
      if (!userId) return res.status(400).json({ error: "userId required" });
      const snapshot = await withPlayerLock(userId, async (p) => {
        const offlineReport = processOfflineActions(p);
        const streakResult = updateStreak(p);
        const newAchievements = checkAchievements(p);
        return buildSnapshot(p, { offlineReport, streakResult, newAchievements });
      }, username);
      res.json(snapshot);
    } catch (err) {
      next(err);
    }
  });

  router.post("/api/player/mutate", requireAuth, async (req, res, next) => {
    try {
      const { userId, username } = resolveUser(req);
      if (!userId) return res.status(400).json({ error: "userId required" });
      const { action, payload = {} } = req.body || {};
      const result = await withPlayerLock(userId, async (p) => applyAction(p, action, payload), username);
      res.status(result.status || 200).json(result.body || result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/api/pet/room/place", requireAuth, async (req, res, next) => {
    try {
      const { userId, username } = resolveUser(req);
      const result = await withPlayerLock(userId, async (p) => applyAction(p, "room.place", req.body), username);
      res.status(result.status || 200).json(result.body || result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/api/pet/room/pickup", requireAuth, async (req, res, next) => {
    try {
      const { userId, username } = resolveUser(req);
      const result = await withPlayerLock(userId, async (p) => applyAction(p, "room.pickup", req.body), username);
      res.status(result.status || 200).json(result.body || result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
