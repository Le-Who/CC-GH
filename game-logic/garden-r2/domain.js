import { PLANT_TYPES, getUnlockedPlantIds } from '../garden-shelf-plants.js';
import { getGardenXpRequired, getGardenLevelReward } from '../garden-economy.js';
import { getGardenAccounting } from '../garden-transactions.js';
import { buildGardenQuestSections, recordGardenDailyProgress, normalizeGardenDailyQuestState, isGardenDailyQuestId } from '../garden-quests.js';
import {
  GARDEN_R2_VERSION, GARDEN_R2_CATALOG_REVISION, R2_PLANTS, R2_RESEARCH, R2_PROJECTS,
  R2_MASTERY_COSTS, R2_SHELF_COSTS, R2_SHELF_CHAPTERS, R2_PAID_TAP_COOLDOWN_MS,
  R2_ONLINE_LEASE_MS, R2_SUBSTRATE_HOUR_MS, R2_SUBSTRATE_OFFLINE_CAP_MS, R2_STUDY_REFILL_MS,
  R2_GOLD_DENOMINATOR, R2_XP_DENOMINATOR, r2GoldRate, r2PassiveXpRate, r2TapXp,
  r2XpRequired, r2ChapterReward, r2Effects, mapLegacyGardenLevel,
} from './catalog.js';

