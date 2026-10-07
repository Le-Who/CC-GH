import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDefaultPlayer} from '../game-logic.js';
import {fixture} from './fixtures/canonical-reconciliation-fixture.mjs';
import {VISIT_JOB_SOURCE_HASH} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {commitPreparedCanonicalVisit,completeReplayedCanonicalVisit} from '../game-logic/yard-v2/canonical-visit-transaction.mjs';
const sample=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('./fixtures/canonical-visit-record-45m.json')),'utf8'));
function admitted({expiresAt,uncommitted=false}={}){
 const p=createDefaultPlayer('transaction-unit','Unit');p._version='unit-version';fixture(p);
 const r=structuredClone(sample);
 if(expiresAt){r.before.bowl.expiresAt=expiresAt;r.after.bowl.expiresAt=expiresAt;p.yard.bowls[0].expiresAt=expiresAt;}
 p._yardV2.runtime.canonicalPending={eventId:'unit-event',input:{candidate:r.candidate,rows:r.before.rows,bowl:r.before.bowl}};
 const evidence={state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact:{record:r,plan:{}}};
 if(uncommitted)return {p,evidence};
 assert.equal(commitPreparedCanonicalVisit(p,evidence,{now:1001}).state,'admitted');
 return {p,evidence,wrapper:Object.values(p._yardV2.runtime.canonicalVisits)[0]};
}
for(const [name,mutate] of [
 ['both saved original copies changed',({p,wrapper})=>{wrapper.original.arrivedAt=999999999;wrapper.original.leavesAt=999999999;wrapper.original.motionSeed='wrong';Object.assign(p.yard.activeVisitors[0],wrapper.original);}],
 ['arbitrary receipt',({p})=>{p._yardV2.runtime.canonicalVisitReceipts['unit-event']={arbitrary:true};}],
 ['missing receipt',({p})=>{delete p._yardV2.runtime.canonicalVisitReceipts['unit-event'];}],
 ['negative current servings',({p})=>{p.yard.bowls[0].servings=-1;}],
 ['missing petbook increment',({p})=>{p.yard.petbook.pip_hamster.visits=0;}],
 ['missing favorite counter',({p})=>{p.yard.petbook.pip_hamster.favoriteGoodies={};}],
 ['preexisting gift',({p,wrapper})=>{p.yard.pendingGifts.push({id:wrapper.giftId});}],
])test(name+' refuses both active readiness and reward without mutation',()=>{
 const item=admitted();mutate(item);const before=structuredClone(item.p);
 assert.equal(completeReplayedCanonicalVisit(item.p,item.evidence,{now:1002}).ready,false);
 assert.deepEqual(item.p,before);
 assert.equal(completeReplayedCanonicalVisit(item.p,item.evidence,{now:sample.candidate.leavesAt}).ready,false);
 assert.deepEqual(item.p,before);
});
for(const expiresAt of [5000,sample.candidate.leavesAt])test('food expiry at '+expiresAt+' is processed by exact departure without extra consumption',()=>{
 const {p,evidence,wrapper}=admitted({expiresAt});
 if(expiresAt<sample.candidate.leavesAt){
  assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:expiresAt}).state,'active');
  assert.deepEqual(p.yard.bowls[0],{...sample.after.bowl,foodId:null,servings:0,placedAt:null,expiresAt:null});
 }
 assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:wrapper.leavesAt}).state,'completed');
 assert.equal(p.yard.bowls[0].foodId,null);assert.equal(p.yard.bowls[0].servings,0);
 assert.equal(p.yard.pendingGifts.at(-1).createdAt,wrapper.leavesAt);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);
});
test('an earlier unprocessed opportunity blocks completion unchanged',()=>{
 const {p,evidence,wrapper}=admitted();p._yardV2.runtime.nextOpportunityAt=wrapper.leavesAt;const before=structuredClone(p);
 assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:wrapper.leavesAt}).code,'EARLIER_OPPORTUNITY_UNRESOLVED');assert.deepEqual(p,before);
});
test('unknown legacy reservation status blocks commit unchanged',()=>{
 const {p,evidence}=admitted();const runtime=p._yardV2.runtime;
 runtime.canonicalPending={eventId:'other',input:{candidate:sample.candidate,rows:sample.before.rows,bowl:sample.before.bowl}};
 runtime.canonicalVisits={};runtime.canonicalVisitReceipts={};runtime.canonicalPlacements=structuredClone(sample.before.rows);runtime.cursorMs=999;runtime.nextOpportunityAt=1000;
 p.yard.bowls=[structuredClone(sample.before.bowl)];p.yard.activeVisitors=[];runtime.visits={future:{status:'future-active'}};const before=structuredClone(p);
 assert.equal(commitPreparedCanonicalVisit(p,evidence,{now:1001}).code,'COMMIT_RESERVATION_UNAVAILABLE');assert.deepEqual(p,before);
});

for(const [name,mutate] of [
 ['negative old favorite',({p})=>{p.yard.petbook.pip_hamster={visits:1,firstSeenAt:1,lastSeenAt:1,favoriteGoodies:{leaf_pot:-1},mementoReceived:false};}],
 ['missing old memento flag',({p})=>{p.yard.petbook.pip_hamster={visits:1,firstSeenAt:1,lastSeenAt:1,favoriteGoodies:{leaf_pot:1}};}],
 ['null pending gift',({p})=>{p.yard.pendingGifts=[null];}],
 ['preexisting candidate pending gift',({p,evidence})=>{p.yard.pendingGifts=[{id:evidence.artifact.record.economicIntent.giftId,treats:1,shinyTreats:0,createdAt:1}];}],
 ['preexisting candidate ledger gift',({p,evidence})=>{p._yardV2.runtime.giftLedger[evidence.artifact.record.economicIntent.giftId]={status:'earned'};}],
])test(name+' cannot produce an unreplayable admission or debit',()=>{
 const item=admitted({uncommitted:true});mutate(item);const before=structuredClone(item.p);
 assert.equal(commitPreparedCanonicalVisit(item.p,item.evidence,{now:1001}).ready,false);assert.deepEqual(item.p,before);
});
for(const mutate of [p=>p._yardV2.runtime.cursorMs=999,p=>p._yardV2.runtime.nextOpportunityAt+=3600000])test('corrupt active event clock refuses readiness',()=>{
 const {p,evidence}=admitted();mutate(p);const before=structuredClone(p);
 assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:1001}).ready,false);assert.deepEqual(p,before);
});
