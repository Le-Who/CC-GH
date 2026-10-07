import {withPlayerLock} from '../playerManager.js';
import {fixture} from './fixtures/canonical-reconciliation-fixture.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultYardState} from '../game-logic/yard.js';
import {ensureCanonicalPlayerYard,executeCanonicalYardAction,publicCanonicalPlayerYard,closeCanonicalRuntime} from '../game-logic/yard-v2/canonical-runtime.mjs';
import {applyCanonicalFoodActionAtCursor} from '../game-logic/yard-v2/canonical-food-actions.mjs';
import {createFreshCanonicalYard} from '../game-logic/yard-v2/canonical-new-yard.mjs';
import {probeCanonicalFoodAction} from '../game-logic/yard-v2/canonical-food-actions.mjs';
import {inspectCanonicalGiftClaims} from '../game-logic/yard-v2/canonical-gift-claims.mjs';
import {stageCanonicalVisitPreparation} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
import {prepareCanonicalSavedVisit} from '../game-logic/yard-v2/canonical-saved-visit-bridge.mjs';
import {commitPreparedCanonicalVisit,completeReplayedCanonicalVisit,inspectReplayedCanonicalVisit} from '../game-logic/yard-v2/canonical-visit-transaction.mjs';
import {VISIT_JOB_SOURCE_HASH} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {YARD_GOODIES,YARD_FOODS} from '../game-logic/yard-v2/catalog.mjs';
const A=1000,H=3600000;
const copy=structuredClone;
const row={slotId:'canonical:a',goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x:98,y:118,condition:'new',uses:0,placedAt:1};
const artifacts=new Map();
function admitted(minutes=45){
 const p=empty();Object.assign(p._yardV2.runtime,{seed:minutes===60?'long-stay:1703':'durable:1277',cursorMs:A-1,nextOpportunityAt:A,canonicalPlacements:[copy(row)]});
 p.yard.bowls=[{id:'bowl-1',foodId:'kibble',servings:4,placedAt:1,expiresAt:4*H}];
 assert.equal(stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:A}).state,'pending');
 if(!artifacts.has(minutes))artifacts.set(minutes,prepareCanonicalSavedVisit(p._yardV2.runtime.canonicalPending.input));
 const prepared=artifacts.get(minutes);assert.equal(prepared.prepared,true,prepared.code);
 const evidence={state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact:prepared};
 assert.equal(commitPreparedCanonicalVisit(p,evidence,{now:A}).state,'admitted');return {p,evidence,leavesAt:prepared.record.candidate.leavesAt};
}
function completed(){const result=admitted();assert.equal(completeReplayedCanonicalVisit(result.p,result.evidence,{now:result.leavesAt}).state,'completed');return result;}
function commit(p,result){assert.equal(result.status,200,result.error);assert.ok(result.yard);p.yard=result.yard;p._yardV2.runtime=result.runtime;return result;}
function claim(p,id='yard-v2:claim',now=p._yardV2.runtime.cursorMs,record){return applyCanonicalFoodActionAtCursor(p,'yard.collectGifts',{}, {actionId:id,now,replayedRecord:record});}

function empty(){return {id:'saved-loop-empty',schemaVersion:11,_version:'first',yard:createDefaultYardState(A),_yardV2:{format:'yard-persistent/v1',version:3,runtime:{version:1,canonicalRevision:'first',seed:'saved-loop-empty',cursorMs:A,nextOpportunityAt:H,visits:{},canonicalVisits:{},canonicalVisitReceipts:{},canonicalPlacements:[],giftLedger:{},commandReceipts:{},actionReceipts:{},events:[]}}};}
test('fresh empty canonical yard can read and advance without granting a prop or visitor',()=>{
 const p=empty(),before=structuredClone(p.yard);assert.equal(ensureCanonicalPlayerYard(p,{now:A,simulate:true}).status,200);
 assert.equal(publicCanonicalPlayerYard(p,{now:A}).status,'ready');assert.equal(ensureCanonicalPlayerYard(p,{now:2*H+1,simulate:true}).status,200);
 assert.equal(p._yardV2.runtime.nextOpportunityAt,3*H);assert.deepEqual(p.yard.goodieInventory,before.goodieInventory);assert.deepEqual(p.yard.currencies,before.currencies);assert.equal(p.yard.activeVisitors.length,0);
});
test('source gift handler accepts an empty claim at a resolved v3 cursor',()=>{
 const p=empty(),result=applyCanonicalFoodActionAtCursor(p,'yard.collectGifts',{}, {actionId:'yard-v2:empty-claim',now:A});assert.equal(result.status,200,result.error);assert.deepEqual(result.extras.collected,{treats:0,shinyTreats:0,gifts:0});
});

