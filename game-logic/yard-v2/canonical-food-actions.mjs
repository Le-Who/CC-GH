/** Additive v3-only adapter: existing applyYardAction owns prices, quantity,
 * ownership, food consumption, gift claims and durable receipt semantics. No route or gate
 * uses this module yet. It returns prospective Yard-owned fields, never commits.
 * Caller owns the actual player transaction and complete canonical reconciliation.
 * Active visits require that caller's authenticated immutable source-replay record;
 * supplying a record/hash here does not authenticate it. The caller must also
 * run the complete visit-state inspector on that fresh transaction; this food
 * adapter is not a substitute for its wrapper/ledger/economic checks. No planner.
 */
import {canonicalDailyLetterClaimsValid} from './canonical-daily-letter-claims.mjs';
import {inspectCanonicalGiftClaims} from './canonical-gift-claims.mjs';
import {applyYardAction} from './actions.mjs';
import {FOUNDATION_FORMAT} from './migration.mjs';
import {canonicalVisitPlacementRowsValid} from './canonical-visit-placement-contract.mjs';
import {CANONICAL_FOOD_CONTRACT} from './canonical-food-protocol.mjs';
import {isCanonicalItemIntent} from './canonical-locations.mjs';
import {YARD_FOODS} from './catalog.mjs';
import {clone,digest,integer,lookup} from './util.mjs';

export const CANONICAL_FOOD_RECEIPT_FORMAT='yard-canonical-food-replacement/v1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(o,k)=>Object.hasOwn(o||{},k);
const allowed=action=>action==='yard.buyFood'||action==='yard.setFood'||action==='yard.buyGoodie'||action==='yard.collectGifts'||action==='yard.claimDailyLetter';
const fail=error=>({status:409,error,mutable:false});
const pending=()=>({...fail('CANONICAL_ACTION_RECONCILIATION_PENDING'),retryable:true,needsReconciliation:true});
const report=result=>({status:result.status,...(result.error?{error:result.error}:{}),...(result.details?{details:clone(result.details)}:{}),
 extras:clone(result.extras||{}),...(result.receipt?{receipt:clone(result.receipt)}:{}),replayed:result.replayed===true,legacyReplay:result.legacyReplay===true});
const stop=()=>{throw Error('CANONICAL_PROBE_STOP_BEFORE_ADVANCE');};
const existingNonce=(state,id)=>lookup(state.runtime.commandReceipts,id)!==undefined||lookup(state.runtime.actionReceipts,id)!==undefined
 ||Array.isArray(state.player._actionReceipts?.items)&&state.player._actionReceipts.items.some(r=>r?.clientActionId===id);
function noSpeculativeReceipt(result){const out=report(result);delete out.receipt;return out;}
function envelope(player){
 const store=player?._yardV2;
 if(player?.schemaVersion!==11||store?.format!=='yard-persistent/v1'||store.version!==3||store.runtime?.version!==1)throw Error('CANONICAL_CONTAINER_V3_REQUIRED');
 const selected={schemaVersion:11,yard:clone(player.yard)};
 for(const key of ['id','username'])if(own(player,key))selected[key]=clone(player[key]);
 if(own(player,'_actionReceipts'))selected._actionReceipts=clone(player._actionReceipts);
 if(own(store,'legacyReceipts')){
  if(!Array.isArray(store.legacyReceipts))throw Error('LEGACY_RECEIPTS_REQUIRE_REVIEW');
  if(selected._actionReceipts===undefined)selected._actionReceipts={items:clone(store.legacyReceipts)};
  else if(object(selected._actionReceipts)&&Array.isArray(selected._actionReceipts.items))selected._actionReceipts.items.push(...clone(store.legacyReceipts));
 }
 const runtime=clone(store.runtime);
 // This is an ephemeral compatibility envelope, not a migration or normalization.
 // Present fields are never reset. Missing legacy-only fields are removed again
 // from the prospective v3 runtime before it is returned to the transaction.
 if(!own(runtime,'migrationIssues'))runtime.migrationIssues=[];
 if(!own(runtime,'actionReceipts'))runtime.actionReceipts={};
 return {format:FOUNDATION_FORMAT,player:selected,runtime};
}

/** Exact replay is read-only and precedes time/reconciliation. Always isolate
 * source execution: canonical intents bypass options.advance. Only a genuinely
 * replayed source result may escape this probe; every new effect/receipt is
 * discarded, including future source branches that bypass the stop sentinel. */
