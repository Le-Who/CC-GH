import { assertDisposableGardenR2Database, assertGardenR2FixtureId, gardenR2WorkerExecArgv } from './garden-r2-pg-guard.mjs';

assertDisposableGardenR2Database();
if (process.env.GARDEN_R2_PG_WORKER !== '1' || !process.send) throw new Error('Guarded parent required');
const yardActive = process.env.YARD_PLAYER_WIRING_TEST === '1';
if ((process.env.YARD_PLAYER_WIRING_TEST && !yardActive)
    || JSON.stringify(process.execArgv) !== JSON.stringify(gardenR2WorkerExecArgv(yardActive))) throw new Error('Exact explicit Garden worker policy mode required');
const { YARD_PLAYER_RELEASE_POLICY } = await import('../../game-logic/yard-v2/release-policy.mjs');
if (YARD_PLAYER_RELEASE_POLICY.enabled !== yardActive) throw new Error('Garden worker policy differs from explicit test mode');
// Real production modules and SQL; only the active cross-domain participant gets
// the existing policy-only loader. No unit-test dependency substitutions.
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
      && message.payload.foodId === 'berry_plate' && message.payload.qty === 1;
    if (!gardenAction && !yardFixturePurchase) throw new Error('Only Garden fixture actions or exactly one Yard Berry Plate purchase are permitted');
    let callbackAttempts = 0, outcome, previewPlayer;
    const apply = player => applyActionWithReceipt(player, message.action, message.payload, {
      clientActionId: message.clientActionId, serverNow: message.now,
    });
    if (message.preview) {
      if (!yardActive || !yardFixturePurchase || message.barrier || message.loseResponse) throw new Error('Preview is restricted to the active Yard purchase expectation');
      const [row] = await getDb()`SELECT data FROM players WHERE id=${message.playerId}`;
      if (!row) throw new Error('Expected persisted Garden fixture');
      previewPlayer = structuredClone(row.data); outcome = await apply(previewPlayer);
    } else outcome = await withPlayerLock(message.playerId, async player => {
      callbackAttempts++;
      if (message.barrier && callbackAttempts === 1) {
        await new Promise(resolve => {
          release = resolve;
          process.send({ type: 'loaded', pid: process.pid, version: player._version });
        });
      }
      return apply(player);
    });
    // Model a committed request whose entire response was lost. The caller must
    // establish the result by a new DB read/reconcile/replay in another process.
    if (message.loseResponse) process.send({ type: 'response-lost', pid: process.pid, callbackAttempts });
    else process.send({ type: 'result', pid: process.pid, callbackAttempts, outcome, ...(previewPlayer ? { player: previewPlayer } : {}) });
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
  process.send({ type: 'ready', pid: process.pid, yardActive });
} catch (error) {
  process.send({ type: 'failure', message: error.stack || error.message });
  process.exitCode = 1;
  await closeDb();
  process.disconnect();
}
