/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Building Blox Routes
 *  Start game (energy gate), end game (gold reward)
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { ECONOMY, calcRegen, calcBloxReward } from "../game-logic.js";
import { getPlayer, debouncedSavePlayer } from "../playerManager.js";

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
    debouncedSavePlayer(userId);
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

    // Gacha token reward: 1 base + bonus for high performance
    let tokenReward = ECONOMY.REWARD_GACHA_TOKENS;
    for (const threshold of ECONOMY.TOKEN_BONUS_THRESHOLDS) {
      if (score >= threshold) tokenReward++;
    }
    p.resources.gachaTokens = (p.resources.gachaTokens || 0) + tokenReward;

    if (typeof score === "number" && score > 0) {
      p.blox.highScore = Math.max(p.blox.highScore, score);
    }
    debouncedSavePlayer(userId);
    res.json({
      success: true,
      resources: p.resources,
      goldReward,
      tokenReward,
      highScore: p.blox.highScore,
    });
  });

  // v4.12.3: Get saved board state for cross-device sync
  router.post("/api/blox/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    // v5.0.1: savedState stored as JSON string to avoid Firestore nested-array rejection
    let parsed = null;
    if (typeof p.blox.savedState === "string") {
      try {
        parsed = JSON.parse(p.blox.savedState);
      } catch (_) {}
    } else if (p.blox.savedState && typeof p.blox.savedState === "object") {
      parsed = p.blox.savedState; // Legacy: already an object (pre-stringify migration)
    }
    res.json({
      savedState: parsed,
      highScore: p.blox.highScore,
    });
  });

  // v4.12.3: Sync board state from client to server
  router.post("/api/blox/sync", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { savedState } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId);
    // v5.0.1: Store as JSON string — Firestore rejects nested arrays (board is 2D array)
    p.blox.savedState = savedState ? JSON.stringify(savedState) : null;
    debouncedSavePlayer(userId);
    res.json({ success: true });
  });

  return router;
}
