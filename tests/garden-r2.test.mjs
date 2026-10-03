import test from 'node:test';
import assert from 'node:assert/strict';
import { createGardenEconomyState, getGardenXpRequired } from '../game-logic/garden-economy.js';
import { PLANT_TYPES, getProduction } from '../game-logic/garden-shelf-plants.js';
import { GARDEN_R2_CATALOG_REVISION, GARDEN_R2_RELEASE_POLICY, R2_PLANTS, R2_PROJECTS, r2GoldRate, mapLegacyGardenLevel } from '../game-logic/garden-r2/catalog.js';
import { migrateGardenR2, settleGardenR2, runGardenR2Command, publicGardenR2, validateGardenR2Player } from '../game-logic/garden-r2/domain.js';
import { executeGardenR2, reconcileGardenR2, gardenR2Hash, gardenR2BlocksLegacy } from '../game-logic/garden-r2/service.js';
const NOW = Date.UTC(2026, 9, 2, 12);
const STREAM = 'garden_r2_test_stream_0001';
function fixture({ level = 1, plantLevel = 1, type = 'daisy', gold = 10000, xp = 0, phase = 3 } = {}) {
  const garden = createGardenEconomyState(NOW);
  Object.assign(garden, { level, xp, xpRequired: getGardenXpRequired(level), plants: [{ id: 'plant-one', type, level: plantLevel, phase, phaseProgress: 0, shelfIndex: 0, spotIndex: 0, lastTapped: 0 }] });
  return { id: 'account-A', schemaVersion: 11, resources: { gold, gachaTokens: 17, energy: { current: 20 } }, garden, stats: { totalGoldEarned: 777 },
    yard: { currencies: { treats: 99, shinyTreats: 2 }, inventory: ['keep'] }, _yardV2: { nonce: 'do-not-change' },
    merge: { schemaVersion: 3, alchemyEssence: 321 }, _mergeLabFence: { epoch: 'preserve' }, achievements: { old: true }, unknownFutureField: { deep: [1, 2] } };
}
function migrate(p = fixture()) { return migrateGardenR2(p, { now: NOW, legacyRevision: 0, acknowledgedTotal: 0 }); }
function envelope(p, command, input = {}, { now = NOW, stream = STREAM, sequence } = {}) {
  return { version: 1, catalogRevision: GARDEN_R2_CATALOG_REVISION, accountId: p.id, command, input,
    expectedRevision: p._gardenProgression?.revision || 0,
    intent: { streamId: stream, sequence: sequence ?? (p._gardenProgression?.streams?.[stream]?.sequence || 0) + 1, createdAt: now } };
}
function execute(p, command, input = {}, options = {}) {
  const payload = envelope(p, command, input, options), clientActionId = `garden-r2:${payload.intent.streamId}:${payload.intent.sequence}`;
  const result = executeGardenR2(p, payload, { now: options.now ?? NOW, clientActionId, enabled: true, makePlantId: () => 'new-plant' });
  return { payload, clientActionId, result };
}
function commit(p, result) {
  assert.equal(result.error, undefined, result.error);
  if (result.commit) {
    p.garden = result.commit.garden; p.gardenAccounting = result.commit.gardenAccounting; p._gardenProgression = result.commit.gardenProgression;
    p.resources = { ...p.resources, gold: result.commit.gold }; if (result.commit.stats) p.stats = result.commit.stats;
  }
  return result;
}
function transact(p, command, input = {}, options = {}) { return commit(p, execute(p, command, input, options).result); }

function economicProjection(p) { const r = p._gardenProgression; return { gold: p.resources.gold, xp: r.xp, chapter: r.chapter, substrate: r.substrate, materialProgressMs: r.materialProgressMs, goldRemainder: r.goldRemainder, xpRemainder: r.xpRemainder, plants: p.garden.plants.map(({ phase, phaseProgress }) => ({ phase, phaseProgress })) }; }

test('inactive policy, all fourteen catalogue entries and every bounded rank are exact and positive', () => {
  assert.equal(GARDEN_R2_RELEASE_POLICY.enabled, false); assert.equal(Object.keys(R2_PLANTS).length, 14);
  let steps = 0;
  for (const p of Object.values(R2_PLANTS)) {
    assert(p.buyGold <= 1150); assert.equal(p.upgradeGold.length, 4);
    for (let rank = 1; rank < 5; rank++) { assert(r2GoldRate(p.id, rank + 1) > r2GoldRate(p.id, rank)); assert(p.upgradeGold[rank - 1] <= 1438); steps++; }
    for (let mastery = 0; mastery < 3; mastery++) assert(r2GoldRate(p.id, 5, mastery + 1) > r2GoldRate(p.id, 5, mastery));
  }
  assert.equal(steps, 56); assert.equal(new Set(R2_PROJECTS.flatMap(p => p.types)).size, 14);
  assert.equal(r2GoldRate('daisy') / 60000, getProduction(PLANT_TYPES.daisy.baseProduction, 1));
  assert.equal(r2GoldRate('fern'), 2920);
});

test('migration preserves wallet, ownership, achievements, adjacent namespaces and the original input', () => {
  const p = fixture({ level: 100, plantLevel: 40, gold: 987654321 }); p.garden.claimedQuests = ['first_plant'];
  const original = structuredClone(p), next = migrate(p);
  assert.deepEqual(p, original); assert.equal(next.resources.gold, original.resources.gold);
  for (const key of ['resources', 'yard', '_yardV2', 'merge', '_mergeLabFence', 'achievements', 'unknownFutureField', 'stats']) assert.deepEqual(next[key], original[key]);
  assert.equal(next.schemaVersion, 11); assert.equal(next.garden.economyVersion, 2);
  assert.deepEqual(next.garden.plants, p.garden.plants); assert.deepEqual(next.garden.claimedQuests, p.garden.claimedQuests);
  assert.equal(next._gardenProgression.plants['plant-one'].goldRank, 5); assert.equal(next._gardenProgression.masteryByType.daisy, 3);
  assert.equal(next._gardenProgression.migration.legacyGardenLevel, 100); assert.equal(next._gardenProgression.chapter, 30);
  assert.equal(next._gardenProgression.substrate, 0); assert.deepEqual(migrate(next), next);
});

test('one-time legacy resale is the old base sale, never the exponential historical-spend estimate', () => {
  const p = migrate(fixture({ type: 'fern', plantLevel: 1_000_000, level: 30 }));
  assert.equal(publicGardenR2(p).plants[0].resaleGold, 1_700_000);
  const before = p.resources.gold; transact(p, 'sellPlant', { plantId: 'plant-one' }); assert.equal(p.resources.gold, before + 1700000);
});

