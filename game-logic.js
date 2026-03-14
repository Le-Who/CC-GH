/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Core Game Logic (Extracted for Testability)
 *  Pure functions with no side-effects or I/O dependencies
 * ═══════════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════
 *  ECONOMY CONFIG
 * ═══════════════════════════════════════════════════ */
export const ECONOMY = {
  ENERGY_MAX: 20,
  ENERGY_START: 20,
  ENERGY_REGEN_INTERVAL_MS: 150 * 1000, // 2.5 minutes
  GOLD_START: 100,
  COST_MATCH3: 5,
  COST_TRIVIA: 3,
  REWARD_MATCH3_WIN: 40,
  REWARD_MATCH3_LOSE: 5,
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
    );

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
  return gold;
}

/* ═══════════════════════════════════════════════════
 *  DEV-MODE TIME SCALER
 *  Divides all timers by 1000x when window.__DEV_MODE__ is set.
 *  Usage (browser console): window.__DEV_MODE__ = true;
 * ═══════════════════════════════════════════════════ */
export function getScaledTime(ms) {
  const scale =
    typeof globalThis !== "undefined" && globalThis.__DEV_MODE__ ? 1000 : 1;
  return Math.max(1, Math.floor(ms / scale));
}

/** Dev cheat: instantly mature all planted crops */
export function forceGrowAll(plots, now = Date.now()) {
  if (!plots) return;
  for (const plot of plots) {
    if (plot.crop && plot.plantedAt) {
      plot.plantedAt = now - 999_999_999; // Guarantee 100% growth
    }
  }
}

/* ═══════════════════════════════════════════════════
 *  CROP DEFINITIONS (Economy Rebalance v6.0)
 *  growthTime = idle-progression timers (minutes → hours)
 *  energyYield = energy restored when fed to pet
 *  fullnessYield = satiety added to pet when fed
 * ═══════════════════════════════════════════════════ */
export const CROPS = {
  strawberry: {
    id: "strawberry",
    name: "Strawberry",
    emoji: "🍓",
    growthTime: 60_000, // 60 sec (v7.3: rebalanced from 5s — was 120 gold/min exploit)
    sellPrice: 15,
    seedPrice: 5,
    xp: 5,
    energyYield: 1,
    fullnessYield: 5,
    unlockCondition: null, // always available
    lore: "A tiny, sweet berry that grows faster than you can blink. The gateway crop for every aspiring farmer.",
  },
  blueberry: {
    id: "blueberry",
    name: "Blueberry",
    emoji: "🫐",
    growthTime: 420_000, // 7 min
    sellPrice: 20,
    seedPrice: 8,
    xp: 8,
    energyYield: 2,
    fullnessYield: 8,
    unlockCondition: null, // always available
    lore: "Plump and antioxidant-rich, blueberries thrive in slightly acidic soil. A reliable earner for patient farmers.",
  },
  tomato: {
    id: "tomato",
    name: "Tomato",
    emoji: "🍅",
    growthTime: 900_000, // 15 min
    sellPrice: 30,
    seedPrice: 10,
    xp: 10,
    energyYield: 3,
    fullnessYield: 12,
    unlockCondition: {
      type: "totalHarvests",
      value: 1,
      label: "Harvest your first crop",
    },
    lore: "The classic red tomato — versatile, nutritious, and surprisingly profitable. Every farm needs a few.",
  },
  golden: {
    id: "golden",
    name: "Golden Rose",
    emoji: "🌹",
    growthTime: 1_800_000, // 30 min
    sellPrice: 150,
    seedPrice: 60,
    xp: 50,
    energyYield: 4,
    fullnessYield: 15,
    unlockCondition: {
      type: "questsCompleted",
      value: 1,
      label: "Complete your first quest",
    },
    lore: "Legends say this rose blooms only for those who've proven their green thumb. Its petals shimmer with actual gold dust.",
  },
  corn: {
    id: "corn",
    name: "Corn",
    emoji: "🌽",
    growthTime: 2_700_000, // 45 min (v7.3: smoothed from 1h for mid-game comfort)
    sellPrice: 50,
    seedPrice: 20,
    xp: 15,
    energyYield: 6,
    fullnessYield: 20,
    unlockCondition: {
      type: "goldEarned",
      value: 100,
      label: "Earn 100🪙 total",
    },
    lore: "Standing tall in autumn fields, corn is the backbone of mid-tier farming. Patience pays off in golden kernels.",
  },
  sunflower: {
    id: "sunflower",
    name: "Sunflower",
    emoji: "🌻",
    growthTime: 7_200_000, // 2 hr
    sellPrice: 80,
    seedPrice: 35,
    xp: 25,
    energyYield: 10,
    fullnessYield: 30,
    unlockCondition: {
      type: "plotsBought",
      value: 3,
      label: "Buy your 3rd farm plot",
    },
    lore: "Sunflowers track the sun across the sky. Their massive heads are worth a fortune — if you can wait long enough.",
  },
  watermelon: {
    id: "watermelon",
    name: "Watermelon",
    emoji: "🍉",
    growthTime: 14_400_000, // 4 hr
    sellPrice: 120,
    seedPrice: 45,
    xp: 35,
    energyYield: 12,
    fullnessYield: 35,
    unlockCondition: {
      type: "totalHarvests",
      value: 50,
      label: "Harvest 50 crops total",
    },
    lore: "A colossal fruit that takes half a day to ripen. Cracking one open reveals the sweetest prize in farming.",
  },
  pumpkin: {
    id: "pumpkin",
    name: "Pumpkin",
    emoji: "🎃",
    growthTime: 28_800_000, // 8 hr
    sellPrice: 250,
    seedPrice: 100,
    xp: 80,
    energyYield: 15,
    fullnessYield: 40,
    unlockCondition: { type: "daysActive", value: 7, label: "Play for 7 days" },
    lore: "The king of all crops. Only the most dedicated farmers can coax a pumpkin to its enormous, glowing maturity.",
  },
};

