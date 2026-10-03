import test from 'node:test';
import assert from 'node:assert/strict';
import { makeYardV2PgFixture, yardRepair, assertRepairApplied, assertMergeGrantsPreserved, assertPaidYardReceipt } from './helpers/yard-v2-pg-fixture.mjs';
import { executePersistentYardAction, inspectPlayerYard } from '../game-logic/yard-v2/service.mjs';
import { applyMergeLabAction } from '../game-logic/merge-lab-domain.js';
import { MERGE_LAB_CATALOG } from '../game-logic/merge-lab-catalog.js';
const NOW = Date.UTC(2026, 9, 3, 12), DAY = 86400000;
const execute = (player, request) => executePersistentYardAction(player, request.action, request.payload, {
  now: request.now, actionId: request.clientActionId,
});

test('offline fixture rehydrates actual v2 state and real Merge grants without inventing a wallet', () => {
  const { player, mergeActions } = makeYardV2PgFixture({ now: NOW });
  const saved = JSON.parse(JSON.stringify(player));
  assert.equal(inspectPlayerYard(saved, { now: NOW }).status, 200);
  assert.equal(saved.yard.goodieInventory.alchemy_living_arbor, 1203);
  assert.equal(saved.yard.goodieInventory.alchemy_echo_chimes, 2404);
  assert.equal(saved.merge.actionLedger.length, 2);
  for (const key of ['resources', 'garden', 'merge', '_mergeLabFence', 'purchases']) {
    assert.equal(Object.hasOwn(saved._yardV2.migration.rawBackup, key), false, key);
  }
  for (const action of mergeActions) {
    const replay = applyMergeLabAction(saved, action, MERGE_LAB_CATALOG, { now: NOW + DAY });
    assert.equal(replay.ok, true, JSON.stringify(replay.error)); assert.equal(replay.replayed, true);
    assertMergeGrantsPreserved(saved, replay.player);
  }
});

test('real bounded policy admits a paid cushion repair and stores its compound v2 receipt', () => {
  const { player } = makeYardV2PgFixture({ now: NOW }), before = structuredClone(player), request = yardRepair(NOW);
  assert.equal(execute(player, request).status, 200);
  assertRepairApplied(before, player, request);
  assert.deepEqual(player.resources, before.resources); assert.deepEqual(player.garden, before.garden);
});

test('lost-reply JSON replay ten days later is read-only and changed payload cannot reuse the nonce', () => {
  const { player } = makeYardV2PgFixture({ now: NOW }), request = yardRepair(NOW);
  assert.equal(execute(player, request).status, 200);
  const saved = JSON.parse(JSON.stringify(player)), replay = execute(player, { ...request, now: NOW + 10 * DAY });
  assert.equal(replay.status, 200); assert.equal(replay.replayed, true); assert.deepEqual(player, saved);
  const conflict = execute(player, { ...request, payload: { slotId: 'another-slot' }, now: NOW + 10 * DAY });
  assert.equal(conflict.error, 'ACTION_ID_PAYLOAD_CONFLICT'); assert.deepEqual(player, saved);
});

test('audit marker, unknown old nonce and unsupported paid prop cannot be counted as a successful debit', () => {
  const { player } = makeYardV2PgFixture({ now: NOW }), request = yardRepair(NOW);
  const broken = { ...structuredClone(player), _yardV2: { fixtureMarker: 'old-gate' } };
  assert.equal(execute(broken, request).error, 'UNSUPPORTED_YARD_STORAGE_VERSION');
  assert.equal(execute(player, { ...request, clientActionId: 'yard-r2-race:old' }).error, 'LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT');
  const unsupported = { ...request, action: 'yard.buyGoodie', payload: { goodieId: 'cloud_bed' } };
  const before = structuredClone(player);
  assert.equal(execute(player, unsupported).error, 'YARD_BINDING_REQUIRED');
  assert.deepEqual(player.yard, before.yard);
  assert.throws(() => assertPaidYardReceipt(player, unsupported));
});

// r3 food bindings deliberately add paid Berry Plate support; keep that change
// distinct from the repair fixture used for the real persistence gate.
test('current reviewed Berry Plate binding records a real paid v2 food purchase', () => {
  const { player } = makeYardV2PgFixture({ now: NOW });
  const request = { ...yardRepair(NOW), action: 'yard.buyFood', payload: { foodId: 'berry_plate', qty: 1 } };
  const before = structuredClone(player);
  assert.equal(execute(player, request).status, 200);
  assert.equal(player.yard.currencies.treats, before.yard.currencies.treats - 120);
  assertPaidYardReceipt(player, request);
  assertMergeGrantsPreserved(before, player);
});
