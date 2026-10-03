import assert from 'node:assert/strict';
import { assertDisposableYardV2Database, assertYardV2FixtureId, loadYardV2PgTarget } from './yard-v2-pg-guard.mjs';
assertDisposableYardV2Database();
if (process.env.YARD_V2_PG_WORKER !== '1' || !process.send) throw new Error('Guarded IPC parent required');
await loadYardV2PgTarget();
const { initDb, ensureDbSchema, getDb, closeDb } = await import('../../db.js');
const { withPlayerLock } = await import('../../playerManager.js');
const { applyActionWithReceipt } = await import('../../routes/player.js');
const { FIX_SLOT } = await import('./yard-v2-pg-fixture.mjs');
const { applyMergeLabAction } = await import('../../game-logic/merge-lab-domain.js');
const { MERGE_LAB_CATALOG } = await import('../../game-logic/merge-lab-catalog.js');
let release, running = false;
process.on('disconnect', () => { if (running) process.exit(1); });
process.on('message', async message => {
  if (message?.type === 'release' && release) { release(); release = null; return; }
  if (message?.type !== 'execute' || running) return;
  running = true;
  try {
    assertYardV2FixtureId(message.playerId);
    if (!getDb()) throw new Error('PG unavailable; no memory fallback');
    const garden = message.action === 'garden.r2'
      && ['adopt', 'buyPlant'].includes(message.payload?.command)
      && message.payload?.accountId === message.playerId;
    const repair = message.action === 'yard.fixGoodie'
      && message.payload && Object.keys(message.payload).length === 1
      && [FIX_SLOT, 'pg-other-cushion'].includes(message.payload.slotId)
      && /^yard-v2:pg-repair:[a-f0-9-]{36}$/.test(message.clientActionId);
    const mergeReplay = message.mergeAction?.type === 'craftProject'
      && ['0:pg-grant-living_arbor', '1:pg-grant-echo_chimes'].includes(message.mergeAction.actionId);
    if (!garden && !repair && !mergeReplay) throw new Error('Only bounded fixture Garden, paid Yard repair or historical Merge grant replay permitted');
    let callbackAttempts = 0;
    const outcome = await withPlayerLock(message.playerId, async player => {
      callbackAttempts++;
      if (message.barrier && callbackAttempts === 1) await new Promise(resolve => {
        release = resolve; process.send({ type: 'loaded', pid: process.pid, version: player._version });
      });
      if (mergeReplay) {
        assert.ok(player.merge.actionLedger.some(row => row.actionId === message.mergeAction.actionId));
        const result = applyMergeLabAction(player, message.mergeAction, MERGE_LAB_CATALOG, { now: message.now });
        assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.replayed, true);
        assert.deepEqual(result.player, player, 'Historical grant replay must be read-only');
        return { status: 200, body: { duplicate: true } };
      }
      return applyActionWithReceipt(player, message.action, message.payload, {
        clientActionId: message.clientActionId, serverNow: message.now,
      });
    });
    if (message.loseResponse) process.send({ type: 'response-lost', pid: process.pid, callbackAttempts });
    else process.send({ type: 'result', pid: process.pid, callbackAttempts, outcome });
  } catch (error) {
    process.send({ type: 'failure', message: error.stack || error.message }); process.exitCode = 1;
  } finally {
    running = false; await closeDb(); process.disconnect();
  }
});
try {
  assert.ok(initDb(), 'PG unavailable; no memory fallback'); await ensureDbSchema();
  const [db] = await getDb()`SELECT current_database() AS name, current_setting('server_version_num')::int AS version`;
  assert.equal(db.name, 'ccgh_merge_ci'); assert.ok(db.version >= 150000 && db.version < 160000);
  process.send({ type: 'ready', pid: process.pid });
} catch (error) {
  process.send({ type: 'failure', message: error.stack || error.message }); process.exitCode = 1;
  await closeDb(); process.disconnect();
}
