/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Building Blox Routes
 *  Start game (energy gate), end game (gold reward)
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { ECONOMY, calcRegen, calcBloxReward } from "../game-logic.js";
import { getPlayer, debouncedSaveDb } from "../playerManager.js";

export default function bloxRoutes(requireAuth, resolveUser) {
  const router = Router();

  router.post("/api/blox/start", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    calcRegen(p);

    if (p.resources.energy.current < ECONOMY.COST_BLOX) {
      return res.status(400).json({
        error: "NOT_ENOUGH_ENERGY",
        required: ECONOMY.COST_BLOX,
        current: p.resources.energy.current,
      });
    }
    p.resources.energy.current -= ECONOMY.COST_BLOX;
    p.blox.totalGames++;
    debouncedSaveDb();
    res.json({
      success: true,
      resources: p.resources,
      highScore: p.blox.highScore,
    });
  });

  router.post("/api/blox/end", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { score, linesCleared } = req.body;
    const p = getPlayer(userId);
    const goldReward = calcBloxReward(score);
    p.resources.gold += goldReward;
    if (typeof score === "number" && score > 0) {
      p.blox.highScore = Math.max(p.blox.highScore, score);
    }
    debouncedSaveDb();
    res.json({
      success: true,
      resources: p.resources,
      goldReward,
      highScore: p.blox.highScore,
    });
  });

  // v4.12.3: Get saved board state for cross-device sync
  router.post("/api/blox/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    res.json({
      savedState: p.blox.savedState || null,
      highScore: p.blox.highScore,
    });
  });

  // v4.12.3: Sync board state from client to server
  router.post("/api/blox/sync", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { savedState } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId);
    p.blox.savedState = savedState ?? null;
    debouncedSaveDb();
    res.json({ success: true });
  });

  return router;
}