export class GardenR2Error extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
export function requireR2(test, code, status = 409) { if (!test) throw new GardenR2Error(code, status); }
const clone = value => structuredClone(value);
const int = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const utcDay = now => new Date(now).toISOString().slice(0, 10);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const safeKey = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !['__proto__', 'constructor', 'prototype'].includes(value);
// Leave room for every deadline/lease while remaining within JavaScript Date's range.
const timestamp = value => int(value, 0, 8_640_000_000_000_000 - R2_SUBSTRATE_OFFLINE_CAP_MS - R2_ONLINE_LEASE_MS);
const uniqueKnown = (values, catalog) => Array.isArray(values) && new Set(values).size === values.length && values.every(id => typeof id === 'string' && catalog.some(item => item.id === id));
export function validateGardenR2Player(player) {
  requireR2(plain(player) && plain(player._gardenProgression), 'GARDEN_R2_STATE_INVALID');
  const r = player._gardenProgression;
  requireR2(r.version === GARDEN_R2_VERSION && r.catalogRevision === GARDEN_R2_CATALOG_REVISION, 'GARDEN_R2_VERSION_UNSUPPORTED');
  requireR2(player.schemaVersion === 11, 'GARDEN_R2_SCHEMA_UNSUPPORTED');
  requireR2(typeof player.id === 'string' && player.id.length > 0 && r.accountId === player.id, 'GARDEN_R2_ACCOUNT_MISMATCH');
  requireR2(plain(player.resources) && int(player.resources.gold) && int(r.revision) && int(r.chapter, 1, 30) && int(r.xp), 'GARDEN_R2_STATE_INVALID');
  requireR2(r.chapter === 30 ? r.xp === 0 && r.xpRemainder === 0 : r.xp < r2XpRequired(r.chapter), 'GARDEN_R2_STATE_INVALID');
  requireR2(plain(r.plants) && plain(r.masteryByType) && plain(r.masteryDiscounts) && plain(r.streams), 'GARDEN_R2_STATE_INVALID');
  requireR2(uniqueKnown(r.researchIds, R2_RESEARCH) && uniqueKnown(r.projectsCompleted, R2_PROJECTS), 'GARDEN_R2_STATE_INVALID');
  for (const id of r.researchIds) {
    const node = R2_RESEARCH.find(node => node.id === id);
    requireR2(r.chapter >= node.chapter && (!node.prerequisite || r.researchIds.includes(node.prerequisite)), 'GARDEN_R2_STATE_INVALID');
  }
  const effects = r2Effects(r.researchIds);
  requireR2(int(r.substrate, 0, effects.substrateCapacity) && int(r.materialProgressMs, 0, R2_SUBSTRATE_HOUR_MS - 1) && typeof r.introClaimed === 'boolean', 'GARDEN_R2_STATE_INVALID');
  requireR2(r.chapter >= 7 || (!r.introClaimed && r.substrate === 0 && r.materialProgressMs === 0), 'GARDEN_R2_STATE_INVALID');
  requireR2(int(r.goldRemainder, 0, R2_GOLD_DENOMINATOR - 1) && int(r.xpRemainder, 0, R2_XP_DENOMINATOR - 1) && int(r.earnedGold), 'GARDEN_R2_STATE_INVALID');
  requireR2(timestamp(r.lastSettledAt) && timestamp(r.onlineUntil) && r.onlineUntil <= r.lastSettledAt + R2_ONLINE_LEASE_MS, 'GARDEN_R2_CLOCK_INVALID');
  requireR2(r.lastTendAt === null || (timestamp(r.lastTendAt) && r.lastTendAt <= r.lastSettledAt), 'GARDEN_R2_CLOCK_INVALID');
  requireR2(plain(player.garden) && Array.isArray(player.garden.plants) && player.garden.plants.length <= 48 && int(player.garden.shelvesUnlocked, 1, 5) && int(player.garden.totalGoldEarned), 'GARDEN_R2_STATE_INVALID');
  const ids = new Set();
  for (const plant of player.garden.plants) {
    requireR2(plain(plant) && safeKey(plant.id) && !ids.has(plant.id) && typeof plant.type === 'string' && owns(R2_PLANTS, plant.type), 'GARDEN_R2_PLANT_INVALID');
    ids.add(plant.id);
    const profile = r.plants[plant.id];
    requireR2(owns(r.plants, plant.id) && plain(profile) && int(profile.goldRank, 1, 5) && int(profile.spentGold) && int(profile.legacyResaleGold), 'GARDEN_R2_PLANT_INVALID');
    requireR2(profile.legacyLevel === null || int(profile.legacyLevel, 1, 1_000_000), 'GARDEN_R2_PLANT_INVALID');
    const firstRank = profile.legacyLevel === null ? 1 : Math.min(5, profile.legacyLevel);
    const purchaseGold = profile.legacyLevel === null ? R2_PLANTS[plant.type].buyGold : 0;
    const expectedSpent = purchaseGold + R2_PLANTS[plant.type].upgradeGold.slice(firstRank - 1, profile.goldRank - 1).reduce((sum, cost) => sum + cost, 0);
    requireR2(profile.goldRank >= firstRank && profile.spentGold === expectedSpent && profile.legacyResaleGold === (profile.legacyLevel === null ? 0 : Math.floor(PLANT_TYPES[plant.type].baseCost / 2)), 'GARDEN_R2_PLANT_INVALID');
    requireR2(profile.lastWateredAt === undefined || (timestamp(profile.lastWateredAt) && profile.lastWateredAt <= r.lastSettledAt), 'GARDEN_R2_CLOCK_INVALID');
    requireR2(int(plant.phase, 0, 3) && int(plant.phaseProgress) && (plant.phase === 3 ? plant.phaseProgress === 0 : plant.phaseProgress < R2_PLANTS[plant.type].growthPhaseMs[plant.phase]), 'GARDEN_R2_PLANT_INVALID');
    requireR2(int(plant.shelfIndex, -1, 4) && int(plant.spotIndex, -1, 2), 'GARDEN_R2_PLANT_INVALID');
  }
  requireR2(Object.keys(r.plants).length === ids.size, 'GARDEN_R2_PLANT_INVALID');
  for (const [type, mastery] of Object.entries(r.masteryByType)) requireR2(owns(R2_PLANTS, type) && int(mastery, 0, 3), 'GARDEN_R2_STATE_INVALID');
  for (const [type, discount] of Object.entries(r.masteryDiscounts)) {
    const mastery = r.masteryByType[type];
    requireR2(owns(R2_PLANTS, type) && int(mastery, 0, 2) && plain(discount) && discount.target === mastery + 1 && int(discount.amount, 1, R2_MASTERY_COSTS[mastery] - 1), 'GARDEN_R2_DISCOUNT_INVALID');
  }
  requireR2(plain(r.study) && typeof r.study.unlocked === 'boolean' && r.study.unlocked === (r.chapter >= 7) && int(r.study.cards, 0, effects.studyCapacity) && int(r.study.taps, 0, 5) && int(r.study.waters, 0, 1), 'GARDEN_R2_STATE_INVALID');
  requireR2(r.study.nextAt === null || timestamp(r.study.nextAt), 'GARDEN_R2_CLOCK_INVALID');
  requireR2(r.study.unlocked ? (r.study.cards === effects.studyCapacity ? r.study.nextAt === null : r.study.nextAt !== null) : r.study.cards === 0 && r.study.nextAt === null, 'GARDEN_R2_STATE_INVALID');
  requireR2(r.study.cards > 0 || (r.study.taps === 0 && r.study.waters === 0), 'GARDEN_R2_STATE_INVALID');
  requireR2(plain(r.dailyCare) && typeof r.dailyCare.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dailyCare.date) && int(r.dailyCare.taps), 'GARDEN_R2_STATE_INVALID');
  requireR2(r.projectsCompleted.length === 0 || r.researchIds.includes('collection_1'), 'GARDEN_R2_STATE_INVALID');
  if (r.activeProject !== null) {
    requireR2(plain(r.activeProject), 'GARDEN_R2_STATE_INVALID');
    const project = R2_PROJECTS.find(project => project.id === r.activeProject.projectId);
    requireR2(project && r.researchIds.includes('collection_1') && !r.projectsCompleted.includes(project.id), 'GARDEN_R2_STATE_INVALID');
    requireR2(timestamp(r.activeProject.startedAt) && r.activeProject.startedAt <= r.lastSettledAt && timestamp(r.activeProject.finishAt) && r.activeProject.finishAt === r.activeProject.startedAt + project.durationMs, 'GARDEN_R2_CLOCK_INVALID');
    requireR2(Array.isArray(r.activeProject.plantIds) && r.activeProject.plantIds.length === project.types.length && new Set(r.activeProject.plantIds).size === project.types.length && r.activeProject.plantIds.every(safeKey), 'GARDEN_R2_STATE_INVALID');
  }
  requireR2(Object.keys(r.streams).length <= 128, 'GARDEN_R2_STATE_INVALID');
  for (const [streamId, receipt] of Object.entries(r.streams)) {
    requireR2(/^[a-zA-Z0-9_-]{16,64}$/.test(streamId) && safeKey(streamId) && plain(receipt) && int(receipt.sequence, 1) && typeof receipt.hash === 'string' && /^[a-f0-9]{64}$/.test(receipt.hash) && receipt.clientActionId === `garden-r2:${streamId}:${receipt.sequence}`, 'GARDEN_R2_STATE_INVALID');
    requireR2(timestamp(receipt.appliedAt) && receipt.appliedAt <= r.lastSettledAt && plain(receipt.result) && int(receipt.result.revision, 1, r.revision), 'GARDEN_R2_STATE_INVALID');
  }
  const migration = r.migration;
  requireR2(plain(migration) && migration.id === `garden-r2:${player.id}:1` && timestamp(migration.at) && migration.at <= r.lastSettledAt && int(migration.legacyRevision) && int(migration.acknowledgedTotal) && int(migration.goldBefore), 'GARDEN_R2_MIGRATION_INVALID');
  requireR2(plain(migration.sourceGarden) && plain(migration.sourceAccounting) && int(migration.legacyGardenLevel, 1, 1_000_000) && migration.sourceGarden.level === migration.legacyGardenLevel, 'GARDEN_R2_MIGRATION_INVALID');
  requireR2(Array.isArray(migration.sourceGarden.plants) && migration.sourceGarden.plants.every(plain) && int(migration.sourceGarden.xp, 0, getGardenXpRequired(migration.legacyGardenLevel)) && [undefined, false, true].includes(migration.sourceGarden.levelReady), 'GARDEN_R2_MIGRATION_INVALID');
  requireR2(migration.sourceAccounting.version === 1 && typeof migration.sourceAccounting.active === 'boolean' && migration.sourceAccounting.revision === migration.legacyRevision && migration.sourceAccounting.creditedTotal === migration.acknowledgedTotal && plain(migration.sourceAccounting.streams), 'GARDEN_R2_MIGRATION_INVALID');
  for (const plant of player.garden.plants) {
    const profile = r.plants[plant.id];
    if (profile.legacyLevel !== null) requireR2(migration.sourceGarden.plants.some(source => source.id === plant.id && source.type === plant.type && source.level === profile.legacyLevel), 'GARDEN_R2_MIGRATION_INVALID');
  }
  requireR2([undefined, 1, 2].includes(migration.sourceGarden.economyVersion) && player.garden.economyVersion === migration.sourceGarden.economyVersion, 'GARDEN_R2_MIGRATION_INVALID');
  requireR2(int(migration.sourceGarden.totalGoldEarned) && int(migration.sourceGarden.totalGoldEarned + r.earnedGold) && player.garden.totalGoldEarned === migration.sourceGarden.totalGoldEarned + r.earnedGold, 'GARDEN_R2_STATE_INVALID');
  const reward = migration.pendingLegacyReward;
  const ready = migration.sourceGarden.levelReady === true || migration.sourceGarden.xp >= getGardenXpRequired(migration.legacyGardenLevel);
  requireR2(ready ? plain(reward) && reward.level === migration.legacyGardenLevel && reward.gold === getGardenLevelReward(reward.level) && typeof reward.claimed === 'boolean' : reward === null, 'GARDEN_R2_MIGRATION_INVALID');
  return r;
}

