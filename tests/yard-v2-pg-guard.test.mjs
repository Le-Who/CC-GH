import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDisposableYardV2Database, assertYardV2FixtureId } from './helpers/yard-v2-pg-guard.mjs';
const env = { YARD_V2_PG_TEST: '1', YARD_V2_PG_TARGET: 'integrated', CI: 'true', NODE_ENV: 'test',
  DATABASE_URL: 'postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci' };
const gate = fileURLToPath(new URL('./yard-v2-postgres.test.mjs', import.meta.url));
const worker = fileURLToPath(new URL('./helpers/yard-v2-pg-worker.mjs', import.meta.url));
const launch = (file, patch, args = []) => spawnSync(process.execPath, [...args, file], {
  encoding: 'utf8', timeout: 15000,
  env: { ...process.env, ...env, NODE_TEST_CONTEXT: undefined, NODE_OPTIONS: '', REDIS_URL: '', YARD_CANDIDATE_CI: '', ...patch },
});

test('Yard PG guard accepts explicit disposable CI targets and rejects unsafe/injected configuration', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    assert.equal(assertDisposableYardV2Database({ ...env, DATABASE_URL: env.DATABASE_URL.replace('127.0.0.1', host) }).pathname, '/ccgh_merge_ci');
  }
  assert.ok(assertDisposableYardV2Database({ ...env, YARD_V2_PG_TARGET: 'candidate', YARD_CANDIDATE_CI: '1' }));
  for (const patch of [
    { YARD_V2_PG_TEST: '0' }, { YARD_V2_PG_TEST: undefined }, { CI: 'false' }, { NODE_ENV: 'production' },
    { YARD_V2_PG_TARGET: undefined }, { YARD_V2_PG_TARGET: 'unknown' }, { YARD_V2_PG_TARGET: 'candidate' },
    { YARD_CANDIDATE_CI: '1' }, { NODE_OPTIONS: '--import ./mock-db.mjs' }, { REDIS_URL: 'redis://localhost:6379' },
    ...['not-a-url', env.DATABASE_URL.replace('postgres:', 'https:'), env.DATABASE_URL.replace('127.0.0.1', 'production.example'),
      env.DATABASE_URL.replace('127.0.0.1', '127.0.0.2'), env.DATABASE_URL.replace(':5432', ':5433'),
      env.DATABASE_URL.replace(':5432', ''), env.DATABASE_URL.replace('/ccgh_merge_ci', '/production'),
      env.DATABASE_URL.replace('ccgh_merge_ci:', 'postgres:'), env.DATABASE_URL.replace(':ccgh_merge_ci@', ':other@'),
      `${env.DATABASE_URL}?host=production.example`, `${env.DATABASE_URL}#ignored`].map(DATABASE_URL => ({ DATABASE_URL })),
  ]) assert.throws(() => assertDisposableYardV2Database({ ...env, ...patch }));
});

test('Yard fixture cleanup rejects real accounts and fixtures belonging to other gates', () => {
  const id = `yard_v2_pg_${randomUUID()}`; assert.equal(assertYardV2FixtureId(id), id);
  for (const bad of [null, {}, 'real-user', 'yard_v2_pg_', `${id}\n`, `${id}-extra`, `garden_r2_pg_${randomUUID()}`, `merge_pg_${randomUUID()}`]) {
    assert.throws(() => assertYardV2FixtureId(bad));
  }
});

test('unselected Yard PG gate skips before application imports or connection attempts', () => {
  const result = launch(gate, { YARD_V2_PG_TEST: '0', DATABASE_URL: 'must-not-connect' }, ['--test', '--test-reporter=tap']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /SKIP/); assert.match(result.stdout, /no release persistence evidence/i);
});

test('selected non-disposable Yard PG gate fails before application imports', () => {
  const result = launch(gate, { DATABASE_URL: env.DATABASE_URL.replace('127.0.0.1', 'production.example') }, ['--test', '--test-reporter=tap']);
  assert.notEqual(result.status, 0); assert.match(`${result.stdout}\n${result.stderr}`, /Refusing non-disposable Yard v2 database/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND/);
});

test('Yard PG worker cannot start without its guarded IPC parent', () => {
  const result = launch(worker, { YARD_V2_PG_WORKER: '1' });
  assert.notEqual(result.status, 0); assert.match(`${result.stdout}\n${result.stderr}`, /Guarded IPC parent required/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND/);
});