test('legacy mapping checks every level 1..1000 and chooses one highest-level species credit', () => {
  for (let level = 1; level <= 1000; level++) { const m = mapLegacyGardenLevel(level); assert(m.goldRank <= 5 && m.mastery <= 3); assert(m.discount < ([3, 6, 9][m.mastery] || 1)); }
  const p = fixture({ plantLevel: 19 }); p.garden.plants.push({ ...p.garden.plants[0], id: 'second', level: 9, spotIndex: 1 });
  const next = migrate(p); assert.equal(next._gardenProgression.masteryByType.daisy, 1); assert.deepEqual(next._gardenProgression.masteryDiscounts.daisy, { target: 2, amount: 5 });
});

test('migration fails closed for an unknown account schema, malformed plant or uncredited earnings', () => {
  const p = fixture(); p.schemaVersion = 12; assert.throws(() => migrate(p), /SCHEMA_UNSUPPORTED/);
  const duplicate = fixture(); duplicate.garden.plants.push({ ...duplicate.garden.plants[0] }); assert.throws(() => migrate(duplicate), /LEGACY_INVALID/);
  const uncredited = fixture(); uncredited.garden.totalGoldEarned = 100; uncredited.gardenAccounting = { version: 1, active: true, revision: 0, creditedTotal: 90, streams: {} };
  assert.throws(() => migrateGardenR2(uncredited, { now: NOW, legacyRevision: 0, acknowledgedTotal: 90 }), /UNSETTLED_EARNINGS/);
});

test('earned old level reward survives migration as a single explicit claim without migration gold changes', () => {
  const p = fixture({ level: 10, xp: getGardenXpRequired(10) }), next = migrate(p), oldGold = next.resources.gold;
  assert.equal(next._gardenProgression.chapter, 11); assert.equal(next.resources.gold, oldGold);
  assert.equal(publicGardenR2(next).pendingLegacyRewardGold, 405);
  transact(next, 'claimLegacyLevelReward'); assert.equal(next.resources.gold, oldGold + 405);
  assert.equal(execute(next, 'claimLegacyLevelReward').result.error, 'GARDEN_R2_LEGACY_REWARD_UNAVAILABLE');
});

test('pure service is default-disabled and never mutates caller on an error', () => {
  const p = fixture(), original = structuredClone(p), payload = envelope(p, 'adopt', { legacyRevision: 0, acknowledgedTotal: 0 });
  const denied = executeGardenR2(p, payload, { now: NOW, clientActionId: `garden-r2:${STREAM}:1` });
  assert.equal(denied.error, 'GARDEN_R2_NOT_ENABLED'); assert.deepEqual(p, original);
  const converted = migrate(p), before = structuredClone(converted); assert.equal(execute(converted, 'buyPlant', { type: 'fern', shelfIndex: 0, spotIndex: 1 }).result.error, 'GARDEN_R2_PLANT_LOCKED'); assert.deepEqual(converted, before);
});

test('offline gold and substrate stop at their independent caps and polling does not restart absence', () => {
  const p = migrate(fixture({ level: 30 })), before = p.resources.gold;
  settleGardenR2(p, NOW + 6 * 3600000); assert.equal(p.resources.gold - before, 302); assert.equal(p._gardenProgression.substrate, 6);
  settleGardenR2(p, NOW + 24 * 3600000); assert.equal(p.resources.gold - before, 302); assert.equal(p._gardenProgression.substrate, 12);
  settleGardenR2(p, NOW + 48 * 3600000); assert.equal(p.resources.gold - before, 302); assert.equal(p._gardenProgression.substrate, 12);
});

test('accrual is invariant under interval splitting including material unlock and fractional gold/XP', () => {
  const original = migrate(fixture({ level: 6, xp: 419 })), one = structuredClone(original), many = structuredClone(original);
  settleGardenR2(one, NOW + 24 * 3600000);
  for (let elapsed = 60_000; elapsed <= 24 * 3600000; elapsed += 60_000) settleGardenR2(many, NOW + elapsed);
  assert.deepEqual(economicProjection(one), economicProjection(many));
  const unlock = structuredClone(original); settleGardenR2(unlock, NOW + 4 * 3600000); assert.equal(unlock._gardenProgression.substrate, 3, 'chapter7 cannot grant material for pre-unlock time');
});

test('offline maturity crosses all phases and produces only after maturity', () => {
  const p = migrate(fixture({ level: 30, phase: 0 })), before = p.resources.gold;
  settleGardenR2(p, NOW + 24 * 3600000);
  assert.equal(p.garden.plants[0].phase, 3); assert.equal(p.resources.gold - before, 294); assert.equal(p._gardenProgression.substrate, 11);
});

test('stash prevents growth and production, duplicate positions never double-count', () => {
  const raw = fixture({ level: 30, phase: 0 }); raw.garden.plants[0].shelfIndex = -1; raw.garden.plants[0].spotIndex = -1;
  const p = migrate(raw), before = p.resources.gold; settleGardenR2(p, NOW + 24 * 3600000); assert.equal(p.resources.gold, before); assert.equal(p.garden.plants[0].phase, 0);
  const dup = fixture({ level: 30 }); dup.garden.plants.push({ ...dup.garden.plants[0], id: 'another' }); const d = migrate(dup); assert.equal(publicGardenR2(d).goldMilliPerMinute, 2400);
});

test('full material storage pauses rather than retaining a hidden overflow windfall', () => {
  const p = migrate(fixture({ level: 30 })); p._gardenProgression.substrate = 59; p._gardenProgression.materialProgressMs = 3599999;
  settleGardenR2(p, NOW + 2 * 3600000); assert.equal(p._gardenProgression.substrate, 60); assert.equal(p._gardenProgression.materialProgressMs, 0);
  const denied = execute(p, 'claimIntro', {}, { now: NOW + 2 * 3600000 }); assert.equal(denied.result.error, 'GARDEN_R2_SUBSTRATE_FULL'); assert.equal(p._gardenProgression.introClaimed, false);
  p._gardenProgression.substrate = 59; settleGardenR2(p, NOW + 2 * 3600000 + 1000); assert.equal(p._gardenProgression.substrate, 59); assert.equal(p._gardenProgression.materialProgressMs, 1000);
});

test('paid taps use authoritative global500ms cooldown across plants and ignore forged monetary fields', () => {
  const raw = fixture({ level: 30 }); raw.garden.plants.push({ ...raw.garden.plants[0], id: 'second', spotIndex: 1 }); const p = migrate(raw), before = p.resources.gold;
  transact(p, 'tend', { plantId: 'plant-one' }); assert.equal(p.resources.gold, before + 1);
  assert.equal(execute(p, 'tend', { plantId: 'second' }, { now: NOW + 499 }).result.error, 'GARDEN_R2_TAP_COOLDOWN');
  transact(p, 'tend', { plantId: 'second' }, { now: NOW + 500 }); assert.equal(p.resources.gold, before + 2);
  assert.equal(execute(p, 'tend', { plantId: 'second', goldReward: 1000000 }, { now: NOW + 1000 }).result.error, 'GARDEN_R2_PAYLOAD_INVALID');
});

