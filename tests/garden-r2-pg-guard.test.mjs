import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDisposableGardenR2Database, assertGardenR2FixtureId, gardenR2WorkerExecArgv } from './helpers/garden-r2-pg-guard.mjs';

const env = {
  GARDEN_R2_PG_TEST: '1', CI: 'true', NODE_ENV: 'test',
  DATABASE_URL: 'postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci',
};

test('Garden R2 persistence guard accepts only explicit disposable PostgreSQL CI configuration', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    assert.equal(assertDisposableGardenR2Database({ ...env, DATABASE_URL: env.DATABASE_URL.replace('127.0.0.1', host) }).pathname, '/ccgh_merge_ci');
  }
  assert.equal(assertDisposableGardenR2Database({ ...env, DATABASE_URL: env.DATABASE_URL.replace('postgres:', 'postgresql:') }).protocol, 'postgresql:');
  const invalid = [
    { GARDEN_R2_PG_TEST: undefined }, { GARDEN_R2_PG_TEST: '0' }, { GARDEN_R2_PG_TEST: 'true' },
    { CI: undefined }, { CI: 'false' }, { NODE_ENV: 'production' },
    { DATABASE_URL: undefined }, { DATABASE_URL: 'not-a-url' },
    { DATABASE_URL: env.DATABASE_URL.replace('postgres:', 'https:') },
    { DATABASE_URL: env.DATABASE_URL.replace('127.0.0.1', 'production.example') },
    { DATABASE_URL: env.DATABASE_URL.replace('127.0.0.1', '127.0.0.2') },
    { DATABASE_URL: env.DATABASE_URL.replace(':5432', ':5433') },
    { DATABASE_URL: env.DATABASE_URL.replace(':5432', '') },
    { DATABASE_URL: env.DATABASE_URL.replace('/ccgh_merge_ci', '/production') },
    { DATABASE_URL: env.DATABASE_URL.replace('ccgh_merge_ci:', 'postgres:') },
    { DATABASE_URL: env.DATABASE_URL.replace(':ccgh_merge_ci@', ':other@') },
    { DATABASE_URL: `${env.DATABASE_URL}?host=production.example` },
    { DATABASE_URL: `${env.DATABASE_URL}#ignored` },
    { REDIS_URL: 'redis://127.0.0.1:6379' }, { NODE_OPTIONS: '--import ./mock-db.mjs' },
  ];
  for (const patch of invalid) assert.throws(() => assertDisposableGardenR2Database({ ...env, ...patch }));
});

test('Garden R2 cleanup/worker IDs are restricted to this suite and a complete generated UUID', () => {
  const id = `garden_r2_pg_${randomUUID()}`;
  assert.equal(assertGardenR2FixtureId(id), id);
  for (const bad of [undefined, null, {}, 'real-user', 'garden_r2_pg_', 'garden_r2_pg_../../x', `${id}\n`, `${id}-extra`, 'garden_accounting_pg_1234-abcd', `merge_pg_${randomUUID()}`]) {
    assert.throws(() => assertGardenR2FixtureId(bad));
  }
});

test('unselected PostgreSQL gate skips before loading dependencies or trying a database', () => {
  const gate = fileURLToPath(new URL('./garden-r2-postgres.test.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', gate], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, NODE_TEST_CONTEXT: undefined, NODE_OPTIONS: '', GARDEN_R2_PG_TEST: '0', DATABASE_URL: 'must-not-connect' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /SKIP/);
  assert.match(result.stdout, /no release persistence evidence/i);
});

test('selected non-disposable gate fails before importing application dependencies', () => {
  const gate = fileURLToPath(new URL('./garden-r2-postgres.test.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', gate], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, ...env, NODE_TEST_CONTEXT: undefined, NODE_OPTIONS: '', REDIS_URL: '', DATABASE_URL: 'postgres://ccgh_merge_ci:ccgh_merge_ci@production.example:5432/ccgh_merge_ci' },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Refusing non-disposable Garden R2 database/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND/);
});

