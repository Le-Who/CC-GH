import { createGardenDailyQuestState } from "./garden-quests.js";

export const GARDEN_ECONOMY_VERSION = 2;
export const GARDEN_STARTER_GOLD = 120;
export const GARDEN_OFFLINE_CAP_MS = 6 * 60 * 60 * 1000;
export const GARDEN_OFFLINE_GOLD_RATIO = 0.35;
export const GARDEN_OFFLINE_XP_RATIO = 0.25;
export const GARDEN_TAP_REWARD_COOLDOWN_MS = 750;
export const GARDEN_MAX_LEVEL = 30;

export const GARDEN_LEVELS = [
  { level: 1, xpRequired: 90, reward: 35, unlocks: ["daisy"] },
  { level: 2, xpRequired: 125, reward: 45, unlocks: [] },
  { level: 3, xpRequired: 170, reward: 60, unlocks: [] },
  { level: 4, xpRequired: 230, reward: 85, unlocks: ["lavender"] },
  { level: 5, xpRequired: 310, reward: 110, unlocks: [] },
  { level: 6, xpRequired: 420, reward: 145, unlocks: [] },
  { level: 7, xpRequired: 560, reward: 190, unlocks: ["basil"] },
  { level: 8, xpRequired: 740, reward: 245, unlocks: [] },
  { level: 9, xpRequired: 980, reward: 315, unlocks: [] },
  { level: 10, xpRequired: 1280, reward: 405, unlocks: ["rosemary"] },
  { level: 11, xpRequired: 1660, reward: 520, unlocks: [] },
  { level: 12, xpRequired: 2140, reward: 665, unlocks: [] },
  { level: 13, xpRequired: 2740, reward: 850, unlocks: ["monstera"] },
  { level: 14, xpRequired: 3480, reward: 1080, unlocks: [] },
  { level: 15, xpRequired: 4380, reward: 1365, unlocks: [] },
  { level: 16, xpRequired: 5480, reward: 1720, unlocks: ["succulent"] },
  { level: 17, xpRequired: 6800, reward: 2160, unlocks: [] },
  { level: 18, xpRequired: 8380, reward: 2700, unlocks: [] },
  { level: 19, xpRequired: 10260, reward: 3360, unlocks: ["pothos"] },
  { level: 20, xpRequired: 12480, reward: 4160, unlocks: [] },
  { level: 21, xpRequired: 15080, reward: 5120, unlocks: [] },
  { level: 22, xpRequired: 18120, reward: 6280, unlocks: ["strawberry"] },
  { level: 23, xpRequired: 21640, reward: 7660, unlocks: ["bonsai"] },
  { level: 24, xpRequired: 25680, reward: 9300, unlocks: ["string_of_pearls"] },
  { level: 25, xpRequired: 30320, reward: 11240, unlocks: ["orchid"] },
  { level: 26, xpRequired: 35640, reward: 13520, unlocks: ["venus_flytrap"] },
  { level: 27, xpRequired: 41720, reward: 16180, unlocks: [] },
  { level: 28, xpRequired: 48640, reward: 19280, unlocks: ["moon_cactus"] },
  { level: 29, xpRequired: 56500, reward: 22880, unlocks: [] },
  { level: 30, xpRequired: 65400, reward: 27060, unlocks: ["fern"] },
];

export function getGardenLevelDefinition(level = 1) {
  const safeLevel = Math.max(1, Math.min(GARDEN_MAX_LEVEL, Math.floor(Number(level) || 1)));
  return GARDEN_LEVELS.find((entry) => entry.level === safeLevel) || GARDEN_LEVELS[0];
}

export function getGardenXpRequired(level = 1) {
  return getGardenLevelDefinition(level).xpRequired;
}

export function getGardenLevelReward(level = 1) {
  return getGardenLevelDefinition(level).reward;
}

export function createGardenStarterPlant(now = Date.now()) {
  return {
    id: `starter-daisy-${Math.max(0, Math.floor(Number(now) || 0))}`,
    type: "daisy",
    level: 1,
    shelfIndex: 0,
    spotIndex: 0,
    phase: 3,
    phaseProgress: 0,
    lastTapped: 0,
  };
}

export function createGardenEconomyState(now = Date.now(), options = {}) {
  return {
    economyVersion: GARDEN_ECONOMY_VERSION,
    name: "",
    totalGoldEarned: 0,
    level: 1,
    xp: 0,
    xpRequired: getGardenXpRequired(1),
    levelReady: false,
    shelvesUnlocked: 1,
    claimedQuests: [],
    dailyQuests: createGardenDailyQuestState(now),
    plants: options.starter ? [createGardenStarterPlant(now)] : [],
    passiveGoldBuffer: 0,
    passiveXpBuffer: 0,
    lastTick: now,
    offlineEarnings: null,
    offlineXp: null,
  };
}

export function hasLegacyGardenProgress(raw = {}) {
  if (!raw || typeof raw !== "object") return false;
  return (
    (Array.isArray(raw.plants) && raw.plants.length > 0) ||
    Number(raw.totalGoldEarned) > 0 ||
    Number(raw.level) > 1 ||
    Number(raw.xp) > 0 ||
    Number(raw.shelvesUnlocked) > 1
  );
}

export function shouldResetGardenEconomy(raw = {}) {
  if (!hasLegacyGardenProgress(raw)) return false;
  return Math.floor(Number(raw.economyVersion) || 1) !== GARDEN_ECONOMY_VERSION;
}