/**
 * v7.2: Progressive Seed Unlocking
 * Evaluates each crop's unlockCondition against player stats.
 * @param {object} playerStats - { totalHarvests, goldEarned, questsCompleted, plotsBought, daysActive }
 * @returns {string[]} Array of unlocked crop IDs
 */
export function getUnlockedSeeds(playerStats = {}) {
  const unlocked = [];
  for (const [id, cfg] of Object.entries(CROPS)) {
    if (!cfg.unlockCondition) {
      unlocked.push(id);
      continue;
    }
    const { type, value } = cfg.unlockCondition;
    const stat = playerStats[type] || 0;
    if (stat >= value) unlocked.push(id);
  }
  return unlocked;
}

/* ═══════════════════════════════════════════════════
 *  MERGE CHAINS (Gacha Merge v7.0)
 *  2 chains × 8 levels. Level 8 = Legendary.
 *  Generator tap yields items from level 0-1.
 * ═══════════════════════════════════════════════════ */
export const MERGE_CHAINS = {
  textile: {
    id: "textile",
    name: "Textile",
    items: [
      "thread",
      "yarn",
      "fabric",
      "shirt",
      "jacket",
      "sweater",
      "coat",
      "tapestry",
    ],
    names: [
      "Thread",
      "Yarn",
      "Fabric",
      "Shirt",
      "Jacket",
      "Sweater",
      "Coat",
      "Legendary Tapestry",
    ],
    emoji: ["🧵", "🧶", "🪡", "👕", "🧥", "🧤", "🥼", "👑"],
  },
  wood: {
    id: "wood",
    name: "Wood",
    items: [
      "twig",
      "branch",
      "log",
      "plank",
      "chair",
      "table",
      "wardrobe",
      "throne",
    ],
    names: [
      "Twig",
      "Branch",
      "Log",
      "Plank",
      "Chair",
      "Table",
      "Wardrobe",
      "Legendary Throne",
    ],
    emoji: ["🌿", "🪵", "🪓", "🪑", "💺", "🛋️", "🚪", "👑"],
  },
};

/** Crop tier for generator bundle size: cheap=2-3, mid=3-4, expensive=4-5 */
export const CROP_TIERS = {
  strawberry: "cheap",
  blueberry: "cheap",
  tomato: "mid",
  golden: "mid",
  corn: "mid",
  sunflower: "expensive",
  watermelon: "expensive",
  pumpkin: "expensive",
};

export const TIER_YIELD = {
  cheap: { min: 2, max: 3 },
  mid: { min: 3, max: 4 },
  expensive: { min: 4, max: 5 },
};

/** Quest difficulty tiers for order reward scaling */
export const QUEST_TIERS = {
  easy: {
    gold: [50, 100],
    affectionXp: [10, 20],
    gachaTokens: 0,
    energyMaxBoost: 0,
  },
  medium: {
    gold: [100, 250],
    affectionXp: [20, 40],
    gachaTokens: [1, 2],
    energyMaxBoost: 0,
  },
  hard: {
    gold: [250, 600],
    affectionXp: [40, 80],
    gachaTokens: [2, 4],
    energyMaxBoost: [1, 2],
  },
};

/* ═══════════════════════════════════════════════════
 *  MATCH-3 CONSTANTS
 *  (No longer re-exported here to decouple from frontend)
 * ═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
 *  STREAK SYSTEM — Daily login bonuses
 * ═══════════════════════════════════════════════════ */
export const STREAK_BONUSES = [
  { days: 3, multiplier: 1.1, label: "3-Day", bonus: null },
  {
    days: 7,
    multiplier: 1.25,
    label: "Week",
    bonus: { seeds: { blueberry: 5 } },
  },
  {
    days: 14,
    multiplier: 1.5,
    label: "2-Week",
    bonus: { seeds: { tomato: 3 } },
  },
  {
    days: 30,
    multiplier: 2.0,
    label: "Month",
    bonus: { gold: 500, theme: "neon" },
  },
];

/* ═══════════════════════════════════════════════════
 *  DAILY LOGIN REWARDS — 7-day rotating calendar
 *  Every day always gives something. Resets weekly.
 *  Layered ON TOP of streak multiplier bonuses.
 * ═══════════════════════════════════════════════════ */
