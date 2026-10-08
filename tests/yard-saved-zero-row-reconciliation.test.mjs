import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {withPlayerLock} from '../playerManager.js';
import {fixture, row} from './fixtures/canonical-reconciliation-fixture.mjs';
import {prepareCanonicalSavedVisit} from '../game-logic/yard-v2/canonical-saved-visit-bridge.mjs';
import {stageCanonicalVisitPreparation, createCanonicalVisitReconciler, inspectCanonicalPlayerState} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
import {inspectCanonicalLayoutAfterActions, canonicalLayoutRowsAt} from '../game-logic/yard-v2/canonical-layout-evidence.mjs';
import {commitPreparedCanonicalVisit} from '../game-logic/yard-v2/canonical-visit-transaction.mjs';
import {VISIT_JOB_SOURCE_HASH} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {digest} from '../game-logic/yard-v2/util.mjs';
import {completeReplayedCanonicalVisit} from '../game-logic/yard-v2/canonical-visit-transaction.mjs';
import {ensureCanonicalPlayerYard, closeCanonicalRuntime} from '../game-logic/yard-v2/canonical-runtime.mjs';
import {canonicalDepartureCheckpointValid} from '../game-logic/yard-v2/canonical-unique-visit-clock.mjs';

// This fixture describes the persisted outcome of one future pickup command.
// It does not implement the command, enable it, or prove PostgreSQL persistence.
function releasedPickupFixture(player, record, at) {
  const runtime = player._yardV2.runtime;
  const wrapper = runtime.canonicalVisits[record.candidate.visitId];
  const actionId = 'yard-v2:released-pickup';
  const payload = {slotId: record.candidate.slotId};
  runtime.commandReceipts[actionId] = {
    format: 'yard-action-receipt/v1', actionId, action: 'yard.pickupGoodie', status: 200, at,
    requestHash: digest({action: 'yard.pickupGoodie', payload}),
    extras: {slotId: record.candidate.slotId, goodieId: 'leaf_pot'},
    canonicalLayout: {format: 'yard-canonical-released-pickup/v1', visitId: wrapper.visitId, eventId: wrapper.eventId, payload},
  };
  wrapper.releasedPickupActionId = actionId;
  runtime.canonicalPlacements = [];
  runtime.cursorMs = at;
  player.yard.lastSimulatedAt = at;
  player.yard.goodieInventory.leaf_pot = (player.yard.goodieInventory.leaf_pot || 0) + 1;
}