test('rank5 is a deliberate terminal state and every previous purchase changes the public rate', () => {
  const p = migrate(fixture({ level: 30 }));
  for (let rank = 1; rank < 5; rank++) { const before = publicGardenR2(p).plants[0]; transact(p, 'upgradePlant', { plantId: 'plant-one' }); const after = publicGardenR2(p).plants[0]; assert(after.rateMilliGoldPerMinute > before.rateMilliGoldPerMinute); }
  const view = publicGardenR2(p).plants[0]; assert.equal(view.goldRank, 5); assert.equal(view.nextUpgradeGold, null); assert.equal(view.nextUpgradeDeltaMilliGoldPerMinute, null);
  assert.equal(execute(p, 'upgradePlant', { plantId: 'plant-one' }).result.error, 'GARDEN_R2_GOLD_RANK_COMPLETE');
});

test('sell receipt is exactly once and retains legacy base resale plus half actually paid new upgrades', () => {
  const p = migrate(fixture({ level: 30 })); transact(p, 'upgradePlant', { plantId: 'plant-one' });
  const sale = execute(p, 'sellPlant', { plantId: 'plant-one' }); const before = p.resources.gold; commit(p, sale.result);
  assert.equal(p.resources.gold, before + 12 + Math.floor(13 / 2));
  const repeated = executeGardenR2(p, sale.payload, { enabled: true, now: NOW + 1, clientActionId: sale.clientActionId });
  assert.equal(repeated.duplicate, true); assert.equal(repeated.gold, p.resources.gold); assert.equal(repeated.commit, undefined);
  const nextSale = execute(p, 'sellPlant', { plantId: 'plant-one' }); assert.equal(nextSale.result.error, 'GARDEN_R2_PLANT_MISSING');
});

test('adoption receipt and revision/account/catalog fences prevent replay or cross-account mutation', () => {
  const p = fixture(), adoption = execute(p, 'adopt', { legacyRevision: 0, acknowledgedTotal: 0 }); commit(p, adoption.result);
  const repeated = executeGardenR2(p, adoption.payload, { enabled: true, now: NOW + 1, clientActionId: adoption.clientActionId }); assert.equal(repeated.duplicate, true);
  const cross = { ...envelope(p, 'resume'), accountId: 'account-B' }; assert.equal(executeGardenR2(p, cross, { enabled: true, now: NOW, clientActionId: `garden-r2:${STREAM}:2` }).error, 'GARDEN_R2_ACCOUNT_MISMATCH');
  const stale = { ...envelope(p, 'resume'), expectedRevision: 0 }; assert.equal(executeGardenR2(p, stale, { enabled: true, now: NOW, clientActionId: `garden-r2:${STREAM}:2` }).error, 'GARDEN_R2_REVISION_CONFLICT');
  assert.equal(executeGardenR2(p, { ...envelope(p, 'resume'), catalogRevision: 'unknown' }, { enabled: true, now: NOW, clientActionId: `garden-r2:${STREAM}:2` }).error, 'GARDEN_R2_CLIENT_UPDATE_REQUIRED');
  const status = reconcileGardenR2(p, { accountId: p.id, streamId: STREAM, sequence: 1, clientActionId: adoption.clientActionId, payloadHash: gardenR2Hash(adoption.payload) }); assert.equal(status.receiptConfirmed, true);
});

test('old Garden mutation paths are fenced after adoption even if release switch is off', () => {
  const p = migrate();
  for (const action of ['garden.sync', 'garden.creditEarned', 'garden.resetEconomy', 'garden.goldDelta', 'garden.levelUp', 'garden.sellPlant']) assert.equal(gardenR2BlocksLegacy(p, action), true);
  for (const action of ['garden.r2', 'garden.r2.reconcile', 'garden.reconcileIntent', 'yard.buyFood', 'merge.lab']) assert.equal(gardenR2BlocksLegacy(p, action), false);
});

test('intro and study materials are one-time, server-action sourced and cannot be re-claimed', () => {
  const p = migrate(fixture({ level: 30 })); transact(p, 'claimIntro'); assert.equal(p._gardenProgression.substrate, 3);
  assert.equal(execute(p, 'claimIntro').result.error, 'GARDEN_R2_INTRO_UNAVAILABLE');
  for (let index = 0; index < 5; index++) transact(p, 'tend', { plantId: 'plant-one' }, { now: NOW + 500 * index });
  transact(p, 'water', { plantId: 'plant-one' }, { now: NOW + 2500 }); transact(p, 'claimStudy', {}, { now: NOW + 2500 });
  assert.equal(p._gardenProgression.substrate, 6); assert.equal(p._gardenProgression.study.cards, 0);
  assert.equal(execute(p, 'claimStudy', {}, { now: NOW + 2500 }).result.error, 'GARDEN_R2_STUDY_NOT_READY');
});

test('research/mastery use fixed costs and a migration discount cannot become transferable currency', () => {
  const p = migrate(fixture({ level: 30, plantLevel: 19 })); p._gardenProgression.substrate = 60;
  transact(p, 'research', { researchId: 'care_1' }); transact(p, 'research', { researchId: 'care_2' });
  assert.equal(p._gardenProgression.substrate, 45);
  const result = transact(p, 'upgradeMastery', { type: 'daisy' }); assert.equal(result.costSubstrate, 1); assert.equal(p._gardenProgression.substrate, 44);
  assert.equal(p._gardenProgression.masteryByType.daisy, 2); assert.equal(p._gardenProgression.masteryDiscounts.daisy, undefined);
  transact(p, 'sellPlant', { plantId: 'plant-one' }); assert.equal(p._gardenProgression.masteryByType.daisy, 2);
});

test('project completion keeps plants and does not mint gold/material, even if plants move after start', () => {
  const raw = fixture({ level: 30, plantLevel: 10 }); raw.garden.plants = ['lavender', 'basil', 'rosemary'].map((type, i) => ({ id: `p${i}`, type, level: 10, phase: 3, phaseProgress: 0, shelfIndex: 0, spotIndex: i }));
  const p = migrate(raw); p._gardenProgression.substrate = 30; transact(p, 'research', { researchId: 'collection_1' }); transact(p, 'startProject', { projectId: 'tea_shelf' });
  assert.equal(p.garden.plants.length, 3); for (const id of ['p0', 'p1', 'p2']) transact(p, 'movePlant', { plantId: id, shelfIndex: -1, spotIndex: -1 });
  const beforeGold = p.resources.gold, beforeMaterial = p._gardenProgression.substrate;
  transact(p, 'claimProject', {}, { now: NOW + 6 * 3600000 }); assert.equal(p.resources.gold, beforeGold); assert.equal(p._gardenProgression.substrate, beforeMaterial);
  assert.deepEqual(p._gardenProgression.projectsCompleted, ['tea_shelf']); assert.equal(p.garden.plants.length, 3);
});