export const DAILY_LOGIN_REWARDS = [
  { day: 1, reward: { gold: 20 }, label: "Welcome Gift", emoji: "🪙" },
  {
    day: 2,
    reward: { seeds: { strawberry: 3 } },
    label: "Seed Pack",
    emoji: "🍓",
  },
  { day: 3, reward: { gachaTokens: 1 }, label: "Gacha Token", emoji: "🎰" },
  { day: 4, reward: { gold: 50 }, label: "Gold Rush", emoji: "💰" },
  {
    day: 5,
    reward: { seeds: { blueberry: 5 } },
    label: "Berry Basket",
    emoji: "🫐",
  },
  { day: 6, reward: { gachaTokens: 2 }, label: "Double Tokens", emoji: "🎰" },
  { day: 7, reward: { gold: 100 }, label: "Weekly Jackpot", emoji: "👑" },
];

/**
 * Claim today's daily login reward. Applies reward to player.
 * Returns { claimed, reward, dayOfWeek } or { claimed: false } if already claimed today.
 */
export function claimDailyReward(player, now = Date.now()) {
  if (!player.dailyReward) {
    player.dailyReward = { lastClaimDate: null, weekDay: 0 };
  }
  const today = new Date(now).toISOString().slice(0, 10);
  if (player.dailyReward.lastClaimDate === today) {
    return { claimed: false };
  }

  // Advance day counter (1-7, wraps)
  player.dailyReward.weekDay = ((player.dailyReward.weekDay || 0) % 7) + 1;
  player.dailyReward.lastClaimDate = today;

  const dayConfig = DAILY_LOGIN_REWARDS[player.dailyReward.weekDay - 1];
  const reward = dayConfig.reward;

  // Apply reward to player
  if (reward.gold) player.resources.gold += reward.gold;
  if (reward.gachaTokens)
    player.resources.gachaTokens =
      (player.resources.gachaTokens || 0) + reward.gachaTokens;
  if (reward.seeds) {
    for (const [seedId, qty] of Object.entries(reward.seeds)) {
      player.farm.inventory[seedId] =
        (player.farm.inventory[seedId] || 0) + qty;
    }
  }

  return {
    claimed: true,
    reward,
    dayOfWeek: player.dailyReward.weekDay,
    label: dayConfig.label,
    emoji: dayConfig.emoji,
  };
}

export function updateStreak(player, now = Date.now()) {
  if (!player.streak) {
    player.streak = {
      current: 0,
      best: 0,
      lastLoginDate: null,
      bonusMultiplier: 1,
    };
  }
  const today = new Date(now).toISOString().slice(0, 10);
  if (player.streak.lastLoginDate === today) {
    return { continued: false, broken: false, bonusUnlocked: null };
  }
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  let broken = false;
  if (player.streak.lastLoginDate === yesterday) {
    player.streak.current++;
  } else {
    broken = player.streak.current > 0;
    player.streak.current = 1;
  }
  player.streak.lastLoginDate = today;
  player.streak.best = Math.max(player.streak.best, player.streak.current);
  let mult = 1;
  let bonusUnlocked = null;
  for (const tier of STREAK_BONUSES) {
    if (player.streak.current >= tier.days) {
      mult = tier.multiplier;
      if (player.streak.current === tier.days) bonusUnlocked = tier;
    }
  }
  player.streak.bonusMultiplier = mult;
  return { continued: !broken, broken, bonusUnlocked };
}

/* ═══════════════════════════════════════════════════
 *  ACHIEVEMENT BADGES
 * ═══════════════════════════════════════════════════ */