test('fresh constructor preserves source starters, deterministic identity and original hourly schedule',()=>{
 for(const now of [0,A,H-1,H,H+1]){
  const fresh=createFreshCanonicalYard('fresh-owner',now);assert.deepEqual(fresh.yard,createDefaultYardState(now));
  assert.deepEqual(fresh,createFreshCanonicalYard('fresh-owner',now));assert.equal(fresh._yardV2.runtime.nextOpportunityAt,(Math.floor(now/H)+1)*H);
  assert.equal(fresh.yard.goodieInventory.leaf_pot,undefined);assert.equal(fresh.yard.currencies.treats,80);assert.equal(fresh._yardV2.runtime.seed,'fresh-owner');
  assert.equal(Object.hasOwn(fresh._yardV2,'migration'),false);assert.deepEqual(fresh._yardV2.runtime.canonicalPlacements,[]);
 }
 for(const [owner,now]of [['',A],[null,A],['x',-1],['x',NaN],['x',8640000000000000]])assert.throws(()=>createFreshCanonicalYard(owner,now));
 const old={yard:{future:true},_yardV2:{version:99}};const before=copy(old);createFreshCanonicalYard('fresh-owner',A);assert.deepEqual(old,before);
});

test('fresh idle runtime supports source purchase, food fill, reload and truthful separate capabilities',()=>{
 const p={id:'fresh-owner',schemaVersion:11,_version:'fresh',...createFreshCanonicalYard('fresh-owner',A)};
 const insufficient=executeCanonicalYardAction(p,'yard.buyGoodie',{goodieId:'leaf_pot'},{actionId:'yard-v2:pot-too-early',now:A});
 assert.equal(insufficient.status,400);assert.equal(p.yard.currencies.treats,80);assert.equal(p.yard.goodieInventory.leaf_pot,undefined);
 p.yard.currencies.treats=1000;const before=copy(p.yard.currencies);
 const bought=executeCanonicalYardAction(p,'yard.buyGoodie',{goodieId:'leaf_pot'},{actionId:'yard-v2:pot-buy',now:A});assert.equal(bought.status,200,bought.error);
 assert.equal(p.yard.currencies.treats,before.treats-YARD_GOODIES.leaf_pot.cost.treats);assert.equal(p.yard.goodieInventory.leaf_pot,1);assert.deepEqual(p._yardV2.runtime.canonicalPlacements,[]);
 const after=copy(p);assert.equal(executeCanonicalYardAction(p,'yard.buyGoodie',{goodieId:'leaf_pot'},{actionId:'yard-v2:pot-buy',now:A+10*H}).replayed,true);assert.deepEqual(p,after);
 const failedReplay=executeCanonicalYardAction(p,'yard.buyGoodie',{goodieId:'leaf_pot'},{actionId:'yard-v2:pot-too-early',now:A});assert.equal(failedReplay.replayed,true);assert.equal(failedReplay.status,400);
 const filled=executeCanonicalYardAction(p,'yard.setFood',{foodId:'kibble'},{actionId:'yard-v2:fresh-fill',now:A});assert.equal(filled.status,200,filled.error);assert.equal(p.yard.foodInventory.kibble,2);assert.equal(p.yard.bowls[0].servings,YARD_FOODS.kibble.servings);
 const cold=JSON.parse(JSON.stringify(p));assert.equal(ensureCanonicalPlayerYard(cold,{now:H,simulate:true}).status,200);assert.equal(cold.yard.activeVisitors.length,0);
 const view=publicCanonicalPlayerYard(cold,{now:H});assert.equal(view.status,'ready');assert.deepEqual(view.canonicalFoodActions.actions,['yard.buyFood','yard.setFood']);
 assert.deepEqual(view.canonicalInventoryActions.actions,['yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter']);assert.equal(view.supportedBindings.goodies.leaf_pot.buy,true);assert.equal(view.supportedBindings.goodies.leaf_pot.place,false);
});

