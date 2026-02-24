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
  updateWeeklyStat,
} from "../game-logic.js";
import { getPlayer, players, debouncedSavePlayer } from "../playerManager.js";

export default function match3Routes(requireAuth, resolveUser) {
  const router = Router();

  // v5.0.1: savedModes stored as JSON string to avoid Firestore nested-array rejection.
  // Parse back to object for API responses, with legacy object fallback.
  function _parseSavedModes(raw) {
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return {};
      }
    }
    if (typeof raw === "object") return raw; // Legacy: already an object
    return {};
  }

  router.post("/api/game/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    if (p.match3.currentGame) {
      res.json({
        game: p.match3.currentGame,
        highScore: p.match3.highScore,
        savedModes: _parseSavedModes(p.match3.savedModes),
      });
    } else {
      res.json({
        game: null,
        highScore: p.match3.highScore,
        savedModes: _parseSavedModes(p.match3.savedModes),
      });
    }
  });

  // v4.15.1: Sync saved mode states — immediate Firestore write (critical state).
  // The 2s debounce caused data loss when users closed tabs quickly or
  // Cloud Run cold-started between requests.
  router.post("/api/game/sync-modes", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    const { savedModes, game } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId);
    let changed = false;

    if (savedModes && typeof savedModes === "object") {
      // v5.0.1: Store as JSON string — Firestore rejects nested arrays (board is 2D)
      p.match3.savedModes = JSON.stringify(savedModes);
      changed = true;
    }

    if (game && typeof game === "object") {
      p.match3.currentGame = game;
      changed = true;
    }

    if (changed) {
      // Immediate save — bypass debounce for critical session state
      debouncedSavePlayer(userId);
    }
    res.json({ success: true });
  });

  router.post("/api/game/start", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);

    const { mode = "classic", isResume } = req.body;

    // v5.0.2: Resume path — register session without charging energy.
    // The client already has a saved game; it just needs the server to
    // acknowledge an active session so /api/game/end won't 403.
    if (isResume) {
      p.match3.currentGame = { score: 0, movesLeft: 30, combo: 0, mode };
      debouncedSavePlayer(userId);
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

    // v5: We don't generate the board on the server anymore. The client does it.
    // We just register an active session to prevent double-spending energy.
    const game = {
      score: 0,
      movesLeft: 30, // Default constraint
      combo: 0,
      mode,
    };
    p.match3.currentGame = game;
    p.match3.totalGames++;
    debouncedSavePlayer(userId);

    res.json({
      success: true,
      resources: p.resources,
      highScore: p.match3.highScore,
    });
  });

  /* ─── Game End (dedicated endpoint for highScore save + gold reward) ─── */
  router.post("/api/game/end", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { score, movesLeft, fromQuit } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const p = getPlayer(userId);

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

    // Anti-cheat / Basic validation (approx. 5000 is a very good score for 30 moves)
    if (typeof score === "number" && score > 0) {
      if (score > 30000) {
        console.warn(
          `🚨 Anti-cheat trigger: Match-3 score ${score} by ${userId} is suspiciously high.`,
        );
      } else {
        goldReward = calcGoldReward(score);
        p.resources.gold += goldReward;
        p.match3.highScore = Math.max(p.match3.highScore, score);

        // Gacha token reward: 1 base + bonus for high performance
        tokenReward = ECONOMY.REWARD_GACHA_TOKENS;
        for (const threshold of ECONOMY.TOKEN_BONUS_THRESHOLDS) {
          if (score >= threshold) tokenReward++;
        }
        p.resources.gachaTokens = (p.resources.gachaTokens || 0) + tokenReward;
      }
    }

    p.match3.currentGame = null;

    // v7.3: Weekly challenge stat tracking
    updateWeeklyStat(p, "weeklyMatch3", 1);

    debouncedSavePlayer(userId);

    // Compute rank
    const allScores = [...players.values()]
      .filter((pl) => pl.match3.highScore > 0)
      .sort((a, b) => b.match3.highScore - a.match3.highScore);
    const rank = allScores.findIndex((pl) => pl.userId === userId) + 1;

    res.json({
      success: true,
      resources: p.resources,
      goldReward,
      tokenReward,
      highScore: p.match3.highScore,
      rank: rank || allScores.length + 1,
    });
  });

  return router;
}
