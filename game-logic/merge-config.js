/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Merge Chain & Quest Tier Configuration
 *  Static data for merge game and quest reward tiers.
 * ═══════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════
 *  MERGE CHAINS (Alchemy Merge v8.0)
 *  Merge chains use eight levels. Cross-chain recipes form a readable
 *  alchemy graph instead of unrelated crafting shortcuts.
 * ═══════════════════════════════════════════════════ */
export const MERGE_WILD_GENERATOR_ID = "wild";
export const MERGE_START_CHAIN_ID = "flora";
export const MERGE_GENERATOR_CHAIN_IDS = ["flora", "earth", "water", "fire", "air"];
export const MERGE_FREE_TAP_RECHARGE_MS = 20 * 60 * 1000;
export const MERGE_FREE_TAP_BANK_CAP = 30;

export function getMergeFreeTapClaim(merge = {}, now = Date.now()) {
  const currentCharges = Math.max(0, Math.floor(Number(merge.freeTapCharges) || 0));
  const capacity = Math.max(0, MERGE_FREE_TAP_BANK_CAP - currentCharges);
  const nowValue = Number(now);
  const safeNow = Math.max(0, Math.floor(Number.isFinite(nowValue) ? nowValue : Date.now()));
  const lastFreeTaps = Math.max(0, Math.floor(Number(merge.lastFreeTaps) || 0));

  if (capacity <= 0) {
    return {
      claimable: 0,
      freeTapCharges: currentCharges,
      nextLastFreeTaps: lastFreeTaps || safeNow,
      nextFreeTapAt: (lastFreeTaps || safeNow) + MERGE_FREE_TAP_RECHARGE_MS,
    };
  }

  if (!lastFreeTaps) {
    return {
      claimable: capacity,
      freeTapCharges: MERGE_FREE_TAP_BANK_CAP,
      nextLastFreeTaps: safeNow,
      nextFreeTapAt: safeNow + MERGE_FREE_TAP_RECHARGE_MS,
    };
  }

  const elapsed = safeNow - lastFreeTaps;
  const earned = Math.floor(elapsed / MERGE_FREE_TAP_RECHARGE_MS);
  const claimable = Math.max(0, Math.min(capacity, earned));
  const nextLastFreeTaps = claimable > 0
    ? lastFreeTaps + claimable * MERGE_FREE_TAP_RECHARGE_MS
    : lastFreeTaps;

  return {
    claimable,
    freeTapCharges: currentCharges + claimable,
    nextLastFreeTaps,
    nextFreeTapAt: nextLastFreeTaps + MERGE_FREE_TAP_RECHARGE_MS,
  };
}

