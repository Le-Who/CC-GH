/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Leaderboard Routes
 *  Match-3 and Building Blox leaderboards with scope filtering
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { players } from "../playerManager.js";

export default function leaderboardRoutes() {
  const router = Router();

  router.get("/api/leaderboard", (req, res) => {
    const { scope, roomId } = req.query;
    let entries = [...players.values()];

    // In a real Discord Activity, roomId would filter by voice channel participants.
    // For the demo, we simulate "room" by grouping players who share a roomId prefix.
    if (scope === "room" && roomId) {
      entries = entries.filter(
        (p) => p.id.startsWith(roomId) || entries.length <= 5,
      );
    }

    const leaders = entries
      .filter((p) => p.match3.highScore > 0)
      .sort((a, b) => b.match3.highScore - a.match3.highScore)
      .slice(0, 15)
      .map((p, i) => ({
        rank: i + 1,
        username: p.username,
        highScore: p.match3.highScore,
        totalGames: p.match3.totalGames,
      }));

    res.json(leaders);
  });

  // v4.9: Building Blox leaderboard
  router.get("/api/blox/leaderboard", (req, res) => {
    const { scope, roomId } = req.query;
    let entries = [...players.values()];

    if (scope === "room" && roomId) {
      entries = entries.filter(
        (p) => p.id.startsWith(roomId) || entries.length <= 5,
      );
    }

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
