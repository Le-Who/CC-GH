import { assertDisposableGardenR2Database, assertGardenR2FixtureId } from './garden-r2-pg-guard.mjs';

assertDisposableGardenR2Database();
if (process.env.GARDEN_R2_PG_WORKER !== '1' || !process.send) throw new Error('Guarded parent required');
// These are the real production modules, without the unit-test import loader.
const { initDb, ensureDbSchema, getDb, closeDb } = await import('../../db.js');
const { withPlayerLock } = await import('../../playerManager.js');
const { applyActionWithReceipt } = await import('../../routes/player.js');
let release;
let running = false;

process.on('disconnect', () => { if (running) process.exit(1); });
process.on('message', async message => {
  if (message?.type === 'release' && release) { release(); release = null; return; }
  if (message?.type !== 'execute' || running) return;
  running = true;
  try {
    assertGardenR2FixtureId(message.playerId);
    if (!getDb()) throw new Error('PG unavailable; no memory fallback');
    const gardenAction = typeof message.action === 'string' && message.action.startsWith('garden.');
    const yardFixturePurchase = message.action === 'yard.buyFood'
      && message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
      && Object.keys(message.payload).length === 2
      && Object.keys(message.payload).every(key => ['foodId', 'qty'].includes(key))
      && message.payload.foodId === 'kibble' && message.payload.qty === 1;
    if (!gardenAction && !yardFixturePurchase) throw new Error('Only Garden fixture actions or exactly one Yard kibble purchase are permitted');
    let callbackAttempts = 0;
    const outcome = await withPlayerLock(message.playerId, async player => {
      callbackAttempts++;
      if (message.barrier && callbackAttempts === 1) {
        await new Promise(resolve => {
          release = resolve;
          process.send({ type: 'loaded', pid: process.pid, version: player._version });
        });
      }
      return applyActionWithReceipt(player, message.action, message.payload, {
        clientActionId: message.clientActionId,
        serverNow: message.now,
        gardenR2Enabled: true, // Internal seam, never an HTTP-supplied flag.
      });
    });
    // Model a committed request whose entire response was lost. The caller must
    // establish the result by a new DB read/reconcile/replay in another process.
    if (message.loseResponse) process.send({ type: 'response-lost', pid: process.pid, callbackAttempts });
    else process.send({ type: 'result', pid: process.pid, callbackAttempts, outcome });
  } catch (error) {
    process.send({ type: 'failure', message: error.stack || error.message });
    process.exitCode = 1;
  } finally {
    running = false;
    await closeDb();
    process.disconnect();
  }
});

try {
  if (!initDb()) throw new Error('PG unavailable; no memory fallback');
  await ensureDbSchema();
  const [db] = await getDb()`SELECT current_database() AS name, current_setting('server_version_num')::int AS version`;
  if (db.name !== 'ccgh_merge_ci' || db.version < 150000 || db.version >= 160000) throw new Error('Disposable PostgreSQL15 required');
  process.send({ type: 'ready', pid: process.pid });
} catch (error) {
  process.send({ type: 'failure', message: error.stack || error.message });
  process.exitCode = 1;
  await closeDb();
  process.disconnect();
}
