import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { installLegacyGardenDiscoveryBridge } from './e2e/helpers/legacyGardenClient.js';
import { createHash } from 'node:crypto';
import { createGardenR2Coordinator, hashGardenR2Payload, requiresGardenReload, isGardenR2Retryable, GARDEN_R2_RECEIPT_WINDOW_MS } from '../src/games/garden-shelf/lib/gardenR2Transactions.js';
import { prepareGardenR2Adoption } from '../src/games/garden-shelf/lib/gardenR2Adoption.js';
import { gardenLocalStateKey } from '../src/games/garden-shelf/lib/gardenLocalState.js';
import { formatR2Gold, formatR2Rate, r2IncomePerSecond, r2MasteryOffer, r2NextUnlock, gardenR2ViewState, gardenPlantPhaseDuration } from '../src/games/garden-shelf/lib/gardenR2View.js';
import { executeGardenR2, reconcileGardenR2, gardenR2Hash } from '../game-logic/garden-r2/service.js';
import { createGardenEconomyState } from '../game-logic/garden-economy.js';
import { migrateGardenR2 } from '../game-logic/garden-r2/domain.js';
import { R2_PLANTS, r2GoldRate } from '../game-logic/garden-r2/catalog.js';
const NOW = Date.UTC(2026, 9, 2, 12), ACCOUNT = 'verified-account', STREAM = 'test_garden_r2_stream_123';
test('next garden opening groups shared gates and stops at the level cap', () => {
  const beforeResearch = r2NextUnlock(17);
  assert.equal(beforeResearch.level, 18);
  assert.equal(beforeResearch.items.filter(item => item.key === 'r2.nextResearch').length, 1);
  assert.ok(beforeResearch.items.some(item => item.key === 'garden.expand'));
  const finalOpening = r2NextUnlock(29);
  assert.equal(finalOpening.level, 30);
  assert.ok(finalOpening.items.some(item => item.key === 'plant.fern'));
  assert.ok(finalOpening.items.some(item => item.key === 'r2.nextMastery' && item.tier === 3));
  assert.equal(r2NextUnlock(30), null);
  for (let level = 1; level < 30; level++) assert.ok(r2NextUnlock(level).level > level);
});
const store = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values }; };

