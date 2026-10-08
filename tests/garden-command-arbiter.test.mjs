import test from 'node:test';
import assert from 'node:assert/strict';
import {createGardenCommandArbiter} from '../src/games/garden-shelf/lib/gardenCommandArbiter.js';
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
function setup() {
  let current = true, clear = true;
  return {gate: createGardenCommandArbiter({isCurrent: () => current, canDrain: () => clear}), retire() {current = false;}, uncertain() {clear = false;}};
}
test('one water waits for a confirmed heartbeat, without parallel commands', async () => {
  const {gate} = setup(), heartbeat = deferred(), calls = [];
  const background = gate.run('heartbeat', async () => {calls.push('heartbeat-start'); await heartbeat.promise; calls.push('heartbeat-end'); return true;});
  const water = gate.run('water', async () => {calls.push('water'); return true;});
  assert.deepEqual(calls, ['heartbeat-start']);
  heartbeat.resolve(); assert.equal(await background, true); assert.equal(await water, true);
  assert.deepEqual(calls, ['heartbeat-start', 'heartbeat-end', 'water']);
});
test('rapid repeats and other commands do not create an unbounded queue', async () => {
  const {gate} = setup(), heartbeat = deferred(); let waters = 0, others = 0;
  const background = gate.run('heartbeat', () => heartbeat.promise);
  const water = gate.run('water', async () => {waters++; return true;});
  assert.equal(await gate.run('water', async () => {waters++; return true;}), false);
  assert.equal(await gate.run('tend', async () => {others++; return true;}), false);
  assert.equal(await gate.run('heartbeat', async () => {others++; return true;}), false);
  heartbeat.resolve(true); await background; assert.equal(await water, true);
  assert.equal(waters, 1); assert.equal(others, 0);
});
for (const outcome of ['timeout', 'rejected', 'pending-journal', 'account-change', 'unmount']) test(`${outcome} never drains a fresh command`, async () => {
  const context = setup(), heartbeat = deferred(); let sent = 0;
  const background = context.gate.run('heartbeat', () => heartbeat.promise);
  const water = context.gate.run('water', async () => {sent++; return true;});
  if (outcome === 'pending-journal') context.uncertain();
  if (outcome === 'account-change') context.retire();
  if (outcome === 'unmount') context.gate.cancel();
  if (outcome === 'rejected') {const rejection = assert.rejects(background, /transport/); heartbeat.reject(Error('transport')); await rejection;}
  else {heartbeat.resolve(outcome !== 'timeout'); await background;}
  assert.equal(await water, false); assert.equal(sent, 0);
});
test('an explicit in-flight action still rejects duplicate actions', async () => {
  const {gate} = setup(), action = deferred(); let duplicate = false;
  const first = gate.run('water', () => action.promise);
  assert.equal(await gate.run('water', async () => {duplicate = true; return true;}), false);
  action.resolve(true); assert.equal(await first, true); assert.equal(duplicate, false);
});
test('cancelled generation cannot capture fresh input behind retired heartbeat', async () => {
  const {gate} = setup(), heartbeat = deferred();
  const background = gate.run('heartbeat', () => heartbeat.promise);
  gate.cancel();
  assert.equal(await gate.run('water', async () => true), false);
  heartbeat.resolve(true); await background;
  assert.equal(await gate.run('water', async () => true), true);
});
