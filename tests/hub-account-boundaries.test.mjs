import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createDefaultPlayer } from '../game-logic/player.js';
import { ensurePersistentPlayerYard, executePersistentYardAction, publicPersistentYard } from '../game-logic/yard-v2/service.mjs';

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
    assert.equal(new URL(path, 'https://fixture.invalid').pathname, endpoint); ready.resolve(options?.body ? JSON.parse(options.body) : null);
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

test('only the latest HTTP snapshot can finish the refresh indicator', async () => {
  const replies = [], entered = [];
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({ devAuthEnabled: false });
    assert.equal(new URL(path, 'https://fixture.invalid').pathname, '/api/player/snapshot');
    const reply = defer(); replies.push(reply); entered.splice(0).forEach(resolve => resolve()); return reply.promise;
  };
  const waitForReads = count => replies.length >= count ? Promise.resolve() : new Promise(resolve => entered.push(resolve));
  const first = hub.getState().loadSnapshot(); await waitForReads(1);
  const latest = hub.getState().loadSnapshot(); await waitForReads(2);
  assert.equal(hub.getState().snapshotRequestPending, true);
  replies[0].resolve(response({ error: 'OLD_READ_FAILURE' }, 503)); await first;
  assert.equal(hub.getState().snapshotRequestPending, true);
  assert.equal(hub.getState().status, 'syncing');
  replies[1].resolve(response(snap('account-a', 11, 1100))); await latest;
  assert.equal(hub.getState().snapshotRequestPending, false); assert.equal(hub.getState().status, 'ready');
});

