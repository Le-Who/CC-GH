import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDefaultPlayer } from '../../game-logic/player.js';
import { createGardenEconomyState } from '../../game-logic/garden-economy.js';
import { GARDEN_R2_CATALOG_REVISION } from '../../game-logic/garden-r2/catalog.js';
import { YARD_GOODIES } from '../../game-logic/yard-catalog.js';
import { ensurePersistentPlayerYard, inspectPlayerYard, YARD_STORAGE_FORMAT } from '../../game-logic/yard-v2/service.mjs';
import { digest } from '../../game-logic/yard-v2/util.mjs';
import { MERGE_LAB_CATALOG } from '../../game-logic/merge-lab-catalog.js';
import { compileMergeLabCatalog, createMergeLabState, createMergeLabQuote, createMergeLabAction, applyMergeLabAction } from '../../game-logic/merge-lab-domain.js';
import { assertYardV2FixtureId } from './yard-v2-pg-guard.mjs';

export const FIX_SLOT = 'pg-worn-cushion';
export const FIX_COST = 24;

/** Real source-domain grants, not an enabled release-policy override. */
export function makeYardV2PgFixture({ now = Date.now(), treats = 240, gold = 100 } = {}) {
  const id = assertYardV2FixtureId(`yard_v2_pg_${randomUUID()}`);
  let player = createDefaultPlayer(id, 'Disposable Yard v2 CI', now);
  player.resources.gold = gold; player.resources.futureCurrency = 29;
  player.yard.currencies = { treats, shinyTreats: 5, futureCurrency: 7 };
  player.yard.retainedFixture = { nested: ['must', 'survive'] };
  player.yard.placedGoodies = [{ goodieId: 'sun_cushion', slotId: FIX_SLOT,
    x: 54, y: 66, condition: 'worn', uses: 8, placedAt: now, retainedPlacement: 123 }];
  player.yard.pendingGifts = Array.from({ length: 105 }, (_, i) => ({
    id: `pg-gift-${i}`, visitorId: 'mika_cat', treats: 1, shinyTreats: 0, createdAt: now, opaque: i,
  }));
  player.yard.album.photos = Array.from({ length: 110 }, (_, i) => ({
    id: `pg-photo-${i}`, visitorId: 'mika_cat', capturedAt: now, opaque: i,
  }));
  player.yard.goodieInventory.alchemy_living_arbor = 1201;
  player.yard.goodieInventory.alchemy_echo_chimes = 2402;
  player.merge = createMergeLabState(MERGE_LAB_CATALOG, { now });
  player.merge.knowledge.itemIds = MERGE_LAB_CATALOG.items.map(item => item.id);
  player.merge.alchemyEssence = 100000;
  const index = compileMergeLabCatalog(MERGE_LAB_CATALOG), mergeActions = [];
  for (const projectId of ['living_arbor', 'echo_chimes']) {
    const project = index.projects.get(projectId), quantity = 2;
    assert.ok(project);
    for (const [itemId, count] of Object.entries(project.input)) {
      player.merge.stock[itemId] = (player.merge.stock[itemId] || 0) + count * quantity;
    }
    const payload = { projectId, quantity };
    const quote = createMergeLabQuote(player, 'craftProject', payload, MERGE_LAB_CATALOG, { now });
    const action = createMergeLabAction(player, 'craftProject', { ...payload, quote }, MERGE_LAB_CATALOG, { actionId: `pg-grant-${projectId}` });
    const outcome = applyMergeLabAction(player, action, MERGE_LAB_CATALOG, { now });
    assert.equal(outcome.ok, true, JSON.stringify(outcome.error));
    assert.equal(outcome.result.placementRequired, true);
    assert.equal(outcome.result.visitorGranted, false);
    player = outcome.player; mergeActions.push(action);
  }
  // A real stable Merge epoch/fence protects these already-applied historical grants.
  player.merge.serverEpoch = `pg_merge_${randomUUID().replaceAll('-', '')}`;
  player._mergeLabFence = { epoch: player.merge.serverEpoch, highWaterRevision: player.merge.mergeRevision, createdAt: now };
  player.garden = { ...createGardenEconomyState(now), level: 30 };
  player.gardenAccounting = { version: 1, active: true, revision: 8, creditedTotal: 0, streams: {} };
  player.retainedFixtureField = { nested: ['must', 'survive'] };
  player.purchases = { pgFixtureOrder: { delivered: true } };
  player._version = randomUUID();
  assert.equal(ensurePersistentPlayerYard(player, { now }).status, 200);
  assert.equal(inspectPlayerYard(JSON.parse(JSON.stringify(player)), { now }).status, 200);
  assert.equal(player._yardV2.format, YARD_STORAGE_FORMAT);
  assert.deepEqual(YARD_GOODIES.sun_cushion.fixCost, { treats: FIX_COST, shinyTreats: 0 }, 'Paid fixture contract changed; review the gate');
  return { id, now, player, mergeActions };
}

