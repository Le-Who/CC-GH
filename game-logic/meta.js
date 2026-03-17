/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Meta Systems (Achievements, Streaks, Events)
 *  Retention mechanics, daily rewards, season pass, boosters.
 * ═══════════════════════════════════════════════════
 */

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