test('a retired account read cannot retain a replacement account refresh indicator', async () => {
  const req = request('/api/player/snapshot'), pending = hub.getState().loadSnapshot(); await req.ready;
  assert.equal(hub.getState().snapshotRequestPending, true);
  hub.getState().applySnapshot(snap('account-b', 20, 2000));
  assert.equal(hub.getState().snapshotRequestPending, false);
  req.finish(snap('account-a', 99, 9900)); assert.equal((await pending).error, 'ACCOUNT_CHANGED');
  assert.equal(hub.getState().snapshot.player.id, 'account-b'); assert.equal(hub.getState().snapshotRequestPending, false);
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
    assert.equal(new URL(path, 'https://fixture.invalid').pathname, '/api/player/snapshot'); ready.resolve(); return reply.promise;
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

for (const committedBeforeLoss of [false, true]) test(`closed rollback retains unresolved intent across reload and resumes exactly once (${committedBeforeLoss ? 'committed' : 'uncommitted'} lost reply)`, async t => {
  let now = 2000; t.mock.method(Date, 'now', () => now);
  let player = createDefaultPlayer('account-a', 'Rollback', now); ensurePersistentPlayerYard(player, { now });
  const before = player.yard.foodInventory.kibble, bodies = []; let active = true, lost = true, reads = 0;
  const current = () => ({ ...snap('account-a', 12, now), yard: structuredClone(player.yard), inventory: undefined,
    yardRuntime: { ...publicPersistentYard(player, { now }), ...(!active ? { status: 'rollout-paused', mutable: false, error: 'YARD_ROLLOUT_PAUSED' } : {}) } });
  globalThis.fetch = async (path, options) => {
    if (path === '/api/config') return response({ devAuthEnabled: false });
    if (new URL(path, 'https://fixture.invalid').pathname === '/api/player/snapshot') { reads++; return response(current()); }
    assert.equal(path, '/api/player/mutate');
    const body = JSON.parse(options.body); bodies.push(body);
    if (lost && !committedBeforeLoss) { lost = false; throw Error('lost before commit'); }
    // Closed A denies before receipt lookup. Model that HTTP contract without
    // depending on whether this test checkout itself is the closed or active release.
    const result = active
      ? executePersistentYardAction(player, body.action, body.payload, { now, actionId: body.clientActionId })
      : { status: 409, error: 'YARD_ROLLOUT_PAUSED' };
    if (lost) { lost = false; throw Error('lost after commit'); }
    return result.status === 200
      ? response({ success: true, duplicate: result.replayed, clientActionId: body.clientActionId, snapshot: current() })
      : response({ error: result.error }, result.status);
  };
  await hub.getState().loadSnapshot();
  await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble', qty: 1 }, { clientActionId: 'yard-v2:rollback-loss', feedback: false });
  assert.equal((await hub.getState().drainOutbox()).error, 'NETWORK_ERROR');
  assert.equal(player.yard.foodInventory.kibble, before + Number(committedBeforeLoss));
  const committed = JSON.stringify({ yard: player.yard, runtime: player._yardV2 });
  active = false; now = 5000;
  assert.equal((await hub.getState().drainOutbox()).error, 'YARD_ROLLOUT_PAUSED');
  assert.equal(hub.getState().snapshot.yardRuntime.mutable, false);
  const held = storage.values.get(key('account-a')).items[0];
  assert.equal(held.status, 'rollout-paused'); assert.equal(held.clientActionId, bodies[0].clientActionId);
  assert.equal(hub.getState().isBusy(held.entityKey), true);
  const repeated = await hub.getState().enqueueYardAction('yard.buyFood', { foodId: 'kibble', qty: 2 }, { feedback: false });
  assert.equal(repeated.clientActionId, held.clientActionId); assert.deepEqual(hub.getState().pendingActions[0].payload, bodies[0].payload);
  player = JSON.parse(JSON.stringify(player)); reset(); hub.setState({ outboxLoaded: false });
  await hub.getState().loadSnapshot(); await hub.getState().hydrateOutbox();
  const requestsAtPause = bodies.length, readsAtPause = reads;
  t.mock.timers.tick(600000); await hub.getState().drainOutbox();
  const timeout = globalThis.setTimeout, scheduled = [];
  t.mock.method(globalThis, 'setTimeout', (fn, delay, ...args) => { scheduled.push(delay); return timeout(fn, delay, ...args); });
  for (let i = 0; i < 3; i++) await hub.getState().drainOutbox();
  assert.deepEqual(scheduled, [], 'paused journal must not arm an automatic retry loop');
  assert.equal(bodies.length, requestsAtPause); assert.equal(reads, readsAtPause);
  assert.deepEqual(storage.values.get(key('account-a')).items[0], held);
  assert.equal(JSON.stringify({ yard: player.yard, runtime: player._yardV2 }), committed);
  active = true; now = 7000;
  hub.getState().applySnapshot(current()); await hub.getState().drainOutbox();
  assert.equal(bodies.length, requestsAtPause, 'an applied/cached writable snapshot alone cannot authorize resume');
  await hub.getState().loadSnapshot();
  assert.equal((await hub.getState().drainOutbox()).duplicate, committedBeforeLoss);
  assert.ok(bodies.every(body => JSON.stringify(body) === JSON.stringify(bodies[0])));
  assert.equal(player.yard.foodInventory.kibble, before + 1);
  if (committedBeforeLoss) assert.equal(JSON.stringify({ yard: player.yard, runtime: player._yardV2 }), committed);
  assert.deepEqual(storage.values.get(key('account-a')).items, []); assert.equal(hub.getState().isBusy(held.entityKey), false);
});

const writableRuntime = { version: 1, status: 'ready', mutable: true, actionProtocol: 'yard-v2:' };
for (const [reason, runtime] of [
  ['legacy', undefined], ['future version', { ...writableRuntime, version: 2 }],
  ['read-only', { ...writableRuntime, mutable: false }], ['not ready', { ...writableRuntime, status: 'review-required' }],
  ['wrong protocol', { ...writableRuntime, actionProtocol: 'yard-v3:' }], ['runtime error', { ...writableRuntime, error: 'YARD_ROLLOUT_PAUSED' }],
]) test(`paused journal cannot resume from ${reason} snapshot`, async () => {
  const held = { ...item(), status: 'rollout-paused', attempts: 2 };
  storage.values.set(key('account-a'), envelope('account-a', [held])); hub.setState({ outboxLoaded: false });
  let sends = 0;
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (new URL(path, 'https://fixture.invalid').pathname === '/api/player/snapshot') return response({ ...snap(), yardRuntime: runtime });
    sends++; return response({ success: true, snapshot: snap() });
  };
  await hub.getState().loadSnapshot(); await hub.getState().hydrateOutbox(); await hub.getState().drainOutbox();
  assert.equal(sends, 0); assert.deepEqual(storage.values.get(key('account-a')).items, [held]);
});

test('paused response cannot reuse a protected pre-rollback writable snapshot as resume authority', async () => {
  hub.getState().applySnapshot({ ...snap('account-a', 20, 20000), yardRuntime: writableRuntime });
  hub.setState({ pendingActions: [item()] });
  let sends = 0;
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (path === '/api/player/mutate') { sends++; return response({ error: 'YARD_ROLLOUT_PAUSED' }, 409); }
    return response({ ...snap('account-a', 19, 19000), yardRuntime: { ...writableRuntime, status: 'rollout-paused', mutable: false, error: 'YARD_ROLLOUT_PAUSED' } });
  };
  await hub.getState().drainOutbox();
  assert.equal(hub.getState().snapshot.yardRuntime.mutable, true, 'newer hub observation remains protected');
  await hub.getState().drainOutbox(); assert.equal(sends, 1);
  assert.equal(storage.values.get(key('account-a')).items[0].status, 'rollout-paused');
});

