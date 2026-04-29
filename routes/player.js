import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
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
  SEASON_PASS,
  TIER_YIELD,
  PIECES,
  PIECE_COUNT,
  YARD_GOODIES,
  applyYardActionToState,
  calcBloxReward,
  calcGoldReward,
  calcRegen,
  calcTokenReward,
  checkAchievements,
  farmPlotsWithGrowth,
  getYardCatalogSnapshot,
  getGrowthPct,
  getMergePairResult,
  getUnlockedSeeds,
  hydrateMergeBoard,
  MERGE_WILD_GENERATOR_ID,
  normalizeYardState,
  pickMergeDropChainId,
  processOfflineActions,
  simulateYardState,
  updateStreak,
  validCoord,
  createEmptyBoard,
  canAnyPieceFit,
  canPlace,
  calcBubboReward,
  placePiece,
  createDefaultGardenState,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

const MAX_PLOTS = 12;
const BUY_PLOT_BASE_COST = 200;
const ACTION_RECEIPT_LIMIT = 200;
const ACTION_RECEIPT_TTL_MS = 72 * 60 * 60 * 1000;

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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeClientActionId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!/^[a-zA-Z0-9_.:-]{8,120}$/.test(text)) return null;
  return text;
}

function hashActionPayload(action, payload) {
  return createHash("sha256")
    .update(stableStringify({ action: String(action || ""), payload: payload || {} }))
    .digest("base64url");
}

function pruneActionReceipts(p, now = Date.now()) {
  const source = p._actionReceipts && typeof p._actionReceipts === "object" ? p._actionReceipts : {};
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const cutoff = now - ACTION_RECEIPT_TTL_MS;
  const items = rawItems
    .filter((item) => item?.clientActionId && item.payloadHash && Number(item.createdAt) >= cutoff)
    .slice(-ACTION_RECEIPT_LIMIT);
  p._actionReceipts = { items };
  return items;
}

function rememberActionReceipt(p, receipt, now = Date.now()) {
  const items = pruneActionReceipts(p, now).filter((item) => item.clientActionId !== receipt.clientActionId);
  items.push({ ...receipt, createdAt: now });
  p._actionReceipts = { items: items.slice(-ACTION_RECEIPT_LIMIT) };
}

