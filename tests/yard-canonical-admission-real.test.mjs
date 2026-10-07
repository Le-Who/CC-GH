import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {withPlayerLock} from '../playerManager.js';
import {getDb} from '../db.js';
import {stageCanonicalVisitPreparation,createCanonicalVisitReconciler} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
import {selectOpportunity} from '../game-logic/yard-v2/opportunity-selection.mjs';
import {YARD_GOODIES,getYardGoodieActivities} from '../game-logic/yard-v2/catalog.mjs';
import {sampleR1SavedStay} from '../src/games/companion-yard-v2/pip-prototype/canonical-saved-stay.mjs';
import {request} from './fixtures/canonical-visit-worker-input.mjs';

const evidenceRoot=new URL('../test-results/saved-visit/',import.meta.url);fs.mkdirSync(evidenceRoot,{recursive:true});
const row=request().input.rows[0],bowl=request().input.bowl;
const selectedSeed=(()=>{for(let n=0;n<100000;n++){
 const seed='durable:'+n,selected=selectOpportunity({seed,at:1000,placed:row,goodie:YARD_GOODIES.leaf_pot,
  available:getYardGoodieActivities(YARD_GOODIES.leaf_pot,'new').sort((a,b)=>a.id.localeCompare(b.id)),bowls:[bowl]});
 if(selected?.visitor.id==='pip_hamster'&&selected.activity.id==='peek'&&selected.leavesAt===2701000)return seed;
}throw Error('NO_FIXTURE_SEED');})();
function fixture(p){
 p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.bowls=[structuredClone(bowl)];
 p._yardV2={format:'yard-persistent/v1',version:3,runtime:{version:1,seed:selectedSeed,cursorMs:999,nextOpportunityAt:1000,
  visits:{},canonicalVisits:{},canonicalVisitReceipts:{},canonicalPlacements:[structuredClone(row)],giftLedger:{},commandReceipts:{},events:[]}};
}
const stable=p=>structuredClone({yard:p.yard,runtime:p._yardV2.runtime});
async function waitFor(fn,timeout=35000){const end=performance.now()+timeout;while(performance.now()<end){const value=fn();if(value)return value;await delay(15);}throw Error('OBSERVATION_TIMEOUT');}