export const ACHIEVEMENTS = {
  first_sprout: {
    id: "first_sprout",
    name: "First Sprout",
    emoji: "🌱",
    desc: "Plant your first crop",
    reward: { gold: 10 },
    check: (p) => (p.farm?.xp || 0) > 0,
  },
  berry_picker: {
    id: "berry_picker",
    name: "Berry Picker",
    emoji: "🍓",
    desc: "Harvest 10 strawberries",
    reward: { gold: 25 },
    check: (p) => (p.farm?.harvested?.strawberry || 0) >= 10,
  },
  green_thumb: {
    id: "green_thumb",
    name: "Green Thumb",
    emoji: "🧑‍🌾",
    desc: "Harvest 50 crops total",
    reward: { gold: 50 },
    check: (p) =>
      Object.values(p.farm?.harvested || {}).reduce((a, b) => a + b, 0) >= 50,
  },
  rose_garden: {
    id: "rose_garden",
    name: "Rose Garden",
    emoji: "🌹",
    desc: "Harvest a Golden Rose",
    reward: { gold: 100 },
    check: (p) => (p.farm?.harvested?.golden || 0) >= 1,
  },
  pumpkin_king: {
    id: "pumpkin_king",
    name: "Pumpkin King",
    emoji: "🎃",
    desc: "Harvest a Pumpkin",
    reward: { gold: 200 },
    check: (p) => (p.farm?.harvested?.pumpkin || 0) >= 1,
  },
  land_baron: {
    id: "land_baron",
    name: "Land Baron",
    emoji: "🏗️",
    desc: "Buy 3 extra plots",
    reward: { gold: 150 },
    check: (p) => (p.farm?.plots?.length || 6) >= 9,
  },
  first_million: {
    id: "first_million",
    name: "Gold Hoarder",
    emoji: "💰",
    desc: "Earn 1000 gold total",
    reward: { gold: 100 },
    check: (p) => (p.resources?.gold || 0) >= 1000,
  },
  week_warrior: {
    id: "week_warrior",
    name: "Week Warrior",
    emoji: "🔥",
    desc: "7-day login streak",
    reward: { gachaTokens: 5 },
    check: (p) => (p.streak?.best || 0) >= 7,
  },
  pet_whisperer: {
    id: "pet_whisperer",
    name: "Pet Whisperer",
    emoji: "🐾",
    desc: "Pet affection level 5",
    reward: { gold: 100 },
    check: (p) => (p.pet?.affectionLevel || 1) >= 5,
  },
  gem_master: {
    id: "gem_master",
    name: "Gem Master",
    emoji: "💎",
    desc: "Match-3 score over 3000",
    reward: { gold: 50 },
    check: (p) => (p.match3?.highScore || 0) >= 3000,
  },
  merge_lord: {
    id: "merge_lord",
    name: "Merge Lord",
    emoji: "🧩",
    desc: "Create a legendary merge item",
    reward: { gold: 200 },
    check: (p) => {
      const b = p.merge?.board;
      if (!b) return false;
      for (const r of b) for (const c of r) if (c?.level >= 7) return true;
      return false;
    },
  },
  farm_legend: {
    id: "farm_legend",
    name: "Farm Legend",
    emoji: "⭐",
    desc: "Reach farm level 10",
    reward: { gold: 500 },
    check: (p) => (p.farm?.level || 1) >= 10,
  },
};

export function checkAchievements(player) {
  if (!player.achievements) player.achievements = {};
  const newlyUnlocked = [];
  for (const [id, badge] of Object.entries(ACHIEVEMENTS)) {
    if (player.achievements[id]) continue;
    try {
      if (badge.check(player)) {
        player.achievements[id] = { unlockedAt: Date.now(), seen: false };
        newlyUnlocked.push(id);
      }
    } catch {
      /* guard */
    }
  }
  return newlyUnlocked;
}

/* ═══════════════════════════════════════════════════
 *  SEASON PASS
 * ═══════════════════════════════════════════════════ */
export const SEASON_PASS = {
  season: 1,
  name: "Season of Growth",
  tiers: [
    { xp: 0, reward: { gold: 50 }, label: "Welcome Gift" },
    { xp: 100, reward: { seeds: { strawberry: 10 } }, label: "Starter Pack" },
    { xp: 250, reward: { gold: 100 }, label: "Gold Rush" },
    { xp: 500, reward: { theme: "autumn" }, label: "Autumn Harvest" },
    {
      xp: 1000,
      reward: { gold: 300, gachaTokens: 5 },
      label: "Treasure Trove",
    },
    { xp: 2000, reward: { title: "🌟 Farm Master" }, label: "Master Title" },
    {
      xp: 3500,
      reward: { theme: "crystal", gold: 500 },
      label: "Crystal Garden",
    },
    {
      xp: 5000,
      reward: { gold: 1000, title: "👑 Legend" },
      label: "Legend Status",
    },
  ],
};

/* ═══════════════════════════════════════════════════
 *  PLOT THEMES (Farm Cosmetics)
 * ═══════════════════════════════════════════════════ */
export const PLOT_THEMES = {
  default: {
    id: "default",
    name: "Classic",
    emoji: "🌿",
    cost: 0,
    borderColor: "rgba(34,197,94,0.4)",
    glowColor: "rgba(34,197,94,0.15)",
  },
  neon: {
    id: "neon",
    name: "Neon Glow",
    emoji: "💜",
    cost: 200,
    borderColor: "rgba(168,85,247,0.5)",
    glowColor: "rgba(168,85,247,0.2)",
  },
  autumn: {
    id: "autumn",
    name: "Autumn Harvest",
    emoji: "🍂",
    cost: 300,
    borderColor: "rgba(234,88,12,0.5)",
    glowColor: "rgba(234,88,12,0.15)",
  },
  crystal: {
    id: "crystal",
    name: "Crystal Garden",
    emoji: "💎",
    cost: 500,
    borderColor: "rgba(56,189,248,0.5)",
    glowColor: "rgba(56,189,248,0.2)",
  },
};

/* ═══════════════════════════════════════════════════
 *  BOOSTER CONFIG
 * ═══════════════════════════════════════════════════ */
export const BOOSTER_CONFIG = {
  fertilizer: {
    id: "fertilizer",
    name: "Fertilizer",
    emoji: "⚡",
    durationMs: 3_600_000,
    growthMultiplier: 0.5,
    cost: 50,
  },
};

/* ═══════════════════════════════════════════════════
 *  EVENT FRAMEWORK
 * ═══════════════════════════════════════════════════ */
