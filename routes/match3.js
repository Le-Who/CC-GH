/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Match-3 Routes (v5 Offline-First Hybrid)
 *  Game state, start, end, mode sync
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import {
  ECONOMY,
  calcRegen,
  calcGoldReward,
  calcTokenReward,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";
import { getDb } from "../db.js";

export default function match3Routes(requireAuth, resolveUser) {
  const router = Router();

  // v5.0.1: savedModes stored as JSON string to avoid Postgres nested-array/object issues.
  // Parse back to object for API responses, with legacy object fallback.
  function _parseSavedModes(raw) {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    if (typeof raw === "object") return raw; // Legacy: already an object
    return {};
  }

  router.post("/api/game/state", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      res.json({
        game: p.match3.currentGame || null,
        highScore: p.match3.highScore,
        savedModes: _parseSavedModes(p.match3.savedModes),
      });
    }, username);
  });

  // Sync saved mode states with an immediate durable write.
  // The old client debounce could lose data when the app restarted between requests.
  router.post("/api/game/sync-modes", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { savedModes, game } = req.body;
      let changed = false;

      if (savedModes && typeof savedModes === "object") {
        // v5.0.1: Store as JSON string — Postgres safety boundary for nested arrays (board is 2D)
        p.match3.savedModes = JSON.stringify(savedModes);
        changed = true;
      }

      if (game && typeof game === "object") {
        p.match3.currentGame = game;
        changed = true;
      }

      if (changed) { /* save handled implicitly by wrapper function */ }
      res.json({ success: true });
    }, username);
  });

  router.post("/api/game/start", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { mode = "classic", isResume } = req.body;

      // v5.0.2: Resume path — register session without charging energy.
      if (isResume) {
        p.match3.currentGame = { score: 0, movesLeft: 30, combo: 0, mode };
        return res.json({
          success: true,
          resources: p.resources,
          highScore: p.match3.highScore,
        });
      }

      calcRegen(p);

      // Energy check
      if (p.resources.energy.current < ECONOMY.COST_MATCH3) {
        return res.status(400).json({
          error: "NOT_ENOUGH_ENERGY",
          required: ECONOMY.COST_MATCH3,
          current: p.resources.energy.current,
        });
      }
      p.resources.energy.current -= ECONOMY.COST_MATCH3;

      const game = { score: 0, movesLeft: 30, combo: 0, mode };
      p.match3.currentGame = game;
      p.match3.totalGames++;

      res.json({
        success: true,
        resources: p.resources,
        highScore: p.match3.highScore,
      });
    }, username);
  });

  /* ─── Game End (dedicated endpoint for highScore save + gold reward) ─── */
  router.post("/api/game/end", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
      const { score, fromQuit } = req.body;

      // Prevent awarding gold if there was no active session logged
      if (
        !p.match3.currentGame &&
        typeof score === "number" &&
        score > 0 &&
        !fromQuit
      ) {
        console.warn(
          `⚠️ User ${userId} tried to end Match-3 without starting a session.`,
        );
        return res.status(403).json({ error: "Invalid session" });
      }

      let goldReward = 0;
      let tokenReward = 0;

      // Anti-cheat: Validate score plausibility
      if (typeof score === "number" && score > 0) {
        if (score > 30000) {
          console.warn(
            `🚨 Anti-cheat: Match-3 score ${score} by ${userId} rejected — exceeds plausibility ceiling.`,
          );
        } else {
          goldReward = calcGoldReward(score);
          p.resources.gold += goldReward;
          p.match3.highScore = Math.max(p.match3.highScore, score);

          tokenReward = calcTokenReward(score);
          p.resources.gachaTokens = (p.resources.gachaTokens || 0) + tokenReward;
        }
      }

      p.match3.currentGame = null;

      // Compute actual leaderboard rank
      const sql = getDb();
      const [{ count }] = await sql`
        SELECT COUNT(*) as count 
        FROM players 
        WHERE (data->'match3'->>'highScore')::int > ${p.match3.highScore}
      `;
      const rank = parseInt(count) + 1;

      res.json({
        success: true,
        resources: p.resources,
        goldReward,
        tokenReward,
        highScore: p.match3.highScore,
        rank,
      });
    }, username);
  });

  return router;
}
