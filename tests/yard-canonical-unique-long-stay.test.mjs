import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultYardState} from '../game-logic/yard.js';
import {prepareCanonicalSavedVisit} from '../game-logic/yard-v2/canonical-saved-visit-bridge.mjs';
import {stageCanonicalVisitPreparation,inspectCanonicalPlayerState,createCanonicalVisitReconciler} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
import {commitPreparedCanonicalVisit,completeReplayedCanonicalVisit,inspectReplayedCanonicalVisit} from '../game-logic/yard-v2/canonical-visit-transaction.mjs';
import {ensureCanonicalPlayerYard,publicCanonicalPlayerYard,closeCanonicalRuntime} from '../game-logic/yard-v2/canonical-runtime.mjs';
import {canonicalActiveHourReceipt,canonicalDepartureCheckpointValid,canonicalOpportunityEventId,CANONICAL_HELD_DEPARTURE_STATUS,CANONICAL_MAX_VISIT_STAY_MS} from '../game-logic/yard-v2/canonical-unique-visit-clock.mjs';
import {applyCanonicalFoodActionAtCursor} from '../game-logic/yard-v2/canonical-food-actions.mjs';
import {YARD_VISITORS} from '../game-logic/yard-v2/catalog.mjs';
import {VISIT_JOB_SOURCE_HASH} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {withPlayerLock} from '../playerManager.js';
import {getDb} from '../db.js';
import {setTimeout as delay} from 'node:timers/promises';
import {clone,digest} from '../game-logic/yard-v2/util.mjs';
const A=1000,H=3600000,B=A+H;
const seeds={45:'durable:1277',60:'long-stay:1703',61:'long-stay:1104',68:'long-stay:1134',71:'long-stay:279',72:'long-stay:1309',110:'long-stay:425'};
const row={slotId:'canonical:a',goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x:98,y:118,condition:'new',uses:0,placedAt:1};
function configure(p,minutes,expiry=4*H){p.yard=createDefaultYardState(A);p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.bowls=[{id:'bowl-1',foodId:'kibble',servings:4,placedAt:1,expiresAt:expiry}];
 p._yardV2={format:'yard-persistent/v1',version:3,runtime:{version:1,canonicalRevision:'initial',seed:seeds[minutes],cursorMs:A-1,nextOpportunityAt:A,visits:{},canonicalVisits:{},canonicalVisitReceipts:{},canonicalPlacements:[clone(row)],giftLedger:{},commandReceipts:{},events:[]}};return p;}
const artifactCache=new Map();
function admitted(minutes,expiry=4*H,{servings=4,priorVisits=0,priorMemento=false}={}){
 const p=configure({id:'unique-'+minutes+'-'+expiry,schemaVersion:11,_version:'initial'},minutes,expiry);
 p.yard.bowls[0].servings=servings;
 if(priorVisits){p.yard.petbook.pip_hamster={visits:priorVisits,firstSeenAt:1,lastSeenAt:1,favoriteGoodies:{leaf_pot:priorVisits},mementoReceived:priorMemento};
  if(priorMemento){const visitor=YARD_VISITORS.pip_hamster;p.yard.mementos.pip_hamster={id:visitor.memento.id,visitorId:visitor.id,name:visitor.memento.name,receivedAt:1};}}
 const staged=stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:A});assert.equal(staged.state,'pending',JSON.stringify(staged));
 const key=minutes+':'+expiry+':'+servings;if(!artifactCache.has(key)){
  const artifact=prepareCanonicalSavedVisit(p._yardV2.runtime.canonicalPending.input);assert.equal(artifact.prepared,true,artifact.code);artifactCache.set(key,artifact);
 }
 const evidence={state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact:artifactCache.get(key)};
 assert.equal(evidence.artifact.record.candidate.leavesAt,A+minutes*60000);
 assert.equal(commitPreparedCanonicalVisit(p,evidence,{now:A+1}).state,'admitted');
 return {p,evidence,wrapper:Object.values(p._yardV2.runtime.canonicalVisits)[0]};
}
const hour=p=>p._yardV2.runtime.canonicalVisitReceipts[canonicalOpportunityEventId(p,B,row.slotId)];
const value=p=>clone({yard:p.yard,store:p._yardV2});