test('cold actual reconciler replays a receipt-backed released zero-row save without changing visit or economy', async t => {
  const owner = 'zero-row-cold-reconciliation';
  const oldNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  const observations = [];
  const service = createCanonicalVisitReconciler({onObservation: event => observations.push(event)});
  t.after(async () => {await service.close(); Date.now = oldNow;});
  let record, plan, before, savedPlayer;
  await withPlayerLock(owner, player => {
    fixture(player);
    assert.equal(stageCanonicalVisitPreparation(player, {slotId: row.slotId, at: now}).state, 'pending');
    const artifact = prepareCanonicalSavedVisit(player._yardV2.runtime.canonicalPending.input);
    assert.equal(artifact.prepared, true, artifact.code);
    ({record, plan} = artifact);
    assert.equal(commitPreparedCanonicalVisit(player, {state: 'prepared', execution: {sourceHash: VISIT_JOB_SOURCE_HASH}, artifact}, {now}).state, 'admitted');
    now = plan.releaseAt;
    releasedPickupFixture(player, record, now);
    before = structuredClone({yard: player.yard, runtime: player._yardV2.runtime});
    savedPlayer = JSON.parse(JSON.stringify(player));
  });
  const recovered = await service.recover(owner);
  assert.equal(recovered.state, 'pending', JSON.stringify(recovered));
  const deadline = performance.now() + 40000;
  while (!observations.length && performance.now() < deadline) await delay(20);
  assert.ok(observations.length, 'worker observation must arrive');
  assert.equal(observations.at(-1).state, 'active', JSON.stringify(observations));
  await withPlayerLock(owner, player => {
    const view = service.project(player, {now});
    assert.equal(view.status, 'ready', JSON.stringify(view));
    assert.deepEqual(view.canonicalPlacements, []);
    assert.deepEqual(view.canonicalVisits[0].plan, plan);
    assert.equal(view.canonicalVisits[0].plan.leavesAt, record.candidate.leavesAt);
    assert.deepEqual(player.yard.currencies, before.yard.currencies);
    assert.deepEqual(player.yard.goodieInventory, before.yard.goodieInventory);
    assert.deepEqual(player.yard.bowls, before.yard.bowls);
    assert.deepEqual(player.yard.activeVisitors, before.yard.activeVisitors);
    assert.deepEqual(player._yardV2.runtime.commandReceipts, before.runtime.commandReceipts);
    assert.deepEqual(player._yardV2.runtime.canonicalVisits[record.candidate.visitId].proposal, record);
  });
  assert.equal(service.stats().startedCount, 1);

  await t.test('missing, mismatched, duplicate and pre-release receipt evidence fails closed', () => {
    const mutations = [
      ['missing receipt', p => {delete p._yardV2.runtime.commandReceipts['yard-v2:released-pickup'];}],
      ['missing pointer', p => {delete p._yardV2.runtime.canonicalVisits[record.candidate.visitId].releasedPickupActionId;}],
      ['wrong request hash', p => {p._yardV2.runtime.commandReceipts['yard-v2:released-pickup'].requestHash = '0'.repeat(64);}],
      ['pre-release', p => {p._yardV2.runtime.commandReceipts['yard-v2:released-pickup'].at = plan.releaseAt - 1;}],
      ['future receipt', p => {p._yardV2.runtime.commandReceipts['yard-v2:released-pickup'].at = plan.releaseAt + 1;}],
      ['deadline changed', p => {p._yardV2.runtime.canonicalVisits[record.candidate.visitId].leavesAt++;}],
      ['duplicate nonce evidence', p => {p._yardV2.runtime.commandReceipts['yard-v2:duplicate'] = structuredClone(p._yardV2.runtime.commandReceipts['yard-v2:released-pickup']);}],
      ['wrong target receipt', p => {p._yardV2.runtime.commandReceipts['yard-v2:released-pickup'].extras.slotId = 'canonical:other';}],
    ];
    for (const [label, mutate] of mutations) {
      const player = structuredClone(savedPlayer);
      mutate(player);
      const bytes = JSON.stringify(player);
      assert.equal(inspectCanonicalPlayerState(player).code, 'CANONICAL_LAYOUT_EVIDENCE_INVALID', label);
      assert.equal(JSON.stringify(player), bytes, `${label} must be read-only`);
    }
  });

  await t.test('source-row corruption is rejected by real worker replay before authoritative projection', async () => {
    const corruptOwner = 'zero-row-cold-corrupt-source';
    const rejected = [];
    const cold = createCanonicalVisitReconciler({onObservation: event => rejected.push(event)});
    try {
      await withPlayerLock(corruptOwner, player => {
        fixture(player);
        assert.equal(stageCanonicalVisitPreparation(player, {slotId: row.slotId, at: 1000}).state, 'pending');
        const artifact = prepareCanonicalSavedVisit(player._yardV2.runtime.canonicalPending.input);
        assert.equal(commitPreparedCanonicalVisit(player, {state: 'prepared', execution: {sourceHash: VISIT_JOB_SOURCE_HASH}, artifact}, {now: 1000}).state, 'admitted');
        releasedPickupFixture(player, artifact.record, now);
        const proposal = player._yardV2.runtime.canonicalVisits[artifact.record.candidate.visitId].proposal;
        proposal.after.rows[0].x++;
        const {recordHash, ...body} = proposal;
        proposal.recordHash = digest(body);
      });
      assert.equal((await cold.recover(corruptOwner)).state, 'pending');
      const until = performance.now() + 40000;
      while (!rejected.length && performance.now() < until) await delay(20);
      assert.ok(rejected.length, 'rejection must arrive');
      assert.equal(rejected.at(-1).state, 'unavailable');
      await withPlayerLock(corruptOwner, player => {
        assert.notEqual(cold.project(player, {now}).status, 'ready');
        assert.equal(player.yard.pendingGifts.length, 0);
        assert.equal(player.yard.activeVisitors.length, 1);
      });
    } finally {await cold.close();}
  });

  await t.test('same-time source opportunity precedes pickup and original departure creates exactly one gift', async () => {
    const r = savedPlayer._yardV2.runtime;
    const wrapper = r.canonicalVisits[record.candidate.visitId];
    const proof = inspectCanonicalLayoutAfterActions({wrapper, record, commandReceipts: r.commandReceipts, rows: r.canonicalPlacements, cursorMs: r.cursorMs});
    assert.equal(proof.valid, true);
    assert.deepEqual(canonicalLayoutRowsAt(record, proof, plan.releaseAt, {beforeCommands: true}), record.after.rows);
    assert.deepEqual(canonicalLayoutRowsAt(record, proof, plan.releaseAt), []);
    assert.deepEqual(canonicalLayoutRowsAt(record, proof, plan.releaseAt + 1, {beforeCommands: true}), []);
    now = plan.leavesAt;
    await withPlayerLock(owner, player => {
      assert.equal(service.advance(player, {now}).state, 'completed');
      assert.equal(player.yard.activeVisitors.length, 0);
      assert.equal(player.yard.pendingGifts.length, 1);
      assert.equal(player.yard.pendingGifts[0].createdAt, record.candidate.leavesAt);
      assert.deepEqual(player._yardV2.runtime.canonicalPlacements, []);
      const gift = structuredClone(player.yard.pendingGifts[0]);
      assert.notEqual(service.advance(player, {now}).state, 'completed');
      assert.deepEqual(player.yard.pendingGifts, [gift]);
    });
  });
});