test('public view contains truthful current prices but no migration source snapshots or explanatory banner', () => {
  const p = migrate(fixture({ type: 'fern', level: 30 })), view = publicGardenR2(p);
  assert.equal(view.plants[0].rateMilliGoldPerMinute, 2920); assert.equal(view.plants[0].nextUpgradeGold, 575);
  assert.equal(view.plants[0].resaleGold, 1700000); assert.equal(view.migration, undefined); assert.equal(view.banner, undefined); assert.equal(view.sourceGarden, undefined);
  validateGardenR2Player(p);
});

// These cases deliberately validate persisted state, not just a well-formed request.
test('malformed persisted namespaces fail closed with typed errors and never mutate the account', () => {
  const invalid = [
    p => { p._gardenProgression = null; },
    p => { p._gardenProgression = []; },
    p => { p._gardenProgression.plants = null; },
    p => { p._gardenProgression.masteryByType = []; },
    p => { p._gardenProgression.masteryDiscounts = null; },
    p => { p._gardenProgression.researchIds = 'idle_3'; },
    p => { p._gardenProgression.researchIds = ['care_2']; },
    p => { p._gardenProgression.researchIds = ['care_1', 'care_1']; },
    p => { p._gardenProgression.projectsCompleted = {}; },
    p => { p._gardenProgression.projectsCompleted = ['tea_shelf', 'tea_shelf']; },
    p => { p._gardenProgression.masteryByType.daisy = 4; },
    p => { p._gardenProgression.masteryDiscounts.daisy = { target: 1, amount: 3 }; },
    p => { p._gardenProgression.study = null; },
    p => { p._gardenProgression.study.cards = 2; },
    p => { p._gardenProgression.study.taps = 6; },
    p => { p._gardenProgression.study.unlocked = false; },
    p => { p._gardenProgression.study.nextAt = 'tomorrow'; },
    p => { p._gardenProgression.study.cards = 0; },
    p => { p._gardenProgression.dailyCare = null; },
    p => { p._gardenProgression.dailyCare.taps = -1; },
    p => { p._gardenProgression.streams = []; },
    p => { p._gardenProgression.streams[STREAM] = { sequence: 1 }; },
    p => { p._gardenProgression.streams = JSON.parse('{"__proto__":{}}'); },
    p => { p._gardenProgression.activeProject = {}; },
    p => { p._gardenProgression.activeProject = { projectId: 'unknown' }; },
    p => { p._gardenProgression.migration = null; },
    p => { p._gardenProgression.migration.sourceGarden = null; },
    p => { p._gardenProgression.migration.pendingLegacyReward = { gold: 1000000, claimed: false }; },
    p => { p._gardenProgression.plants['plant-one'].spentGold = 999999; },
    p => { p._gardenProgression.plants['plant-one'].legacyResaleGold = 999999; },
    p => { p._gardenProgression.plants['plant-one'].lastWateredAt = NOW + 1; },
    p => { p._gardenProgression.plants['orphan'] = { goldRank: 1 }; },
    p => { p._gardenProgression.xp = 1; },
    p => { p._gardenProgression.xpRemainder = 1; },
    p => { p._gardenProgression.lastTendAt = NOW + 1; },
    p => { p._gardenProgression.onlineUntil = NOW + 30001; },
    p => { p._gardenProgression.goldRemainder = 6_000_000_000; },
    p => { p._gardenProgression.substrate = 61; },
    p => { p._gardenProgression.introClaimed = 'yes'; },
    p => { p._gardenProgression.earnedGold = 1; },
    p => { p.garden.plants[0] = null; },
    p => { p.garden.plants[0].id = '__proto__'; },
    p => { p.garden.plants[0].type = 'constructor'; },
    p => { p.garden.plants[0].phaseProgress = 1; },
    p => { p.garden.plants[0].shelfIndex = 5; },
    p => { p.garden.shelvesUnlocked = 6; },
    p => { p.schemaVersion = 12; },
  ];
  for (const [index, mutate] of invalid.entries()) {
    const p = migrate(fixture({ level: 30 })); mutate(p); const before = structuredClone(p);
    assert.throws(() => validateGardenR2Player(p), error => error.name === 'Error' && /^GARDEN_R2_/.test(error.code || ''), `typed rejection ${index}`);
    assert.throws(() => publicGardenR2(p), error => /^GARDEN_R2_/.test(error.code || ''), `public rejection ${index}`);
    const result = execute(p, 'resume').result;
    assert.match(result.error, /^GARDEN_R2_/); assert.equal(result.commit, undefined); assert.deepEqual(p, before);
  }
  for (const namespace of [null, false, 0, '', []]) {
    const p = fixture(); p._gardenProgression = namespace;
    assert.throws(() => migrate(p), error => /^GARDEN_R2_/.test(error.code || ''), 'an existing corrupt namespace is never re-adopted');
  }
});

test('legacy L1/L9/L19/L29/L40/L100 preserve each supported old economyVersion and all ownership', () => {
  for (const level of [1, 9, 19, 29, 40, 100]) for (const version of ['absent', undefined, 1, 2]) {
    const p = fixture({ level, plantLevel: level, gold: 123456789 });
    if (version === 'absent') delete p.garden.economyVersion; else p.garden.economyVersion = version;
    p.garden.shelvesUnlocked = 5; p.garden.claimedQuests = ['first_plant', 'level_2'];
    p.garden.dailyQuests.claimed = ['daily_20261002_0_plant_1'];
    p.garden.plants.push({ ...p.garden.plants[0], id: 'stashed', shelfIndex: -1, spotIndex: -1 });
    const next = migrate(p), mapping = mapLegacyGardenLevel(level);
    assert.deepEqual(next.garden, p.garden, `legacy level ${level}, economy ${version}`);
    assert.equal(Object.hasOwn(next.garden, 'economyVersion'), Object.hasOwn(p.garden, 'economyVersion'));
    assert.equal(next._gardenProgression.chapter, Math.min(30, level));
    assert.equal(next._gardenProgression.plants['plant-one'].goldRank, mapping.goldRank);
    assert.equal(next._gardenProgression.plants.stashed.legacyLevel, level);
    assert.equal(next._gardenProgression.masteryByType.daisy, mapping.mastery);
    assert.equal(next._gardenProgression.masteryDiscounts.daisy?.amount || 0, mapping.discount);
    assert.equal(next._gardenProgression.substrate, 0); assert.equal(next.resources.gold, p.resources.gold);
    assert.equal(next._gardenProgression.migration.goldBefore, p.resources.gold);
    const reloaded = JSON.parse(JSON.stringify(next)); assert.deepEqual(migrate(reloaded), reloaded);
  }
});