export function migrateGardenR2(player, { now, legacyRevision, acknowledgedTotal } = {}) {
  requireR2(timestamp(now) && plain(player) && typeof player.id === 'string' && player.id.length > 0, 'GARDEN_R2_MIGRATION_INVALID', 400);
  if (owns(player, '_gardenProgression')) { validateGardenR2Player(player); return clone(player); }
  requireR2(player.schemaVersion === 11 && int(player.resources?.gold), 'GARDEN_R2_SCHEMA_UNSUPPORTED');
  const old = player.garden;
  requireR2(plain(old) && [undefined, 1, 2].includes(old.economyVersion) && Array.isArray(old.plants) && old.plants.length <= 48, 'GARDEN_R2_LEGACY_INVALID');
  if (owns(player, 'gardenAccounting')) {
    const meta = player.gardenAccounting;
    requireR2(plain(meta) && meta.version === 1 && typeof meta.active === 'boolean' && int(meta.revision) && int(meta.creditedTotal) && plain(meta.streams), 'GARDEN_R2_LEGACY_ACCOUNTING_INVALID');
  }
  const accounting = getGardenAccounting(player);
  requireR2(legacyRevision === accounting.revision && acknowledgedTotal === accounting.creditedTotal, 'GARDEN_R2_LEGACY_REVISION_CONFLICT');
  requireR2(int(old.totalGoldEarned) && old.totalGoldEarned === accounting.creditedTotal, 'GARDEN_R2_UNSETTLED_EARNINGS');
  requireR2(int(old.level, 1, 1_000_000) && int(old.xp, 0, getGardenXpRequired(old.level)) && int(old.shelvesUnlocked, 1, 5) && [undefined, false, true].includes(old.levelReady), 'GARDEN_R2_LEGACY_INVALID');
  const next = clone(player), profiles = {}, highest = {}, ids = new Set();
  for (const p of next.garden.plants) {
    requireR2(plain(p) && safeKey(p.id) && !ids.has(p.id), 'GARDEN_R2_LEGACY_INVALID');
    requireR2(typeof p.type === 'string' && owns(R2_PLANTS, p.type) && int(p.level, 1, 1_000_000) && int(p.phase, 0, 3) && int(p.phaseProgress), 'GARDEN_R2_LEGACY_INVALID');
    requireR2(Number.isInteger(p.shelfIndex) && p.shelfIndex >= -1 && p.shelfIndex < 5 && Number.isInteger(p.spotIndex) && p.spotIndex >= -1 && p.spotIndex < 3, 'GARDEN_R2_LEGACY_INVALID');
    requireR2([p.lastTapped, p.lastWatered].every(value => value === undefined || int(value)), 'GARDEN_R2_LEGACY_INVALID');
    ids.add(p.id); const mapped = mapLegacyGardenLevel(p.level);
    profiles[p.id] = { goldRank: mapped.goldRank, legacyLevel: p.level, spentGold: 0, legacyResaleGold: Math.floor(PLANT_TYPES[p.type].baseCost / 2) };
    // Legacy care timestamps came from client clocks. Keep the originals in Garden
    // and its archive, but never let a future device clock lock server care forever.
    if (p.lastWatered > 0) profiles[p.id].lastWateredAt = Math.min(p.lastWatered, now);
    highest[p.type] = Math.max(highest[p.type] || 1, p.level);
    // Stage/ownership remain. Preserve the fractional progress through that stage.
    if (p.phase < 3) {
      const oldDuration = [120_000, 480_000, 1_800_000][p.phase];
      p.phaseProgress = Math.min(R2_PLANTS[p.type].growthPhaseMs[p.phase] - 1, Math.floor(Math.min(1, p.phaseProgress / oldDuration) * R2_PLANTS[p.type].growthPhaseMs[p.phase]));
    } else p.phaseProgress = 0;
  }
  const masteryByType = {}, masteryDiscounts = {};
  for (const [type, level] of Object.entries(highest)) {
    const mapped = mapLegacyGardenLevel(level); masteryByType[type] = mapped.mastery;
    if (mapped.discount) masteryDiscounts[type] = { target: mapped.mastery + 1, amount: mapped.discount };
  }
  const chapter = Math.min(30, old.level);
  const pendingLegacyReward = old.levelReady || old.xp >= getGardenXpRequired(old.level) ? { level: old.level, gold: getGardenLevelReward(old.level), claimed: false } : null;
  next._gardenProgression = {
    version: GARDEN_R2_VERSION, catalogRevision: GARDEN_R2_CATALOG_REVISION, accountId: player.id, revision: 0,
    chapter, xp: chapter === 30 ? 0 : Math.min(old.xp, getGardenXpRequired(chapter)),
    substrate: 0, introClaimed: false, materialProgressMs: 0,
    researchIds: [], masteryByType, masteryDiscounts, plants: profiles,
    projectsCompleted: [], activeProject: null,
    study: { cards: chapter >= 7 ? 1 : 0, taps: 0, waters: 0, nextAt: null, unlocked: chapter >= 7 },
    lastSettledAt: now, onlineUntil: now, goldRemainder: 0, xpRemainder: 0, lastTendAt: old.plants.some(p => p.lastTapped > 0) ? Math.min(now, Math.max(...old.plants.map(p => p.lastTapped || 0))) : null,
    earnedGold: 0, dailyCare: { date: utcDay(now), taps: 0 }, streams: {},
    migration: { id: `garden-r2:${player.id}:1`, at: now, legacyRevision: accounting.revision, acknowledgedTotal, goldBefore: player.resources.gold,
      legacyGardenLevel: old.level, sourceGarden: clone(old), sourceAccounting: clone(accounting), pendingLegacyReward },
  };
  // A ready old level is settled by its own one-time claim, never by a repeated R2 XP grant.
  if (pendingLegacyReward && chapter < 30) {
    next._gardenProgression.chapter = chapter + 1;
    next._gardenProgression.xp = 0;
    next._gardenProgression.study.unlocked = chapter + 1 >= 7;
    next._gardenProgression.study.cards = chapter + 1 >= 7 ? 1 : 0;
  }
  requireR2(next.resources.gold === player.resources.gold, 'GARDEN_R2_MIGRATION_BALANCE_CHANGED');
  validateGardenR2Player(next);
  return next;
}

