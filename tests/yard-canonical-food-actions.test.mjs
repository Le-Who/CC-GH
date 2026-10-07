import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {probeCanonicalFoodAction as probe,applyCanonicalFoodActionAtCursor as apply,inspectCanonicalBowlAfterActions as inspect} from '../game-logic/yard-v2/canonical-food-actions.mjs';
import {prepareCanonicalSavedVisit} from '../game-logic/yard-v2/canonical-saved-visit-bridge.mjs';
import {inspectReplayedCanonicalVisit} from '../game-logic/yard-v2/canonical-visit-transaction.mjs';
import {VISIT_JOB_SOURCE_HASH} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from '../game-logic/yard-v2/canonical-food-protocol.mjs';
import {YARD_FOODS} from '../game-logic/yard-v2/catalog.mjs';
import {digest,clone} from '../game-logic/yard-v2/util.mjs';
import {hexToBase64url} from '../game-logic/yard-v2/sha256.mjs';
const saved=JSON.parse(fs.readFileSync(new URL('./fixtures/canonical-food-qualified-player.json',import.meta.url)));
const savedRecord=Object.values(saved._yardV2.runtime.canonicalVisits)[0].proposal;
const replay=prepareCanonicalSavedVisit({candidate:savedRecord.candidate,rows:savedRecord.before.rows,bowl:savedRecord.before.bowl});
assert.equal(replay.prepared,true,replay.code);assert.deepEqual(replay.record,savedRecord);
const record=replay.record;
const wrapper=p=>Object.values(p._yardV2.runtime.canonicalVisits)[0];
function player(){const p=clone(saved);p._yardV2.runtime.canonicalRevision='food-fixture';
 wrapper(p).sourceHash=VISIT_JOB_SOURCE_HASH;p._yardV2.runtime.canonicalVisitReceipts[wrapper(p).eventId].sourceHash=VISIT_JOB_SOURCE_HASH;
 p.yard.currencies={treats:1000,shinyTreats:10};p.yard.foodInventory={kibble:3,berry_plate:3,bonito_bowl:3};
 p.unrelated={wallet:987,opaque:{preserve:true}};p._yardV2.futureMetadata={retain:true};return p;}
const options=(p,actionId='yard-v2:food-test',now=p._yardV2.runtime.cursorMs)=>({actionId,now,replayedRecord:record});
function commit(p,result){assert.equal(result.status,200,result.error);assert.ok(result.yard);p.yard=result.yard;p._yardV2.runtime=result.runtime;}
const bowlCheck=p=>inspect({wrapper:wrapper(p),record,commandReceipts:p._yardV2.runtime.commandReceipts,bowl:p.yard.bowls[0],cursorMs:p._yardV2.runtime.cursorMs});
const noState=result=>{assert.equal(Object.hasOwn(result,'receipt'),false);assert.equal(Object.hasOwn(result,'yard'),false);assert.equal(Object.hasOwn(result,'runtime'),false);};

test('source-qualified active fixture retains the old exact-bowl corruption guard',()=>{
 assert.equal(inspect(null).valid,false);assert.equal(inspect().valid,false);
 const p=player(),evidence={state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact:replay};
 assert.equal(inspectReplayedCanonicalVisit(p,evidence,{now:1001}).valid,true);
 assert.equal(bowlCheck(p).valid,true);
 for(const patch of [{servings:4},{foodId:'berry_plate'},{placedAt:2},{expiresAt:7200001},{extra:'invented'}]){
  const altered=clone(p);Object.assign(altered.yard.bowls[0],patch);
  assert.equal(bowlCheck(altered).code,'SAVED_ECONOMY_MISMATCH');
  assert.equal(inspectReplayedCanonicalVisit(altered,evidence,{now:1001}).code,'SAVED_ECONOMY_MISMATCH');
 }
});

test('new ordinary and scoped food probes remain isolated, pending and receipt-free',()=>{
 for(const action of ['yard.buyFood','yard.setFood'])for(const scoped of [false,true]){
  const p=player();p._yardV2.runtime.canonicalPending={unresolved:true};const before=clone(p);
  const payload={foodId:'berry_plate',...(scoped?CANONICAL_FOOD_LOCATION:{})};
  const result=probe(p,action,payload,options(p,scoped?CANONICAL_FOOD_NONCE_PREFIX+'probe':'yard-v2:probe',2000));
  assert.equal(result.needsReconciliation,true);noState(result);assert.deepEqual(p,before);
 }
});