test('migration retains recent care cooldowns and refuses malformed legacy plants or timestamps', () => {
  const p = fixture({ level: 30 }); p.garden.plants[0].lastTapped = NOW - 250; p.garden.plants[0].lastWatered = NOW - 1000;
  const next = migrate(p);
  assert.equal(execute(next, 'tend', { plantId: 'plant-one' }).result.error, 'GARDEN_R2_TAP_COOLDOWN');
  assert.equal(execute(next, 'water', { plantId: 'plant-one' }).result.error, 'GARDEN_R2_WATER_COOLDOWN');
  transact(next, 'tend', { plantId: 'plant-one' }, { now: NOW + 250 });
  for (const corrupt of [null, [], { ...p.garden.plants[0], lastTapped: -1 }, { ...p.garden.plants[0], id: '__proto__' }]) {
    const raw = fixture(); raw.garden.plants[0] = corrupt;
    assert.throws(() => migrate(raw), error => error.code === 'GARDEN_R2_LEGACY_INVALID');
  }
  const raw = fixture(); raw.garden.levelReady = 'true';
  assert.throws(() => migrate(raw), /LEGACY_INVALID/);
});

test('all nine research and five project costs preserve the exact finite material budget', async () => {
  const { R2_RESEARCH, R2_MASTERY_COSTS, R2_SHELF_COSTS, r2PassiveXpRate, r2TapXp } = await import('../game-logic/garden-r2/catalog.js');
  assert.equal(R2_RESEARCH.length, 9); assert.equal(R2_PROJECTS.length, 5);
  assert.equal(R2_RESEARCH.reduce((sum, node) => sum + node.gold, 0), 3150);
  assert.equal(R2_RESEARCH.reduce((sum, node) => sum + node.substrate, 0), 81);
  assert.equal(R2_PROJECTS.reduce((sum, project) => sum + project.gold, 0), 2750);
  assert.equal(R2_PROJECTS.reduce((sum, project) => sum + project.substrate, 0), 42);
  assert.equal(Object.keys(R2_PLANTS).length * R2_MASTERY_COSTS.reduce((a, b) => a + b, 0) + 81 + 42 - 3, 372);
  assert.deepEqual(R2_SHELF_COSTS, [0, 120, 450, 1200, 2500]);
  for (const rate of [r2GoldRate, r2PassiveXpRate, r2TapXp]) for (const args of [['__proto__'], ['constructor'], ['daisy', 0], ['daisy', 6], ['daisy', 1, 4], ['daisy', 1.5]]) assert.throws(() => rate(...args), RangeError);
  for (const id of Object.keys(R2_PLANTS)) for (let rank = 1; rank <= 5; rank++) for (let mastery = 0; mastery <= 3; mastery++) {
    assert(Number.isSafeInteger(r2GoldRate(id, rank, mastery)));
    assert(Number.isSafeInteger(r2PassiveXpRate(id, rank, mastery)));
    assert(Number.isSafeInteger(r2TapXp(id, rank, mastery)));
  }
});

test('research cannot be bought with gold alone or out of branch order and repeats cannot debit twice', () => {
  const p = migrate(fixture({ level: 30, gold: 999999999 })), before = structuredClone(p);
  assert.equal(execute(p, 'research', { researchId: 'care_1' }).result.error, 'GARDEN_R2_INSUFFICIENT_SUBSTRATE'); assert.deepEqual(p, before);
  p._gardenProgression.substrate = 60;
  assert.equal(execute(p, 'research', { researchId: 'care_2' }).result.error, 'GARDEN_R2_RESEARCH_LOCKED');
  const gold = p.resources.gold; transact(p, 'research', { researchId: 'care_1' }); assert.equal(p.resources.gold, gold - 150);
  const done = structuredClone(p); assert.equal(execute(p, 'research', { researchId: 'care_1' }).result.error, 'GARDEN_R2_RESEARCH_COMPLETE'); assert.deepEqual(p, done);
  const locked = migrate(fixture({ level: 9 })); locked._gardenProgression.substrate = 60;
  assert.equal(execute(locked, 'research', { researchId: 'care_1' }).result.error, 'GARDEN_R2_RESEARCH_LOCKED');
});

test('mastery has exactly three permanent steps, consumes the one discount, and never changes tap gold', () => {
  const p = migrate(fixture({ level: 30, plantLevel: 9 })); p._gardenProgression.substrate = 60;
  for (const researchId of ['collection_1', 'collection_2', 'collection_3']) transact(p, 'research', { researchId });
  const first = transact(p, 'upgradeMastery', { type: 'daisy' }); assert.equal(first.costSubstrate, 1);
  assert.equal(p._gardenProgression.masteryDiscounts.daisy, undefined);
  transact(p, 'upgradeMastery', { type: 'daisy' });
  assert.equal(execute(p, 'upgradeMastery', { type: 'daisy' }).result.error, 'GARDEN_R2_PROJECT_REQUIRED');
  // A completed project remains valid after its participants have been sold.
  p._gardenProgression.projectsCompleted = ['tea_shelf'];
  const last = transact(p, 'upgradeMastery', { type: 'daisy' }); assert.equal(last.costSubstrate, 9);
  assert.equal(publicGardenR2(p).plants[0].rateMilliGoldPerMinute, 5520);
  assert.equal(transact(p, 'tend', { plantId: 'plant-one' }).goldReward, 1);
  assert.equal(execute(p, 'upgradeMastery', { type: 'daisy' }).result.error, 'GARDEN_R2_MASTERY_COMPLETE');
  transact(p, 'sellPlant', { plantId: 'plant-one' }); assert.equal(p._gardenProgression.masteryByType.daisy, 3);
});

test('study unlock action is not retroactive, and growth taps and cooldown failures never count as paid care', () => {
  const p = migrate(fixture({ level: 6, xp: 419 })); transact(p, 'tend', { plantId: 'plant-one' });
  assert.equal(p._gardenProgression.chapter, 7); assert.equal(p._gardenProgression.study.cards, 1); assert.equal(p._gardenProgression.study.taps, 0);
  transact(p, 'tend', { plantId: 'plant-one' }, { now: NOW + 500 }); assert.equal(p._gardenProgression.study.taps, 1);
  const before = structuredClone(p); assert.equal(execute(p, 'tend', { plantId: 'plant-one' }, { now: NOW + 999 }).result.error, 'GARDEN_R2_TAP_COOLDOWN'); assert.deepEqual(p, before);
  const growing = migrate(fixture({ level: 30, phase: 0 })); transact(growing, 'tend', { plantId: 'plant-one' });
  assert.equal(growing._gardenProgression.study.taps, 0); assert.equal(growing._gardenProgression.dailyCare.taps, 0); assert.equal(growing.garden.plants[0].phaseProgress, 2000);
});

