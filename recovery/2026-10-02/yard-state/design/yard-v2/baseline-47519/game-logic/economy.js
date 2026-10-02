/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Economy Configuration & Reward Calculators
 *  Core constants and progressive reward curves.
 * ═══════════════════════════════════════════════════
 */

import { getRewardChestProgress } from "./hud-bonuses.js";

export const ECONOMY = {
  ENERGY_MAX: 20,
  ENERGY_START: 20,
  ENERGY_REGEN_INTERVAL_MS: 150 * 1000, // 2.5 minutes
  GOLD_START: 100,
  COST_MATCH3: 5,
  COST_BUBBO: 4,
  COST_TRIVIA: 3,
  REWARD_MATCH3_WIN: 40,
  REWARD_MATCH3_LOSE: 5,
  REWARD_BUBBO_WIN: 34,
  REWARD_BUBBO_LOSE: 5,
  REWARD_TRIVIA_WIN: 25,
  REWARD_TRIVIA_LOSE: 5,
  FEED_PET_XP: 10,
  COST_BLOX: 4,
  REWARD_BLOX_WIN: 35,
  REWARD_BLOX_LOSE: 5,
  REWARD_GACHA_TOKENS: 1,
  GACHA_PULL_COST: 10,
  GENERATOR_TAP_LIMIT: 40,
  GENERATOR_COOLDOWN_MS: 4 * 3600 * 1000, // 4 hours
  DAILY_FREE_PULL: 1,
  TOKEN_FARM_DROP_CHANCE: 0.02,
  // Performance-based bonus tokens: score thresholds → extra tokens
  TOKEN_BONUS_THRESHOLDS: [1000, 2000, 3500],
  SATIETY_MAX: 100,
  SATIETY_DECAY_PER_HOUR: 10,
  SATIETY_OFFLINE_CAP_MS: 24 * 60 * 60 * 1000, // 24h max offline calc
};

/**
 * Progressive gold reward for Match-3 based on score.
 * - score < 0 or 0: REWARD_MATCH3_LOSE
 * - 1..999: proportional (score / 1000) × base
 * - 1000..1999: base + 5% per 100 points
 * - 2000..2999: + 10% per 100 points
 * - 3000..3999: + 20% per 100 points
 * - 4000+: rate doubles each 1000 (capped at 200%)
 */
export function calcGoldReward(score) {
  const BASE = ECONOMY.REWARD_MATCH3_WIN;
  if (typeof score !== "number" || score <= 0)
    return ECONOMY.REWARD_MATCH3_LOSE;
  if (score < 1000)
    return Math.max(
      ECONOMY.REWARD_MATCH3_LOSE,
      Math.floor(BASE * (score / 1000)),
    ) + getRewardChestProgress(score).bonus;

  let gold = BASE; // 1000 points = full base reward
  const tiers = [
    { min: 1000, max: 1999, ratePer100: 0.05 },
    { min: 2000, max: 2999, ratePer100: 0.1 },
    { min: 3000, max: 3999, ratePer100: 0.2 },
  ];

  for (const tier of tiers) {
    if (score < tier.min) break;
    const inTier = Math.min(score, tier.max + 1) - tier.min;
    const steps = Math.floor(inTier / 100);
    gold += Math.floor(steps * tier.ratePer100 * BASE);
  }

  // Beyond 4000: continue doubling, cap at 200% per 100 pts
  // Safety cap prevents DoS from crafted extreme scores
  if (score >= 4000) {
    let tierStart = 4000;
    let rate = 0.4;
    const SCORE_CAP = 50_000;
    while (tierStart <= score && tierStart <= SCORE_CAP) {
      const tierEnd = tierStart + 999;
      const inTier = Math.min(score, tierEnd + 1) - tierStart;
      const steps = Math.floor(inTier / 100);
      gold += Math.floor(steps * rate * BASE);
      tierStart += 1000;
      rate = Math.min(rate * 2, 2.0);
    }
  }
  return gold + getRewardChestProgress(score).bonus;
}

/**
 * Progressive gold reward for Building Blox based on lines cleared.
 * Similar curve to calcGoldReward but tuned for block puzzle pace.
 */
export function calcBloxReward(score) {
  const BASE = ECONOMY.REWARD_BLOX_WIN;
  if (typeof score !== "number" || score <= 0) return ECONOMY.REWARD_BLOX_LOSE;
  if (score < 100)
    return Math.max(ECONOMY.REWARD_BLOX_LOSE, Math.floor(BASE * (score / 100)));
  let gold = BASE;
  if (score >= 100)
    gold += Math.floor(((Math.min(score, 300) - 100) / 50) * 0.08 * BASE);
  if (score >= 300)
    gold += Math.floor(((Math.min(score, 600) - 300) / 50) * 0.15 * BASE);
  if (score >= 600) gold += Math.floor(((score - 600) / 50) * 0.25 * BASE);
  return Math.min(gold + getRewardChestProgress(score).bonus, 400);
}

export function calcBubboReward(score) {
  const BASE = ECONOMY.REWARD_BUBBO_WIN;
  if (typeof score !== "number" || score <= 0) return ECONOMY.REWARD_BUBBO_LOSE;
  if (score < 300) {
    return Math.max(ECONOMY.REWARD_BUBBO_LOSE, Math.floor(BASE * (score / 300)));
  }
  let gold = BASE;
  if (score >= 300) gold += Math.floor(((Math.min(score, 900) - 300) / 100) * 0.09 * BASE);
  if (score >= 900) gold += Math.floor(((Math.min(score, 1800) - 900) / 100) * 0.16 * BASE);
  if (score >= 1800) gold += Math.floor(((score - 1800) / 100) * 0.28 * BASE);
  return Math.min(gold + getRewardChestProgress(score).bonus, 400);
}

/**
 * Calculate gacha token reward based on score and thresholds.
 * 1 base token + 1 per threshold exceeded.
 */
export function calcTokenReward(score) {
  let tokens = ECONOMY.REWARD_GACHA_TOKENS;
  for (const threshold of ECONOMY.TOKEN_BONUS_THRESHOLDS) {
    if (score >= threshold) tokens++;
  }
  return tokens;
}