test('an older in-flight writable refresh cannot unpause after a newer closed refresh', async () => {
  const oldReply = defer(), oldStarted = defer(); let reads = 0, sends = 0;
  hub.setState({ pendingActions: [item()] });
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (path === '/api/player/mutate') { sends++; return response({ error: 'YARD_ROLLOUT_PAUSED' }, 409); }
    if (++reads === 1) { oldStarted.resolve(); return oldReply.promise; }
    return response({ ...snap('account-a', 12, 3000), yardRuntime: { ...writableRuntime, status: 'rollout-paused', mutable: false } });
  };
  const older = hub.getState().loadSnapshot(); await oldStarted.promise;
  await hub.getState().drainOutbox();
  oldReply.resolve(response({ ...snap('account-a', 11, 2000), yardRuntime: writableRuntime })); await older;
  await hub.getState().drainOutbox(); assert.equal(sends, 1);
  assert.equal(storage.values.get(key('account-a')).items[0].status, 'rollout-paused');
});

test('fresh writable B snapshot before hydration resumes an owned paused journal', async () => {
  const held = { ...item(), status: 'rollout-paused', attempts: 2 };
  storage.values.set(key('account-a'), envelope('account-a', [held])); hub.setState({ outboxLoaded: false });
  let body;
  globalThis.fetch = async (path, options) => {
    if (path === '/api/config') return response({});
    if (new URL(path, 'https://fixture.invalid').pathname === '/api/player/snapshot') return response({ ...snap(), yardRuntime: writableRuntime });
    body = JSON.parse(options.body); return response({ success: true, duplicate: true, snapshot: snap() });
  };
  await hub.getState().loadSnapshot(); await hub.getState().hydrateOutbox(); await hub.getState().drainOutbox();
  assert.equal(body.clientActionId, held.clientActionId); assert.deepEqual(body.payload, held.payload);
  assert.deepEqual(storage.values.get(key('account-a')).items, []);
});

