/** Opt-in real PostgreSQL15/OCC gate using the ordinary GitHub CI disposable service.
 * GARDEN_R2_PG_TEST=1 CI=true NODE_ENV=test DATABASE_URL=postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci node --test --test-concurrency=1 tests/garden-r2-postgres.test.mjs
 * Not an HTTP/auth, Redis, browser, rollout or deployment test. No local setup.
 * Selected DB/schema/process failures fail; an unselected skip is not evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDisposableGardenR2Database, assertGardenR2FixtureId } from './helpers/garden-r2-pg-guard.mjs';

if (process.env.GARDEN_R2_PG_TEST !== '1') {
  test('Garden R2 actual PostgreSQL gate requires explicit CI opt-in', { skip: 'Not executed; no release persistence evidence' }, () => {});
} else {
  assertDisposableGardenR2Database(); // Must precede every application import.
  const { initDb, ensureDbSchema, getDb, closeDb } = await import('../db.js');
  const { withPlayerLock } = await import('../playerManager.js');
  const { applyActionWithReceipt, buildSnapshot } = await import('../routes/player.js');
  const { createDefaultPlayer, checkAchievements } = await import('../game-logic.js');
  const { createGardenEconomyState } = await import('../game-logic/garden-economy.js');
  const { GARDEN_R2_CATALOG_REVISION } = await import('../game-logic/garden-r2/catalog.js');
  const { gardenR2Hash } = await import('../game-logic/garden-r2/service.js');
  const { validateGardenR2Player } = await import('../game-logic/garden-r2/domain.js');
  const workerFile = fileURLToPath(new URL('./helpers/garden-r2-pg-worker.mjs', import.meta.url));
  const fixtureIds = [];
  const liveWorkers = new Set();

  function participant() {
    const child = fork(workerFile, [], { execArgv: [], env: { ...process.env, GARDEN_R2_PG_WORKER: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    liveWorkers.add(child);
    let output = '', exitError = null, didExit = false;
    const queued = [], waiters = [];
    const logs = data => { output = (output + data.toString()).slice(-12000); };
    child.stdout.on('data', logs); child.stderr.on('data', logs);
    const rejectAll = error => {
      for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(error); }
    };
    child.on('message', message => {
      if (message?.type === 'failure') { rejectAll(new Error(message.message)); queued.push(message); return; }
      const index = waiters.findIndex(waiter => waiter.type === message.type);
      if (index < 0) queued.push(message);
      else { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    });
    child.on('error', rejectAll);
    const exited = new Promise((resolve, reject) => child.once('exit', (code, signal) => {
      liveWorkers.delete(child); didExit = true;
      exitError = code === 0 ? null : new Error(`Garden R2 PostgreSQL worker failed (${code ?? signal}): ${output}`);
      rejectAll(exitError || new Error('PostgreSQL worker exited before expected result'));
      if (exitError) reject(exitError); else resolve();
    }));
    exited.catch(() => {}); // Observe immediately; callers still await failures.
    function wait(type) {
      const failure = queued.find(message => message.type === 'failure');
      if (failure) return Promise.reject(new Error(failure.message));
      const index = queued.findIndex(message => message.type === type);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      if (didExit) return Promise.reject(exitError || new Error(`Worker exited before ${type}: ${output}`));
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve, reject };
        waiter.timer = setTimeout(() => {
          const i = waiters.indexOf(waiter); if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`PostgreSQL worker timed out waiting for ${type}: ${output}`)); child.kill('SIGKILL');
        }, 15000);
        waiters.push(waiter);
      });
    }
    return { child, wait, exited, send: message => child.send(message) };
  }

  async function separate(playerId, command, { loseResponse = false } = {}) {
    assertGardenR2FixtureId(playerId);
    const worker = participant(); await worker.wait('ready');
    worker.send({ type: 'execute', playerId, ...command, barrier: false, loseResponse });
    const result = await worker.wait(loseResponse ? 'response-lost' : 'result');
    await worker.exited; return result;
  }

  async function race(playerId, commands) {
    assertGardenR2FixtureId(playerId);
    const workers = commands.map(() => participant());
    const ready = await Promise.all(workers.map(worker => worker.wait('ready')));
    assert.equal(new Set(ready.map(item => item.pid)).size, commands.length, 'Participants must be distinct OS processes');
    assert.ok(ready.every(item => item.pid !== process.pid));
    workers.forEach((worker, index) => worker.send({ type: 'execute', playerId, ...commands[index], barrier: true }));
    const loaded = await Promise.all(workers.map(worker => worker.wait('loaded')));
    assert.ok(loaded.every(item => typeof item.version === 'string' && item.version.length > 0));
    assert.equal(new Set(loaded.map(item => item.version)).size, 1, 'Both processes must read the same actual PostgreSQL OCC version');
    workers.forEach(worker => worker.send({ type: 'release' }));
    const results = await Promise.all(workers.map(worker => worker.wait('result')));
    await Promise.all(workers.map(worker => worker.exited));
    assert.ok(results.some(result => result.callbackAttempts >= 2), 'A genuine PostgreSQL CAS loss must re-run the callback');
    return results;
  }

  async function load(id) {
    assertGardenR2FixtureId(id);
    const [row] = await getDb()`SELECT data FROM players WHERE id=${id}`;
    assert.ok(row, 'Expected persisted fixture');
    return row.data;
  }

  async function seed({ gold = 100, plants = true } = {}) {
    const id = assertGardenR2FixtureId(`garden_r2_pg_${randomUUID()}`);
    fixtureIds.push(id);
    const now = Date.now(), player = createDefaultPlayer(id, 'Disposable Garden R2 CI', now);
    player.resources.gold = gold; player.resources.gachaTokens = 17; player.resources.futureCurrency = 29;
    player.garden = { ...createGardenEconomyState(now), level: 30, totalGoldEarned: 137, claimedQuests: ['first_plant'], plants: plants ? [
      { id: 'legacy-daisy-stable-id', type: 'daisy', level: 19, phase: 3, phaseProgress: 0, shelfIndex: 0, spotIndex: 0, lastTapped: 0 },
      { id: 'legacy-fern-stable-id', type: 'fern', level: 40, phase: 3, phaseProgress: 0, shelfIndex: -1, spotIndex: -1, lastTapped: 0 },
    ] : [] };
    player.gardenAccounting = { version: 1, active: true, revision: 8, creditedTotal: 137, streams: {} };
    player.yard.currencies = { treats: 77, shinyTreats: 5 };
    player.yard.goodieInventory.alchemy_echo_chimes = 2402;
    player.yard.goodieInventory.alchemy_living_arbor = 1201;
    player._yardV2 = { fixtureMarker: 'preserve-private-yard-extension' };
    player.farm.harvested = { strawberry: 7 };
    player.purchases = { fixtureOrder: { delivered: true } };
    player.retainedFixtureField = { nested: ['must', 'survive'] };
    player._actionReceipts = { items: [{
      clientActionId: 'old-garden-client-receipt', action: 'garden.resetEconomy', createdAt: now,
      payloadHash: Buffer.from(gardenR2Hash({ action: 'garden.resetEconomy', payload: {} }), 'hex').toString('base64url'),
      extras: { goldDelta: 999999 },
    }] };
    player._version = randomUUID();
    // Establish ordinary runtime normalization before the Garden-only change,
    // including real Merge V3 migration/fence and existing achievement checks.
    buildSnapshot(player); checkAchievements(player);
    await getDb()`INSERT INTO players(id,data) VALUES(${id},${player})`;
    return { id, now, player: JSON.parse(JSON.stringify(player)) };
  }

  function request(player, now, command, input = {}, { stream = randomUUID().replaceAll('-', ''), sequence = 1 } = {}) {
    return { action: 'garden.r2', now, clientActionId: `garden-r2:${stream}:${sequence}`, payload: {
      version: 1, catalogRevision: GARDEN_R2_CATALOG_REVISION, accountId: player.id,
      command, input, expectedRevision: player._gardenProgression?.revision || 0,
      intent: { streamId: stream, sequence, createdAt: now },
    } };
  }
  const adoption = (player, now) => request(player, now, 'adopt', { legacyRevision: player.gardenAccounting.revision, acknowledgedTotal: player.gardenAccounting.creditedTotal });
  const purchase = (player, now, spotIndex = 0) => request(player, now, 'buyPlant', { type: 'daisy', shelfIndex: 0, spotIndex });
  async function adopt(seedOptions = {}) {
    const fixture = await seed(seedOptions), command = adoption(fixture.player, fixture.now);
    const result = await separate(fixture.id, command);
    assert.equal(result.outcome.status, 200, JSON.stringify(result.outcome.body));
    return { ...fixture, command, player: await load(fixture.id), original: fixture.player };
  }
  function unchangedAdjacent(before, after) {
    const mutable = new Set(['garden', 'gardenAccounting', '_gardenProgression', 'resources', 'stats', 'achievements', '_lastSeen', '_syncSeq', '_version']);
    for (const key of Object.keys(before)) if (!mutable.has(key)) assert.deepEqual(after[key], before[key], key);
    const wallet = player => {
      const value = structuredClone(player.resources);
      delete value.gold;
      // buildSnapshot performs normal energy timestamp maintenance even at cap.
      if (value.energy) delete value.energy.lastRegenTimestamp;
      return value;
    };
    assert.deepEqual(wallet(after), wallet(before), 'non-Garden wallet balances');
    for (const [id, achievement] of Object.entries(before.achievements)) assert.deepEqual(after.achievements[id], achievement, `existing achievement ${id}`);
    assert.equal(after.schemaVersion, 11); assert.equal(after.garden.economyVersion, before.garden.economyVersion);
  }
  const economicState = player => ({ garden: player.garden, accounting: player.gardenAccounting, progression: player._gardenProgression, gold: player.resources.gold, stats: player.stats });
  const assertSuccess = result => assert.equal(result.outcome.status, 200, JSON.stringify(result.outcome.body));

  test('Garden R2 durable real PostgreSQL15 transactions and cross-process OCC', { timeout: 180000 }, async t => {
    try {
      assert.ok(initDb(), 'No PostgreSQL handle; refusing memory fallback'); await ensureDbSchema();
      const [db] = await getDb()`SELECT current_database() AS name, current_setting('server_version_num')::int AS version`;
      assert.equal(db.name, 'ccgh_merge_ci');
      assert.ok(db.version >= 150000 && db.version < 160000, 'Declared PostgreSQL15 service required');

      await t.test('adoption is additive and its saved JSON survives connection restart and a separate process', async () => {
        const { id, now, player: before } = await seed(), command = adoption(before, now);
        const lost = await separate(id, command, { loseResponse: true }); assert.equal(lost.outcome, undefined);
        const saved = await load(id); validateGardenR2Player(saved);
        assert.equal(saved.resources.gold, before.resources.gold);
        assert.equal(saved._gardenProgression.revision, 1);
        assert.deepEqual(saved.garden.plants, before.garden.plants);
        assert.deepEqual(saved.garden.claimedQuests, before.garden.claimedQuests);
        assert.deepEqual(saved._gardenProgression.migration.sourceGarden, before.garden);
        assert.deepEqual(saved._gardenProgression.migration.sourceAccounting, before.gardenAccounting);
        assert.equal(saved._gardenProgression.plants['legacy-fern-stable-id'].goldRank, 5);
        unchangedAdjacent(before, saved);
        await closeDb(); assert.ok(initDb()); await ensureDbSchema();
        const replay = await separate(id, { ...command, now: now + 10 * 86400000 });
        assertSuccess(replay); assert.equal(replay.outcome.body.duplicate, true);
        const reloaded = await load(id); validateGardenR2Player(reloaded);
        assert.deepEqual(economicState(reloaded), economicState(saved)); unchangedAdjacent(before, reloaded);
      });

      await t.test('lost purchase response reconciles and replays one persisted debit/grant after restart', async () => {
        const { id, now, player } = await adopt({ plants: false }), command = purchase(player, now);
        await separate(id, command, { loseResponse: true });
        const saved = await load(id), plantId = saved.garden.plants[0]?.id;
        assert.equal(saved.resources.gold, 75); assert.equal(saved.garden.plants.length, 1);
        assert.equal(saved._gardenProgression.revision, 2); assert.equal(saved._gardenProgression.plants[plantId].spentGold, 25);
        await closeDb(); assert.ok(initDb()); await ensureDbSchema();
        const reconcile = await separate(id, { action: 'garden.r2.reconcile', now: now + 10 * 86400000, payload: {
          accountId: id, streamId: command.payload.intent.streamId, sequence: 1,
          clientActionId: command.clientActionId, payloadHash: gardenR2Hash(command.payload),
        } });
        assertSuccess(reconcile); assert.equal(reconcile.outcome.body.duplicate, true);
        assert.equal(reconcile.outcome.body.receiptConfirmed, true); assert.equal(reconcile.outcome.body.plantId, plantId);
        const replay = await separate(id, { ...command, now: now + 10 * 86400000 });
        assertSuccess(replay); assert.equal(replay.outcome.body.duplicate, true); assert.equal(replay.outcome.body.plantId, plantId);
        const reloaded = await load(id);
        assert.deepEqual(economicState(reloaded), economicState(saved)); unchangedAdjacent(player, reloaded);
        assert.equal(replay.outcome.body.snapshot.player.syncSeq, reloaded._syncSeq);
        assert.equal(replay.outcome.body.commit, undefined);
        assert.equal(replay.outcome.body.gardenR2.streams, undefined); assert.equal(replay.outcome.body.gardenR2.migration, undefined);
      });

      await t.test('same adoption in two OS processes migrates once after a real CAS collision', async () => {
        const { id, now, player } = await seed(), command = adoption(player, now), results = await race(id, [command, command]);
        results.forEach(assertSuccess); assert.equal(results.filter(result => result.outcome.body.duplicate).length, 1);
        const saved = await load(id); assert.equal(saved._gardenProgression.revision, 1);
        assert.equal(Object.keys(saved._gardenProgression.streams).length, 1); assert.equal(saved.resources.gold, player.resources.gold);
        assert.deepEqual(saved.garden.plants, player.garden.plants); unchangedAdjacent(player, saved);
      });

      await t.test('material timers and research spend survive independent JSON reloads and a lost response', async () => {
        const { id, now, player } = await adopt({ gold: 500, plants: false });
        assertSuccess(await separate(id, request(player, now, 'claimIntro')));
        const intro = await load(id); assert.equal(intro._gardenProgression.substrate, 3);
        const later = now + 3 * 3600000;
        assertSuccess(await separate(id, request(intro, later, 'resume')));
        const accrued = await load(id); assert.equal(accrued._gardenProgression.substrate, 6);
        const research = request(accrued, later, 'research', { researchId: 'care_1' });
        await separate(id, research, { loseResponse: true });
        const saved = await load(id); validateGardenR2Player(saved);
        assert.deepEqual(saved._gardenProgression.researchIds, ['care_1']);
        assert.equal(saved._gardenProgression.substrate, 0); assert.equal(saved.resources.gold, 350);
        assert.equal(saved._gardenProgression.revision, 4); assert.equal(saved._gardenProgression.lastSettledAt, later);
        await closeDb(); assert.ok(initDb()); await ensureDbSchema();
        const replay = await separate(id, { ...research, now: later + 20 * 86400000 });
        assertSuccess(replay); assert.equal(replay.outcome.body.duplicate, true);
        const reloaded = await load(id); assert.deepEqual(economicState(reloaded), economicState(saved)); unchangedAdjacent(player, reloaded);
      });

      await t.test('same purchase in two OS processes commits one debit/entity and one durable receipt', async () => {
        const { id, now, player } = await adopt({ gold: 25, plants: false }), command = purchase(player, now), results = await race(id, [command, command]);
        results.forEach(assertSuccess); assert.equal(results.filter(result => result.outcome.body.duplicate).length, 1);
        assert.equal(new Set(results.map(result => result.outcome.body.plantId)).size, 1);
        const saved = await load(id); validateGardenR2Player(saved);
        assert.equal(saved.resources.gold, 0); assert.equal(saved.garden.plants.length, 1); assert.equal(saved._gardenProgression.revision, 2);
        assert.equal(saved._gardenProgression.streams[command.payload.intent.streamId].sequence, 1); unchangedAdjacent(player, saved);
      });

      await t.test('distinct concurrent intents cannot both spend one balance at the same revision', async () => {
        const { id, now, player } = await adopt({ gold: 25, plants: false });
        const commands = [purchase(player, now, 0), purchase(player, now, 1)], results = await race(id, commands);
        assert.equal(results.filter(result => result.outcome.status === 200).length, 1);
        const failedIndex = results.findIndex(result => result.outcome.status !== 200);
        assert.equal(results[failedIndex].outcome.status, 409); assert.equal(results[failedIndex].outcome.body.error, 'GARDEN_R2_REVISION_CONFLICT');
        const saved = await load(id);
        assert.equal(saved.resources.gold, 0); assert.equal(saved.garden.plants.length, 1); assert.equal(saved._gardenProgression.revision, 2);
        assert.equal(saved._gardenProgression.streams[commands[failedIndex].payload.intent.streamId], undefined); unchangedAdjacent(player, saved);
      });

      await t.test('Garden and real Yard purchases both survive a cross-domain OS-process CAS collision', async () => {
        const { id, now, player } = await adopt({ plants: false });
        const garden = purchase(player, now);
        const yard = { action: 'yard.buyFood', now, payload: { foodId: 'kibble', qty: 1 }, clientActionId: `yard-r2-race:${randomUUID()}` };
        // Compute the authorized Yard action using its real handler, on an
        // uncommitted clone. Runtime normalization and receipt semantics are
        // included rather than approximated by a hand-written Yard mutation.
        const expectedYard = structuredClone(player);
        const expected = await applyActionWithReceipt(expectedYard, yard.action, yard.payload, { clientActionId: yard.clientActionId, serverNow: now });
        assert.equal(expected.status, 200, JSON.stringify(expected.body));
        assert.equal(expectedYard.yard.foodInventory.kibble, player.yard.foodInventory.kibble + 1);
        assert.ok(expectedYard.yard.currencies.treats < player.yard.currencies.treats);
        const results = await race(id, [garden, yard]); results.forEach(assertSuccess);
        const saved = await load(id); validateGardenR2Player(saved);
        assert.equal(saved.resources.gold, player.resources.gold - 25);
        assert.equal(saved.garden.plants.length, 1); assert.equal(saved.garden.plants[0].id, results[0].outcome.body.plantId);
        assert.equal(saved._gardenProgression.revision, 2);
        assert.equal(saved._gardenProgression.streams[garden.payload.intent.streamId].sequence, 1);
        assert.deepEqual(saved.yard, expectedYard.yard);
        assert.equal(saved._actionReceipts.items.filter(receipt => receipt.clientActionId === yard.clientActionId).length, 1);
        assert.deepEqual(saved.stats, player.stats);
        unchangedAdjacent(expectedYard, saved);
      });

      await t.test('failed debit and stale unknown intent save no partial economic change or receipt', async () => {
        const { id, now, player } = await adopt({ gold: 0, plants: false });
        const bad = purchase(player, now), denied = await separate(id, bad);
        assert.equal(denied.outcome.body.error, 'GARDEN_R2_INSUFFICIENT_GOLD');
        assert.deepEqual(economicState(await load(id)), economicState(player));
        const old = purchase(player, now - 10 * 86400000); old.now = now;
        const uncertain = await separate(id, old); assert.equal(uncertain.outcome.body.error, 'GARDEN_R2_INTENT_AMBIGUOUS');
        const saved = await load(id); assert.deepEqual(economicState(saved), economicState(player)); unchangedAdjacent(player, saved);
      });

      await t.test('same persisted intent with altered payload conflicts without a second mutation', async () => {
        const { id, now, player } = await adopt({ plants: false }), command = purchase(player, now);
        assertSuccess(await separate(id, command)); const before = await load(id), altered = structuredClone(command);
        altered.payload.input.spotIndex = 1;
        const conflict = await separate(id, altered); assert.equal(conflict.outcome.body.error, 'GARDEN_R2_INTENT_CONFLICT');
        assert.deepEqual(economicState(await load(id)), economicState(before));
      });

      await t.test('persisted adoption fences old clients from resets, sync, credits and cached generic receipts', async () => {
        const { id, now, player } = await adopt();
        for (const action of ['garden.sync', 'garden.creditEarned', 'garden.goldDelta', 'garden.resetEconomy', 'garden.levelUp', 'garden.buyPlant', 'garden.upgradePlant', 'garden.sellPlant']) {
          const payload = action === 'garden.resetEconomy' ? {} : { state: player._gardenProgression.migration.sourceGarden, goldDelta: 999999, throughTotal: 999999 };
          const denied = await separate(id, { action, now, payload, clientActionId: 'old-garden-client-receipt' });
          assert.equal(denied.outcome.status, 409, action); assert.equal(denied.outcome.body.error, 'CLIENT_UPDATE_REQUIRED', action);
          const saved = await load(id); assert.deepEqual(economicState(saved), economicState(player), action); unchangedAdjacent(player, saved);
        }
      });

      await t.test('internal rollout opt-out rejects adoption through the real locked route', async () => {
        const { id, now, player } = await seed(), command = adoption(player, now);
        const result = await withPlayerLock(id, p => applyActionWithReceipt(p, command.action, command.payload, { clientActionId: command.clientActionId, serverNow: now, gardenR2Enabled: false }));
        assert.equal(result.status, 409); assert.equal(result.body.error, 'GARDEN_R2_NOT_ENABLED');
        const saved = await load(id); assert.equal(saved._gardenProgression, undefined);
        assert.deepEqual(economicState(saved), economicState(player)); unchangedAdjacent(player, saved);
      });
    } finally {
      // Kill unfinished OS processes before removing only this suite's exact IDs.
      const workers = [...liveWorkers];
      await Promise.all(workers.map(child => new Promise(resolve => { child.once('exit', resolve); child.kill('SIGKILL'); })));
      try {
        if (getDb()) for (const id of fixtureIds) { assertGardenR2FixtureId(id); await getDb()`DELETE FROM players WHERE id=${id}`; }
      } finally { await closeDb(); }
    }
  });
}
