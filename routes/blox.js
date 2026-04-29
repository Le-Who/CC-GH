/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Building Blox Routes
 *  Start game, end game (gold reward)
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import {
  calcRegen,
  calcBloxReward,
  calcTokenReward,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";
import { routeFail, routeOk, sendRouteResult } from "./mutationResults.js";

export default function bloxRoutes(requireAuth, resolveUser) {
  const router = Router();

  router.post("/api/blox/start", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      calcRegen(p);
      p.blox.totalGames++;
      p.blox.activeGame = true;
      return routeOk({
        success: true,
        resources: p.resources,
        highScore: p.blox.highScore,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  router.post("/api/blox/end", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { score } = req.body;

      // Session validation: prevent gold farming without starting a game
      if (!p.blox.activeGame) {
        return routeFail(403, { error: "No active Blox session" });
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
      return routeOk({
        success: true,
        resources: p.resources,
        goldReward,
        tokenReward,
        highScore: p.blox.highScore,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  // v4.12.3: Get saved board state for cross-device sync
  router.post("/api/blox/state", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
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
      return routeOk({
        savedState: parsed,
        highScore: p.blox.highScore,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  // v4.12.3: Sync board state from client to server
  router.post("/api/blox/sync", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { savedState } = req.body;
      // v5.0.1: Store as JSON string — Postgres boundary for nested arrays (board is 2D array)
      p.blox.savedState = savedState ? JSON.stringify(savedState) : null;
      return routeOk({ success: true });
    }, username);
    return sendRouteResult(res, result);
  });

  return router;
}
