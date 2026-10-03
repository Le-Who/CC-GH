import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTLEMENT_SAVE_KEY, LEGACY_SETTLEMENT_SAVE_KEY,
  settlementStorageBridge, lockSettlementCommand,
} from '../src/games/settlement/settlementPersistence.js';
import {
  normalizeCycle, advanceProduction, residentOrder, addCycleIncome,
  MAX_READY_BATCHES, PRODUCTION_MS,
} from '../src/games/settlement/settlementCycle.js';

function memoryStorage(entries = []) {
  const values = new Map(entries), writes = [];
  return {
    values, writes,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { writes.push([key, value]); values.set(key, value); },
    removeItem: key => values.delete(key),
  };
}
const saved = version => JSON.stringify({ version, state: {
  resources: { food: 11800, gems: 9876 },
  activeUpgrade: { buildingId: 'hearth-hall', completesAt: 123456 },
  constructedBuildings: { slot: { id: 'owned', level: 3 } },
  researchLevels: { masonry: 2 }, claimedGoalRewardIds: ['claimed'],
} });

test('legacy import copies the exact save once and never changes the old key', () => {
  const legacy = saved(10), storage = memoryStorage([[LEGACY_SETTLEMENT_SAVE_KEY, legacy]]);
  const bridge = settlementStorageBridge(storage);
  bridge.prepare(); bridge.prepare();
  assert.equal(storage.values.get(SETTLEMENT_SAVE_KEY), legacy);
  assert.equal(storage.values.get(LEGACY_SETTLEMENT_SAVE_KEY), legacy);
  assert.deepEqual(storage.writes, [[SETTLEMENT_SAVE_KEY, legacy]]);
});

test('an existing current save wins over a cached old client and is not rewritten', () => {
  const current = saved(11), legacy = saved(10);
  const storage = memoryStorage([[SETTLEMENT_SAVE_KEY, current], [LEGACY_SETTLEMENT_SAVE_KEY, legacy]]);
  settlementStorageBridge(storage).prepare();
  assert.equal(storage.values.get(SETTLEMENT_SAVE_KEY), current);
  assert.equal(storage.values.get(LEGACY_SETTLEMENT_SAVE_KEY), legacy);
  assert.deepEqual(storage.writes, []);
});

test('future current and legacy saves fail closed without writes or deletion', () => {
  for (const key of [SETTLEMENT_SAVE_KEY, LEGACY_SETTLEMENT_SAVE_KEY]) {
    const future = saved(12), storage = memoryStorage([[key, future]]);
    assert.throws(() => settlementStorageBridge(storage).prepare(), /Unsupported Settlement save/);
    assert.equal(storage.values.get(key), future);
    assert.deepEqual(storage.writes, []);
  }
});

test('malformed save JSON and missing state stay untouched', () => {
  for (const raw of ['{invalid', JSON.stringify({ version: 11 }), JSON.stringify({ version: 11, state: null })]) {
    const storage = memoryStorage([[SETTLEMENT_SAVE_KEY, raw]]);
    assert.throws(() => settlementStorageBridge(storage).prepare());
    assert.equal(storage.values.get(SETTLEMENT_SAVE_KEY), raw);
    assert.deepEqual(storage.writes, []);
  }
});

test('an inaccessible save is not replaced and a failed import retains legacy progress', () => {
  let writes = 0;
  assert.throws(() => settlementStorageBridge({
    getItem() { throw Error('unavailable'); }, setItem() { writes++; },
  }).prepare(), /unavailable/);
  assert.equal(writes, 0);
  const legacy = saved(10), storage = memoryStorage([[LEGACY_SETTLEMENT_SAVE_KEY, legacy]]);
  storage.setItem = () => { throw Error('quota'); };
  assert.throws(() => settlementStorageBridge(storage).prepare(), /quota/);
  assert.equal(storage.values.get(LEGACY_SETTLEMENT_SAVE_KEY), legacy);
  assert.equal(storage.values.has(SETTLEMENT_SAVE_KEY), false);
});

test('browser commands cannot run when IndexedDB serialization is unavailable', async () => {
  const before = globalThis.window, indexedDB = globalThis.indexedDB;
  globalThis.window = {}; globalThis.indexedDB = undefined;
  let ran = false;
  try {
    await assert.rejects(lockSettlementCommand(() => { ran = true; }), /storage unavailable/);
    assert.equal(ran, false);
  } finally { globalThis.window = before; globalThis.indexedDB = indexedDB; }
});

test('production catch-up is bounded and cycle counters are normalized', () => {
  const now = 1_000_000;
  assert.equal(advanceProduction({ ready: 0, productionAt: 0 }, now).ready, MAX_READY_BATCHES);
  const cycle = normalizeCycle({ ready: -3, deliveries: -1, development: 999, productionAt: now + PRODUCTION_MS }, now);
  assert.equal(cycle.ready, 0); assert.equal(cycle.deliveries, 0);
  assert.equal(cycle.development, 3); assert.equal(cycle.productionAt, now);
});

test('capacity-limited income never erases owned stock and leaves other balances intact', () => {
  const resources = { food: 11800, wood: 4, gems: 9876, gold: 2450 };
  assert.deepEqual(addCycleIncome(resources, { food: 100, wood: 20 }, { food: 1, wood: 10 }), {
    food: 11800, wood: 10, gems: 9876, gold: 2450,
  });
  assert.deepEqual(resources, { food: 11800, wood: 4, gems: 9876, gold: 2450 });
});

test('resident orders bind monotonically to the delivery counter and keep explicit cost/reward', () => {
  const first = residentOrder({ deliveries: 0 }), later = residentOrder({ deliveries: 4 });
  assert.equal(first.id, 'resident:0'); assert.equal(later.id, 'resident:4');
  assert.deepEqual(first.cost, { food: 70, wood: 20 });
  assert.deepEqual(first.reward, { gold: 90, prestige: 12 });
  assert.deepEqual(later.cost, first.cost);
  assert.deepEqual(later.reward, { gold: 110, prestige: 12 });
});