export function probeCanonicalFoodAction(player,action,payload={},options={}){
 try{
  if(!allowed(action))return fail('CANONICAL_FOOD_ACTION_UNSUPPORTED');
  const state=envelope(player),result=applyYardAction(state,action,clone(payload),{actionId:options.actionId,now:options.now,advance:stop});
  return result.replayed?report(result):existingNonce(state,options.actionId)?noSpeculativeReceipt(result):pending();
 }catch(error){return fail(error.message==='CANONICAL_CONTAINER_V3_REQUIRED'?error.message:'CANONICAL_FOOD_INPUT_REQUIRES_REVIEW');}
}

function expire(bowl,at){if(bowl.foodId&&integer(bowl.expiresAt)&&bowl.expiresAt<=at)Object.assign(bowl,{foodId:null,servings:0,placedAt:null,expiresAt:null});}
/** The existing committed command receipt is transaction evidence, not a signed
 * audit log. No arbitrary afterBowl/hash is accepted. Source catalog fields and
 * receipt.at reconstruct the last full replacement; original bowl metadata is
 * preserved. This bounded single-visitor slice consumes no further serving after
 * admission. Retained matching receipts establish a unique contiguous sequence;
 * only the last replacement is projected, without replaying a growing economy.
 */
export function inspectCanonicalBowlAfterActions(input={}){
 try{
  const {wrapper,record,commandReceipts,bowl,cursorMs}=input;
  if(!object(wrapper)||wrapper.format!=='yard-authoritative-canonical-visit/v1'||wrapper.status!=='active'
   ||!object(record)||record.format!=='yard-canonical-saved-visit/v2'||record.status!=='prepared-inactive'
   ||record.authoritative!==false||record.requiredContainerVersion!==3
   ||!object(record.candidate)||wrapper.visitId!==record.candidate.visitId||wrapper.arrivedAt!==record.candidate.arrivedAt
   ||wrapper.leavesAt!==record.candidate.leavesAt||typeof wrapper.eventId!=='string'||!wrapper.eventId||!object(record.after?.bowl)
   ||digest(wrapper.proposal)!==digest(record)||!integer(cursorMs)||cursorMs<record.candidate.arrivedAt
   ||!object(commandReceipts)||!object(bowl))return {valid:false,code:'CANONICAL_FOOD_EVIDENCE_INVALID'};
  const expected=clone(record.after.bowl);
  const hasId=own(wrapper,'lastFoodActionId'),hasSequence=own(wrapper,'foodActionSequence'),replacements=new Map();
  // A latest pointer is not authority by itself: identical same-time fills have
  // identical bowls. Compare it with all retained replacement evidence for this
  // visit before deriving the final bowl or assigning a subsequent sequence.
  for(const [actionId,receipt] of Object.entries(commandReceipts)){
   const extension=receipt?.canonicalFood;
   if(!object(extension)||extension.visitId!==wrapper.visitId&&extension.eventId!==wrapper.eventId)continue;
   if(!/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(actionId)||!object(receipt)
    ||receipt.format!=='yard-action-receipt/v1'||receipt.actionId!==actionId||receipt.action!=='yard.setFood'||receipt.status!==200
    ||own(receipt,'error')||!integer(receipt.at)||receipt.at<record.candidate.arrivedAt||receipt.at>=record.candidate.leavesAt||receipt.at>cursorMs
    ||extension.format!==CANONICAL_FOOD_RECEIPT_FORMAT||extension.visitId!==wrapper.visitId||extension.eventId!==wrapper.eventId
    ||!integer(extension.sequence)||extension.sequence<1||!object(extension.payload)
    ||isCanonicalItemIntent(extension.payload,actionId)||receipt.requestHash!==digest({action:'yard.setFood',payload:extension.payload}))return {valid:false,code:'CANONICAL_FOOD_RECEIPT_INVALID'};
   const foodId=String(extension.payload.foodId||''),bowlId=String(extension.payload.bowlId||'bowl-1'),food=lookup(YARD_FOODS,foodId);
   if(!food||bowlId!==CANONICAL_FOOD_CONTRACT.bowlId||expected.id!==bowlId||receipt.extras?.foodId!==foodId||receipt.extras?.bowlId!==bowlId
    ||!integer(receipt.at+food.durationMs))return {valid:false,code:'CANONICAL_FOOD_RECEIPT_INVALID'};
   if(replacements.has(extension.sequence))return {valid:false,code:'CANONICAL_FOOD_SEQUENCE_INVALID'};
   replacements.set(extension.sequence,{actionId,receipt,foodId,food});
  }
  if(hasId!==hasSequence||hasId!==(replacements.size>0))return {valid:false,code:'CANONICAL_FOOD_POINTER_INVALID'};
  if(hasId){
   if(typeof wrapper.lastFoodActionId!=='string'||!integer(wrapper.foodActionSequence)
    ||wrapper.foodActionSequence!==replacements.size)return {valid:false,code:'CANONICAL_FOOD_SEQUENCE_INVALID'};
   let previousAt=record.candidate.arrivedAt;
   for(let sequence=1;sequence<=replacements.size;sequence++){
    const replacement=replacements.get(sequence);
    if(!replacement||replacement.receipt.at<previousAt)return {valid:false,code:'CANONICAL_FOOD_SEQUENCE_INVALID'};
    previousAt=replacement.receipt.at;
   }
   const latest=replacements.get(replacements.size);
   if(latest.actionId!==wrapper.lastFoodActionId)return {valid:false,code:'CANONICAL_FOOD_POINTER_INVALID'};
   const {receipt,foodId,food}=latest;
   // Derivation only; the mutation and one-unit debit remain existing source.
   Object.assign(expected,{foodId,servings:food.servings,placedAt:receipt.at,expiresAt:receipt.at+food.durationMs});
  }
  expire(expected,cursorMs);
  return digest(bowl)===digest(expected)?{valid:true}:{valid:false,code:'SAVED_ECONOMY_MISMATCH'};
 }catch{return {valid:false,code:'CANONICAL_FOOD_EVIDENCE_INVALID'};}
}

