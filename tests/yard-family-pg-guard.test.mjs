import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {assertFamilyPgGate} from './helpers/yard-family-pg-guard.mjs';
const env={YARD_FAMILY_PG_TEST:'1',YARD_V2_PG_TEST:'1',YARD_V2_PG_TARGET:'integrated',CI:'true',NODE_ENV:'test',DATABASE_URL:'postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci',REDIS_URL:'',NODE_OPTIONS:'',YARD_CANDIDATE_CI:''};
const gate=fileURLToPath(new URL('./yard-family-postgres.test.mjs',import.meta.url));
const launch=patch=>spawnSync(process.execPath,['--test',gate],{env:{...process.env,...env,NODE_TEST_CONTEXT:undefined,...patch},encoding:'utf8',timeout:15000});
test('family PG requires exact isolated service, both opt-ins and integrated source',()=>{assert.equal(assertFamilyPgGate(env),undefined);});
test('family PG rejects candidate overlays, external targets, missing flags and injected runtime options',()=>{
 for(const patch of [{YARD_FAMILY_PG_TEST:'0'},{YARD_V2_PG_TEST:'0'},{CI:'false'},{NODE_ENV:'production'},{YARD_V2_PG_TARGET:'candidate',YARD_CANDIDATE_CI:'1'},{DATABASE_URL:env.DATABASE_URL.replace('127.0.0.1','production.example')},{REDIS_URL:'redis://example'},{NODE_OPTIONS:'--import ./override.mjs'}])assert.throws(()=>assertFamilyPgGate({...env,...patch}));
});
test('without family opt-in the PG command is explicitly skipped, never claimed as persistence evidence',()=>{
 const r=launch({YARD_FAMILY_PG_TEST:'0',DATABASE_URL:'must-not-connect'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Family real PostgreSQL acceptance was not executed/);assert.match(r.stdout,/skip(?:ped)?\s+1/i);assert.doesNotMatch(r.stdout+r.stderr,/PG unavailable|Actual PostgreSQL handle required/);
});
test('invalid family target refuses before application/database imports',()=>{
 const r=launch({YARD_V2_PG_TARGET:'candidate',YARD_CANDIDATE_CI:'1'});assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/integrated source with no candidate overlays/);assert.doesNotMatch(r.stdout+r.stderr,/ECONNREFUSED|No PostgreSQL handle/);
});