test('genuine persisted Pip gift credits source amounts once and retains both source receipts',()=>{
 const {p,leavesAt}=completed(),gift=copy(p.yard.pendingGifts[0]),before=copy(p.yard.currencies);p.neighbor={wallet:77};p._yardV2.opaque={keep:true};
 assert.equal(inspectCanonicalGiftClaims(p,{now:leavesAt}).valid,true);const result=commit(p,claim(p));
 assert.deepEqual(result.extras.collected,{treats:gift.treats,shinyTreats:gift.shinyTreats,gifts:1});assert.equal(p.yard.currencies.treats,before.treats+gift.treats);
 assert.equal(p.yard.currencies.shinyTreats,before.shinyTreats+gift.shinyTreats);assert.equal(p.yard.pendingGifts.length,0);
 assert.equal(p._yardV2.runtime.giftLedger[gift.id].status,'claimed');assert.equal(p._yardV2.runtime.giftLedger[gift.id].claimedAt,leavesAt);
 assert.deepEqual(p._yardV2.runtime.actionReceipts['yard-v2:claim'].giftIds,[gift.id]);assert.ok(p._yardV2.runtime.commandReceipts['yard-v2:claim']);assert.deepEqual(p.neighbor,{wallet:77});assert.deepEqual(p._yardV2.opaque,{keep:true});
 const cold=JSON.parse(JSON.stringify(p));cold._yardV2.runtime.canonicalPending={unresolved:true};const exact=copy(cold);
 for(const now of [-1,leavesAt+100*H])assert.equal(claim(cold,'yard-v2:claim',now).replayed,true);assert.deepEqual(cold,exact);
 const conflict=probeCanonicalFoodAction(cold,'yard.collectGifts',{different:true},{actionId:'yard-v2:claim',now:leavesAt+H});assert.equal(conflict.error,'ACTION_ID_PAYLOAD_CONFLICT');assert.equal(conflict.receipt,undefined);assert.deepEqual(cold,exact);
});

test('an old empty claim nonce cannot collect a gift that arrived later',()=>{
 const {p,evidence,leavesAt}=admitted();commit(p,claim(p,'yard-v2:early-empty',A,evidence.artifact.record));
 assert.equal(inspectReplayedCanonicalVisit(p,evidence,{now:A}).valid,true);assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:leavesAt}).state,'completed');
 const before=copy(p),replay=claim(p,'yard-v2:early-empty',leavesAt);assert.equal(replay.replayed,true);assert.equal(replay.extras.collected.gifts,0);assert.deepEqual(p,before);
 commit(p,claim(p,'yard-v2:later-claim',leavesAt));assert.equal(p.yard.pendingGifts.length,0);
});

test('unresolved new claims remain retryable and cannot persist a failure receipt',()=>{
 for(const edit of [p=>p._yardV2.runtime.canonicalPending={},p=>p._yardV2.runtime.cursorMs--,p=>p._yardV2.runtime.nextOpportunityAt=p._yardV2.runtime.cursorMs]){
  const {p,leavesAt}=completed();edit(p);const before=copy(p),result=claim(p,'yard-v2:unresolved',leavesAt);
  assert.equal(result.retryable,true,JSON.stringify(result));assert.equal(result.receipt,undefined);assert.equal(result.runtime,undefined);assert.deepEqual(p,before);
 }
});

test('corrupt pending, ledger, completion, identity and source amounts fail before collection',()=>{
 const {p,leavesAt}=completed(),w=Object.values(p._yardV2.runtime.canonicalVisits)[0],id=w.giftId;
 for(const edit of [x=>x.yard.pendingGifts[0].treats++,x=>{x.yard.pendingGifts[0].treats++;x._yardV2.runtime.giftLedger[id].gift.treats++;},
  x=>delete x._yardV2.runtime.giftLedger[id],x=>{delete x._yardV2.runtime.giftLedger[id];x.yard.pendingGifts=[];},
  x=>x.yard.pendingGifts.push(copy(x.yard.pendingGifts[0])),x=>x._yardV2.runtime.giftLedger[id].status='claimed',
  x=>delete x._yardV2.runtime.canonicalVisits[w.visitId],x=>x._yardV2.runtime.canonicalVisitReceipts[w.eventId].completedAt--,
  x=>x._yardV2.runtime.canonicalVisits[w.visitId].proposal.candidate.visitId='forged',x=>delete x.yard.petbook.pip_hamster,
  x=>x.yard.pendingGifts[0].mementoId='forged']){
  const bad=copy(p);edit(bad);const before=copy(bad),result=claim(bad,'yard-v2:bad',leavesAt);
  assert.equal(result.error,'CANONICAL_GIFT_EVIDENCE_INVALID');assert.equal(result.receipt,undefined);assert.equal(result.runtime,undefined);assert.deepEqual(bad,before);
 }
});

