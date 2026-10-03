import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertYardV2FixtureId } from './yard-v2-pg-guard.mjs';
const workerFile = fileURLToPath(new URL('./yard-v2-pg-worker.mjs', import.meta.url));

/** Distinct OS processes and a barrier after the real SELECT, before real CAS. */
export function yardV2PgProcesses() {
  const live = new Set();
  function participant() {
    const child = fork(workerFile, [], { execArgv: [], env: { ...process.env, YARD_V2_PG_WORKER: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    live.add(child);
    let output = '', didExit = false, exitError = null;
    const queue = [], waiters = [];
    const log = data => { output = (output + data.toString()).slice(-12000); };
    child.stdout.on('data', log); child.stderr.on('data', log);
    const rejectAll = error => { for (const w of waiters.splice(0)) { clearTimeout(w.timer); w.reject(error); } };
    child.on('message', message => {
      if (message?.type === 'failure') { rejectAll(new Error(message.message)); queue.push(message); return; }
      const i = waiters.findIndex(w => w.type === message.type);
      if (i < 0) queue.push(message);
      else { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(message); }
    });
    child.on('error', rejectAll);
    const exited = new Promise((resolve, reject) => child.once('exit', (code, signal) => {
      live.delete(child); didExit = true;
      exitError = code === 0 ? null : new Error(`Yard PG worker failed (${code ?? signal}): ${output}`);
      rejectAll(exitError || new Error('Worker exited before expected result'));
      exitError ? reject(exitError) : resolve();
    }));
    exited.catch(() => {});
    function wait(type) {
      const failure = queue.find(m => m.type === 'failure');
      if (failure) return Promise.reject(new Error(failure.message));
      const i = queue.findIndex(m => m.type === type);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      if (didExit) return Promise.reject(exitError || new Error(`Worker exited before ${type}: ${output}`));
      return new Promise((resolve, reject) => {
        const w = { type, resolve, reject };
        w.timer = setTimeout(() => {
          const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`Yard PG worker timed out waiting for ${type}: ${output}`)); child.kill('SIGKILL');
        }, 15000);
        waiters.push(w);
      });
    }
    return { child, wait, exited, send: message => child.send(message) };
  }
  return {
    async separate(playerId, command, { loseResponse = false } = {}) {
      assertYardV2FixtureId(playerId);
      const w = participant(); await w.wait('ready');
      w.send({ ...command, type: 'execute', playerId, barrier: false, loseResponse });
      const result = await w.wait(loseResponse ? 'response-lost' : 'result'); await w.exited; return result;
    },
    async race(playerId, commands) {
      assertYardV2FixtureId(playerId);
      const workers = commands.map(() => participant()), ready = await Promise.all(workers.map(w => w.wait('ready')));
      assert.equal(new Set(ready.map(m => m.pid)).size, commands.length);
      assert.ok(ready.every(m => m.pid !== process.pid));
      workers.forEach((w, i) => w.send({ ...commands[i], type: 'execute', playerId, barrier: true }));
      const loaded = await Promise.all(workers.map(w => w.wait('loaded')));
      assert.ok(loaded.every(m => typeof m.version === 'string' && m.version.length > 0));
      assert.equal(new Set(loaded.map(m => m.version)).size, 1, 'Same real PostgreSQL OCC version required');
      workers.forEach(w => w.send({ type: 'release' }));
      const results = await Promise.all(workers.map(w => w.wait('result'))); await Promise.all(workers.map(w => w.exited));
      assert.ok(results.some(r => r.callbackAttempts >= 2), 'Real PostgreSQL CAS loss must rerun the callback');
      return results;
    },
    async dispose() {
      await Promise.all([...live].map(child => new Promise(resolve => { child.once('exit', resolve); child.kill('SIGKILL'); })));
    },
  };
}
