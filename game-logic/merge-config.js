/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Merge Chain & Quest Tier Configuration
 *  Static data for merge game and quest reward tiers.
 * ═══════════════════════════════════════════════════
 */

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
