import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createDefaultPlayer } from '../../design/yard-v2/baseline-47519/game-logic/player.js';
import { migratePlayerSnapshot, restoreRawInput } from './migration.mjs';
import { advanceYard } from './simulation.mjs';
import { dispatchInput, splitForStorage, planCommand as rawPlanCommand, MemoryCAS, STORE_FORMAT } from './boundary.mjs';
import { clone, digest } from './util.mjs';
const base = () => {
  const p = createDefaultPlayer('boundary-fixture', 'Fixture', 0);
  p.yard.pendingGifts = [{ id: 'owed-gift', visitorId: 'mika_cat', treats: 7, shinyTreats: 1, mementoId: null, createdAt: 0 }];
  p.yard.goodieInventory.alchemy_living_arbor = 3;
  p.yard.goodieInventory.alchemy_echo_chimes = 5;
  return p;
};
const report = { status: 'ISOLATED_PROOF_ONLY', productionRoutesChanged: false, databaseConcurrencyTested: false };
const planCommand = (record, command, options) => rawPlanCommand(record, { ...command,
  actionId: command.actionId ? `yard-v2:${command.actionId}` : command.actionId }, options);

test('known version dispatch preserves the new inventory on both snapshot and mutation paths', () => {
  const p = base(), dispatched = dispatchInput(p, { now: 0 });
  assert.equal(dispatched.mode, 'legacy-migration');
  const { record } = splitForStorage(dispatched.state);
  const snapshot = planCommand(record, { action: 'snapshot', actionId: 'snapshot-1', expectedVersion: record.version }, { now: 60000 });
  assert.equal(snapshot.status, 200); assert.equal(snapshot.committed, false);
  assert.equal(snapshot.view.player.yard.goodieInventory.alchemy_living_arbor, 3);
  const store = new MemoryCAS(record); assert.equal(store.commit(snapshot.proposal), true);
  const current = store.read();
  const mutation = planCommand(current, { action: 'yard.collectGifts', actionId: 'claim-1', expectedVersion: current.version }, { now: 60001 });
  assert.equal(mutation.status, 200);
  assert.equal(mutation.view.player.yard.goodieInventory.alchemy_echo_chimes, 5);
  assert.equal(mutation.view.player.yard.currencies.treats, p.yard.currencies.treats + 7);
  assert.deepEqual(mutation.view.player.resources, p.resources);
  assert.deepEqual(mutation.view.player.merge, p.merge);
  assert.equal(dispatchInput(mutation.proposal.nextRecord.state, { now: 60001 }).mode, 'prototype');
});

test('malformed and future versions are quarantined with exact backups, never reset or downgraded', () => {
  const futurePlayer = base(); futurePlayer.schemaVersion = 99;
  const futureYard = base(); futureYard.yard.schemaVersion = 99;
  const malformedYard = base(); malformedYard.yard.pendingGifts = { unknownShape: ['retain'] };
  const futureEnvelope = migratePlayerSnapshot(base(), { now: 0 }); futureEnvelope.runtime.version = 9;
  for (const input of [null, [], 'malformed', undefined, futurePlayer, futureYard, malformedYard, futureEnvelope]) {
    const before = clone(input);
    const result = dispatchInput(input, { now: 0 });
    assert.equal(result.mode, 'quarantine-readonly');
    assert.equal(result.mutationsAllowed, false);
    assert.deepEqual(result.backup.rawSnapshot, before);
    assert.deepEqual(input, before);
  }
  const badStore = { format: 'isolated-yard-store/v99', rawData: { retain: [1, 2, 3] } };
  const result = planCommand(badStore, {}, { now: 0 });
  assert.equal(result.status, 409); assert.deepEqual(result.rawBackup, badStore);
});

