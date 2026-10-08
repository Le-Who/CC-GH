/** Bounded single-Pip clock evidence, no planner or economic writer. Native
 * 45..110 minute stays cross at most one hourly event while still active.
 * Source replay remains the caller's prerequisite for active record authority.
 */
import {YARD_HOUR_MS,YARD_FOODS,YARD_GOODIES,YARD_VISITORS,getYardGoodieActivities} from './catalog.mjs';
import {selectOpportunity} from './opportunity-selection.mjs';
import {inspectCanonicalBowlAfterActions} from './canonical-food-actions.mjs';
import {inspectCanonicalLayoutAfterActions,canonicalLayoutRowsAt} from './canonical-layout-evidence.mjs';
import {canonicalVisitPlacementRowsValid} from './canonical-visit-placement-contract.mjs';
import {CANONICAL_FOOD_CONTRACT} from './canonical-food-protocol.mjs';
import {VISIT_JOB_SOURCE_HASH} from './canonical-visit-job-contract.mjs';
import {clone,digest,integer,lookup,compareText,randomInt,randomUnit} from './util.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const CANONICAL_HELD_DEPARTURE_STATUS='completed-pending-opportunity';
export const CANONICAL_MAX_VISIT_STAY_MS=110*60000;
export const CANONICAL_ACTIVE_HOUR_FORMAT='yard-canonical-active-hour/v1';
export const CANONICAL_DEPARTURE_CHECKPOINT_FORMAT='yard-canonical-departure-before-opportunity/v1';
export const canonicalOpportunityEventId=(player,at,slotId)=>digest({ownerId:player.id,seed:player._yardV2.runtime.seed,at,slotId,n:0});
const expire=(b,at)=>{if(b.foodId&&integer(b.expiresAt)&&b.expiresAt<=at)Object.assign(b,{foodId:null,servings:0,placedAt:null,expiresAt:null});};

function sourceSelection(seed,at,row,bowl){
 const goodie=YARD_GOODIES[row.goodieId];
 return selectOpportunity({seed,at,placed:row,goodie,available:getYardGoodieActivities(goodie,row.condition).sort((a,b)=>compareText(a.id,b.id)),bowls:bowl.foodId?[bowl]:[],n:0});
}
const candidate=(s,at,row)=>s?{visitId:s.id,visitorId:s.visitor.id,goodieId:row.goodieId,activityId:s.activity.id,slotId:row.slotId,arrivedAt:at,leavesAt:s.leavesAt}:null;

/** Reconstruct the bowl immediately BEFORE this opportunity from the already
 * validated food receipt chain. New food commands at the same millisecond run
 * after canonical catch-up, so they are excluded from that opportunity's input.
 * Never trust a receipt's saved bowl or reason instead of this source decision.
 */
export function canonicalActiveHourReceipt(player,wrapper,record,at){
 const runtime=player._yardV2.runtime,originalRow=record.after.rows[0],bowl=clone(record.after.bowl);
 const layout=inspectCanonicalLayoutAfterActions({wrapper,record,commandReceipts:runtime.commandReceipts,rows:runtime.canonicalPlacements,cursorMs:runtime.cursorMs});
 if(!layout.valid)return null;
 const row=canonicalLayoutRowsAt(record,layout,at,{beforeCommands:true})[0];
 let foodSequence=0;
 const receipts=Object.values(runtime.commandReceipts).filter(r=>r?.canonicalFood?.visitId===wrapper.visitId&&r.canonicalFood.eventId===wrapper.eventId&&r.at<at)
  .sort((a,b)=>a.canonicalFood.sequence-b.canonicalFood.sequence);
 for(const receipt of receipts){
  const foodId=String(receipt.canonicalFood.payload.foodId||''),food=lookup(YARD_FOODS,foodId);
  Object.assign(bowl,{foodId,servings:food.servings,placedAt:receipt.at,expiresAt:receipt.at+food.durationMs});foodSequence=receipt.canonicalFood.sequence;
 }
 expire(bowl,at);
 let reason,selected=null;
 if(!row)reason='NO_PLACED_TARGET';
 else if(!bowl.foodId)reason='NO_ELIGIBLE_FOOD';
 else if(at<wrapper.releaseAt)reason='TARGET_CAPACITY_RESERVED';
 else{
  const chosen=sourceSelection(runtime.seed,at,row,bowl);selected=candidate(chosen,at,row);
  reason=!selected?'NO_SELECTED_CANDIDATE':selected.visitorId==='pip_hamster'?'PIP_ALREADY_VISITING':'SELECTED_CANDIDATE_UNSUPPORTED';
 }
 return {format:CANONICAL_ACTIVE_HOUR_FORMAT,eventId:canonicalOpportunityEventId(player,at,originalRow.slotId),kind:'not-admitted',visitId:wrapper.visitId,at,
  reason,selection:selected,beforeBowl:bowl,foodSequence,sourceHash:VISIT_JOB_SOURCE_HASH};
}

/** Call after the complete current-bowl receipt guard. Exact source equality
 * rejects deleting a consumed hour or rewriting both cursor and next-hour fields.
 */
