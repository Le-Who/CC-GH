import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { isGardenR2Action, gardenR2AccountMatches, compareSnapshotFreshness, mergeGardenR2Snapshot, protectGardenR2Snapshot } from '../src/game-state/gardenR2Snapshot.js';
import { withNormalizedSnapshot } from '../src/game-state/inventory.js';

// Exercise the real hub transitions without React, browser storage, installs or
// network. The Zustand adapter implements only its vanilla get/set contract.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (['zustand', 'idb-keyval'].includes(specifier)) return { shortCircuit: true, url: `garden-r2-store-test:${specifier}` };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'garden-r2-store-test:zustand') return { shortCircuit: true, format: 'module', source: `
      export function create(initializer) {
        let state; const listeners = new Set();
        const get = () => state;
        const set = update => { const prev = state; const value = typeof update === 'function' ? update(state) : update; if (value === state) return; state = { ...state, ...value }; for (const listener of listeners) listener(state, prev); };
        const store = selector => selector ? selector(state) : state;
        store.getState = get; store.setState = set;
        store.subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
        state = initializer(set, get, store); return store;
      }` };
    if (url === 'garden-r2-store-test:idb-keyval') return { shortCircuit: true, format: 'module', source: `export async function get(){return []} export async function set(){}` };
    return next(url, context);
  },
});
const { useGameHub } = await import('../src/game-state/useGameHub.js');
hooks.deregister();

function snapshot({ revision = 1, seq = 10, time = 1000, gold = 100, id = 'account-a' } = {}) {
  return withNormalizedSnapshot({
    player: { id, syncSeq: seq, username: 'Garden player', onboarded: true }, serverTime: time,
    gardenR2Available: true,
    garden: { name: `revision-${revision}`, plants: [{ id: `plant-${revision}` }], economicRevision: 1 },
    gardenR2: { revision, version: 2, serverNow: time, chapter: revision },
    resources: { gold, gachaTokens: 7, energy: { current: 29, max: 30 }, other: 'unchanged' },
    yard: { currencies: { treats: 91 }, foodInventory: { fresh: 4 }, goodieInventory: { bench: 3 } },
    merge: { schemaVersion: 3, stock: { essence: 5 }, itemCounts: { essence: 5 }, board: ['current'] },
    farm: { plots: ['farm-current'], harvested: { carrot: 6 } },
    room: { roomInventory: ['chair'] },
    gacha: { lastPull: 'current' }, pet: { name: 'Mika' }, achievements: { raw: { garden: 1 } },
    meta: { stable: 'catalog' }, blox: { score: 99 }, trivia: { score: 100 },
  });
}
function realtime(full) {
  return {
    accountId: full.player.id, syncSeq: full.player.syncSeq, serverTime: full.serverTime,
    resources: full.resources, garden: full.garden, gardenR2: full.gardenR2,
    yard: full.yard, merge: full.merge,
  };
}
const response = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });
function deferredRequest(endpoint = "/api/player/mutate") {
  let finish, started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { finish = resolve; });
  globalThis.fetch = async (path, options) => {
    if (path === '/api/config') return response({ devAuthEnabled: false });
    assert.equal(path, endpoint);
    started(options.body ? JSON.parse(options.body) : null);
    return pending;
  };
  return { ready, finish: body => finish(response(body)) };
}
function action(command = 'garden.r2', key = command) {
  return useGameHub.getState().performReliableAction(command, { accountId: 'account-a' }, { clientActionId: key, feedback: false });
}
function expectUnrelatedUnchanged(actual, expected) {
  for (const key of ['yard', 'merge', 'farm', 'room', 'gacha', 'pet', 'achievements', 'meta', 'blox', 'trivia']) {
    assert.equal(actual[key], expected[key], `${key} must be preserved by reference`);
  }
  assert.equal(actual.resources.gachaTokens, expected.resources.gachaTokens);
  assert.deepEqual(actual.resources.energy, expected.resources.energy);
  assert.equal(actual.player.username, expected.player.username);
  const { rewards: actualRewards, ...actualInventory } = actual.inventory;
  const { rewards: expectedRewards, ...expectedInventory } = expected.inventory;
  assert.deepEqual(actualInventory, expectedInventory);
  assert.deepEqual({ ...actualRewards, gold: 0 }, { ...expectedRewards, gold: 0 });
}

beforeEach(() => {
  useGameHub.setState({ snapshot: snapshot(), status: 'ready', message: '', busy: {}, pendingActions: [], outboxLoaded: true, lastResult: null });
});

test('only the two exact R2 command names select the narrow action contract', () => {
  assert.equal(isGardenR2Action('garden.r2'), true);
  assert.equal(isGardenR2Action('garden.r2.reconcile'), true);
  for (const value of ['garden.buyPlant', 'garden.r2.other', 'merge.lab', null]) assert.equal(isGardenR2Action(value), false);
});

test('Garden response copies only Garden, gold and observation metadata', () => {
  const current = snapshot(), incoming = snapshot({ revision: 2, seq: 11, time: 2000, gold: 75 });
  incoming.yard = { stale: true }; incoming.merge = { schemaVersion: 1 }; incoming.resources.gachaTokens = 1;
  incoming.resources.energy.current = 1; incoming.player.username = 'stale'; incoming.meta = { stale: true };
  const actual = mergeGardenR2Snapshot(current, incoming);
  expectUnrelatedUnchanged(actual, current);
  assert.equal(actual.garden, incoming.garden); assert.equal(actual.gardenR2, incoming.gardenR2);
  assert.equal(actual.resources.gold, 75); assert.equal(actual.inventory.rewards.gold, 75);
  assert.equal(actual.serverTime, 2000); assert.equal(actual.player.syncSeq, 11);
});

test('account fencing requires a verified matching identity and rejects conflicting IDs', () => {
  const current = snapshot(), incoming = snapshot({ revision: 2 });
  for (const changed of [null, {}, { ...incoming, player: { id: 'other' } }, { ...incoming, accountId: 'other' }, { ...incoming, gardenR2: { ...incoming.gardenR2, accountId: 'other' } }]) {
    assert.equal(mergeGardenR2Snapshot(current, changed), current);
  }
  assert.equal(gardenR2AccountMatches(current, realtime(incoming)), true);
  assert.equal(mergeGardenR2Snapshot(current, incoming, { accountId: 'other' }), current);
});

test('older and malformed Garden revisions cannot roll back Garden or shared gold', () => {
  const current = snapshot({ revision: 4 });
  for (const revision of [3, -1, null, '5', NaN, Infinity]) {
    assert.equal(mergeGardenR2Snapshot(current, snapshot({ revision, seq: 99, time: 9000, gold: 1 })), current);
  }
  const incomplete = snapshot({ revision: 5 }); delete incomplete.garden;
  assert.equal(mergeGardenR2Snapshot(current, incomplete), current);
});

test('equal-revision responses respect shared seq/time and Garden serverNow freshness', () => {
  const current = snapshot({ revision: 4, seq: 40, time: 4000, gold: 400 });
  for (const incoming of [snapshot({ revision: 4, seq: 39, time: 5000 }), snapshot({ revision: 4, seq: 40, time: 3999 }), snapshot({ revision: 4, seq: 40, time: 4000 })]) {
    incoming.gardenR2.serverNow = 3999;
    assert.equal(mergeGardenR2Snapshot(current, incoming), current);
  }
});

test('newer Garden revision may arrive behind newer unrelated gold and must preserve that gold', () => {
  const current = snapshot({ revision: 2, seq: 20, time: 2000, gold: 800 });
  const incoming = snapshot({ revision: 3, seq: 19, time: 1900, gold: 75 });
  const actual = mergeGardenR2Snapshot(current, incoming);
  assert.equal(actual.gardenR2.revision, 3); assert.equal(actual.resources.gold, 800);
  assert.equal(actual.inventory.rewards.gold, 800); assert.equal(actual.serverTime, 2000); assert.equal(actual.player.syncSeq, 20);
});

test('committed sequence takes precedence when server wall-clock moves backward', () => {
  const current = snapshot(), incoming = snapshot({ revision: 2, seq: 11, time: 900, gold: 75 });
  assert.equal(compareSnapshotFreshness(incoming, current), 1);
  const actual = mergeGardenR2Snapshot(current, incoming);
  assert.equal(actual.resources.gold, 75); assert.equal(actual.serverTime, 1000); assert.equal(actual.player.syncSeq, 11);
});

test('an unversioned gold update observed during the request is not overwritten', () => {
  const requestSnapshot = snapshot(), current = { ...requestSnapshot, resources: { ...requestSnapshot.resources, gold: 777 } };
  const actual = mergeGardenR2Snapshot(current, snapshot({ revision: 2, time: 2000, seq: 11, gold: 75 }), { requestSnapshot });
  assert.equal(actual.gardenR2.revision, 2); assert.equal(actual.resources.gold, 777);
});

for (const command of ['garden.r2', 'garden.r2.reconcile']) test(`${command} reliable receipt uses narrow store application`, async () => {
  const request = deferredRequest(), pending = action(command);
  const sent = await request.ready; assert.equal(sent.action, command); assert.equal(sent.clientActionId, command);
  const newer = snapshot({ seq: 11, time: 1500, gold: 160 }); newer.yard.currencies.treats = 777; newer.merge.stock.essence = 999;
  newer.resources.gachaTokens = 30; newer.resources.energy.current = 8;
  useGameHub.getState().applySnapshot(newer);
  const current = useGameHub.getState().snapshot;
  request.finish({ success: true, snapshot: snapshot({ revision: 2, seq: 12, time: 2000, gold: 135 }) });
  assert.equal((await pending).success, true);
  const actual = useGameHub.getState().snapshot;
  expectUnrelatedUnchanged(actual, current); assert.equal(actual.gardenR2.revision, 2);
  assert.equal(actual.resources.gold, 135); assert.equal(actual.inventory.rewards.gold, 135);
  assert.deepEqual(useGameHub.getState().busy, {});
});

test('out-of-order R2 action responses cannot replace the newer response', async () => {
  const responses = new Map();
  globalThis.fetch = async (path, options) => {
    if (path === '/api/config') return response({});
    const id = JSON.parse(options.body).clientActionId;
    return new Promise(resolve => responses.set(id, body => resolve(response(body))));
  };
  const first = action('garden.r2', 'first'), second = action('garden.r2', 'second');
  await new Promise(resolve => setImmediate(resolve));
  responses.get('second')({ success: true, snapshot: snapshot({ revision: 3, seq: 12, time: 3000, gold: 50 }) }); await second;
  const current = useGameHub.getState().snapshot;
  responses.get('first')({ success: true, snapshot: snapshot({ revision: 2, seq: 11, time: 2000, gold: 75 }) }); await first;
  assert.equal(useGameHub.getState().snapshot, current); assert.deepEqual(useGameHub.getState().busy, {});
});

test('newer realtime wins over a late action-time response at the same Garden revision', async () => {
  const request = deferredRequest(), pending = action(); await request.ready;
  useGameHub.getState().applyRealtimePayload(realtime(snapshot({ revision: 2, seq: 12, time: 3000, gold: 800 })));
  const current = useGameHub.getState().snapshot;
  request.finish({ success: true, snapshot: snapshot({ revision: 2, seq: 11, time: 2000, gold: 75 }) }); await pending;
  assert.equal(useGameHub.getState().snapshot, current); assert.equal(current.resources.gold, 800);
});

test('account switch while a request is pending fences both success and errors', async () => {
  for (const result of [{ success: true, snapshot: snapshot({ revision: 99, gold: 1 }) }, { error: 'NETWORK_ERROR' }]) {
    useGameHub.setState({ snapshot: snapshot(), busy: {}, message: '', lastResult: null });
    const request = deferredRequest(), pending = action(); await request.ready;
    useGameHub.getState().applySnapshot(snapshot({ id: 'account-b', revision: 8, gold: 555 }));
    const current = useGameHub.getState().snapshot;
    request.finish(result); await pending;
    assert.equal(useGameHub.getState().snapshot, current); assert.equal(useGameHub.getState().message, '');
    assert.equal(useGameHub.getState().lastResult, null);
  }
});

test('foreign or missing command account is rejected before any network request', async () => {
  let requests = 0; globalThis.fetch = () => { requests++; throw Error('must not request'); };
  for (const payload of [{ accountId: 'other' }, {}]) {
    const result = await useGameHub.getState().performAction('garden.r2', payload);
    assert.equal(result.error, 'GARDEN_R2_ACCOUNT_MISMATCH');
  }
  assert.equal(requests, 0);
});

test('realtime accepts same-account authoritative R2 and rejects foreign/unscoped/stale events', () => {
  useGameHub.getState().applyRealtimePayload(realtime(snapshot({ revision: 2, seq: 11, time: 2000, gold: 75 })));
  const current = useGameHub.getState().snapshot;
  assert.equal(current.gardenR2.revision, 2); assert.equal(current.resources.gold, 75); assert.equal(current.player.syncSeq, 11);
  const missingAccount = realtime(snapshot({ revision: 3, seq: 12 })); delete missingAccount.accountId;
  for (const payload of [realtime(snapshot({ id: 'other', revision: 9, seq: 99 })), missingAccount, realtime(snapshot({ revision: 1, seq: 9 }))]) {
    useGameHub.getState().applyRealtimePayload(payload); assert.equal(useGameHub.getState().snapshot, current);
  }
});

test('delayed pre-adoption full snapshot cannot demote an adopted Garden', async () => {
  const legacy = snapshot(); delete legacy.gardenR2; legacy.garden.name = 'legacy';
  useGameHub.setState({ snapshot: legacy });
  const request = deferredRequest();
  const pending = useGameHub.getState().performAction('garden.sync', {}, { feedback: false }); await request.ready;
  useGameHub.getState().applySnapshot(snapshot({ revision: 2, seq: 12, time: 2000, gold: 888 }));
  request.finish({ success: true, snapshot: { ...legacy, gardenR2: null } }); await pending;
  const actual = useGameHub.getState().snapshot;
  assert.equal(actual.gardenR2.revision, 2); assert.equal(actual.garden.name, 'revision-2');
  assert.equal(actual.resources.gold, 888); assert.equal(actual.serverTime, 2000); assert.equal(actual.player.syncSeq, 12);
});

test('full snapshot guards an older R2 without changing unrelated legacy snapshot application', () => {
  const current = snapshot({ revision: 4, seq: 40, time: 4000, gold: 444 });
  const incoming = snapshot({ revision: 3, seq: 30, time: 3000, gold: 333 }); incoming.yard.currencies.treats = 222;
  const actual = protectGardenR2Snapshot(current, incoming);
  assert.equal(actual.gardenR2.revision, 4); assert.equal(actual.resources.gold, 444);
  assert.equal(actual.yard.currencies.treats, 222);
  assert.equal(protectGardenR2Snapshot({ ...current, gardenR2: null }, incoming), incoming);
  const other = snapshot({ id: 'account-b' }); assert.equal(protectGardenR2Snapshot(current, other), other);
});

test('a pre-adoption realtime event cannot remove R2 or roll back its gold', () => {
  const payload = realtime(snapshot({ revision: 0, seq: 11, time: 2000, gold: 1 })); payload.gardenR2 = null;
  useGameHub.getState().applyRealtimePayload(payload);
  const actual = useGameHub.getState().snapshot;
  assert.equal(actual.gardenR2.revision, 1); assert.equal(actual.garden.name, 'revision-1'); assert.equal(actual.resources.gold, 100);
});

test('legacy realtime partial Garden and Yard behavior remains unchanged before adoption', () => {
  useGameHub.setState({ snapshot: { ...snapshot(), gardenR2: null } });
  useGameHub.getState().applyRealtimePayload({ garden: { level: 5 } });
  useGameHub.getState().applyRealtimePayload({ yard: { currencies: { treats: 145 } } });
  const actual = useGameHub.getState().snapshot;
  assert.equal(actual.garden.level, 5); assert.equal(actual.garden.name, 'revision-1');
  assert.equal(actual.yard.currencies.treats, 145); assert.equal(actual.resources.gold, 100);
});

test('non-R2 reliable actions retain complete snapshot updates before adoption', async () => {
  useGameHub.setState({ snapshot: { ...snapshot(), gardenR2: null } });
  const request = deferredRequest();
  const pending = useGameHub.getState().performReliableAction('blox.place', {}, { clientActionId: 'legacy-blox', feedback: false });
  await request.ready;
  const incoming = snapshot({ gold: 101 }); incoming.gardenR2 = null; incoming.blox.score = 1234;
  request.finish({ success: true, snapshot: incoming }); await pending;
  assert.equal(useGameHub.getState().snapshot.blox.score, 1234); assert.equal(useGameHub.getState().snapshot.resources.gold, 101);
});


test('a foreign response cannot update R2 snapshot or last-result metadata', async () => {
  const request = deferredRequest(), pending = action(); await request.ready;
  const current = useGameHub.getState().snapshot;
  request.finish({ success: true, snapshot: snapshot({ id: 'other', revision: 99 }) }); await pending;
  assert.equal(useGameHub.getState().snapshot, current); assert.equal(useGameHub.getState().lastResult, null);
  assert.deepEqual(useGameHub.getState().busy, {});
});

test('ordinary R2 failures preserve the snapshot and legacy error reporting contract', async () => {
  const request = deferredRequest(), pending = action(); await request.ready;
  const current = useGameHub.getState().snapshot;
  request.finish({ error: 'GARDEN_R2_INSUFFICIENT_GOLD', snapshot: snapshot({ revision: 3 }) });
  const result = await pending;
  assert.equal(result.error, 'GARDEN_R2_INSUFFICIENT_GOLD'); assert.equal(useGameHub.getState().snapshot, current);
  assert.equal(useGameHub.getState().message, result.error); assert.deepEqual(useGameHub.getState().busy, {});
});

test('explicit account replacement can switch from adopted R2 to a legacy account', () => {
  const next = snapshot({ id: 'account-b' }); next.gardenR2 = null;
  useGameHub.getState().applySnapshot(next);
  assert.equal(useGameHub.getState().snapshot.player.id, 'account-b'); assert.equal(useGameHub.getState().snapshot.gardenR2, null);
});


test('blocked projection on a same-account error surfaces the blocker without importing corrupt economy', async () => {
  const request = deferredRequest(), pending = action(); await request.ready;
  const current = useGameHub.getState().snapshot, incoming = snapshot({ seq: 11, time: 2000, gold: 1 });
  incoming.gardenR2 = { version: 1, blocked: true, error: 'GARDEN_R2_STATE_INVALID' };
  incoming.garden = { corrupt: true }; incoming.yard = { stale: true };
  request.finish({ error: 'GARDEN_R2_STATE_INVALID', snapshot: incoming }); await pending;
  const actual = useGameHub.getState().snapshot;
  assert.equal(actual.gardenR2.blocked, true); assert.equal(actual.gardenR2.error, 'GARDEN_R2_STATE_INVALID');
  assert.equal(actual.garden, current.garden); assert.equal(actual.resources.gold, current.resources.gold);
  expectUnrelatedUnchanged(actual, current); assert.equal(actual.player.syncSeq, 11);
});

test('blocked namespace survives delayed legacy, valid-but-old and null realtime snapshots', () => {
  const current = snapshot({ seq: 20, time: 2000 }); current.gardenR2 = { version: 1, blocked: true, error: 'CLIENT_UPDATE_REQUIRED' };
  useGameHub.setState({ snapshot: current });
  const incoming = snapshot({ seq: 19, time: 1900, gold: 1 });
  for (const view of [null, undefined, incoming.gardenR2]) {
    const result = protectGardenR2Snapshot(current, { ...incoming, gardenR2: view });
    assert.equal(result.gardenR2, current.gardenR2); assert.equal(result.garden, current.garden);
    assert.equal(result.resources.gold, current.resources.gold);
  }
  useGameHub.getState().applyRealtimePayload({ ...realtime(incoming), gardenR2: null });
  assert.equal(useGameHub.getState().snapshot, current);
  const sameObservation = mergeGardenR2Snapshot(current, snapshot({ seq: 20, time: 2000 }));
  assert.equal(sameObservation, current);
});

test('newer valid authoritative snapshot can recover a blocked projection', () => {
  const current = snapshot(); current.gardenR2 = { version: 1, blocked: true, error: 'GARDEN_R2_STATE_INVALID' };
  const incoming = snapshot({ revision: 3, seq: 11, time: 2000, gold: 333 });
  const actual = mergeGardenR2Snapshot(current, incoming);
  assert.equal(actual.gardenR2, incoming.gardenR2); assert.equal(actual.resources.gold, 333);
});

test('foreign and older blocked projections cannot overwrite a healthy Garden', () => {
  const current = snapshot({ revision: 4, seq: 40, time: 4000 });
  for (const incoming of [snapshot({ id: 'other', seq: 99, time: 9000 }), snapshot({ seq: 39, time: 3900 })]) {
    incoming.gardenR2 = { blocked: true, error: 'GARDEN_R2_STATE_INVALID' };
    assert.equal(mergeGardenR2Snapshot(current, incoming), current);
  }
});


for (const code of ['GARDEN_R2_REVISION_CONFLICT', 'CLIENT_UPDATE_REQUIRED', 'GARDEN_R2_CLIENT_UPDATE_REQUIRED']) {
  test(`${code} reconciles only authoritative Garden/gold through the normal freshness guards`, async () => {
    const request = deferredRequest(), pending = action(); await request.ready;
    const current = useGameHub.getState().snapshot, incoming = snapshot({ revision: 3, seq: 12, time: 3000, gold: 75 });
    incoming.yard = { stale: true }; incoming.merge = { stale: true }; incoming.resources.gachaTokens = 1;
    incoming.resources.energy.current = 1;
    request.finish({ error: code, snapshot: incoming });
    const result = await pending, actual = useGameHub.getState().snapshot;
    assert.equal(result.error, code); assert.equal(useGameHub.getState().message, code);
    assert.equal(useGameHub.getState().lastResult.error, code); assert.deepEqual(useGameHub.getState().busy, {});
    assert.equal(actual.garden.name, 'revision-3'); assert.equal(actual.gardenR2.revision, 3);
    assert.equal(actual.resources.gold, 75); assert.equal(actual.inventory.rewards.gold, 75);
    assert.equal(actual.player.syncSeq, 12); assert.equal(actual.serverTime, 3000);
    expectUnrelatedUnchanged(actual, current);
  });

  test(`${code} cannot apply a stale or foreign error snapshot`, async () => {
    for (const incoming of [snapshot({ revision: 0, seq: 99, time: 9000 }), snapshot({ revision: 1, seq: 9, time: 900 }), snapshot({ id: 'other', revision: 9, seq: 99, time: 9000 })]) {
      useGameHub.setState({ snapshot: snapshot(), busy: {}, message: '', lastResult: null });
      const request = deferredRequest(), pending = action(); await request.ready;
      const current = useGameHub.getState().snapshot;
      request.finish({ error: code, snapshot: incoming }); await pending;
      assert.equal(useGameHub.getState().snapshot, current);
      if (incoming.player.id !== current.player.id) {
        assert.equal(useGameHub.getState().message, ''); assert.equal(useGameHub.getState().lastResult, null);
      }
    }
  });
}

test('conflict snapshot advances Garden but retains gold from a newer realtime observation', async () => {
  const request = deferredRequest(), pending = action(); await request.ready;
  useGameHub.getState().applyRealtimePayload(realtime(snapshot({ revision: 2, seq: 20, time: 4000, gold: 800 })));
  const current = useGameHub.getState().snapshot;
  request.finish({ error: 'GARDEN_R2_REVISION_CONFLICT', snapshot: snapshot({ revision: 3, seq: 19, time: 3000, gold: 75 }) }); await pending;
  const actual = useGameHub.getState().snapshot;
  assert.equal(actual.gardenR2.revision, 3); assert.equal(actual.resources.gold, 800); assert.equal(actual.inventory.rewards.gold, 800);
  assert.equal(actual.player.syncSeq, 20); assert.equal(actual.serverTime, 4000); expectUnrelatedUnchanged(actual, current);
});

test('legacy Garden update-required response can adopt the current R2 view without replacing unrelated slices', async () => {
  useGameHub.setState({ snapshot: { ...snapshot(), gardenR2: null } });
  const request = deferredRequest();
  const pending = useGameHub.getState().performAction('garden.sync', {}, { feedback: false }); await request.ready;
  const current = useGameHub.getState().snapshot, incoming = snapshot({ revision: 2, seq: 11, time: 2000, gold: 90 });
  incoming.yard = { stale: true };
  request.finish({ error: 'CLIENT_UPDATE_REQUIRED', snapshot: incoming }); await pending;
  const actual = useGameHub.getState().snapshot;
  assert.equal(actual.gardenR2.revision, 2); assert.equal(actual.resources.gold, 90); expectUnrelatedUnchanged(actual, current);
});

test('non-Garden error responses retain their existing snapshot contract', async () => {
  const request = deferredRequest();
  const pending = useGameHub.getState().performAction('blox.place', {}, { feedback: false }); await request.ready;
  const current = useGameHub.getState().snapshot;
  request.finish({ error: 'CLIENT_UPDATE_REQUIRED', snapshot: snapshot({ revision: 2, seq: 11, time: 2000 }) }); await pending;
  assert.equal(useGameHub.getState().snapshot, current); assert.equal(useGameHub.getState().message, 'CLIENT_UPDATE_REQUIRED');
});


for (const [kind, result] of [
  ['success', snapshot({ revision: 99, seq: 99, time: 9900, gold: 1 })],
  ['failure', { error: 'NETWORK_ERROR' }],
]) test(`delayed snapshot ${kind} from A cannot replace B or its ready status/message`, async () => {
  const request = deferredRequest('/api/player/snapshot');
  const pending = useGameHub.getState().loadSnapshot(); await request.ready;
  assert.equal(useGameHub.getState().status, 'syncing');
  useGameHub.getState().applySnapshot(snapshot({ id: 'account-b', revision: 8, gold: 555 }));
  useGameHub.setState({ message: 'Current account message' });
  const current = useGameHub.getState().snapshot;
  request.finish(result);
  assert.deepEqual(await pending, { error: 'ACCOUNT_CHANGED' });
  assert.equal(useGameHub.getState().snapshot, current);
  assert.equal(useGameHub.getState().status, 'ready');
  assert.equal(useGameHub.getState().message, 'Current account message');
});

test('initial snapshot with no account still loads and clears the prior message', async () => {
  useGameHub.setState({ snapshot: null, status: 'booting', message: 'Connecting' });
  const request = deferredRequest('/api/player/snapshot');
  const pending = useGameHub.getState().loadSnapshot(); await request.ready;
  request.finish(snapshot());
  const loaded = await pending;
  assert.equal(loaded.player.id, 'account-a');
  assert.equal(useGameHub.getState().snapshot, loaded);
  assert.equal(useGameHub.getState().status, 'ready');
  assert.equal(useGameHub.getState().message, '');
});

test('overlapping same-account refreshes retain newer R2 and gold observations', async () => {
  const firstRequest = deferredRequest('/api/player/snapshot');
  const first = useGameHub.getState().loadSnapshot(); await firstRequest.ready;
  const secondRequest = deferredRequest('/api/player/snapshot');
  const second = useGameHub.getState().loadSnapshot(); await secondRequest.ready;
  secondRequest.finish(snapshot({ revision: 3, seq: 12, time: 3000, gold: 300 })); await second;
  firstRequest.finish(snapshot({ revision: 2, seq: 11, time: 2000, gold: 75 }));
  assert.equal((await first).player.id, 'account-a');
  const current = useGameHub.getState();
  assert.equal(current.snapshot.gardenR2.revision, 3);
  assert.equal(current.snapshot.resources.gold, 300);
  assert.equal(current.snapshot.player.syncSeq, 12);
  assert.equal(current.status, 'ready');
});

for (const [kind, result] of [
  ['success', snapshot({ revision: 99, seq: 99, time: 9900, gold: 1 })],
  ['failure', { error: 'OLD_SESSION_FAILURE' }],
]) test(`A to B to A fences the retired session's delayed snapshot ${kind}`, async () => {
  const request = deferredRequest('/api/player/snapshot');
  const pending = useGameHub.getState().loadSnapshot(); await request.ready;
  useGameHub.getState().applySnapshot(snapshot({ id: 'account-b' }));
  useGameHub.getState().applySnapshot(snapshot({ id: 'account-a', revision: 3, seq: 13, gold: 333 }));
  useGameHub.setState({ message: 'Returned account message' });
  const current = useGameHub.getState().snapshot;
  request.finish(result);
  assert.deepEqual(await pending, { error: 'ACCOUNT_CHANGED' });
  assert.equal(useGameHub.getState().snapshot, current);
  assert.equal(useGameHub.getState().status, 'ready');
  assert.equal(useGameHub.getState().message, 'Returned account message');
});