test('PostgreSQL worker cannot be started without a guarded IPC parent', () => {
  const worker = fileURLToPath(new URL('./helpers/garden-r2-pg-worker.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [worker], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, ...env, NODE_TEST_CONTEXT: undefined, NODE_OPTIONS: '', REDIS_URL: '', GARDEN_R2_PG_WORKER: '1' },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Guarded parent required/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND/);
});


test('only explicit cross-domain workers enable Yard; closed and active real routes keep their own contracts', () => {
  assert.deepEqual(gardenR2WorkerExecArgv(), []);
  assert.throws(() => gardenR2WorkerExecArgv('true'));
  const pureLoader = fileURLToPath(new URL('./yard-inventory-only-loader.mjs', import.meta.url));
  const script = `
    import assert from 'node:assert/strict';
    import {createDefaultPlayer} from './game-logic/player.js';
    import {ensurePersistentPlayerYard} from './game-logic/yard-v2/service.mjs';
    import {applyActionWithReceipt} from './routes/player.js';
    import {YARD_PLAYER_RELEASE_POLICY} from './game-logic/yard-v2/release-policy.mjs';
    import {YARD_ACTOR_PROFILES} from './game-logic/yard-v2/released-actor-profiles.mjs';
    const active=process.env.YARD_PLAYER_WIRING_TEST==='1',now=Date.UTC(2026,9,4);Date.now=()=>now;
    assert.equal(YARD_PLAYER_RELEASE_POLICY.enabled,active);assert.deepEqual(Object.keys(YARD_ACTOR_PROFILES),['mika']);
    const p=createDefaultPlayer('garden_r2_pg_12345678-1234-4123-8123-123456789abc','Fixture',now);p.yard.currencies.treats=240;
    assert.equal(ensurePersistentPlayerYard(p,{now}).status,200);p._yardV2.fixtureMarker='preserved';
    const before=structuredClone(p),id='yard-v2:r2-native-check';
    const r=await applyActionWithReceipt(p,'yard.buyFood',{foodId:'berry_plate',qty:1},{clientActionId:id,serverNow:now});
    if(active){assert.equal(r.status,200);assert.equal(p.yard.currencies.treats,120);assert.equal(p.yard.foodInventory.berry_plate,1);assert.deepEqual(Object.keys(p._yardV2.runtime.commandReceipts),[id]);assert.equal(p._yardV2.fixtureMarker,'preserved');assert.deepEqual(p._actionReceipts,before._actionReceipts);}
    else{assert.equal(r.status,409);assert.equal(r.body.error,'YARD_ROLLOUT_PAUSED');assert.deepEqual(p.yard,before.yard);assert.deepEqual(p._yardV2,before._yardV2);}
    console.log(active?'active route and durable receipt verified':'closed route and save preservation verified');
  `;
  for (const active of [false, true]) {
    const result = spawnSync(process.execPath, [...gardenR2WorkerExecArgv(active), '--import', pureLoader, '--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 15000,
      env: { ...process.env, NODE_ENV: 'test', NODE_OPTIONS: '', DATABASE_URL: '', REDIS_URL: '', YARD_PLAYER_WIRING_TEST: active ? '1' : '' },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, active ? /active route and durable receipt verified/ : /closed route and save preservation verified/);
  }
});


test('an inherited Yard flag alone cannot turn a guarded database worker active', { timeout: 5000 }, async () => {
  const worker = fileURLToPath(new URL('./helpers/garden-r2-pg-worker.mjs', import.meta.url));
  const child = fork(worker, [], {
    execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { ...process.env, ...env, NODE_OPTIONS: '', REDIS_URL: '', GARDEN_R2_PG_WORKER: '1', YARD_PLAYER_WIRING_TEST: '1' },
  });
  let stderr = ''; child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Worker policy guard timed out')); }, 4000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  assert.notEqual(code, 0); assert.match(stderr, /Exact explicit Garden worker policy mode required/);
  assert.doesNotMatch(stderr, /ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND/);
});