test('two study cards require distinct care sets and permitted waters, survive midnight, and defer full claims', () => {
  const p = migrate(fixture({ level: 30 })); p._gardenProgression.substrate = 60;
  for (const researchId of ['collection_1', 'collection_2', 'collection_3']) transact(p, 'research', { researchId });
  const nextDay = NOW + 24 * 3600000; settleGardenR2(p, nextDay); assert.equal(p._gardenProgression.study.cards, 2);
  for (let i = 0; i < 5; i++) transact(p, 'tend', { plantId: 'plant-one' }, { now: nextDay + i * 500 });
  transact(p, 'water', { plantId: 'plant-one' }, { now: nextDay + 2000 });
  p._gardenProgression.substrate = 90; const full = structuredClone(p);
  assert.equal(execute(p, 'claimStudy', {}, { now: nextDay + 2000 }).result.error, 'GARDEN_R2_SUBSTRATE_FULL'); assert.deepEqual(p, full);
  p._gardenProgression.substrate = 80; transact(p, 'claimStudy', {}, { now: nextDay + 2000 });
  assert.equal(p._gardenProgression.study.cards, 1); assert.equal(p._gardenProgression.study.taps, 0); assert.equal(p._gardenProgression.study.waters, 0);
  for (let i = 0; i < 5; i++) transact(p, 'tend', { plantId: 'plant-one' }, { now: nextDay + 2500 + i * 500 });
  assert.equal(execute(p, 'water', { plantId: 'plant-one' }, { now: nextDay + 4500 }).result.error, 'GARDEN_R2_WATER_COOLDOWN');
  assert.equal(execute(p, 'claimStudy', {}, { now: nextDay + 4500 }).result.error, 'GARDEN_R2_STUDY_NOT_READY');
  transact(p, 'water', { plantId: 'plant-one' }, { now: nextDay + 602000 }); transact(p, 'claimStudy', {}, { now: nextDay + 602000 });
  assert.equal(p._gardenProgression.study.cards, 0);
  const atRefill = p._gardenProgression.study.nextAt; settleGardenR2(p, atRefill - 1); assert.equal(p._gardenProgression.study.cards, 0);
  settleGardenR2(p, atRefill); assert.equal(p._gardenProgression.study.cards, 1); assert.equal(p._gardenProgression.study.taps, 0);
});

test('daily finite-action alternatives preserve day/slot claims and original-action progress at R5/M3', async () => {
  const { buildGardenQuestSections } = await import('../game-logic/garden-quests.js');
  const covered = new Set();
  for (let day = 0; day < 60 && covered.size < 4; day++) {
    const now = NOW + day * 86400000, base = migrate(fixture({ level: 30, plantLevel: 100 }));
    settleGardenR2(base, now);
    const original = buildGardenQuestSections({ ...base.garden, level: 30 }, now).flatMap(s => s.quests);
    for (const templateKey of ['plant_1', 'plant_2', 'upgrade_1', 'upgrade_2']) {
      const target = original.find(q => q.templateKey === templateKey); if (!target || covered.has(templateKey)) continue;
      covered.add(templateKey); const p = structuredClone(base), count = templateKey.endsWith('_2') ? 24 : 12;
      const q = () => publicGardenR2(p, now).quests.flatMap(s => s.quests).find(q => q.id === target.id);
      assert.equal(q().careAlternative.current, 0); assert.equal(q().careAlternative.target, count);
      p._gardenProgression.dailyCare.taps = count - 1; assert.equal(q().complete, target.complete);
      p._gardenProgression.dailyCare.taps = count; assert.equal(q().complete, true); assert.equal(q().id, target.id); assert.equal(q().reward, target.reward);
      const prerequisites = original.filter(q => q.kind === 'daily' && q.groupIndex < target.groupIndex).map(q => q.id);
      p.garden.dailyQuests.claimed.push(...prerequisites); transact(p, 'claimQuest', { questId: target.id }, { now });
      assert.equal(q().claimed, true); assert.equal(execute(p, 'claimQuest', { questId: target.id }, { now }).result.error, 'GARDEN_R2_QUEST_NOT_READY');
      p._gardenProgression.dailyCare.taps = 0;
      p.garden.dailyQuests.stats[templateKey.startsWith('plant') ? 'plantsBought' : 'upgrades'] = target.target;
      assert.equal(q().complete, true, 'original qualifying actions still count'); assert.equal(q().claimed, true);
    }
  }
  assert.equal(covered.size, 4);
});

test('settlement across midnight is partition-invariant for daily stats and chapter rewards too', () => {
  const start = NOW + 11 * 3600000;
  for (const level of [1, 6, 29, 30]) for (const elapsed of [3599999, 3600000, 7200000]) {
    const p = migrateGardenR2(fixture({ level, xp: level < 30 ? getGardenXpRequired(level) - 1 : 0 }), { now: start, legacyRevision: 0, acknowledgedTotal: 0 });
    p._gardenProgression.onlineUntil = start + 30000;
    const one = structuredClone(p), many = structuredClone(p), end = start + elapsed;
    settleGardenR2(one, end);
    for (let at = start + 17003; at < end; at += 17003) settleGardenR2(many, at);
    settleGardenR2(many, end);
    assert.deepEqual(economicProjection(one), economicProjection(many)); assert.deepEqual(one.garden.dailyQuests, many.garden.dailyQuests);
    assert.deepEqual(one._gardenProgression.study, many._gardenProgression.study);
    if (elapsed === 3600000) assert.equal(one.garden.dailyQuests.stats.goldEarned, 0, 'the previous day cannot fund the new day’s quest');
  }
});

