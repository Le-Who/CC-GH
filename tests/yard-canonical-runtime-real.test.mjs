import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {withPlayerLock} from '../playerManager.js';
import playerRoutes from '../routes/player.js';
import {fixture} from './fixtures/canonical-reconciliation-fixture.mjs';
import {closeCanonicalRuntime} from '../game-logic/yard-v2/canonical-runtime.mjs';
import {initializeReleasedPlayerYard as ensureCanonicalPlayerYard,releasedYardSnapshot} from '../game-logic/yard-v2/player-release.mjs';
const publicCanonicalPlayerYard=(p,options)=>releasedYardSnapshot(p,options).yardRuntime;

test('normal tick publishes genuine saved visit across unrelated snapshots, cold recovery, and exact departure',async t=>{
 const oldNow=Date.now;let now=1001;Date.now=()=>now;t.after(async()=>{await closeCanonicalRuntime();Date.now=oldNow;});
 const id='normal-runtime-pip';
 await withPlayerLock(id,p=>{fixture(p);p._onboarded=true;p._yardV2.runtime.canonicalRevision='initial';});
 await withPlayerLock(id,p=>assert.equal(ensureCanonicalPlayerYard(p,{now,simulate:true}).status,200));
 const router=playerRoutes((_req,_res,next)=>next(),()=>({userId:id,username:'Normal Runtime Owner'}));
 const route=router.stack.find(layer=>layer.route?.path==='/api/player/snapshot'&&layer.route.methods.get);
 let lastAppSnapshot;
 async function ready(){const end=performance.now()+40000;while(performance.now()<end){
  const req={body:{},query:{},headers:{}},res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=JSON.parse(JSON.stringify(value));return this;}};
  for(const handler of route.route.stack){let next=false;await handler.handle(req,res,error=>{if(error)throw error;next=true;});if(!next)break;}
  assert.equal(res.statusCode,200);lastAppSnapshot=res.body;const view=res.body.yardRuntime;
  if(view.canonicalVisits.length)return view;await delay(30);
 }throw Error('RUNTIME_VISIT_TIMEOUT');}
 const first=await ready();
 const out=new URL('../test-results/normal-runtime/',import.meta.url);fs.mkdirSync(out,{recursive:true});
 await withPlayerLock(id,p=>{fs.writeFileSync(new URL('qualified-player.json',out),JSON.stringify(p));fs.writeFileSync(new URL('qualified-app-snapshot.json',out),JSON.stringify(lastAppSnapshot));fs.writeFileSync(new URL('qualified-snapshot.json',out),JSON.stringify({yard:p.yard,yardRuntime:publicCanonicalPlayerYard(p,{now})}));});
 fs.writeFileSync(new URL('qualified-plan.json',out),JSON.stringify(first.canonicalVisits[0].plan));
 assert.equal(first.canonicalVisits.length,1);assert.deepEqual(first.visits,[]);const plan=first.canonicalVisits[0].plan;
 let revision;await withPlayerLock(id,p=>{revision=p._yardV2.runtime.canonicalRevision;p.unrelatedRuntimeTest=1;});
 await withPlayerLock(id,p=>{assert.equal(p._yardV2.runtime.canonicalRevision,revision);assert.equal(publicCanonicalPlayerYard(p,{now}).canonicalVisits.length,1);});
 // A later mutation in the same transaction cannot retag old replay evidence.
 await withPlayerLock(id,p=>{ensureCanonicalPlayerYard(p,{now,simulate:true});p._yardV2.runtime.canonicalPlacements[0].x+=1;});
 await withPlayerLock(id,p=>{assert.equal(publicCanonicalPlayerYard(p,{now}).status,'reconciliation-pending');p._yardV2.runtime.canonicalPlacements[0].x-=1;});
 await ready();
 await closeCanonicalRuntime();await withPlayerLock(id,p=>assert.equal(publicCanonicalPlayerYard(p,{now}).status,'reconciliation-pending'));
 await ready();now=plan.leavesAt;
 await withPlayerLock(id,p=>{assert.equal(ensureCanonicalPlayerYard(p,{now,simulate:true}).status,200);assert.equal(p.yard.activeVisitors.length,0);assert.equal(p.yard.pendingGifts.filter(g=>g.createdAt===plan.leavesAt).length,1);});
 await withPlayerLock(id,p=>{ensureCanonicalPlayerYard(p,{now,simulate:true});assert.equal(p.yard.pendingGifts.filter(g=>g.createdAt===plan.leavesAt).length,1);});
});