test('exact successful nonce replay precedes time advance or unresolved source state',()=>{
 const p=player(),payload={foodId:'berry_plate',qty:2},id='yard-v2:buy-replay';commit(p,apply(p,'yard.buyFood',payload,options(p,id)));
 const expected=clone(p._yardV2.runtime.commandReceipts[id]);p._yardV2.runtime.canonicalPending={unresolved:true};const before=clone(p);
 for(const fn of [probe,apply])for(const now of [-1,10000000]){
  const result=fn(p,'yard.buyFood',payload,options(p,id,now));assert.equal(result.replayed,true);assert.deepEqual(result.receipt,expected);
  assert.equal(Object.hasOwn(result,'yard'),false);assert.deepEqual(p,before);
 }
 const conflict=probe(p,'yard.buyFood',{foodId:'berry_plate',qty:1},options(p,id,10000000));
 assert.equal(conflict.error,'ACTION_ID_PAYLOAD_CONFLICT');noState(conflict);assert.deepEqual(p,before);
});

test('new actions cannot receipt a failure while canonical work or clock advancement is unresolved',()=>{
 for(const change of [p=>p._yardV2.runtime.canonicalPending={},p=>p._yardV2.runtime.cursorMs=1000,
  p=>p._yardV2.runtime.nextOpportunityAt=1001,p=>p.yard.bowls[0].expiresAt=1001]){
  const p=player();change(p);const before=clone(p),result=apply(p,'yard.setFood',{foodId:'berry_plate'},options(p,'yard-v2:pending',1001));
  assert.equal(result.retryable,true,JSON.stringify(result));noState(result);assert.deepEqual(p,before);
 }
});

test('buyFood delegates exact source currency prices, source quantity clamp and stock without changing wear',()=>{
 for(const foodId of Object.keys(YARD_FOODS))for(const [qty,expectedQty]of [[undefined,1],[2,2],[100,9],[-1,1],[2.9,2]]){
  const p=player();p.yard.currencies={treats:10000,shinyTreats:100};const before=clone(p),payload={foodId,...(qty===undefined?{}:{qty})},result=apply(p,'yard.buyFood',payload,options(p));
  assert.equal(result.status,200,result.error);assert.equal(result.extras.qty,expectedQty);
  for(const currency of ['treats','shinyTreats'])assert.equal(result.yard.currencies[currency],before.yard.currencies[currency]-(YARD_FOODS[foodId].cost[currency]||0)*expectedQty);
  assert.equal(result.yard.foodInventory[foodId],before.yard.foodInventory[foodId]+expectedQty);
  assert.deepEqual(result.runtime.canonicalPlacements,before._yardV2.runtime.canonicalPlacements);assert.equal(result.runtime.canonicalPlacements[0].uses,1);
  assert.deepEqual(p,before);assert.equal(Object.hasOwn(result.runtime,'migrationIssues'),false);assert.equal(Object.hasOwn(result.runtime,'actionReceipts'),false);
 }
});

test('setFood delegates one-unit debit and catalog servings/expiry, preserving active Pip and source proposal',()=>{
 for(const foodId of Object.keys(YARD_FOODS)){
  const p=player(),before=clone(p),id='yard-v2:set-'+foodId,payload={foodId,bowlId:'bowl-1'};
  const result=apply(p,'yard.setFood',payload,options(p,id));assert.equal(result.status,200,result.error);assert.deepEqual(p,before);
  assert.equal(result.yard.foodInventory[foodId],before.yard.foodInventory[foodId]-1);
  assert.deepEqual(result.yard.currencies,before.yard.currencies);assert.deepEqual(result.yard.activeVisitors,before.yard.activeVisitors);
  assert.deepEqual(result.yard.bowls[0],{id:'bowl-1',foodId,servings:YARD_FOODS[foodId].servings,placedAt:1001,expiresAt:1001+YARD_FOODS[foodId].durationMs});
  commit(p,result);assert.equal(bowlCheck(p).valid,true);assert.equal(wrapper(p).lastFoodActionId,id);assert.equal(wrapper(p).foodActionSequence,1);
  assert.deepEqual(wrapper(p).proposal,record);assert.equal(wrapper(p).leavesAt,2701000);assert.deepEqual(p.unrelated,before.unrelated);assert.deepEqual(p._yardV2.futureMetadata,before._yardV2.futureMetadata);
 }
});

