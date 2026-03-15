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
        (data->'match3'->>'highScore')::int as high_score,
        (data->'match3'->>'totalGames')::int as total_games
      FROM players
      WHERE data->'match3'->>'highScore' IS NOT NULL
      ORDER BY (data->'match3'->>'highScore')::int DESC
      LIMIT 15
    `;

    _match3Cache = rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      highScore: r.high_score,
      totalGames: r.total_games || 0,
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
        (data->'blox'->>'highScore')::int as high_score
      FROM players
      WHERE data->'blox'->>'highScore' IS NOT NULL
      ORDER BY (data->'blox'->>'highScore')::int DESC
      LIMIT 15
    `;

    _bloxCache = rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      highScore: r.high_score,
    }));
    _bloxCacheTime = now;
    return _bloxCache;
  }

  router.get("/api/leaderboard", async (_req, res) => {
    res.json(await getMatch3Leaders());
  });

  router.get("/api/blox/leaderboard", async (_req, res) => {
    res.json(await getBloxLeaders());
  });

  return router;
}