test('historical genuine opportunity settles once without requiring a visible live interval',async t=>{
 const oldNow=Date.now;let now=2701001;Date.now=()=>now;t.after(async()=>{await closeCanonicalRuntime();Date.now=oldNow;});
 const id='normal-runtime-historical';
 await withPlayerLock(id,p=>{fixture(p);p._yardV2.runtime.canonicalRevision='historical-initial';});
 let done=false;const end=performance.now()+40000;
 while(performance.now()<end&&!done){
  await withPlayerLock(id,p=>{const result=ensureCanonicalPlayerYard(p,{now,simulate:true});assert.equal(result.status,200,JSON.stringify(result));done=Object.values(p._yardV2.runtime.canonicalVisits).some(v=>v.status==='completed');});
  if(!done)await delay(30);
 }
 assert.equal(done,true);
 await withPlayerLock(id,p=>{assert.equal(p.yard.activeVisitors.length,0);assert.equal(p.yard.petbook.pip_hamster.visits,1);assert.equal(p.yard.pendingGifts.filter(g=>g.createdAt===2701000).length,1);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);assert.equal(p.yard.bowls[0].servings,3);});
});

test('unknown reservation status and unsupported refill never become ready or advance',async t=>{
 t.after(closeCanonicalRuntime);
 for(const kind of ['reservation','refill','receipts','stock','pending'])await withPlayerLock('normal-runtime-invalid-'+kind,p=>{
  fixture(p);p._yardV2.runtime.canonicalRevision='invalid';
  if(kind==='reservation')p._yardV2.runtime.canonicalVisits.unknown={status:'unknown'};
  else if(kind==='refill')p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true};
  else if(kind==='receipts')p._yardV2.runtime.canonicalVisitReceipts=null;
  else if(kind==='stock')p.yard.bowls[0].servings=-1;
  else p._yardV2.runtime.canonicalPending={bad:true};
  const before=structuredClone({yard:p.yard,store:p._yardV2});
  assert.equal(ensureCanonicalPlayerYard(p,{now:1001,simulate:true}).status,409);
  assert.deepEqual({yard:p.yard,store:p._yardV2},before);
  assert.equal(publicCanonicalPlayerYard(p,{now:1001}).status,'review-required');
 });
});

test('ordinary initialization is validation-only before transaction revision capture',async t=>{
 t.after(closeCanonicalRuntime);
 await withPlayerLock('normal-runtime-readonly-initializer',p=>{
  fixture(p);p._yardV2.runtime.canonicalRevision='readonly-init';
  const before=structuredClone({yard:p.yard,store:p._yardV2});
  assert.equal(ensureCanonicalPlayerYard(p,{now:1001,simulate:false}).status,200);
  assert.deepEqual({yard:p.yard,store:p._yardV2},before);
 });
});

test('unsupported final-use transition consumes its opportunity without pinning preparation',async t=>{
 t.after(closeCanonicalRuntime);
 await withPlayerLock('normal-runtime-final-use',p=>{
  fixture(p);p._yardV2.runtime.canonicalPlacements[0].uses=7;
  const before=structuredClone(p.yard);
  assert.equal(ensureCanonicalPlayerYard(p,{now:1001,simulate:true}).status,200);
  assert.equal(p._yardV2.runtime.canonicalPending,undefined);
  assert.equal(p._yardV2.runtime.nextOpportunityAt,3601000);
  assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,7);
  assert.deepEqual(p.yard.bowls,before.bowls);assert.deepEqual(p.yard.petbook,before.petbook);
 });
});

test('idle projection holds unprocessed opportunities and expiry without changing a save',async t=>{
 t.after(closeCanonicalRuntime);
 await withPlayerLock('normal-runtime-idle-due',p=>{
  fixture(p);const before=structuredClone({yard:p.yard,store:p._yardV2});
  assert.equal(publicCanonicalPlayerYard(p,{now:1000}).status,'reconciliation-pending');
  assert.deepEqual({yard:p.yard,store:p._yardV2},before);
  p._yardV2.runtime.nextOpportunityAt=3601000;p.yard.bowls[0].expiresAt=1001;
  assert.equal(publicCanonicalPlayerYard(p,{now:1001}).status,'reconciliation-pending');
  assert.equal(p.yard.bowls[0].foodId,'kibble');
 });
});