test('original snapshot/receipt is immutable and not copied into every tick or persisted state update', () => {
  const source = base(), initial = migratePlayerSnapshot(source, { now: 0 });
  assert.ok(Object.isFrozen(initial.migration.rawBackup));
  const one = advanceYard(initial, 60000), two = advanceYard(one, 120000);
  assert.equal(one.migration, initial.migration); assert.equal(two.migration.rawBackup, initial.migration.rawBackup);
  const { record, backup } = splitForStorage(two);
  assert.equal(record.format, STORE_FORMAT);
  assert.equal(record.state.migration.rawBackup, undefined);
  assert.equal(record.state.migration.receipt, undefined);
  assert.ok(record.state.migration.backupId && record.state.migration.receiptId);
  assert.deepEqual(backup.rawSnapshot, source);
  const next = advanceYard(record.state, 180000);
  assert.equal(next.migration, record.state.migration);
  assert.equal(splitForStorage(next).backup, null);
  assert.throws(() => restoreRawInput(next), /external immutable backup/);
  assert.deepEqual(restoreRawInput(next, backup), source);
  const tampered = { ...backup, rawSnapshot: { ...source, username: 'tampered' } };
  assert.throws(() => restoreRawInput(next, tampered), /integrity/);
  report.backup = { onceOnlyContentAddressedOrigin: true, tickReusesOriginReference: true, persistedWritesContainRawBackup: false };
});

test('two competing gift claims can produce only one winning CAS and never a double credit', () => {
  const raw = base(), state = migratePlayerSnapshot(raw, { now: 0 });
  const { record } = splitForStorage(state, 'v0'), store = new MemoryCAS(record);
  const firstRead = store.read(), secondRead = store.read();
  const a = planCommand(firstRead, { action: 'yard.collectGifts', actionId: 'claim-A', expectedVersion: 'v0' }, { now: 1000 });
  const b = planCommand(secondRead, { action: 'yard.collectGifts', actionId: 'claim-B', expectedVersion: 'v0' }, { now: 1000 });
  assert.equal(store.commit(a.proposal), true); assert.equal(store.commit(b.proposal), false);
  const latest = store.read();
  const retry = planCommand(latest, { action: 'yard.collectGifts', actionId: 'claim-B', expectedVersion: latest.version }, { now: 1000 });
  assert.equal(retry.receipt.extras.receipt.collected.gifts, 0);
  assert.equal(store.commit(retry.proposal), true);
  const final = store.read();
  assert.equal(final.state.player.yard.currencies.treats, raw.yard.currencies.treats + 7);
  assert.equal(final.state.player.yard.currencies.shinyTreats, raw.yard.currencies.shinyTreats + 1);
  assert.equal(Object.values(final.state.runtime.giftLedger).filter((g) => g.status === 'claimed').length, 1);
  report.casProof = { competingPlans: 2, firstRoundCommitted: 1, retryAdditionalGifts: 0, databaseCommitImplemented: false };
});

test('same command nonce replays even with a stale token, but payload changes conflict', () => {
  const { record } = splitForStorage(migratePlayerSnapshot(base(), { now: 0 }), 'v0');
  const command = { action: 'yard.collectGifts', actionId: 'claim', expectedVersion: 'v0', payload: {} };
  const a = planCommand(record, command, { now: 1000 }), committed = a.proposal.nextRecord;
  const b = planCommand(committed, command, { now: 999999 });
  assert.equal(b.replayed, true); assert.equal(b.proposal, null);
  assert.deepEqual(b.receipt, a.receipt);
  const altered = planCommand(committed, { ...command, payload: { altered: true } }, { now: 1001 });
  assert.equal(altered.status, 409); assert.equal(altered.error, 'ACTION_ID_PAYLOAD_CONFLICT');
  const different = planCommand(committed, { ...command, actionId: 'other' }, { now: 1001 });
  assert.equal(different.status, 409); assert.equal(different.error, 'OCC_CONFLICT');
});