test('returning to the same account cannot reuse an old session resume observation', async () => {
  const held = { ...item(), status: 'rollout-paused', attempts: 2 };
  storage.values.set(key('account-a'), envelope('account-a', [held]));
  let sends = 0;
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (new URL(path, 'https://fixture.invalid').pathname === '/api/player/snapshot') return response({ ...snap(), yardRuntime: writableRuntime });
    sends++; return response({ success: true, snapshot: snap() });
  };
  await hub.getState().loadSnapshot();
  hub.getState().applySnapshot(snap('account-b'));
  hub.getState().applySnapshot({ ...snap(), yardRuntime: writableRuntime });
  await hub.getState().hydrateOutbox(); await hub.getState().drainOutbox();
  assert.equal(sends, 0); assert.deepEqual(storage.values.get(key('account-a')).items, [held]);
});

test('failed rollback snapshot refresh retains the paused nonce without a retry loop', async () => {
  hub.getState().applySnapshot({ ...snap(), yardRuntime: writableRuntime });
  hub.setState({ pendingActions: [item()] }); let sends = 0, reads = 0;
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (path === '/api/player/mutate') { sends++; return response({ error: 'YARD_ROLLOUT_PAUSED' }, 409); }
    reads++; return response({ error: 'UNAVAILABLE' }, 503);
  };
  await hub.getState().drainOutbox(); await hub.getState().drainOutbox();
  assert.equal(sends, 1); assert.equal(reads, 1);
  assert.equal(storage.values.get(key('account-a')).items[0].status, 'rollout-paused');
});

for (const failWrite of [false, true]) test(`a closed observation during pre-send persistence fences resumed transport${failWrite ? ' and a failed write' : ''}`, async () => {
  const held = { ...item(), status: 'rollout-paused', attempts: 2 };
  storage.values.set(key('account-a'), envelope('account-a', [held])); hub.setState({ outboxLoaded: false });
  let sends = 0, active = true;
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (new URL(path, 'https://fixture.invalid').pathname === '/api/player/snapshot') return response({ ...snap('account-a', active ? 10 : 11, active ? 1000 : 2000),
      yardRuntime: active ? writableRuntime : { ...writableRuntime, status: 'rollout-paused', mutable: false } });
    sends++; return response({ success: true, snapshot: snap() });
  };
  await hub.getState().loadSnapshot(); await hub.getState().hydrateOutbox();
  const started = defer(), release = defer();
  storage.configure(null, async () => { started.resolve(); await release.promise; if (failWrite) throw Error('IDB failed'); });
  if (failWrite) localStorage.setItem = () => { throw Error('local storage failed'); };
  const sending = hub.getState().drainOutbox(); await started.promise;
  active = false; await hub.getState().loadSnapshot(); release.resolve(); await sending;
  storage.configure(); await hub.getState().drainOutbox();
  assert.equal(sends, 0); assert.equal(hub.getState().pendingActions[0].requiresYardResume, true);
  assert.equal(storage.values.get(key('account-a')).items[0].clientActionId, held.clientActionId);
  // Recover the private test journal so an unsaved in-memory copy cannot leak
  // to the next test's intentionally reused account fixture.
  localStorage.setItem = () => {};
  await hub.getState().enqueueYardAction(held.action, held.payload, { feedback: false });
});

test('unversioned writable response cannot authorize replay via a protected old runtime', async () => {
  const held = { ...item(), status: 'rollout-paused', attempts: 2 };
  storage.values.set(key('account-a'), envelope('account-a', [held]));
  hub.getState().applySnapshot({ ...snap(), yardRuntime: writableRuntime }); hub.setState({ outboxLoaded: false });
  let sends = 0;
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (new URL(path, 'https://fixture.invalid').pathname === '/api/player/snapshot') {
      const result = { ...snap(), yardRuntime: writableRuntime }; delete result.serverTime; delete result.player.syncSeq; return response(result);
    }
    sends++; return response({ success: true, snapshot: snap() });
  };
  await hub.getState().loadSnapshot(); await hub.getState().hydrateOutbox(); await hub.getState().drainOutbox();
  assert.equal(sends, 0); assert.deepEqual(storage.values.get(key('account-a')).items, [held]);
});

