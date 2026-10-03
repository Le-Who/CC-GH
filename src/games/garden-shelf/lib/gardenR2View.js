import { R2_PLANTS, R2_MASTERY_COSTS, R2_RESEARCH, r2GoldRate } from '../../../../game-logic/garden-r2/catalog.js';
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
