import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {withPlayerLock} from '../playerManager.js';
import {getDb} from '../db.js';
import {stageCanonicalVisitPreparation,createCanonicalVisitReconciler} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
import {selectOpportunity} from '../game-logic/yard-v2/opportunity-selection.mjs';
import {YARD_GOODIES,getYardGoodieActivities} from '../game-logic/yard-v2/catalog.mjs';
import {request} from './fixtures/canonical-visit-worker-input.mjs';

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

test('real preparation keeps durable selected opportunity, stock and cursor unchanged across fresh-lock notification',async t=>{
 assert.equal(getDb(),null);
 const observations=[],service=createCanonicalVisitReconciler({onObservation:r=>observations.push(r)});t.after(()=>service.close());
 const owner='saved-visit-durable-one';let expected;
 const start=performance.now();
 await withPlayerLock(owner,p=>{fixture(p);assert.equal(stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:1000}).state,'pending');expected=stable(p);assert.equal(service.register(p).state,'pending');});
 const lockMs=performance.now()-start;
 const result=await waitFor(()=>observations.find(r=>r.prepared||r.state==='unavailable'));
 assert.equal(result.state,'prepared-inactive',JSON.stringify(observations));assert.equal(result.admission,false);
 await withPlayerLock(owner,p=>assert.deepEqual(stable(p),expected));
 assert.equal(service.stats().startedCount,1);assert.equal(service.stats().highWaterWorkers,1);
 t.diagnostic(JSON.stringify({selectedSeed,lockMs,elapsedMs:performance.now()-start,result}));
});

test('cold reconciler recovers the same durable selection and rejects changed stock without reroll or receipts',async t=>{
 const owner='saved-visit-cold-one',first=createCanonicalVisitReconciler();let intent;
 await withPlayerLock(owner,p=>{fixture(p);stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:1000});intent=structuredClone(p._yardV2.runtime.canonicalPending);});
 await first.close();const observations=[],fresh=createCanonicalVisitReconciler({onObservation:r=>observations.push(r)});t.after(()=>fresh.close());
 assert.equal((await fresh.recover(owner)).state,'pending');
 assert.equal((await waitFor(()=>observations.find(r=>r.prepared||r.state==='unavailable'))).state,'prepared-inactive',JSON.stringify(observations));
 await withPlayerLock(owner,p=>{assert.deepEqual(p._yardV2.runtime.canonicalPending,intent);p.yard.bowls[0].servings=3;});
 const count=fresh.stats().startedCount;
 assert.equal((await fresh.recover(owner)).code,'PENDING_STATE_OBSOLETE');
 await withPlayerLock(owner,p=>{assert.deepEqual(p._yardV2.runtime.canonicalPending,intent);assert.equal(p.yard.bowls[0].servings,3);assert.deepEqual(p._yardV2.runtime.commandReceipts,{});assert.equal(p._yardV2.runtime.cursorMs,999);});
 assert.equal(fresh.stats().startedCount,count);
});

test('intervening account version invalidates completion and requeues only from the winning fresh transaction',async t=>{
 const owner='saved-visit-aba-one',observations=[],service=createCanonicalVisitReconciler({onObservation:r=>observations.push(r)});t.after(()=>service.close());let originalVersion;
 await withPlayerLock(owner,p=>{fixture(p);stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:1000});service.register(p);});
 await waitFor(()=>service.stats().workers===1);
 await withPlayerLock(owner,p=>{originalVersion=p._version;p.unrelatedTestCounter=1;});
 const result=await waitFor(()=>observations.find(r=>r.prepared),65000);
 assert.equal(result.admission,false);assert.ok(observations.some(r=>r.reason==='STATE_OBSOLETE'));assert.equal(service.stats().startedCount,2);
 await withPlayerLock(owner,p=>{assert.notEqual(p._version,originalVersion);assert.equal(p.unrelatedTestCounter,1);assert.equal(p.yard.bowls[0].servings,4);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,0);});
});

test('old versions, altered selected candidate and active reservations fail closed before enqueue',async t=>{
 const service=createCanonicalVisitReconciler();t.after(()=>service.close());
 await withPlayerLock('saved-visit-negative-one',p=>{
  fixture(p);p._yardV2.version=2;assert.equal(stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:1000}).code,'CANONICAL_CONTAINER_V3_REQUIRED');
  p._yardV2.version=3;stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:1000});p._yardV2.runtime.canonicalPending.input.candidate.leavesAt+=60000;
  assert.equal(service.register(p).code,'PENDING_STATE_OBSOLETE');
  fixture(p);p._yardV2.runtime.visits.v={status:'active'};assert.equal(service.register(p).code,'EXISTING_VISITS_UNQUALIFIED');
 });
 assert.equal(service.stats().startedCount,0);
});