test('cached-client browser bridge hides only unadopted discovery and preserves real requests and authority', async () => {
  const calls = []; let original;
  const context = { URL, Headers, Response, location: { href: 'https://fixture.test/', origin: 'https://fixture.test' },
    fetch: async (...args) => { calls.push(args); return original; } };
  vm.runInNewContext(`(${installLegacyGardenDiscoveryBridge.toString()})();`, context);
  const legacy = { player: { id: ACCOUNT }, gardenR2Available: true, gardenR2: null, garden: { plants: [{ id: 'kept' }] }, resources: { gold: 123 } };
  const options = { method: 'POST', body: JSON.stringify({ action: 'garden.buyPlant', clientActionId: 'unchanged-intent', payload: { type: 'daisy' } }) };
  const result = { receiptConfirmed: true, clientActionId: 'unchanged-intent', goldDelta: -25, snapshot: legacy };
  original = new Response(JSON.stringify(result), { status: 200, headers: { 'x-fixture': 'real' } });
  const response = await context.fetch('/api/player/mutate', options);
  assert.equal(calls[0][1], options); assert.equal(response.status, 200); assert.equal(response.headers.get('x-fixture'), 'real');
  assert.deepEqual(await response.json(), { ...result, snapshot: { ...legacy, gardenR2Available: false } });
  for (const gardenR2 of [{ version: 1, revision: 7 }, { version: 1, blocked: true, error: 'GARDEN_R2_STATE_INVALID' }, { version: 99 }, undefined]) {
    original = new Response(JSON.stringify({ ...legacy, gardenR2 }));
    assert.equal(await context.fetch('/api/player/snapshot'), original, 'Adopted, corrupt, future or incomplete authority cannot be hidden');
  }
  for (const url of ['/api/config', '/api/player/snapshot/other', 'https://other.test/api/player/snapshot']) {
    original = new Response(JSON.stringify(legacy)); assert.equal(await context.fetch(url), original);
  }
  original = new Response(JSON.stringify({ error: 'CLIENT_UPDATE_REQUIRED', snapshot: { ...legacy, gardenR2: { version: 1, blocked: true } } }), { status: 409 });
  assert.equal(await context.fetch('/api/player/mutate', options), original);
});
function setup(options = {}) {
  const storage = options.storage || store(), calls = [];
  const coordinator = createGardenR2Coordinator({ accountId: ACCOUNT, storage, now: () => NOW, uuid: () => STREAM, transport: async (action, payload, meta) => { calls.push({ action, payload, meta }); return { receiptConfirmed: true, clientActionId: meta.clientActionId }; }, reconcile: async () => ({ error: 'GARDEN_R2_INTENT_AMBIGUOUS' }), ...options });
  return { coordinator, storage, calls };
}
test('browser SHA256 canonicalization is identical to server for nested inputs', async () => {
  const payload = { input: { z: [2, { b: false, a: 1 }], a: 'daisy' }, accountId: ACCOUNT, intent: { sequence: 1, streamId: STREAM, createdAt: NOW } };
  assert.equal(await hashGardenR2Payload(payload), gardenR2Hash(payload));
  assert.notEqual(await hashGardenR2Payload(payload), createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
});
test('intent is durable before first request, uses R2 namespace and never generic outbox', async () => {
  const storage = store(); let observed;
  const { coordinator } = setup({ storage, transport: async (action, payload, options) => {
    observed = JSON.parse([...storage.values.values()][0]).pending;
    assert.equal(action, 'garden.r2'); assert.deepEqual(observed.payload, payload); assert.equal(options.outbox, false); assert.equal(options.durability, 'receipt');
    assert.deepEqual(Object.keys(payload.intent).sort(), ['createdAt', 'sequence', 'streamId']);
    assert.equal(payload.accountId, ACCOUNT); assert.equal(options.clientActionId, `garden-r2:${STREAM}:1`);
    return { receiptConfirmed: true, clientActionId: options.clientActionId };
  } });
  await coordinator.execute('buyPlant', { type: 'daisy', shelfIndex: 0, spotIndex: 0 }, 7);
  assert.equal(observed.payload.expectedRevision, 7); assert.equal(coordinator.inspect().pending, null); assert.equal(coordinator.inspect().nextSequence, 2);
});
test('lost response survives recreation and retries identical payload without another purchase', async () => {
  const storage = store(), sent = []; let lost = true;
  const transport = async (_, payload, options) => { sent.push({ payload, id: options.clientActionId }); if (lost) { lost = false; throw Error('lost response'); } return { receiptConfirmed: true, clientActionId: options.clientActionId }; };
  const first = setup({ storage, transport }); assert.equal((await first.coordinator.execute('buyPlant', { type: 'daisy' }, 3)).error, 'NETWORK_ERROR');
  const next = setup({ storage, transport }); const result = await next.coordinator.execute('sellPlant', { plantId: 'unrelated' }, 99);
  assert.equal(result.recoveredIntent, true); assert.deepEqual(sent[0], sent[1]); assert.equal(sent.length, 2); assert.equal(next.coordinator.inspect().nextSequence, 2);
});
test('pending and wrong receipt IDs cannot acknowledge an intent', async () => {
  for (const reply of [{ pending: true }, { receiptConfirmed: true, clientActionId: 'wrong-id' }, { success: true }]) {
    const { coordinator } = setup({ transport: async () => reply });
    assert.equal((await coordinator.execute('water', { plantId: 'p' })).error, 'GARDEN_R2_REQUEST_UNCONFIRMED'); assert.ok(coordinator.inspect().pending);
  }
});
test('insufficient balance clears rejected payload but does not consume sequence', async () => {
  const { coordinator } = setup({ transport: async () => ({ error: 'GARDEN_R2_INSUFFICIENT_GOLD' }) });
  await coordinator.execute('buyPlant'); assert.equal(coordinator.inspect().pending, null); assert.equal(coordinator.inspect().nextSequence, 1);
});
test('account change before or during a response cannot acknowledge or send a new intent', async () => {
  let current = true, sends = 0;
  const { coordinator } = setup({ isCurrentAccount: () => current, transport: async (_, __, options) => { sends++; current = false; return { receiptConfirmed: true, clientActionId: options.clientActionId }; } });
  assert.equal((await coordinator.execute('buyPlant')).error, 'GARDEN_R2_ACCOUNT_CHANGED'); assert.ok(coordinator.inspect().pending);
  assert.equal((await coordinator.execute('sellPlant')).error, 'GARDEN_R2_ACCOUNT_CHANGED'); assert.equal(sends, 1);
});
test('older intent reconciles by hash and receives original receipt without resend', async () => {
  const storage = store(); const old = setup({ storage, transport: async () => ({ error: 'NETWORK_ERROR' }) }); await old.coordinator.execute('buyPlant', { type: 'daisy' });
  const expectedHash = old.coordinator.inspect().pending.payloadHash;
  let statusPayload, sends = 0;
  const next = setup({ storage, now: () => NOW + GARDEN_R2_RECEIPT_WINDOW_MS + 1, reconcile: async payload => { statusPayload = payload; return { receiptConfirmed: true, clientActionId: payload.clientActionId }; }, transport: async () => { sends++; } });
  assert.equal((await next.coordinator.recover()).receiptConfirmed, true); assert.equal(sends, 0); assert.equal(statusPayload.payloadHash, expectedHash);
});
test('ambiguous expired first intent remains held, never rebased silently', async () => {
  for (const status of [{ error: 'GARDEN_R2_INTENT_AMBIGUOUS' }, { error: 'GARDEN_R2_INTENT_CONFLICT' }]) {
    const storage = store(); const old = setup({ storage, transport: async () => ({ error: 'NETWORK_ERROR' }) }); await old.coordinator.execute('buyPlant');
    const pending = old.coordinator.inspect().pending;
    const next = setup({ storage, now: () => NOW + GARDEN_R2_RECEIPT_WINDOW_MS + 1, reconcile: async () => status, transport: async (_, payload) => { assert.deepEqual(payload, pending.payload); return { error: 'GARDEN_R2_INTENT_AMBIGUOUS' }; } });
    assert.equal((await next.coordinator.recover()).error, status.error); assert.deepEqual(next.coordinator.inspect().pending, pending);
  }
});
test('known stream next sequence after 72h replays only after proof of non-application', async () => {
  const storage = store(); const first = setup({ storage }); await first.coordinator.execute('resume');
  const failed = setup({ storage, transport: async () => ({ error: 'TIMEOUT' }) }); await failed.coordinator.execute('upgradePlant', { plantId: 'p' }, 2);
  const late = setup({ storage, now: () => NOW + GARDEN_R2_RECEIPT_WINDOW_MS + 1, reconcile: async () => ({ applied: false, receiptConfirmed: true, expectedSequence: 2 }) });
  assert.equal((await late.coordinator.recover()).receiptConfirmed, true); assert.equal(late.calls[0].payload.intent.sequence, 2); assert.equal(late.coordinator.inspect().nextSequence, 3);
});
test('corrupt storage and quota failures fail closed before network', async () => {
  for (const storage of [{ getItem: () => '{invalid', setItem: () => {} }, { getItem: () => null, setItem: () => { throw Error('quota'); } }]) {
    const { coordinator, calls } = setup({ storage }); assert.equal((await coordinator.execute('buyPlant')).error, 'GARDEN_R2_STORAGE_UNAVAILABLE'); assert.equal(calls.length, 0);
  }
});
test('tampered durable payload cannot be resent under the original ID', async () => {
  const { coordinator, storage } = setup({ transport: async () => ({ error: 'TIMEOUT' }) }); await coordinator.execute('buyPlant', { type: 'daisy' });
  const record = coordinator.inspect(); record.pending.payload.input.type = 'fern'; storage.setItem(coordinator.key, JSON.stringify(record));
  assert.equal((await coordinator.recover()).error, 'GARDEN_R2_INTENT_CONFLICT');
});
test('reload-required errors are terminal and recognized by both generations', () => {
  for (const code of ['CLIENT_UPDATE_REQUIRED', 'GARDEN_R2_CLIENT_UPDATE_REQUIRED', 'GARDEN_R2_VERSION_UNSUPPORTED']) assert.equal(requiresGardenReload(code), true);
  assert.equal(requiresGardenReload('NETWORK_ERROR'), false);
});
test('prices, passive rates, adapter units and all positive upgrade deltas stay exact', () => {
  assert.equal(formatR2Gold(25), '25'); assert.equal(formatR2Rate(2400), '2.4'); assert.equal(formatR2Rate(60), '0.06'); assert.equal(r2IncomePerSecond({ goldMilliPerMinute: 2400 }), .04);
  for (const plant of Object.values(R2_PLANTS)) for (let rank = 1; rank < 5; rank++) assert.notEqual(formatR2Rate(r2GoldRate(plant.id, rank + 1) - r2GoldRate(plant.id, rank)), '0');
  assert.equal(gardenPlantPhaseDuration({ type: 'daisy', phase: 1 }, {}), 180000); assert.equal(gardenPlantPhaseDuration({ type: 'daisy', phase: 1 }, null), 480000);
});
test('view adapter preserves IDs, shelves and gold while exposing finite ranks and no local credit state', () => {
  const garden = { name: 'Existing', shelvesUnlocked: 4, plants: [{ id: 'saved-id', level: 40 }] };
  const view = { chapter: 30, xp: 0, xpRequired: 0, pendingLegacyRewardGold: 0, plants: [{ id: 'saved-id', level: 40, goldRank: 5, mastery: 3 }] };
  const state = gardenR2ViewState(garden, view, 987654321); assert.equal(state.gold, 987654321); assert.equal(state.shelvesUnlocked, 4); assert.equal(state.plants[0].id, 'saved-id'); assert.equal(state.plants[0].level, 5); assert.equal(state.levelReady, false);
});
test('mastery is terminal at three and permanent discounts have exact material prices', () => {
  const p = { type: 'daisy', goldRank: 5, phase: 3 }, view = { chapter: 30, researchIds: ['care_3'], plants: [p], masteryByType: { daisy: 2 }, masteryDiscounts: { daisy: 8 }, projectsCompleted: ['tea_shelf'] };
  assert.deepEqual(r2MasteryOffer(view, p), { target: 3, chapter: 30, cost: 1, delta: 240, unlocked: true });
  view.masteryByType.daisy = 3; assert.equal(r2MasteryOffer(view, p), null);
});
function adoption(options = {}) {
  const storage = store(), snapshot = { player: { id: ACCOUNT }, garden: { economyVersion: 2, economicRevision: 0, acknowledgedEarnedTotal: 0, totalGoldEarned: 0, plants: [], lastTick: NOW } };
  const calls = [];
  return { storage, snapshot, calls, args: { accountId: ACCOUNT, storage, readSnapshot: () => snapshot, isCurrentAccount: () => true, legacyCoordinator: { recover: async () => ({ noPending: true }), execute: async () => ({ error: 'unexpected credit' }) }, request: async (...args) => { calls.push(args); return {}; }, ...options } };
}
test('adoption first recovers legacy requests and forwards exact authoritative revision/total', async () => {
  const a = adoption(); const result = await prepareGardenR2Adoption(a.args); assert.deepEqual(result.input, { legacyRevision: 0, acknowledgedTotal: 0 }); assert.equal(a.calls.length, 0);
  a.args.legacyCoordinator.recover = async () => ({ error: 'GARDEN_INTENT_AMBIGUOUS' }); assert.equal((await prepareGardenR2Adoption(a.args)).error, 'GARDEN_INTENT_AMBIGUOUS');
});
test('adoption checkpoints unconfirmed legacy earnings before switching namespaces', async () => {
  const a = adoption(); a.storage.setItem(gardenLocalStateKey(ACCOUNT), JSON.stringify({ version: 1, accountId: ACCOUNT, state: { ...a.snapshot.garden, totalGoldEarned: 5 } }));
  a.args.legacyCoordinator.execute = async (action, payload) => { assert.equal(action, 'garden.creditEarned'); assert.equal(payload.throughTotal, 5); Object.assign(a.snapshot.garden, { totalGoldEarned: 5, acknowledgedEarnedTotal: 5 }); return { receiptConfirmed: true }; };
  assert.deepEqual((await prepareGardenR2Adoption(a.args)).input, { legacyRevision: 0, acknowledgedTotal: 5 }); assert.equal(a.calls[0][0], 'garden.sync');
});
test('corrupt cache and stale unsynced earnings require review without reset, discard or adoption', async () => {
  for (const raw of ['{broken', JSON.stringify({ version: 1, accountId: ACCOUNT, state: { economyVersion: 2, economicRevision: 9, totalGoldEarned: 100, plants: [] } })]) {
    const a = adoption(); a.storage.setItem(gardenLocalStateKey(ACCOUNT), raw); assert.match((await prepareGardenR2Adoption(a.args)).error, /STORAGE_UNAVAILABLE|LEGACY_REVIEW_REQUIRED/); assert.equal(a.calls.length, 0); assert.equal(a.storage.getItem(gardenLocalStateKey(ACCOUNT)), raw);
  }
});
test('adopted client and release gate remain separate from legacy credit/reset provider', () => {
  const app = fs.readFileSync(new URL('../src/games/garden-shelf/GardenShelfGame.tsx', import.meta.url), 'utf8');
  const provider = fs.readFileSync(new URL('../src/games/garden-shelf/lib/GardenR2Provider.tsx', import.meta.url), 'utf8');
  assert.match(app, /gardenR2Available === true/); assert.match(app, /blockedR2/); assert.match(app, /halted=\{reloadRequired.current\}/);
  assert.doesNotMatch(provider, /onEarnedCredit|resetEconomy|onGoldDelta|creditEarned/); assert.match(provider, /incomePerSecond: r2IncomePerSecond\(view\)/);
});

test('proven-unapplied expired first adoption or purchase is archived and safely renewed once', async () => {
  for (const command of ['adopt', 'buyPlant']) {
    const storage = store(); const old = setup({ storage, transport: async () => ({ error: 'NETWORK_ERROR' }) });
    await old.coordinator.execute(command, { preserved: 'exact input' }, 23); const pending = old.coordinator.inspect().pending;
    const late = setup({ storage, uuid: () => 'renewed_garden_r2_stream_123', now: () => NOW + GARDEN_R2_RECEIPT_WINDOW_MS + 1, reconcile: async () => ({ applied: false, receiptConfirmed: true, expectedSequence: 1 }) });
    assert.equal((await late.coordinator.recover()).receiptConfirmed, true); assert.equal(late.calls.length, 1);
    const renewed = late.calls[0]; assert.notEqual(renewed.meta.clientActionId, pending.clientActionId); assert.equal(renewed.payload.expectedRevision, 23);
    assert.equal(renewed.payload.command, command); assert.deepEqual(renewed.payload.input, pending.payload.input); assert.equal(renewed.payload.accountId, ACCOUNT);
    assert.equal(renewed.payload.intent.createdAt, NOW + GARDEN_R2_RECEIPT_WINDOW_MS + 1);
    const archive = JSON.parse(storage.getItem(`${old.coordinator.key}:archive:${pending.clientActionId}`)); assert.deepEqual(archive.pending, pending);
    await late.coordinator.recover(); assert.equal(late.calls.length, 1);
  }
});

test('expired lost first adoption and purchase reconcile against real server without minting or double spending', async () => {
  for (const command of ['adopt', 'buyPlant']) {
    let p = { id: ACCOUNT, schemaVersion: 11, resources: { gold: 100 }, garden: createGardenEconomyState(NOW), stats: { totalGoldEarned: 0 } };
    if (command === 'buyPlant') p = migrateGardenR2(p, { now: NOW, legacyRevision: 0, acknowledgedTotal: 0 });
    const input = command === 'adopt' ? { legacyRevision: 0, acknowledgedTotal: 0 } : { type: 'daisy', shelfIndex: 0, spotIndex: 0 };
    const storage = store(), early = setup({ storage, transport: async () => ({ error: 'NETWORK_ERROR' }) });
    await early.coordinator.execute(command, input, 0);
    const lateTime = NOW + GARDEN_R2_RECEIPT_WINDOW_MS + 1;
    const late = setup({ storage, now: () => lateTime, uuid: () => 'renewed_real_server_stream_1', reconcile: async payload => reconcileGardenR2(p, payload), transport: async (_, payload, options) => {
      const result = executeGardenR2(p, payload, { enabled: true, now: lateTime, clientActionId: options.clientActionId, makePlantId: () => 'once-only-plant' });
      if (result.commit) { p.garden = result.commit.garden; p.gardenAccounting = result.commit.gardenAccounting; p._gardenProgression = result.commit.gardenProgression; p.resources.gold = result.commit.gold; }
      return result;
    } });
    assert.equal((await late.coordinator.recover()).receiptConfirmed, true);
    assert.equal(p.resources.gold, command === 'adopt' ? 100 : 75); assert.equal(p.garden.plants.length, command === 'adopt' ? 0 : 1);
    assert.equal((await late.coordinator.recover()).noPending, true); assert.equal(p.resources.gold, command === 'adopt' ? 100 : 75);
  }
});

test('arbitrary server 5xx errors retain identity and recover, while permanent/version failures stop', async () => {
  const reply = { error: 'TEMPORARY_DATABASE_UNAVAILABLE', _httpStatus: 503 };
  assert.equal(isGardenR2Retryable(reply), true);
  assert.equal(isGardenR2Retryable({ error: 'GARDEN_R2_INSUFFICIENT_GOLD', _httpStatus: 409 }), false);
  assert.equal(isGardenR2Retryable({ error: 'GARDEN_R2_CLIENT_UPDATE_REQUIRED', _httpStatus: 500 }), false);
  const storage = store(), failed = setup({ storage, transport: async () => reply });
  assert.equal((await failed.coordinator.execute('water', { plantId: 'p' })).error, reply.error);
  const pending = failed.coordinator.inspect().pending, recovered = setup({ storage });
  assert.equal((await recovered.coordinator.recover()).receiptConfirmed, true); assert.deepEqual(recovered.calls[0].payload, pending.payload); assert.equal(recovered.calls[0].meta.clientActionId, pending.clientActionId);
});

test('R2 reward summary excludes the progression sheet and accumulates undismissed rewards', () => {
  const presentation = fs.readFileSync(new URL('../src/games/garden-shelf/GardenPresentation.tsx', import.meta.url), 'utf8');
  assert.match(presentation, /r2 && !offline && !notice && panel === 'progression'/);
  assert.match(presentation, /setNotice\(previousNotice => \({ reward: reward \+ \(previousNotice\?\.r2 \? previousNotice\.reward : 0\)/);
});