for(const minutes of [45,60,61,68,71,72,110])test(`source-selected ${minutes}m visit admits and completes once without duration filtering`,()=>{
 const {p,evidence,wrapper}=admitted(minutes);assert.equal(p.yard.bowls[0].servings,3);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);assert.equal(p.yard.petbook.pip_hamster.visits,1);
 if(minutes>60){
  const result=completeReplayedCanonicalVisit(p,evidence,{now:B});assert.equal(result.state,'active',JSON.stringify(result));assert.equal(p.yard.activeVisitors.length,1);
  assert.equal(p._yardV2.runtime.nextOpportunityAt,A+2*H);assert.equal(p._yardV2.runtime.cursorMs,B);
  if(minutes>=72)assert.equal(hour(p).reason,'TARGET_CAPACITY_RESERVED');
  else assert.notEqual(hour(p).reason,'TARGET_CAPACITY_RESERVED');
  assert.equal(p.yard.bowls[0].servings,3);assert.equal(p.yard.petbook.pip_hamster.visits,1);assert.equal(p.yard.pendingGifts.length,0);
  assert.equal(inspectReplayedCanonicalVisit(p,evidence,{now:B}).valid,true);
 }
 const result=completeReplayedCanonicalVisit(p,evidence,{now:wrapper.leavesAt});assert.equal(result.state,'completed',JSON.stringify(result));
 assert.equal(p.yard.activeVisitors.length,0);assert.equal(p.yard.pendingGifts.length,1);assert.equal(p.yard.pendingGifts[0].createdAt,wrapper.leavesAt);
 assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);assert.equal(p.yard.petbook.pip_hamster.visits,1);
 assert.equal(canonicalDepartureCheckpointValid(p),true);const before=value(p);completeReplayedCanonicalVisit(p,evidence,{now:wrapper.leavesAt});assert.deepEqual(value(p),before);
});

test('68m second source Pip selection is durably refused by identity, without reroll or duplicate effects',()=>{
 const {p,evidence}=admitted(68);completeReplayedCanonicalVisit(p,evidence,{now:B});const receipt=hour(p);
 assert.equal(receipt.reason,'PIP_ALREADY_VISITING');assert.equal(receipt.selection.visitorId,'pip_hamster');assert.equal(receipt.selection.activityId,'peek');
 assert.equal(receipt.selection.leavesAt,B+91*60000);assert.equal(receipt.selection.visitId,'visit_v2_256js_2b8cbda7af6524720ba1f2aa6da750fb');
 assert.equal(Object.keys(p._yardV2.runtime.canonicalVisits).length,1);assert.equal(p._yardV2.runtime.canonicalPending,undefined);
 const before=clone(receipt);completeReplayedCanonicalVisit(p,evidence,{now:B+1});assert.deepEqual(hour(p),before);
});

test('expiry is processed before an active hourly selection and never delays the exact gift',()=>{
 const {p,evidence,wrapper}=admitted(110,B);const result=completeReplayedCanonicalVisit(p,evidence,{now:wrapper.leavesAt});assert.equal(result.state,'completed');
 assert.equal(hour(p).reason,'NO_ELIGIBLE_FOOD');assert.deepEqual(hour(p).beforeBowl,{id:'bowl-1',foodId:null,servings:0,placedAt:null,expiresAt:null});
 assert.equal(p.yard.pendingGifts[0].createdAt,wrapper.leavesAt);assert.equal(p._yardV2.runtime.nextOpportunityAt,A+2*H);
});

