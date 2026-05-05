export const YARD_HOUR_MS = 60 * 60 * 1000;
export const YARD_SIMULATION_CAP_MS = 72 * YARD_HOUR_MS;

export const YARD_FOODS = {
  kibble: {
    id: "kibble",
    name: "Garden Kibble",
    desc: "A plain bowl that still brings reliable visitors.",
    cost: { treats: 0, shinyTreats: 0 },
    durationMs: 4 * YARD_HOUR_MS,
    servings: 4,
    tags: ["simple", "day"],
    attraction: 1,
    assetKey: "foods.kibble",
  },
  berry_plate: {
    id: "berry_plate",
    name: "Berry Plate",
    desc: "Sweet berries for soft naps and curious nibblers.",
    cost: { treats: 120, shinyTreats: 0 },
    durationMs: 6 * YARD_HOUR_MS,
    servings: 5,
    tags: ["sweet", "fresh"],
    attraction: 1.35,
    assetKey: "foods.berryPlate",
  },
  bonito_bowl: {
    id: "bonito_bowl",
    name: "Bonito Bowl",
    desc: "A fragrant premium bowl for rare night visitors.",
    cost: { treats: 0, shinyTreats: 2 },
    durationMs: 8 * YARD_HOUR_MS,
    servings: 6,
    tags: ["premium", "night"],
    attraction: 1.8,
    assetKey: "foods.bonitoBowl",
  },
};

export const YARD_CONDITION_VARIANTS = {
  new: {
    attraction: 1,
    activities: [],
  },
  worn: {
    attraction: 0.72,
    activities: ["sniff", "peek", "rest", "watch", "stretch"],
  },
  broken: {
    attraction: 0.45,
    activities: ["peek", "sniff", "rest", "watch"],
  },
};

export const YARD_ACTIVITY_KINDS = {
  active: "active",
  stationary: "stationary",
  lie: "lie",
};

export const YARD_STARTER_REMODEL_IDS = ["meadow", "moon_garden"];

const STATIONARY_ACTIVITY_POSES = new Set(["nap", "rest", "curl", "peek", "watch", "soak", "perch"]);

function normalizeActivityKind(activity = {}) {
  const kind = String(activity.kind || "");
  if (kind === YARD_ACTIVITY_KINDS.lie || kind === YARD_ACTIVITY_KINDS.stationary || kind === YARD_ACTIVITY_KINDS.active) {
    return kind;
  }
  const pose = String(activity.pose || activity.id || "");
  return STATIONARY_ACTIVITY_POSES.has(pose) ? YARD_ACTIVITY_KINDS.stationary : YARD_ACTIVITY_KINDS.active;
}

export function isYardVisitorPoseStationary(visitor = {}, pose = "") {
  return Array.isArray(visitor.stationaryPoses) && visitor.stationaryPoses.includes(String(pose || ""));
}

export function isYardGoodieLayable(goodie = {}) {
  return Array.isArray(goodie.surfaceTypes) && goodie.surfaceTypes.includes("lie");
}

export function isYardGoodieBlocking(goodie = {}) {
  if (!goodie || !goodie.id) return false;
  if (typeof goodie.blocksMovement === "boolean") return goodie.blocksMovement;
  return !isYardGoodieLayable(goodie);
}

const DEFAULT_SMALL_ACTIVITIES = [
  { id: "rest", pose: "sit", x: 0, y: -9, layer: "front", roam: 2 },
  { id: "sniff", pose: "sniff", x: 5, y: -5, layer: "front", roam: 2 },
];

const DEFAULT_LARGE_ACTIVITIES = [
  { id: "left-rest", pose: "rest", x: -10, y: -7, layer: "front", roam: 2 },
  { id: "right-peek", pose: "peek", x: 11, y: -11, layer: "back", roam: 2 },
];

function activityListForGoodie(goodie = {}) {
  return Array.isArray(goodie.activities) && goodie.activities.length
    ? goodie.activities
    : goodie.size === "large"
      ? DEFAULT_LARGE_ACTIVITIES
      : DEFAULT_SMALL_ACTIVITIES;
}