function actionExtrasFromResult(result) {
  const body = result?.body || {};
  const { success, action, snapshot, ...extras } = body;
  return extras;
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

const GARDEN_MAX_LEVEL = 24;
const GARDEN_MAX_SHELVES = 5;
const GARDEN_MAX_PLANTS = 48;
const GARDEN_PLANT_IDS = new Set(["daisy", "lavender", "basil", "rosemary", "monstera", "succulent", "pothos", "strawberry"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeGardenPlant(raw = {}) {
  const id = String(raw.id || randomUUID()).slice(0, 80);
  const rawType = String(raw.type || "daisy").slice(0, 40);
  const type = GARDEN_PLANT_IDS.has(rawType) ? rawType : "daisy";
  return {
    id,
    type,
    level: Math.max(1, Math.min(30, Math.floor(finiteNumber(raw.level, 1)))),
    shelfIndex: Math.max(-1, Math.min(GARDEN_MAX_SHELVES - 1, Math.floor(finiteNumber(raw.shelfIndex, -1)))),
    spotIndex: Math.max(-1, Math.min(2, Math.floor(finiteNumber(raw.spotIndex, -1)))),
    phase: Math.max(0, Math.min(3, Math.floor(finiteNumber(raw.phase, 0)))),
    phaseProgress: Math.max(0, Math.min(86_400_000, Math.floor(finiteNumber(raw.phaseProgress, 0)))),
    ...(raw.lastWatered ? { lastWatered: Math.max(0, Math.floor(finiteNumber(raw.lastWatered, 0))) } : {}),
  };
}

function normalizeGardenState(raw = {}, now = Date.now()) {
  const fallback = createDefaultGardenState(now);
  const source = raw && typeof raw === "object" ? raw : {};
  const plants = Array.isArray(source.plants)
    ? source.plants.slice(0, GARDEN_MAX_PLANTS).map(normalizeGardenPlant)
    : [];

  return {
    ...fallback,
    totalGoldEarned: Math.max(0, Math.min(1_000_000_000, Math.floor(finiteNumber(source.totalGoldEarned, fallback.totalGoldEarned)))),
    level: Math.max(1, Math.min(GARDEN_MAX_LEVEL, Math.floor(finiteNumber(source.level, fallback.level)))),
    xp: Math.max(0, Math.min(1_000_000_000, Math.floor(finiteNumber(source.xp, fallback.xp)))),
    shelvesUnlocked: Math.max(1, Math.min(GARDEN_MAX_SHELVES, Math.floor(finiteNumber(source.shelvesUnlocked, fallback.shelvesUnlocked)))),
    plants,
    lastTick: Math.max(0, Math.floor(finiteNumber(source.lastTick, now))),
    offlineEarnings: null,
  };
}

function ensurePlayerYard(p, now = Date.now(), simulate = false) {
  const legacy = { pet: p.pet, room: p.room };
  p.yard = simulate
    ? simulateYardState(p.yard, now, legacy, p.id || p.username || "yard")
    : normalizeYardState(p.yard, legacy, now);
  return p.yard;
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

function buildInventory(p, options = {}) {
  if (options.hydrateMerge !== false) hydrateMergeBoard(p);
  const yard = options.yard || ensurePlayerYard(p);
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
    yardFood: { ...(yard.foodInventory || {}) },
    yardGoodies: { ...(yard.goodieInventory || {}) },
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
  const now = Date.now();
  hydrateMergeBoard(p);
  calcRegen(p, now);
  const yard = ensurePlayerYard(p, now);
  const farmStats = getFarmStats(p);
  const bloxSaved = parseJsonValue(p.blox?.savedState, null);
  const savedModes = parseJsonValue(p.match3?.savedModes, {});
  const roomInventory = Array.isArray(p.room?.roomInventory)
    ? p.room.roomInventory
    : Array.isArray(p.room?.inventory)
      ? p.room.inventory
      : [];

  return {
    serverTime: now,
    player: {
      id: p.id,
      username: p.username,
      onboarded: !!p._onboarded,
      schemaVersion: p.schemaVersion,
      syncSeq: p._syncSeq || 0,
    },
    resources: normalizeResources(p),
    inventory: buildInventory(p, { yard, hydrateMerge: false }),
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
    garden: normalizeGardenState(p.garden, now),
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
    yard,
    achievements: {
      badges: buildAchievements(p),
      raw: p.achievements || {},
      totalUnlocked: Object.keys(p.achievements || {}).length,
      totalBadges: Object.keys(ACHIEVEMENTS).length,
    },
    meta: {
      crops: CROPS,
      mergeChains: MERGE_CHAINS,
      yardCatalog: getYardCatalogSnapshot(),
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
  if (!p.merge.generatorState[MERGE_WILD_GENERATOR_ID]) {
    p.merge.generatorState[MERGE_WILD_GENERATOR_ID] = {
      tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
      cooldownEnd: 0,
    };
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

function randomYardGoodie(p, chance = 0.08) {
  if (Math.random() > chance) return null;
  const yard = ensurePlayerYard(p);
  const ids = Object.keys(YARD_GOODIES);
  const owned = new Set([
    ...Object.keys(yard.goodieInventory || {}),
    ...(yard.placedGoodies || []).map((placed) => placed.goodieId),
  ]);
  const candidates = ids.filter((id) => !owned.has(id));
  if (!candidates.length) return null;
  const id = candidates[Math.floor(Math.random() * candidates.length)];
  yard.goodieInventory[id] = (yard.goodieInventory[id] || 0) + 1;
  return id;
}

function actionTime(options = {}) {
  const value = Number(options.now);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : Date.now();
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

export async function applyAction(p, action, payload = {}, options = {}) {
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
    case "garden.sync": {
      p.garden = normalizeGardenState(payload.state, Date.now());
      return ok(action, p, { garden: p.garden });
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
    case "yard.buyFood":
    case "yard.setFood":
    case "yard.buyGoodie":
    case "yard.placeGoodie":
    case "yard.pickupGoodie":
    case "yard.fixGoodie":
    case "yard.collectGifts":
    case "yard.capturePhoto":
    case "yard.favoritePhoto":
    case "yard.setRemodel":
    case "yard.buyExpansion":
    case "yard.claimDailyLetter":
    case "yard.configureCompanion": {
      const yardOptions = Number.isFinite(Number(options.yardNow)) ? { now: options.yardNow } : {};
      const result = applyYardActionToState(p.yard, action, payload, { pet: p.pet, room: p.room }, p.id || p.username || "yard", yardOptions);
      p.yard = result.yard;
      if (result.status !== 200) return fail(result.status, result.error);
      p._onboarded = true;
      return ok(action, p, result.extras || {});
    }
    case "merge.tap": {
      const { chainId = MERGE_WILD_GENERATOR_ID, cropId } = payload;
      ensureMergeState(p);
      const wildTap = !chainId || chainId === MERGE_WILD_GENERATOR_ID;
      if (!wildTap) {
        const chain = MERGE_CHAINS[chainId];
        if (!chain) return fail(400, "invalid chainId");
        if (!p.merge.generators.includes(chainId)) return fail(400, "generator locked");
      }
      const generatorId = wildTap ? MERGE_WILD_GENERATOR_ID : chainId;
      const state = p.merge.generatorState[generatorId] || {
        tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT,
        cooldownEnd: 0,
      };
      const now = actionTime(options);
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
        const dropChainId = wildTap ? pickMergeDropChainId(p.merge.board) : chainId;
        const chain = MERGE_CHAINS[dropChainId];
        const rand = Math.random();
        let level = 0;
        if (rand > 0.95 && chain.items.length > 2) level = 2;
        else if (rand > 0.8 && chain.items.length > 1) level = 1;
        p.merge.board[r][c] = { id: chain.items[level], chainId: dropChainId, level };
        if (wildTap) unlockMergeChain(p, dropChainId);
        spawned.push({ r, c, item: p.merge.board[r][c] });
      }
      p.merge.generatorState[generatorId] = state;
      return ok(action, p, { chainId: generatorId, spawned, usedFreeTap });
    }
    case "merge.merge": {
      const { fromR, fromC, toR, toC } = payload;
      ensureMergeState(p);
      if (!validCoord(fromR, BOARD_ROWS) || !validCoord(fromC, BOARD_COLS) || !validCoord(toR, BOARD_ROWS) || !validCoord(toC, BOARD_COLS)) return fail(400, "invalid coordinates");
      const src = p.merge.board[fromR][fromC];
      const dst = p.merge.board[toR][toC];
      if (!src || !dst) return fail(400, "empty cell");
      const resultItem = getMergePairResult(src, dst);
      if (!resultItem) return fail(400, "chain/level mismatch");
      p.merge.board[toR][toC] = { id: resultItem.id, chainId: resultItem.chainId, level: resultItem.level };
      p.merge.board[fromR][fromC] = null;
      unlockMergeChain(p, resultItem.chainId);
      const yardDrop = resultItem.level >= 4 ? randomYardGoodie(p, 0.18) : null;
      return ok(action, p, {
        newItem: p.merge.board[toR][toC],
        recipeId: resultItem.recipeId || null,
        yardDrop,
        reward: yardDrop ? { type: "yardGoodie", goodieId: yardDrop, source: resultItem.recipeId ? "mergeRecipe" : "merge" } : undefined,
        newAchievements: checkAchievements(p),
      });
    }
    case "merge.gacha":
    case "merge.freePull": {
      ensureMergeState(p);
      const free = action === "merge.freePull";
      const now = actionTime(options);
      const cells = emptyMergeCells(p.merge.board);
      if (!cells.length) return fail(400, "board full");
      if (free) {
        const today = new Date(now).toISOString().slice(0, 10);
        if (new Date(p.merge.lastFreePull || 0).toISOString().slice(0, 10) === today) return fail(400, "free pull already used today");
        p.merge.lastFreePull = now;
      } else {
        if ((p.resources.gachaTokens || 0) < ECONOMY.GACHA_PULL_COST) return fail(400, "not enough tokens", { required: ECONOMY.GACHA_PULL_COST });
        p.resources.gachaTokens -= ECONOMY.GACHA_PULL_COST;
      }
      const chainIds = Object.keys(MERGE_CHAINS);
      const chainId = chainIds[Math.floor(Math.random() * chainIds.length)];
      const chain = MERGE_CHAINS[chainId];
      const [r, c] = cells[Math.floor(Math.random() * cells.length)];
      p.merge.board[r][c] = { id: chain.items[0], chainId, level: 0 };
      unlockMergeChain(p, chainId);
      const yardDrop = randomYardGoodie(p, free ? 0.04 : 0.12);
      return ok(action, p, {
        spawned: { r, c, item: p.merge.board[r][c] },
        chainId,
        yardDrop,
        reward: yardDrop ? { type: "yardGoodie", goodieId: yardDrop, source: free ? "freePull" : "gacha" } : undefined,
      });
    }
    case "merge.claimFreeTaps": {
      ensureMergeState(p);
      const now = actionTime(options);
      const today = new Date(now).toISOString().slice(0, 10);
      if (new Date(p.merge.lastFreeTaps || 0).toISOString().slice(0, 10) === today) return fail(400, "already claimed today");
      p.merge.lastFreeTaps = now;
      p.merge.freeTapCharges = (Number(p.merge.freeTapCharges) || 0) + 30;
      return ok(action, p, { freeTapCharges: p.merge.freeTapCharges });
    }
    case "merge.trash": {
      const { r, c } = payload;
      ensureMergeState(p);
      if (!validCoord(r, BOARD_ROWS) || !validCoord(c, BOARD_COLS)) return fail(400, "invalid coordinates");
      if (!p.merge.board[r]?.[c]) return fail(400, "empty cell");
      const trashedItem = p.merge.board[r][c];
      p.merge.board[r][c] = null;
      return ok(action, p, { r, c, trashedItem });
    }
    case "blox.start": {
      calcRegen(p);
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

export async function applyActionWithReceipt(p, action, payload = {}, meta = {}) {
  const clientActionId = normalizeClientActionId(meta.clientActionId);
  const serverNow = Number.isFinite(Number(meta.serverNow)) ? Number(meta.serverNow) : Date.now();
  const actionOptions = { yardNow: serverNow, now: serverNow };

  if (!clientActionId) return applyAction(p, action, payload, actionOptions);

  const payloadHash = hashActionPayload(action, payload);
  const receipts = pruneActionReceipts(p, serverNow);
  const existing = receipts.find((item) => item.clientActionId === clientActionId);
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      return fail(409, "client action conflict", { clientActionId });
    }
    return ok(action, p, {
      ...(existing.extras || {}),
      clientActionId,
      duplicate: true,
    });
  }

  const result = await applyAction(p, action, payload, actionOptions);
  if ((result.status || 200) === 200) {
    rememberActionReceipt(p, {
      clientActionId,
      payloadHash,
      action: String(action || ""),
      extras: actionExtrasFromResult(result),
    }, serverNow);
  }
  return result;
}

export default function playerRoutes(requireAuth, resolveUser) {
  const router = Router();

  router.get("/api/player/snapshot", requireAuth, async (req, res, next) => {
    try {
      const { userId, username } = resolveUser(req);
      if (!userId) return res.status(400).json({ error: "userId required" });
      const snapshot = await withPlayerLock(userId, async (p) => {
        const offlineReport = processOfflineActions(p);
        ensurePlayerYard(p, Date.now(), true);
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
      const { action, payload = {}, clientActionId = null, intentServerTime = null } = req.body || {};
      const serverNow = Date.now();
      const result = await withPlayerLock(userId, async (p) => applyActionWithReceipt(p, action, payload, {
        clientActionId,
        intentServerTime,
        serverNow,
      }), username);
      res.status(result.status || 200).json(result.body || result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/api/pet/room/place", requireAuth, async (req, res, next) => {
    try {
      resolveUser(req);
      res.status(410).json({ error: "Pet Room placement was replaced by yard.placeGoodie" });
    } catch (err) {
      next(err);
    }
  });

  router.post("/api/pet/room/pickup", requireAuth, async (req, res, next) => {
    try {
      resolveUser(req);
      res.status(410).json({ error: "Pet Room pickup was replaced by yard.pickupGoodie" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
