/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Merge Chain & Quest Tier Configuration
 *  Static data for merge game and quest reward tiers.
 * ═══════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════
 *  MERGE CHAINS (Gacha Merge v7.0)
 *  Merge chains use eight levels. Level 8 = Legendary.
 *  The live generator rolls random chains; recipes add alchemy-style shortcuts.
 * ═══════════════════════════════════════════════════ */
export const MERGE_WILD_GENERATOR_ID = "wild";

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
  earth: {
    id: "earth",
    name: "Earth",
    items: [
      "dust",
      "sand",
      "stone",
      "ore",
      "crystal",
      "glass",
      "prism",
      "monolith",
    ],
    names: [
      "Dust",
      "Sand",
      "Stone",
      "Ore",
      "Crystal",
      "Glass",
      "Prism",
      "Legendary Monolith",
    ],
    emoji: ["💨", "🏖️", "🪨", "⛏️", "💎", "🔍", "🌈", "🗿"],
  },
  storm: {
    id: "storm",
    name: "Storm",
    items: [
      "spark",
      "cloud",
      "bolt",
      "lightning",
      "storm_cell",
      "thunderhead",
      "aurora",
      "tempest_crown",
    ],
    names: [
      "Spark",
      "Cloud",
      "Bolt",
      "Lightning",
      "Storm Cell",
      "Thunderhead",
      "Aurora",
      "Legendary Tempest Crown",
    ],
    emoji: ["✨", "☁️", "⚡", "🌩️", "⛈️", "🌪️", "🌌", "👑"],
  },
  craft: {
    id: "craft",
    name: "Craft",
    items: [
      "bundle",
      "toolkit",
      "camp_chair",
      "loom",
      "workbench",
      "atelier",
      "guild_hall",
      "relic_workshop",
    ],
    names: [
      "Bundle",
      "Toolkit",
      "Camp Chair",
      "Loom",
      "Workbench",
      "Atelier",
      "Guild Hall",
      "Legendary Workshop",
    ],
    emoji: ["🪢", "🧰", "🪑", "🧵", "🛠️", "🏠", "🏛️", "✨"],
  },
};

export const MERGE_RECIPES = [
  {
    id: "thread_twig_bundle",
    ingredients: ["thread", "twig"],
    result: { chainId: "craft", level: 0 },
  },
  {
    id: "yarn_branch_toolkit",
    ingredients: ["yarn", "branch"],
    result: { chainId: "craft", level: 1 },
  },
  {
    id: "fabric_plank_loom",
    ingredients: ["fabric", "plank"],
    result: { chainId: "craft", level: 3 },
  },
  {
    id: "sand_lightning_glass",
    ingredients: ["sand", "lightning"],
    result: { chainId: "earth", level: 5 },
  },
  {
    id: "crystal_aurora_prism",
    ingredients: ["crystal", "aurora"],
    result: { chainId: "earth", level: 6 },
  },
];

function recipeKey(itemIds = []) {
  return itemIds.map((id) => String(id || "")).sort().join("+");
}

function chainItem(chainId, level) {
  const chain = MERGE_CHAINS[chainId];
  if (!chain || level < 0 || level >= chain.items.length) return null;
  return { id: chain.items[level], chainId, level };
}

export function getMergeRecipeResult(first, second) {
  if (!first?.id || !second?.id) return null;
  const key = recipeKey([first.id, second.id]);
  const recipe = MERGE_RECIPES.find((candidate) => recipeKey(candidate.ingredients) === key);
  if (!recipe) return null;
  const result = chainItem(recipe.result.chainId, recipe.result.level);
  return result ? { ...result, recipeId: recipe.id } : null;
}

export function getMergePairResult(first, second) {
  if (!first || !second) return null;
  if (first.chainId === second.chainId && first.level === second.level) {
    return chainItem(first.chainId, Number(first.level || 0) + 1);
  }
  return getMergeRecipeResult(first, second);
}

export function canMergePair(first, second) {
  return !!getMergePairResult(first, second);
}

export function pickMergeDropChainId(board = [], random = Math.random) {
  const allChainIds = Object.keys(MERGE_CHAINS);
  const activeChainIds = new Set();
  for (const row of board || []) {
    for (const item of row || []) {
      if (item?.chainId && MERGE_CHAINS[item.chainId]) activeChainIds.add(item.chainId);
    }
  }
  const pool = activeChainIds.size > 0 && random() < 0.62
    ? [...activeChainIds]
    : allChainIds;
  return pool[Math.floor(random() * pool.length)] || allChainIds[0];
}

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
