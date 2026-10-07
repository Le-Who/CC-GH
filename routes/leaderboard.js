import { Router } from 'express';
import { getDb } from '../db.js';
import { withPlayerLock } from '../playerManager.js';
import { publicDisplayName, publicLeaderboardEntry, validateNickname } from '../game-logic/public-profile.js';

export default function leaderboardRoutes(requireAuth, resolveUser, dependencies = {}) {
  const router = Router();
  const database = dependencies.getDb || getDb;
  const lockPlayer = dependencies.withPlayerLock || withPlayerLock;
  // Cache scores/identity internally, never names or viewer-specific responses.
  const scoreCache = new Map();
  const CACHE_TTL_MS = 30_000;
  const language = req => req.query.lang === 'ru' ? 'ru' : 'en';
  function privateResponse(_req, res, next) {
    res.set('Cache-Control', 'private, no-store');
    res.set('Surrogate-Control', 'no-store');
    res.vary('Authorization');
    next();
  }
  function optionalAuth(req, res, next) {
    if (req.headers.authorization) return requireAuth(req, res, next);
    next();
  }

  async function leaders(game, viewerId, lang) {
    const sql = database();
    if (!sql) return [];
    let cached = scoreCache.get(game);
    if (!cached || Date.now() - cached.time >= CACHE_TTL_MS) {
      const rows = await sql`
        SELECT id,
          COALESCE((data->${game}->>'highScore')::int, 0) AS high_score,
          COALESCE((data->${game}->>'totalGames')::int, 0) AS total_games
        FROM players
        WHERE (data->${game}->>'highScore')::int > 0
        ORDER BY high_score DESC
        LIMIT 15
      `;
      cached = { time: Date.now(), rows: rows.map(row => ({ id: row.id, high_score: row.high_score, total_games: row.total_games })) };
      scoreCache.set(game, cached);
    }
    if (!cached.rows.length) return [];
    // Only 15 primary-key lookups. Refresh names across instances immediately
    // after a nickname change/reset, even while score ordering stays cached.
    const profiles = await sql`
      SELECT p.id, p.data->'publicProfile'->>'nickname' AS nickname,
        a.profile->>'firstName' AS first_name
      FROM players p LEFT JOIN accounts a ON a.id = p.id
      WHERE p.id IN ${sql(cached.rows.map(row => row.id))}
    `;
    const byId = new Map(profiles.map(row => [row.id, row]));
    return cached.rows.map((score, index) => {
      const profile = byId.get(score.id);
      return publicLeaderboardEntry({ ...score, nickname: profile?.nickname, firstName: profile?.first_name }, index + 1, viewerId, lang, game);
    });
  }

  for (const [path, game] of [['/api/leaderboard', 'match3'], ['/api/blox/leaderboard', 'blox']]) {
    router.get(path, privateResponse, optionalAuth, async (req, res) => {
      try {
        const viewerId = req.authenticatedUser ? resolveUser(req).userId : null;
        res.json(await leaders(game, viewerId, language(req)));
      } catch (error) {
        console.error(`Leaderboard ${game} fetch failed`, error?.message);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
    });
  }

  function firstName(req) {
    const user = req.authenticatedUser?.telegramUser;
    return user?.firstName || user?.first_name || null;
  }
  function profileView(nickname, req) {
    return { nickname: nickname || '', displayName: publicDisplayName({ nickname, firstName: firstName(req) }, language(req)) };
  }
  router.get('/api/profile/nickname', privateResponse, requireAuth, async (req, res) => {
    try {
      const { userId } = resolveUser(req);
      const sql = database();
      if (sql) {
        const [row] = await sql`SELECT data->'publicProfile'->>'nickname' AS nickname FROM players WHERE id = ${userId}`;
        return res.json(profileView(row?.nickname, req));
      }
      const result = await lockPlayer(userId, player => profileView(player.publicProfile?.nickname, req));
      res.json(result);
    } catch {
      res.status(500).json({ error: 'PROFILE_READ_FAILED' });
    }
  });
  router.post('/api/profile/nickname', privateResponse, requireAuth, async (req, res) => {
    const validated = validateNickname(req.body?.nickname);
    if (validated.error) return res.status(400).json({ error: validated.error });
    try {
      const { userId } = resolveUser(req);
      // Ownership comes only from authenticated identity, never a body/query ID.
      // Assignment is idempotent and does not modify scores or game state.
      const result = await lockPlayer(userId, player => {
        player.publicProfile = { nickname: validated.nickname };
        return profileView(validated.nickname, req);
      });
      res.json(result);
    } catch {
      res.status(500).json({ error: 'PROFILE_SAVE_FAILED' });
    }
  });
  return router;
}
