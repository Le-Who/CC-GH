import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDisposableGardenR2Database, assertGardenR2FixtureId } from './helpers/garden-r2-pg-guard.mjs';

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