export const EVENTS = [
  {
    id: "spring_bloom",
    name: "Spring Bloom",
    emoji: "🌸",
    description: "Cherry blossoms are in season! Grow limited-edition flowers.",
    startDate: "2026-03-20",
    endDate: "2026-04-20",
    recurring: true, // Annual event: Mar 20 – Apr 20
    bonuses: { xpMultiplier: 2 },
    specialCrop: {
      id: "cherry_blossom",
      name: "Cherry Blossom",
      emoji: "🌸",
      growthTime: 600_000,
      sellPrice: 75,
      seedPrice: 30,
      xp: 25,
      energyYield: 3,
      fullnessYield: 10,
      lore: "A delicate pink blossom that only appears during the Spring Bloom festival.",
    },
  },
  {
    id: "harvest_moon",
    name: "Harvest Moon",
    emoji: "🌕",
    description: "Under the harvest moon, crops grow faster and sell for more.",
    startDate: "2026-09-15",
    endDate: "2026-10-15",
    recurring: true, // Annual event: Sep 15 – Oct 15
    bonuses: { goldMultiplier: 1.5, growthSpeedMultiplier: 0.75 },
    specialCrop: null,
  },
  {
    id: "winter_fest",
    name: "Winter Festival",
    emoji: "❄️",
    description:
      "Cozy up! Double XP on all activities and a special snowflower seed.",
    startDate: "2025-12-15",
    endDate: "2026-01-15",
    recurring: true, // Annual event: Dec 15 – Jan 15
    bonuses: { xpMultiplier: 2, goldMultiplier: 1.25 },
    specialCrop: {
      id: "snowflower",
      name: "Snowflower",
      emoji: "❄️",
      growthTime: 900_000,
      sellPrice: 60,
      seedPrice: 25,
      xp: 20,
      energyYield: 3,
      fullnessYield: 12,
      lore: "A crystalline bloom that only grows during the coldest nights. Its petals shimmer like fresh snow.",
    },
  },
];

export function getActiveEvents(now = Date.now()) {
  const currentDate = new Date(now);
  const currentYear = currentDate.getFullYear();
  return EVENTS.filter((e) => {
    if (!e.startDate || !e.endDate) return false;
    // For recurring events, normalize to the current year
    if (e.recurring) {
      const startMD = e.startDate.slice(5); // "MM-DD"
      const endMD = e.endDate.slice(5);
      // Try current year first, then check year boundary (Dec→Jan)
      for (const year of [currentYear, currentYear - 1]) {
        const start = new Date(`${year}-${startMD}`).getTime();
        let endYear = year;
        // Handle year-crossing events (e.g., Dec 15 → Jan 15)
        if (endMD < startMD) endYear = year + 1;
        const end = new Date(`${endYear}-${endMD}`).getTime();
        if (now >= start && now <= end) return true;
      }
      return false;
    }
    const start = new Date(e.startDate).getTime();
    const end = new Date(e.endDate).getTime();
    return now >= start && now <= end;
  });
}

export function mergeCropConfig(base, overrides = {}) {
  const merged = {};
  for (const [id, cfg] of Object.entries(base)) {
    merged[id] = overrides[id] ? { ...cfg, ...overrides[id], id } : { ...cfg };
  }
  for (const [id, cfg] of Object.entries(overrides)) {
    if (!base[id]) merged[id] = { ...cfg, id };
  }
  return merged;
}

/* ═══════════════════════════════════════════════════
 *  SHARED HELPERS (extracted for DRY)
 * ═══════════════════════════════════════════════════ */

/** Random integer in [min, max] inclusive */
export function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Pick random element from array */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

/* ═══════════════════════════════════════════════════
 *  PLAYER FACTORY
 * ═══════════════════════════════════════════════════ */
export function createDefaultPlayer(userId, username, now = Date.now()) {
  const BOARD_ROWS = 7,
    BOARD_COLS = 9;
  return {
    id: userId,
    username: username || "Player",
    schemaVersion: 7,
    _lastSeen: now,
    resources: {
      gold: ECONOMY.GOLD_START,
      energy: {
        current: ECONOMY.ENERGY_START,
        max: ECONOMY.ENERGY_MAX,
        lastRegenTimestamp: now,
      },
      gachaTokens: 0,
    },
    pet: {
      name: "Buddy",
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      skinId: "basic_dog",
      stats: { happiness: 100, fullness: 0 },
      lastDigestionTimestamp: now,
      activeOrders: [],
      affectionXp: 0,
      affectionLevel: 1,
      abilities: { autoHarvest: false, autoWater: false, autoPlant: false },
    },
    room: { decorations: [], inventory: [], wallpaper: "default" },
    farm: {
      xp: 0,
      level: 1,
      plots: Array.from({ length: 6 }, (_, i) => ({
        id: i,
        crop: null,
        plantedAt: null,
        watered: false,
      })),
      inventory: { strawberry: 5 },
      harvested: {},
    },
    merge: {
      board: Array.from({ length: BOARD_ROWS }, () =>
        Array(BOARD_COLS).fill(null),
      ),
      generators: ["textile"], // Unlocked generator chain IDs
      inventory: [], // Unplaced items from gacha
      lastFreePull: 0, // Timestamp of last daily free pull
      generatorState: {
        // Per-chain cooldown tracking
        textile: { tapsLeft: ECONOMY.GENERATOR_TAP_LIMIT, cooldownEnd: 0 },
      },
    },
    trivia: {
      totalScore: 0,
      totalCorrect: 0,
      totalPlayed: 0,
      bestStreak: 0,
      session: null,
    },
    match3: {
      highScore: 0,
      totalGames: 0,
      currentGame: null,
    },
    blox: {
      highScore: 0,
      totalGames: 0,
      activeGame: false,
    },
    streak: { current: 0, best: 0, lastLoginDate: null, bonusMultiplier: 1 },
    achievements: {},
    journal: { discovered: [] },
    cosmetics: { activePlotTheme: "default", ownedThemes: ["default"] },
    seasonPass: { season: 1, xp: 0, tier: 0, claimed: [] },
    boosters: { fertilizer: { active: false, expiresAt: 0 } },
  };
}