test('gold and material horizons and maturity remain exact at all cap and lease boundaries', () => {
  for (const researchIds of [[], ['idle_1'], ['idle_1', 'idle_2'], ['idle_1', 'idle_2', 'idle_3']]) {
    for (const elapsed of [0, 29999, 30000, 1799000, 1800000, 6 * 3600000, 8 * 3600000, 12 * 3600000, 24 * 3600000]) {
      const p = migrate(fixture({ level: 30 })); p._gardenProgression.researchIds = researchIds; p._gardenProgression.onlineUntil = NOW + 30000;
      const view = publicGardenR2(p), before = p.resources.gold;
      settleGardenR2(p, NOW + elapsed);
      const onlineMs = Math.min(elapsed, 30000), offlineMs = Math.min(Math.max(0, elapsed - 30000), view.effects.offlineCapMs);
      const expectedNumerator = 2400 * (onlineMs * 100 + offlineMs * view.effects.offlineGoldPercent);
      assert.equal(p.resources.gold - before, Math.floor(expectedNumerator / 6_000_000_000));
      assert.equal(p._gardenProgression.goldRemainder, expectedNumerator % 6_000_000_000);
      assert.equal(p._gardenProgression.substrate, Math.floor(Math.min(elapsed, 30000 + 12 * 3600000) / 3600000));
    }
  }
  for (const type of Object.keys(R2_PLANTS)) {
    const p = migrate(fixture({ level: 30, type, phase: 0 })), duration = R2_PLANTS[type].growthPhaseMs.reduce((a, b) => a + b, 0), before = p.resources.gold;
    settleGardenR2(p, NOW + duration - 1); assert.equal(p.garden.plants[0].phase, 2); assert.equal(p.resources.gold, before);
    settleGardenR2(p, NOW + duration); assert.equal(p.garden.plants[0].phase, 3); assert.equal(p.resources.gold, before);
    settleGardenR2(p, NOW + duration + 1); assert.equal(p._gardenProgression.goldRemainder, r2GoldRate(type) * 35);
  }
});

test('moving at maturity and upgrading settle the previous composition and rate exactly once', () => {
  const p = migrate(fixture({ level: 30, phase: 0 }));
  transact(p, 'movePlant', { plantId: 'plant-one', shelfIndex: -1, spotIndex: -1 }, { now: NOW + 600000 });
  assert.equal(p.garden.plants[0].phase, 3); assert.equal(p._gardenProgression.goldRemainder, 0);
  settleGardenR2(p, NOW + 1200000); assert.equal(p._gardenProgression.goldRemainder, 0);
  transact(p, 'movePlant', { plantId: 'plant-one', shelfIndex: 0, spotIndex: 0 }, { now: NOW + 1200000 });
  const before = p.resources.gold; transact(p, 'upgradePlant', { plantId: 'plant-one' }, { now: NOW + 1260000 });
  // 30 seconds online plus 30 seconds offline use the old R1 rate.
  assert.equal(p.resources.gold, before + 1 - 13); assert.equal(p._gardenProgression.goldRemainder, 3720000000);
  settleGardenR2(p, NOW + 1261000); assert.equal(p._gardenProgression.goldRemainder, 4020000000);
});

test('each project snapshots participants, tolerates later sales, awards once, and has no money multiplier', () => {
  for (const project of R2_PROJECTS) {
    const raw = fixture({ level: 30 }); raw.garden.plants = project.types.map((type, i) => ({ id: `p${i}`, type, level: 10, phase: 3, phaseProgress: 0, shelfIndex: 0, spotIndex: i, lastTapped: 0 }));
    const p = migrate(raw); p._gardenProgression.substrate = 60; transact(p, 'research', { researchId: 'collection_1' });
    const before = p.resources.gold, material = p._gardenProgression.substrate;
    transact(p, 'startProject', { projectId: project.id }); assert.equal(p.resources.gold, before - project.gold); assert.equal(p._gardenProgression.substrate, material - project.substrate);
    const snapshot = structuredClone(p._gardenProgression.activeProject);
    assert.deepEqual(snapshot.plantIds, ['p0', 'p1', 'p2']); assert.equal(snapshot.finishAt, NOW + project.durationMs);
    assert.equal(execute(p, 'startProject', { projectId: project.id }).result.error, 'GARDEN_R2_PROJECT_LOCKED');
    for (const plantId of snapshot.plantIds) transact(p, 'sellPlant', { plantId });
    assert.equal(execute(p, 'claimProject', {}, { now: snapshot.finishAt - 1 }).result.error, 'GARDEN_R2_PROJECT_NOT_READY');
    const balance = p.resources.gold, substrate = p._gardenProgression.substrate;
    transact(p, 'claimProject', {}, { now: snapshot.finishAt }); assert.equal(p.resources.gold, balance); assert.equal(p._gardenProgression.substrate, substrate);
    assert.deepEqual(p._gardenProgression.projectsCompleted, [project.id]); assert.equal(p._gardenProgression.activeProject, null);
    assert.equal(execute(p, 'claimProject', {}, { now: snapshot.finishAt }).result.error, 'GARDEN_R2_PROJECT_NOT_READY');
    assert.equal(execute(p, 'startProject', { projectId: project.id }, { now: snapshot.finishAt }).result.error, 'GARDEN_R2_PROJECT_LOCKED');
  }
});


test('unknown or corrupt old accounting cannot be silently replaced during adoption', () => {
  for (const metadata of [null, [], { version: 2 }, { version: 1, active: false, revision: 0, creditedTotal: 0, streams: [] }, { version: 1, active: false, revision: 0, creditedTotal: -1, streams: {} }]) {
    const p = fixture(); p.gardenAccounting = metadata; const before = structuredClone(p);
    assert.throws(() => migrate(p), /GARDEN_R2_LEGACY_ACCOUNTING_INVALID/); assert.deepEqual(p, before);
  }
});

test('study action progress survives the midnight daily-care reset', () => {
  const p = migrate(fixture({ level: 30 })), midnight = NOW + 12 * 3600000;
  transact(p, 'tend', { plantId: 'plant-one' }, { now: midnight - 1000 });
  transact(p, 'water', { plantId: 'plant-one' }, { now: midnight - 1000 });
  assert.equal(p._gardenProgression.study.taps, 1); assert.equal(p._gardenProgression.study.waters, 1);
  assert.equal(p._gardenProgression.dailyCare.taps, 1);
  settleGardenR2(p, midnight);
  assert.equal(p._gardenProgression.dailyCare.taps, 0); assert.equal(p._gardenProgression.study.taps, 1); assert.equal(p._gardenProgression.study.waters, 1);
});