export const MERGE_CHAINS = {
  flora: {
    id: "flora",
    name: "Flora",
    items: [
      "seed",
      "sprout",
      "herb",
      "blossom",
      "vine",
      "grove",
      "lifebloom",
      "world_tree",
    ],
    names: [
      "Seed",
      "Sprout",
      "Herb",
      "Blossom",
      "Vine",
      "Grove",
      "Lifebloom",
      "World Tree",
    ],
    emoji: ["🌰", "🌱", "🌿", "🌼", "🍃", "🌳", "💚", "🌍"],
  },
  earth: {
    id: "earth",
    name: "Earth",
    items: [
      "dust",
      "clay",
      "sand",
      "stone",
      "ore",
      "crystal",
      "geode",
      "monolith",
    ],
    names: [
      "Dust",
      "Clay",
      "Sand",
      "Stone",
      "Ore",
      "Crystal",
      "Geode",
      "Monolith",
    ],
    emoji: ["💨", "🟫", "🏖️", "🪨", "⛏️", "💎", "🪬", "🗿"],
  },
  water: {
    id: "water",
    name: "Water",
    items: [
      "dew",
      "droplet",
      "stream",
      "spring",
      "pond",
      "tide",
      "rainstone",
      "ocean_heart",
    ],
    names: [
      "Dew",
      "Droplet",
      "Stream",
      "Spring",
      "Pond",
      "Tide",
      "Rainstone",
      "Ocean Heart",
    ],
    emoji: ["💧", "💦", "〰️", "♨️", "🪷", "🌊", "🔷", "💙"],
  },
  fire: {
    id: "fire",
    name: "Fire",
    items: [
      "ember",
      "flame",
      "coal",
      "kiln",
      "forge",
      "sunshard",
      "phoenix_ash",
      "solar_core",
    ],
    names: [
      "Ember",
      "Flame",
      "Coal",
      "Kiln",
      "Forge",
      "Sunshard",
      "Phoenix Ash",
      "Solar Core",
    ],
    emoji: ["🔥", "🔥", "⚫", "🧱", "⚒️", "☀️", "🪶", "🔆"],
  },
  air: {
    id: "air",
    name: "Air",
    items: [
      "breeze",
      "cloud",
      "spark",
      "bolt",
      "lightning",
      "storm_cell",
      "aurora",
      "tempest_crown",
    ],
    names: [
      "Breeze",
      "Cloud",
      "Spark",
      "Bolt",
      "Lightning",
      "Storm Cell",
      "Aurora",
      "Tempest Crown",
    ],
    emoji: ["🍃", "☁️", "✨", "⚡", "🌩️", "⛈️", "🌌", "👑"],
  },
  alchemy: {
    id: "alchemy",
    name: "Alchemy",
    items: [
      "mud",
      "brick",
      "glass",
      "vial",
      "elixir",
      "lens",
      "astrolabe",
      "philosopher_stone",
    ],
    names: [
      "Mud",
      "Brick",
      "Glass",
      "Vial",
      "Elixir",
      "Lens",
      "Astrolabe",
      "Philosopher Stone",
    ],
    emoji: ["🟤", "🧱", "🔍", "🧪", "✨", "🔎", "🧭", "🜍"],
  },
};

