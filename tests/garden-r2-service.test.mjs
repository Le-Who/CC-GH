import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPlayer } from '../game-logic/player.js';
import { createGardenEconomyState } from '../game-logic/garden-economy.js';
import { GARDEN_R2_CATALOG_REVISION } from '../game-logic/garden-r2/catalog.js';
import { executeGardenR2, reconcileGardenR2, gardenR2Hash, gardenR2Snapshot, gardenR2BlocksLegacy } from '../game-logic/garden-r2/service.js';
const NOW = Date.UTC(2026, 9, 2, 12), STREAM = 'garden_r2_service_stream_1';
function player() { const p = createDefaultPlayer('garden-service-account', 'Fixture', NOW); p.garden = { ...createGardenEconomyState(NOW), plants: [{ id: 'growing-plant', type: 'daisy', level: 1, phase: 0, phaseProgress: 0, shelfIndex: 0, spotIndex: 0, lastTapped: 0 }] }; return p; }
function request(p, command, input = {}, stream = STREAM, now = NOW) {
  const sequence = (p._gardenProgression?.streams?.[stream]?.sequence || 0) + 1;
  const payload = { version: 1, catalogRevision: GARDEN_R2_CATALOG_REVISION, accountId: p.id, command, input, expectedRevision: p._gardenProgression?.revision || 0, intent: { streamId: stream, sequence, createdAt: now } };
  return { payload, options: { clientActionId: `garden-r2:${stream}:${sequence}`, now } };
}
function commit(p, result) { assert.equal(result.error, undefined); if (result.commit) Object.assign(p, { garden: result.commit.garden, _gardenProgression: result.commit.gardenProgression, ...(result.commit.gardenAccounting ? { gardenAccounting: result.commit.gardenAccounting } : {}), resources: { ...p.resources, gold: result.commit.gold }, stats: result.commit.stats }); }
function adopt(p = player()) { const r = request(p, 'adopt', { legacyRevision: 0, acknowledgedTotal: 0 }); commit(p, executeGardenR2(p, r.payload, r.options)); return p; }
function reconcile(p, r) { return reconcileGardenR2(p, { accountId: r.payload.accountId, streamId: r.payload.intent.streamId, sequence: r.payload.intent.sequence, clientActionId: r.options.clientActionId, payloadHash: gardenR2Hash(r.payload) }); }

test('strict envelopes and payloads reject forged authoritative fields atomically', () => {
  const p = adopt(), before = structuredClone(p), r = request(p, 'resume');
  for (const payload of [{ ...r.payload, gold: 9000 }, { ...r.payload, input: { substrate: 60 } }, { ...r.payload, intent: { ...r.payload.intent, namespace: {} } }, { ...r.payload, expectedRevision: -1 }, { ...r.payload, version: 2 }, { ...r.payload, accountId: 'other' }]) {
    assert.ok(executeGardenR2(p, payload, r.options).error); assert.deepEqual(p, before);
  }
});

test('failed post-settlement actions roll back accrued gold, growth, clock and revision together', () => {
  const p = adopt(), before = structuredClone(p), later = NOW + 6 * 3600000;
  const invalid = request(p, 'claimProject', {}, STREAM, later); const refused = executeGardenR2(p, invalid.payload, invalid.options);
  assert.equal(refused.error, 'GARDEN_R2_PROJECT_NOT_READY'); assert.deepEqual(p, before);
  const valid = request(p, 'resume', {}, STREAM, later); commit(p, executeGardenR2(p, valid.payload, valid.options));
  assert.equal(p.garden.plants[0].phase, 3); assert.ok(p.resources.gold > before.resources.gold); assert.equal(p._gardenProgression.lastSettledAt, later);
});

test('reconciliation is read-only, rejects changed hashes and cannot confirm a different account', () => {
  const p = adopt(), r = request(p, 'resume'); assert.equal(reconcile(p, r).applied, false);
  commit(p, executeGardenR2(p, r.payload, r.options)); const before = structuredClone(p);
  assert.equal(reconcile(p, r).duplicate, true); assert.deepEqual(p, before);
  const wrong = structuredClone(r); wrong.payload.command = 'heartbeat'; assert.equal(reconcile(p, wrong).error, 'GARDEN_R2_INTENT_CONFLICT');
  wrong.payload.accountId = 'other'; assert.equal(reconcile(p, wrong).error, 'GARDEN_R2_ACCOUNT_MISMATCH');
  assert.equal(reconcileGardenR2(p, { accountId: p.id, streamId: '__proto__', sequence: 1, clientActionId: 'garden-r2:__proto__:1', payloadHash: 'a'.repeat(64) }).error, 'GARDEN_R2_INTENT_INVALID');
  assert.deepEqual(p, before);
});

test('rollout rollback leaves adopted state fenced and reconcilable without reinitialization', () => {
  const p = adopt(), before = structuredClone(p), r = request(p, 'resume');
  assert.equal(executeGardenR2(p, r.payload, { ...r.options, enabled: false }).error, 'GARDEN_R2_NOT_ENABLED'); assert.deepEqual(p, before);
  assert.equal(gardenR2BlocksLegacy(p, 'garden.creditEarned'), true); assert.equal(gardenR2Snapshot(p).version, 1);
  for (const raw of [null, false, 0, '', { version: 77 }]) { const corrupt = { ...p, _gardenProgression: raw }; assert.equal(gardenR2BlocksLegacy(corrupt, 'garden.resetEconomy'), true); assert.equal(gardenR2Snapshot(corrupt).blocked, true); }
});

test('durable stream capacity is bounded and old tombstones cannot be reset into duplicate currency', () => {
  const p = adopt();
  for (let index = 1; index < 128; index++) { const r = request(p, 'resume', {}, `bounded_stream_${String(index).padStart(8, '0')}`); commit(p, executeGardenR2(p, r.payload, r.options)); }
  const before = structuredClone(p), extra = request(p, 'resume', {}, 'bounded_stream_overflow');
  assert.equal(executeGardenR2(p, extra.payload, extra.options).error, 'GARDEN_R2_ACCOUNTING_CAPACITY'); assert.deepEqual(p, before);
  const existing = request(p, 'resume'); commit(p, executeGardenR2(p, existing.payload, existing.options)); assert.equal(Object.keys(p._gardenProgression.streams).length, 128);
});
