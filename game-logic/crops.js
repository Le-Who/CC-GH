/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Crop Definitions & Seed Unlocking
 *  All crop data, tiers, and progressive unlock logic.
 * ═══════════════════════════════════════════════════
 */

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
