import './helpers/garden-r2-route-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createDefaultPlayer } = await import('../game-logic/player.js');
const { createGardenEconomyState } = await import('../game-logic/garden-economy.js');
const { applyAction, applyActionWithReceipt, buildSnapshot } = await import('../routes/player.js');
const { withPlayerLock, applyMigrations } = await import('../playerManager.js');
const { GARDEN_R2_CATALOG_REVISION, GARDEN_R2_RELEASE_POLICY } = await import('../game-logic/garden-r2/catalog.js');
const { gardenR2Hash, gardenR2Snapshot } = await import('../game-logic/garden-r2/service.js');
const NOW = Date.UTC(2026, 9, 2, 12), STREAM = 'garden_r2_route_stream_0001';
function fixture(id = 'garden-r2-route') {
  const p = createDefaultPlayer(id, 'Fixture', NOW);
  p.garden = { ...createGardenEconomyState(NOW), level: 30, plants: [{ id: 'kept-plant', type: 'fern', level: 40, phase: 3, phaseProgress: 0, shelfIndex: 0, spotIndex: 0, lastTapped: 0 }] };
  buildSnapshot(p); return p;
}
function command(p, type, input = {}, stream = STREAM) {
  const sequence = (p._gardenProgression?.streams?.[stream]?.sequence || 0) + 1;
  return { payload: { accountId: p.id, version: 1, catalogRevision: GARDEN_R2_CATALOG_REVISION, expectedRevision: p._gardenProgression?.revision || 0, command: type, input, intent: { streamId: stream, sequence, createdAt: NOW } }, clientActionId: `garden-r2:${stream}:${sequence}` };
}
function invoke(p, cmd, overrides = {}) { return applyActionWithReceipt(p, 'garden.r2', cmd.payload, { clientActionId: cmd.clientActionId, serverNow: NOW, gardenR2Enabled: true, ...overrides }); }
async function adopt(p) { const cmd = command(p, 'adopt', { legacyRevision: p.gardenAccounting.revision, acknowledgedTotal: p.gardenAccounting.creditedTotal }); const r = await invoke(p, cmd); assert.equal(r.status, 200); return cmd; }

test('default-off real route advertises no rollout and refuses adoption without internal policy opt-in', async () => {
  const p = fixture(), before = structuredClone(p), snapshot = buildSnapshot(p);
  assert.equal(GARDEN_R2_RELEASE_POLICY.enabled, false); assert.equal(snapshot.gardenR2Available, false); assert.equal(snapshot.gardenR2, null);
  const cmd = command(p, 'adopt', { legacyRevision: 0, acknowledgedTotal: 0 });
  const result = await invoke(p, cmd, { gardenR2Enabled: false });
  assert.equal(result.status, 409); assert.equal(result.body.error, 'GARDEN_R2_NOT_ENABLED'); assert.equal(p._gardenProgression, undefined); assert.deepEqual(p.garden, before.garden); assert.equal(p.resources.gold, before.resources.gold);
});

test('route commits only Garden/gold/stats and public view never exposes private migration or streams', async t => {
  t.mock.method(Date, 'now', () => NOW);
  const p = fixture(), old = structuredClone(p); await adopt(p);
  for (const key of ['schemaVersion', 'resources', 'yard', 'merge', '_mergeLabFence', 'farm', 'achievements', 'room', 'pet']) assert.deepEqual(p[key], old[key], key);
  assert.equal(p.garden.economyVersion, old.garden.economyVersion);
  const snapshot = buildSnapshot(p); assert.equal(snapshot.gardenR2.version, 1); assert.equal(snapshot.gardenR2.plants[0].id, 'kept-plant');
  assert.equal(snapshot.gardenR2.plants[0].resaleGold, 1700000); assert.equal(snapshot.gardenR2.migration, undefined); assert.equal(snapshot.gardenR2.streams, undefined);
  const result = await invoke(p, command(p, 'tend', { plantId: 'kept-plant' }));
  assert.equal(result.status, 200); assert.equal(result.body.commit, undefined); assert.equal(result.body.snapshot._gardenProgression, undefined); assert.equal(result.body.receiptConfirmed, true); assert.equal(p.resources.gold, old.resources.gold + 1);
  const persisted = JSON.parse(JSON.stringify(p)); applyMigrations(persisted); assert.deepEqual(persisted._gardenProgression, p._gardenProgression);
});

test('old earn/sync/reset/actions cannot mutate adopted account even through cached generic receipts', async () => {
  const p = fixture(); await adopt(p); const garden = structuredClone(p.garden), progression = structuredClone(p._gardenProgression), gold = p.resources.gold;
  p.actionReceipts = [{ clientActionId: 'old-cache-123456', action: 'garden.resetEconomy', extras: { goldDelta: 120 }, appliedAt: NOW }];
  for (const action of ['garden.sync','garden.creditEarned','garden.goldDelta','garden.resetEconomy','garden.levelUp','garden.buyPlant','garden.upgradePlant','garden.sellPlant']) {
    for (const run of [() => applyAction(p, action, { state: garden }), () => applyActionWithReceipt(p, action, { state: garden }, { clientActionId: 'old-cache-123456', serverNow: NOW })]) {
      const result = await run(); assert.equal(result.status, 409, action); assert.equal(result.body.error, 'CLIENT_UPDATE_REQUIRED', action);
      assert.deepEqual(p.garden, garden); assert.deepEqual(p._gardenProgression, progression); assert.equal(p.resources.gold, gold);
    }
  }
});

