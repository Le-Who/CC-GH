/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Farm Routes
 *  Plot management, planting, watering, harvesting, seed shop
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import crypto from "crypto";
import {
  CROPS,
  calcRegen,
  processOfflineActions,
  getGrowthPct,
  farmPlotsWithGrowth,
} from "../game-logic.js";
import { getPlayer, debouncedSaveDb } from "../playerManager.js";

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

  router.post("/api/farm/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    calcRegen(p);

    // Run offline simulation (harvest → plant → water)
    const offlineReport = processOfflineActions(p);
    if (offlineReport) debouncedSaveDb();

    res.json({
      ...p.farm,
      plots: farmPlotsWithGrowth(p.farm),
      resources: p.resources,
      pet: p.pet,
      offlineReport,
      serverTime: Date.now(),
    });
  });

  router.post("/api/farm/plant", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { plotId, cropId } = req.body;
    const p = getPlayer(userId);
    if (!CROPS[cropId]) return res.status(400).json({ error: "unknown crop" });
    const plot = p.farm.plots[plotId];
    if (!plot || plot.crop)
      return res.status(400).json({ error: "plot occupied" });
    const seeds = p.farm.inventory[cropId] || 0;
    if (seeds <= 0) return res.status(400).json({ error: "no seeds" });

    p.farm.inventory[cropId] = seeds - 1;
    plot.crop = cropId;
    plot.plantedAt = Date.now();
    plot.watered = false;
    debouncedSaveDb();

    res.json({
      success: true,
      plots: farmPlotsWithGrowth(p.farm),
      inventory: p.farm.inventory,
      coins: p.farm.coins,
      serverTime: Date.now(),
    });
  });

  router.post("/api/farm/water", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { plotId } = req.body;
    const p = getPlayer(userId);
    const plot = p.farm.plots[plotId];
    if (!plot || !plot.crop || plot.watered)
      return res.status(400).json({ error: "cannot water" });
    plot.watered = true;
    debouncedSaveDb();
    res.json({
      success: true,
      plots: farmPlotsWithGrowth(p.farm),
      serverTime: Date.now(),
    });
  });

  router.post("/api/farm/harvest", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { plotId } = req.body;
    const p = getPlayer(userId);
    const plot = p.farm.plots[plotId];
    if (!plot || !plot.crop)
      return res.status(400).json({ error: "nothing to harvest" });
    if (getGrowthPct(plot) < 1)
      return res.status(400).json({ error: "not ready" });
    const cfg = CROPS[plot.crop];
    const cropId = plot.crop;
    // Produce crop item for pet feeding (no gold from harvest)
    p.farm.harvested[cropId] = (p.farm.harvested[cropId] || 0) + 1;
    p.farm.xp += cfg.xp;
    const newLevel = Math.floor(p.farm.xp / 100) + 1;
    const leveledUp = newLevel > p.farm.level;
    p.farm.level = newLevel;
    plot.crop = null;
    plot.plantedAt = null;
    plot.watered = false;
    debouncedSaveDb();
    res.json({
      success: true,
      reward: { coins: cfg.sellPrice, xp: cfg.xp, crop: cfg.emoji },
      plots: farmPlotsWithGrowth(p.farm),
      resources: p.resources,
      harvested: p.farm.harvested,
      xp: p.farm.xp,
      level: p.farm.level,
      leveledUp,
      serverTime: Date.now(),
    });
  });

  router.post("/api/farm/buy-seeds", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { cropId, amount = 1 } = req.body;
    const p = getPlayer(userId);
    const cfg = CROPS[cropId];
    if (!cfg) return res.status(400).json({ error: "unknown crop" });
    const cost = cfg.seedPrice * amount;
    if (p.resources.gold < cost)
      return res.status(400).json({ error: "not enough gold" });
    p.resources.gold -= cost;
    p.farm.inventory[cropId] = (p.farm.inventory[cropId] || 0) + amount;
    debouncedSaveDb();
    res.json({
      success: true,
      resources: p.resources,
      inventory: p.farm.inventory,
    });
  });

  const BUY_PLOT_BASE_COST = 200;
  const MAX_PLOTS = 12;

  router.post("/api/farm/buy-plot", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const p = getPlayer(userId);
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

    debouncedSaveDb();
    res.json({
      success: true,
      plots: farmPlotsWithGrowth(p.farm),
      resources: p.resources,
      plotCount: p.farm.plots.length,
      nextCost,
      maxPlots: MAX_PLOTS,
    });
  });

  return router;
}