for (const newerState of ['pending', 'ready', 'offline']) test(`older same-account refresh failure preserves the newer ${newerState} state`, async () => {
  const firstRequest = deferredRequest('/api/player/snapshot');
  const first = useGameHub.getState().loadSnapshot(); await firstRequest.ready;
  const secondRequest = deferredRequest('/api/player/snapshot');
  const second = useGameHub.getState().loadSnapshot(); await secondRequest.ready;
  if (newerState === 'ready') {
    secondRequest.finish(snapshot({ revision: 3, seq: 12, time: 3000, gold: 300 })); await second;
  } else if (newerState === 'offline') {
    secondRequest.finish({ error: 'CURRENT_FAILURE' });
    assert.deepEqual(await second, { error: 'CURRENT_FAILURE' });
  }
  const { snapshot: current, status, message } = useGameHub.getState();
  assert.equal(status, newerState === 'pending' ? 'syncing' : newerState);
  firstRequest.finish({ error: 'OLD_FAILURE' });
  assert.deepEqual(await first, { error: 'SNAPSHOT_SUPERSEDED' });
  assert.equal(useGameHub.getState().snapshot, current);
  assert.equal(useGameHub.getState().status, status);
  assert.equal(useGameHub.getState().message, message);
  if (newerState === 'pending') {
    secondRequest.finish(snapshot({ revision: 3, seq: 12 })); await second;
    assert.equal(useGameHub.getState().status, 'ready');
  }
});

