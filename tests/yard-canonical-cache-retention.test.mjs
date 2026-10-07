import './helpers/garden-r2-route-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import{setTimeout as delay}from'node:timers/promises';
import{withPlayerLock}from'../playerManager.js';
import{fixture,row}from'./fixtures/canonical-reconciliation-fixture.mjs';
import{stageCanonicalVisitPreparation,createCanonicalVisitReconciler}from'../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
import{yardReleasePresentation}from'../src/games/companion-yard-v2/release-presentation.mjs';

test('immutable qualified visit stays ready across former cache TTLs, with exact-key and cold replay fences',async t=>{
 const dateNow=Date.now,monoNow=performance.now.bind(performance);let now=1001,offset=0;
 Date.now=()=>now;Object.defineProperty(performance,'now',{value:()=>monoNow()+offset,configurable:true});
 let service=createCanonicalVisitReconciler();t.after(async()=>{await service.close();Date.now=dateNow;delete performance.now;});
 const id='qualified-retention';await withPlayerLock(id,p=>{fixture(p);stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:1000});service.register(p);});
 async function waitReady(){const end=monoNow()+40000;while(monoNow()<end){let view;await withPlayerLock(id,p=>{service.advance(p,{now});view=service.project(p,{now});});if(view.status==='ready')return view;await delay(20);}throw Error('RETENTION_READY_TIMEOUT');}
 const first=await waitReady(),plan=first.canonicalVisits[0].plan,started=service.stats().startedCount;
 for(const elapsed of [10000,50000,60001,120002,180003]){
  offset=elapsed;now=1001+elapsed;
  await withPlayerLock(id,p=>{assert.equal(service.advance(p,{now}).state,'active',`elapsed ${elapsed}`);const view=service.project(p,{now});assert.equal(view.status,'ready',`elapsed ${elapsed}`);assert.equal(yardReleasePresentation({yardRuntime:view},{canonicalSavedVisitsEnabled:true}),'persistent');assert.equal(view.canonicalVisits[0].visitId,first.canonicalVisits[0].visitId);});
 }
 assert.equal(service.stats().startedCount,started,'elapsed cache age alone must not compile again');
 await withPlayerLock(id,p=>{const revision=p._yardV2.runtime.canonicalRevision;p._yardV2.runtime.canonicalRevision='different';assert.equal(service.read(p,{now}).ready,false);assert.equal(service.applyFood(p,'yard.buyFood',{foodId:'bonito_bowl',qty:1},{now,actionId:'yard-v2:mismatch'}).status,409);assert.equal(p._yardV2.runtime.commandReceipts['yard-v2:mismatch'],undefined);p._yardV2.runtime.canonicalRevision=revision;});
 await withPlayerLock(id,p=>{assert.equal(service.applyFood(p,'yard.buyFood',{foodId:'bonito_bowl',qty:1},{now,actionId:'yard-v2:retention-buy'}).status,200);service.advance(p,{now});});
 await withPlayerLock(id,p=>{assert.equal(service.applyFood(p,'yard.setFood',{foodId:'bonito_bowl',bowlId:'bowl-1'},{now,actionId:'yard-v2:retention-fill'}).status,200);service.advance(p,{now});});
 offset=2*60*60*1000;
 await withPlayerLock(id,p=>{assert.equal(service.read(p,{now}).ready,false,'hard-expired entry still needs replay');assert.equal(service.applyFood(p,'yard.buyFood',{foodId:'kibble',qty:1},{now,actionId:'yard-v2:expired'}).status,409);assert.equal(p._yardV2.runtime.commandReceipts['yard-v2:expired'],undefined);});
 await service.close();service=createCanonicalVisitReconciler();await withPlayerLock(id,p=>assert.equal(service.read(p,{now}).ready,false));await waitReady();
 now=plan.leavesAt;
 await withPlayerLock(id,p=>{assert.equal(service.advance(p,{now}).state,'completed');assert.equal(p.yard.activeVisitors.length,0);assert.equal(p.yard.pendingGifts.filter(g=>g.createdAt===plan.leavesAt).length,1);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);assert.equal(service.read(p,{now}).ready,false);});
 await withPlayerLock(id,p=>{service.advance(p,{now});assert.equal(p.yard.pendingGifts.filter(g=>g.createdAt===plan.leavesAt).length,1);});
});
