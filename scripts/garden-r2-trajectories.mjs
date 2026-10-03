/** Dependency-free acceptance scenarios using the actual R2 domain, never model accrual.
 * Run: node scripts/garden-r2-trajectories.mjs [approved-reference.json]
 * The optional JSON is read-only. No services, live accounts, network, or database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGardenEconomyState, getGardenXpRequired } from '../game-logic/garden-economy.js';
import { R2_PLANTS, R2_SHELF_COSTS, R2_SHELF_CHAPTERS, r2GoldRate, r2TapXp } from '../game-logic/garden-r2/catalog.js';
import { migrateGardenR2, runGardenR2Command, settleGardenR2, validateGardenR2Player, publicGardenR2 } from '../game-logic/garden-r2/domain.js';

export const START = Date.UTC(2026, 9, 2, 12);
const DAY = 86400000;
const TYPES = Object.keys(R2_PLANTS);
const rounded = number => Number(number.toFixed(5));
// Compact, literal checkpoint evidence from the approved file. These are comparisons,
// not a second implementation of progression, gold, growth, XP, or offline formulas.
export const APPROVED_REFERENCE = Object.freeze({
  artifact: 'hub-comparison-and-trajectories.json',
  sha256: '3715843dfdb0c405b6a9d932ff30bd36f65ba3def734f8f772d9686d57b12d60',
  sessions: 13, chapter7Day: 1.0002, elapsedDays: 12.00694,
  final: { chapter: 30, species: 14, shelves: 5, mature: 13, gold: 38576.382, onlineGoldPerMinute: 51.48 },
  chapters: [6, 10, 13, 16, 19, 21, 22, 23, 24, 25, 26, 28, 30],
  species: [2, 4, 5, 6, 7, 7, 8, 9, 10, 11, 12, 13, 14],
  prices: [25, 40, 60, 85, 120, 165, 220, 290, 375, 480, 610, 765, 945, 1150],
  firstUpgrades: [13, 20, 30, 43, 60, 83, 110, 145, 188, 240, 305, 383, 473, 575],
  baseRates: [2.4, 2.44, 2.48, 2.52, 2.56, 2.6, 2.64, 2.68, 2.72, 2.76, 2.8, 2.84, 2.88, 2.92],
  firstDeltas: [.6, .61, .62, .63, .64, .65, .66, .67, .68, .69, .7, .71, .72, .73],
});

export function trajectoryFixture(cohort) {
  assert(['new', 'middle', 'legacy'].includes(cohort));
  const garden = createGardenEconomyState(START);
  const player = { id: `trajectory-${cohort}`, schemaVersion: 11, resources: { gold: cohort === 'new' ? 100 : cohort === 'middle' ? 3534 : 987654321, gachaTokens: 17 }, garden,
    stats: { totalGoldEarned: 0 }, yard: { treats: 99 }, _yardV2: { epoch: 'unchanged' }, merge: { essence: 23 }, _mergeLabFence: { epoch: 'unchanged' }, achievements: { keep: true } };
  if (cohort !== 'new') {
    garden.level = cohort === 'middle' ? 13 : 100; garden.xp = 0; garden.xpRequired = getGardenXpRequired(garden.level);
    garden.shelvesUnlocked = cohort === 'middle' ? 2 : 5;
    garden.plants = (cohort === 'middle' ? TYPES.slice(0, 5) : [...TYPES, 'fern']).map((type, index) => ({
      id: `retained-${index}`, type, level: cohort === 'legacy' ? 40 : index === 4 ? 1 : 3,
      phase: cohort === 'middle' && index === 4 ? 0 : 3, phaseProgress: 0,
      shelfIndex: Math.floor(index / 3), spotIndex: index % 3, lastTapped: 0,
    }));
  }
  return player;
}

export function simulateRuntimeTrajectory(cohort, { reload = true, maxVisits = 40 } = {}) {
  const source = trajectoryFixture(cohort);
  let player = migrateGardenR2(source, { now: START, legacyRevision: 0, acknowledgedTotal: 0 });
  assert.equal(player.resources.gold, source.resources.gold);
  for (const key of ['schemaVersion', 'yard', '_yardV2', 'merge', '_mergeLabFence', 'achievements']) assert.deepEqual(player[key], source[key]);
  assert.deepEqual(player.garden.plants, source.garden.plants);
  let serial = 0, commandCount = 0, spentGold = 0, reloads = 0, chapter7At = player._gardenProgression.chapter >= 7 ? START : null;
  const trace = [];
  const observe = now => { if (chapter7At === null && player._gardenProgression.chapter >= 7) chapter7At = now; };
  const act = (command, input, now) => {
    // Settlement precedes the command and financial conservation is checked against
    // actual server counters. The harness does not compute income or XP itself.
    settleGardenR2(player, now);
    const goldBefore = player.resources.gold, earnedBefore = player._gardenProgression.earnedGold;
    runGardenR2Command(player, command, input, { now, makePlantId: () => `bought-${++serial}` });
    spentGold += goldBefore + player._gardenProgression.earnedGold - earnedBefore - player.resources.gold;
    commandCount++; observe(now);
  };
  const priority = plant => r2TapXp(plant.type, player._gardenProgression.plants[plant.id].goldRank, player._gardenProgression.masteryByType[plant.type] || 0);
  const decisions = now => {
    const r = player._gardenProgression;
    for (const def of Object.values(R2_PLANTS)) {
      if (def.unlockChapter > r.chapter || player.garden.plants.some(plant => plant.type === def.id)) continue;
      if (player.garden.plants.length >= player.garden.shelvesUnlocked * 3) {
        const current = player.garden.shelvesUnlocked;
        if (current >= 5 || r.chapter < R2_SHELF_CHAPTERS[current] || player.resources.gold < R2_SHELF_COSTS[current]) break;
        act('unlockShelf', {}, now);
      }
      if (player.resources.gold < def.buyGold) break;
      const index = player.garden.plants.length;
      act('buyPlant', { type: def.id, shelfIndex: Math.floor(index / 3), spotIndex: index % 3 }, now);
    }
    for (const plant of player.garden.plants.filter(plant => plant.phase === 3).sort((a, b) => priority(b) - priority(a))) {
      const profile = r.plants[plant.id];
      while (profile.goldRank < 3 && player.resources.gold >= R2_PLANTS[plant.type].upgradeGold[profile.goldRank - 1]) act('upgradePlant', { plantId: plant.id }, now);
    }
  };
  for (let visit = 0; visit < maxVisits; visit++) {
    const visitStart = START + visit * DAY;
    act('resume', {}, visitStart);
    for (let second = 0; second < 600; second++) {
      const now = visitStart + second * 1000;
      decisions(now);
      const growing = player.garden.plants.filter(plant => plant.phase < 3).sort((a, b) => priority(b) - priority(a));
      const mature = player.garden.plants.filter(plant => plant.phase === 3).sort((a, b) => priority(b) - priority(a));
      const target = growing[0] || mature[0];
      if (target) act('tend', { plantId: target.id }, now);
      settleGardenR2(player, now + 1000); observe(now + 1000);
      if (reload && second === 299) {
        const before = publicGardenR2(player); player = JSON.parse(JSON.stringify(player));
        validateGardenR2Player(player); assert.deepEqual(publicGardenR2(player), before); reloads++;
      }
    }
    const end = visitStart + 600000; decisions(end);
    const view = publicGardenR2(player);
    assert.equal(player.resources.gold, source.resources.gold + player._gardenProgression.earnedGold - spentGold);
    assert.equal(player.schemaVersion, 11); assert.equal(player.garden.economyVersion, source.garden.economyVersion);
    trace.push({ visit: visit + 1, elapsedDays: rounded((end - START) / DAY), chapter: view.chapter, gold: player.resources.gold,
      species: new Set(player.garden.plants.map(plant => plant.type)).size, shelves: player.garden.shelvesUnlocked,
      mature: view.plants.filter(plant => plant.phase === 3 && plant.isActive).length, substrate: view.substrate,
      onlineGoldPerMinute: view.goldMilliPerMinute / 1000 });
    if (view.chapter === 30 && trace.at(-1).species === 14) break;
  }
  const view = publicGardenR2(player), final = trace.at(-1);
  for (const key of ['yard', '_yardV2', 'merge', '_mergeLabFence', 'achievements']) assert.deepEqual(player[key], source[key]);
  return { cohort, complete: final.chapter === 30 && final.species === 14, visits: trace.length, elapsedDays: final.elapsedDays,
    chapter7Day: chapter7At === null ? null : rounded((chapter7At - START) / DAY), initialGold: source.resources.gold,
    final, spentGold, earnedGold: player._gardenProgression.earnedGold, commandCount, reloads, trace,
    finalRanks: view.plants.map(plant => ({ type: plant.type, rank: plant.goldRank, mastery: plant.mastery })),
    legacyLevel: player._gardenProgression.migration.legacyGardenLevel,
  };
}

export function compareApprovedReference(result, reference = APPROVED_REFERENCE) {
  const differences = [];
  const compare = (milestone, expected, actual) => { if (expected !== actual) differences.push({ milestone, expected, actual }); };
  compare('visits_to_fourteen_species_and_chapter_30', reference.sessions, result.visits);
  compare('chapter_7_day', reference.chapter7Day, result.chapter7Day);
  for (const key of ['chapter', 'species', 'shelves', 'mature', 'gold', 'onlineGoldPerMinute']) compare(`final_${key}`, reference.final[key], result.final[key]);
  for (let index = 0; index < Math.min(result.trace.length, reference.chapters.length); index++) {
    compare(`visit_${index + 1}_chapter`, reference.chapters[index], result.trace[index].chapter);
    compare(`visit_${index + 1}_species`, reference.species[index], result.trace[index].species);
  }
  const costRateDifferences = [];
  TYPES.forEach((type, index) => {
    for (const [metric, expected, actual] of [
      ['buyGold', reference.prices[index], R2_PLANTS[type].buyGold], ['firstUpgradeGold', reference.firstUpgrades[index], R2_PLANTS[type].upgradeGold[0]],
      ['baseGoldPerMinute', reference.baseRates[index], r2GoldRate(type) / 1000], ['firstDeltaGoldPerMinute', reference.firstDeltas[index], (r2GoldRate(type, 2) - r2GoldRate(type)) / 1000],
    ]) if (expected !== actual) costRateDifferences.push({ type, metric, expected, actual });
  });
  return { referenceArtifact: reference.artifact, referenceSha256: reference.sha256, differences, costRateDifferences,
    explanation: 'Actual domain uses integer gold/XP, first-window capped offline maturity, server leases and exact event boundaries. The approved review model uses one-second active integration, fractional gold/XP and the tail of the offline gap. Differences are reported, not used to retune approved constants.' };
}

export function readApprovedReference(path) {
  const source = readFileSync(path, 'utf8'), document = JSON.parse(source);
  const trajectory = document.trajectories.find(row => row.parameters.visitsPerDay === 1 && row.parameters.sessionMinutes === 10 && row.parameters.tapsPerSecond === 1 && row.parameters.dailyQuestGrant === 0);
  assert(trajectory, 'Reference must contain the approved daily 10-minute, one-tap scenario');
  return { artifact: basename(path), sha256: createHash('sha256').update(source).digest('hex'), sessions: trajectory.sessions, chapter7Day: trajectory.chapter7Day, final: trajectory.trace.at(-1),
    chapters: trajectory.trace.map(row => row.chapter), species: trajectory.trace.map(row => row.species),
    prices: document.compare.map(row => row.newBuyGold), firstUpgrades: document.compare.map(row => row.newFirstUpgradeGold),
    baseRates: document.compare.map(row => row.newGoldPerMinute), firstDeltas: document.compare.map(row => row.newFirstUpgradeDeltaPerMinute) };
}

export function runRuntimeTrajectories(reference = APPROVED_REFERENCE) {
  const cohorts = ['new', 'middle', 'legacy'].map(cohort => simulateRuntimeTrajectory(cohort));
  return { scope: 'Deterministic local runtime acceptance; not player telemetry or retention forecasting',
    policy: 'One 10-minute visit per day, one tend per second; buy one of each unlocked species, expand shelves as needed, upgrade mature plants to R3. No story/daily grants, research/mastery purchases or project rewards.',
    middleFixture: 'Chapter 13, XP 0, 3534 gold, two shelves, first four species mature R3 and immature Monstera R1. Design trace omits XP, so this is an explicit fixture, not an exact reconstruction.',
    legacyFixture: 'Garden L100, all fourteen species plus another Fern at legacy plant L40, five shelves and 987654321 preserved gold; all map to R5/M3. First visit verifies the terminal save remains playable.',
    comparison: compareApprovedReference(cohorts[0], reference), cohorts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(runRuntimeTrajectories(process.argv[2] ? readApprovedReference(process.argv[2]) : APPROVED_REFERENCE), null, 2));
}