function record(player, deltas, now) { player.garden.dailyQuests = recordGardenDailyProgress(player.garden.dailyQuests, deltas, now); }
function addGold(player, amount, now, { earned = true, daily = true } = {}) {
  requireR2(int(amount) && int(player.resources.gold + amount), 'GARDEN_R2_AMOUNT_OVERFLOW');
  player.resources.gold += amount;
  if (earned && amount) {
    const r = player._gardenProgression;
    requireR2(int(r.earnedGold + amount) && int(player.garden.totalGoldEarned + amount), 'GARDEN_R2_AMOUNT_OVERFLOW');
    r.earnedGold += amount; player.garden.totalGoldEarned += amount;
    if (player.gardenAccounting) player.gardenAccounting.creditedTotal = player.garden.totalGoldEarned;
    if (player.stats) { requireR2(int((player.stats.totalGoldEarned || 0) + amount), 'GARDEN_R2_AMOUNT_OVERFLOW'); player.stats.totalGoldEarned = (player.stats.totalGoldEarned || 0) + amount; }
    if (daily) record(player, { goldEarned: amount }, now);
  }
}
function spend(player, gold, substrate = 0) {
  requireR2(int(gold) && int(substrate), 'GARDEN_R2_AMOUNT_INVALID');
  requireR2(player.resources.gold >= gold, 'GARDEN_R2_INSUFFICIENT_GOLD');
  requireR2(player._gardenProgression.substrate >= substrate, 'GARDEN_R2_INSUFFICIENT_SUBSTRATE');
  player.resources.gold -= gold; player._gardenProgression.substrate -= substrate;
}
function addXp(player, amount, now) {
  requireR2(int(amount), 'GARDEN_R2_AMOUNT_INVALID');
  const r = player._gardenProgression;
  if (r.chapter >= 30) return;
  r.xp += amount; record(player, { xpEarned: amount }, now);
  while (r.chapter < 30 && r.xp >= r2XpRequired(r.chapter)) {
    const required = r2XpRequired(r.chapter), reward = r2ChapterReward(r.chapter);
    r.xp -= required; r.chapter++; addGold(player, reward, now, { daily: false }); record(player, { levelUps: 1 }, now);
    if (r.chapter >= 7 && !r.study.unlocked) r.study = { cards: 1, taps: 0, waters: 0, nextAt: null, unlocked: true };
  }
  if (r.chapter === 30) { r.xp = 0; r.xpRemainder = 0; }
}
export function activeGardenR2Plants(player) {
  const spots = new Set();
  return player.garden.plants.filter(p => {
    if (!Number.isInteger(p.shelfIndex) || p.shelfIndex < 0 || p.shelfIndex >= player.garden.shelvesUnlocked || !Number.isInteger(p.spotIndex) || p.spotIndex < 0 || p.spotIndex >= 3) return false;
    const spot = `${p.shelfIndex}:${p.spotIndex}`; if (spots.has(spot)) return false; spots.add(spot); return true;
  });
}
function grow(plant, duration) {
  const stages = R2_PLANTS[plant.type].growthPhaseMs;
  while (duration > 0 && plant.phase < 3) {
    const remaining = stages[plant.phase] - plant.phaseProgress;
    if (duration < remaining) { plant.phaseProgress += duration; return; }
    duration -= remaining; plant.phase++; plant.phaseProgress = 0;
  }
}
function timeToMaturity(p) { return p.phase >= 3 ? Infinity : R2_PLANTS[p.type].growthPhaseMs.slice(p.phase).reduce((sum, duration) => sum + duration, 0) - p.phaseProgress; }
function refillStudy(r, now) {
  const cap = r2Effects(r.researchIds).studyCapacity;
  if (!r.study.unlocked || r.study.nextAt === null || now < r.study.nextAt) return;
  const gained = Math.min(cap - r.study.cards, 1 + Math.floor((now - r.study.nextAt) / R2_STUDY_REFILL_MS));
  r.study.cards += gained;
  r.study.nextAt = r.study.cards >= cap ? null : r.study.nextAt + gained * R2_STUDY_REFILL_MS;
}

