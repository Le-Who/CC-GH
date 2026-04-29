/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Resources & Items Routes
 *  Unified inventory and crop selling
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { CROPS, calcRegen } from "../game-logic.js";
import { afterPlayerCommit, withPlayerLock } from "../playerManager.js";
import { getDb } from "../db.js";
import { routeFail, routeOk, sendRouteResult } from "./mutationResults.js";

export default function resourcesRoutes(requireAuth, resolveUser) {
  const router = Router();

  /* ─── Get Unified Inventory (Matches frontend api("/api/resources/state")) ─── */
  router.get("/api/resources/state", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      calcRegen(p);
      return routeOk({
        resources: p.resources,
        pet: p.pet,
        room: p.room,
        harvested: p.farm.harvested,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  /* ─── Sell Crop (Bulk support) ─── */
  router.post("/api/farm/sell-crop", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      calcRegen(p);
      const { cropId, amount = 1 } = req.body;
      const qty = Math.max(1, Math.floor(Number(amount) || 1));

      if (!cropId || !p.farm.harvested[cropId] || p.farm.harvested[cropId] < qty) {
        return routeFail(400, { error: "no harvested crop to sell" });
      }
      const cfg = CROPS[cropId];
      if (!cfg) return routeFail(400, { error: "unknown crop" });
      const totalEarnings = cfg.sellPrice * qty;
      p.farm.harvested[cropId] -= qty;
      if (p.farm.harvested[cropId] <= 0) delete p.farm.harvested[cropId];
      p.resources.gold += totalEarnings;
      if (p.stats) p.stats.totalGoldEarned = (p.stats.totalGoldEarned || 0) + totalEarnings;

      afterPlayerCommit(p, async () => {
        const sql = getDb();
        if (!sql) return;
        await sql`INSERT INTO player_events (user_id, username, event_type, metadata)
            VALUES (${userId}, ${username}, 'sell_crop', ${sql.json({ crop_id: cropId, amount: qty, gold_earned: totalEarnings })})`;
      });

      return routeOk({
        success: true,
        resources: p.resources,
        harvested: p.farm.harvested,
        soldFor: totalEarnings,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  router.post("/api/pet/feed", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    return res.status(410).json({ error: "Pet feeding was replaced by Cozy Yard food bowls. Use yard.setFood." });
  });

  router.post("/api/pet/rename", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    return res.status(410).json({ error: "Pet rename was replaced by yard.configureCompanion." });
  });

  return router;
}