test('same-time food replacements are ordered by latest receipt pointer and replay never increments it',()=>{
 const p=player();commit(p,apply(p,'yard.setFood',{foodId:'berry_plate'},options(p,'yard-v2:first')));
 commit(p,apply(p,'yard.setFood',{foodId:'bonito_bowl'},options(p,'yard-v2:second')));
 assert.equal(p.yard.bowls[0].foodId,'bonito_bowl');assert.equal(wrapper(p).foodActionSequence,2);assert.equal(wrapper(p).lastFoodActionId,'yard-v2:second');assert.equal(bowlCheck(p).valid,true);
 const before=clone(p),retry=apply(p,'yard.setFood',{foodId:'berry_plate'},options(p,'yard-v2:first',9999999));
 assert.equal(retry.replayed,true);assert.deepEqual(p,before);
 const stale=clone(p);wrapper(stale).lastFoodActionId='yard-v2:first';assert.equal(bowlCheck(stale).valid,false);
});

test('same-food same-time pointer/count rollback cannot hide retained genuine replacements',()=>{
 const p=player(),food={foodId:'kibble'};
 commit(p,apply(p,'yard.setFood',food,options(p,'yard-v2:same-first')));const firstBowl=clone(p.yard.bowls[0]);
 commit(p,apply(p,'yard.setFood',food,options(p,'yard-v2:same-second')));
 assert.deepEqual(p.yard.bowls[0],firstBowl,'the bowl alone cannot expose this rollback');
 assert.equal(bowlCheck(p).valid,true);
 wrapper(p).lastFoodActionId='yard-v2:same-first';wrapper(p).foodActionSequence=1;
 const before=clone(p);assert.equal(bowlCheck(p).valid,false,'both genuine receipts must establish the latest sequence');
 const third=apply(p,'yard.setFood',food,options(p,'yard-v2:same-third'));
 assert.equal(third.status,409);noState(third);assert.deepEqual(p,before);
 assert.equal(Object.hasOwn(p._yardV2.runtime.commandReceipts,'yard-v2:same-third'),false);
});

test('retained replacement evidence rejects duplicates, gaps, time reversal and missing latest pointers',()=>{
 const source=player(),food={foodId:'kibble'};
 commit(source,apply(source,'yard.setFood',food,options(source,'yard-v2:chain-first')));
 commit(source,apply(source,'yard.setFood',food,options(source,'yard-v2:chain-second')));
 for(const change of [
  p=>p._yardV2.runtime.commandReceipts['yard-v2:chain-second'].canonicalFood.sequence=1,
  p=>delete p._yardV2.runtime.commandReceipts['yard-v2:chain-first'],
  p=>{p._yardV2.runtime.commandReceipts['yard-v2:chain-second'].canonicalFood.sequence=3;wrapper(p).foodActionSequence=3;},
  p=>{delete wrapper(p).lastFoodActionId;delete wrapper(p).foodActionSequence;p.yard.bowls[0]=clone(record.after.bowl);},
  p=>{p._yardV2.runtime.cursorMs=1002;p._yardV2.runtime.commandReceipts['yard-v2:chain-first'].at=1002;},
  p=>p._yardV2.runtime.commandReceipts['yard-v2:chain-first'].canonicalFood.eventId='other-event',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:chain-first'].canonicalFood.visitId='other-visit',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:chain-first'].canonicalFood.payload.foodId='berry_plate',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:chain-first'].status=400,
  p=>p._yardV2.runtime.commandReceipts['yard-v2:chain-first'].canonicalFood.format='future/v99',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:chain-first'].format='future-receipt/v99',
 ]){
  const p=clone(source);change(p);const before=clone(p);
  assert.equal(bowlCheck(p).valid,false);
  const result=apply(p,'yard.setFood',food,options(p,'yard-v2:after-invalid-sequence'));
  assert.equal(result.status,409);noState(result);assert.deepEqual(p,before);
 }
 // Other visits and ordinary purchases do not belong to this visit's sequence.
 const unrelated=clone(source._yardV2.runtime.commandReceipts['yard-v2:chain-first']);
 unrelated.actionId='yard-v2:other-visit';unrelated.canonicalFood.visitId='other-visit';unrelated.canonicalFood.eventId='other-event';
 source._yardV2.runtime.commandReceipts[unrelated.actionId]=unrelated;
 assert.equal(bowlCheck(source).valid,true);
 commit(source,apply(source,'yard.buyFood',{foodId:'kibble'},options(source,'yard-v2:interleaved-buy')));
 commit(source,apply(source,'yard.setFood',food,options(source,'yard-v2:chain-third')));
 assert.equal(wrapper(source).foodActionSequence,3);assert.equal(bowlCheck(source).valid,true);
});

