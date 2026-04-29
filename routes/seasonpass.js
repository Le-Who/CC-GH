/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Season Pass Routes
 *  XP tracking, tier progression, reward claiming
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import { SEASON_PASS } from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";
import { routeFail, routeOk, sendRouteResult } from "./mutationResults.js";

function ensureSeasonPass(p) {
  if (!p.seasonPass) {
    p.seasonPass = { season: 1, xp: 0, tier: 0, claimed: [] };
  }
  if (!Array.isArray(p.seasonPass.claimed)) p.seasonPass.claimed = [];
}

function currentSeasonTier(p) {
  let currentTier = 0;
  for (let i = SEASON_PASS.tiers.length - 1; i >= 0; i -= 1) {
    if (p.seasonPass.xp >= SEASON_PASS.tiers[i].xp) {
      currentTier = i;
      break;
    }
  }
  p.seasonPass.tier = currentTier;
  return currentTier;
}

export default function seasonPassRoutes(requireAuth, resolveUser) {
  const router = Router();

  router.get("/api/season-pass", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });

    const result = await withPlayerLock(userId, async (p) => {
      ensureSeasonPass(p);
      const currentTier = currentSeasonTier(p);
      return routeOk({
        season: SEASON_PASS.season,
        name: SEASON_PASS.name,
        xp: p.seasonPass.xp,
        currentTier,
        tiers: SEASON_PASS.tiers.map((tier, index) => ({
          ...tier,
          unlocked: p.seasonPass.xp >= tier.xp,
          claimed: p.seasonPass.claimed.includes(index),
        })),
      });
    });
    return sendRouteResult(res, result);
  });

  router.post("/api/season-pass/claim", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });

    const result = await withPlayerLock(userId, async (p) => {
      const { tierIndex } = req.body;
      ensureSeasonPass(p);

      if (
        typeof tierIndex !== "number" ||
        tierIndex < 0 ||
        tierIndex >= SEASON_PASS.tiers.length
      ) {
        return routeFail(400, { error: "invalid tier index" });
      }
      const tier = SEASON_PASS.tiers[tierIndex];
      if (p.seasonPass.xp < tier.xp) {
        return routeFail(400, { error: "tier not unlocked yet" });
      }
      if (p.seasonPass.claimed.includes(tierIndex)) {
        return routeFail(400, { error: "already claimed" });
      }

      const reward = tier.reward;
      if (reward.gold) p.resources.gold += reward.gold;
      if (reward.gachaTokens) {
        p.resources.gachaTokens = (p.resources.gachaTokens || 0) + reward.gachaTokens;
      }
      if (reward.seeds) {
        for (const [seedId, qty] of Object.entries(reward.seeds)) {
          p.farm.inventory[seedId] = (p.farm.inventory[seedId] || 0) + qty;
        }
      }
      if (reward.theme) {
        if (!p.cosmetics) p.cosmetics = { activePlotTheme: "default", ownedThemes: ["default"] };
        if (!p.cosmetics.ownedThemes.includes(reward.theme)) {
          p.cosmetics.ownedThemes.push(reward.theme);
        }
      }

      p.seasonPass.claimed.push(tierIndex);
      return routeOk({
        success: true,
        reward,
        resources: p.resources,
        seasonPass: p.seasonPass,
      });
    });
    return sendRouteResult(res, result);
  });

  return router;
}
