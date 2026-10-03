import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createDefaultPlayer } from '../game-logic/player.js';
import { ensurePersistentPlayerYard, executePersistentYardAction } from '../game-logic/yard-v2/service.mjs';

// Root tests use real Zustand and the API client. Browser IDB and HTTP are
// replaced; loss/replay runs the actual persistent Yard domain with JSON reload.
// Candidate CI supplies its existing vanilla Zustand adapter before this file.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'idb-keyval') return { shortCircuit: true, url: 'hub-boundary:idb' };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'hub-boundary:idb') return { shortCircuit: true, format: 'module', source: `
      export const values = new Map();
      export let beforeRead = null, beforeWrite = null;
      export function configure(read = null, write = null) { beforeRead = read; beforeWrite = write; }
      export async function get(key) { await beforeRead?.(key); return structuredClone(values.get(key)); }
      export async function set(key, value) { await beforeWrite?.(key, value); values.set(key, structuredClone(value)); }
    ` };
    return next(url, context);
  },
});
const storage = await import('hub-boundary:idb');
const { useGameHub: hub } = await import('../src/game-state/useGameHub.js');
hooks.deregister();
const LEGACY_KEY = 'game_hub_yard_outbox_v1';
const key = id => `game_hub_yard_outbox_v2:${encodeURIComponent(id)}`;
const snap = (id = 'account-a', seq = 10, time = 1000) => ({
  player: { id, syncSeq: seq }, serverTime: time,
  resources: { gold: 100, gachaTokens: 7 },
  garden: { plants: [] }, gardenR2: null,
  yard: { currencies: { treats: seq }, foodInventory: { kibble: seq }, goodieInventory: {} },
  yardRuntime: { cursorMs: time, visits: [`visit-${seq}`] },
  merge: { schemaVersion: 3, board: [`board-${seq}`], itemCounts: { essence: seq } },
  inventory: { yardFood: { kibble: seq }, yardGoodies: {}, mergeItems: { essence: seq } },
});
const item = (id = 'account-a') => ({ accountId: id, action: 'yard.buyFood', payload: { foodId: 'kibble', qty: 1 }, clientActionId: 'yard-v2:boundary-intent', entityKey: 'shop:food:kibble', status: 'pending', attempts: 0, createdAt: 1000, intentServerTime: 1000, nextAttemptAt: 0 });
const envelope = (id, items) => ({ version: 2, accountId: id, items });
const response = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body });
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function request(endpoint = '/api/player/mutate') {
  const ready = defer(), reply = defer();
  globalThis.fetch = async (path, options) => {
    if (path === '/api/config') return response({ devAuthEnabled: false });
    assert.equal(path, endpoint); ready.resolve(options?.body ? JSON.parse(options.body) : null);
    return reply.promise;
  };
  return { ready: ready.promise, finish: (body, status) => reply.resolve(response(body, status)) };
}
function reset(id = 'account-a') {
  hub.setState({ snapshot: null });
  hub.getState().applySnapshot(snap(id));
  hub.setState({ status: 'ready', message: '', busy: {}, pendingActions: [], outboxLoaded: true, outboxAccountId: id, outboxStorageError: null, lastResult: null });
}
beforeEach(t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  storage.values.clear(); storage.configure();
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  globalThis.fetch = async path => { if (path === '/api/config') return response({ devAuthEnabled: false }); throw Error(`Unexpected request ${path}`); };
  reset();
});

for (const returnToA of [false, true]) for (const failure of [false, true]) test(`action ${failure ? 'failure' : 'success'} is fenced after A-B${returnToA ? '-A' : ''}`, async () => {
  const req = request(), pending = hub.getState().performAction('blox.place', {}, { key: 'same-key', feedback: false }); await req.ready;
  hub.getState().applySnapshot(snap('account-b', 20, 2000));
  if (returnToA) hub.getState().applySnapshot(snap('account-a', 30, 3000));
  hub.setState({ busy: { 'same-key': true }, message: 'new-session' });
  const current = hub.getState().snapshot;
  req.finish(failure ? { error: 'OLD_SESSION_ERROR' } : { success: true, snapshot: snap('account-a', 99, 9900) });
  assert.equal((await pending).error, 'ACCOUNT_CHANGED');
  assert.equal(hub.getState().snapshot, current); assert.equal(hub.getState().message, 'new-session');
  assert.equal(hub.getState().busy['same-key'], true); assert.equal(hub.getState().lastResult, null);
});

test('retired Garden receipt cannot acknowledge the pending intent after A-B-A', async () => {
  const req = request(), pending = hub.getState().performReliableAction('garden.r2', { accountId: 'account-a' }, { clientActionId: 'garden-r2:boundary-stream:1', feedback: false }); await req.ready;
  hub.getState().applySnapshot(snap('account-b')); hub.getState().applySnapshot(snap());
  req.finish({ receiptConfirmed: true, clientActionId: 'garden-r2:boundary-stream:1', snapshot: snap() });
  assert.equal((await pending).error, 'GARDEN_R2_ACCOUNT_CHANGED');
  assert.equal(hub.getState().lastResult, null);
});

for (const returnToA of [false, true]) for (const failure of [null, 'NETWORK_ERROR', 'REJECTED']) test(`outbox ${failure || 'success'} is fenced after A-B${returnToA ? '-A' : ''}`, async () => {
  storage.values.set(key('account-a'), envelope('account-a', [item()]));
  hub.setState({ pendingActions: [item()] });
  const req = request(), pending = hub.getState().drainOutbox(); await req.ready;
  hub.getState().applySnapshot(snap('account-b', 20, 2000));
  if (returnToA) hub.getState().applySnapshot(snap('account-a', 30, 3000));
  hub.setState({ message: 'new-session', status: 'ready' }); const current = hub.getState().snapshot;
  req.finish(failure ? { error: failure } : { success: true, snapshot: snap('account-a', 99, 9900) });
  assert.equal((await pending).error, 'ACCOUNT_CHANGED');
  assert.equal(hub.getState().snapshot, current); assert.equal(hub.getState().message, 'new-session');
  assert.equal(hub.getState().status, 'ready'); assert.equal(hub.getState().lastResult, null);
  assert.equal(storage.values.get(key('account-a')).items[0].clientActionId, item().clientActionId);
});

test('legacy ownerless journals remain byte-for-byte retained and are never drained into a verified account', async () => {
  const legacy = { ...item(), futureRecoveryField: { keep: true } }; delete legacy.accountId;
  storage.values.set(LEGACY_KEY, [legacy]); const raw = JSON.stringify([legacy]); localStorage.setItem(LEGACY_KEY, raw);
  hub.setState({ outboxLoaded: false }); await hub.getState().hydrateOutbox();
  let sends = 0; globalThis.fetch = async path => { if (path === '/api/config') return response({}); sends++; return response({ success: true, snapshot: snap() }); };
  await hub.getState().drainOutbox();
  assert.equal(sends, 0); assert.deepEqual(storage.values.get(LEGACY_KEY), [legacy]); assert.equal(localStorage.getItem(LEGACY_KEY), raw);
  assert.equal(hub.getState().pendingActions.length, 0); assert.ok(hub.getState().retainedLegacyOutbox.length);
});

test('a new intent is durably bound to its verified account before sending', async () => {
  const queued = await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { clientActionId: 'yard-v2:owned', feedback: false });
  assert.equal(queued.pending, true);
  const saved = storage.values.get(key('account-a'));
  assert.equal(saved.accountId, 'account-a'); assert.equal(saved.items[0].accountId, 'account-a');
  const req = request(), pending = hub.getState().drainOutbox(); const body = await req.ready;
  assert.equal(body.accountId, 'account-a'); req.finish({ success: true, snapshot: snap('account-a', 11, 2000) }); await pending;
});

test('pending A intent survives switching to B and returning to A without coalescing into B', async () => {
  const queued = await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { clientActionId: 'yard-v2:owned-a', feedback: false });
  hub.getState().applySnapshot(snap('account-b')); await hub.getState().hydrateOutbox();
  assert.equal(hub.getState().pendingActions.length, 0); assert.equal(hub.getState().isBusy('shop:food:kibble'), false);
  const b = await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { clientActionId: 'yard-v2:owned-b', feedback: false });
  assert.notEqual(b.clientActionId, queued.clientActionId);
  hub.getState().applySnapshot(snap()); await hub.getState().hydrateOutbox();
  assert.equal(hub.getState().pendingActions[0].clientActionId, queued.clientActionId);
  assert.equal(storage.values.get(key('account-b')).items[0].clientActionId, b.clientActionId);
});

test('copied or future account journal cannot be relabelled or overwritten by enqueue', async () => {
  for (const stored of [envelope('account-b', [item('account-b')]), { version: 77, accountId: 'account-a', items: [item()] }]) {
    storage.values.set(key('account-a'), stored); hub.setState({ pendingActions: [], outboxLoaded: false });
    const result = await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { feedback: false });
    assert.equal(result.error, 'OUTBOX_STORAGE_INVALID'); assert.deepEqual(storage.values.get(key('account-a')), stored);
  }
});

test('a future envelope written after hydration is preserved at the write boundary', async () => {
  const future = { version: 77, accountId: 'account-a', items: [item()], futureProgress: { keep: true } };
  storage.values.set(key('account-a'), future);
  const result = await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { feedback: false });
  assert.equal(result.error, 'OUTBOX_STORAGE_INVALID'); assert.deepEqual(storage.values.get(key('account-a')), future);
});

test('initial loading cannot enqueue or send mutations without a verified account', async () => {
  hub.setState({ snapshot: null, outboxLoaded: false }); let sends = 0;
  globalThis.fetch = async () => { sends++; return response({ success: true }); };
  assert.equal((await hub.getState().enqueueYardAction('yard.buyFood', {}, { feedback: false })).error, 'ACCOUNT_REQUIRED');
  assert.equal((await hub.getState().performAction('blox.place', {}, { feedback: false })).error, 'ACCOUNT_REQUIRED');
  await hub.getState().drainOutbox(); assert.equal(sends, 0);
});

test('account change while hydration reads storage cannot load A intents into B', async () => {
  const started = defer(), release = defer(); storage.values.set(key('account-a'), envelope('account-a', [item()]));
  storage.configure(async () => { started.resolve(); await release.promise; });
  hub.setState({ outboxLoaded: false }); const pending = hub.getState().hydrateOutbox(); await started.promise;
  hub.getState().applySnapshot(snap('account-b')); release.resolve(); await pending;
  assert.equal(hub.getState().pendingActions.length, 0); assert.notEqual(hub.getState().outboxAccountId, 'account-a');
});

test('account change during asynchronous auth resolution stops transport before fetch', async () => {
  let sends = 0;
  globalThis.fetch = async path => { if (path === '/api/config') return response({}); sends++; return response({ success: true, snapshot: snap() }); };
  // getAuthHeader always yields, even with cached public configuration.
  const pending = hub.getState().performAction('blox.place', {}, { feedback: false });
  hub.getState().applySnapshot(snap('account-b'));
  assert.equal((await pending).error, 'ACCOUNT_CHANGED');
  assert.equal(sends, 0);
});

for (const returnToA of [false, true]) test(`account switch during durable enqueue retains A journal and fences completion A-B${returnToA ? '-A' : ''}`, async () => {
  const started = defer(), release = defer(); storage.configure(null, async () => { started.resolve(); await release.promise; });
  const pending = hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { clientActionId: 'yard-v2:paused-write', feedback: false }); await started.promise;
  hub.getState().applySnapshot(snap('account-b')); if (returnToA) hub.getState().applySnapshot(snap());
  hub.setState({ message: 'new-session', busy: { companion: true } }); release.resolve();
  assert.equal((await pending).error, 'ACCOUNT_CHANGED'); assert.equal(hub.getState().message, 'new-session'); assert.equal(hub.getState().busy.companion, true);
  assert.equal(storage.values.get(key('account-a')).items[0].clientActionId, 'yard-v2:paused-write');
});

for (const returnToA of [false, true]) test(`account switch during rejected intent refresh retains its journal A-B${returnToA ? '-A' : ''}`, async () => {
  const ready = defer(), reply = defer(); hub.setState({ pendingActions: [item()] });
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (path === '/api/player/mutate') return response({ error: 'REJECTED' }, 409);
    assert.equal(path, '/api/player/snapshot'); ready.resolve(); return reply.promise;
  };
  const pending = hub.getState().drainOutbox(); await ready.promise;
  hub.getState().applySnapshot(snap('account-b')); if (returnToA) hub.getState().applySnapshot(snap());
  hub.setState({ message: 'new-session' }); const current = hub.getState().snapshot;
  reply.resolve(response(snap())); assert.equal((await pending).error, 'ACCOUNT_CHANGED');
  assert.equal(hub.getState().snapshot, current); assert.equal(hub.getState().message, 'new-session');
  assert.equal(storage.values.get(key('account-a')).items[0].clientActionId, item().clientActionId);
});

test('storage failure keeps an intent recoverable in memory and prevents sending it', async () => {
  storage.configure(null, async () => { throw Error('IDB unavailable'); });
  localStorage.setItem = () => { throw Error('quota exhausted'); };
  const result = await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { feedback: false });
  assert.equal(result.error, 'OUTBOX_STORAGE_UNAVAILABLE'); assert.equal(hub.getState().pendingActions.length, 1);
  let sends = 0; globalThis.fetch = async () => { sends++; return response({ success: true, snapshot: snap() }); };
  assert.equal((await hub.getState().drainOutbox()).error, 'OUTBOX_STORAGE_UNAVAILABLE'); assert.equal(sends, 0);
  const intent = hub.getState().pendingActions[0];
  hub.getState().applySnapshot(snap('account-b')); hub.getState().applySnapshot(snap()); await hub.getState().hydrateOutbox();
  assert.equal(hub.getState().pendingActions[0].clientActionId, intent.clientActionId);
  // Restore durable storage and flush recovery so later tests have no unsaved state.
  storage.configure(); localStorage.setItem = () => {};
  await hub.getState().enqueueYardAction(intent.action, intent.payload, { feedback: false });
});

test('local fallback retains the newest owned journal when IDB recovers with an older copy', async () => {
  await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { clientActionId: 'yard-v2:first', feedback: false });
  storage.configure(null, async () => { throw Error('IDB write temporarily unavailable'); });
  await hub.getState().enqueueYardAction('yard.buyGoodie', { goodieId: 'yarn_mouse' }, { clientActionId: 'yard-v2:second', feedback: false });
  storage.configure(); hub.setState({ outboxLoaded: false, pendingActions: [] }); await hub.getState().hydrateOutbox();
  assert.deepEqual(hub.getState().pendingActions.map(item => item.clientActionId), ['yard-v2:first', 'yard-v2:second']);
});

test('non-R2 realtime observations fence stale/unscoped replies and order subsequent full refreshes', async () => {
  hub.getState().applyRealtimePayload({ accountId: 'account-a', syncSeq: 12, serverTime: 3000, yard: snap('account-a', 12, 3000).yard, merge: { itemCounts: { essence: 12 } } });
  const current = hub.getState().snapshot;
  assert.equal(current.player.syncSeq, 12); assert.equal(current.inventory.mergeItems.essence, 12);
  for (const old of [{ accountId: 'account-a', syncSeq: 11, serverTime: 2000, yard: snap().yard }, { yard: snap().yard }]) hub.getState().applyRealtimePayload(old);
  assert.equal(hub.getState().snapshot, current);
  const req = request('/api/player/snapshot'), pending = hub.getState().loadSnapshot(); await req.ready; req.finish(snap('account-a', 11, 2000)); await pending;
  assert.equal(hub.getState().snapshot.player.syncSeq, 12); assert.deepEqual(hub.getState().snapshot.merge, current.merge);
});

test('an unordered full snapshot cannot demote a verified ordered hub', () => {
  const current = hub.getState().snapshot, old = snap(); delete old.player.syncSeq; delete old.serverTime; old.yard.currencies.treats = 1;
  hub.getState().applySnapshot(old); assert.equal(hub.getState().snapshot.yard.currencies.treats, current.yard.currencies.treats);
});

test('concurrent enqueues and a confirmed drain preserve every new intent in storage', async () => {
  await Promise.all([
    hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble' }, { clientActionId: 'yard-v2:first', feedback: false }),
    hub.getState().enqueueYardAction('yard.buyGoodie', { goodieId: 'yarn_mouse' }, { clientActionId: 'yard-v2:second', feedback: false }),
  ]);
  const req = request(), pending = hub.getState().drainOutbox(); await req.ready;
  await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'crunch_mix' }, { clientActionId: 'yard-v2:third', feedback: false });
  req.finish({ success: true, snapshot: snap('account-a', 11, 2000) }); await pending;
  const remaining = storage.values.get(key('account-a')).items.map(item => item.clientActionId);
  assert.deepEqual(remaining, ['yard-v2:second', 'yard-v2:third']);
});

test('a legacy companion intent already attempted retains its signed payload and nonce', async () => {
  const saved = { ...item(), action: 'yard.configureCompanion', entityKey: 'companion', clientActionId: 'yard:legacy-owned', payload: { companionId: 'original' }, attempts: 1 };
  storage.values.set(key('account-a'), envelope('account-a', [saved])); hub.setState({ pendingActions: [saved] });
  await hub.getState().enqueueYardAction(saved.action, { companionId: 'replacement' }, { feedback: false });
  assert.equal(hub.getState().pendingActions[0].clientActionId, saved.clientActionId);
  assert.deepEqual(hub.getState().pendingActions[0].payload, saved.payload);
});

for (const endpoint of ['refresh', 'action', 'outbox']) test(`late ${endpoint} full snapshot retains newer Yard, runtime, Merge and inventory aliases`, async () => {
  if (endpoint === 'outbox') hub.setState({ pendingActions: [item()] });
  const req = request(endpoint === 'refresh' ? '/api/player/snapshot' : '/api/player/mutate');
  const pending = endpoint === 'refresh' ? hub.getState().loadSnapshot() : endpoint === 'outbox' ? hub.getState().drainOutbox() : hub.getState().performAction('blox.place', {}, { feedback: false });
  await req.ready;
  hub.getState().applySnapshot(snap('account-a', 12, 3000)); const current = hub.getState().snapshot;
  const old = snap('account-a', 11, 2000);
  req.finish(endpoint === 'refresh' ? old : { success: true, snapshot: old }); await pending;
  assert.deepEqual(hub.getState().snapshot.yard, current.yard); assert.deepEqual(hub.getState().snapshot.yardRuntime, current.yardRuntime);
  assert.deepEqual(hub.getState().snapshot.merge, current.merge); assert.deepEqual(hub.getState().snapshot.inventory, current.inventory);
});

test('overlapping initial success binds the same account and keeps its newest full observation', async () => {
  hub.setState({ snapshot: null });
  const a = request('/api/player/snapshot'), first = hub.getState().loadSnapshot(); await a.ready;
  const b = request('/api/player/snapshot'), second = hub.getState().loadSnapshot(); await b.ready;
  b.finish(snap('account-a', 12, 3000)); await second;
  a.finish(snap('account-a', 11, 2000)); await first;
  assert.equal(hub.getState().snapshot.player.syncSeq, 12); assert.equal(hub.getState().snapshot.yard.currencies.treats, 12);
});

test('a foreign successful response cannot silently change the verified account', async () => {
  const req = request('/api/player/snapshot'), pending = hub.getState().loadSnapshot(); await req.ready;
  req.finish(snap('account-b', 99, 9900));
  assert.equal((await pending).error, 'ACCOUNT_CHANGED'); assert.equal(hub.getState().snapshot.player.id, 'account-a');
});

test('lost reply and reload replay the same domain receipt with one inventory grant', async t => {
  let now = 2000; t.mock.method(Date, 'now', () => now);
  let player = createDefaultPlayer('account-a', 'Replay', now); ensurePersistentPlayerYard(player, { now });
  const before = player.yard.foodInventory.kibble, bodies = []; let lost = true;
  globalThis.fetch = async (path, options) => {
    if (path === '/api/config') return response({ devAuthEnabled: false });
    const body = JSON.parse(options.body); bodies.push(body);
    const result = executePersistentYardAction(player, body.action, body.payload, { now, actionId: body.clientActionId }); assert.equal(result.status, 200);
    if (lost) { lost = false; throw Error('lost after commit'); }
    const current = snap('account-a', 12, now); current.yard = structuredClone(player.yard); delete current.inventory;
    return response({ success: true, duplicate: result.replayed, clientActionId: body.clientActionId, snapshot: current });
  };
  await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble', qty: 1 }, { clientActionId: 'yard-v2:lost-reply', feedback: false });
  assert.equal((await hub.getState().drainOutbox()).error, 'NETWORK_ERROR');
  assert.equal(player.yard.foodInventory.kibble, before + 1);
  player = JSON.parse(JSON.stringify(player));
  reset(); hub.setState({ outboxLoaded: false }); now = 5000; await hub.getState().hydrateOutbox();
  assert.equal((await hub.getState().drainOutbox()).duplicate, true);
  assert.deepEqual(bodies[1], bodies[0]); assert.equal(player.yard.foodInventory.kibble, before + 1); assert.equal(hub.getState().pendingActions.length, 0);
});

test('an unreadable owned journal remains protected on repeated enqueue attempts', async () => {
  const saved = envelope('account-a', [item()]);
  storage.values.set(key('account-a'), saved);
  storage.configure(async name => { if (name === key('account-a')) throw Error('Temporary IDB read failure'); });
  hub.setState({ outboxLoaded: false, pendingActions: [] });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await hub.getState().enqueueYardAction('yard.buyGoodie', { goodieId: 'yarn_mouse' }, { clientActionId: 'yard-v2:new-after-unreadable', feedback: false });
    assert.equal(result.error, 'OUTBOX_STORAGE_UNAVAILABLE');
    assert.deepEqual(storage.values.get(key('account-a')), saved);
    assert.equal(hub.getState().pendingActions.length, 0);
  }
  storage.configure();
  const recovered = await hub.getState().enqueueYardAction('yard.buyGoodie', { goodieId: 'yarn_mouse' }, { clientActionId: 'yard-v2:new-after-unreadable', feedback: false });
  assert.equal(recovered.pending, true);
  assert.deepEqual(storage.values.get(key('account-a')).items.map(value => value.clientActionId), [item().clientActionId, 'yard-v2:new-after-unreadable']);
});

test('a later IDB read failure cannot overwrite an unknown journal after successful hydration', async () => {
  const accountId = 'account-read-unavailable'; reset(accountId);
  const future = { version: 77, accountId, items: [item(accountId)], futureProgress: { keep: true } };
  storage.values.set(key(accountId), future);
  storage.configure(async name => { if (name === key(accountId)) throw Error('Read temporarily unavailable'); });
  const result = await hub.getState().enqueueYardAction('yard.buyGoodie', { goodieId: 'yarn_mouse' }, { feedback: false });
  assert.deepEqual(storage.values.get(key(accountId)), future);
  assert.equal(result.error, 'OUTBOX_STORAGE_UNAVAILABLE');
  assert.equal(hub.getState().pendingActions.length, 1);
  assert.equal((await hub.getState().drainOutbox()).error, 'OUTBOX_STORAGE_UNAVAILABLE');
});

test('verified local fallback remains writable without overwriting an unreadable IDB copy', async () => {
  const accountId = 'account-known-fallback'; reset(accountId);
  const future = { version: 77, accountId, items: [], futureProgress: { keep: true } };
  storage.values.set(key(accountId), future);
  localStorage.setItem(key(accountId), JSON.stringify(envelope(accountId, [item(accountId)])));
  storage.configure(async name => { if (name === key(accountId)) throw Error('Read temporarily unavailable'); });
  hub.setState({ outboxLoaded: false });
  const result = await hub.getState().enqueueYardAction('yard.buyGoodie', { goodieId: 'yarn_mouse' }, { clientActionId: 'yard-v2:fallback-new', feedback: false });
  assert.deepEqual(storage.values.get(key(accountId)), future);
  assert.equal(result.pending, true);
  assert.deepEqual(JSON.parse(localStorage.getItem(key(accountId))).items.map(value => value.clientActionId), [item(accountId).clientActionId, 'yard-v2:fallback-new']);
});