export function canonicalActiveVisitClockValid(player,wrapper,record){
 try{
  const r=player._yardV2.runtime,hour=wrapper.arrivedAt+YARD_HOUR_MS,stay=wrapper.leavesAt-wrapper.arrivedAt;
  if(!integer(r.cursorMs)||r.cursorMs<wrapper.arrivedAt||r.cursorMs>=wrapper.leavesAt||stay<45*60000||stay>CANONICAL_MAX_VISIT_STAY_MS||stay%60000!==0
   ||!integer(r.nextOpportunityAt)||r.canonicalDepartureCheckpoint!==undefined
   ||!inspectCanonicalLayoutAfterActions({wrapper,record,commandReceipts:r.commandReceipts,rows:r.canonicalPlacements,cursorMs:r.cursorMs}).valid)return false;
  const consumed=hour<wrapper.leavesAt&&r.cursorMs>=hour,eventId=canonicalOpportunityEventId(player,hour,record.candidate.slotId);
  if(r.nextOpportunityAt!==hour+(consumed?YARD_HOUR_MS:0))return false;
  const prior=lookup(r.canonicalVisitReceipts,eventId);
  return consumed?digest(prior)===digest(canonicalActiveHourReceipt(player,wrapper,record,hour)):prior===undefined;
 }catch{return false;}
}

export function canonicalVisitOriginalFor(record){
 const c=record.candidate;
 return {visitId:c.visitId,visitorId:c.visitorId,goodieId:c.goodieId,slotId:c.slotId,bowlId:record.before.bowl.id,
  pose:'peek',activityId:'peek',activityLayer:'back',activityKind:'stationary',stationary:true,entryEdge:'bottom',facing:'right',
  motionSeed:record.motionSeed,arrivedAt:c.arrivedAt,leavesAt:c.leavesAt};
}

/** Re-derive only the held visit's source economic projection. This is not
 * geometry replay and can never authenticate a plan for active presentation. */
function heldSourceProjectionValid(record){
 const c=record.candidate,rows=record.before?.rows,bowl=record.before?.bowl,food=lookup(YARD_FOODS,bowl?.foodId);
 if(c.visitorId!=='pip_hamster'||c.goodieId!=='leaf_pot'||c.activityId!=='peek'||!Array.isArray(rows)||rows.length!==1
  ||!canonicalVisitPlacementRowsValid(rows)||rows[0].slotId!==c.slotId||rows[0].placedAt>c.arrivedAt
  ||!object(bowl)||bowl.id!==CANONICAL_FOOD_CONTRACT.bowlId||!food||!integer(bowl.servings)||bowl.servings<1||bowl.servings>food.servings
  ||!integer(bowl.placedAt)||bowl.placedAt>c.arrivedAt||!integer(bowl.expiresAt)||bowl.expiresAt<=c.arrivedAt
  ||record.motionSeed!==digest(`${c.visitId}:motion`).slice(0,16))return false;
 const afterRows=clone(rows),afterBowl=clone(bowl);afterRows[0].uses+=1;
 if(afterRows[0].uses>=YARD_GOODIES.leaf_pot.durability)return false;
 afterBowl.servings-=1;if(afterBowl.servings===0)Object.assign(afterBowl,{foodId:null,servings:0,placedAt:null,expiresAt:null});
 return digest(record.after?.rows)===digest(afterRows)&&digest(record.after?.bowl)===digest(afterBowl);
}

/** Admission/active state may still earn its memento on departure. A completed
 * phase must already contain it. Both phases require source-shaped prior awards. */
export function canonicalVisitMementoStateValid({entry,mementos,visitor,arrivedAt,completedAt=null}){
 if(!object(entry)||!integer(entry.visits)||typeof entry.mementoReceived!=='boolean'||!object(mementos)
  ||!visitor?.memento||!integer(arrivedAt)||completedAt!==null&&(!integer(completedAt)||completedAt<=arrivedAt))return false;
 const memento=lookup(mementos,visitor.id);
 if(!entry.mementoReceived)return memento===undefined&&(completedAt===null||entry.visits<visitor.memento.threshold);
 return object(memento)&&entry.visits>=visitor.memento.threshold&&integer(memento.receivedAt)
  &&(memento.receivedAt<=arrivedAt||completedAt!==null&&memento.receivedAt===completedAt)
  &&digest(memento)===digest({id:visitor.memento.id,visitorId:visitor.id,name:visitor.memento.name,receivedAt:memento.receivedAt});
}

export function canonicalDepartureCheckpoint(wrapper){return {format:CANONICAL_DEPARTURE_CHECKPOINT_FORMAT,at:wrapper.leavesAt,visitId:wrapper.visitId,eventId:wrapper.eventId,giftId:wrapper.giftId};}

/** A 60-minute departure may finish before asynchronous preparation at that
 * same hour. Fully processed cursor remains below the hour; this typed receipt
 * checkpoint records the completed departure+expiry phase, without a rewind.
 * It never supplies active replay authority or authorizes a new lottery result.
 */