test('all fourteen new plants retain every positive rank/mastery step across JSON reloads and sell only paid gold', () => {
  for (const type of Object.keys(R2_PLANTS)) {
    const raw = fixture({ level: 30 }); raw.garden.plants = [];
    let p = migrate(raw); transact(p, 'buyPlant', { type, shelfIndex: 0, spotIndex: 0 });
    const adultAt = NOW + R2_PLANTS[type].growthPhaseMs.reduce((a, b) => a + b, 0); settleGardenR2(p, adultAt);
    for (let rank = 1; rank < 5; rank++) {
      const previous = publicGardenR2(p).plants[0]; transact(p, 'upgradePlant', { plantId: 'new-plant' }, { now: adultAt });
      p = JSON.parse(JSON.stringify(p)); validateGardenR2Player(p);
      const current = publicGardenR2(p).plants[0]; assert.equal(current.goldRank, rank + 1); assert(current.rateMilliGoldPerMinute > previous.rateMilliGoldPerMinute);
    }
    p._gardenProgression.substrate = 60;
    for (const researchId of ['collection_1', 'collection_2', 'collection_3']) transact(p, 'research', { researchId }, { now: adultAt });
    p._gardenProgression.projectsCompleted = ['tea_shelf'];
    for (let mastery = 1; mastery <= 3; mastery++) {
      const before = publicGardenR2(p).plants[0].rateMilliGoldPerMinute; transact(p, 'upgradeMastery', { type }, { now: adultAt });
      p = JSON.parse(JSON.stringify(p)); validateGardenR2Player(p);
      assert.equal(p._gardenProgression.masteryByType[type], mastery); assert(publicGardenR2(p).plants[0].rateMilliGoldPerMinute > before);
    }
    const paid = R2_PLANTS[type].buyGold + R2_PLANTS[type].upgradeGold.reduce((a, b) => a + b, 0);
    assert.equal(publicGardenR2(p).plants[0].resaleGold, Math.floor(paid / 2));
    const before = p.resources.gold; transact(p, 'sellPlant', { plantId: 'new-plant' }, { now: adultAt }); assert.equal(p.resources.gold - before, Math.floor(paid / 2));
    assert.equal(p._gardenProgression.masteryByType[type], 3); assert.equal(p._gardenProgression.researchIds.length, 3);
  }
});

test('legacy post-30 XP history and ready reward survive while the new chapter has a hard terminal state', async () => {
  const { getGardenLevelReward } = await import('../game-logic/garden-economy.js');
  const raw = fixture({ level: 100, plantLevel: 100, xp: getGardenXpRequired(100) }); raw.garden.levelReady = true;
  const p = migrate(raw), before = p.resources.gold;
  assert.equal(p._gardenProgression.chapter, 30); assert.equal(p._gardenProgression.xp, 0); assert.equal(p._gardenProgression.migration.sourceGarden.xp, raw.garden.xp);
  assert.equal(publicGardenR2(p).pendingLegacyRewardGold, getGardenLevelReward(100)); assert.equal(p.resources.gold, before);
  transact(p, 'claimLegacyLevelReward'); assert.equal(p.resources.gold, before + getGardenLevelReward(100));
  assert.equal(execute(p, 'claimLegacyLevelReward').result.error, 'GARDEN_R2_LEGACY_REWARD_UNAVAILABLE');
  const tap = transact(p, 'tend', { plantId: 'plant-one' }); assert.equal(tap.goldReward, 1); assert.equal(p._gardenProgression.xp, 0); assert.equal(p._gardenProgression.chapter, 30);
});


test('future legacy device-clock care timestamps preserve history but clamp new cooldowns to server time', () => {
  const raw = fixture({ level: 30 }); raw.garden.plants[0].lastTapped = NOW + 86400000; raw.garden.plants[0].lastWatered = NOW + 86400000;
  const p = migrate(raw); assert.deepEqual(p.garden, raw.garden); assert.deepEqual(p._gardenProgression.migration.sourceGarden, raw.garden);
  assert.equal(p._gardenProgression.lastTendAt, NOW); assert.equal(p._gardenProgression.plants['plant-one'].lastWateredAt, NOW);
  assert.equal(execute(p, 'tend', { plantId: 'plant-one' }).result.error, 'GARDEN_R2_TAP_COOLDOWN');
  transact(p, 'tend', { plantId: 'plant-one' }, { now: NOW + 500 });
  assert.equal(execute(p, 'water', { plantId: 'plant-one' }, { now: NOW + 599999 }).result.error, 'GARDEN_R2_WATER_COOLDOWN');
  transact(p, 'water', { plantId: 'plant-one' }, { now: NOW + 600000 });
});


test('public care clocks expose clamped server authority without rewriting legacy history', () => {
  const raw = fixture({ level: 30 }); raw.garden.plants[0].lastTapped = NOW + 86400000; raw.garden.plants[0].lastWatered = NOW + 86400000;
  raw.garden.plants.push({ ...raw.garden.plants[0], id: 'second', spotIndex: 1, lastTapped: NOW - 1000, lastWatered: 0 });
  const p = migrate(raw), view = publicGardenR2(p), stored = structuredClone(p.garden);
  assert.equal(view.plants[0].lastTapped, NOW); assert.equal(view.plants[0].lastWatered, NOW);
  assert.equal(view.plants[1].lastTapped, NOW, 'the tap cooldown belongs to the whole account'); assert.equal(view.plants[1].lastWatered, 0);
  assert.deepEqual(p.garden, stored); assert.deepEqual(p._gardenProgression.migration.sourceGarden, raw.garden);
  transact(p, 'tend', { plantId: 'second' }, { now: NOW + 500 });
  const next = publicGardenR2(p); assert(next.plants.every(plant => plant.lastTapped === NOW + 500));
  assert.equal(next.plants[0].lastWatered, NOW); assert.equal(p.garden.plants[0].lastTapped, NOW + 86400000);
});

test('public project placement eligibility matches server duplicate and unavailable shelf handling', () => {
  const raw = fixture({ level: 30 });
  raw.garden.plants = ['lavender', 'basil', 'rosemary'].map((type, i) => ({ id: `project-${i}`, type, level: 10, phase: 3, phaseProgress: 0, shelfIndex: 0, spotIndex: i, lastTapped: 0 }));
  raw.garden.plants[1].spotIndex = 0;
  raw.garden.plants[2].shelfIndex = 4;
  const p = migrate(raw); p._gardenProgression.substrate = 60; transact(p, 'research', { researchId: 'collection_1' });
  let view = publicGardenR2(p); assert.deepEqual(view.plants.map(plant => plant.isActive), [true, false, false]);
  assert.equal(view.goldMilliPerMinute, view.plants[0].rateMilliGoldPerMinute);
  assert.equal(execute(p, 'startProject', { projectId: 'tea_shelf' }).result.error, 'GARDEN_R2_PROJECT_PLANTS_REQUIRED');
  transact(p, 'movePlant', { plantId: 'project-1', shelfIndex: 0, spotIndex: 1 });
  transact(p, 'movePlant', { plantId: 'project-2', shelfIndex: 0, spotIndex: 2 });
  view = publicGardenR2(p); assert(view.plants.every(plant => plant.isActive));
  transact(p, 'startProject', { projectId: 'tea_shelf' }); assert.equal(p._gardenProgression.activeProject.projectId, 'tea_shelf');
});