export const yardRepair = now => ({ action: 'yard.fixGoodie', payload: { slotId: FIX_SLOT },
  clientActionId: `yard-v2:pg-repair:${randomUUID()}`, now });

export function gardenCommand(player, now, command, input = {}) {
  const streamId = randomUUID().replaceAll('-', '');
  return { action: 'garden.r2', now, clientActionId: `garden-r2:${streamId}:1`, payload: {
    version: 1, catalogRevision: GARDEN_R2_CATALOG_REVISION, accountId: player.id,
    command, input, expectedRevision: player._gardenProgression?.revision || 0,
    intent: { streamId, sequence: 1, createdAt: now },
  } };
}

export function assertPaidYardReceipt(player, request) {
  assert.equal(player._yardV2?.format, YARD_STORAGE_FORMAT, 'Integrated Yard v2 storage required');
  const receipt = player._yardV2.runtime?.commandReceipts?.[request.clientActionId];
  assert.ok(receipt, 'A generic legacy receipt is not a durable Yard v2 receipt');
  assert.equal(receipt.format, 'yard-action-receipt/v1');
  assert.equal(receipt.actionId, request.clientActionId); assert.equal(receipt.action, request.action);
  assert.equal(receipt.requestHash, digest({ action: request.action, payload: request.payload }));
  assert.equal(receipt.status, 200); assert.equal(receipt.error, undefined);
  assert.ok(Number.isSafeInteger(receipt.at) && receipt.at >= request.now);
  assert.equal(player._actionReceipts?.items?.filter(row => row.clientActionId === request.clientActionId).length || 0, 0);
  return receipt;
}

export function assertMergeGrantsPreserved(before, after) {
  const mutable = new Set(['yard', '_yardV2', 'garden', 'gardenAccounting', '_gardenProgression',
    'resources', 'stats', 'achievements', '_onboarded', '_lastSeen', '_syncSeq', '_version']);
  for (const key of Object.keys(before)) if (!mutable.has(key)) assert.deepEqual(after[key], before[key], `Adjacent player field ${key}`);
  const nonGoldWallet = player => {
    const value = structuredClone(player.resources); delete value.gold;
    if (value.energy) delete value.energy.lastRegenTimestamp; // Ordinary timestamp maintenance, not balance.
    return value;
  };
  assert.deepEqual(nonGoldWallet(after), nonGoldWallet(before), 'Non-Garden wallet balances');
  assert.deepEqual(after.merge, before.merge, 'Merge stock/essence/crafts/ledger/epoch');
  assert.deepEqual(after._mergeLabFence, before._mergeLabFence, 'Merge durable fence');
  for (const itemId of ['alchemy_living_arbor', 'alchemy_echo_chimes']) {
    assert.equal(after.yard.goodieInventory[itemId], before.yard.goodieInventory[itemId], itemId);
  }
  assert.deepEqual(after.yard.pendingGifts, before.yard.pendingGifts);
  assert.deepEqual(after.yard.album, before.yard.album);
  assert.deepEqual(after.yard.goodieInventory, before.yard.goodieInventory);
  assert.deepEqual(after.yard.retainedFixture, before.yard.retainedFixture);
  assert.deepEqual(after.retainedFixtureField, before.retainedFixtureField);
  assert.deepEqual(after.purchases, before.purchases);
  assert.deepEqual(after._yardV2.migration, before._yardV2.migration, 'Immutable Yard-only migration archive');
}

export function assertRepairApplied(before, after, request) {
  assertPaidYardReceipt(after, request);
  assert.equal(after.yard.currencies.treats, before.yard.currencies.treats - FIX_COST);
  assert.equal(after.yard.currencies.shinyTreats, before.yard.currencies.shinyTreats);
  assert.equal(after.yard.currencies.futureCurrency, before.yard.currencies.futureCurrency);
  const expected = structuredClone(before.yard.placedGoodies);
  Object.assign(expected.find(row => row.slotId === FIX_SLOT), { condition: 'new', uses: 0 });
  assert.deepEqual(after.yard.placedGoodies, expected);
  assertMergeGrantsPreserved(before, after);
}