for (const realtime of [false, true]) test(`${realtime ? 'realtime' : 'applied'} closure retires a resume grant even when a cached writable view follows`, async () => {
  const held = { ...item(), status: 'rollout-paused', attempts: 2 };
  storage.values.set(key('account-a'), envelope('account-a', [held])); hub.setState({ outboxLoaded: false });
  let sends = 0;
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (new URL(path, 'https://fixture.invalid').pathname === '/api/player/snapshot') return response({ ...snap(), yardRuntime: writableRuntime });
    sends++; return response({ success: true, snapshot: snap() });
  };
  await hub.getState().loadSnapshot(); await hub.getState().hydrateOutbox();
  for (const [seq, mutable] of [[11, false], [12, true]]) {
    const view = { ...snap('account-a', seq, seq * 1000), yardRuntime: { ...writableRuntime, mutable } };
    if (realtime) hub.getState().applyRealtimePayload({ accountId: 'account-a', syncSeq: seq, serverTime: view.serverTime, yardRuntime: view.yardRuntime });
    else hub.getState().applySnapshot(view);
  }
  await hub.getState().drainOutbox(); assert.equal(sends, 0);
  assert.equal(storage.values.get(key('account-a')).items[0].clientActionId, held.clientActionId);
});

test('a writable refresh already in flight before observed closure cannot restore resume authority', async () => {
  const held = { ...item(), status: 'rollout-paused', attempts: 2 };
  storage.values.set(key('account-a'), envelope('account-a', [held])); hub.setState({ outboxLoaded: false });
  await hub.getState().hydrateOutbox();
  const req = request('/api/player/snapshot'), loading = hub.getState().loadSnapshot(); await req.ready;
  hub.getState().applySnapshot({ ...snap(), yardRuntime: { ...writableRuntime, mutable: false } });
  req.finish({ ...snap(), yardRuntime: writableRuntime }); await loading;
  let sends = 0; globalThis.fetch = async () => { sends++; return response({ success: true, snapshot: snap() }); };
  await hub.getState().drainOutbox(); assert.equal(sends, 0);
  assert.equal(storage.values.get(key('account-a')).items[0].clientActionId, held.clientActionId);
});

test('writable reconciliation cannot create a replay loop against paused mutation servers', async () => {
  hub.getState().applySnapshot({ ...snap(), yardRuntime: writableRuntime });
  hub.setState({ pendingActions: [item()] }); let sends = 0;
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (path === '/api/player/mutate') { sends++; return response({ error: 'YARD_ROLLOUT_PAUSED' }, 409); }
    return response({ ...snap(), yardRuntime: writableRuntime });
  };
  await hub.getState().drainOutbox(); await hub.getState().drainOutbox();
  assert.equal(sends, 1, 'a pause-triggered refresh cannot grant its own retry');
  await hub.getState().loadSnapshot(); await hub.getState().drainOutbox(); await hub.getState().drainOutbox();
  assert.equal(sends, 2, 'a later independent fresh B observation permits only one resumed attempt');
  assert.equal(storage.values.get(key('account-a')).items[0].status, 'rollout-paused');
});

test('unrelated permanent outbox errors still retire the rejected intent after reconciliation', async () => {
  hub.setState({ pendingActions: [item()], busy: { [item().entityKey]: true } });
  globalThis.fetch = async path => {
    if (path === '/api/config') return response({});
    if (path === '/api/player/mutate') return response({ error: 'YARD_NOT_ENOUGH_TREATS' }, 409);
    return response(snap());
  };
  const result = await hub.getState().drainOutbox();
  assert.equal(result.error, 'YARD_NOT_ENOUGH_TREATS'); assert.equal(hub.getState().message, result.error);
  assert.deepEqual(storage.values.get(key('account-a')).items, []); assert.equal(hub.getState().isBusy(item().entityKey), false);
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