/** In-place on a private transaction clone only. Offline windows start at the lease expiry.
 * They do not restart on reads/failed actions. This makes partitioned settlement invariant. */
export function settleGardenR2(player, now) {
  const r = validateGardenR2Player(player);
  requireR2(timestamp(now) && now >= r.lastSettledAt, 'GARDEN_R2_CLOCK_INVALID');
  const effects = r2Effects(r.researchIds), active = activeGardenR2Plants(player);
  let cursor = r.lastSettledAt, iterations = 0;
  while (cursor < now) {
    requireR2(++iterations <= 150, 'GARDEN_R2_SETTLEMENT_LIMIT');
    const online = cursor < r.onlineUntil;
    const goldPercent = online ? 100 : cursor < r.onlineUntil + effects.offlineCapMs ? effects.offlineGoldPercent : 0;
    const xpPercent = online ? 100 : cursor < r.onlineUntil + effects.offlineCapMs ? effects.offlineXpPercent : 0;
    const materialEligible = r.chapter >= 7 && (online || cursor < r.onlineUntil + R2_SUBSTRATE_OFFLINE_CAP_MS);
    const mature = active.filter(p => p.phase === 3);
    const goldRate = mature.reduce((sum, p) => sum + r2GoldRate(p.type, r.plants[p.id].goldRank, r.masteryByType[p.type] || 0), 0);
    const xpRate = r.chapter >= 30 ? 0 : mature.reduce((sum, p) => sum + r2PassiveXpRate(p.type, r.plants[p.id].goldRank, r.masteryByType[p.type] || 0), 0);
    let end = now;
    if (goldRate * goldPercent > 0 || xpRate * xpPercent > 0) end = Math.min(end, (Math.floor(cursor / 86_400_000) + 1) * 86_400_000);
    for (const boundary of [r.onlineUntil, r.onlineUntil + effects.offlineCapMs, r.onlineUntil + R2_SUBSTRATE_OFFLINE_CAP_MS]) if (boundary > cursor) end = Math.min(end, boundary);
    for (const p of active) if (p.phase < 3) end = Math.min(end, cursor + timeToMaturity(p));
    // Split exactly when XP unlocks a chapter/material source, rather than crediting it backwards.
    if (r.chapter < 30 && xpRate * xpPercent > 0) {
      const needed = (r2XpRequired(r.chapter) - r.xp) * R2_XP_DENOMINATOR - r.xpRemainder;
      if (needed > 0) end = Math.min(end, cursor + Math.max(1, Math.ceil(needed / (xpRate * xpPercent))));
    }
    const dt = end - cursor;
    requireR2(dt > 0 && int(dt), 'GARDEN_R2_CLOCK_INVALID');
    const goldNumerator = r.goldRemainder + goldRate * dt * goldPercent;
    const xpNumerator = r.xpRemainder + xpRate * dt * xpPercent;
    requireR2(int(goldNumerator) && int(xpNumerator), 'GARDEN_R2_AMOUNT_OVERFLOW');
    r.goldRemainder = goldNumerator % R2_GOLD_DENOMINATOR;
    r.xpRemainder = xpNumerator % R2_XP_DENOMINATOR;
    // Accrual belongs to [cursor, end), including intervals ending at midnight.
    addGold(player, Math.floor(goldNumerator / R2_GOLD_DENOMINATOR), end - 1);
    if (materialEligible && mature.length && r.substrate < effects.substrateCapacity) {
      const materialMs = r.materialProgressMs + dt;
      const units = Math.min(effects.substrateCapacity - r.substrate, Math.floor(materialMs / R2_SUBSTRATE_HOUR_MS));
      r.substrate += units;
      r.materialProgressMs = r.substrate === effects.substrateCapacity ? 0 : materialMs % R2_SUBSTRATE_HOUR_MS;
    }
    addXp(player, Math.floor(xpNumerator / R2_XP_DENOMINATOR), end - 1);
    for (const p of active) grow(p, dt);
    cursor = end;
  }
  r.lastSettledAt = now;
  player.garden.dailyQuests = normalizeGardenDailyQuestState(player.garden.dailyQuests, now);
  refillStudy(r, now);
  if (r.dailyCare.date !== utcDay(now)) r.dailyCare = { date: utcDay(now), taps: 0 };
}