function readiness(player,now,replayedRecord){
 const r=player._yardV2.runtime,y=player.yard;
 if(!integer(now)||now>8640000000000000||!integer(r.cursorMs)||r.cursorMs!==now||!integer(r.nextOpportunityAt)
  ||r.nextOpportunityAt<=now||own(r,'canonicalPending'))return pending();
 if(!object(y)||!canonicalVisitPlacementRowsValid(r.canonicalPlacements)||r.canonicalPlacements.some(row=>row.placedAt>now)
  ||!Array.isArray(y.placedGoodies)||y.placedGoodies.length||!Array.isArray(y.activeVisitors)
  ||!object(r.canonicalVisits)||Object.values(r.canonicalVisits).some(v=>!object(v)||!['active','completed'].includes(v.status))
  ||!object(r.visits)||Object.values(r.visits).some(v=>!object(v)||!['completed','historical-unknown'].includes(v.status))
  ||!object(r.commandReceipts)||!object(y.currencies)||!['treats','shinyTreats'].every(k=>integer(y.currencies[k]))
  ||!object(y.foodInventory)||!Object.values(y.foodInventory).every(integer)
  ||!Array.isArray(y.bowls)||y.bowls.length!==1||!object(y.bowls[0])||y.bowls[0].id!==CANONICAL_FOOD_CONTRACT.bowlId
  ||y.helper?.unlocked&&y.helper?.autoRefill||own(r,'migrationIssues')&&(!Array.isArray(r.migrationIssues)||r.migrationIssues.length))return fail('CANONICAL_FOOD_STATE_REQUIRES_REVIEW');
 const bowl=y.bowls[0],food=lookup(YARD_FOODS,bowl.foodId);
 if(bowl.foodId===null?bowl.servings!==0||bowl.placedAt!==null||bowl.expiresAt!==null
  :!food||!integer(bowl.servings)||bowl.servings<1||bowl.servings>food.servings||!integer(bowl.placedAt)||bowl.placedAt>now
   ||!integer(bowl.expiresAt)||bowl.expiresAt<=bowl.placedAt)return fail('CANONICAL_FOOD_STATE_REQUIRES_REVIEW');
 if(bowl.foodId&&bowl.expiresAt<=now)return pending();
 const active=Object.values(r.canonicalVisits).filter(v=>v.status==='active');
 if(active.length>1||y.activeVisitors.length!==active.length)return fail('CANONICAL_FOOD_STATE_REQUIRES_REVIEW');
 if(active.length){
  const wrapper=active[0];if(now>=wrapper.leavesAt)return pending();
  const valid=inspectCanonicalBowlAfterActions({wrapper,record:replayedRecord,commandReceipts:r.commandReceipts,bowl,cursorMs:now});
  if(!valid.valid)return fail(valid.code);
  return {ready:true,wrapper};
 }
 return {ready:true,wrapper:null};
}

