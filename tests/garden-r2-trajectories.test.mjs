import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APPROVED_REFERENCE, runRuntimeTrajectories, simulateRuntimeTrajectory, compareApprovedReference, readApprovedReference } from '../scripts/garden-r2-trajectories.mjs';

const report = runRuntimeTrajectories();
const [fresh, middle, legacy] = report.cohorts;

test('actual-runtime new-player cohort matches approved chapter/species milestones and all catalogue costs/rates', () => {
  assert.equal(fresh.complete, true);
  assert.equal(fresh.visits, APPROVED_REFERENCE.sessions);
  assert.equal(fresh.elapsedDays, APPROVED_REFERENCE.elapsedDays);
  assert.equal(fresh.chapter7Day, APPROVED_REFERENCE.chapter7Day);
  assert.deepEqual(fresh.trace.map(row => row.chapter), APPROVED_REFERENCE.chapters);
  assert.deepEqual(fresh.trace.map(row => row.species), APPROVED_REFERENCE.species);
  assert.deepEqual(report.comparison.costRateDifferences, []);
  for (const field of ['chapter', 'species', 'shelves', 'mature', 'onlineGoldPerMinute']) assert.equal(fresh.final[field], APPROVED_REFERENCE.final[field]);
  // This observed runtime/model mismatch stays explicit. Do not retune constants
  // to force a one-second design approximation to equal event-based settlement.
  assert.deepEqual(report.comparison.differences, [{ milestone: 'final_gold', expected: 38576.382, actual: 38681 }]);
  assert(Math.abs(fresh.final.gold - APPROVED_REFERENCE.final.gold) / APPROVED_REFERENCE.final.gold < .01);
  assert.equal(fresh.final.gold, fresh.initialGold + fresh.earnedGold - fresh.spentGold);
  assert.equal(fresh.spentGold, 14831); assert.equal(fresh.final.substrate, 60);
  assert(fresh.finalRanks.every(plant => plant.rank >= 1 && plant.rank <= 3 && plant.mastery === 0));
});

test('middle-save cohort progresses without losing ownership, while L100 legacy remains terminal and playable', () => {
  assert.equal(middle.legacyLevel, 13); assert.equal(middle.complete, true); assert.equal(middle.visits, 11);
  assert(middle.visits <= fresh.visits); assert.equal(middle.final.species, 14); assert.equal(middle.final.onlineGoldPerMinute, 51.48);
  assert.equal(middle.initialGold, 3534); assert.equal(middle.final.gold, middle.initialGold + middle.earnedGold - middle.spentGold);
  assert.equal(legacy.legacyLevel, 100); assert.equal(legacy.complete, true); assert.equal(legacy.visits, 1);
  assert.equal(legacy.initialGold, 987654321); assert.equal(legacy.spentGold, 0); assert.equal(legacy.final.gold, legacy.initialGold + legacy.earnedGold);
  assert.equal(legacy.final.gold, 987655844); assert.equal(legacy.final.onlineGoldPerMinute, 92.368); assert.equal(legacy.final.mature, 15);
  assert(legacy.finalRanks.every(plant => plant.rank === 5 && plant.mastery === 3));
});

test('midvisit JSON reloads preserve every actual-runtime trajectory outcome', () => {
  for (const withReloads of report.cohorts) {
    const uninterrupted = simulateRuntimeTrajectory(withReloads.cohort, { reload: false });
    assert.equal(withReloads.reloads, withReloads.visits); assert.equal(uninterrupted.reloads, 0);
    assert.deepEqual({ ...withReloads, reloads: 0 }, uninterrupted);
  }
});

test('reference comparison is portable and reports changed milestones rather than masking them', () => {
  const directory = mkdtempSync(join(tmpdir(), 'garden-r2-reference-'));
  try {
    const path = join(directory, 'reference.json');
    const reference = APPROVED_REFERENCE;
    writeFileSync(path, JSON.stringify({ trajectories: [{ parameters: { visitsPerDay: 1, sessionMinutes: 10, tapsPerSecond: 1, dailyQuestGrant: 0 }, sessions: reference.sessions, chapter7Day: reference.chapter7Day,
      trace: reference.chapters.map((chapter, index) => ({ ...(index === reference.chapters.length - 1 ? reference.final : {}), chapter, species: reference.species[index] })) }],
      compare: reference.prices.map((newBuyGold, index) => ({ newBuyGold, newFirstUpgradeGold: reference.firstUpgrades[index], newGoldPerMinute: reference.baseRates[index], newFirstUpgradeDeltaPerMinute: reference.firstDeltas[index] })) }));
    const loaded = readApprovedReference(path), comparison = compareApprovedReference(fresh, loaded);
    assert.deepEqual(comparison.differences, report.comparison.differences); assert.deepEqual(comparison.costRateDifferences, []);
    const changed = compareApprovedReference({ ...fresh, visits: fresh.visits + 1 }, loaded);
    assert(changed.differences.some(row => row.milestone === 'visits_to_fourteen_species_and_chapter_30' && row.actual === 14));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