export function gardenR2Quests(player, now) {
  const r = player._gardenProgression;
  return buildGardenQuestSections({ ...player.garden, level: r.chapter }, now).map(section => ({ ...section, quests: section.quests.map(q => {
    if (!q.templateKey || !/^(upgrade|plant)_[12]$/.test(q.templateKey)) return q;
    const count = q.templateKey.endsWith('_2') ? 24 : 12;
    const taps = r.dailyCare.date === utcDay(now) ? r.dailyCare.taps : 0;
    return { ...q, careAlternative: { current: Math.min(taps, count), target: count }, complete: q.complete || taps >= count };
  }) }));
}
function profileFor(player, id) {
  const p = player.garden.plants.find(p => p.id === id);
  requireR2(p && owns(player._gardenProgression.plants, id), 'GARDEN_R2_PLANT_MISSING', 400);
  return [p, player._gardenProgression.plants[id]];
}
function placeable(player, shelf, spot, excluded = null) {
  requireR2(int(shelf, 0, player.garden.shelvesUnlocked - 1) && int(spot, 0, 2), 'GARDEN_R2_SPOT_INVALID', 400);
  requireR2(!player.garden.plants.some(p => p.id !== excluded && p.shelfIndex === shelf && p.spotIndex === spot), 'GARDEN_R2_SPOT_OCCUPIED');
}
const commandFields = {
  resume: [], heartbeat: [], claimIntro: [], claimStudy: [], claimProject: [], claimLegacyLevelReward: [],
  buyPlant: ['type', 'shelfIndex', 'spotIndex'], upgradePlant: ['plantId'], sellPlant: ['plantId'],
  tend: ['plantId'], water: ['plantId'], movePlant: ['plantId', 'shelfIndex', 'spotIndex'],
  upgradeMastery: ['type'], research: ['researchId'], startProject: ['projectId'], unlockShelf: [], claimQuest: ['questId'], rename: ['name'],
};
export function runGardenR2Command(player, command, input, { now, makePlantId } = {}) {
  requireR2(owns(commandFields, command) && input && typeof input === 'object' && !Array.isArray(input), 'GARDEN_R2_COMMAND_INVALID', 400);
  requireR2(Object.keys(input).every(key => commandFields[command].includes(key)), 'GARDEN_R2_PAYLOAD_INVALID', 400);
  settleGardenR2(player, now);
  const r = player._gardenProgression, effects = r2Effects(r.researchIds);
  const studyStarted = r.study.cards > 0;
  let result = {};
  if (command === 'buyPlant') {
    requireR2(typeof input.type === 'string' && owns(R2_PLANTS, input.type), 'GARDEN_R2_PLANT_TYPE', 400);
    const def = R2_PLANTS[input.type];
    requireR2(getUnlockedPlantIds(Math.max(r.chapter, r.migration.legacyGardenLevel)).includes(input.type), 'GARDEN_R2_PLANT_LOCKED');
    placeable(player, input.shelfIndex, input.spotIndex);
    requireR2(player.garden.plants.length < 48, 'GARDEN_R2_PLANT_LIMIT');
    const id = makePlantId(); requireR2(safeKey(id) && !owns(r.plants, id), 'GARDEN_R2_PLANT_ID_INVALID');
    spend(player, def.buyGold);
    player.garden.plants.push({ id, type: def.id, level: 1, shelfIndex: input.shelfIndex, spotIndex: input.spotIndex, phase: 0, phaseProgress: 0, lastTapped: 0 });
    r.plants[id] = { goldRank: 1, spentGold: def.buyGold, legacyResaleGold: 0, legacyLevel: null };
    record(player, { plantsBought: 1 }, now); result = { plantId: id, costGold: def.buyGold };
  } else if (command === 'upgradePlant') {
    const [p, profile] = profileFor(player, input.plantId);
    requireR2(p.phase === 3, 'GARDEN_R2_PLANT_NOT_MATURE'); requireR2(profile.goldRank < 5, 'GARDEN_R2_GOLD_RANK_COMPLETE');
    const cost = R2_PLANTS[p.type].upgradeGold[profile.goldRank - 1]; spend(player, cost); profile.spentGold += cost; profile.goldRank++;
    record(player, { upgrades: 1 }, now); result = { plantId: p.id, goldRank: profile.goldRank, costGold: cost };
  } else if (command === 'sellPlant') {
    const [p, profile] = profileFor(player, input.plantId), refund = profile.legacyResaleGold + Math.floor(profile.spentGold / 2);
    addGold(player, refund, now, { earned: false }); player.garden.plants = player.garden.plants.filter(plant => plant.id !== p.id); delete r.plants[p.id]; result = { plantId: p.id, refundGold: refund };
  } else if (command === 'movePlant') {
    const [p] = profileFor(player, input.plantId);
    if (input.shelfIndex === -1 && input.spotIndex === -1) { p.shelfIndex = -1; p.spotIndex = -1; }
    else { placeable(player, input.shelfIndex, input.spotIndex, p.id); p.shelfIndex = input.shelfIndex; p.spotIndex = input.spotIndex; }
  } else if (command === 'tend') {
    const [p, profile] = profileFor(player, input.plantId);
    requireR2(activeGardenR2Plants(player).some(plant => plant.id === p.id), 'GARDEN_R2_PLANT_NOT_PLACED');
    requireR2(r.lastTendAt === null || now - r.lastTendAt >= R2_PAID_TAP_COOLDOWN_MS, 'GARDEN_R2_TAP_COOLDOWN');
    r.lastTendAt = now; p.lastTapped = now; record(player, { taps: 1 }, now);
    if (p.phase < 3) { grow(p, effects.growthTapMs); result = { growthMs: effects.growthTapMs }; }
    else {
      const xp = r2TapXp(p.type, profile.goldRank, r.masteryByType[p.type] || 0, effects.careXpBonus);
      addGold(player, 1, now); addXp(player, xp, now); r.dailyCare.taps++;
      if (studyStarted) r.study.taps = Math.min(5, r.study.taps + 1);
      result = { goldReward: 1, xpReward: xp };
    }
  } else if (command === 'water') {
    const [p, profile] = profileFor(player, input.plantId);
    requireR2(activeGardenR2Plants(player).some(plant => plant.id === p.id), 'GARDEN_R2_PLANT_NOT_PLACED');
    const cooldown = p.phase === 3 ? 600_000 : 480_000;
    requireR2(profile.lastWateredAt == null || now - profile.lastWateredAt >= cooldown, 'GARDEN_R2_WATER_COOLDOWN');
    profile.lastWateredAt = now; p.lastWatered = now; record(player, { waters: 1 }, now);
    if (p.phase < 3) grow(p, Math.floor(R2_PLANTS[p.type].growthPhaseMs[p.phase] * effects.waterRatioPercent / 100));
    if (studyStarted) r.study.waters = Math.min(1, r.study.waters + 1);
  } else if (command === 'unlockShelf') {
    const current = player.garden.shelvesUnlocked;
    requireR2(current < 5, 'GARDEN_R2_SHELVES_COMPLETE'); requireR2(r.chapter >= R2_SHELF_CHAPTERS[current], 'GARDEN_R2_CHAPTER_REQUIRED');
    spend(player, R2_SHELF_COSTS[current]); player.garden.shelvesUnlocked++;
  } else if (command === 'research') {
    const node = R2_RESEARCH.find(node => node.id === input.researchId);
    requireR2(node, 'GARDEN_R2_RESEARCH_UNKNOWN', 400); requireR2(!r.researchIds.includes(node.id), 'GARDEN_R2_RESEARCH_COMPLETE');
    requireR2(r.chapter >= node.chapter && (!node.prerequisite || r.researchIds.includes(node.prerequisite)), 'GARDEN_R2_RESEARCH_LOCKED');
    spend(player, node.gold, node.substrate); r.researchIds.push(node.id);
    if (node.id === 'collection_3' && r.study.unlocked && r.study.nextAt === null && r.study.cards < 2) r.study.nextAt = now + R2_STUDY_REFILL_MS;
  } else if (command === 'upgradeMastery') {
    requireR2(typeof input.type === 'string' && owns(R2_PLANTS, input.type), 'GARDEN_R2_PLANT_TYPE', 400);
    const previous = r.masteryByType[input.type] || 0, target = previous + 1;
    requireR2(previous < 3, 'GARDEN_R2_MASTERY_COMPLETE');
    requireR2(r.chapter >= [10, 20, 30][previous] && R2_RESEARCH.some(node => node.tier >= target && r.researchIds.includes(node.id)), 'GARDEN_R2_MASTERY_LOCKED');
    requireR2(player.garden.plants.some(p => p.type === input.type && p.phase === 3 && r.plants[p.id].goldRank === 5), 'GARDEN_R2_MASTER_PLANT_REQUIRED');
    requireR2(target < 3 || r.projectsCompleted.length > 0, 'GARDEN_R2_PROJECT_REQUIRED');
    const discount = r.masteryDiscounts[input.type], applied = discount?.target === target ? discount.amount : 0;
    const cost = R2_MASTERY_COSTS[previous] - applied; requireR2(int(cost, 1), 'GARDEN_R2_DISCOUNT_INVALID');
    spend(player, 0, cost); r.masteryByType[input.type] = target; delete r.masteryDiscounts[input.type]; result = { type: input.type, mastery: target, costSubstrate: cost };
  } else if (command === 'startProject') {
    const project = R2_PROJECTS.find(project => project.id === input.projectId);
    requireR2(project, 'GARDEN_R2_PROJECT_UNKNOWN', 400);
    requireR2(r.researchIds.includes('collection_1') && !r.activeProject && !r.projectsCompleted.includes(project.id), 'GARDEN_R2_PROJECT_LOCKED');
    const mature = activeGardenR2Plants(player).filter(p => p.phase === 3);
    requireR2(project.types.every(type => mature.some(p => p.type === type)) && project.types.some(type => (r.masteryByType[type] || 0) >= 1), 'GARDEN_R2_PROJECT_PLANTS_REQUIRED');
    spend(player, project.gold, project.substrate);
    r.activeProject = { projectId: project.id, startedAt: now, finishAt: now + project.durationMs, plantIds: project.types.map(type => mature.find(p => p.type === type).id) };
  } else if (command === 'claimProject') {
    requireR2(r.activeProject && now >= r.activeProject.finishAt && !r.projectsCompleted.includes(r.activeProject.projectId), 'GARDEN_R2_PROJECT_NOT_READY');
    result = { projectId: r.activeProject.projectId }; r.projectsCompleted.push(r.activeProject.projectId); r.activeProject = null;
  } else if (command === 'claimIntro') {
    requireR2(r.chapter >= 7 && !r.introClaimed, 'GARDEN_R2_INTRO_UNAVAILABLE');
    requireR2(r.substrate + 3 <= effects.substrateCapacity, 'GARDEN_R2_SUBSTRATE_FULL'); r.substrate += 3; r.introClaimed = true;
  } else if (command === 'claimStudy') {
    requireR2(r.study.cards > 0 && r.study.taps >= 5 && r.study.waters >= 1, 'GARDEN_R2_STUDY_NOT_READY');
    requireR2(r.substrate + 3 <= effects.substrateCapacity, 'GARDEN_R2_SUBSTRATE_FULL');
    r.substrate += 3; r.study.cards--; r.study.taps = 0; r.study.waters = 0; if (r.study.nextAt === null) r.study.nextAt = now + R2_STUDY_REFILL_MS;
  } else if (command === 'claimLegacyLevelReward') {
    const reward = r.migration.pendingLegacyReward;
    requireR2(reward && !reward.claimed, 'GARDEN_R2_LEGACY_REWARD_UNAVAILABLE');
    addGold(player, reward.gold, now, { daily: false }); reward.claimed = true; result = { goldReward: reward.gold };
  } else if (command === 'claimQuest') {
    const quest = gardenR2Quests(player, now).flatMap(section => section.quests).find(q => q.id === input.questId);
    requireR2(quest && quest.unlocked && quest.complete && !quest.claimed, 'GARDEN_R2_QUEST_NOT_READY');
    if (isGardenDailyQuestId(quest.id)) { player.garden.dailyQuests = normalizeGardenDailyQuestState(player.garden.dailyQuests, now); player.garden.dailyQuests.claimed.push(quest.id); }
    else { player.garden.claimedQuests ||= []; player.garden.claimedQuests.push(quest.id); }
    addGold(player, quest.reward, now, { daily: false }); result = { questId: quest.id, goldReward: quest.reward };
  } else if (command === 'rename') {
    requireR2(typeof input.name === 'string', 'GARDEN_R2_NAME_INVALID', 400); player.garden.name = input.name.replace(/\s+/g, ' ').trim().slice(0, 22);
  }
  // A successful foreground intent starts one lease. Reads and rejected actions never renew it.
  r.onlineUntil = now + R2_ONLINE_LEASE_MS;
  validateGardenR2Player(player);
  return result;
}

