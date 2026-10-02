/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Pet Assets, Room Decorations & Plot Themes
 *  Render schemas, cosmetic data, and room bonus logic.
 * ═══════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════
 *  PET HYBRID RENDER ENGINE SCHEMAS
 * ═══════════════════════════════════════════════════ */

export const PET_ASSETS = {
  basic_dog: {
    type: "svg",
    src: "pets/basic_dog_body.svg", // SVG file inside public/pets/
    width: 120,
    height: 120,
    anchors: {
      head: { top: "5%", left: "50%" },
      face: { top: "20%", left: "50%" },
      neck: { top: "45%", left: "50%" },
      body: { top: "50%", left: "50%" },
    },
  },
  basic_cat: {
    type: "svg",
    src: "pets/basic_cat_body.svg",
    width: 120,
    height: 120,
    anchors: {
      head: { top: "0%", left: "50%" },
      face: { top: "25%", left: "50%" },
      neck: { top: "40%", left: "50%" },
      body: { top: "50%", left: "50%" },
    },
  },
  basic_bunny: {
    type: "svg",
    src: "pets/basic_bunny_body.svg",
    width: 120,
    height: 120,
    anchors: {
      head: { top: "-5%", left: "50%" },
      face: { top: "28%", left: "50%" },
      neck: { top: "35%", left: "50%" },
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