test('receipt-backed pickup at exact60 resolves the empty equal-time opportunity after departure', async t => {
  const owner = 'zero-row-exact60';
  const oldNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  t.after(async () => {await closeCanonicalRuntime(); Date.now = oldNow;});
  let record;
  await withPlayerLock(owner, player => {
    fixture(player);
    player._yardV2.runtime.seed = 'long-stay:1703';
    assert.equal(stageCanonicalVisitPreparation(player, {slotId: row.slotId, at: now}).state, 'pending');
    const artifact = prepareCanonicalSavedVisit(player._yardV2.runtime.canonicalPending.input);
    assert.equal(artifact.prepared, true, artifact.code);
    record = artifact.record;
    assert.equal(record.candidate.leavesAt, 3601000);
    const evidence = {state: 'prepared', execution: {sourceHash: VISIT_JOB_SOURCE_HASH}, artifact};
    assert.equal(commitPreparedCanonicalVisit(player, evidence, {now}).state, 'admitted');
    now = record.releaseAt;
    assert.equal(completeReplayedCanonicalVisit(player, evidence, {now}).state, 'active');
    releasedPickupFixture(player, record, now);
    now = record.candidate.leavesAt;
    assert.equal(completeReplayedCanonicalVisit(player, evidence, {now}).state, 'completed');
    assert.equal(canonicalDepartureCheckpointValid(player), true);
    const forged = structuredClone(player);
    const forgedWrapper = forged._yardV2.runtime.canonicalVisits[record.candidate.visitId];
    forgedWrapper.releaseAt = forgedWrapper.proposal.releaseAt = record.candidate.arrivedAt + 1;
    const {recordHash: oldHash, ...forgedBody} = forgedWrapper.proposal;
    forgedWrapper.proposal.recordHash = digest(forgedBody);
    forged._yardV2.runtime.commandReceipts['yard-v2:released-pickup'].at = record.candidate.arrivedAt + 1;
    assert.equal(canonicalDepartureCheckpointValid(forged), false, 'paired release edits cannot legitimize early pickup');
    assert.equal(ensureCanonicalPlayerYard(player, {now, simulate: true}).status, 200);
    assert.equal(player._yardV2.runtime.canonicalDepartureCheckpoint, undefined);
    assert.equal(player._yardV2.runtime.canonicalVisits[record.candidate.visitId].status, 'completed');
    assert.equal(player._yardV2.runtime.nextOpportunityAt, 7201000);
    assert.equal(player._yardV2.runtime.cursorMs, now);
    assert.equal(canonicalDepartureCheckpointValid(player), true);
    assert.equal(ensureCanonicalPlayerYard(player, {now, simulate: true}).status, 200);
    assert.equal(player.yard.pendingGifts.length, 1);
  });
});