test('historical hour input excludes new food at the same timestamp and includes earlier source refill',()=>{
 const {p,evidence,wrapper}=admitted(68);const beforeAt=B-1000;
 completeReplayedCanonicalVisit(p,evidence,{now:beforeAt});p.yard.foodInventory.kibble=2;p.yard.foodInventory.bonito_bowl=1;
 function fill(foodId,id,now){const r=applyCanonicalFoodActionAtCursor(p,'yard.setFood',{foodId,bowlId:'bowl-1'},{actionId:id,now,replayedRecord:evidence.artifact.record});assert.equal(r.status,200,r.error);p.yard=r.yard;p._yardV2.runtime=r.runtime;}
 fill('kibble','yard-v2:before-hour',beforeAt);completeReplayedCanonicalVisit(p,evidence,{now:B});
 assert.equal(hour(p).foodSequence,1);assert.equal(hour(p).beforeBowl.servings,4);assert.equal(hour(p).reason,'PIP_ALREADY_VISITING');
 fill('bonito_bowl','yard-v2:same-hour',B);assert.equal(p.yard.bowls[0].servings,6);
 assert.deepEqual(hour(p),canonicalActiveHourReceipt(p,Object.values(p._yardV2.runtime.canonicalVisits)[0],evidence.artifact.record,B));
 assert.equal(inspectReplayedCanonicalVisit(JSON.parse(JSON.stringify(p)),evidence,{now:B}).valid,true);
 completeReplayedCanonicalVisit(p,evidence,{now:wrapper.leavesAt});assert.equal(p.yard.pendingGifts.length,1);assert.equal(p.yard.bowls[0].servings,6);
});

test('missing/forged hour evidence and coordinated clock jumps cannot pass cold inspection',()=>{
 const {p,evidence}=admitted(68);const early=clone(p);completeReplayedCanonicalVisit(p,evidence,{now:B});const key=hour(p).eventId;
 for(const edit of [x=>delete x._yardV2.runtime.canonicalVisitReceipts[key],x=>x._yardV2.runtime.canonicalVisitReceipts[key].reason='NO_SELECTED_CANDIDATE',
  x=>x._yardV2.runtime.canonicalVisitReceipts[key].selection=null,x=>x._yardV2.runtime.canonicalVisitReceipts[key].beforeBowl.servings++,
  x=>x._yardV2.runtime.canonicalVisitReceipts[key].foodSequence++,x=>x._yardV2.runtime.canonicalVisitReceipts[key].sourceHash='0'.repeat(64),
  x=>x._yardV2.runtime.nextOpportunityAt+=H]){const bad=clone(p);edit(bad);const before=value(bad);assert.equal(inspectReplayedCanonicalVisit(bad,evidence,{now:B}).valid,undefined);assert.deepEqual(value(bad),before);}
 early._yardV2.runtime.cursorMs=B;early.yard.lastSimulatedAt=B;early._yardV2.runtime.nextOpportunityAt=A+2*H;
 assert.equal(inspectReplayedCanonicalVisit(early,evidence,{now:B}).code,'EARLIER_OPPORTUNITY_UNRESOLVED');
});

test('exact60 departure+expiry+opportunity finishes in source order without cursor rewind',()=>{
 const {p,evidence,wrapper}=admitted(60,B),oldCursor=p._yardV2.runtime.cursorMs;
 assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:B}).state,'completed');
 assert.equal(p._yardV2.runtime.cursorMs,oldCursor);assert.equal(p._yardV2.runtime.nextOpportunityAt,B);assert.equal(p.yard.bowls[0].foodId,null);
 assert.equal(wrapper.status,CANONICAL_HELD_DEPARTURE_STATUS);assert.equal(p.yard.pendingGifts[0].createdAt,B);assert.equal(canonicalDepartureCheckpointValid(p),true);assert.equal(inspectCanonicalPlayerState(p).valid,true);
 const settled=ensureCanonicalPlayerYard(p,{now:B,simulate:true});assert.equal(settled.status,200,JSON.stringify(settled));
 assert.equal(p._yardV2.runtime.cursorMs,B);assert.equal(p._yardV2.runtime.nextOpportunityAt,A+2*H);assert.equal(p._yardV2.runtime.canonicalDepartureCheckpoint,undefined);
 assert.equal(p.yard.pendingGifts.length,1);assert.equal(p._yardV2.runtime.canonicalVisitReceipts[canonicalOpportunityEventId(p,B,row.slotId)].reason,'NO_SELECTED_CANDIDATE');
 assert.equal(wrapper.leavesAt,B);assert.equal(wrapper.status,'completed');
});

