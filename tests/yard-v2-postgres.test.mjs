/** Separate future-active Yard v2 gate. Existing Garden/legacy Yard gates stay unchanged.
 * Requires an explicitly selected disposable PostgreSQL15 CI service; no memory proof.
 * Candidate mode uses source overlays only after the existing production hash guard.
 * Integrated mode exercises actual entrypoints, with no overlays or policy overrides.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDisposableYardV2Database, assertYardV2FixtureId, loadYardV2PgTarget } from './helpers/yard-v2-pg-guard.mjs';
if (process.env.YARD_V2_PG_TEST !== '1') {
  test('Yard v2 actual PostgreSQL gate requires explicit CI opt-in', { skip: 'Not executed; no release persistence evidence' }, () => {});
} else {
  assertDisposableYardV2Database(); await loadYardV2PgTarget();
  const { initDb, ensureDbSchema, getDb, closeDb } = await import('../db.js');
  const { applyActionWithReceipt, buildSnapshot } = await import('../routes/player.js');
  const { checkAchievements } = await import('../game-logic.js');
  const { validateGardenR2Player } = await import('../game-logic/garden-r2/domain.js');
  const { inspectPlayerYard } = await import('../game-logic/yard-v2/service.mjs');
  const { makeYardV2PgFixture, yardRepair, gardenCommand, assertPaidYardReceipt, assertRepairApplied, assertMergeGrantsPreserved } = await import('./helpers/yard-v2-pg-fixture.mjs');
  const { yardV2PgProcesses } = await import('./helpers/yard-v2-pg-processes.mjs');
  const processes = yardV2PgProcesses(), fixtureIds = [], DAY = 86400000;
  const success = result => assert.equal(result.outcome.status, 200, JSON.stringify(result.outcome.body));
  async function load(id) {
    assertYardV2FixtureId(id);
    const [row] = await getDb()`SELECT data FROM players WHERE id=${id}`;
    assert.ok(row, 'Expected persisted fixture'); return row.data;
  }
  async function seed(options = {}) {
    const fixture = makeYardV2PgFixture(options), before = structuredClone(fixture.player);
    // Ordinary snapshot/achievement normalization must preserve the actual grant payloads.
    buildSnapshot(fixture.player); checkAchievements(fixture.player);
    assertMergeGrantsPreserved(before, fixture.player);
    assert.equal(inspectPlayerYard(fixture.player, { now: fixture.now }).status, 200);
    fixtureIds.push(fixture.id);
    await getDb()`INSERT INTO players(id,data) VALUES(${fixture.id},${fixture.player})`;
    return { ...fixture, player: await load(fixture.id) };
  }
  async function adopt(options = {}) {
    const fixture = await seed(options), p = fixture.player;
    const command = gardenCommand(p, fixture.now, 'adopt', {
      legacyRevision: p.gardenAccounting.revision, acknowledgedTotal: p.gardenAccounting.creditedTotal,
    });
    success(await processes.separate(fixture.id, command));
    const player = await load(fixture.id); validateGardenR2Player(player);
    assert.deepEqual(player.yard, p.yard); assert.deepEqual(player._yardV2, p._yardV2);
    assertMergeGrantsPreserved(p, player); return { ...fixture, player };
  }
  const economy = p => ({ yard: p.yard, yardV2: p._yardV2, garden: p.garden,
    gardenAccounting: p.gardenAccounting, progression: p._gardenProgression,
    gold: p.resources.gold, merge: p.merge, mergeFence: p._mergeLabFence });

  test(`Yard v2 real PostgreSQL15 atomicity and cross-game OCC (${process.env.YARD_V2_PG_TARGET})`, { timeout: 180000 }, async t => {
    try {
      // Fail before DB initialization on an inactive legacy route, even if it returns 200.
      const preflight = makeYardV2PgFixture(), repair = yardRepair(preflight.now), before = structuredClone(preflight.player);
      const admitted = await applyActionWithReceipt(preflight.player, repair.action, repair.payload, {
        clientActionId: repair.clientActionId, serverNow: repair.now,
      });
      assert.equal(admitted.status, 200, JSON.stringify(admitted.body));
      assertRepairApplied(before, preflight.player, repair);
      assert.ok(initDb(), 'No PostgreSQL handle; refusing memory fallback'); await ensureDbSchema();
      const [db] = await getDb()`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;
      assert.equal(db.name, 'ccgh_merge_ci'); assert.ok(db.version >= 150000 && db.version < 160000, 'PostgreSQL15 required');

      await t.test('real paid repair, lost reply, pool restart and ten-day replay retain one debit/receipt', async () => {
        const { id, now, player } = await adopt(), command = yardRepair(now);
        const lost = await processes.separate(id, command, { loseResponse: true }); assert.equal(lost.outcome, undefined);
        const committed = await load(id); assertRepairApplied(player, committed, command);
        validateGardenR2Player(committed); assert.deepEqual(committed._gardenProgression, player._gardenProgression);
        assert.equal(committed.resources.gold, player.resources.gold);
        const receipt = structuredClone(assertPaidYardReceipt(committed, command));
        await closeDb(); assert.ok(initDb()); await ensureDbSchema();
        const replay = await processes.separate(id, { ...command, now: now + 10 * DAY });
        success(replay); assert.equal(replay.outcome.body.duplicate, true); assert.notEqual(replay.pid, lost.pid);
        const reloaded = await load(id); assertRepairApplied(player, reloaded, command);
        assert.deepEqual(assertPaidYardReceipt(reloaded, command), receipt);
        assert.deepEqual(economy(reloaded), economy(committed), 'Replay must not advance the Yard clock or debit again');
      });

      await t.test('same Yard intent in distinct processes commits exactly one debit and one v2 receipt', async () => {
        const { id, now, player } = await adopt(), command = yardRepair(now);
        const results = await processes.race(id, [command, command]); results.forEach(success);
        assert.equal(results.filter(r => r.outcome.body.duplicate).length, 1);
        const saved = await load(id); assertRepairApplied(player, saved, command);
        assert.equal(Object.keys(saved._yardV2.runtime.commandReceipts).length, 1);
        assert.deepEqual(saved._gardenProgression, player._gardenProgression); assert.equal(saved.resources.gold, player.resources.gold);
      });

      await t.test('Garden purchase and paid Yard repair survive a genuine cross-process CAS collision together', async () => {
        const { id, now, player } = await adopt(), garden = gardenCommand(player, now, 'buyPlant', { type: 'daisy', shelfIndex: 0, spotIndex: 0 }), yard = yardRepair(now);
        const results = await processes.race(id, [garden, yard]); results.forEach(success);
        const saved = await load(id); validateGardenR2Player(saved); assertRepairApplied(player, saved, yard);
        assert.equal(saved.resources.gold, player.resources.gold - 25); assert.equal(saved.garden.plants.length, 1);
        assert.equal(saved._gardenProgression.revision, player._gardenProgression.revision + 1);
        assert.equal(saved._gardenProgression.streams[garden.payload.intent.streamId].clientActionId, garden.clientActionId);
        assert.equal(Object.keys(saved._yardV2.runtime.commandReceipts).length, 1);
        const settled = economy(saved);
        for (const command of [garden, yard]) { const replay = await processes.separate(id, command); success(replay); assert.equal(replay.outcome.body.duplicate, true); }
        assert.deepEqual(economy(await load(id)), settled);
      });

      await t.test('saved historical Merge grants replay in fresh processes without duplicate grants or changes to Yard receipts', async () => {
        const { id, now, player, mergeActions } = await adopt(), repair = yardRepair(now);
        success(await processes.separate(id, repair));
        const committed = await load(id);
        for (const mergeAction of mergeActions) {
          const replay = await processes.separate(id, { mergeAction, now: now + 10 * DAY });
          success(replay); assert.equal(replay.outcome.body.duplicate, true);
          assert.deepEqual(economy(await load(id)), economy(committed));
        }
        assertRepairApplied(player, await load(id), repair);
      });

      await t.test('insufficient debit and conflicting nonce cannot partially repair or change adjacent progress', async () => {
        const { id, now, player } = await adopt({ treats: 0 }), command = yardRepair(now);
        const denied = await processes.separate(id, command);
        assert.equal(denied.outcome.status, 400); assert.equal(denied.outcome.body.error, 'not enough yard currency');
        const saved = await load(id);
        assert.deepEqual(saved.yard, player.yard); assertMergeGrantsPreserved(player, saved);
        assert.deepEqual(saved._gardenProgression, player._gardenProgression); assert.equal(saved.resources.gold, player.resources.gold);
        const rejectedReceipt = saved._yardV2.runtime.commandReceipts[command.clientActionId];
        assert.equal(rejectedReceipt.format, 'yard-action-receipt/v1'); assert.equal(rejectedReceipt.status, 400);
        const replay = await processes.separate(id, { ...command, now: now + 10 * DAY }); assert.equal(replay.outcome.status, 400);
        assert.deepEqual(economy(await load(id)), economy(saved));
        const conflict = await processes.separate(id, { ...command, payload: { slotId: 'pg-other-cushion' } });
        assert.equal(conflict.outcome.status, 409); assert.equal(conflict.outcome.body.error, 'ACTION_ID_PAYLOAD_CONFLICT');
        assert.deepEqual(economy(await load(id)), economy(saved));
      });
    } finally {
      await processes.dispose();
      try { if (getDb()) for (const id of fixtureIds) { assertYardV2FixtureId(id); await getDb()`DELETE FROM players WHERE id=${id}`; } }
      finally { await closeDb(); }
    }
  });
}
