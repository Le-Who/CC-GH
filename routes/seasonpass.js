/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Season Pass Routes
 *  XP tracking, tier progression, reward claiming
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { SEASON_PASS } from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";

export default function seasonPassRoutes(requireAuth, resolveUser) {
  const router = Router();

  /* ─── Get Season Pass Progress ─── */
  router.get("/api/season-pass", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
    if (!userId) return res.status(400).json({ error: "userId required" });
    if (!p.seasonPass) {
      p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
    }

    // Calculate current tier based on XP
    let currentTier = 0;
    for (let i = SEASON_PASS.tiers.length - 1; i >= 0; i--) {
      if (p.seasonPass.xp >= SEASON_PASS.tiers[i].xp) {
        currentTier = i;
        break;
      }
    }
    p.seasonPass.tier = currentTier;

    res.json({
      season: SEASON_PASS.season,
      name: SEASON_PASS.name,
      xp: p.seasonPass.xp,
      currentTier,
      tiers: SEASON_PASS.tiers.map((t, i) => ({
        ...t,
        unlocked: p.seasonPass.xp >= t.xp,
        claimed: p.seasonPass.claimed.includes(i),
      })),
    });
      });
  });

  /* ─── Claim Tier Reward ─── */
  router.post("/api/season-pass/claim", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    await withPlayerLock(userId, async (p) => {
    const { tierIndex } = req.body;
    if (!p.seasonPass) {
      p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
    }

    if (
      typeof tierIndex !== "number" ||
      tierIndex < 0 ||
      tierIndex >= SEASON_PASS.tiers.length
    ) {
      return res.status(400).json({ error: "invalid tier index" });
    }
    const tier = SEASON_PASS.tiers[tierIndex];
    if (p.seasonPass.xp < tier.xp) {
      return res.status(400).json({ error: "tier not unlocked yet" });
    }
    if (p.seasonPass.claimed.includes(tierIndex)) {
      return res.status(400).json({ error: "already claimed" });
    }

    // Grant reward
    const reward = tier.reward;
    if (reward.gold) p.resources.gold += reward.gold;
    if (reward.gachaTokens) {
      p.resources.gachaTokens =
        (p.resources.gachaTokens || 0) + reward.gachaTokens;
    }
    if (reward.seeds) {
      for (const [seedId, qty] of Object.entries(reward.seeds)) {
        p.farm.inventory[seedId] = (p.farm.inventory[seedId] || 0) + qty;
      }
    }
    if (reward.theme) {
      if (!p.cosmetics)
        p.cosmetics = { activePlotTheme: "default", ownedThemes: ["default"] };
      if (!p.cosmetics.ownedThemes.includes(reward.theme)) {
        p.cosmetics.ownedThemes.push(reward.theme);
      }
    }

    p.seasonPass.claimed.push(tierIndex);

    res.json({
      success: true,
      reward,
      resources: p.resources,
      seasonPass: p.seasonPass,
    });
      });
  });

  return router;
}