test('one real saved Pip visit atomically consumes stock, survives cold replay, releases at 84% and earns one source gift at exact departure',async t=>{
 const originalNow=Date.now;let now=1001;Date.now=()=>now;t.after(()=>{Date.now=originalNow;});
 assert.equal(getDb(),null);
 const owner='saved-visit-atomic-one',observations=[];
 let service=createCanonicalVisitReconciler({onObservation:r=>observations.push(r)});t.after(()=>service.close());
 await withPlayerLock(owner,p=>fixture(p)); // existing cold initialization measured separately
 let before;const start=performance.now();
 await withPlayerLock(owner,p=>{before=structuredClone(p.yard);assert.equal(stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:1000}).state,'pending');service.register(p);});
 const enqueueLockMs=performance.now()-start;
 assert.ok(enqueueLockMs<250,`enqueue lock ${enqueueLockMs}`);
 await waitFor(()=>observations.find(r=>r.state==='admitted'||r.state==='unavailable'));
 assert.ok(observations.some(r=>r.state==='admitted'),JSON.stringify(observations));
 await waitFor(()=>observations.find(r=>r.state==='active'||r.state==='unavailable'));
 assert.ok(observations.some(r=>r.state==='active'),JSON.stringify(observations));
 let saved,plan;
 await withPlayerLock(owner,p=>{
  const runtime=p._yardV2.runtime,view=service.read(p,{now});
  assert.equal(view.state,'active',JSON.stringify(view));plan=view.plan;
  assert.equal(p.yard.bowls[0].servings,before.bowls[0].servings-1);assert.equal(runtime.canonicalPlacements[0].uses,1);
  assert.equal(p.yard.petbook.pip_hamster.visits,(before.petbook.pip_hamster?.visits??0)+1);
  assert.equal(p.yard.activeVisitors.length,1);assert.equal(Object.keys(runtime.canonicalVisits).length,1);assert.equal(Object.keys(runtime.canonicalVisitReceipts).length,1);
  assert.equal(runtime.canonicalPending,undefined);assert.equal(runtime.cursorMs,1001);assert.equal(runtime.nextOpportunityAt,3601000);
  assert.deepEqual(p.yard.currencies,before.currencies);assert.deepEqual(p.yard.pendingGifts,before.pendingGifts);
  assert.deepEqual(p.yard.foodInventory,before.foodInventory);assert.deepEqual(p.yard.goodieInventory,before.goodieInventory);
  const record=Object.values(runtime.canonicalVisits)[0];assert.equal(record.proposal.authoritative,false);assert.equal(record.proposal.economicIntent.committed,false);
  assert.equal(service.read(p,{now:plan.releaseAt-1}).targetReserved,true);assert.equal(service.read(p,{now:plan.releaseAt}).targetReserved,false);assert.equal(service.read(p,{now:plan.leavesAt}).reason,'SOURCE_RECONCILIATION_DUE');
  assert.equal(sampleR1SavedStay(plan,plan.retreatAt,{rows:runtime.canonicalPlacements}).phase,'retreat');
  assert.equal(sampleR1SavedStay(plan,plan.releaseAt,{rows:runtime.canonicalPlacements}).phase,'neutral-rest');
  assert.equal(sampleR1SavedStay(plan,plan.departureAt,{rows:runtime.canonicalPlacements}).phase,'exit');
  assert.equal(sampleR1SavedStay(plan,plan.leavesAt,{rows:runtime.canonicalPlacements}).phase,'departed');
  const projected=service.project(p,{now});assert.equal(projected.status,'ready');assert.equal(projected.canonicalFoodState.state,'kibble');assert.equal(projected.canonicalPlacements[0].uses,1);
  fs.writeFileSync(new URL('qualified-snapshot.json',evidenceRoot),JSON.stringify({yard:p.yard,yardRuntime:projected}));
  saved=JSON.parse(JSON.stringify(p));
  fs.writeFileSync(new URL('qualified-plan.json',evidenceRoot),JSON.stringify(plan));
  fs.writeFileSync(new URL('qualified-player.json',evidenceRoot),JSON.stringify(saved));
 });
 await service.close();observations.length=0;
 // Serializing the actual admitted player loses every process-local artifact.
 await withPlayerLock(owner,p=>{for(const key of Object.keys(p))delete p[key];Object.assign(p,saved);});
 service=createCanonicalVisitReconciler({onObservation:r=>observations.push(r)});
 await withPlayerLock(owner,p=>assert.equal(service.read(p,{now}).reason,'SOURCE_REPLAY_REQUIRED'));
 assert.equal((await service.recover(owner)).state,'pending');await waitFor(()=>observations.find(r=>r.state==='active'||r.state==='unavailable'));
 assert.ok(observations.some(r=>r.state==='active'),JSON.stringify(observations));
 await withPlayerLock(owner,p=>{assert.equal(service.read(p,{now:plan.releaseAt}).targetReserved,false);assert.equal(service.read(p,{now:plan.leavesAt}).reason,'SOURCE_RECONCILIATION_DUE');assert.equal(p.yard.bowls[0].servings,3);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);});
 now=plan.leavesAt;observations.length=0;
 await service.recover(owner);await waitFor(()=>observations.find(r=>r.state==='completed'||r.state==='unavailable'));
 assert.ok(observations.some(r=>r.state==='completed'),JSON.stringify(observations));
 let completed;
 await withPlayerLock(owner,p=>{
  const record=Object.values(p._yardV2.runtime.canonicalVisits)[0];assert.equal(record.status,'completed');assert.equal(p.yard.activeVisitors.length,0);
  assert.equal(p.yard.pendingGifts.length,before.pendingGifts.length+1);assert.equal(p.yard.pendingGifts.at(-1).createdAt,plan.leavesAt);
  assert.equal(p._yardV2.runtime.giftLedger[record.giftId].status,'earned');assert.equal(p.yard.bowls[0].servings,3);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);
  completed=stable(p);
 });
 assert.equal((await service.recover(owner)).code,'NO_UNRESOLVED_VISIT');
 await withPlayerLock(owner,p=>assert.deepEqual(stable(p),completed));
 t.diagnostic(JSON.stringify({enqueueLockMs,visitId:plan.visitId,arrivedAt:plan.arrivedAt,releaseAt:plan.releaseAt,leavesAt:plan.leavesAt,elapsedMs:performance.now()-start}));
});
