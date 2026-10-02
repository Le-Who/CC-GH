import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPlayer } from '../game-logic.js';
import { buildSnapshot, applyAction } from '../routes/player.js';
import { MERGE_LAB_RELEASE_POLICY, ensureMergeLabState, executeMergeLab, publicMergeLabState } from '../game-logic/merge-lab-service.js';
import { MERGE_LAB_CATALOG as catalog } from '../game-logic/merge-lab-catalog.js';
import { createMergeLabAction, createMergeLabQuote } from '../game-logic/merge-lab-domain.js';
import { applyLegacyMergeAction, buildLegacyMergeSnapshot } from './helpers/legacy-merge-fixture.mjs';

test('final source policy is enabled/clean-start and normal snapshots migrate before retiring legacy mutations', async () => {
  assert.equal(MERGE_LAB_RELEASE_POLICY.enabled, true);
  assert.equal(MERGE_LAB_RELEASE_POLICY.migrationMode, 'clean-start');
  assert.equal(MERGE_LAB_RELEASE_POLICY.yardV3ProjectsEnabled, false);
  const p = createDefaultPlayer('merge-enabled-transition', 'Fixture');
  const oldBoard = structuredClone(p.merge.board);
  const first = buildSnapshot(p);
  assert.equal(first.merge.schemaVersion, 3); assert.equal(first.merge.projects.selectedId, 'night_beacon');
  assert.deepEqual(p.merge.board, oldBoard);
  assert.deepEqual(p.merge.migration.archive.merge.board, oldBoard);
  assert.deepEqual(first.merge.stock, {});
  assert.equal(first.merge.migration.mode, 'clean-start');
  assert.equal(first.merge.migration.archive, undefined);
  const before = structuredClone(p);
  for (const action of ['merge.tap', 'merge.merge', 'merge.exchange', 'merge.freePull', 'merge.gacha', 'merge.trash', 'merge.claimFreeTaps']) {
    const result = await applyAction(p, action, {});
    assert.equal(result.status, 410, action); assert.equal(result.body.code, 'LEGACY_MERGE_RETIRED');
    assert.deepEqual(p, before);
  }
});

test('legacy regression fixture cannot disable migration in the independently imported production route', async () => {
  const legacy = createDefaultPlayer('legacy-isolated', 'Fixture');
  const result = await applyLegacyMergeAction(legacy, 'merge.claimFreeTaps');
  assert.equal(result.status, 200); assert.notEqual(buildLegacyMergeSnapshot(legacy).merge.schemaVersion, 3);
  assert.equal(buildSnapshot(legacy).merge.schemaVersion, 3);
  assert.equal(MERGE_LAB_RELEASE_POLICY.enabled, true);
  assert.throws(() => applyLegacyMergeAction(legacy, 'merge.tap'), /Legacy-only/);
});


const fixedNow = 1790928000000;
const options = { now: fixedNow, newEpoch: () => 'clean_start_epoch_123456' };
function command(p, type, payload = {}, quoted = false) {
  const parameters = quoted ? { ...payload, quote: createMergeLabQuote(p, type, payload, catalog, { now: fixedNow }) } : payload;
  return { command: createMergeLabAction(p, type, parameters, catalog, { actionId: `clean-start-${p.merge.mergeRevision}` }), expectedMergeEpoch: p.merge.serverEpoch };
}
function gameplay(merge) {
  const keys = ['schemaVersion', 'catalogVersion', 'mergeRevision', 'stock', 'projects', 'alchemyEssence', 'exchangeClaims', 'freeTapCharges', 'lastFreeTaps', 'lastFreePull', 'supply', 'ui'];
  const state = Object.fromEntries(keys.map(key => [key, structuredClone(merge[key])]));
  // Discovery sets are semantically unordered; archives and fence IDs are intentionally distinct.
  state.knowledge = { ...structuredClone(merge.knowledge), itemIds: [...merge.knowledge.itemIds].sort(), recipeIds: [...merge.knowledge.recipeIds].sort() };
  state.rewards = { itemIds: [...merge.rewards.itemIds].sort(), recipeIds: [...merge.rewards.recipeIds].sort() };
  return state;
}

