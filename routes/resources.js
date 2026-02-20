/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Resources & Pet Routes
 *  Energy/gold state, crop selling, pet feeding
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { ECONOMY, CROPS, calcRegen } from "../game-logic.js";
import { getPlayer, debouncedSaveDb } from "../playerManager.js";

export default function resourcesRoutes(requireAuth, resolveUser) {
  const router = Router();

  router.get("/api/resources/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    calcRegen(p);
    res.json({
      resources: p.resources,
      pet: p.pet,
      harvested: p.farm.harvested,
    });
  });

  /* ─── Sell Crop ─── */
  router.post("/api/farm/sell-crop", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { cropId } = req.body;
    const p = getPlayer(userId);
    if (!cropId || !p.farm.harvested[cropId] || p.farm.harvested[cropId] <= 0) {
      return res.status(400).json({ error: "no harvested crop to sell" });
    }
    const cfg = CROPS[cropId];
    if (!cfg) return res.status(400).json({ error: "unknown crop" });
    // Sell price = ceil((seedPrice * 0.5) * (growthTimeSec * 0.25))
    const growSec = (cfg.growthTime || 15000) / 1000;
    const sellPrice = Math.ceil(cfg.seedPrice * 0.5 * (growSec * 0.25));
    p.farm.harvested[cropId]--;
    if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
    p.resources.gold += sellPrice;
    debouncedSaveDb();
    res.json({
      success: true,
      resources: p.resources,
      harvested: p.farm.harvested,
      soldFor: sellPrice,
    });
  });

  router.post("/api/pet/feed", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { cropId } = req.body;
    const p = getPlayer(userId);
    calcRegen(p);

    // Validate crop
    if (!cropId || !p.farm.harvested[cropId] || p.farm.harvested[cropId] <= 0) {
      return res.status(400).json({ error: "no harvested crop to feed" });
    }

    // Deduct crop
    p.farm.harvested[cropId]--;
    if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];

    // Restore energy
    const e = p.resources.energy;
    e.current = Math.min(e.max, e.current + ECONOMY.FEED_ENERGY);

    // Pet XP & leveling
    p.pet.xp += ECONOMY.FEED_PET_XP;
    let leveledUp = false;
    while (p.pet.xp >= p.pet.xpToNextLevel) {
      p.pet.xp -= p.pet.xpToNextLevel;
      p.pet.level++;
      p.pet.xpToNextLevel = Math.floor(p.pet.xpToNextLevel * 1.5);
      leveledUp = true;
    }

    // Unlock abilities
    if (p.pet.level >= 3) p.pet.abilities.autoHarvest = true;
    if (p.pet.level >= 5) p.pet.abilities.autoWater = true;
    if (p.pet.level >= 7) p.pet.abilities.autoPlant = true;

    // Happiness boost
    p.pet.stats.happiness = Math.min(100, p.pet.stats.happiness + 5);

    debouncedSaveDb();
    res.json({
      success: true,
      resources: p.resources,
      pet: p.pet,
      harvested: p.farm.harvested,
      leveledUp,
    });
  });

  return router;
}
