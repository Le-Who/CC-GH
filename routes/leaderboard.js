/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Leaderboard Routes (Cached)
 *  Match-3 and Building Blox leaderboards
 *  v7.3.5: 30s TTL cache to avoid O(N) sort on every request
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { players } from "../playerManager.js";

export default function leaderboardRoutes() {
  const router = Router();

  // Cached leaderboard with 30s TTL — avoids O(N) sort on every request
  const CACHE_TTL_MS = 30_000;
  let _match3Cache = null;
  let _match3CacheTime = 0;
  let _bloxCache = null;
  let _bloxCacheTime = 0;

  function getMatch3Leaders() {
    const now = Date.now();
    if (_match3Cache && now - _match3CacheTime < CACHE_TTL_MS)
      return _match3Cache;
    _match3Cache = [...players.values()]
      .filter((p) => p.match3?.highScore > 0)
      .sort((a, b) => (b.match3?.highScore || 0) - (a.match3?.highScore || 0))
      .slice(0, 15)
      .map((p, i) => ({
        rank: i + 1,
        username: p.username,
        highScore: p.match3.highScore,
        totalGames: p.match3.totalGames || 0,
      }));
    _match3CacheTime = now;
    return _match3Cache;
  }

  function getBloxLeaders() {
    const now = Date.now();
    if (_bloxCache && now - _bloxCacheTime < CACHE_TTL_MS) return _bloxCache;
    _bloxCache = [...players.values()]
      .filter((p) => p.blox?.highScore > 0)
      .sort((a, b) => (b.blox?.highScore || 0) - (a.blox?.highScore || 0))
      .slice(0, 15)
      .map((p, i) => ({
        rank: i + 1,
        username: p.username,
        highScore: p.blox.highScore,
      }));
    _bloxCacheTime = now;
    return _bloxCache;
  }

  router.get("/api/leaderboard", (_req, res) => {
    res.json(getMatch3Leaders());
  });

  router.get("/api/blox/leaderboard", (_req, res) => {
    res.json(getBloxLeaders());
  });

  return router;
}
