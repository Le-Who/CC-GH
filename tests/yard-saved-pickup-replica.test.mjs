import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {withPlayerLock,afterPlayerCommit} from '../playerManager.js';
import {fixture,row} from './fixtures/canonical-reconciliation-fixture.mjs';
import {prepareCanonicalSavedVisit} from '../game-logic/yard-v2/canonical-saved-visit-bridge.mjs';
import {stageCanonicalVisitPreparation,createCanonicalVisitReconciler} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
import {commitPreparedCanonicalVisit,completeReplayedCanonicalVisit} from '../game-logic/yard-v2/canonical-visit-transaction.mjs';
import {VISIT_JOB_SOURCE_HASH} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from '../game-logic/yard-v2/canonical-food-protocol.mjs';

test('a second warm reconciler keeps authoritative visitor projection on exact pickup replay',async t=>{
 const owner='pickup-warm-replica',oldNow=Date.now;let now=1000;Date.now=()=>now;
 const observations=[[],[]],services=observations.map(events=>createCanonicalVisitReconciler({onObservation:e=>events.push(e)}));
 t.after(async()=>{await Promise.all(services.map(s=>s.close()));Date.now=oldNow;});
 let plan;
 await withPlayerLock(owner,p=>{
  fixture(p);assert.equal(stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:now}).state,'pending');
  const artifact=prepareCanonicalSavedVisit(p._yardV2.runtime.canonicalPending.input);assert.equal(artifact.prepared,true,artifact.code);plan=artifact.plan;
  const evidence={state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact};
  assert.equal(commitPreparedCanonicalVisit(p,evidence,{now}).state,'admitted');now=plan.releaseAt;
  assert.equal(completeReplayedCanonicalVisit(p,evidence,{now}).state,'active');
 });
 await Promise.all(services.map(s=>s.recover(owner)));
 const end=performance.now()+45000;while(observations.some(events=>!events.length)&&performance.now()<end)await delay(20);
 for(const events of observations)assert.equal(events.at(-1)?.state,'active',JSON.stringify(events));
 const payload={...CANONICAL_FOOD_LOCATION,slotId:row.slotId},actionId=CANONICAL_FOOD_NONCE_PREFIX+'replica-pickup';
 for(let index=0;index<services.length;index++){
  let projection;
  await withPlayerLock(owner,p=>{
   const result=services[index].applyPickup(p,payload,{now,actionId});assert.equal(result.status,200,result.error);assert.equal(result.replayed,index===1);
   afterPlayerCommit(p,winning=>{projection=services[index].project(winning,{now});},{beforeSync:true});
  });
  assert.equal(projection.status,'ready',`replica ${index}: ${JSON.stringify(projection)}`);
  assert.deepEqual(projection.canonicalPlacements,[]);assert.deepEqual(projection.canonicalVisits[0].plan,plan);
 }
});