export const MERGE_RECIPES = [
  {
    id: "seed_dew_sprout",
    name: "Germination",
    hint: "A seed needs dew before it becomes a sprout.",
    ingredients: ["seed", "dew"],
    result: { chainId: "flora", level: 1 },
    discovered: true,
  },
  {
    id: "seed_mud_sprout",
    name: "Seedbed",
    hint: "Mud can shelter a seed into the same first sprout.",
    ingredients: ["seed", "mud"],
    result: { chainId: "flora", level: 1 },
    discovered: false,
  },
  {
    id: "dew_dust_mud",
    name: "Soft Earth",
    hint: "Water turns loose dust into workable mud.",
    ingredients: ["dew", "dust"],
    result: { chainId: "alchemy", level: 0 },
    discovered: true,
  },
  {
    id: "clay_ember_brick",
    name: "Fired Clay",
    hint: "Clay hardens when fired by an ember.",
    ingredients: ["clay", "ember"],
    result: { chainId: "alchemy", level: 1 },
    discovered: true,
  },
  {
    id: "mud_ember_brick",
    name: "Baked Mud",
    hint: "A small ember can harden wet mud into brick.",
    ingredients: ["mud", "ember"],
    result: { chainId: "alchemy", level: 1 },
    discovered: false,
  },
  {
    id: "sand_flame_glass",
    name: "Glassmaking",
    hint: "Flame melts sand into clear glass.",
    ingredients: ["sand", "flame"],
    result: { chainId: "alchemy", level: 2 },
    discovered: false,
  },
  {
    id: "sand_ember_glass",
    name: "Patient Glass",
    hint: "Even a small ember can make glass if the sand waits long enough.",
    ingredients: ["sand", "ember"],
    result: { chainId: "alchemy", level: 2 },
    discovered: false,
  },
  {
    id: "glass_droplet_vial",
    name: "Vessel",
    hint: "A droplet gives glass a purpose: a vial.",
    ingredients: ["glass", "droplet"],
    result: { chainId: "alchemy", level: 3 },
    discovered: false,
  },
  {
    id: "glass_dew_vial",
    name: "Fine Vessel",
    hint: "Dew cools glass into a small vial without cracking it.",
    ingredients: ["glass", "dew"],
    result: { chainId: "alchemy", level: 3 },
    discovered: false,
  },
  {
    id: "vial_herb_elixir",
    name: "Infusion",
    hint: "Herbs steeped in a vial become an elixir.",
    ingredients: ["vial", "herb"],
    result: { chainId: "alchemy", level: 4 },
    discovered: false,
  },
  {
    id: "vial_blossom_elixir",
    name: "Bloom Infusion",
    hint: "A stronger blossom makes the vial bloom into an elixir.",
    ingredients: ["vial", "blossom"],
    result: { chainId: "alchemy", level: 4 },
    discovered: false,
  },
  {
    id: "glass_spark_lens",
    name: "Focused Light",
    hint: "A spark teaches glass to focus energy.",
    ingredients: ["glass", "spark"],
    result: { chainId: "alchemy", level: 5 },
    discovered: false,
  },
  {
    id: "lens_cloud_astrolabe",
    name: "Sky Reading",
    hint: "A lens pointed through clouds becomes an astrolabe.",
    ingredients: ["lens", "cloud"],
    result: { chainId: "alchemy", level: 6 },
    discovered: false,
  },
  {
    id: "crystal_elixir_philosopher_stone",
    name: "Great Work",
    hint: "Crystal structure and elixir energy complete the stone.",
    ingredients: ["crystal", "elixir"],
    result: { chainId: "alchemy", level: 7 },
    discovered: false,
  },
  {
    id: "geode_astrolabe_philosopher_stone",
    name: "Star Map",
    hint: "A geode and astrolabe reveal the same final stone by the sky path.",
    ingredients: ["geode", "astrolabe"],
    result: { chainId: "alchemy", level: 7 },
    discovered: false,
  },
  {
    id: "breeze_droplet_cloud",
    name: "Condensation",
    hint: "Moving air gathers droplets into clouds.",
    ingredients: ["breeze", "droplet"],
    result: { chainId: "air", level: 1 },
    discovered: true,
  },
  {
    id: "breeze_dew_cloud",
    name: "Morning Cloud",
    hint: "A breeze can lift dew into a young cloud.",
    ingredients: ["breeze", "dew"],
    result: { chainId: "air", level: 1 },
    discovered: false,
  },
  {
    id: "cloud_ember_spark",
    name: "Static Lift",
    hint: "Heat inside a cloud wakes a spark.",
    ingredients: ["cloud", "ember"],
    result: { chainId: "air", level: 2 },
    discovered: false,
  },
  {
    id: "cloud_spark_bolt",
    name: "Charge",
    hint: "A spark in a cloud becomes a bolt.",
    ingredients: ["cloud", "spark"],
    result: { chainId: "air", level: 3 },
    discovered: false,
  },
  {
    id: "ore_coal_forge",
    name: "Smelting",
    hint: "Ore and coal make a working forge.",
    ingredients: ["ore", "coal"],
    result: { chainId: "fire", level: 4 },
    discovered: false,
  },
  {
    id: "forge_crystal_sunshard",
    name: "Prism Forge",
    hint: "A forge can cut crystal into a sunshard.",
    ingredients: ["forge", "crystal"],
    result: { chainId: "fire", level: 5 },
    discovered: false,
  },
  {
    id: "sunshard_tide_rainstone",
    name: "Sun Shower",
    hint: "Sunshard heat and tide pressure condense into a rainstone.",
    ingredients: ["sunshard", "tide"],
    result: { chainId: "water", level: 6 },
    discovered: false,
  },
  {
    id: "rainstone_storm_cell_aurora",
    name: "Aurora Weather",
    hint: "Rainstone inside a storm cell paints the sky.",
    ingredients: ["rainstone", "storm_cell"],
    result: { chainId: "air", level: 6 },
    discovered: false,
  },
];

export const MERGE_CHAIN_ALIASES = {
  textile: "flora",
  wood: "earth",
  storm: "air",
  craft: "alchemy",
};

export const MERGE_ITEM_ALIASES = {
  thread: "seed",
  yarn: "sprout",
  fabric: "herb",
  shirt: "blossom",
  jacket: "vine",
  sweater: "grove",
  coat: "lifebloom",
  tapestry: "world_tree",
  twig: "dust",
  branch: "clay",
  log: "sand",
  plank: "stone",
  chair: "ore",
  table: "crystal",
  wardrobe: "geode",
  throne: "monolith",
  stone: "stone",
  ore: "ore",
  crystal: "crystal",
  prism: "geode",
  bundle: "mud",
  toolkit: "brick",
  camp_chair: "glass",
  loom: "vial",
  workbench: "elixir",
  atelier: "lens",
  guild_hall: "astrolabe",
  relic_workshop: "philosopher_stone",
};

