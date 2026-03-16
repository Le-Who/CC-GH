/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Building Blox Routes
 *  Start game (energy gate), end game (gold reward)
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import {
  ECONOMY,
  calcRegen,
  calcBloxReward,
  calcTokenReward,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

export default function bloxRoutes(requireAuth, resolveUser) {
  const router = Router();

  router.post("/api/blox/start", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
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
      p.blox.activeGame = true;
      res.json({
        success: true,
        resources: p.resources,
        highScore: p.blox.highScore,
      });
    }, username);
  });

  router.post("/api/blox/end", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { score } = req.body;

      // Session validation: prevent gold farming without starting a game
      if (!p.blox.activeGame) {
        return res.status(403).json({ error: "No active Blox session" });
      }

      let goldReward = 0;
      let tokenReward = 0;

      if (typeof score === "number" && score > 0) {
        // Anti-cheat: cap suspiciously high scores
        if (score > 10000) {
          console.warn(
            `🚨 Anti-cheat trigger: Blox score ${score} by ${userId} is suspiciously high.`,
          );
        } else {
          goldReward = calcBloxReward(score);
          p.resources.gold += goldReward;

          tokenReward = calcTokenReward(score);
          p.resources.gachaTokens = (p.resources.gachaTokens || 0) + tokenReward;
          p.blox.highScore = Math.max(p.blox.highScore, score);
        }
      }

      p.blox.activeGame = false;
      res.json({
        success: true,
        resources: p.resources,
        goldReward,
        tokenReward,
        highScore: p.blox.highScore,
      });
    }, username);
  });

  // v4.12.3: Get saved board state for cross-device sync
  router.post("/api/blox/state", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      // v5.0.1: savedState stored as JSON string to avoid Postgres structural issues
      let parsed = null;
      if (typeof p.blox.savedState === "string") {
        try {
          parsed = JSON.parse(p.blox.savedState);
        } catch {
          // legacy ignore
        }
      } else if (p.blox.savedState && typeof p.blox.savedState === "object") {
        parsed = p.blox.savedState; // Legacy: already an object (pre-stringify migration)
      }
      res.json({
        savedState: parsed,
        highScore: p.blox.highScore,
      });
    }, username);
  });

  // v4.12.3: Sync board state from client to server
  router.post("/api/blox/sync", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { savedState } = req.body;
      // v5.0.1: Store as JSON string — Postgres boundary for nested arrays (board is 2D array)
      p.blox.savedState = savedState ? JSON.stringify(savedState) : null;
      res.json({ success: true });
    }, username);
  });

  return router;
}