test('exact60 pending next visit survives JSON reload and commits once at the original hour',()=>{
 const {p,evidence}=admitted(60),cursors=[p._yardV2.runtime.cursorMs];completeReplayedCanonicalVisit(p,evidence,{now:B});cursors.push(p._yardV2.runtime.cursorMs);
 const staged=stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:B});assert.equal(staged.state,'pending',JSON.stringify(staged));cursors.push(p._yardV2.runtime.cursorMs);
 const cold=JSON.parse(JSON.stringify(p));assert.equal(inspectCanonicalPlayerState(cold).valid,true);
 const second=prepareCanonicalSavedVisit(cold._yardV2.runtime.canonicalPending.input);assert.equal(second.prepared,true,second.code);
 const next={state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact:second};assert.equal(commitPreparedCanonicalVisit(cold,next,{now:B+1}).state,'admitted');cursors.push(cold._yardV2.runtime.cursorMs);
 assert.ok(cursors.every((v,i)=>i===0||v>=cursors[i-1]));assert.equal(cold._yardV2.runtime.canonicalDepartureCheckpoint,undefined);
 assert.equal(cold.yard.activeVisitors.length,1);assert.equal(cold.yard.activeVisitors[0].arrivedAt,B);assert.equal(cold.yard.pendingGifts.length,1);
 assert.equal(cold.yard.bowls[0].servings,2);assert.equal(cold._yardV2.runtime.canonicalPlacements[0].uses,2);assert.equal(cold.yard.petbook.pip_hamster.visits,2);
 const before=value(cold);assert.notEqual(commitPreparedCanonicalVisit(cold,next,{now:B+1}).state,'admitted');assert.deepEqual(value(cold),before);
});

test('cold exact60 checkpoint refuses changed target lifetime and altered saved original',()=>{
 const {p,evidence}=admitted(60);completeReplayedCanonicalVisit(p,evidence,{now:B});const id=Object.keys(p._yardV2.runtime.canonicalVisits)[0];
 for(const edit of [x=>x._yardV2.runtime.canonicalPlacements[0].uses--,x=>x._yardV2.runtime.canonicalPlacements[0].x++,
  x=>x._yardV2.runtime.canonicalPlacements[0].placedAt++,x=>x._yardV2.runtime.canonicalVisits[id].original.motionSeed='forged',
  x=>x._yardV2.runtime.canonicalVisits[id].original.visitorId='mochi_bunny',x=>x._yardV2.runtime.canonicalVisits[id].original.arrivedAt++]){
  const bad=JSON.parse(JSON.stringify(p));edit(bad);const before=value(bad);
  assert.equal(canonicalDepartureCheckpointValid(bad),false);
  assert.equal(stageCanonicalVisitPreparation(bad,{slotId:row.slotId,at:B}).code,'CANONICAL_DEPARTURE_CHECKPOINT_INVALID');assert.deepEqual(value(bad),before);
 }
});

