/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Leaderboard Routes (Cached)
 *  Match-3 and Building Blox leaderboards
 *  v7.3.5: 30s TTL cache to avoid O(N) sort on every request
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { getDb } from "../db.js";

export default function leaderboardRoutes() {
  const router = Router();

  // Cached leaderboard with 30s TTL — avoids hammering Postgres
  const CACHE_TTL_MS = 30_000;
  let _match3Cache = null;
  let _match3CacheTime = 0;
  let _bloxCache = null;
  let _bloxCacheTime = 0;

  async function getMatch3Leaders() {
    const now = Date.now();
    if (_match3Cache && now - _match3CacheTime < CACHE_TTL_MS)
      return _match3Cache;
      
    const sql = getDb();
    if (!sql) return [];

    const rows = await sql`
      SELECT 
        data->>'username' as username,
        COALESCE((data->'match3'->>'highScore')::int, 0) as high_score,
        COALESCE((data->'match3'->>'totalGames')::int, 0) as total_games
      FROM players
      WHERE (data->'match3'->>'highScore')::int > 0
      ORDER BY high_score DESC
      LIMIT 15
    `;

    _match3Cache = rows.map((r, i) => ({
      rank: i + 1,
      username: r.username || "Player",
      highScore: r.high_score,
      totalGames: r.total_games,
    }));
    _match3CacheTime = now;
    return _match3Cache;
  }

  async function getBloxLeaders() {
    const now = Date.now();
    if (_bloxCache && now - _bloxCacheTime < CACHE_TTL_MS) return _bloxCache;
    
    const sql = getDb();
    if (!sql) return [];

    const rows = await sql`
      SELECT 
        data->>'username' as username,
        COALESCE((data->'blox'->>'highScore')::int, 0) as high_score
      FROM players
      WHERE (data->'blox'->>'highScore')::int > 0
      ORDER BY high_score DESC
      LIMIT 15
    `;

    _bloxCache = rows.map((r, i) => ({
      rank: i + 1,
      username: r.username || "Player",
      highScore: r.high_score,
    }));
    _bloxCacheTime = now;
    return _bloxCache;
  }

  router.get("/api/leaderboard", async (req, res) => {
    try {
      const leaders = await getMatch3Leaders();
      res.json(leaders);
    } catch (err) {
      console.error("Leaderboard Match-3 fetch error:", err);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  router.get("/api/blox/leaderboard", async (req, res) => {
    try {
      const leaders = await getBloxLeaders();
      res.json(leaders);
    } catch (err) {
      console.error("Leaderboard Blox fetch error:", err);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  return router;
}
