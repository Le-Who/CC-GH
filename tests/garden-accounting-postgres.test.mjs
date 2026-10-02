/** Opt-in actual PostgreSQL15/OCC tests. Never install or connect locally by default.
 * Reuses the release CI disposable ccgh_merge_ci PostgreSQL15 service.
 * GARDEN_ACCOUNTING_PG_TEST=1 CI=true NODE_ENV=test DATABASE_URL=... node --test tests/garden-accounting-postgres.test.mjs
 */
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {assertDisposableGardenDatabase,assertGardenFixtureId} from './helpers/garden-accounting-pg-guard.mjs';
if(process.env.GARDEN_ACCOUNTING_PG_TEST!=='1'){
 test('Garden actual PostgreSQL persistence gate requires explicit CI opt-in',{skip:'Not executed; no release persistence evidence'},()=>{});
}else{
 assertDisposableGardenDatabase();
 const {initDb,ensureDbSchema,getDb,closeDb}=await import('../db.js');
 const {withPlayerLock}=await import('../playerManager.js');
 const {applyActionWithReceipt}=await import('../routes/player.js');
 const {createDefaultPlayer}=await import('../game-logic.js');
 const {createGardenEconomyState}=await import('../game-logic/garden-economy.js');
 const workerFile=fileURLToPath(new URL('./helpers/garden-accounting-pg-worker.mjs',import.meta.url));
 const fixtureIds=[],liveWorkers=new Set();
 function participant(){
  const child=fork(workerFile,[],{execArgv:[],env:{...process.env,GARDEN_ACCOUNTING_PG_WORKER:'1'},stdio:['ignore','pipe','pipe','ipc']});
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

 async function seed(gold=100){
  const id=assertGardenFixtureId('garden_accounting_pg_'+randomUUID());fixtureIds.push(id);const now=Date.now(),p=createDefaultPlayer(id,'Disposable Garden CI',now);
  p.resources.gold=gold;p.garden={...createGardenEconomyState(now),level:30};p._version=randomUUID();p.retainedFixtureField={unchanged:true};
  await getDb()`INSERT INTO players(id,data) VALUES(${id},${p})`;return {id,now,p};
 }
 const request=(accountId,now,stream=randomUUID().replaceAll('-',''))=>({action:'garden.buyPlant',payload:{type:'daisy',shelfIndex:0,spotIndex:0,expectedRevision:0,intent:{accountId,streamId:stream,sequence:1,createdAt:now}},clientActionId:`garden:${stream}:1`,now});
 async function load(id){assertGardenFixtureId(id);const [row]=await getDb()`SELECT data FROM players WHERE id=${id}`;assert.ok(row);return row.data;}
 async function separate(playerId,command){const w=participant();await w.wait('ready');w.send({type:'execute',playerId,...command,barrier:false});const r=await w.wait('result');await w.exited;return r;}
 async function race(playerId,commands){
  const workers=commands.map(()=>participant());await Promise.all(workers.map(w=>w.wait('ready')));workers.forEach((w,i)=>w.send({type:'execute',playerId,...commands[i],barrier:true}));
  const loaded=await Promise.all(workers.map(w=>w.wait('loaded')));assert.equal(new Set(loaded.map(r=>r.version)).size,1);
  workers.forEach(w=>w.send({type:'release'}));const result=await Promise.all(workers.map(w=>w.wait('result')));await Promise.all(workers.map(w=>w.exited));assert.ok(result.some(r=>r.callbackAttempts>=2),'Must exercise an actual PostgreSQL OCC retry');return result;
 }
 test('Garden durable atomic transactions and cross-process OCC',{timeout:120000},async t=>{
  try{
   assert.ok(initDb());await ensureDbSchema();const [db]=await getDb()`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;assert.equal(db.name,'ccgh_merge_ci');assert.ok(db.version>=150000&&db.version<160000);
   await t.test('applied purchase survives lost response, connection restart and long-delayed replay',async()=>{
    const {id,now,p}=await seed(),command=request(id,now);await withPlayerLock(id,player=>applyActionWithReceipt(player,command.action,command.payload,{clientActionId:command.clientActionId,serverNow:now}));
    await closeDb();assert.ok(initDb());await ensureDbSchema();const replay=await separate(id,{...command,now:now+10*86400000});assert.equal(replay.outcome.status,200);assert.equal(replay.outcome.body.duplicate,true);
    const saved=await load(id);assert.equal(saved.resources.gold,75);assert.equal(saved.garden.plants.length,1);assert.equal(saved.gardenAccounting.revision,1);assert.deepEqual(saved.retainedFixtureField,p.retainedFixtureField);assert.deepEqual(saved.farm,p.farm);
   });
   await t.test('same purchase in two OS processes commits once after a genuine CAS collision',async()=>{
    const {id,now}=await seed(25),command=request(id,now);const result=await race(id,[command,command]);assert.ok(result.every(r=>r.outcome.status===200));assert.equal(result.filter(r=>r.outcome.body.duplicate).length,1);const saved=await load(id);assert.equal(saved.resources.gold,0);assert.equal(saved.garden.plants.length,1);assert.equal(saved.gardenAccounting.revision,1);
   });
   await t.test('different concurrent purchases cannot both spend one affordable balance',async()=>{
    const {id,now}=await seed(25),a=request(id,now),b=request(id,now);b.payload.spotIndex=1;const result=await race(id,[a,b]);assert.equal(result.filter(r=>r.outcome.status===200).length,1);assert.equal(result.find(r=>r.outcome.status!==200).outcome.body.error,'GARDEN_REVISION_CONFLICT');const saved=await load(id);assert.equal(saved.resources.gold,0);assert.equal(saved.garden.plants.length,1);
   });
   await t.test('stale sync after purchase cannot erase the entity or credit a refund',async()=>{
    const {id,now,p}=await seed(),command=request(id,now);await separate(id,command);const stale=await withPlayerLock(id,player=>applyActionWithReceipt(player,'garden.sync',{state:p.garden},{}));assert.equal(stale.status,409);assert.equal(stale.body.error,'GARDEN_REVISION_CONFLICT');const saved=await load(id);assert.equal(saved.resources.gold,75);assert.equal(saved.garden.plants.length,1);
   });
   await t.test('invalid debit and old unknown intent persist no partial mutation',async()=>{
    const {id,now}=await seed(0),command=request(id,now);const result=await separate(id,command);assert.equal(result.outcome.body.error,'GARDEN_INSUFFICIENT_GOLD');const old=request(id,now-10*86400000);old.now=now;const uncertain=await separate(id,old);assert.equal(uncertain.outcome.body.error,'GARDEN_INTENT_AMBIGUOUS');const saved=await load(id);assert.equal(saved.resources.gold,0);assert.equal(saved.garden.plants.length,0);
   });
  }finally{
   for(const worker of liveWorkers)worker.kill('SIGKILL');
   if(getDb())for(const id of fixtureIds){assertGardenFixtureId(id);await getDb()`DELETE FROM players WHERE id=${id}`;}
   await closeDb();
  }
 });
}