test('latest replacement derives exact source expiry and refuses unprocessed expiration or stale fields',()=>{
 const p=player();commit(p,apply(p,'yard.setFood',{foodId:'kibble'},options(p)));const expiry=p.yard.bowls[0].expiresAt;
 p._yardV2.runtime.cursorMs=expiry-1;assert.equal(bowlCheck(p).valid,true);
 p._yardV2.runtime.cursorMs=expiry;assert.equal(bowlCheck(p).code,'SAVED_ECONOMY_MISMATCH');
 Object.assign(p.yard.bowls[0],{foodId:null,servings:0,placedAt:null,expiresAt:null});assert.equal(bowlCheck(p).valid,true);
 // The derived checker can verify a processed bowl independently. The active
 // command adapter still refuses a visit whose exact departure is unresolved.
 const result=apply(p,'yard.buyFood',{foodId:'kibble'},options(p,'yard-v2:after-expiry'));assert.equal(result.retryable,true);noState(result);
});

test('bad pointer, receipt, exact payload, sequence, bowl, and timestamps fail closed',()=>{
 const source=player();commit(source,apply(source,'yard.setFood',{foodId:'berry_plate',bowlId:'bowl-1',clientTag:'retained'},options(source,'yard-v2:proof')));
 for(const change of [p=>wrapper(p).lastFoodActionId='yard-v2:absent',p=>delete wrapper(p).foodActionSequence,p=>wrapper(p).foodActionSequence=0,
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].status=400,p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].action='yard.buyFood',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].at=999,p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].at=1002,
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].at=2701000,p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].at=1.5,
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].requestHash='0'.repeat(64),
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].extras.bowlId='bowl-2',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].canonicalFood.payload.clientTag='tampered',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].canonicalFood.eventId='another',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].canonicalFood.visitId='another',
  p=>p._yardV2.runtime.commandReceipts['yard-v2:proof'].canonicalFood.format='future/v2',
  p=>p.yard.bowls[0].servings--,p=>p.yard.bowls[0].expiresAt++,p=>p.yard.bowls[0].arbitrary='new']){
  const p=clone(source);change(p);assert.equal(bowlCheck(p).valid,false);
  const before=clone(p),result=apply(p,'yard.buyFood',{foodId:'kibble'},options(p,'yard-v2:new'));assert.equal(result.status,409);noState(result);assert.deepEqual(p,before);
 }
});

test('definitive source failures receive their normal receipt only after reconciliation',()=>{
 for(const [action,payload,error]of [['yard.buyFood',{foodId:'missing'},'unknown food'],['yard.buyFood',{foodId:'berry_plate',qty:9},'not enough yard currency'],['yard.setFood',{foodId:'missing'},'unknown food'],['yard.setFood',{foodId:'kibble',bowlId:'bowl-2'},'unknown bowl']]){
  const p=player(),result=apply(p,action,payload,options(p));assert.equal(result.status,400);assert.equal(result.error,error);assert.equal(result.receipt.status,400);
  p.yard=result.yard;p._yardV2.runtime=result.runtime;p._yardV2.runtime.canonicalPending={};
  const retry=probe(p,action,payload,options(p,'yard-v2:food-test',9999999));assert.equal(retry.replayed,true);assert.equal(retry.error,error);
 }
});

test('unowned food cannot manufacture a replacement pointer or mutate source proposal',()=>{
 const p=player();p.yard.foodInventory.berry_plate=0;const before=clone(p),result=apply(p,'yard.setFood',{foodId:'berry_plate'},options(p));
 assert.equal(result.status,400);assert.equal(result.error,'food not owned');assert.equal(Object.hasOwn(Object.values(result.runtime.canonicalVisits)[0],'lastFoodActionId'),false);
 assert.deepEqual(p,before);assert.deepEqual(result.yard,before.yard);
});