test('loss/reload replay and reconcile retain one receipt while outdated or mismatched intent cannot spend', async () => {
  const p = fixture(), adoption = await adopt(p), request = command(p, 'sellPlant', { plantId: 'kept-plant' });
  const first = await invoke(p, request); assert.equal(first.status, 200); const gold = p.resources.gold;
  p.actionReceipts = []; const loaded = JSON.parse(JSON.stringify(p));
  const replay = await invoke(loaded, request, { serverNow: NOW + 10 * 86400000 }); assert.equal(replay.body.duplicate, true); assert.equal(loaded.resources.gold, gold);
  const recon = await applyAction(loaded, 'garden.r2.reconcile', { accountId: p.id, streamId: STREAM, sequence: 2, clientActionId: request.clientActionId, payloadHash: gardenR2Hash(request.payload) }); assert.equal(recon.body.receiptConfirmed, true); assert.equal(recon.body.duplicate, true);
  const old = await invoke(loaded, adoption); assert.equal(old.body.error, 'GARDEN_R2_INTENT_SUPERSEDED');
  const stale = command(loaded, 'claimIntro', {}, 'different_stream_00001'); stale.payload.expectedRevision = 0; assert.equal((await invoke(loaded, stale)).body.error, 'GARDEN_R2_REVISION_CONFLICT');
  stale.payload.accountId = 'other'; assert.equal((await invoke(loaded, stale)).body.error, 'GARDEN_R2_ACCOUNT_MISMATCH'); assert.equal(loaded.resources.gold, gold);
});

test('first uncommitted adoption reconciles safely; malformed private namespace stays fenced', async () => {
  const p = fixture(), cmd = command(p, 'adopt', { legacyRevision: 0, acknowledgedTotal: 0 });
  const result = await applyAction(p, 'garden.r2.reconcile', { accountId: p.id, streamId: STREAM, sequence: 1, clientActionId: cmd.clientActionId, payloadHash: gardenR2Hash(cmd.payload) });
  assert.equal(result.status, 200); assert.equal(result.body.applied, false); assert.equal(result.body.gardenR2, null);
  for (const bad of [null, false, {}, { version: 9 }]) {
    p._gardenProgression = bad; assert.equal(gardenR2Snapshot(p).blocked, true);
    assert.equal((await applyActionWithReceipt(p, 'garden.resetEconomy')).body.error, 'CLIENT_UPDATE_REQUIRED');
  }
});

test('actual memory lock serializes duplicated commands and socket projection has ordering/account fences', async () => {
  const id = 'garden-r2-memory'; let request; const emitted = [];
  globalThis.__gardenR2Socket = { to: target => ({ emit: (event, value) => emitted.push({ target, event, value }) }) };
  try {
    await withPlayerLock(id, async p => { Object.assign(p, fixture(id)); await adopt(p); request = command(p, 'tend', { plantId: 'kept-plant' }); });
    const results = await Promise.all(Array.from({ length: 5 }, () => withPlayerLock(id, p => invoke(p, request))));
    assert.equal(results.filter(r => r.body.duplicate).length, 4);
    const sequences = results.map(r => r.body.snapshot.player.syncSeq); assert.equal(new Set(sequences).size, 5);
    assert.ok(sequences.every(Number.isSafeInteger));
    for (const message of emitted) { assert.equal(message.value.payload.accountId, id); assert.equal(message.value.payload.syncSeq, message.value.seq); assert.equal(message.value.payload.gardenR2.version, 1); assert.equal(message.value.payload._gardenProgression, undefined); }
  } finally { delete globalThis.__gardenR2Socket; }
});

test('actual OCC callback retries against remote winner instead of spending twice (synthetic SQL boundary)', async () => {
  const initial = fixture('garden-r2-occ'); await adopt(initial); initial._version = 'initial';
  const request = command(initial, 'sellPlant', { plantId: 'kept-plant' }); let row = structuredClone(initial), selects = 0, updates = 0;
  globalThis.__gardenR2TestDb = async (strings, ...values) => {
    const query = strings.join('?');
    if (query.includes('INSERT INTO players')) return [];
    if (query.includes('SELECT data')) { selects++; return [{ data: structuredClone(row) }]; }
    if (query.includes('UPDATE players')) {
      updates++;
      if (updates === 1) { const remote = structuredClone(row); assert.equal((await invoke(remote, request)).status, 200); remote._version = 'remote'; row = remote; return []; }
      assert.equal(values[2], row._version); row = structuredClone(values[0]); return [{ id: row.id }];
    }
    throw Error('Unexpected SQL');
  };
  try {
    const result = await withPlayerLock(initial.id, p => invoke(p, request));
    assert.equal(result.body.duplicate, true); assert.equal(selects, 2); assert.equal(updates, 2); assert.equal(row.resources.gold, initial.resources.gold + 1700000); assert.equal(row.garden.plants.length, 0); assert.equal(row._gardenProgression.revision, 2);
  } finally { delete globalThis.__gardenR2TestDb; }
});


test('snapshot cannot normalize away corrupt legacy accounting before adoption validates it', async () => {
  const p = fixture(); p.gardenAccounting = { version: 77, revision: 20, creditedTotal: 123, streams: { preserved: true } };
  const original = structuredClone(p.gardenAccounting); buildSnapshot(p); assert.deepEqual(p.gardenAccounting, original);
  const result = await invoke(p, command(p, 'adopt', { legacyRevision: 0, acknowledgedTotal: 0 }));
  assert.equal(result.body.error, 'GARDEN_R2_LEGACY_ACCOUNTING_INVALID'); assert.deepEqual(p.gardenAccounting, original); assert.equal(p._gardenProgression, undefined);
});