export function publicGardenR2(player, now = player._gardenProgression?.lastSettledAt) {
  const r = validateGardenR2Player(player), effects = r2Effects(r.researchIds);
  const placed = activeGardenR2Plants(player), activeIds = new Set(placed.map(p => p.id));
  const active = placed.filter(p => p.phase === 3);
  return {
    version: r.version, catalogRevision: r.catalogRevision, revision: r.revision,
    chapter: r.chapter, xp: r.xp, xpRequired: r2XpRequired(r.chapter), chapterMax: 30,
    substrate: r.substrate, substrateCapacity: effects.substrateCapacity, introReady: r.chapter >= 7 && !r.introClaimed,
    researchIds: [...r.researchIds], masteryByType: { ...r.masteryByType },
    masteryDiscounts: Object.fromEntries(Object.entries(r.masteryDiscounts).map(([type, discount]) => [type, discount.amount])),
    study: { ...r.study, capacity: effects.studyCapacity }, projectsCompleted: [...r.projectsCompleted],
    activeProject: r.activeProject ? { projectId: r.activeProject.projectId, finishAt: r.activeProject.finishAt } : null,
    pendingLegacyRewardGold: r.migration.pendingLegacyReward?.claimed === false ? r.migration.pendingLegacyReward.gold : 0,
    effects, serverNow: now, onlineUntil: r.onlineUntil,
    goldMilliPerMinute: active.reduce((sum, p) => sum + r2GoldRate(p.type, r.plants[p.id].goldRank, r.masteryByType[p.type] || 0), 0),
    plants: player.garden.plants.map(p => {
      const profile = r.plants[p.id], mastery = r.masteryByType[p.type] || 0, rate = r2GoldRate(p.type, profile.goldRank, mastery);
      return { ...p, goldRank: profile.goldRank, mastery, rateMilliGoldPerMinute: rate,
        // UI cooldowns and project eligibility must use the same authority as commands.
        lastTapped: r.lastTendAt ?? 0, lastWatered: profile.lastWateredAt ?? 0, isActive: activeIds.has(p.id),
        nextUpgradeGold: profile.goldRank < 5 ? R2_PLANTS[p.type].upgradeGold[profile.goldRank - 1] : null,
        nextUpgradeDeltaMilliGoldPerMinute: profile.goldRank < 5 ? r2GoldRate(p.type, profile.goldRank + 1, mastery) - rate : null,
        resaleGold: profile.legacyResaleGold + Math.floor(profile.spentGold / 2) };
    }),
    quests: gardenR2Quests(player, now),
  };
}