test('newer server observations from an older request still apply within the same account session', async () => {
  const firstRequest = deferredRequest('/api/player/snapshot');
  const first = useGameHub.getState().loadSnapshot(); await firstRequest.ready;
  const secondRequest = deferredRequest('/api/player/snapshot');
  const second = useGameHub.getState().loadSnapshot(); await secondRequest.ready;
  secondRequest.finish(snapshot({ revision: 2, seq: 11, time: 2000, gold: 200 })); await second;
  firstRequest.finish(snapshot({ revision: 3, seq: 12, time: 3000, gold: 300 }));
  const loaded = await first;
  assert.equal(loaded.gardenR2.revision, 3); assert.equal(loaded.resources.gold, 300);
  assert.equal(useGameHub.getState().snapshot, loaded);
  assert.equal(useGameHub.getState().status, 'ready'); assert.equal(useGameHub.getState().message, '');
});

test('overlapping initial refreshes keep the loaded account ready when the old request fails', async () => {
  useGameHub.setState({ snapshot: null, status: 'booting', message: '' });
  const firstRequest = deferredRequest('/api/player/snapshot');
  const first = useGameHub.getState().loadSnapshot(); await firstRequest.ready;
  const secondRequest = deferredRequest('/api/player/snapshot');
  const second = useGameHub.getState().loadSnapshot(); await secondRequest.ready;
  secondRequest.finish(snapshot()); const loaded = await second;
  firstRequest.finish({ error: 'OLD_INITIAL_FAILURE' });
  assert.deepEqual(await first, { error: 'ACCOUNT_CHANGED' });
  assert.equal(useGameHub.getState().snapshot, loaded);
  assert.equal(useGameHub.getState().status, 'ready'); assert.equal(useGameHub.getState().message, '');
});

