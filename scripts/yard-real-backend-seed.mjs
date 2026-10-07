/** Seed a newly API-resolved disposable account through the real CAS manager.
 * Never run against host/production storage. No endpoint or app flag is added. */
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {requireDisposableBackend,requireExternalId,selectCurrentFixture,TEST_REFILL_FOOD_ID} from './yard-real-backend-contract.mjs';
import {YARD_FOODS} from '../game-logic/yard-v2/catalog.mjs';
import {GARDEN_R2_CATALOG_REVISION} from '../game-logic/garden-r2/catalog.js';
const {values}=parseArgs({options:{'base-url':{type:'string',default:'http://127.0.0.1:3199'},'external-id':{type:'string'},output:{type:'string'},verify:{type:'string'},receipts:{type:'string'}}});
const base=requireDisposableBackend(process.env,values['base-url']);
const {initDb,ensureDbSchema,closeDb}=await import('../db.js');
const {withPlayerLock}=await import('../playerManager.js');
const {closeCanonicalRuntime,CANONICAL_RUNTIME_ENABLED}=await import('../game-logic/yard-v2/canonical-runtime.mjs');
assert.equal(CANONICAL_RUNTIME_ENABLED,true,'Run with the explicit disposable-backend test loader');
const sql=initDb();assert.ok(sql);await ensureDbSchema();
const save=async(file,data)=>{await mkdir(path.dirname(path.resolve(file)),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n');};
async function identity(externalId,accountId){
 const rows=await sql`SELECT account_id FROM account_identities WHERE provider='dev' AND external_id=${externalId}`;
 assert.equal(rows.length,1);assert.equal(rows[0].account_id,accountId);assert.match(accountId,/^acct:/);
}
async function snapshot(externalId){
 const response=await fetch(base+'/api/player/snapshot',{headers:{authorization:'dev '+externalId},signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200);return response.json();
}
try{
 if(values.verify){
  assert.ok(values.receipts);const meta=JSON.parse(await readFile(values.verify,'utf8')),commands=JSON.parse(await readFile(values.receipts,'utf8'));
  requireExternalId(meta.externalId);await identity(meta.externalId,meta.accountId);
  const rows=await sql`SELECT data FROM players WHERE id=${meta.accountId}`;assert.equal(rows.length,1);const player=rows[0].data,r=player._yardV2.runtime;
  const visits=Object.values(r.canonicalVisits);assert.equal(visits.length,1);const visit=visits[0];
  assert.equal(visit.visitId,meta.candidate.visitId);assert.equal(visit.leavesAt,meta.candidate.leavesAt);assert.equal(visit.status,'active');
  assert.equal(r.canonicalPlacements[0].uses,1);assert.equal(player.yard.petbook.pip_hamster.visits,meta.admitted.petbookVisits);
  const buy=commands.find(x=>x.action==='yard.buyFood'),fill=commands.find(x=>x.action==='yard.setFood');assert.ok(buy&&fill);
  for(const command of [buy,fill]){const receipt=r.commandReceipts[command.clientActionId];assert.ok(receipt);assert.equal(receipt.status,200);assert.equal(receipt.action,command.action);}
  assert.equal(visit.lastFoodActionId,fill.clientActionId);assert.equal(visit.foodActionSequence,1);
  const foodId=fill.payload.foodId,food=YARD_FOODS[foodId];assert.equal(foodId,TEST_REFILL_FOOD_ID);assert.equal(meta.testFoodId,TEST_REFILL_FOOD_ID);assert.equal(buy.payload.foodId,foodId);assert.equal(buy.payload.qty,1);
  assert.equal(player.yard.foodInventory[foodId]||0,meta.admitted.foodInventory[foodId]||0);
  for(const currency of ['treats','shinyTreats'])assert.equal(player.yard.currencies[currency],meta.admitted.currencies[currency]-(food.cost[currency]||0));
  assert.equal(player.yard.bowls[0].foodId,foodId);assert.equal(player.yard.bowls[0].servings,food.servings);
  assert.equal(player.yard.pendingGifts.filter(g=>g.visitorId==='pip_hamster').length,0);
  const output={accountId:meta.accountId,visitId:visit.visitId,leavesAt:visit.leavesAt,uses:r.canonicalPlacements[0].uses,
   foodId,servings:player.yard.bowls[0].servings,buyActionId:buy.clientActionId,fillActionId:fill.clientActionId,foodActionSequence:visit.foodActionSequence,
   persisted:true,source:'Independent PostgreSQL readback after genuine browser commands and duplicate receipt replay'};
  await save(values.output||values.verify+'.durable.json',output);
 }else{
  const externalId=requireExternalId(values['external-id']);assert.ok(values.output,'--output required');
  const initial=await snapshot(externalId),accountId=initial.player.id;await identity(externalId,accountId);
  assert.equal(initial.player.onboarded,false);assert.equal(initial.gardenR2,null);
  // Normal startup opens Garden first. Adopt its untouched default state through
  // the existing HTTP command so its real resume/heartbeat traffic can succeed.
  const streamId='ci_garden_'+randomUUID().replaceAll('-',''),createdAt=Date.now();
  const adoption=await fetch(base+'/api/player/mutate',{method:'POST',headers:{authorization:'dev '+externalId,'content-type':'application/json'},
   body:JSON.stringify({accountId,action:'garden.r2',clientActionId:`garden-r2:${streamId}:1`,payload:{version:1,catalogRevision:GARDEN_R2_CATALOG_REVISION,
    accountId,command:'adopt',input:{acknowledgedTotal:initial.garden.acknowledgedEarnedTotal,legacyRevision:initial.garden.economicRevision},
    expectedRevision:0,intent:{streamId,sequence:1,createdAt}}}),signal:AbortSignal.timeout(15000)});
  const adopted=await adoption.json();assert.equal(adoption.status,200,JSON.stringify(adopted));assert.equal(adopted.success,true);
  const fixture=selectCurrentFixture();
  await withPlayerLock(accountId,player=>{
   assert.equal(player.id,accountId);assert.equal(player._onboarded,false,'Never reseed an existing played account');
   assert.equal(player._yardV2.version,1,'Only a fresh disposable account may be seeded');
   assert.equal(Object.keys(player._yardV2.runtime.commandReceipts||{}).length,0);
   player._onboarded=true;player.yard.placedGoodies=[];player.yard.activeVisitors=[];
   player.yard.bowls=[structuredClone(fixture.bowl)];player.yard.helper.autoRefill=false;player.yard.lastSimulatedAt=fixture.at-1;
   player._yardV2={format:'yard-persistent/v1',version:3,runtime:{version:1,canonicalRevision:'ci-seed:'+randomUUID(),seed:fixture.seed,
    cursorMs:fixture.at-1,nextOpportunityAt:fixture.at,visits:{},canonicalVisits:{},canonicalVisitReceipts:{},
    canonicalPlacements:[structuredClone(fixture.row)],giftLedger:{},commandReceipts:{},events:[]}};
  });
  await save(values.output,{externalId,accountId,seed:fixture.seed,candidate:fixture.candidate,searchOffset:fixture.searchOffset,phase:'awaiting-real-admission'});
  let admitted,lastError;const deadline=performance.now()+65000;
  while(performance.now()<deadline){
   const next=await snapshot(externalId),runtime=next.yardRuntime;
   if(runtime.status==='ready'&&runtime.canonicalVisits?.length===1){admitted=next;break;}
   lastError=runtime.error||runtime.status;
   if(runtime.status==='review-required')throw Error('REAL_BACKEND_SOURCE_REVIEW_REQUIRED:'+lastError);
   if(runtime.status==='ready'){
    const rows=await sql`SELECT data FROM players WHERE id=${accountId}`;
    const refused=Object.values(rows[0]?.data?._yardV2?.runtime?.canonicalVisitReceipts||{}).find(r=>r.at===fixture.at&&r.kind!=='admitted');
    if(refused)throw Error('REAL_BACKEND_SOURCE_REFUSED:'+String(refused.sourceCode||refused.reason||refused.kind));
   }
   await delay(300);
  }
  assert.ok(admitted,'REAL_BACKEND_ADMISSION_TIMEOUT:'+lastError);
  const visit=admitted.yardRuntime.canonicalVisits[0];assert.equal(visit.visitId,fixture.candidate.visitId);
  assert.equal(visit.plan.leavesAt,fixture.candidate.leavesAt);assert.equal(admitted.yardRuntime.canonicalPlacements[0].uses,1);
  assert.equal(admitted.yard.bowls[0].servings,fixture.bowl.servings-1);
  const rows=await sql`SELECT data FROM players WHERE id=${accountId}`;assert.equal(rows.length,1);
  const persisted=rows[0].data;assert.equal(persisted._yardV2.runtime.canonicalVisits[visit.visitId].status,'active');
  assert.deepEqual(admitted.yard.currencies,initial.yard.currencies,'Seeding and admission must preserve the real starting wallet');
  for(const currency of ['treats','shinyTreats'])assert.ok(admitted.yard.currencies[currency]>=(YARD_FOODS[TEST_REFILL_FOOD_ID].cost[currency]||0),'Source food must be affordable without a fixture grant');
  const result={externalId,accountId,seed:fixture.seed,candidate:fixture.candidate,searchOffset:fixture.searchOffset,testFoodId:TEST_REFILL_FOOD_ID,
   scope:'Fresh disposable account seeded before admission; real snapshot route, source worker and durable manager created the only saved visit.',
   admitted:{currencies:admitted.yard.currencies,foodInventory:admitted.yard.foodInventory,bowl:admitted.yard.bowls[0],petbookVisits:admitted.yard.petbook.pip_hamster.visits},
   seededAt:Date.now()};
  await save(values.output,result);await save(values.output+'.snapshot.json',admitted);
 }
}finally{await closeCanonicalRuntime();await closeDb();}
