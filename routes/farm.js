/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Farm Routes
 *  Plot management, planting, watering, harvesting, seed shop
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import crypto from "crypto";
import {
  ECONOMY,
  CROPS,
  calcRegen,
  processOfflineActions,
  getGrowthPct,
  farmPlotsWithGrowth,
  updateStreak,
  checkAchievements,
  mergeCropConfig,
  BOOSTER_CONFIG,
  PLOT_THEMES,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

export default function farmRoutes(requireAuth, resolveUser) {
  const router = Router();

  // Compute crops config hash for cache invalidation
  const cropsHash = crypto
    .createHash("md5")
    .update(JSON.stringify(CROPS))
    .digest("hex")
    .slice(0, 8);

  router.get("/api/content/crops", (_req, res) =>
    res.json({ ...CROPS, __hash: cropsHash }),
  );

  router.post("/api/farm/state", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      calcRegen(p);

      // Run offline simulation (harvest → plant → water)
      const offlineReport = processOfflineActions(p);

      // v7.3: Streak system — check daily login
      const streakResult = updateStreak(p);
      // v7.3: Achievement check
      const newAchievements = checkAchievements(p);

      // v8.1: Single consolidated save instead of 3 separate debouncedSavePlayer calls
      if (
        offlineReport ||
        streakResult.continued ||
        streakResult.broken ||
        newAchievements.length > 0
      ) { /* consolidated save handled by wrapper returning p */ }

      res.json({
        ...p.farm,
        plots: farmPlotsWithGrowth(p.farm),
        resources: p.resources,
        pet: p.pet,
        offlineReport,
        streak: p.streak,
        streakResult,
        newAchievements,
        seasonPass: p.seasonPass,
        cosmetics: p.cosmetics,
        boosters: p.boosters,
        journal: p.journal,
        serverTime: Date.now(),
      });
    });
  });

  router.post("/api/farm/plant", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { plotId, cropId } = req.body;
      if (!CROPS[cropId]) return res.status(400).json({ error: "unknown crop" });
      const idx = Number(plotId);
      if (!Number.isInteger(idx) || idx < 0 || idx >= p.farm.plots.length)
        return res.status(400).json({ error: "invalid plot" });
      const plot = p.farm.plots[idx];
      if (plot.crop) return res.status(400).json({ error: "plot occupied" });
      const seeds = p.farm.inventory[cropId] || 0;
      if (seeds <= 0) return res.status(400).json({ error: "no seeds" });

      p.farm.inventory[cropId] = seeds - 1;
      plot.crop = cropId;
      plot.plantedAt = Date.now();
      plot.watered = false;

      res.json({
        success: true,
        plots: farmPlotsWithGrowth(p.farm),
        inventory: p.farm.inventory,
        serverTime: Date.now(),
      });
    });
  });

  router.post("/api/farm/water", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { plotId } = req.body;
      const idx = Number(plotId);
      if (!Number.isInteger(idx) || idx < 0 || idx >= p.farm.plots.length)
        return res.status(400).json({ error: "invalid plot" });
      const plot = p.farm.plots[idx];
      if (!plot.crop || plot.watered)
        return res.status(400).json({ error: "cannot water" });
      plot.watered = true;
      res.json({
        success: true,
        plots: farmPlotsWithGrowth(p.farm),
        serverTime: Date.now(),
      });
    });
  });

  router.post("/api/farm/harvest", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { plotId } = req.body;
      const idx = Number(plotId);
      if (!Number.isInteger(idx) || idx < 0 || idx >= p.farm.plots.length)
        return res.status(400).json({ error: "invalid plot" });
      const plot = p.farm.plots[idx];
      if (!plot.crop)
        return res.status(400).json({ error: "nothing to harvest" });
      if (getGrowthPct(plot) < 1) {
        // v7.3: Include remainingMs and serverTime for client-side healing reconciliation
        const cfg = CROPS[plot.crop];
        const mult = plot.watered ? 0.5 : 1; // approximate watering multiplier
        const totalGrowMs = (cfg?.growthTime || 60000) * mult;
        const elapsed = Date.now() - (plot.plantedAt || Date.now());
        const remainingMs = Math.max(0, totalGrowMs - elapsed);
        return res.status(400).json({
          error: "not ready",
          remainingMs,
          serverTime: Date.now(),
        });
      }
      const cfg = CROPS[plot.crop];
      const cropId = plot.crop;
      // Produce crop item for pet feeding (no gold from harvest)
      p.farm.harvested[cropId] = (p.farm.harvested[cropId] || 0) + 1;

      // 2% chance to drop a gacha token on harvest
      let tokenDrop = false;
      if (Math.random() < ECONOMY.TOKEN_FARM_DROP_CHANCE) {
        p.resources.gachaTokens = (p.resources.gachaTokens || 0) + 1;
        tokenDrop = true;
      }
      p.farm.xp += cfg.xp;

      // v7.3: Season pass XP from harvesting
      if (!p.seasonPass)
        p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
      p.seasonPass.xp += cfg.xp;

      // v7.3: Journal discovery
      if (!p.journal) p.journal = { discovered: [] };
      if (!p.journal.discovered.includes(cropId)) {
        p.journal.discovered.push(cropId);
      }

      const newLevel = Math.floor(p.farm.xp / 100) + 1;
      const leveledUp = newLevel > p.farm.level;
      p.farm.level = newLevel;
      plot.crop = null;
      plot.plantedAt = null;
      plot.watered = false;
      res.json({
        success: true,
        reward: { coins: cfg.sellPrice, xp: cfg.xp, crop: cfg.emoji },
        plots: farmPlotsWithGrowth(p.farm),
        resources: p.resources,
        harvested: p.farm.harvested,
        tokenDrop,
        xp: p.farm.xp,
        level: p.farm.level,
        leveledUp,
        serverTime: Date.now(),
      });
    });
  });

  /* ─── Uproot (💣 — no refund) ─── */
  router.post("/api/farm/uproot", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { plotId } = req.body;
      const idx = Number(plotId);
      if (!Number.isInteger(idx) || idx < 0 || idx >= p.farm.plots.length)
        return res.status(400).json({ error: "invalid plot" });
      const plot = p.farm.plots[idx];
      if (!plot.crop) return res.status(400).json({ error: "nothing to uproot" });
      if (getGrowthPct(plot) >= 1)
        return res.status(400).json({ error: "already ready — harvest instead" });

      // Hard write-off: seed is lost, plot cleared
      plot.crop = null;
      plot.plantedAt = null;
      plot.watered = false;
      res.json({
        success: true,
        plots: farmPlotsWithGrowth(p.farm),
        resources: p.resources,
        serverTime: Date.now(),
      });
    });
  });

  router.post("/api/farm/buy-seeds", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { cropId, amount = 1 } = req.body;
      const cfg = CROPS[cropId];
      if (!cfg) return res.status(400).json({ error: "unknown crop" });
      // Validate amount: must be positive integer, capped at 1000
      const qty = Math.max(1, Math.floor(Number(amount) || 1));
      if (qty > 1000) return res.status(400).json({ error: "amount too large" });
      const cost = cfg.seedPrice * qty;
      if (p.resources.gold < cost)
        return res.status(400).json({ error: "not enough gold" });
      p.resources.gold -= cost;
      p.farm.inventory[cropId] = (p.farm.inventory[cropId] || 0) + qty;
      res.json({
        success: true,
        resources: p.resources,
        inventory: p.farm.inventory,
      });
    });
  });

  const BUY_PLOT_BASE_COST = 200;
  const MAX_PLOTS = 12;

  router.post("/api/farm/buy-plot", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const currentPlots = p.farm.plots.length;

      if (currentPlots >= MAX_PLOTS) {
        return res.status(400).json({ error: "max plots reached" });
      }

      // Doubling cost: 200, 400, 800, 1600, 3200, 6400
      const cost = BUY_PLOT_BASE_COST * Math.pow(2, currentPlots - 6);

      if (p.resources.gold < cost) {
        return res.status(400).json({ error: "not enough gold", cost });
      }

      p.resources.gold -= cost;
      p.farm.plots.push({
        id: currentPlots,
        crop: null,
        plantedAt: null,
        watered: false,
      });

      const nextCost =
        currentPlots + 1 < MAX_PLOTS
          ? BUY_PLOT_BASE_COST * Math.pow(2, currentPlots + 1 - 6)
          : null;
      res.json({
        success: true,
        plots: farmPlotsWithGrowth(p.farm),
        resources: p.resources,
        plotCount: p.farm.plots.length,
        nextCost,
        maxPlots: MAX_PLOTS,
      });
    });
  });

  /* ─── v7.3: Dynamic Crops Config ─── */
  let cropOverrides = {}; // Live-ops tuning layer (in-memory for now)
  router.get("/api/farm/crops", requireAuth, async (_req, res) => {
    const merged = mergeCropConfig(CROPS, cropOverrides);
    res.json({ crops: merged });
  });

  /* ─── v7.3: Activate Fertilizer Booster ─── */
  router.post("/api/farm/activate-booster", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { boosterId = "fertilizer" } = req.body;
      const cfg = BOOSTER_CONFIG[boosterId];
      if (!cfg) return res.status(400).json({ error: "unknown booster" });
      if (!p.boosters) p.boosters = {};
      if (
        p.boosters[boosterId]?.active &&
        p.boosters[boosterId].expiresAt > Date.now()
      ) {
        return res.status(400).json({ error: "booster already active" });
      }
      if (p.resources.gold < cfg.cost) {
        return res.status(400).json({ error: "not enough gold" });
      }
      p.resources.gold -= cfg.cost;
      p.boosters[boosterId] = {
        active: true,
        expiresAt: Date.now() + cfg.durationMs,
      };
      res.json({
        success: true,
        boosters: p.boosters,
        resources: p.resources,
      });
    });
  });

  /* ─── v7.3: Buy Plot Theme ─── */
  router.post("/api/farm/buy-theme", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { themeId } = req.body;
      const theme = PLOT_THEMES[themeId];
      if (!theme) return res.status(400).json({ error: "unknown theme" });
      if (!p.cosmetics)
        p.cosmetics = { activePlotTheme: "default", ownedThemes: ["default"] };
      if (p.cosmetics.ownedThemes.includes(themeId)) {
        return res.status(400).json({ error: "already owned" });
      }
      if (p.resources.gold < theme.cost) {
        return res.status(400).json({ error: "not enough gold" });
      }
      p.resources.gold -= theme.cost;
      p.cosmetics.ownedThemes.push(themeId);
      res.json({ success: true, cosmetics: p.cosmetics, resources: p.resources });
    });
  });

  /* ─── v7.3: Set Active Theme ─── */
  router.post("/api/farm/set-theme", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { themeId } = req.body;
      if (!p.cosmetics)
        p.cosmetics = { activePlotTheme: "default", ownedThemes: ["default"] };
      if (!p.cosmetics.ownedThemes.includes(themeId)) {
        return res.status(400).json({ error: "theme not owned" });
      }
      p.cosmetics.activePlotTheme = themeId;
      res.json({ success: true, cosmetics: p.cosmetics });
    });
  });

  return router;
}