function normalizeActivity(activity = {}, index = 0) {
  const id = String(activity.id || activity.pose || `activity-${index}`).slice(0, 40);
  const layer = activity.layer === "back" ? "back" : "front";
  const kind = normalizeActivityKind(activity);
  return {
    id,
    pose: String(activity.pose || id || "sit").slice(0, 40),
    x: Number.isFinite(Number(activity.x)) ? Number(activity.x) : 0,
    y: Number.isFinite(Number(activity.y)) ? Number(activity.y) : -8,
    layer,
    facing: activity.facing === "left" || activity.facing === "right" ? activity.facing : null,
    roam: Math.max(0, Math.min(8, Number.isFinite(Number(activity.roam)) ? Number(activity.roam) : 2)),
    kind,
    stationary: !!activity.stationary || kind !== YARD_ACTIVITY_KINDS.active,
    visualAnchor: activity.visualAnchor && typeof activity.visualAnchor === "object"
      ? {
          x: Math.max(20, Math.min(80, Number.isFinite(Number(activity.visualAnchor.x)) ? Number(activity.visualAnchor.x) : 50)),
          y: Math.max(42, Math.min(96, Number.isFinite(Number(activity.visualAnchor.y)) ? Number(activity.visualAnchor.y) : 88)),
        }
      : null,
  };
}

export function getYardGoodieCapacity(goodie = {}) {
  const fallback = goodie.size === "large" ? 2 : 1;
  const capacity = Math.floor(Number(goodie.capacity ?? fallback));
  return Math.max(1, Math.min(6, Number.isFinite(capacity) ? capacity : fallback));
}

export function getYardConditionProfile(goodie = {}, condition = "new") {
  const globalProfile = YARD_CONDITION_VARIANTS[condition] || YARD_CONDITION_VARIANTS.new;
  const localProfile = goodie.conditionVariants?.[condition] || {};
  return {
    ...globalProfile,
    ...localProfile,
    attraction: Math.max(0.05, Math.min(2, Number(localProfile.attraction ?? globalProfile.attraction ?? 1))),
    activities: Array.isArray(localProfile.activities)
      ? localProfile.activities
      : Array.isArray(globalProfile.activities)
        ? globalProfile.activities
        : [],
  };
}

export function getYardGoodieActivities(goodie = {}, condition = "new") {
  const activities = activityListForGoodie(goodie).map(normalizeActivity);
  const profile = getYardConditionProfile(goodie, condition);
  const preferred = new Set((profile.activities || []).map(String));
  if (!preferred.size) return activities;
  const preferredActivities = activities.filter((activity) => preferred.has(activity.id) || preferred.has(activity.pose));
  return preferredActivities.length ? preferredActivities : activities;
}