export function canonicalDepartureCheckpointValid(player){
 try{
  const r=player._yardV2.runtime,yard=player.yard,marker=r.canonicalDepartureCheckpoint;
  const future=Object.values(r.canonicalVisits).filter(w=>w.status===CANONICAL_HELD_DEPARTURE_STATUS||w.status==='completed'&&w.leavesAt>r.cursorMs);
  if(marker===undefined)return future.length===0;
  if(!object(marker)||future.length!==1||!integer(marker.at)||r.cursorMs>=marker.at||r.nextOpportunityAt!==marker.at
   ||yard.activeVisitors.length||Object.values(r.canonicalVisits).some(w=>w.status==='active'))return false;
  const w=lookup(r.canonicalVisits,marker.visitId),record=w?.proposal,c=record?.candidate;
  if(!w||future[0]!==w||w.format!=='yard-authoritative-canonical-visit/v1'||w.sourceHash!==VISIT_JOB_SOURCE_HASH||w.status!==CANONICAL_HELD_DEPARTURE_STATUS
   ||!c||c.visitId!==w.visitId||c.arrivedAt!==w.arrivedAt||c.leavesAt!==w.leavesAt||w.leavesAt!==w.arrivedAt+YARD_HOUR_MS
   ||w.giftId!==`gift_v2_${digest(c.visitId).slice(0,32)}`||!heldSourceProjectionValid(record)
   ||!inspectCanonicalLayoutAfterActions({wrapper:w,record,commandReceipts:r.commandReceipts,rows:r.canonicalPlacements,cursorMs:marker.at}).valid||digest(w.original)!==digest(canonicalVisitOriginalFor(record))
   ||digest(marker)!==digest(canonicalDepartureCheckpoint(w))||!object(record.before)||!Array.isArray(record.before.rows)||record.before.rows.length!==1)return false;
  const original=sourceSelection(r.seed,c.arrivedAt,record.before.rows[0],record.before.bowl);
  if(!original||digest(candidate(original,c.arrivedAt,record.before.rows[0]))!==digest(c)
   ||w.eventId!==canonicalOpportunityEventId(player,c.arrivedAt,c.slotId))return false;
  const expectedReceipt={eventId:w.eventId,visitId:w.visitId,kind:'admitted',at:w.arrivedAt,sourceHash:VISIT_JOB_SOURCE_HASH,completedAt:w.leavesAt,giftId:w.giftId};
  if(digest(lookup(r.canonicalVisitReceipts,w.eventId))!==digest(expectedReceipt)
   ||lookup(r.canonicalVisitReceipts,canonicalOpportunityEventId(player,marker.at,c.slotId))!==undefined)return false;
  const ledger=lookup(r.giftLedger,w.giftId),gift=ledger?.gift,visitor=YARD_VISITORS[c.visitorId],entry=lookup(yard.petbook,c.visitorId);
  if(!visitor||!object(entry)||!integer(entry.visits)||entry.visits<1||!object(entry.favoriteGoodies)
   ||!integer(entry.favoriteGoodies[c.goodieId])||entry.favoriteGoodies[c.goodieId]<1
   ||!integer(entry.firstSeenAt)||entry.firstSeenAt>w.arrivedAt||entry.lastSeenAt!==w.arrivedAt
   ||typeof entry.mementoReceived!=='boolean'||!object(yard.mementos)||!Array.isArray(yard.pendingGifts)||!yard.pendingGifts.every(object))return false;
  if(!canonicalVisitMementoStateValid({entry,mementos:yard.mementos,visitor,arrivedAt:w.arrivedAt,completedAt:w.leavesAt}))return false;
  const memento=lookup(yard.mementos,visitor.id),mementoId=memento?.receivedAt===w.leavesAt?visitor.memento.id:null;
  const expectedGift={id:w.giftId,visitorId:visitor.id,treats:randomInt(`${w.visitId}:treats`,...visitor.gift.treats),
   shinyTreats:randomUnit(`${w.visitId}:shiny`)<visitor.gift.shinyChance?1:0,mementoId,createdAt:w.leavesAt};
  const pending=yard.pendingGifts.filter(g=>g.id===w.giftId);
  if(!['earned','claimed'].includes(ledger?.status)||ledger.visitId!==w.visitId||digest(gift)!==digest(expectedGift)
   ||ledger.status==='earned'&&(pending.length!==1||digest(pending[0])!==digest(expectedGift))
   ||ledger.status==='claimed'&&pending.length!==0)return false;
  const food=inspectCanonicalBowlAfterActions({wrapper:{...w,status:'active'},record,commandReceipts:r.commandReceipts,bowl:yard.bowls[0],cursorMs:marker.at});
  return food.valid===true;
 }catch{return false;}
}

/** Finish only the validated current equal-time phase. Call before resolving
 * its opportunity changes clock/receipts; a failed admission uses a private draft. */
export function finishCanonicalDepartureCheckpoint(player){
 if(!canonicalDepartureCheckpointValid(player))return false;
 const r=player._yardV2.runtime,marker=r.canonicalDepartureCheckpoint;
 if(marker!==undefined){r.canonicalVisits[marker.visitId].status='completed';delete r.canonicalDepartureCheckpoint;}
 return true;
}
