import test from 'node:test';import assert from 'node:assert/strict';
import {assertDisposableMergeDatabase,assertFixturePlayerId} from './helpers/merge-lab-pg-guard.mjs';
const valid={MERGE_LAB_PG_TEST:'1',CI:'true',NODE_ENV:'test',DATABASE_URL:'postgres://ccgh_merge_ci:disposable@127.0.0.1:5432/ccgh_merge_ci'};
test('real DB gate accepts only explicit disposable local CI coordinates before connection',()=>{
 assert.equal(assertDisposableMergeDatabase(valid).database,'ccgh_merge_ci');
 for(const override of [{MERGE_LAB_PG_TEST:'0'},{CI:'false'},{NODE_ENV:'production'},{DATABASE_URL:'postgres://ccgh_merge_ci:p@167.172.182.66:5432/ccgh_merge_ci'},{DATABASE_URL:'postgres://ccgh_merge_ci:p@db.example.com:5432/ccgh_merge_ci'},{DATABASE_URL:'postgres://ccgh_merge_ci:p@localhost:5432/production'},{DATABASE_URL:'postgres://postgres:p@localhost:5432/ccgh_merge_ci'},{DATABASE_URL:'postgres://ccgh_merge_ci:p@localhost:5433/ccgh_merge_ci'},{DATABASE_URL:'postgres://ccgh_merge_ci:p@localhost:5432/ccgh_merge_ci?sslmode=require'},{REDIS_URL:'redis://localhost:6379'}])assert.throws(()=>assertDisposableMergeDatabase({...valid,...override}));
});
test('persistence cleanup and workers reject every non-fixture player ID',()=>{
 assert.equal(assertFixturePlayerId('merge_pg_123-abc'),'merge_pg_123-abc');for(const id of ['actual-player','telegram:42','merge_pg_','merge_pg_abc;DELETE',null])assert.throws(()=>assertFixturePlayerId(id));
});