/* ═══════════════════════════════════════════════════
 *  ENERGY SYSTEM — Lazy Passive Regeneration
 * ═══════════════════════════════════════════════════ */
export function calcRegen(player, now = Date.now()) {
  const e = player.resources.energy;
  const bonuses = getRoomBonuses(player);
  const maxEnergy = e.max + bonuses.energyMax;

  if (e.current >= maxEnergy) {
    e.lastRegenTimestamp = now;
    return;
  }
  const delta = now - e.lastRegenTimestamp;
  const regenAmount = Math.floor(delta / ECONOMY.ENERGY_REGEN_INTERVAL_MS);
  if (regenAmount > 0) {
    const newEnergy = Math.min(maxEnergy, e.current + regenAmount);
    e.current = newEnergy;
    if (newEnergy < maxEnergy) {
      e.lastRegenTimestamp = now - (delta % ECONOMY.ENERGY_REGEN_INTERVAL_MS);
    } else {
      e.lastRegenTimestamp = now;
    }
  }
}

/* ═══════════════════════════════════════════════════
 *  OFFLINE PROGRESS — Fullness-based simulation loop
 *  v6.2.2: Pet works using its own Fullness (not player Energy).
 *  Self-sustain: pet auto-eats cheap-tier crops when hungry.
 *  Priority: Harvest → Plant → Water
 * ═══════════════════════════════════════════════════ */
export const OFFLINE_THRESHOLD_MS = 120000; // 2 minutes

/** Cost in fullness points per offline action */
const OFFLINE_HARVEST_COST = 2; // per crop harvested
const OFFLINE_PLANT_COST = 4; // per seed planted

