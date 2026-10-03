import { R2_PLANTS, R2_MASTERY_COSTS, R2_RESEARCH, R2_SHELF_CHAPTERS, r2GoldRate } from '../../../../game-logic/garden-r2/catalog.js';
// Display projection only: chapter remains the API's garden-level field.
export function r2NextUnlock(chapter) {
  const gates = [
    ...Object.values(R2_PLANTS).map(plant => ({ level: plant.unlockChapter, key: `plant.${plant.id}` })),
    ...R2_SHELF_CHAPTERS.slice(1).map(level => ({ level, key: 'garden.expand' })),
    { level: 7, key: 'r2.nextCare' },
    ...R2_RESEARCH.map(node => ({ level: node.chapter, key: 'r2.nextResearch', tier: node.tier })),
    ...[10, 20, 30].map((level, index) => ({ level, key: 'r2.nextMastery', tier: index + 1 })),
  ].filter(gate => gate.level > chapter);
  if (!gates.length) return null;
  const level = Math.min(...gates.map(gate => gate.level));
  const seen = new Set();
  return { level, items: gates.filter(gate => {
    const id = `${gate.key}:${gate.tier || ''}`;
    if (gate.level !== level || seen.has(id)) return false;
    seen.add(id); return true;
  }) };
}
export const formatR2Gold = value => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
export const formatR2Rate = milliPerMinute => new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(milliPerMinute / 1000);
export const r2IncomePerSecond = view => view.goldMilliPerMinute / 60000;
export function r2MasteryOffer(view, plant) {
  const current = view.masteryByType[plant.type] || 0;
  if (current >= 3) return null;
  const chapter = [10, 20, 30][current];
  const researched = R2_RESEARCH.some(node => node.tier >= current + 1 && view.researchIds.includes(node.id));
  const eligiblePlant = view.plants.some(p => p.type === plant.type && p.phase === 3 && p.goldRank === 5);
  return { target: current + 1, chapter, cost: R2_MASTERY_COSTS[current] - (view.masteryDiscounts[plant.type] || 0), delta: r2GoldRate(plant.type, plant.goldRank, current + 1) - r2GoldRate(plant.type, plant.goldRank, current), unlocked: view.chapter >= chapter && researched && eligiblePlant && (current < 2 || view.projectsCompleted.length > 0) };
}
export function gardenR2ViewState(garden, view, gold) {
  if (!view) return { ...garden, gold, plants: garden?.plants || [], offlineEarnings: null, offlineXp: null };
  return { ...garden, gold, level: view.chapter, xp: view.xp, xpRequired: view.xpRequired, levelReady: view.pendingLegacyRewardGold > 0, plants: view.plants.map(plant => ({ ...plant, level: plant.goldRank })), offlineEarnings: null, offlineXp: null };
}
export function gardenPlantPhaseDuration(plant, r2) { return r2 ? R2_PLANTS[plant.type].growthPhaseMs[plant.phase] : [120000, 480000, 1800000][plant.phase]; }