test('new canonical-scoped food intents are not silently rewritten and never mutate or receipt',()=>{
 for(const payload of [{foodId:'kibble',...CANONICAL_FOOD_LOCATION},{foodId:'kibble'}]){
  const p=player(),before=clone(p),result=apply(p,'yard.setFood',payload,options(p,CANONICAL_FOOD_NONCE_PREFIX+'food'));
  assert.equal(result.error,'CANONICAL_ACTION_UNSUPPORTED');noState(result);assert.deepEqual(p,before);
 }
});

test('historical scoped receipt and legacy receipt replay preserve original conflict semantics',()=>{
 const p=player(),payload={foodId:'kibble',...CANONICAL_FOOD_LOCATION},id=CANONICAL_FOOD_NONCE_PREFIX+'historic';
 p._yardV2.runtime.commandReceipts[id]={format:'yard-action-receipt/v1',actionId:id,action:'yard.setFood',requestHash:digest({action:'yard.setFood',payload}),at:1000,status:400,error:'historic refusal'};
 assert.equal(probe(p,'yard.setFood',payload,options(p,id,-1)).replayed,true);
 assert.equal(apply(p,'yard.setFood',{...payload,foodId:'berry_plate'},options(p,id,-1)).error,'ACTION_ID_PAYLOAD_CONFLICT');
 const oldId='old-nonce',oldPayload={foodId:'berry_plate',qty:1};
 p._actionReceipts={items:[{clientActionId:oldId,action:'yard.buyFood',payloadHash:hexToBase64url(digest({action:'yard.buyFood',payload:oldPayload})),extras:{foodId:'berry_plate',qty:1}}]};
 assert.equal(probe(p,'yard.buyFood',oldPayload,options(p,oldId,-1)).legacyReplay,true);
 assert.equal(probe(p,'yard.buyFood',{...oldPayload,qty:2},options(p,oldId,-1)).error,'LEGACY_ACTION_ID_PAYLOAD_CONFLICT');
});

test('no legacy migration, no wear reset, no unsupported action, no active action without source record',()=>{
 for(const change of [p=>p._yardV2.version=2,p=>p._yardV2.version=999,p=>p._yardV2.runtime.migrationIssues=[{code:'preserve-review'}],p=>p.yard.foodInventory.kibble=-1]){
  const p=player();change(p);const before=clone(p),r=apply(p,'yard.buyFood',{foodId:'kibble'},options(p));assert.equal(r.status,409);noState(r);assert.deepEqual(p,before);
 }
 const p=player(),before=clone(p);assert.equal(apply(p,'yard.collectGifts',{},options(p)).error,'CANONICAL_FOOD_ACTION_UNSUPPORTED');
 assert.equal(apply(p,'yard.setFood',{foodId:'kibble'},{actionId:'yard-v2:missing-replay',now:1001}).status,409);assert.deepEqual(p,before);
});


test('no-active-visit v3 food actions reuse source without manufacturing migration or visit evidence',()=>{
 const p=player();p._yardV2.runtime.canonicalVisits={};p.yard.activeVisitors=[];
 const originalStore=clone(p._yardV2),result=apply(p,'yard.setFood',{foodId:'berry_plate'},{actionId:'yard-v2:idle-fill',now:1001});
 assert.equal(result.status,200);assert.deepEqual(result.runtime.canonicalVisits,{});
 assert.equal(Object.hasOwn(result.receipt,'canonicalFood'),false);assert.deepEqual(p._yardV2,originalStore);
 assert.equal(Object.hasOwn(result.runtime,'migrationIssues'),false);assert.equal(Object.hasOwn(result.runtime,'actionReceipts'),false);
});

test('source reuse stays pure and validates its generated bowl evidence',t=>{
 const p=player(),before=clone(p),start=performance.now();const result=apply(p,'yard.setFood',{foodId:'berry_plate'},options(p));
 assert.equal(result.status,200);assert.deepEqual(p,before);commit(p,result);assert.equal(bowlCheck(p).valid,true);
 t.diagnostic(JSON.stringify({elapsedMs:performance.now()-start,originalUses:p._yardV2.runtime.canonicalPlacements[0].uses,sourceReplayHash:record.recordHash}));
});