test('snapshot/claim races retry at the committed monotonic cursor instead of rewinding time', () => {
  const { record } = splitForStorage(migratePlayerSnapshot(base(), { now: 0 }), 'v0');
  const store = new MemoryCAS(record);
  const snapshot = planCommand(record, { action: 'snapshot', actionId: 'snapshot', expectedVersion: 'v0' }, { now: 1000 });
  const earlierClaim = planCommand(record, { action: 'yard.collectGifts', actionId: 'claim', expectedVersion: 'v0' }, { now: 900 });
  assert.equal(store.commit(snapshot.proposal), true); assert.equal(store.commit(earlierClaim.proposal), false);
  const latest = store.read();
  const retry = planCommand(latest, { action: 'yard.collectGifts', actionId: 'claim', expectedVersion: latest.version }, { now: 900 });
  assert.equal(retry.receipt.at, 1000); assert.equal(retry.receipt.requestedServerNow, 900);
  assert.equal(retry.proposal.nextRecord.state.runtime.cursorMs, 1000);
  assert.equal(store.commit(retry.proposal), true);
});

test('source evidence really contains the destructive paths and existing distributed OCC/receipt limits', async () => {
  const root = new URL('../../design/yard-v2/baseline-47519/', import.meta.url);
  const routes = await readFile(new URL('routes/player.js', root), 'utf8');
  const merge = await readFile(new URL('routes/mergeRoutes.js', root), 'utf8');
  const manager = await readFile(new URL('playerManager.js', root), 'utf8');
  assert.match(routes, /const ACTION_RECEIPT_LIMIT = 200/); assert.match(routes, /ACTION_RECEIPT_TTL_MS = 72/);
  assert.match(routes, /p\.yard = simulate[\s\S]*normalizeYardState/);
  assert.match(routes, /snapshot: buildSnapshot\(p/);
  assert.match(merge, /p\.yard = normalizeYardState/);
  assert.match(manager, /COALESCE\(data->>'_version', '0'\) = \$\{oldVersion\}/);
  assert.match(manager, /runAfterCommitHooks/);
  report.productionCallsitesVerified = true;
});


test('preserved legacy receipts replay without paying newly earned gifts and pruned legacy nonces are fenced', () => {
  const p = base();
  const legacyId = 'legacy-claim-001';
  const requestHash = Buffer.from(digest({ action: 'yard.collectGifts', payload: {} }), 'hex').toString('base64url');
  p._actionReceipts = { items: [{ clientActionId: legacyId, payloadHash: requestHash,
    action: 'yard.collectGifts', extras: { collected: { treats: 23, shinyTreats: 0, gifts: 2 } }, createdAt: 0 }] };
  const { record } = splitForStorage(migratePlayerSnapshot(p, { now: 0 }), 'v0');
  const before = digest(record);
  const replay = rawPlanCommand(record, { action: 'yard.collectGifts', payload: {}, actionId: legacyId, expectedVersion: 'stale' }, { now: 999999999 });
  assert.equal(replay.legacyReplay, true); assert.equal(replay.proposal, null);
  assert.equal(replay.receipt.extras.collected.treats, 23);
  assert.equal(replay.view.player.yard.pendingGifts.length, 1);
  assert.equal(replay.view.player.yard.currencies.treats, p.yard.currencies.treats);
  assert.equal(digest(record), before);
  const conflict = rawPlanCommand(record, { action: 'yard.collectGifts', payload: { different: true }, actionId: legacyId, expectedVersion: 'v0' }, { now: 0 });
  assert.equal(conflict.error, 'LEGACY_ACTION_ID_PAYLOAD_CONFLICT');
  const absent = rawPlanCommand(record, { action: 'yard.collectGifts', payload: {}, actionId: 'old-nonce-pruned', expectedVersion: 'v0' }, { now: 0 });
  assert.equal(absent.error, 'LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT');
  report.legacyReceiptReplay = { existingReceiptReplayedWithoutCredit: true, unrecoverableLegacyNonceFenced: true };
});

test('boundary proof report explicitly excludes actual route/database integration', async () => {
  report.versionDispatch = { futureQuarantined: true, malformedBackupPreserved: true, legacyNormalizersCalledForPrototype: false };
  report.receiptsStoreFullSnapshots = false;
  await writeFile(new URL('./BOUNDARY-VALIDATION.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
});
