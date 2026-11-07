import test from 'node:test';
import assert from 'node:assert/strict';
import {createGardenCommandArbiter} from '../src/games/garden-shelf/lib/gardenCommandArbiter.js';
import {createGardenR2Coordinator} from '../src/games/garden-shelf/lib/gardenR2Transactions.js';

for (const confirmed of [true, false]) test(`real journal: heartbeat ${confirmed ? 'confirmed' : 'timeout'} before queued water`, async () => {
  const values = new Map(), sent = [];
  let release;
  const response = new Promise(resolve => {release = resolve;});
  const coordinator = createGardenR2Coordinator({accountId: 'diagnostic-account',
    storage: {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)},
    now: () => 1000, uuid: () => 'diagnostic-stream-0001', reconcile: async () => {throw Error('Unexpected reconciliation');},
    transport: async (_action, payload, options) => {
      sent.push({command: payload.command, sequence: payload.intent.sequence, id: options.clientActionId});
      if (payload.command === 'heartbeat') await response;
      return confirmed || payload.command !== 'heartbeat' ? {receiptConfirmed: true, clientActionId: options.clientActionId} : {error: 'TIMEOUT'};
    }});
  const gate = createGardenCommandArbiter({isCurrent: () => true, canDrain: () => !coordinator.inspect().pending});
  const perform = command => gate.run(command, async () => (await coordinator.execute(command, {}, 1)).receiptConfirmed === true);
  const background = perform('heartbeat');
  // Coordinator hashes/journals asynchronously; wait for the actual transport
  // without wall-clock sleeps or acknowledging any pending intent ourselves.
  while (!sent.length) await new Promise(resolve => setImmediate(resolve));
  const heartbeatId = coordinator.inspect().pending.clientActionId;
  const water = perform('water');
  release(); await background;
  assert.equal(await water, confirmed);
  assert.equal(sent.length, confirmed ? 2 : 1);
  const journal = coordinator.inspect();
  if (confirmed) {
    assert.deepEqual(sent.map(row => row.sequence), [1, 2]);
    assert.notEqual(sent[0].id, sent[1].id);
    assert.equal(journal.pending, null); assert.equal(journal.nextSequence, 3);
  } else {
    assert.equal(journal.pending.clientActionId, heartbeatId);
    assert.equal(journal.pending.payload.command, 'heartbeat');
    assert.equal(journal.nextSequence, 1);
  }
});

test('a journal inserted before queued work gets its lock is recovered, not reported as water', async () => {
  const values = new Map(), sent = [];
  const storage = {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)};
  let release, lockCalls = 0;
  const response = new Promise(resolve => {release = resolve;});
  const common = {accountId: 'diagnostic-account', storage, now: () => 1000, uuid: () => 'diagnostic-stream-0001', reconcile: async () => {throw Error('Unexpected reconciliation');}};
  const rival = createGardenR2Coordinator({...common, transport: async () => ({error: 'TIMEOUT'})});
  const coordinator = createGardenR2Coordinator({...common,
    withLock: async fn => {if (++lockCalls === 2) await rival.execute('tend', {}, 1); return fn();},
    transport: async (_action, payload, options) => {
      sent.push(payload.command);
      if (payload.command === 'heartbeat') await response;
      return {receiptConfirmed: true, clientActionId: options.clientActionId};
    }});
  const gate = createGardenCommandArbiter({isCurrent: () => true, canDrain: () => !coordinator.inspect().pending});
  const perform = command => gate.run(command, async () => {
    const result = await coordinator.execute(command, {}, 1);
    return result.receiptConfirmed === true && !result.recoveredIntent;
  });
  const background = perform('heartbeat');
  while (!sent.length) await new Promise(resolve => setImmediate(resolve));
  const water = perform('water');
  release(); await background;
  assert.equal(await water, false);
  assert.deepEqual(sent, ['heartbeat', 'tend']);
  assert.equal(coordinator.inspect().pending, null);
  assert.equal(coordinator.inspect().nextSequence, 3);
});
