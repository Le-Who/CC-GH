import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
const { useSettlementStore: store } = await import('../src/games/settlement/useSettlementStore.js');
const { buildingAsset } = await import('../src/games/settlement/assetRegistry.js');
const { CONSTRUCTION_PANEL_DATA, RESEARCH_PANEL_DATA } = await import('../src/games/settlement/gameData.js');
beforeEach(() => store.getState().resetSettlement());

test('collect consumes a ready batch once; repeated presses cannot mint resources', () => {
  store.getState().collect();
  const after = { ...store.getState().resources };
  store.getState().collect();
  assert.deepEqual(store.getState().resources, after);
});

test('a resident delivery spends stock and rejects its stale id', () => {
  assert.equal(typeof store.getState().fulfillResidentOrder, 'function');
  const before = store.getState();
  const id = `resident:${before.settlementCycle.deliveries}`;
  assert.equal(before.fulfillResidentOrder(id), true);
  const after = store.getState();
  assert.equal(after.settlementCycle.deliveries, 1);
  assert.ok(after.resources.food < before.resources.food);
  assert.ok(after.resources.gold > before.resources.gold);
  assert.equal(after.fulfillResidentOrder(id), false);
  assert.deepEqual(store.getState().resources, after.resources);
});

test('development requires deliveries and stock, upgrades the actual scene level once', () => {
  assert.equal(typeof store.getState().developSettlement, 'function');
  assert.equal(store.getState().developSettlement(0), false);
  for (let i = 0; i < 3; i++) assert.equal(store.getState().fulfillResidentOrder(`resident:${i}`), true);
  const before = store.getState();
  assert.equal(before.developSettlement(0), true);
  const after = store.getState();
  assert.notEqual(buildingAsset('cottage-ring', after.levels['cottage-ring']), buildingAsset('cottage-ring', before.levels['cottage-ring']));
  assert.ok(after.population > before.population);
  assert.equal(after.settlementCycle.development, 1);
  assert.equal(after.developSettlement(0), false);
});

test('legacy migration preserves acquisitions and a running building upgrade', async () => {
  const before = store.getState();
  const upgrade = { buildingId: 'hearth-hall', fromLevel: 3, toLevel: 4, startedAt: Date.now(), completesAt: Date.now() + 600000, durationMs: 600000 };
  const slotId = CONSTRUCTION_PANEL_DATA.placementSlots[0].id;
  const purchased = { [slotId]: { id: `built:${slotId}`, slotId, itemId: CONSTRUCTION_PANEL_DATA.items[0].id, level: 3, builtAt: Date.now() } };
  const research = { nodeId: RESEARCH_PANEL_DATA.nodes[0].id, fromLevel: 0, toLevel: 1, startedAt: Date.now(), completesAt: Date.now() + 600000, durationMs: 600000 };
  const legacy = { resources: { ...before.resources, food: 9999, gems: 876 }, levels: { ...before.levels, 'common-garden': 8 }, claimedGoalRewardIds: ['legacy'], inventoryCaps: before.inventoryCaps, researchLevels: { ...before.researchLevels }, activeUpgrade: upgrade, activeResearch: research, constructedBuildings: purchased };
  localStorage.setItem('village-ascend-v2-state', JSON.stringify({ version: 10, state: legacy }));
  memory.delete('village-ascend-v11-state'); // New-client fixture has not migrated yet.
  await store.persist.rehydrate();
  assert.deepEqual(store.getState().resources, legacy.resources);
  assert.equal(store.getState().levels['common-garden'], 8);
  assert.deepEqual(store.getState().activeUpgrade, upgrade);
  assert.deepEqual(store.getState().activeResearch, research);
  assert.deepEqual(store.getState().constructedBuildings, purchased);
  assert.deepEqual(store.getState().claimedGoalRewardIds, ['legacy']);
  assert.equal(store.getState().settlementCycle.ready, 1);
});

test('collecting above capacity never removes owned stock and a full warehouse keeps its batch', () => {
  const state = store.getState();
  store.setState({ inventoryCaps: { food: 1, wood: 1, stone: 1, goods: 1, culture: 1 } });
  assert.equal(store.getState().collect(), false);
  assert.deepEqual(store.getState().resources, state.resources);
  assert.equal(store.getState().settlementCycle.ready, 1);
});

test('rehydration normalizes invalid cycle fields even at the current save version', async () => {
  const state = JSON.parse(localStorage.getItem('village-ascend-v11-state'));
  state.state.settlementCycle = { ready: -3, productionAt: Date.now() + 999999, deliveries: -1, development: 50, collected: null };
  localStorage.setItem('village-ascend-v11-state', JSON.stringify(state));
  await store.persist.rehydrate();
  const cycle = store.getState().settlementCycle;
  assert.equal(cycle.ready, 0);
  assert.equal(cycle.development, 3);
  assert.equal(cycle.deliveries, 0);
  assert.ok(cycle.productionAt <= Date.now());
});

test('production offline catchup stops at three batches and survives rehydration', async () => {
  assert.ok(store.getState().settlementCycle);
  store.setState({ settlementCycle: { ...store.getState().settlementCycle, ready: 0, productionAt: Date.now() - 86400000 }, lastTick: Date.now() - 86400000 });
  store.getState().tick();
  assert.equal(store.getState().settlementCycle.ready, 3);
  store.getState().collect();
  const saved = JSON.parse(JSON.stringify(store.getState().settlementCycle));
  await store.persist.rehydrate();
  assert.deepEqual(store.getState().settlementCycle, saved);
});

test('unaffordable orders and development leave progress and balances intact', () => {
  assert.equal(typeof store.getState().fulfillResidentOrder, 'function');
  store.setState({ resources: { ...store.getState().resources, food: 0, wood: 0, stone: 0, goods: 0, gold: 0 } });
  const before = store.getState();
  assert.equal(before.fulfillResidentOrder('resident:0'), false);
  assert.deepEqual(store.getState().resources, before.resources);
  store.setState({ settlementCycle: { ...before.settlementCycle, deliveries: 3 } });
  assert.equal(store.getState().developSettlement(0), false);
  assert.equal(store.getState().settlementCycle.development, 0);
});

test('twelve deliveries finish three developments and the repeatable economy continues', () => {
  const initialYield = store.getState().resources;
  store.getState().collect();
  for (let i = 0; i < 12; i++) {
    assert.equal(store.getState().fulfillResidentOrder(`resident:${i}`), true);
    if ([2, 6, 11].includes(i)) assert.equal(store.getState().developSettlement(store.getState().settlementCycle.development), true);
  }
  assert.equal(store.getState().settlementCycle.development, 3);
  assert.equal(store.getState().levels['cottage-ring'], 4);
  assert.equal(store.getState().levels['common-garden'], 4);
  assert.equal(store.getState().levels['hearth-hall'], 4);
  assert.equal(store.getState().developSettlement(3), false);
  assert.equal(store.getState().fulfillResidentOrder('resident:12'), true);
  assert.ok(Object.values(store.getState().resources).every(value => value >= 0));
  assert.equal(store.getState().resources.gems, initialYield.gems);
});
