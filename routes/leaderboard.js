/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Leaderboard Routes
 *  Match-3 and Building Blox leaderboards
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { players } from "../playerManager.js";

export default function leaderboardRoutes() {
  const router = Router();

  router.get("/api/leaderboard", (_req, res) => {
    const entries = [...players.values()];

    const leaders = entries
      .filter((p) => p.match3?.highScore > 0)
      .sort((a, b) => (b.match3?.highScore || 0) - (a.match3?.highScore || 0))
      .slice(0, 15)
      .map((p, i) => ({
        rank: i + 1,
        username: p.username,
        highScore: p.match3.highScore,
        totalGames: p.match3.totalGames || 0,
      }));

    res.json(leaders);
  });

  // v4.9: Building Blox leaderboard
  router.get("/api/blox/leaderboard", (_req, res) => {
    const entries = [...players.values()];

    const leaders = entries
      .filter((p) => p.blox?.highScore > 0)
      .sort((a, b) => (b.blox?.highScore || 0) - (a.blox?.highScore || 0))
      .slice(0, 15)
      .map((p, i) => ({
        rank: i + 1,
        username: p.username,
        highScore: p.blox.highScore,
      }));

    res.json(leaders);
  });

  return router;
}