/** Call on a freshly locked player only after probe, then ordinary canonical
 * reconciliation. Caller supplies actual source-replay output, never a payload
 * callback or "ready" flag. A retryable unresolved result has no receipt and no
 * prospective state. Commit only returned yard/runtime into the existing v3
 * container; never call legacy service.commitYard or migration/dispatch.
 */
export function applyCanonicalFoodActionAtCursor(player,action,payload={},options={}){
 try{
  if(!allowed(action))return fail('CANONICAL_FOOD_ACTION_UNSUPPORTED');
  const state=envelope(player),{actionId,now,replayedRecord}=options;
  const probe=applyYardAction(state,action,clone(payload),{actionId,now,advance:stop});
  if(probe.replayed)return report(probe);
  // Detect conflicts/errors from existing receipts even when source replay is
  // currently pending. New speculative receipts never escape this branch.
  if(existingNonce(state,actionId))return noSpeculativeReceipt(probe);
  const ready=readiness(player,now,replayedRecord);if(!ready.ready)return ready;
  if(action==='yard.collectGifts'){const gifts=inspectCanonicalGiftClaims(player,{now});if(!gifts.valid)return fail(gifts.code);}
  if(action==='yard.claimDailyLetter'&&!canonicalDailyLetterClaimsValid(player,{now}))return fail('CANONICAL_DAILY_LETTER_EVIDENCE_INVALID');
  // Keep ordinary Yard food wire semantics. Scoped item nonces/fields are not
  // rewritten or reinterpreted as food permission, and cannot reach a mutation.
  if(isCanonicalItemIntent(payload,actionId))return fail('CANONICAL_ACTION_UNSUPPORTED');
  const result=applyYardAction(state,action,clone(payload),{actionId,now,advance:input=>{
   if(input.runtime.cursorMs!==now)throw Error('CANONICAL_CURSOR_NOT_RECONCILED');return input;
  }});
  if(result.replayed||!result.receipt)return report(result);
  const runtime=result.state.runtime,yard=result.state.player.yard;
  for(const key of ['migrationIssues','actionReceipts'])if(!own(player._yardV2.runtime,key)&&!(key==='actionReceipts'&&action==='yard.collectGifts'))delete runtime[key];
  if(result.status===200&&action==='yard.setFood'&&ready.wrapper){
   const wrapper=lookup(runtime.canonicalVisits,ready.wrapper.visitId),sequence=(wrapper.foodActionSequence||0)+1;
   if(!integer(sequence))return fail('CANONICAL_FOOD_POINTER_INVALID');
   const receipt=lookup(runtime.commandReceipts,actionId);
   receipt.canonicalFood={format:CANONICAL_FOOD_RECEIPT_FORMAT,visitId:wrapper.visitId,eventId:wrapper.eventId,sequence,payload:clone(payload)};
   wrapper.lastFoodActionId=actionId;wrapper.foodActionSequence=sequence;
   const checked=inspectCanonicalBowlAfterActions({wrapper,record:replayedRecord,commandReceipts:runtime.commandReceipts,bowl:yard.bowls[0],cursorMs:now});
   if(!checked.valid)return fail(checked.code);
   result.receipt=clone(receipt);
  }
  if(result.status===200){
   const prospective={...player,yard,_yardV2:{...player._yardV2,runtime}};
   if(action==='yard.collectGifts'&&!inspectCanonicalGiftClaims(prospective,{now}).valid)return fail('CANONICAL_GIFT_EVIDENCE_INVALID');
   if(action==='yard.claimDailyLetter'&&!canonicalDailyLetterClaimsValid(prospective,{now}))return fail('CANONICAL_DAILY_LETTER_EVIDENCE_INVALID');
  }
  return {...report(result),yard,runtime};
 }catch{return fail('CANONICAL_FOOD_STATE_REQUIRES_REVIEW');}
}