function malformedMementoStates(){
 const visitor=YARD_VISITORS.pip_hamster,valid={id:visitor.memento.id,visitorId:visitor.id,name:visitor.memento.name,receivedAt:1};
 return [
  y=>{y.petbook.pip_hamster.mementoReceived=true;delete y.mementos.pip_hamster;},
  y=>{y.petbook.pip_hamster.mementoReceived=false;y.mementos.pip_hamster=clone(valid);},
  y=>{y.petbook.pip_hamster.mementoReceived=true;y.mementos.pip_hamster={...valid,name:'forged'};},
  y=>{y.petbook.pip_hamster.mementoReceived=true;y.mementos.pip_hamster={...valid,receivedAt:B};},
  y=>{y.petbook.pip_hamster.visits=1;y.petbook.pip_hamster.mementoReceived=true;y.mementos.pip_hamster=clone(valid);},
 ];
}
test('inconsistent mementos fail before admission debit or active completion mutation',()=>{
 const {evidence}=admitted(60),visitor=YARD_VISITORS.pip_hamster;
 for(const edit of malformedMementoStates()){
  const p=configure({id:'memento-prerequisite',schemaVersion:11,_version:'initial'},60);
  p.yard.petbook.pip_hamster={visits:100,firstSeenAt:1,lastSeenAt:1,favoriteGoodies:{leaf_pot:100},mementoReceived:true};
  assert.equal(stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:A}).state,'pending');edit(p.yard);const before=value(p);
  assert.equal(commitPreparedCanonicalVisit(p,evidence,{now:A+1}).code,'COMMIT_PETBOOK_REQUIRES_REVIEW');assert.deepEqual(value(p),before);
  const active=admitted(60,4*H,{priorVisits:visitor.memento.threshold,priorMemento:true});edit(active.p.yard);const activeBefore=value(active.p);
  assert.equal(completeReplayedCanonicalVisit(active.p,active.evidence,{now:B}).code,'OUTCOME_STATE_REQUIRES_REVIEW');assert.deepEqual(value(active.p),activeBefore);
 }
});

test('held phase derives source debit and motion instead of trusting coordinated proposal changes',()=>{
 const {p,evidence}=admitted(60);completeReplayedCanonicalVisit(p,evidence,{now:B});
 const edits=[
  (x,w)=>{x._yardV2.runtime.canonicalPlacements[0].uses--;w.proposal.after.rows[0].uses--;},
  (x,w)=>{x._yardV2.runtime.canonicalPlacements[0].x++;w.proposal.after.rows[0].x++;},
  (x,w)=>{x.yard.bowls[0].servings++;w.proposal.after.bowl.servings++;},
  (x,w)=>{w.original.motionSeed='forged';w.proposal.motionSeed='forged';},
  (x,w)=>{delete x.yard.petbook.pip_hamster;},
  (x,w)=>{x.yard.petbook.pip_hamster.visits=0;},
  (x,w)=>{x.yard.petbook.pip_hamster.favoriteGoodies.leaf_pot=0;},
  (x,w)=>{x.yard.petbook.pip_hamster.firstSeenAt=A+1;},
  (x,w)=>{x.yard.petbook.pip_hamster.lastSeenAt=B;},
  (x,w)=>{x.yard.petbook.pip_hamster.mementoReceived='false';},
  (x,w)=>{x.yard.mementos=null;},
  (x,w)=>{delete x._yardV2.runtime.giftLedger[w.giftId].gift.mementoId;delete x.yard.pendingGifts[0].mementoId;},
  (x,w)=>{x._yardV2.runtime.giftLedger[w.giftId].gift.mementoId='forged';x.yard.pendingGifts[0].mementoId='forged';},
  (x,w)=>{x.yard.pendingGifts.push(clone(x.yard.pendingGifts[0]));},
 ];
 for(const edit of edits){
  const bad=JSON.parse(JSON.stringify(p)),w=Object.values(bad._yardV2.runtime.canonicalVisits)[0];edit(bad,w);const before=value(bad);
  assert.equal(canonicalDepartureCheckpointValid(bad),false);assert.equal(inspectCanonicalPlayerState(bad).code,'CANONICAL_DEPARTURE_CHECKPOINT_INVALID');
  assert.equal(stageCanonicalVisitPreparation(bad,{slotId:row.slotId,at:B}).code,'CANONICAL_DEPARTURE_CHECKPOINT_INVALID');assert.deepEqual(value(bad),before);
 }
});