export function processOfflineActions(player, now = Date.now()) {
  const lastSeen = player._lastSeen || now;
  const elapsed = now - lastSeen;
  player._lastSeen = now;

  // Only simulate if away for more than 2 minutes
  if (elapsed < OFFLINE_THRESHOLD_MS) return null;

  const pet = player.pet;
  const report = {
    offlineMinutes: Math.round(elapsed / 60000),
    harvested: {},
    planted: {},
    autoWatered: 0,
    fullnessConsumed: 0,
    foodEaten: {},
    xpGained: 0,
    openLoops: [], // Zeigarnik Effect triggers
  };

  // Helper: try to refuel pet by eating cheap crops from inventory
  function tryRefuel(needed) {
    const cheapIds = Object.keys(player.farm.inventory).filter(
      (id) =>
        CROP_TIERS[id] === "cheap" &&
        CROPS[id] &&
        player.farm.inventory[id] > 0,
    );
    // Sort by lowest fullnessYield first (eat the least valuable first)
    cheapIds.sort(
      (a, b) => (CROPS[a].fullnessYield || 0) - (CROPS[b].fullnessYield || 0),
    );
    let gained = 0;
    for (const id of cheapIds) {
      while (gained < needed && player.farm.inventory[id] > 0) {
        player.farm.inventory[id]--;
        const yield_ = CROPS[id].fullnessYield || 5;
        gained += yield_;
        pet.stats.fullness = Math.min(
          ECONOMY.SATIETY_MAX,
          pet.stats.fullness + yield_,
        );
        report.foodEaten[id] = (report.foodEaten[id] || 0) + 1;
      }
      if (gained >= needed) break;
    }
    return gained;
  }

  // Helper: spend fullness (auto-eat if needed), returns true if affordable
  function spendFullness(cost) {
    if (pet.stats.fullness >= cost) {
      pet.stats.fullness -= cost;
      report.fullnessConsumed += cost;
      return true;
    }
    // Try to refuel
    const deficit = cost - pet.stats.fullness;
    tryRefuel(deficit);
    if (pet.stats.fullness >= cost) {
      pet.stats.fullness -= cost;
      report.fullnessConsumed += cost;
      return true;
    }
    return false; // Can't afford even after eating
  }

  // Step 1: Auto-Harvest (costs fullness per crop)
  if (pet.abilities.autoHarvest) {
    for (const plot of player.farm.plots) {
      if (plot.crop && plot.plantedAt && getGrowthPct(plot, now) >= 1) {
        if (!spendFullness(OFFLINE_HARVEST_COST)) break;
        const cfg = CROPS[plot.crop];
        if (!cfg) continue;
        report.harvested[plot.crop] = (report.harvested[plot.crop] || 0) + 1;
        player.farm.harvested[plot.crop] =
          (player.farm.harvested[plot.crop] || 0) + 1;
        player.farm.xp += cfg.xp;
        report.xpGained += cfg.xp;
        plot.crop = null;
        plot.plantedAt = null;
        plot.watered = false;
      }
    }
  }

  // Step 2: Auto-Plant (costs fullness per seed)
  if (pet.abilities.autoPlant) {
    const seedIds = Object.keys(player.farm.inventory).filter(
      (id) => CROPS[id] && player.farm.inventory[id] > 0,
    );
    for (const plot of player.farm.plots) {
      if (seedIds.length === 0) break;
      if (!plot.crop) {
        if (!spendFullness(OFFLINE_PLANT_COST)) break;
        const idx = Math.floor(Math.random() * seedIds.length);
        const seedId = seedIds[idx];
        player.farm.inventory[seedId]--;
        if (player.farm.inventory[seedId] <= 0) {
          seedIds.splice(idx, 1);
        }
        report.planted[seedId] = (report.planted[seedId] || 0) + 1;
        plot.crop = seedId;
        plot.plantedAt = lastSeen + Math.floor(Math.random() * elapsed);
        plot.watered = false;
      }
    }
  }

  // Step 3: Auto-Water (free, ability-gated)
  if (pet.abilities.autoWater) {
    for (const plot of player.farm.plots) {
      if (plot.crop && !plot.watered) {
        plot.watered = true;
        report.autoWatered++;
      }
    }
  }

  // Update farm level
  const newLevel = Math.floor(player.farm.xp / 100) + 1;
  player.farm.level = newLevel;

  // Zeigarnik Effect: Identify open loops (unfinished tasks)
  for (const plot of player.farm.plots) {
    if (plot.crop && plot.plantedAt) {
      const pct = getGrowthPct(plot, now);
      if (pct > 0 && pct < 1) {
        report.openLoops.push({
          type: "crop",
          name: CROPS[plot.crop]?.emoji || plot.crop,
          progress: Math.floor(pct * 100),
        });
      }
    }
  }

  const hadActivity =
    report.fullnessConsumed > 0 ||
    report.autoWatered > 0 ||
    Object.keys(report.foodEaten).length > 0 ||
    report.openLoops.length > 0;
  return hadActivity ? report : null;
}

/* ═══════════════════════════════════════════════════
 *  PET SATIETY — Digestion Calculation (time-travel-proof)
 * ═══════════════════════════════════════════════════ */
export function calculateSatietyDelta(
  petState,
  currentTime,
  roomBonuses = { fullnessRate: 1, happinessRate: 1 },
) {
  const fullness = petState?.stats?.fullness ?? 0;
  const lastTs = petState?.lastDigestionTimestamp ?? currentTime;
  const rawDelta = Math.max(0, currentTime - lastTs);
  // Cap offline progress at 24 hours to prevent time-travel exploits
  const cappedDelta = Math.min(rawDelta, ECONOMY.SATIETY_OFFLINE_CAP_MS);

  const decayRate = ECONOMY.SATIETY_DECAY_PER_HOUR * roomBonuses.fullnessRate;
  const digested = Math.floor(cappedDelta / 3_600_000) * decayRate;

  return {
    fullness: Math.max(0, fullness - digested),
    lastDigestionTimestamp: currentTime,
  };
}

/* ═══════════════════════════════════════════════════
 *  FARM — Growth Calculations
 * ═══════════════════════════════════════════════════ */
export function getWateringMultiplier(crop) {
  const cfg = CROPS[crop];
  if (!cfg) return 0.7;
  if (cfg.growthTime >= 3_600_000) return 0.55; // 1h+
  if (cfg.growthTime >= 900_000) return 0.6; // 15min+
  return 0.7;
}

export function getGrowthPct(plot, now = Date.now()) {
  if (!plot.crop || !plot.plantedAt) return 0;
  const cfg = CROPS[plot.crop];
  if (!cfg) return 0;
  const elapsed = now - plot.plantedAt;
  const mult = plot.watered ? getWateringMultiplier(plot.crop) : 1;
  const time = getScaledTime(cfg.growthTime) * mult;
  return Math.min(1, elapsed / time);
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
  return Math.min(gold, 400);
}

export function farmPlotsWithGrowth(farm, now = Date.now()) {
  return farm.plots.map((pl) => {
    const cfg = pl.crop ? CROPS[pl.crop] : null;
    return {
      ...pl,
      growth: getGrowthPct(pl, now),
      growthTime: cfg ? cfg.growthTime : 0,
      wateringMultiplier: pl.crop ? getWateringMultiplier(pl.crop) : 1,
    };
  });
}

/* ═══════════════════════════════════════════════════
 *  TRIVIA — Question Selection
 * ═══════════════════════════════════════════════════ */