function recipeKey(itemIds = []) {
  return itemIds.map((id) => String(id || "")).sort().join("+");
}

function chainItem(chainId, level) {
  const chain = MERGE_CHAINS[chainId];
  if (!chain || level < 0 || level >= chain.items.length) return null;
  return { id: chain.items[level], chainId, level };
}

const ITEM_TO_CHAIN = new Map();
for (const chain of Object.values(MERGE_CHAINS)) {
  chain.items.forEach((id, level) => {
    ITEM_TO_CHAIN.set(id, { id, chainId: chain.id, level });
  });
}

export function isMergeGeneratorChain(chainId) {
  return MERGE_GENERATOR_CHAIN_IDS.includes(String(chainId || ""));
}

export function getStarterMergeRecipeIds() {
  return MERGE_RECIPES.filter((recipe) => recipe.discovered).map((recipe) => recipe.id);
}

export function getStarterMergeItemIds() {
  const ids = new Set();
  for (const chainId of MERGE_GENERATOR_CHAIN_IDS) {
    const itemId = MERGE_CHAINS[chainId]?.items?.[0];
    if (itemId) ids.add(itemId);
  }
  for (const recipe of MERGE_RECIPES.filter((candidate) => candidate.discovered)) {
    for (const itemId of recipe.ingredients) ids.add(itemId);
    const resultId = MERGE_CHAINS[recipe.result.chainId]?.items?.[recipe.result.level];
    if (resultId) ids.add(resultId);
  }
  return [...ids];
}

export function getMergeItemInfo(itemId) {
  const info = ITEM_TO_CHAIN.get(String(itemId || ""));
  return info ? { ...info } : null;
}

export function normalizeMergeChainId(chainId) {
  const raw = String(chainId || "");
  if (MERGE_CHAINS[raw]) return raw;
  return MERGE_CHAIN_ALIASES[raw] || null;
}

export function normalizeMergeItem(item) {
  if (!item || typeof item !== "object") return null;
  const direct = ITEM_TO_CHAIN.get(item.id);
  if (direct) return { ...direct };
  const aliasId = MERGE_ITEM_ALIASES[item.id];
  const alias = aliasId ? ITEM_TO_CHAIN.get(aliasId) : null;
  if (alias) return { ...alias };
  const chainId = normalizeMergeChainId(item.chainId);
  if (!chainId) return null;
  const chain = MERGE_CHAINS[chainId];
  const level = Math.max(0, Math.min(chain.items.length - 1, Math.floor(Number(item.level) || 0)));
  return chainItem(chainId, level);
}

export function getMergeRecipeResult(first, second) {
  const left = normalizeMergeItem(first);
  const right = normalizeMergeItem(second);
  if (!left?.id || !right?.id) return null;
  const key = recipeKey([left.id, right.id]);
  const recipe = MERGE_RECIPES.find((candidate) => recipeKey(candidate.ingredients) === key);
  if (!recipe) return null;
  const result = chainItem(recipe.result.chainId, recipe.result.level);
  return result ? { ...result, recipeId: recipe.id } : null;
}

export function getMergePairResult(first, second) {
  const left = normalizeMergeItem(first);
  const right = normalizeMergeItem(second);
  if (!left || !right) return null;
  if (left.chainId === right.chainId && left.level === right.level) {
    return chainItem(left.chainId, Number(left.level || 0) + 1);
  }
  return getMergeRecipeResult(left, right);
}

export function canMergePair(first, second) {
  return !!getMergePairResult(first, second);
}

export function pickMergeDropChainId(board = [], random = Math.random) {
  const allChainIds = MERGE_GENERATOR_CHAIN_IDS;
  const activeChainIds = new Set();
  for (const row of board || []) {
    for (const item of row || []) {
        const chainId = normalizeMergeChainId(item?.chainId);
        if (chainId && isMergeGeneratorChain(chainId)) activeChainIds.add(chainId);
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