test('two genuine UTC daily letters fund the source pot price without a new starter grant',()=>{
 const day=86400000,start=Date.UTC(2026,9,7,12),p={id:'fresh-earning-owner',schemaVersion:11,_version:'fresh',...createFreshCanonicalYard('fresh-earning-owner',start)};
 const first=executeCanonicalYardAction(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:day-one',now:start});assert.equal(first.status,200,first.error);assert.equal(p.yard.currencies.treats,115);assert.equal(p.yard.dailyLetter.lastClaimedDate,'2026-10-07');
 const firstState=copy(p);const exact=executeCanonicalYardAction(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:day-one',now:start+day});assert.equal(exact.replayed,true);assert.deepEqual(p,firstState);
 const sameDay=executeCanonicalYardAction(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:same-day',now:start});assert.equal(sameDay.status,400);assert.equal(sameDay.error,'daily letter already claimed');assert.equal(p.yard.currencies.treats,115);
 const second=executeCanonicalYardAction(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:day-two',now:start+day});assert.equal(second.status,200,second.error);assert.equal(p.yard.currencies.treats,150);assert.equal(p.yard.dailyLetter.stamps,2);
 const buy=executeCanonicalYardAction(p,'yard.buyGoodie',{goodieId:'leaf_pot'},{actionId:'yard-v2:earned-pot',now:start+day});assert.equal(buy.status,200,buy.error);assert.equal(p.yard.currencies.treats,150-YARD_GOODIES.leaf_pot.cost.treats);assert.equal(p.yard.goodieInventory.leaf_pot,1);assert.deepEqual(p._yardV2.runtime.canonicalPlacements,[]);
 for(let i=2;i<5;i++)assert.equal(executeCanonicalYardAction(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:day-'+i,now:start+i*day}).status,200);
 assert.equal(p.yard.dailyLetter.stamps,5);assert.equal(p.yard.currencies.shinyTreats,4);assert.equal(p.yard.foodInventory.berry_plate,1);
 const frozen=copy(p);assert.equal(executeCanonicalYardAction(p,'yard.claimDailyLetter',{extra:true},{actionId:'yard-v2:day-one',now:start+5*day}).error,'ACTION_ID_PAYLOAD_CONFLICT');assert.deepEqual(p,frozen);
});

test('malformed or future daily-letter state cannot award, reset, or receipt a new failure',()=>{
 for(const letter of [null,{stamps:-1,lastClaimedDate:null},{stamps:1,lastClaimedDate:null},{stamps:0,lastClaimedDate:'1970-01-01'},
  {stamps:1,lastClaimedDate:'2099-01-01'},{stamps:1,lastClaimedDate:'1970-02-31'},{stamps:1,lastClaimedDate:'garbage'}]){
  const p=empty();p.yard.dailyLetter=letter;const before=copy(p),result=applyCanonicalFoodActionAtCursor(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:bad-day',now:A});
  assert.equal(result.error,'CANONICAL_DAILY_LETTER_EVIDENCE_INVALID');assert.equal(result.receipt,undefined);assert.equal(result.runtime,undefined);assert.deepEqual(p,before);
 }
});

test('normal runtime uses genuine workers, completes gift, collects after cold recovery and replays lost response',async t=>{
 const oldNow=Date.now;let now=A+1;Date.now=()=>now;t.after(async()=>{await closeCanonicalRuntime();Date.now=oldNow;});const id='normal-saved-loop-gift';
 await withPlayerLock(id,p=>fixture(p));
 await withPlayerLock(id,p=>{const before=copy(p.yard),result=executeCanonicalYardAction(p,'yard.collectGifts',{}, {actionId:'yard-v2:wait-for-gift',now});assert.equal(result.status,409);assert.equal(result.receipt,undefined);assert.deepEqual(p.yard,before);});
 async function ready(){const end=performance.now()+40000;while(performance.now()<end){let view;await withPlayerLock(id,p=>{ensureCanonicalPlayerYard(p,{now,simulate:true});view=publicCanonicalPlayerYard(p,{now});});if(view.status==='ready'&&view.canonicalVisits?.length)return view;await delay(20);}throw Error('SAVED_LOOP_WORKER_TIMEOUT');}
 const view=await ready(),plan=view.canonicalVisits[0].plan;
 await withPlayerLock(id,p=>{assert.equal(executeCanonicalYardAction(p,'yard.collectGifts',{}, {actionId:'yard-v2:early-runtime',now}).status,200);});
 await closeCanonicalRuntime();await ready();now=plan.leavesAt;
 let gift,balance;
 await withPlayerLock(id,p=>{ensureCanonicalPlayerYard(p,{now,simulate:true});gift=copy(p.yard.pendingGifts[0]);balance=copy(p.yard.currencies);assert.equal(gift.createdAt,plan.leavesAt);
  const emptyReplay=executeCanonicalYardAction(p,'yard.collectGifts',{}, {actionId:'yard-v2:early-runtime',now});assert.equal(emptyReplay.replayed,true);assert.equal(emptyReplay.extras.collected.gifts,0);assert.equal(p.yard.pendingGifts.length,1);
  const result=executeCanonicalYardAction(p,'yard.collectGifts',{}, {actionId:'yard-v2:lost-gift-response',now});assert.equal(result.status,200,result.error);assert.equal(result.extras.collected.gifts,1);});
 await closeCanonicalRuntime();
 await withPlayerLock(id,p=>{const before=copy({yard:p.yard,store:p._yardV2});const result=executeCanonicalYardAction(p,'yard.collectGifts',{}, {actionId:'yard-v2:lost-gift-response',now:now+100*H});assert.equal(result.replayed,true);assert.deepEqual({yard:p.yard,store:p._yardV2},before);
  assert.equal(p.yard.pendingGifts.length,0);assert.equal(p.yard.currencies.treats,balance.treats+gift.treats);assert.equal(p._yardV2.runtime.giftLedger[gift.id].status,'claimed');assert.equal(p._yardV2.runtime.actionReceipts['yard-v2:lost-gift-response'].collected.gifts,1);});
});

test('retained genuine claim receipts prevent coordinated claimed-to-earned rollback and second credit',()=>{
 const {p}=completed();commit(p,claim(p,'yard-v2:first-claim'));const id=Object.keys(p._yardV2.runtime.giftLedger)[0];
 const ledger=p._yardV2.runtime.giftLedger[id];ledger.status='earned';delete ledger.claimedAt;p.yard.pendingGifts=[copy(ledger.gift)];
 const before=copy(p),result=claim(p,'yard-v2:second-claim');assert.equal(result.error,'CANONICAL_GIFT_EVIDENCE_INVALID');assert.equal(result.receipt,undefined);assert.deepEqual(p,before);
});

test('retained daily receipt prevents date/stamp rollback from granting another same-day letter',()=>{
 const p=empty();commit(p,applyCanonicalFoodActionAtCursor(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:first-letter',now:A}));
 p.yard.dailyLetter={lastClaimedDate:null,stamps:0};const before=copy(p),result=applyCanonicalFoodActionAtCursor(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:second-letter',now:A});
 assert.equal(result.error,'CANONICAL_DAILY_LETTER_EVIDENCE_INVALID');assert.equal(result.receipt,undefined);assert.deepEqual(p,before);
});

test('claim evidence rejects missing, conflicting or duplicated source claim receipts',()=>{
 const {p}=completed();commit(p,claim(p,'yard-v2:proof'));const id=Object.keys(p._yardV2.runtime.giftLedger)[0];
 for(const edit of [x=>delete x._yardV2.runtime.actionReceipts['yard-v2:proof'],x=>delete x._yardV2.runtime.commandReceipts['yard-v2:proof'],
  x=>x._yardV2.runtime.actionReceipts['yard-v2:proof'].collected.treats++,x=>x._yardV2.runtime.giftLedger[id].claimedAt++,
  x=>{const r=x._yardV2.runtime,other='yard-v2:duplicate-proof';r.actionReceipts[other]={...copy(r.actionReceipts['yard-v2:proof']),actionId:other};r.commandReceipts[other]={...copy(r.commandReceipts['yard-v2:proof']),actionId:other};r.commandReceipts[other].extras.receipt=copy(r.actionReceipts[other]);}]){
  const bad=copy(p);edit(bad);const before=copy(bad),result=claim(bad,'yard-v2:fresh-claim');assert.equal(result.error,'CANONICAL_GIFT_EVIDENCE_INVALID');assert.equal(result.receipt,undefined);assert.deepEqual(bad,before);
 }
});

test('daily receipt sequence rejects deleted, duplicated, stale and conflicting award evidence',()=>{
 const p=empty();commit(p,applyCanonicalFoodActionAtCursor(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:letter-proof',now:A}));
 for(const edit of [x=>delete x._yardV2.runtime.commandReceipts['yard-v2:letter-proof'],x=>x._yardV2.runtime.commandReceipts['yard-v2:letter-proof'].extras.stamps++,
  x=>x._yardV2.runtime.commandReceipts['yard-v2:letter-proof'].extras.reward.treats++,x=>x._yardV2.runtime.commandReceipts['yard-v2:letter-proof'].at+=86400000,
  x=>{const r=x._yardV2.runtime;r.commandReceipts['yard-v2:duplicate-letter']={...copy(r.commandReceipts['yard-v2:letter-proof']),actionId:'yard-v2:duplicate-letter'};}]){
  const bad=copy(p);edit(bad);const before=copy(bad),result=applyCanonicalFoodActionAtCursor(bad,'yard.claimDailyLetter',{}, {actionId:'yard-v2:another-letter',now:A});assert.equal(result.error,'CANONICAL_DAILY_LETTER_EVIDENCE_INVALID');assert.equal(result.receipt,undefined);assert.deepEqual(bad,before);
 }
});

test('exact60 held phase waits without receipt; prior gift remains claimable during a later active Pip',()=>{
 const {p,evidence,leavesAt}=admitted(60);commit(p,claim(p,'yard-v2:before-held',A,evidence.artifact.record));
 assert.equal(completeReplayedCanonicalVisit(p,evidence,{now:leavesAt}).state,'completed');const held=copy(p);
 const pending=claim(p,'yard-v2:held-new',leavesAt);assert.equal(pending.retryable,true);assert.equal(pending.receipt,undefined);assert.deepEqual(p,held);
 assert.equal(claim(p,'yard-v2:before-held',leavesAt).replayed,true);assert.deepEqual(p,held);
 assert.equal(stageCanonicalVisitPreparation(p,{slotId:row.slotId,at:leavesAt}).state,'pending');const second=prepareCanonicalSavedVisit(p._yardV2.runtime.canonicalPending.input);assert.equal(second.prepared,true,second.code);
 const next={state:'prepared',execution:{sourceHash:VISIT_JOB_SOURCE_HASH},artifact:second};assert.equal(commitPreparedCanonicalVisit(p,next,{now:leavesAt}).state,'admitted');assert.equal(p.yard.activeVisitors.length,1);
 const result=commit(p,claim(p,'yard-v2:prior-active-gift',leavesAt,second.record));assert.equal(result.extras.collected.gifts,1);assert.equal(p.yard.activeVisitors.length,1);assert.equal(p.yard.pendingGifts.length,0);
 assert.equal(inspectReplayedCanonicalVisit(p,next,{now:leavesAt}).valid,true);
});

test('gift claim evidence cannot disappear through a conflicting command or core action label',()=>{
 const {p}=completed();commit(p,claim(p,'yard-v2:label-proof'));const giftId=Object.keys(p._yardV2.runtime.giftLedger)[0];
 for(const edit of [r=>r.actionReceipts['yard-v2:label-proof'].action='yard.buyFood',r=>r.commandReceipts['yard-v2:label-proof'].action='yard.buyFood',
  r=>{r.actionReceipts['yard-v2:label-proof'].action='yard.buyFood';r.commandReceipts['yard-v2:label-proof'].action='yard.buyFood';}]){
  const bad=copy(p),r=bad._yardV2.runtime;r.giftLedger[giftId].status='earned';delete r.giftLedger[giftId].claimedAt;bad.yard.pendingGifts=[copy(r.giftLedger[giftId].gift)];edit(r);
  const before=copy(bad),result=claim(bad,'yard-v2:new-label-claim');assert.equal(result.error,'CANONICAL_GIFT_EVIDENCE_INVALID');assert.equal(result.receipt,undefined);assert.deepEqual(bad,before);
 }
});

test('daily award evidence cannot disappear through a conflicting action label',()=>{
 const p=empty();commit(p,applyCanonicalFoodActionAtCursor(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:daily-label-proof',now:A}));
 p.yard.dailyLetter={lastClaimedDate:null,stamps:0};p._yardV2.runtime.commandReceipts['yard-v2:daily-label-proof'].action='yard.buyFood';
 const before=copy(p),result=applyCanonicalFoodActionAtCursor(p,'yard.claimDailyLetter',{}, {actionId:'yard-v2:new-daily-label',now:A});
 assert.equal(result.error,'CANONICAL_DAILY_LETTER_EVIDENCE_INVALID');assert.equal(result.receipt,undefined);assert.deepEqual(p,before);
});
