/** Default-off, released single-target pickup. Existing source actions own the
 * inventory mutation and durable nonce receipt; this adapter adds only the
 * proof needed to retain the already admitted visitor. No planner or commit. */
import {applyYardAction} from './actions.mjs';
import {canonicalSavedActionEnvelope} from './canonical-food-actions.mjs';
import {inspectCanonicalLayoutAfterActions,CANONICAL_RELEASED_PICKUP_FORMAT} from './canonical-layout-evidence.mjs';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from './canonical-food-protocol.mjs';
import {clone,integer,lookup} from './util.mjs';

export const CANONICAL_SAVED_ITEM_ACTIONS_ENABLED=false;
const fail=error=>({status:409,error,mutable:false});
const pending=()=>({...fail('CANONICAL_ACTION_RECONCILIATION_PENDING'),retryable:true,needsReconciliation:true});
const report=result=>({status:result.status,...(result.error?{error:result.error}:{}),...(result.details?{details:clone(result.details)}:{}),
 extras:clone(result.extras||{}),...(result.receipt?{receipt:clone(result.receipt)}:{}),replayed:result.replayed===true,legacyReplay:result.legacyReplay===true});
const canonicalPayload=(payload,id)=>typeof id==='string'&&id.startsWith(CANONICAL_FOOD_NONCE_PREFIX)
 &&payload&&typeof payload==='object'&&!Array.isArray(payload)
 &&Object.keys(payload).sort().join(',')===[...Object.keys(CANONICAL_FOOD_LOCATION),'slotId'].sort().join(',')
 &&Object.entries(CANONICAL_FOOD_LOCATION).every(([k,v])=>payload[k]===v);
const options=(now,actionId,enabled)=>({now,actionId,canonicalFoodLocationEnabled:true,canonicalItemPlacementEnabled:enabled});

export function probeCanonicalSavedItemAction(player,action,payload={}, {now,actionId}={}){
 try{
  if(!CANONICAL_SAVED_ITEM_ACTIONS_ENABLED)return fail('CANONICAL_SAVED_ITEM_ACTIONS_DISABLED');
  if(action!=='yard.pickupGoodie')return fail('CANONICAL_SAVED_ITEM_ACTION_UNSUPPORTED');
  const state=canonicalSavedActionEnvelope(player);
  const result=applyYardAction(state,action,clone(payload),options(now,actionId,false));
  if(result.replayed)return report(result);
  if(lookup(state.runtime.commandReceipts,actionId)!==undefined||lookup(state.runtime.actionReceipts,actionId)!==undefined
   ||state.player._actionReceipts?.items?.some(r=>r?.clientActionId===actionId))return report(result);
  if(!canonicalPayload(payload,actionId))return fail('CANONICAL_PICKUP_SCOPE_REQUIRED');
  return pending();
 }catch{return fail('CANONICAL_ITEM_STATE_REQUIRES_REVIEW');}
}

export function applyCanonicalSavedPickupAtCursor(player,payload={}, {now,actionId,replayedRecord}={}){
 try{
  const probe=probeCanonicalSavedItemAction(player,'yard.pickupGoodie',payload,{now,actionId});
  if(!probe.needsReconciliation)return probe;
  const r=player._yardV2.runtime;
  if(!integer(now)||r.cursorMs!==now||r.nextOpportunityAt<=now||Object.hasOwn(r,'canonicalPending'))return pending();
  const active=Object.values(r.canonicalVisits||{}).filter(w=>w.status==='active');
  if(active.length!==1)return fail('CANONICAL_RELEASED_VISIT_REQUIRED');
  const wrapper=active[0];
  if(now<wrapper.releaseAt)return {...fail('CANONICAL_TARGET_RESERVED'),retryable:true};
  if(now>=wrapper.leavesAt)return pending();
  const check=(runtime,selected)=>inspectCanonicalLayoutAfterActions({wrapper:selected,record:replayedRecord,
   commandReceipts:runtime.commandReceipts,rows:runtime.canonicalPlacements,cursorMs:now});
  const before=check(r,wrapper);if(!before.valid)return fail(before.code);
  const state=canonicalSavedActionEnvelope(player);
  const result=applyYardAction(state,'yard.pickupGoodie',clone(payload),options(now,actionId,true));
  if(result.replayed||!result.receipt)return report(result);
  const runtime=result.state.runtime,yard=result.state.player.yard;
  for(const key of ['migrationIssues','actionReceipts'])if(!Object.hasOwn(r,key))delete runtime[key];
  if(result.status===200){
   const selected=lookup(runtime.canonicalVisits,wrapper.visitId),receipt=lookup(runtime.commandReceipts,actionId);
   receipt.canonicalLayout={format:CANONICAL_RELEASED_PICKUP_FORMAT,visitId:wrapper.visitId,eventId:wrapper.eventId,payload:clone(payload)};
   selected.releasedPickupActionId=actionId;
   const after=check(runtime,selected);if(!after.valid)return fail(after.code);
   result.receipt=clone(receipt);
  }
  return {...report(result),yard,runtime};
 }catch{return fail('CANONICAL_ITEM_STATE_REQUIRES_REVIEW');}
}
