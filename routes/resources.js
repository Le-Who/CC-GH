/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Resources & Items Routes
 *  Unified inventory, crop selling, pet feeding
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { CROPS, calcRegen } from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

export default function resourcesRoutes(requireAuth, resolveUser) {
  const router = Router();

  /* ─── Get Unified Inventory (Matches frontend api("/api/resources/state")) ─── */
  router.get("/api/resources/state", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      calcRegen(p);
      res.json({
        resources: p.resources,
        pet: p.pet,
        room: p.room,
        harvested: p.farm.harvested,
      });
    }, username);
  });

  /* ─── Sell Crop (Bulk support) ─── */
  router.post("/api/farm/sell-crop", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { cropId, amount = 1 } = req.body;
      const qty = Math.max(1, Math.floor(Number(amount) || 1));

      if (!cropId || !p.farm.harvested[cropId] || p.farm.harvested[cropId] < qty) {
        return res.status(400).json({ error: "no harvested crop to sell" });
      }
      const cfg = CROPS[cropId];
      if (!cfg) return res.status(400).json({ error: "unknown crop" });
      const totalEarnings = cfg.sellPrice * qty;
      p.farm.harvested[cropId] -= qty;
      if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
      p.resources.gold += totalEarnings;
      res.json({
        success: true,
        resources: p.resources,
        harvested: p.farm.harvested,
        soldFor: totalEarnings,
      });
    }, username);
  });

  /* ─── Feed Pet (Aligned with game-logic.js satiety) ─── */
  router.post("/api/pet/feed", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { cropId } = req.body;
      calcRegen(p);

      if (!cropId || !p.farm.harvested[cropId] || p.farm.harvested[cropId] <= 0) {
        return res.status(400).json({ error: "no harvested crop to feed" });
      }
      const cfg = CROPS[cropId];
      if (!cfg) return res.status(400).json({ error: "unknown crop" });

      // v6.2.0: Pet uses fullness stats instead of legacy hunger
      if (!p.pet.stats) p.pet.stats = { happiness: 100, fullness: 0 };
      if (p.pet.stats.fullness >= 100) {
        return res.status(400).json({ error: "pet is full" });
      }

      p.farm.harvested[cropId]--;
      if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
      
      const fullnessYield = cfg.fullnessYield || 10;
      const energyYield = cfg.energyYield || 2;

      p.pet.stats.fullness = Math.min(100, p.pet.stats.fullness + fullnessYield);
      p.resources.energy.current = Math.min(p.resources.energy.max, p.resources.energy.current + energyYield);
      
      res.json({
        success: true,
        pet: p.pet,
        resources: p.resources,
        harvested: p.farm.harvested
      });
    }, username);
  });

  /* ─── Rename Pet ─── */
  router.post("/api/pet/rename", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { newName } = req.body;
      if (!newName || typeof newName !== "string") {
        return res.status(400).json({ error: "invalid name" });
      }
      p.pet.name = newName.trim().slice(0, 16);
      res.json({ success: true, pet: p.pet });
    }, username);
  });

  return router;
}