test('held phase derives final-serving depletion and still validates a later source refill',()=>{
 for(const refill of [false,true]){
  const {p,evidence}=admitted(60,4*H,{servings:1});assert.equal(p.yard.bowls[0].foodId,null);
  if(refill){completeReplayedCanonicalVisit(p,evidence,{now:B-1});p.yard.foodInventory.kibble=1;
   const result=applyCanonicalFoodActionAtCursor(p,'yard.setFood',{foodId:'kibble',bowlId:'bowl-1'},{actionId:'yard-v2:held-refill',now:B-1,replayedRecord:evidence.artifact.record});
   assert.equal(result.status,200,result.error);p.yard=result.yard;p._yardV2.runtime=result.runtime;}
  assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:B}).state,'completed');assert.equal(canonicalDepartureCheckpointValid(p),true);
  assert.equal(p.yard.bowls[0].servings,refill?4:0);
  const bad=clone(p),w=Object.values(bad._yardV2.runtime.canonicalVisits)[0];w.proposal.after.bowl.foodId='kibble';w.proposal.after.bowl.servings=1;
  assert.equal(canonicalDepartureCheckpointValid(bad),false);
 }
});

test('held phase preserves source-earned and previously earned mementos with exact gift shape',()=>{
 const visitor=YARD_VISITORS.pip_hamster;
 for(const priorMemento of [false,true]){
  const priorVisits=visitor.memento.threshold-(priorMemento?0:1),{p,evidence}=admitted(60,4*H,{priorVisits,priorMemento});
  assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:B}).state,'completed');assert.equal(canonicalDepartureCheckpointValid(p),true);
  const w=Object.values(p._yardV2.runtime.canonicalVisits)[0],gift=p._yardV2.runtime.giftLedger[w.giftId].gift;
  assert.equal(gift.mementoId,priorMemento?null:visitor.memento.id);
  for(const edit of [x=>x.yard.petbook.pip_hamster.mementoReceived=false,x=>delete x.yard.mementos.pip_hamster,
   x=>x.yard.mementos.pip_hamster.name='forged',x=>x.yard.mementos.pip_hamster.receivedAt=B-1,
   x=>{x._yardV2.runtime.giftLedger[w.giftId].gift.mementoId=priorMemento?visitor.memento.id:null;x.yard.pendingGifts[0].mementoId=priorMemento?visitor.memento.id:null;}]){
   const bad=clone(p);edit(bad);assert.equal(canonicalDepartureCheckpointValid(bad),false);
  }
 }
});

test('departure checkpoint corruption is read-only and cannot unlock a same-hour admission',()=>{
 const {p,evidence}=admitted(60);completeReplayedCanonicalVisit(p,evidence,{now:B});const w=Object.values(p._yardV2.runtime.canonicalVisits)[0];
 for(const edit of [x=>delete x._yardV2.runtime.canonicalDepartureCheckpoint,x=>x._yardV2.runtime.canonicalDepartureCheckpoint.at++,
  x=>x._yardV2.runtime.canonicalDepartureCheckpoint.format='unknown',x=>x._yardV2.runtime.canonicalVisits[w.visitId].status='completed',x=>x._yardV2.runtime.canonicalVisitReceipts[w.eventId].completedAt--,
  x=>x._yardV2.runtime.giftLedger[w.giftId].gift.treats++,x=>x.yard.pendingGifts=[],x=>x.yard.bowls[0].servings++]){
  const bad=clone(p);edit(bad);const before=value(bad);assert.equal(canonicalDepartureCheckpointValid(bad),false);
  assert.equal(stageCanonicalVisitPreparation(bad,{slotId:row.slotId,at:B}).code,'CANONICAL_DEPARTURE_CHECKPOINT_INVALID');assert.deepEqual(value(bad),before);
 }
});

