import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { persist, createJSONStorage } from 'zustand/middleware';

const memory = new Map();
const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.localStorage = storage;
const { createSettlementStore } = await import('../src/games/settlement/useSettlementStore.js');
const key = 'village-ascend-v11-state', legacyKey = 'village-ascend-v2-state';
beforeEach(() => memory.clear());

test('a stale real second store reads the committed delivery before collecting', () => {
  const a = createSettlementStore({ storage }), b = createSettlementStore({ storage });
  assert.equal(a.getState().fulfillResidentOrder('resident:0'), true);
  const afterDelivery = { ...a.getState().resources };
  assert.equal(b.getState().collect(), true);
  const saved = JSON.parse(storage.getItem(key)).state;
  assert.equal(saved.settlementCycle.deliveries, 1);
  assert.equal(saved.settlementCycle.collected, 1);
  assert.equal(saved.resources.gold, afterDelivery.gold);
  assert.ok(saved.resources.food > afterDelivery.food);
  assert.equal(a.getState().fulfillResidentOrder('resident:0'), false);
});

test('a genuine v10 persist rollback cannot overwrite the new namespace or running upgrade', async () => {
  const current = createSettlementStore({ storage });
  current.getState().fulfillResidentOrder('resident:0');
  const upgrade = { buildingId: 'hearth-hall', fromLevel: 3, toLevel: 4, startedAt: Date.now(), completesAt: Date.now() + 600000, durationMs: 600000 };
  current.setState({ activeUpgrade: upgrade });
  const protectedSave = storage.getItem(key);
  // Reproduce the old client's actual Zustand v10 migration/partialization.
  storage.setItem(legacyKey, protectedSave);
  const old = createStore(persist(() => ({ resources: {}, activeUpgrade: null, activePanel: 'overview' }), {
    name: legacyKey, version: 10, storage: createJSONStorage(() => storage),
    migrate: state => ({ ...state, activeUpgrade: null }),
    partialize: state => ({ resources: state.resources, activeUpgrade: state.activeUpgrade, activePanel: state.activePanel }),
  }));
  old.setState({ activePanel: 'overview' });
  assert.equal(JSON.parse(storage.getItem(legacyKey)).version, 10);
  assert.equal(JSON.parse(storage.getItem(legacyKey)).state.settlementCycle, undefined);
  assert.equal(storage.getItem(key), protectedSave);
  await current.persist.rehydrate();
  assert.equal(current.getState().settlementCycle.deliveries, 1);
  assert.deepEqual(current.getState().activeUpgrade, upgrade);
});

test('an existing v11 legacy save is copied before an old client can erase it', () => {
  const original = createSettlementStore({ storage });
  original.getState().fulfillResidentOrder('resident:0');
  const oldSnapshot = storage.getItem(key);
  storage.setItem(legacyKey, oldSnapshot);
  storage.removeItem(key); // Memory fixture only; production migration never removes a save.
  const next = createSettlementStore({ storage });
  assert.equal(storage.getItem(key), oldSnapshot);
  storage.setItem(legacyKey, JSON.stringify({ version: 10, state: { settlementCycle: undefined, activeUpgrade: null } }));
  next.getState().collect();
  assert.equal(JSON.parse(storage.getItem(key)).state.settlementCycle.deliveries, 1);
});

test('queued conflicting commands serialize before reading state and debit an order once', async () => {
  let tail = Promise.resolve();
  const lock = work => { const result = tail.then(work); tail = result.catch(() => {}); return result; };
  const a = createSettlementStore({ storage, lock }), b = createSettlementStore({ storage, lock });
  await Promise.all([a.ready, b.ready]);
  const before = { ...a.getState().resources };
  assert.deepEqual(await Promise.all([a.getState().fulfillResidentOrder('resident:0'), b.getState().fulfillResidentOrder('resident:0')]), [true, false]);
  assert.equal(JSON.parse(storage.getItem(key)).state.settlementCycle.deliveries, 1);
  assert.equal(JSON.parse(storage.getItem(key)).state.resources.food, before.food - 70);
  await b.getState().collect();
  assert.equal(JSON.parse(storage.getItem(key)).state.settlementCycle.deliveries, 1);
});

test('a failed write rolls in-memory balances back to the last committed save', () => {
  let fail = false;
  const faulty = { ...storage, setItem: (key, value) => { if (fail) throw Error('quota'); storage.setItem(key, value); } };
  const state = createSettlementStore({ storage: faulty });
  state.getState().collect();
  const before = JSON.parse(storage.getItem(key)).state;
  fail = true;
  assert.equal(state.getState().fulfillResidentOrder('resident:0'), false);
  assert.deepEqual(state.getState().resources, before.resources);
  assert.deepEqual(state.getState().settlementCycle, before.settlementCycle);
  assert.equal(state.getState().persistenceError, true);
});

test('an unfinished upgrade cannot be replaced by a different building upgrade', () => {
  const state = createSettlementStore({ storage });
  assert.equal(state.getState().upgradeBuilding('hearth-hall'), true);
  const active = { ...state.getState().activeUpgrade };
  assert.equal(state.getState().upgradeBuilding('common-garden'), false);
  assert.deepEqual(state.getState().activeUpgrade, active);
});

test('storage migration preserves unsupported future saves and fails closed', () => {
  const future = JSON.stringify({ version: 12, state: { resources: { gems: 12345 } } });
  storage.setItem(key, future);
  const state = createSettlementStore({ storage });
  assert.equal(state.getState().collect(), false);
  assert.equal(storage.getItem(key), future);
  assert.equal(state.getState().persistenceError, true);
});

test('capacity changes and legacy rewards retain stock above capacity', () => {
  const state = createSettlementStore({ storage });
  state.setState(s => ({ resources: { ...s.resources, gems: 9876, food: 11800 } }));
  state.getState().adjustInventoryCap('food', -10000);
  state.getState().claimGoalRewards();
  assert.equal(state.getState().resources.food, 11800);
  assert.equal(state.getState().resources.gems, 9876);
});

test('a failed command lock cannot mutate the save or balances', async () => {
  const original = createSettlementStore({ storage });
  original.getState().collect();
  const saved = storage.getItem(key);
  const blocked = createSettlementStore({ storage, lock: () => Promise.reject(Error('blocked')) });
  await blocked.ready;
  const before = blocked.getState().resources;
  assert.equal(await blocked.getState().fulfillResidentOrder('resident:0'), false);
  assert.deepEqual(blocked.getState().resources, before);
  assert.equal(storage.getItem(key), saved);
});

test('a write failure followed by inaccessible storage restores the pre-command snapshot', () => {
  let blocked = false, failNext = false;
  const faulty = {
    ...storage,
    getItem: key => { if (blocked) throw Error('unavailable'); return storage.getItem(key); },
    setItem: (key, value) => { if (failNext) { blocked = true; throw Error('unavailable'); } storage.setItem(key, value); },
  };
  const state = createSettlementStore({ storage: faulty });
  state.getState().collect();
  const before = state.getState();
  failNext = true;
  assert.equal(state.getState().fulfillResidentOrder('resident:0'), false);
  assert.deepEqual(state.getState().resources, before.resources);
  assert.deepEqual(state.getState().settlementCycle, before.settlementCycle);
});