export const YARD_GOODIES = {
  yarn_mouse: {
    id: "yarn_mouse",
    name: "Yarn Mouse",
    desc: "A quick little chase toy.",
    size: "small",
    tags: ["toy", "play"],
    cost: { treats: 0, shinyTreats: 0 },
    fixCost: { treats: 20, shinyTreats: 0 },
    durability: 7,
    assetKey: "goodies.yarnMouse",
    wornAssetKey: "goodies.yarnMouseWorn",
    visualSize: { width: 64, height: 54 },
    capacity: 1,
    anchor: { x: 0, y: -7 },
    layer: "front",
    activities: [
      { id: "chase", pose: "pounce", x: 0, y: -9, layer: "front", roam: 5 },
      { id: "sniff", pose: "sniff", x: 7, y: -4, layer: "front", roam: 2 },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  sun_cushion: {
    id: "sun_cushion",
    name: "Sun Cushion",
    desc: "A warm pillow for sleepy guests.",
    size: "small",
    tags: ["nap", "warm"],
    surfaceTypes: ["lie"],
    blocksMovement: false,
    cost: { treats: 0, shinyTreats: 0 },
    fixCost: { treats: 24, shinyTreats: 0 },
    durability: 8,
    assetKey: "goodies.sunCushion",
    wornAssetKey: "goodies.sunCushionWorn",
    visualSize: { width: 92, height: 72 },
    capacity: 1,
    anchor: { x: 0, y: -8 },
    layer: "front",
    activities: [
      { id: "nap", pose: "nap", kind: "lie", x: 0, y: -8, layer: "front", roam: 0, visualAnchor: { x: 50, y: 62 } },
      { id: "stretch", pose: "stretch", kind: "lie", x: 6, y: -5, layer: "front", roam: 0, visualAnchor: { x: 50, y: 64 } },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  cardboard_cottage: {
    id: "cardboard_cottage",
    name: "Cardboard Cottage",
    desc: "A big hideout with windows for dramatic peeking.",
    size: "large",
    tags: ["hideout", "cozy"],
    cost: { treats: 260, shinyTreats: 0 },
    fixCost: { treats: 70, shinyTreats: 0 },
    durability: 10,
    assetKey: "goodies.cardboardCottage",
    wornAssetKey: "goodies.cardboardCottageWorn",
    visualSize: { width: 168, height: 132 },
    capacity: 2,
    anchor: { x: 0, y: -9 },
    layer: "front",
    activities: [
      { id: "window-peek", pose: "peek", kind: "stationary", x: -12, y: -14, layer: "back", facing: "right", roam: 0, visualAnchor: { x: 72, y: 72 } },
      { id: "door-lounge", pose: "rest", kind: "stationary", x: 13, y: -5, layer: "front", facing: "left", roam: 0, visualAnchor: { x: 28, y: 86 } },
      { id: "sniff", pose: "sniff", x: -4, y: -2, layer: "front", roam: 2 },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  fountain_bowl: {
    id: "fountain_bowl",
    name: "Fountain Bowl",
    desc: "Cool water and slow ripples.",
    size: "large",
    tags: ["water", "calm"],
    cost: { treats: 420, shinyTreats: 0 },
    fixCost: { treats: 90, shinyTreats: 0 },
    durability: 12,
    assetKey: "goodies.fountainBowl",
    wornAssetKey: "goodies.fountainBowlWorn",
    visualSize: { width: 152, height: 122 },
    capacity: 2,
    anchor: { x: 0, y: -8 },
    layer: "front",
    activities: [
      { id: "soak-left", pose: "soak", kind: "stationary", x: -12, y: -6, layer: "front", facing: "right", roam: 0, visualAnchor: { x: 48, y: 78 } },
      { id: "watch-right", pose: "watch", kind: "stationary", x: 13, y: -13, layer: "back", facing: "left", roam: 0, visualAnchor: { x: 50, y: 82 } },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  cozy_chair: {
    id: "cozy_chair",
    name: "Cozy Chair",
    desc: "A sturdy seat for pets that like height.",
    size: "large",
    tags: ["nap", "tall"],
    surfaceTypes: ["lie"],
    blocksMovement: false,
    cost: { treats: 180, shinyTreats: 0 },
    fixCost: { treats: 45, shinyTreats: 0 },
    durability: 9,
    assetKey: "goodies.cozyChair",
    wornAssetKey: "goodies.cozyChairWorn",
    visualSize: { width: 128, height: 132 },
    capacity: 1,
    anchor: { x: 1, y: -16 },
    layer: "front",
    activities: [
      { id: "perch", pose: "sit", kind: "stationary", x: 1, y: -16, layer: "front", roam: 0, visualAnchor: { x: 50, y: 76 } },
      { id: "rest", pose: "rest", kind: "lie", x: 0, y: -12, layer: "front", roam: 0, visualAnchor: { x: 50, y: 64 } },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  snack_table: {
    id: "snack_table",
    name: "Snack Table",
    desc: "A low table with room for curious paws.",
    size: "small",
    tags: ["food", "curious"],
    cost: { treats: 160, shinyTreats: 0 },
    fixCost: { treats: 40, shinyTreats: 0 },
    durability: 9,
    assetKey: "goodies.snackTable",
    wornAssetKey: "goodies.snackTableWorn",
    visualSize: { width: 96, height: 74 },
    capacity: 1,
    anchor: { x: 0, y: -8 },
    layer: "front",
    activities: [
      { id: "nibble", pose: "nibble", x: -2, y: -7, layer: "front", roam: 2 },
      { id: "sniff", pose: "sniff", x: 7, y: -5, layer: "front", roam: 2 },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  leaf_pot: {
    id: "leaf_pot",
    name: "Leaf Pot",
    desc: "Soft greenery and a secret sniffing spot.",
    size: "small",
    tags: ["fresh", "curious"],
    cost: { treats: 140, shinyTreats: 0 },
    fixCost: { treats: 35, shinyTreats: 0 },
    durability: 8,
    assetKey: "goodies.leafPot",
    wornAssetKey: "goodies.leafPotWorn",
    visualSize: { width: 74, height: 96 },
    capacity: 1,
    anchor: { x: 0, y: -10 },
    layer: "front",
    activities: [
      { id: "sniff", pose: "sniff", x: -2, y: -9, layer: "front", roam: 2 },
      { id: "peek", pose: "peek", kind: "stationary", x: 6, y: -13, layer: "back", roam: 0, visualAnchor: { x: 36, y: 76 } },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  moss_rug: {
    id: "moss_rug",
    name: "Moss Rug",
    desc: "A soft patch for stretching out.",
    size: "large",
    tags: ["nap", "fresh"],
    surfaceTypes: ["lie"],
    blocksMovement: false,
    cost: { treats: 220, shinyTreats: 0 },
    fixCost: { treats: 55, shinyTreats: 0 },
    durability: 10,
    assetKey: "goodies.mossRug",
    wornAssetKey: "goodies.mossRugWorn",
    visualSize: { width: 156, height: 88 },
    capacity: 2,
    anchor: { x: 0, y: -5 },
    layer: "front",
    activities: [
      { id: "roll-left", pose: "roll", kind: "lie", x: -12, y: -5, layer: "front", facing: "right", roam: 0, visualAnchor: { x: 68, y: 64 } },
      { id: "stretch-right", pose: "stretch", kind: "lie", x: 12, y: -6, layer: "front", facing: "left", roam: 0, visualAnchor: { x: 32, y: 64 } },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  cloud_bed: {
    id: "cloud_bed",
    name: "Cloud Bed",
    desc: "A premium nap spot with a soft rim.",
    size: "large",
    tags: ["nap", "premium"],
    surfaceTypes: ["lie"],
    blocksMovement: false,
    cost: { treats: 0, shinyTreats: 5 },
    fixCost: { treats: 0, shinyTreats: 1 },
    durability: 12,
    assetKey: "goodies.cloudBed",
    wornAssetKey: "goodies.cloudBedWorn",
    visualSize: { width: 150, height: 108 },
    capacity: 2,
    anchor: { x: 0, y: -10 },
    layer: "front",
    activities: [
      { id: "nap-left", pose: "nap", kind: "lie", x: -10, y: -9, layer: "front", facing: "right", roam: 0, visualAnchor: { x: 68, y: 62 } },
      { id: "rest-right", pose: "rest", kind: "lie", x: 11, y: -11, layer: "front", facing: "left", roam: 0, visualAnchor: { x: 32, y: 62 } },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  moon_lamp: {
    id: "moon_lamp",
    name: "Moon Lamp",
    desc: "A small night light for rare quiet visits.",
    size: "small",
    tags: ["night", "warm"],
    cost: { treats: 360, shinyTreats: 3 },
    fixCost: { treats: 80, shinyTreats: 1 },
    durability: 11,
    assetKey: "goodies.moonLamp",
    wornAssetKey: "goodies.moonLampWorn",
    visualSize: { width: 72, height: 106 },
    capacity: 1,
    anchor: { x: 0, y: -12 },
    layer: "back",
    activities: [
      { id: "watch", pose: "watch", kind: "stationary", x: -3, y: -13, layer: "back", roam: 0, visualAnchor: { x: 56, y: 78 } },
      { id: "glow", pose: "glow", x: 4, y: -13, layer: "front", roam: 1 },
      { id: "peek", pose: "peek", kind: "stationary", x: 7, y: -9, layer: "front", roam: 0, visualAnchor: { x: 34, y: 78 } },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
  book_nook: {
    id: "book_nook",
    name: "Book Nook",
    desc: "A shelf corner for thoughtful visitors.",
    size: "large",
    tags: ["quiet", "curious"],
    cost: { treats: 340, shinyTreats: 0 },
    fixCost: { treats: 75, shinyTreats: 0 },
    durability: 11,
    assetKey: "goodies.bookNook",
    wornAssetKey: "goodies.bookNookWorn",
    visualSize: { width: 140, height: 122 },
    capacity: 2,
    anchor: { x: 0, y: -11 },
    layer: "front",
    activities: [
      { id: "quiet-left", pose: "sit", kind: "stationary", x: -11, y: -11, layer: "front", facing: "right", roam: 0, visualAnchor: { x: 70, y: 78 } },
      { id: "peek-right", pose: "peek", kind: "stationary", x: 12, y: -15, layer: "back", facing: "left", roam: 0, visualAnchor: { x: 30, y: 72 } },
    ],
    conditionVariants: YARD_CONDITION_VARIANTS,
  },
};

export const LEGACY_ROOM_GOODIE_MAP = {
  deco_chair: "cozy_chair",
  deco_table: "snack_table",
  deco_plant: "leaf_pot",
  deco_rug: "moss_rug",
  deco_bed: "cloud_bed",
  deco_lamp: "moon_lamp",
  deco_bookshelf: "book_nook",
};

export const YARD_VISITORS = {
  mika_cat: {
    id: "mika_cat",
    name: "Mika",
    species: "cat",
    rarity: "common",
    personality: "brisk",
    tags: ["toy", "play", "simple"],
    baseWeight: 18,
    gift: { treats: [8, 16], shinyChance: 0.02 },
    memento: { id: "mika_bell", name: "Tiny Bell", threshold: 4 },
    poses: ["pounce", "sit", "nap"],
    stationaryPoses: ["nap"],
    assetKey: "visitors.mikaCat",
  },
  pebble_pup: {
    id: "pebble_pup",
    name: "Pebble",
    species: "dog",
    rarity: "common",
    personality: "loyal",
    tags: ["play", "fresh", "food"],
    baseWeight: 14,
    gift: { treats: [9, 18], shinyChance: 0.02 },
    memento: { id: "pebble_tag", name: "Worn Name Tag", threshold: 4 },
    poses: ["sniff", "roll", "sit"],
    stationaryPoses: ["roll"],
    assetKey: "visitors.pebblePup",
  },
  mochi_bunny: {
    id: "mochi_bunny",
    name: "Mochi",
    species: "bunny",
    rarity: "common",
    personality: "soft",
    tags: ["nap", "sweet", "warm"],
    baseWeight: 16,
    gift: { treats: [8, 17], shinyChance: 0.025 },
    memento: { id: "mochi_ribbon", name: "Soft Ribbon", threshold: 4 },
    poses: ["nap", "nibble", "stretch"],
    stationaryPoses: ["nap"],
    assetKey: "visitors.mochiBunny",
  },
  pip_hamster: {
    id: "pip_hamster",
    name: "Pip",
    species: "hamster",
    rarity: "uncommon",
    personality: "busy",
    tags: ["food", "curious", "sweet"],
    baseWeight: 9,
    gift: { treats: [12, 24], shinyChance: 0.04 },
    memento: { id: "pip_seed", name: "Polished Seed", threshold: 3 },
    poses: ["nibble", "peek", "sit"],
    stationaryPoses: ["peek"],
    assetKey: "visitors.pipHamster",
  },
  willow_fox: {
    id: "willow_fox",
    name: "Willow",
    species: "fox",
    rarity: "uncommon",
    personality: "watchful",
    tags: ["quiet", "night", "warm"],
    baseWeight: 7,
    gift: { treats: [14, 26], shinyChance: 0.05 },
    memento: { id: "willow_leaf", name: "Silver Leaf", threshold: 3 },
    poses: ["listen", "curl", "peek"],
    stationaryPoses: ["curl", "peek"],
    assetKey: "visitors.willowFox",
  },
  basil_turtle: {
    id: "basil_turtle",
    name: "Basil",
    species: "turtle",
    rarity: "uncommon",
    personality: "patient",
    tags: ["water", "calm", "fresh"],
    baseWeight: 7,
    gift: { treats: [15, 28], shinyChance: 0.05 },
    memento: { id: "basil_pebble", name: "Smooth Pebble", threshold: 3 },
    poses: ["soak", "watch", "rest"],
    stationaryPoses: ["rest", "soak", "watch"],
    assetKey: "visitors.basilTurtle",
  },
  starlit_fox: {
    id: "starlit_fox",
    name: "Starlit",
    species: "fox",
    rarity: "rare",
    personality: "mysterious",
    tags: ["night", "premium", "warm"],
    baseWeight: 3,
    requires: { goodieId: "moon_lamp", foodId: "bonito_bowl" },
    gift: { treats: [32, 58], shinyChance: 0.35 },
    memento: { id: "starlit_charm", name: "Moonlit Charm", threshold: 1 },
    poses: ["glow", "curl", "watch"],
    stationaryPoses: ["curl", "watch"],
    assetKey: "visitors.starlitFox",
  },
  sage_turtle: {
    id: "sage_turtle",
    name: "Sage",
    species: "turtle",
    rarity: "rare",
    personality: "ancient",
    tags: ["water", "premium", "calm"],
    baseWeight: 3,
    requires: { goodieId: "fountain_bowl", foodId: "berry_plate" },
    gift: { treats: [28, 52], shinyChance: 0.28 },
    memento: { id: "sage_shell_chip", name: "Shell Chip", threshold: 1 },
    poses: ["soak", "rest", "watch"],
    stationaryPoses: ["rest", "soak", "watch"],
    assetKey: "visitors.sageTurtle",
  },
};

export const YARD_REMODELS = {
  meadow: {
    id: "meadow",
    name: "Morning Meadow",
    desc: "Warm grass, soft light, and a low fence.",
    cost: { treats: 0, shinyTreats: 0 },
    starterOwned: true,
    assetKey: "remodels.meadow",
    themeClass: "yard-remodel-meadow",
  },
  tea_house: {
    id: "tea_house",
    name: "Tea House",
    desc: "Paper doors, polished wood, and quiet shade.",
    cost: { treats: 720, shinyTreats: 0 },
    starterOwned: false,
    shopOrder: 1,
    assetKey: "remodels.teaHouse",
    themeClass: "yard-remodel-tea-house",
  },
  moon_garden: {
    id: "moon_garden",
    name: "Moon Garden",
    desc: "Night flowers and a still blue glow.",
    cost: { treats: 900, shinyTreats: 6 },
    starterOwned: true,
    assetKey: "remodels.moonGarden",
    themeClass: "yard-remodel-moon-garden",
  },
};

export const YARD_SLOT_LAYOUTS = {
  1: [
    { id: "small-1", size: "small", x: 18, y: 62 },
    { id: "small-2", size: "small", x: 42, y: 44 },
    { id: "small-3", size: "small", x: 72, y: 58 },
    { id: "large-1", size: "large", x: 28, y: 76 },
    { id: "large-2", size: "large", x: 64, y: 78 },
  ],
  2: [
    { id: "small-1", size: "small", x: 12, y: 58 },
    { id: "small-2", size: "small", x: 32, y: 42 },
    { id: "small-3", size: "small", x: 54, y: 48 },
    { id: "small-4", size: "small", x: 78, y: 58 },
    { id: "small-5", size: "small", x: 20, y: 82 },
    { id: "small-6", size: "small", x: 84, y: 82 },
    { id: "large-1", size: "large", x: 28, y: 72 },
    { id: "large-2", size: "large", x: 62, y: 74 },
    { id: "large-3", size: "large", x: 44, y: 86 },
    { id: "large-4", size: "large", x: 72, y: 34 },
  ],
};

export const YARD_EXPANSIONS = {
  2: {
    level: 2,
    name: "Wide Yard",
    cost: { treats: 1200, shinyTreats: 8 },
  },
};

export const YARD_SPECIES = ["cat", "dog", "bunny", "fox", "hamster", "turtle"];

export function getYardCatalogSnapshot() {
  return {
    foods: YARD_FOODS,
    goodies: YARD_GOODIES,
    visitors: YARD_VISITORS,
    remodels: YARD_REMODELS,
    slots: YARD_SLOT_LAYOUTS,
    expansions: YARD_EXPANSIONS,
    species: YARD_SPECIES,
  };
}