export function pickQuestions(questions, count = 5, difficulty = "all") {
  let pool = [...questions];
  if (difficulty && difficulty !== "all")
    pool = pool.filter((q) => q.difficulty === difficulty);
  return pool
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(count, pool.length));
}

export function makeClientQuestion(q, index, total) {
  const answers = [q.correctAnswer, ...q.wrongAnswers].sort(
    () => Math.random() - 0.5,
  );
  return {
    question: q.question,
    answers,
    category: q.category,
    difficulty: q.difficulty,
    points: q.points,
    timeLimit: q.timeLimit,
    index,
    total,
  };
}

/* ═══════════════════════════════════════════════════
 *  PET HYBRID RENDER ENGINE SCHEMAS
 * ═══════════════════════════════════════════════════ */

export function getRoomBonuses(player) {
  const bonuses = {
    energyMax: 0,
    happinessRate: 1,
    fullnessRate: 1,
    affectionXpMult: 1,
  };
  if (!player.room || !Array.isArray(player.room.decorations)) return bonuses;
  player.room.decorations.forEach((decoId) => {
    const deco = ROOM_DECORATIONS[decoId];
    if (deco && deco.bonus) {
      if (deco.bonus.type === "energyMax")
        bonuses.energyMax += deco.bonus.value;
      if (deco.bonus.type === "happinessRate")
        bonuses.happinessRate += deco.bonus.value;
      if (deco.bonus.type === "fullnessRate")
        bonuses.fullnessRate += deco.bonus.value;
      if (deco.bonus.type === "affectionXpMult")
        bonuses.affectionXpMult += deco.bonus.value;
    }
  });
  return bonuses;
}

export const PET_ASSETS = {
  basic_dog: {
    type: "svg",
    src: "pets/basic_dog_body.svg", // SVG file inside public/pets/
    width: 120,
    height: 120,
    anchors: {
      head: { top: "15%", left: "45%" },
      face: { top: "40%", left: "45%" },
      neck: { top: "55%", left: "45%" },
      body: { top: "50%", left: "50%" },
    },
  },
  basic_cat: {
    type: "svg",
    src: "pets/basic_cat_body.svg",
    width: 120,
    height: 120,
    anchors: {
      head: { top: "10%", left: "50%" },
      face: { top: "35%", left: "50%" },
      neck: { top: "50%", left: "50%" },
      body: { top: "50%", left: "50%" },
    },
  },
  basic_bunny: {
    type: "svg",
    src: "pets/basic_bunny_body.svg",
    width: 120,
    height: 120,
    anchors: {
      head: { top: "5%", left: "50%" },
      face: { top: "30%", left: "50%" },
      neck: { top: "45%", left: "50%" },
      body: { top: "50%", left: "50%" },
    },
  },
};

export const PET_EXPRESSIONS = {
  ecstatic: { type: "svg", src: "pets/expr_ecstatic.svg" },
  happy: { type: "svg", src: "pets/expr_happy.svg" },
  content: { type: "svg", src: "pets/expr_content.svg" },
  neutral: { type: "svg", src: "pets/expr_neutral.svg" },
  sad: { type: "svg", src: "pets/expr_sad.svg" },
  miserable: { type: "svg", src: "pets/expr_miserable.svg" },
};

export const ROOM_DECORATIONS = {
  deco_chair: {
    id: "deco_chair",
    name: "Cozy Chair",
    emoji: "🪑",
    rarity: "common",
    bonus: {
      type: "fullnessRate",
      value: 0.05,
      desc: "Slower Pet Hunger (-5%)",
    },
  },
  deco_table: {
    id: "deco_table",
    name: "Small Table",
    emoji: "🪚",
    rarity: "common",
    bonus: { type: "energyMax", value: 5, desc: "+5 Max Energy" },
  },
  deco_plant: {
    id: "deco_plant",
    name: "Potted Plant",
    emoji: "🪴",
    rarity: "common",
    bonus: { type: "happinessRate", value: 0.05, desc: "Slower Sadness (-5%)" },
  },
  deco_rug: {
    id: "deco_rug",
    name: "Soft Rug",
    emoji: "🧶",
    rarity: "uncommon",
    bonus: {
      type: "fullnessRate",
      value: 0.1,
      desc: "Slower Pet Hunger (-10%)",
    },
  },
  deco_bed: {
    id: "deco_bed",
    name: "Pet Bed",
    emoji: "🛏️",
    rarity: "rare",
    bonus: { type: "energyMax", value: 15, desc: "+15 Max Energy" },
  },
  deco_lamp: {
    id: "deco_lamp",
    name: "Warm Lamp",
    emoji: "💡",
    rarity: "uncommon",
    bonus: { type: "affectionXpMult", value: 0.05, desc: "+5% Affection Gain" },
  },
  deco_bookshelf: {
    id: "deco_bookshelf",
    name: "Bookshelf",
    emoji: "📚",
    rarity: "rare",
    bonus: {
      type: "affectionXpMult",
      value: 0.15,
      desc: "+15% Affection Gain",
    },
  },
};
