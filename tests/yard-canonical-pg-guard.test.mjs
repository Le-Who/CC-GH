/** Safe negative controls: no application imports, database, HTTP server or browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertCanonicalPgEnvironment,assertCanonicalPgCommand,canonicalTestSource,assertCanonicalPgData,CANONICAL_PG_DATA_SHA256,CANONICAL_PG_NOW as NOW} from './helpers/yard-canonical-pg-guard.mjs';
const env={YARD_CANONICAL_PG_TEST:'1',YARD_V2_PG_TEST:'1',YARD_V2_PG_TARGET:'integrated',CI:'true',NODE_ENV:'test',
  DATABASE_URL:'postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci',REDIS_URL:'',NODE_OPTIONS:'',YARD_CANDIDATE_CI:'',YARD_CANONICAL_API_TEST:'',YARD_PLAYER_API_TEST:'',YARD_PLAYER_WIRING_TEST:''};
const launch=(relative,patch,args=[])=>spawnSync(process.execPath,[...args,fileURLToPath(new URL(relative,import.meta.url))],{
  encoding:'utf8',timeout:10000,env:{...env,...patch},
});
const neverConnected=r=>assert.doesNotMatch(`${r.stdout}\n${r.stderr}`,/initialized successfully|ECONNREFUSED|ENOTFOUND|ERR_MODULE_NOT_FOUND/);

test('canonical gate retains exact disposable database guards and excludes implicit API/loader configuration',()=>{
  assert.doesNotThrow(()=>assertCanonicalPgEnvironment(env));
  for(const patch of [
    {YARD_CANONICAL_PG_TEST:''},{YARD_V2_PG_TEST:''},{YARD_V2_PG_TARGET:'candidate',YARD_CANDIDATE_CI:'1'},{CI:'false'},{NODE_ENV:'production'},
    {DATABASE_URL:env.DATABASE_URL.replace('127.0.0.1','production.example')},{DATABASE_URL:env.DATABASE_URL.replace(':5432',':5433')},
    {DATABASE_URL:env.DATABASE_URL.replace('/ccgh_merge_ci','/production')},{DATABASE_URL:env.DATABASE_URL.replace('ccgh_merge_ci:','postgres:')},
    {DATABASE_URL:env.DATABASE_URL+'?ssl=true'},{REDIS_URL:'redis://localhost'},{NODE_OPTIONS:'--import arbitrary.mjs'},
    {PGHOST:'production.example'},{PGPASSWORD:'unexpected'},{DOTENV_CONFIG_PATH:'/arbitrary.env'},
    {YARD_PLAYER_WIRING_TEST:'1'},{YARD_CANONICAL_API_TEST:'1'},
  ])assert.throws(()=>assertCanonicalPgEnvironment({...env,...patch}));
  const api={...env,YARD_CANONICAL_API_TEST:'1',YARD_PLAYER_API_TEST:'1',DEV_AUTH_ENABLED:'true'};
  assert.doesNotThrow(()=>assertCanonicalPgEnvironment(api,{api:true}));
  assert.throws(()=>assertCanonicalPgEnvironment({...api,DEV_AUTH_ENABLED:'false'},{api:true}));
  assert.throws(()=>assertCanonicalPgEnvironment({...api,YARD_PLAYER_WIRING_TEST:'1'},{api:true}));
});

test('historical test capability uses the exact pinned parent source and changes one declaration only',()=>{
  const source=execFileSync('git',['show','32981e328fbfc7993eb08c3bfcf6eb7634dceb53:game-logic/yard-v2/canonical-locations.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
  const changed=canonicalTestSource(source);
  assert.equal(changed.replace('export const CANONICAL_ITEM_PLACEMENT_ENABLED = true;','export const CANONICAL_ITEM_PLACEMENT_ENABLED = false;'),source);
  for(const text of [source+'\n',changed,source.replace('false;','false;\n// drift')])assert.throws(()=>canonicalTestSource(text));
  for(const name of Object.keys(CANONICAL_PG_DATA_SHA256)){
    const data=readFileSync(new URL(`../game-logic/yard-v2/${name}`,import.meta.url),'utf8');
    assert.doesNotThrow(()=>assertCanonicalPgData(name,data));assert.throws(()=>assertCanonicalPgData(name,data+'\n'));
    if(name==='canonical-item-protocol.json'){const p=JSON.parse(data);assert.equal(p.maxPlacements,2);assert.equal(p.item.capacity,1);}
  }
});

test('current food source is refused by the unchanged historical capability guard',()=>{
  const current=readFileSync(new URL('../game-logic/yard-v2/canonical-locations.mjs',import.meta.url),'utf8');
  assert.throws(()=>canonicalTestSource(current),/Canonical source changed/);
});

test('IPC command allowlist rejects arbitrary actions, payload geometry and timestamps',()=>{
  const c={action:'yard.placeGoodie',payload:{locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',slotId:'canonical:pg-one',goodieId:'leaf_pot',x:98,y:118},clientActionId:`yard-v2:canonical-v1/pg-${randomUUID()}`,now:NOW};
  assert.doesNotThrow(()=>assertCanonicalPgCommand(c));
  assert.doesNotThrow(()=>assertCanonicalPgCommand({...c,payload:{...c.payload,slotId:'canonical:pg-three',x:88,y:172}}));
  assert.doesNotThrow(()=>assertCanonicalPgCommand({...c,payload:{...c.payload,slotId:'canonical:pg-four',x:49,y:120}}));
  for(const patch of [{action:'yard.buyGoodie'},{now:NOW+1},{clientActionId:'real-user-intent'},
    {payload:{...c.payload,slotId:'existing-slot'}},{payload:{...c.payload,slotId:'canonical:pg-five'}},{payload:{...c.payload,goodieId:'sun_cushion'}},
    {payload:{...c.payload,x:0}},{payload:{...c.payload,enable:true}},{operation:'arbitrary'}])assert.throws(()=>assertCanonicalPgCommand({...c,...patch}));
});

test('unselected gate skips before product imports; selected unsafe destination fails before connection',()=>{
  const skipped=launch('./yard-canonical-postgres.test.mjs',{YARD_CANONICAL_PG_TEST:'',DATABASE_URL:'must-not-connect'},['--test','--test-reporter=tap']);
  assert.equal(skipped.status,0,skipped.stderr);assert.match(skipped.stdout,/SKIP/);neverConnected(skipped);
  const unsafe=launch('./yard-canonical-postgres.test.mjs',{DATABASE_URL:env.DATABASE_URL.replace('127.0.0.1','production.example')},['--test']);
  assert.notEqual(unsafe.status,0);assert.match(`${unsafe.stdout}\n${unsafe.stderr}`,/Refusing non-disposable/);neverConnected(unsafe);
});

test('worker cannot import the source loader or open PostgreSQL outside its guarded IPC parent',()=>{
  const result=launch('./helpers/yard-canonical-pg-worker.mjs',{YARD_V2_PG_WORKER:'1'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Guarded canonical IPC parent required/);neverConnected(result);
});

test('canonical API bridge refuses a missing API opt-in before opening any listener or database',()=>{
  const result=launch('./helpers/yard-canonical-api-server.mjs',{});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Explicit disposable integrated Yard API test required/);neverConnected(result);
});