test('overlapping initial successes may bind the same account and apply the newer observation', async () => {
  useGameHub.setState({ snapshot: null, status: 'booting', message: '' });
  const firstRequest = deferredRequest('/api/player/snapshot');
  const first = useGameHub.getState().loadSnapshot(); await firstRequest.ready;
  const secondRequest = deferredRequest('/api/player/snapshot');
  const second = useGameHub.getState().loadSnapshot(); await secondRequest.ready;
  firstRequest.finish(snapshot({ revision: 2, seq: 11, time: 2000, gold: 200 })); await first;
  secondRequest.finish(snapshot({ revision: 3, seq: 12, time: 3000, gold: 300 }));
  const loaded = await second;
  assert.equal(loaded.gardenR2.revision, 3); assert.equal(loaded.resources.gold, 300);
  assert.equal(useGameHub.getState().snapshot, loaded);
  assert.equal(useGameHub.getState().status, 'ready');
});

for (const result of [snapshot(), { error: 'OLD_INITIAL_FAILURE' }]) test(`unscoped initial ${result.error ? 'failure' : 'success'} cannot replace another account`, async () => {
  useGameHub.setState({ snapshot: null, status: 'booting', message: '' });
  const request = deferredRequest('/api/player/snapshot');
  const pending = useGameHub.getState().loadSnapshot(); await request.ready;
  useGameHub.getState().applySnapshot(snapshot({ id: 'account-b' }));
  const current = useGameHub.getState().snapshot;
  request.finish(result);
  assert.deepEqual(await pending, { error: 'ACCOUNT_CHANGED' });
  assert.equal(useGameHub.getState().snapshot, current);
  assert.equal(useGameHub.getState().status, 'ready');
});
