/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Achievement Routes
 *  Badge checking, claiming, and listing
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { ACHIEVEMENTS, checkAchievements } from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

export default function achievementRoutes(requireAuth, resolveUser) {
  const router = Router();

  /* ─── Get All Achievements ─── */
  router.get("/api/achievements", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });

    await withPlayerLock(userId, async (p) => {
      // Check for newly unlocked badges
      const newlyUnlocked = checkAchievements(p);

      // Build response with all badges + player status
      const badges = {};
      for (const [id, badge] of Object.entries(ACHIEVEMENTS)) {
        badges[id] = {
          id: badge.id,
          name: badge.name,
          emoji: badge.emoji,
          desc: badge.desc,
          reward: badge.reward,
          unlocked: !!p.achievements[id],
          unlockedAt: p.achievements[id]?.unlockedAt || null,
          seen: p.achievements[id]?.seen || false,
        };
      }

      res.json({
        badges,
        newlyUnlocked,
        totalUnlocked: Object.keys(p.achievements).length,
        totalBadges: Object.keys(ACHIEVEMENTS).length,
      });
    });
  });

  /* ─── Claim Achievement Reward ─── */
  router.post("/api/achievements/claim", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
    const { badgeId } = req.body;

    if (!badgeId || !ACHIEVEMENTS[badgeId]) {
      return res.status(400).json({ error: "invalid badge ID" });
    }
    if (!p.achievements[badgeId]) {
      return res.status(400).json({ error: "badge not unlocked" });
    }
    if (p.achievements[badgeId].seen) {
      return res.status(400).json({ error: "already claimed" });
    }

    // Grant reward
    const reward = ACHIEVEMENTS[badgeId].reward;
    if (reward.gold) p.resources.gold += reward.gold;
    if (reward.gachaTokens)
      p.resources.gachaTokens =
        (p.resources.gachaTokens || 0) + reward.gachaTokens;

    // Mark as claimed
    p.achievements[badgeId].seen = true;
    res.json({
      success: true,
      reward,
      resources: p.resources,
    });
      });
  });

  return router;
}
