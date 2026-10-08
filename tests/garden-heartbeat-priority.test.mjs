import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createGardenCommandArbiter} from '../src/games/garden-shelf/lib/gardenCommandArbiter.js';

// Diagnostic seam: execute the real provider callback, not a rewritten model.
// This does not cover React events, journal persistence, or the HTTP server.
const source = await readFile(new URL('../src/games/garden-shelf/lib/GardenR2Provider.tsx', import.meta.url), 'utf8');
const start = source.indexOf('const command = useCallback(');
const end = source.indexOf('\n  useEffect(() => {', start);
assert.ok(start >= 0 && end > start, 'Provider command seam changed; review this diagnostic');
const callback = stripTypeScriptTypes(source.slice(start, end), {mode: 'strip'});

function makeCommand(coordinator) {
  return new Function('commandArbiter', 'useCallback', 'ready', 'busy', 'coordinator', 'current', 'requiresGardenReload', 'error', 'useGameHub', 'mounted', 'setError', 'setReady', 'recovery', 'recoverRef', 'isGardenR2Retryable',
    `${callback}; return command;`)(createGardenCommandArbiter({isCurrent: () => true, canDrain: () => true}), fn => fn, true, {current: false}, coordinator, () => true, () => false, '', {getState: () => ({snapshot: {gardenR2: {revision: 1}}})}, {current: true}, () => {}, () => {}, {current: null}, {current: () => {}}, () => false);
}

test('real Garden provider: delayed heartbeat and one explicit water intent', async () => {
  let release;
  const heartbeat = new Promise(resolve => { release = resolve; });
  const calls = [];
  const coordinator = {execute: async name => {
    calls.push(name);
    if (name === 'heartbeat') await heartbeat;
    return {receiptConfirmed: true};
  }};
  const command = makeCommand(coordinator);
  const pendingHeartbeat = command('heartbeat');
  assert.deepEqual(calls, ['heartbeat']);
  const water = command('water', {plantId: 'diagnostic-plant'});
  release();
  assert.equal(await pendingHeartbeat, true);
  const accepted = await water;
  console.log(JSON.stringify({phase: 'heartbeat-overlap', accepted, transportedCommands: calls}));
  assert.equal(accepted, true, 'Explicit water was dropped while a background heartbeat was pending');
  assert.deepEqual(calls, ['heartbeat', 'water']);
});

test('real provider does not acknowledge a recovered different intent as water', async () => {
  const command = makeCommand({execute: async () => ({receiptConfirmed: true, recoveredIntent: true})});
  assert.equal(await command('water', {plantId: 'diagnostic-plant'}), false);
});