test('old Merge progression is archived losslessly; fresh V3 changes no unrelated balances, purchases or Yard grants', () => {
  const p = createDefaultPlayer('clean-start-existing', 'Existing', fixedNow);
  Object.assign(p.merge, { board: JSON.stringify([[{ id: 'world_tree', instanceId: 'old-token' }]]), inventory: { glass: 91 }, alchemyEssence: 777, freeTapCharges: 29, lastFreeTaps: fixedNow - 1000, lastFreePull: fixedNow, stock: { crystal: 31 }, knowledge: { itemIds: ['world_tree'], recipeIds: ['old-recipe'], testedPairs: { old: true }, hintStages: { old: 3 } }, projects: { selectedId: 'echo_chimes', crafted: { night_beacon: 8 }, extension: { keep: true } }, supply: { starterKitClaimed: true, dailyClaimDate: '2026-10-02' }, actionLedger: [{ oldReceipt: true }], unknownMerge: { keep: 'yes' } });
  p.mergeBoard = 'old board alias'; p.mergeInventory = { dew: 8 };
  p.inventory = { mergeItems: { seed: 19 }, mergeInventory: { vial: 2 }, unrelated: { keep: true } };
  p.resources.gold = 987; p.resources.gachaTokens = 45; p.resources.paidGrant = 11;
  p.purchases = { order1: { delivered: true } }; p.farm.harvested = { strawberry: 21 };
  p.yard.currencies = { treats: 1234, shinyTreats: 17 };
  Object.assign(p.yard.goodieInventory, { moon_lamp: 7, alchemy_living_arbor: 1201, alchemy_echo_chimes: 2402 });
  p.unknownAccount = { keep: 'yes' };
  const before = structuredClone(p);
  ensureMergeLabState(p, options);
  assert.equal(p.merge.schemaVersion, 3); assert.equal(p.merge.migration.mode, 'clean-start');
  assert.deepEqual(p.merge.migration.archive, { merge: before.merge, mergeBoard: before.mergeBoard, mergeInventory: before.mergeInventory, inventory: { mergeItems: before.inventory.mergeItems, mergeInventory: before.inventory.mergeInventory } });
  for (const key of Object.keys(before).filter(key => key !== 'merge')) assert.deepEqual(p[key], before[key], key);
  assert.deepEqual(p.merge.stock, {}); assert.equal(p.merge.alchemyEssence, 0); assert.equal(p.merge.freeTapCharges, 0);
  assert.equal(p.merge.lastFreeTaps, 0); assert.equal(p.merge.lastFreePull, 0);
  assert.deepEqual(p.merge.knowledge.testedPairs, {}); assert.deepEqual(p.merge.knowledge.hintStages, {});
  assert.equal(p.merge.projects.selectedId, 'night_beacon'); assert.deepEqual(p.merge.projects.crafted, {});
  assert.deepEqual(p.merge.projects.extension, { keep: true });
  assert.equal(p.merge.supply.starterKitClaimed, false); assert.equal(p.merge.supply.dailyClaimDate, null);
  assert.deepEqual(p.merge.actionLedger, []); assert.equal(p.merge.mergeRevision, 0);
  assert.equal(p._mergeLabFence.epoch, p.merge.serverEpoch); assert.equal(p._mergeLabFence.highWaterRevision, 0);
  assert.equal(publicMergeLabState(p.merge).migration.archive, undefined);
});

test('new users keep identical starter progression, exact kit and immediate capped free-charge claim', () => {
  const clean = createDefaultPlayer('clean-fresh', 'Fresh', fixedNow), preserved = structuredClone(clean);
  ensureMergeLabState(clean, options);
  ensureMergeLabState(preserved, { ...options, policy: { ...MERGE_LAB_RELEASE_POLICY, migrationMode: 'preserve' } });
  assert.deepEqual(gameplay(clean.merge), gameplay(preserved.merge));
  for (const [type, payload, quoted] of [['researchPair', { leftItemId: 'cloud', rightItemId: 'ember' }, false], ['claimStarterKit', {}, true], ['claimFreeCharges', {}, false]]) {
    for (const p of [clean, preserved]) assert.equal(executeMergeLab(p, command(p, type, payload, quoted), options).ok, true);
    assert.deepEqual(gameplay(clean.merge), gameplay(preserved.merge));
  }
  assert.deepEqual(clean.merge.stock, catalog.starterKit);
  assert.equal(clean.merge.freeTapCharges, 30); assert.equal(clean.merge.alchemyEssence, 4);
});

test('clean-start runs once: persisted V3 progression, archive, receipt and epoch survive later logins and replay', () => {
  const p = createDefaultPlayer('clean-once', 'Fixture', fixedNow);
  p.merge.alchemyEssence = 123; ensureMergeLabState(p, options);
  const request = command(p, 'claimStarterKit', {}, true);
  assert.equal(executeMergeLab(p, request, options).ok, true);
  const once = JSON.parse(JSON.stringify(p));
  for (const policy of [MERGE_LAB_RELEASE_POLICY, { ...MERGE_LAB_RELEASE_POLICY, migrationMode: 'preserve' }]) {
    ensureMergeLabState(p, { now: fixedNow + 1000, policy, newEpoch: () => { throw Error('Already V3 must never rotate/reset'); } });
    assert.deepEqual(p, once);
  }
  const loaded = JSON.parse(JSON.stringify(once));
  ensureMergeLabState(loaded, { now: fixedNow + 2000, newEpoch: () => { throw Error('Reload must preserve the epoch'); } });
  assert.deepEqual(loaded, once);
  assert.equal(executeMergeLab(loaded, request, { now: fixedNow + 600001 }).replayed, true);
  assert.deepEqual(loaded, once); assert.equal(loaded.merge.migration.archive.merge.alchemyEssence, 123);
});
