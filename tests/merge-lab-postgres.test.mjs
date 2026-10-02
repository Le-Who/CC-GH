/** Real persistence gate, opt-in only. Not an HTTP, auth, Redis, browser or deployment test.
 * Run in GitHub Actions with ephemeral PostgreSQL15 and the existing installed dependencies:
 * MERGE_LAB_PG_TEST=1 CI=true NODE_ENV=test DATABASE_URL=postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci node --test --test-concurrency=1 tests/merge-lab-postgres.test.mjs
 * If selected, unavailable DB/schema/process failures FAIL the suite; there is no skip fallback.
 */
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {assertDisposableMergeDatabase,assertFixturePlayerId} from './helpers/merge-lab-pg-guard.mjs';

const selected=process.env.MERGE_LAB_PG_TEST==='1';
if(!selected){
 test('real PostgreSQL15 persistence gate (explicit CI opt-in required)',{skip:'Not run: MERGE_LAB_PG_TEST=1 is required. This skip is not release evidence.'},()=>{});
}else{
 assertDisposableMergeDatabase(); // No database imports or connection attempts occur before this guard.
 const {initDb,ensureDbSchema,getDb,closeDb}=await import('../db.js');
 const {withPlayerLock}=await import('../playerManager.js');
 const {createDefaultPlayer}=await import('../game-logic.js');
 const {buildSnapshot}=await import('../routes/player.js');
 const {MERGE_LAB_CATALOG:catalog}=await import('../game-logic/merge-lab-catalog.js');
 const {createMergeLabAction,createMergeLabQuote}=await import('../game-logic/merge-lab-domain.js');
 const {MERGE_LAB_RELEASE_POLICY,ensureMergeLabState,executeMergeLab,planMergeCleanStart}=await import('../game-logic/merge-lab-service.js');
 const policy={...MERGE_LAB_RELEASE_POLICY,enabled:true};
 const workerFile=fileURLToPath(new URL('./helpers/merge-lab-pg-worker.mjs',import.meta.url));
 const fixtureIds=[];
 const liveWorkers=new Set();
 function participant(){
  const child=fork(workerFile,[],{execArgv:[],env:{...process.env,MERGE_LAB_PG_WORKER:'1'},stdio:['ignore','pipe','pipe','ipc']});
  liveWorkers.add(child);let output='';const queued=[],waiters=[];
  const logs=data=>{output=(output+data.toString()).slice(-12000);};child.stdout.on('data',logs);child.stderr.on('data',logs);
  const rejectAll=error=>{for(const waiter of waiters.splice(0)){clearTimeout(waiter.timer);waiter.reject(error);}};
  child.on('message',message=>{
   if(message?.type==='failure'){rejectAll(new Error(message.message));queued.push(message);return;}
   const index=waiters.findIndex(w=>w.type===message.type);
   if(index>=0){const [waiter]=waiters.splice(index,1);clearTimeout(waiter.timer);waiter.resolve(message);}else queued.push(message);
  });
  child.on('error',rejectAll);
  const exited=new Promise((resolve,reject)=>child.once('exit',(code,signal)=>{
   liveWorkers.delete(child);const error=code===0?null:new Error(`Postgres worker failed (${code??signal}): ${output}`);
   rejectAll(error||new Error('Postgres worker exited before expected result'));error?reject(error):resolve();
  }));
  // Attach a handler immediately; callers still await exited and observe failures.
  exited.catch(()=>{});
  function wait(type){
   const failure=queued.find(m=>m.type==='failure');if(failure)return Promise.reject(new Error(failure.message));
   const index=queued.findIndex(m=>m.type===type);if(index>=0)return Promise.resolve(queued.splice(index,1)[0]);
   return new Promise((resolve,reject)=>{const waiter={type,resolve,reject};waiter.timer=setTimeout(()=>{const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);reject(new Error(`Postgres worker timed out waiting for ${type}: ${output}`));child.kill('SIGKILL');},15000);waiters.push(waiter);});
  }
  return {child,wait,exited,send:message=>child.send(message)};
 }
 async function runSeparate(playerId,payload,now){
  const child=participant();await child.wait('ready');child.send({type:'execute',playerId,payload,now,barrier:false});const result=await child.wait('result');await child.exited;return result;
 }
 async function race(playerId,payloads,now){
  const workers=payloads.map(()=>participant());await Promise.all(workers.map(w=>w.wait('ready')));
  workers.forEach((w,i)=>w.send({type:'execute',playerId,payload:payloads[i],now,barrier:true}));
  const loaded=await Promise.all(workers.map(w=>w.wait('loaded')));
  assert.equal(new Set(loaded.map(item=>item.version)).size,1,'Both OS processes must read the same OCC version before release');
  workers.forEach(w=>w.send({type:'release'}));const results=await Promise.all(workers.map(w=>w.wait('result')));await Promise.all(workers.map(w=>w.exited));
  assert.ok(results.some(result=>result.callbackAttempts>=2),'A real PostgreSQL CAS loss must cause a callback retry');return results;
 }
 async function load(id){assertFixturePlayerId(id);const [row]=await getDb()`SELECT data FROM players WHERE id=${id}`;assert.ok(row);return row.data;}
 async function seed({tokens=50,legacy=false}={}){
  const id=assertFixturePlayerId('merge_pg_'+randomUUID());fixtureIds.push(id);const now=Date.now();const player=createDefaultPlayer(id,'Disposable Merge CI fixture',now);
  player._version=randomUUID();player.resources.gold=123;player.resources.gachaTokens=tokens;player.farm.harvested={strawberry:7};player.purchases={fixtureOrder:{delivered:true}};player.futureAccountField={keep:'yes'};
  player.yard.currencies={treats:77,shinyTreats:5};player.yard.goodieInventory.alchemy_echo_chimes=1402;player.yard.goodieInventory.alchemy_living_arbor=1201;
  player.merge.board=JSON.stringify([[{id:'seed',instanceId:'legacy-one'}]]);player.merge.unknownField={keep:'legacy'};
  if(!legacy)ensureMergeLabState(player,{now,policy});
  await getDb()`INSERT INTO players(id,data) VALUES(${id},${player})`;
  return {id,now,player};
 }
 function request(player,type,parameters,id,now){const quote=createMergeLabQuote(player,type,parameters,catalog,{now});return {command:createMergeLabAction(player,type,{...parameters,quote},catalog,{actionId:id}),expectedMergeEpoch:player.merge.serverEpoch};}
 function unchangedNonMerge(before,after,{tokens=true}={}){
  assert.equal(after.resources.gold,before.resources.gold);if(tokens)assert.equal(after.resources.gachaTokens,before.resources.gachaTokens);
  assert.deepEqual(after.farm,before.farm);assert.deepEqual(after.purchases,before.purchases);assert.deepEqual(after.futureAccountField,before.futureAccountField);
  assert.deepEqual(after.yard,before.yard);
 }
 test('real PostgreSQL15 Merge persistence and cross-process OCC gate',{timeout:120000},async t=>{
  try{
   assert.ok(initDb(),'No database handle; refusing the in-memory fallback');await ensureDbSchema();
   const [db]=await getDb()`SELECT current_database() AS name, current_setting('server_version_num')::int AS version`;
   assert.equal(db.name,'ccgh_merge_ci');assert.ok(db.version>=150000&&db.version<160000,'This gate requires the declared PostgreSQL15 service');
   await t.test('durable debit/grant and receipt replay survive connection close and a new process',async()=>{
    const {id,now,player}=await seed();const pack=catalog.tokenPacks.find(p=>p.id==='workshop');const payload=request(player,'buySupply',{packId:pack.id},'durable',now);
    const first=await withPlayerLock(id,p=>executeMergeLab(p,payload,{now,policy}));assert.equal(first.ok,true);assert.equal(first.replayed,false);
    const once=await load(id);assert.equal(once.resources.gachaTokens,50-pack.cost);assert.equal(once.merge.stock.glass,pack.items.glass);unchangedNonMerge(player,once,{tokens:false});
    await closeDb();assert.ok(initDb());await ensureDbSchema();
    const repeated=await runSeparate(id,payload,now+600001);assert.equal(repeated.outcome.ok,true);assert.equal(repeated.outcome.replayed,true);
    const after=await load(id);assert.equal(after.resources.gachaTokens,once.resources.gachaTokens);assert.deepEqual(after.merge.stock,once.merge.stock);assert.deepEqual(after.merge.actionLedger,once.merge.actionLedger);assert.equal(after.merge.mergeRevision,1);
    assert.equal(buildSnapshot(after).yard.goodieInventory.alchemy_echo_chimes,1402);assert.equal(buildSnapshot(after).yard.goodieInventory.alchemy_living_arbor,1201);
   });
   await t.test('same debit command in two processes produces one commit and one replay after actual OCC retry',async()=>{
    const {id,now,player}=await seed({tokens:10});const payload=request(player,'buySupply',{packId:'workshop'},'same-command',now);
    const results=await race(id,[payload,payload],now);assert.ok(results.every(r=>r.outcome.ok));assert.equal(results.filter(r=>r.outcome.replayed===false).length,1);assert.equal(results.filter(r=>r.outcome.replayed===true).length,1);
    const saved=await load(id);assert.equal(saved.resources.gachaTokens,0);assert.equal(saved.merge.stock.glass,2);assert.equal(saved.merge.actionLedger.length,1);assert.equal(saved.merge.mergeRevision,1);unchangedNonMerge(player,saved,{tokens:false});
   });
   await t.test('same supported project in two processes debits essence/stock once and grants one Yard item',async()=>{
    const {id,now}=await seed();
    await withPlayerLock(id,p=>{
     p.merge.knowledge.itemIds=catalog.items.map(item=>item.id);
     p.merge.stock={glow_lantern:1,crystal:1};p.merge.alchemyEssence=30;p.yard.goodieInventory.moon_lamp=3;
    });
    const before=await load(id),payload=request(before,'craftProject',{projectId:'night_beacon',quantity:1},'yard-grant-once',now);
    const results=await race(id,[payload,payload],now);assert.ok(results.every(r=>r.outcome.ok));assert.equal(results.filter(r=>r.outcome.replayed===false).length,1);
    const saved=await load(id);assert.equal(saved.merge.alchemyEssence,0);assert.deepEqual(saved.merge.stock,{});assert.equal(saved.yard.goodieInventory.moon_lamp,4);assert.equal(saved.merge.projects.crafted.night_beacon,1);assert.equal(saved.merge.actionLedger.length,1);
    assert.equal(saved.yard.goodieInventory.alchemy_echo_chimes,1402);assert.equal(saved.yard.goodieInventory.alchemy_living_arbor,1201);assert.deepEqual(saved.yard.activeVisitors,before.yard.activeVisitors);assert.deepEqual(saved.yard.placedGoodies,before.yard.placedGoodies);assert.deepEqual(saved.resources,before.resources);assert.deepEqual(saved.farm,before.farm);
   });
   await t.test('different concurrent commands with one affordable balance cannot both debit or grant',async()=>{
    const {id,now,player}=await seed({tokens:10});const requests=['one','two'].map(n=>request(player,'buySupply',{packId:'workshop'},n,now));const results=await race(id,requests,now);
    assert.equal(results.filter(r=>r.outcome.ok).length,1);assert.equal(results.find(r=>!r.outcome.ok).outcome.error.code,'REVISION_CONFLICT');const saved=await load(id);assert.equal(saved.resources.gachaTokens,0);assert.equal(saved.merge.stock.glass,2);assert.equal(saved.merge.actionLedger.length,1);unchangedNonMerge(player,saved,{tokens:false});
   });
   await t.test('release-default clean-start archives legacy data durably, preserves unrelated state and does not reset twice',async()=>{
    const {id,now,player}=await seed({legacy:true});assert.equal(policy.migrationMode,'clean-start');await withPlayerLock(id,p=>ensureMergeLabState(p,{now,policy}));const saved=await load(id);
    assert.equal(saved.merge.projects.selectedId,'night_beacon');assert.deepEqual(saved.merge.stock,{});assert.deepEqual(saved.merge.migration.archive.merge,player.merge);unchangedNonMerge(player,saved);assert.equal(saved.merge.serverEpoch,saved._mergeLabFence.epoch);
    await closeDb();assert.ok(initDb());await ensureDbSchema();
    await withPlayerLock(id,p=>ensureMergeLabState(p,{now:now+1000,policy,newEpoch:()=>{throw Error('Must not reset already-fenced V3');}}));
    const again=await load(id);assert.deepEqual(again.merge,saved.merge);assert.deepEqual(again._mergeLabFence,saved._mergeLabFence);unchangedNonMerge(player,again);
   });
   await t.test('archived fixture reset atomically rotates epoch; stale commands cannot grant after restart',async()=>{
    const {id,now,player}=await seed();const oldRequest=request(player,'buySupply',{packId:'workshop'},'before-reset',now);let newEpoch;
    // This is a test-only simulation of an explicitly approved administrative reset, NOT a production endpoint.
    await withPlayerLock(id,p=>{
     const plan=planMergeCleanStart(p);newEpoch=randomUUID();const oldEpoch=p.merge.serverEpoch;
     p.merge={...p.merge,...plan.initialMerge,serverEpoch:newEpoch,migration:{mode:'clean-start',legacyStateFrozen:true,archive:plan.archive,previousEpoch:oldEpoch,completedAt:now}};
     p._mergeLabFence={epoch:newEpoch,highWaterRevision:0,previousEpoch:oldEpoch,createdAt:now};
    });
    await closeDb();assert.ok(initDb());await ensureDbSchema();const result=await runSeparate(id,oldRequest,now+1);assert.equal(result.outcome.ok,false);assert.equal(result.outcome.error.code,'MERGE_EPOCH_CONFLICT');
    const saved=await load(id);assert.equal(saved.merge.serverEpoch,newEpoch);assert.equal(saved.merge.mergeRevision,0);assert.deepEqual(saved.merge.stock,{});assert.equal(saved.merge.migration.previousEpoch,oldRequest.expectedMergeEpoch);assert.equal(saved.merge.migration.archive.merge.serverEpoch,oldRequest.expectedMergeEpoch);unchangedNonMerge(player,saved);
   });
   await t.test('failed input persists no partial stock/resource debit',async()=>{
    const {id,now,player}=await seed({tokens:0});const payload=request(player,'buySupply',{packId:'workshop'},'not-affordable',now);const result=await withPlayerLock(id,p=>executeMergeLab(p,payload,{now,policy}));assert.equal(result.error.code,'INSUFFICIENT_TOKENS');const saved=await load(id);assert.deepEqual(saved.merge.stock,player.merge.stock);assert.equal(saved.merge.actionLedger.length,0);unchangedNonMerge(player,saved);
   });
  }finally{
   for(const worker of liveWorkers)worker.kill('SIGKILL');
   // Only this run's generated fixture IDs are deleted; no truncate, schema drop or arbitrary table cleanup.
   if(getDb())for(const id of fixtureIds){assertFixturePlayerId(id);await getDb()`DELETE FROM players WHERE id=${id}`;}
   await closeDb();
  }
 });
}
