import { PLANT_TYPES, getClickXpReward, getPassiveXpRate, getPlantUnlockLevel } from '../garden-shelf-plants.js';
import { getGardenXpRequired } from '../garden-economy.js';

export const GARDEN_R2_VERSION = 1;
export const GARDEN_R2_CATALOG_REVISION = 'garden-r2-20261002';
// Reviewed rollout: only the server-owned policy enables explicit adoption.
export const GARDEN_R2_RELEASE_POLICY = Object.freeze({ enabled: true });
export const R2_GOLD_RANK_MAX = 5;
export const R2_MASTERY_MAX = 3;
export const R2_CHAPTER_MAX = 30;
export const R2_MASTERY_COSTS = Object.freeze([3, 6, 9]);
export const R2_SHELF_COSTS = Object.freeze([0, 120, 450, 1200, 2500]);
export const R2_SHELF_CHAPTERS = Object.freeze([1, 4, 10, 18, 26]);
export const R2_PAID_TAP_COOLDOWN_MS = 500;
export const R2_ONLINE_LEASE_MS = 30_000;
export const R2_SUBSTRATE_HOUR_MS = 3_600_000;
export const R2_SUBSTRATE_OFFLINE_CAP_MS = 12 * R2_SUBSTRATE_HOUR_MS;
export const R2_STUDY_REFILL_MS = 12 * R2_SUBSTRATE_HOUR_MS;
export const R2_GOLD_DENOMINATOR = 6_000_000_000;
export const R2_XP_DENOMINATOR = 100_000_000;

const prices = [25, 40, 60, 85, 120, 165, 220, 290, 375, 480, 610, 765, 945, 1150];
const ids = Object.keys(PLANT_TYPES);
export const R2_PLANTS = Object.freeze(Object.fromEntries(ids.map((id, index) => [id, Object.freeze({
  id, unlockChapter: getPlantUnlockLevel(id), buyGold: prices[index],
  upgradeGold: Object.freeze([.5, .75, 1, 1.25].map(ratio => Math.ceil(prices[index] * ratio))),
  baseMilliGoldPerMinute: 2400 + 40 * index,
  growthPhaseMs: Object.freeze([.2, .3, .5].map(ratio => Math.round((10 + 2 * index) * 60_000 * ratio))),
})])));

export const R2_RESEARCH = Object.freeze([
  ['care_1', 'care', 1, 10, 150, 6, null], ['care_2', 'care', 2, 18, 300, 9, 'care_1'], ['care_3', 'care', 3, 26, 600, 12, 'care_2'],
  ['idle_1', 'idle', 1, 10, 150, 6, null], ['idle_2', 'idle', 2, 18, 300, 9, 'idle_1'], ['idle_3', 'idle', 3, 26, 600, 12, 'idle_2'],
  ['collection_1', 'collection', 1, 10, 150, 6, null], ['collection_2', 'collection', 2, 18, 300, 9, 'collection_1'], ['collection_3', 'collection', 3, 26, 600, 12, 'collection_2'],
].map(([id, branch, tier, chapter, gold, substrate, prerequisite]) => Object.freeze({ id, branch, tier, chapter, gold, substrate, prerequisite })));
export const R2_PROJECTS = Object.freeze([
  { id: 'tea_shelf', types: ['lavender', 'basil', 'rosemary'], gold: 350, substrate: 6, durationMs: 6 * R2_SUBSTRATE_HOUR_MS },
  { id: 'tropical_corner', types: ['monstera', 'pothos', 'fern'], gold: 600, substrate: 9, durationMs: 8 * R2_SUBSTRATE_HOUR_MS },
  { id: 'miniature_garden', types: ['succulent', 'bonsai', 'moon_cactus'], gold: 600, substrate: 9, durationMs: 8 * R2_SUBSTRATE_HOUR_MS },
  { id: 'flower_collection', types: ['daisy', 'lavender', 'orchid'], gold: 450, substrate: 6, durationMs: 6 * R2_SUBSTRATE_HOUR_MS },
  { id: 'living_display', types: ['venus_flytrap', 'string_of_pearls', 'strawberry'], gold: 750, substrate: 12, durationMs: 12 * R2_SUBSTRATE_HOUR_MS },
].map(project => Object.freeze({ ...project, types: Object.freeze(project.types) })));

function validRateInputs(type, rank, mastery) {
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(R2_PLANTS, type) || !Number.isInteger(rank) || rank < 1 || rank > R2_GOLD_RANK_MAX || !Number.isInteger(mastery) || mastery < 0 || mastery > R2_MASTERY_MAX) throw new RangeError('Invalid Garden R2 rate inputs');
}
export function r2GoldRate(type, rank = 1, mastery = 0) {
  validRateInputs(type, rank, mastery);
  // Base is divisible by 40; every result is exact integer milli-gold/minute.
  return R2_PLANTS[type].baseMilliGoldPerMinute * (20 + 5 * (rank - 1) + 2 * mastery) / 20;
}
export function r2PassiveXpRate(type, rank = 1, mastery = 0) {
  validRateInputs(type, rank, mastery);
  return Math.round(getPassiveXpRate(PLANT_TYPES[type].basePassiveXp, rank + mastery) * 1000);
}
export function r2TapXp(type, rank = 1, mastery = 0, care3 = false) {
  validRateInputs(type, rank, mastery);
  return Math.floor(getClickXpReward(PLANT_TYPES[type].baseXp, rank + mastery) * (care3 ? 1.1 : 1));
}
export function r2XpRequired(chapter) { return chapter < 30 ? getGardenXpRequired(chapter) : 0; }
export function r2ChapterReward(chapter) { return 20 + 5 * Math.min(chapter, 20); }
export function r2Effects(researchIds = []) {
  const known = new Set(researchIds);
  return {
    substrateCapacity: known.has('collection_2') ? 90 : 60,
    studyCapacity: known.has('collection_3') ? 2 : 1,
    growthTapMs: known.has('care_1') ? 3000 : 2000,
    waterRatioPercent: known.has('care_2') ? 12 : 8,
    careXpBonus: known.has('care_3'),
    offlineGoldPercent: known.has('idle_1') ? 50 : 35,
    offlineXpPercent: known.has('idle_1') ? 35 : 25,
    offlineCapMs: (known.has('idle_3') ? 12 : known.has('idle_2') ? 8 : 6) * R2_SUBSTRATE_HOUR_MS,
  };
}
export function mapLegacyGardenLevel(level) {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError('Invalid legacy Garden level');
  const mastery = level >= 30 ? 3 : level >= 20 ? 2 : level >= 10 ? 1 : 0;
  let discount = 0;
  if (!mastery && level > 5) discount = Math.floor(3 * (level - 5) / 5);
  if (mastery === 1) discount = Math.floor(6 * (level - 10) / 10);
  if (mastery === 2) discount = Math.floor(9 * (level - 20) / 10);
  return { goldRank: Math.min(5, level), mastery, discount };
}