async function waitFor(fn,ms=40000){const end=performance.now()+ms;while(performance.now()<end){const found=fn();if(found)return found;await delay(20);}throw Error('WORKER_TIMEOUT');}
test('real worker replay remains outside locks and cold hour60 recovery preserves unique 110m actor',async t=>{
 assert.equal(getDb(),null);const originalNow=Date.now;let now=A+1;Date.now=()=>now;
 let service;const observations=[];t.after(async()=>{if(service)await service.close();await closeCanonicalRuntime();Date.now=originalNow;});
 service=createCanonicalVisitReconciler({onObservation:r=>observations.push(r)});const owner='unique-full-range-worker';
 await withPlayerLock(owner,p=>configure(p,110));
 await withPlayerLock(owner,p=>{assert.equal(stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:A}).state,'pending');service.register(p);});
 await waitFor(()=>observations.some(r=>r.state==='active'||r.state==='unavailable'));
 assert.ok(observations.some(r=>r.state==='active'),JSON.stringify(observations));now=B;
 await withPlayerLock(owner,p=>{assert.equal(service.advance(p,{now}).state,'active');assert.equal(hour(p).reason,'TARGET_CAPACITY_RESERVED');});
 await service.close();observations.length=0;service=createCanonicalVisitReconciler({onObservation:r=>observations.push(r)});
 await withPlayerLock(owner,p=>assert.equal(service.read(p,{now}).reason,'SOURCE_REPLAY_REQUIRED'));
 await service.recover(owner);await waitFor(()=>observations.some(r=>r.state==='active'||r.state==='unavailable'));
 assert.ok(observations.some(r=>r.state==='active'),JSON.stringify(observations));
 await withPlayerLock(owner,p=>{assert.equal(service.read(p,{now}).state,'active');assert.equal(p.yard.activeVisitors.length,1);assert.equal(p.yard.bowls[0].servings,3);});
 now=A+110*60000;await withPlayerLock(owner,p=>{assert.equal(service.advance(p,{now}).state,'completed');assert.equal(p.yard.pendingGifts.length,1);assert.equal(p.yard.pendingGifts[0].createdAt,now);assert.equal(p._yardV2.runtime.nextOpportunityAt,A+2*H);});
 assert.equal(CANONICAL_MAX_VISIT_STAY_MS,110*60000);
});


test('normal runtime exact60 checkpoint and pending opportunity recover through real cold workers',async t=>{
 const originalNow=Date.now;let now=A+1;Date.now=()=>now;t.after(async()=>{await closeCanonicalRuntime();Date.now=originalNow;});
 const owner='unique-sixty-cold-boundary';await withPlayerLock(owner,p=>configure(p,60));
 async function readyAfter(arrivedAt){const end=performance.now()+40000;while(performance.now()<end){let result;await withPlayerLock(owner,p=>{
  assert.equal(ensureCanonicalPlayerYard(p,{now,simulate:true}).status,200);result=publicCanonicalPlayerYard(p,{now});
 });if(result.status==='ready'&&result.canonicalVisits?.some(v=>v.plan.arrivedAt===arrivedAt))return result;await delay(20);}throw Error('EXACT60_COLD_TIMEOUT');}
 await readyAfter(A);now=B;
 await withPlayerLock(owner,p=>{
  const result=ensureCanonicalPlayerYard(p,{now,simulate:true});assert.equal(result.status,200,JSON.stringify(result));
  assert.equal(p.yard.activeVisitors.length,0);assert.equal(p.yard.pendingGifts.length,1);assert.equal(p.yard.pendingGifts[0].createdAt,B);
  assert.equal(p._yardV2.runtime.canonicalPending.at,B);assert.equal(p._yardV2.runtime.canonicalDepartureCheckpoint.at,B);
  assert.ok(p._yardV2.runtime.cursorMs<B);assert.equal(p._yardV2.runtime.nextOpportunityAt,B);
 });
 await closeCanonicalRuntime();await readyAfter(B);
 await withPlayerLock(owner,p=>{
  assert.equal(p.yard.activeVisitors.length,1);assert.equal(p.yard.activeVisitors[0].arrivedAt,B);
  assert.equal(p.yard.pendingGifts.length,1);assert.equal(p.yard.bowls[0].servings,2);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,2);
  assert.equal(p.yard.petbook.pip_hamster.visits,2);assert.equal(p._yardV2.runtime.canonicalDepartureCheckpoint,undefined);assert.equal(p._yardV2.runtime.cursorMs,B);
 });
});
