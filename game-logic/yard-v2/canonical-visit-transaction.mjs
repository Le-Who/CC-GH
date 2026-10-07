/** Atomic v3 one-visit effects. The caller owns a fresh withPlayerLock snapshot
 * and supplies evidence freshly looked up by the source-owned reconciler.
 * No legacy conversion, wall-clock acceleration, planner or storage writer.
 */
import {YARD_HOUR_MS,YARD_GOODIES,YARD_VISITORS} from './catalog.mjs';
import {clone,digest,integer,assertInteger,addCount,randomInt,randomUnit,put,lookup} from './util.mjs';
import {VISIT_JOB_SOURCE_HASH} from './canonical-visit-job-contract.mjs';
export const CANONICAL_VISIT_ADMISSION_ENABLED=false;
export const CANONICAL_VISIT_WRAPPER='yard-authoritative-canonical-visit/v1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=code=>({state:'unavailable',prepared:false,ready:false,admission:false,retryable:true,code});
const sort=rows=>clone(rows).sort((a,b)=>a.slotId<b.slotId?-1:a.slotId>b.slotId?1:0);

function originalFor(record){
 const c=record.candidate;
 return {visitId:c.visitId,visitorId:c.visitorId,goodieId:c.goodieId,slotId:c.slotId,bowlId:record.before.bowl.id,
  pose:'peek',activityId:'peek',activityLayer:'back',activityKind:'stationary',stationary:true,entryEdge:'bottom',facing:'right',
  motionSeed:record.motionSeed,arrivedAt:c.arrivedAt,leavesAt:c.leavesAt};
}
function receiptFor(wrapper){return {eventId:wrapper.eventId,visitId:wrapper.visitId,kind:'admitted',at:wrapper.arrivedAt,sourceHash:VISIT_JOB_SOURCE_HASH};}
function expireAt(bowl,at){if(bowl.foodId&&integer(bowl.expiresAt)&&bowl.expiresAt<=at)Object.assign(bowl,{foodId:null,servings:0,placedAt:null,expiresAt:null});}

function commitPreparedCanonicalVisitDraft(player,evidence,{now}={}){
 if(!CANONICAL_VISIT_ADMISSION_ENABLED)return fail('CANONICAL_VISIT_ADMISSION_DISABLED');
 const store=player?._yardV2,runtime=store?.runtime,yard=player?.yard,intent=runtime?.canonicalPending,record=evidence?.artifact?.record;
 if(store?.version!==3||!object(runtime)||!object(yard)||!intent||evidence?.state!=='prepared'
  ||evidence.execution?.sourceHash!==VISIT_JOB_SOURCE_HASH||!integer(now))return fail('COMMIT_EVIDENCE_REQUIRED');
 const candidate=record?.candidate;
 if(record?.status!=='prepared-inactive'||record.authoritative!==false||record.requiredContainerVersion!==3
  ||record.economicIntent?.committed!==false||!candidate||digest(candidate)!==digest(intent.input.candidate)
  ||digest(sort(runtime.canonicalPlacements))!==digest(record.before.rows)||digest(record.before.rows)!==digest(intent.input.rows)
  ||runtime.canonicalPlacements.length!==1||runtime.nextOpportunityAt!==candidate.arrivedAt||runtime.cursorMs>=candidate.arrivedAt)
  return fail('COMMIT_STATE_OBSOLETE');
 if(candidate.leavesAt>=candidate.arrivedAt+YARD_HOUR_MS)return fail('CROSS_OPPORTUNITY_STAY_UNQUALIFIED');
 if(now<candidate.arrivedAt||now>=candidate.leavesAt)return fail('COMMIT_VISIT_TIME_UNAVAILABLE');
 if(!object(runtime.canonicalVisits)||!object(runtime.canonicalVisitReceipts)||Object.values(runtime.canonicalVisits).some(v=>v.status!=='completed')
  ||!object(runtime.giftLedger)||!object(runtime.visits)||Object.values(runtime.visits).some(v=>!object(v)||!['completed','historical-unknown'].includes(v.status))
  ||!Array.isArray(yard.placedGoodies)||yard.placedGoodies.length||!Array.isArray(yard.activeVisitors)||yard.activeVisitors.length)return fail('COMMIT_RESERVATION_UNAVAILABLE');
 const prior=lookup(runtime.canonicalVisitReceipts,intent.eventId);
 if(prior!==undefined||lookup(runtime.canonicalVisits,candidate.visitId)!==undefined)return fail('COMMIT_IDENTITY_ALREADY_USED');
 const bowls=yard.bowls.filter(b=>b.id===record.before.bowl.id),target=runtime.canonicalPlacements.find(r=>r.slotId===candidate.slotId);
 if(bowls.length!==1||digest(bowls[0])!==digest(record.before.bowl)||!target||target.goodieId!==candidate.goodieId
  ||!integer(target.uses)||target.condition!=='new'||target.uses+1>=YARD_GOODIES.leaf_pot.durability
  ||!integer(bowls[0].servings)||bowls[0].servings<1||bowls[0].expiresAt<=candidate.arrivedAt
  ||target.placedAt>candidate.arrivedAt)return fail('COMMIT_ECONOMY_OBSOLETE');
 if(!object(yard.petbook)||!Array.isArray(yard.pendingGifts)||!yard.pendingGifts.every(g=>object(g)&&typeof g.id==='string'&&integer(g.treats)&&integer(g.shinyTreats)&&integer(g.createdAt))||!object(yard.mementos))return fail('COMMIT_ECONOMY_REQUIRES_REVIEW');
 const visitor=YARD_VISITORS[candidate.visitorId];
 if(!visitor||candidate.visitorId!=='pip_hamster'||candidate.goodieId!=='leaf_pot'||candidate.activityId!=='peek')return fail('COMMIT_BINDING_UNSUPPORTED');
 const existing=lookup(yard.petbook,visitor.id),entry=existing===undefined?{visits:0,firstSeenAt:candidate.arrivedAt,lastSeenAt:candidate.arrivedAt,favoriteGoodies:{},mementoReceived:false}:clone(existing);
 if(!object(entry)||!integer(entry.visits)||!integer(entry.visits+1)||!object(entry.favoriteGoodies)
  ||!integer(lookup(entry.favoriteGoodies,candidate.goodieId)??0)||!integer((lookup(entry.favoriteGoodies,candidate.goodieId)??0)+1)
  ||!integer(entry.firstSeenAt??candidate.arrivedAt)||(entry.firstSeenAt??candidate.arrivedAt)>candidate.arrivedAt
  ||!integer(entry.lastSeenAt)||entry.lastSeenAt>candidate.arrivedAt||typeof entry.mementoReceived!=='boolean')return fail('COMMIT_PETBOOK_REQUIRES_REVIEW');
 if(record.releaseAt!==candidate.arrivedAt+Math.ceil((candidate.leavesAt-candidate.arrivedAt)*.84)
  ||record.economicIntent.servings!==1||record.economicIntent.itemUses!==1||record.economicIntent.petbookVisitDelta!==1
  ||record.economicIntent.giftCreationAt!==candidate.leavesAt||record.economicIntent.giftId!==`gift_v2_${digest(candidate.visitId).slice(0,32)}`)
  return fail('COMMIT_PROJECTED_EFFECT_MISMATCH');
 const original=originalFor(record);
 const wrapper={format:CANONICAL_VISIT_WRAPPER,sourceHash:VISIT_JOB_SOURCE_HASH,visitId:candidate.visitId,original,status:'active',
  arrivedAt:candidate.arrivedAt,leavesAt:candidate.leavesAt,releaseAt:record.releaseAt,giftId:record.economicIntent.giftId,
  eventId:intent.eventId,proposal:clone(record)};
 // Validate every prospective value before changing the fresh player. Preserve
 // unknown metadata by editing current rows rather than assigning proposal.after.
 const receipt={eventId:intent.eventId,visitId:candidate.visitId,kind:'admitted',at:candidate.arrivedAt,sourceHash:VISIT_JOB_SOURCE_HASH};
 assertInteger(candidate.arrivedAt+YARD_HOUR_MS,'next opportunity');
 entry.visits+=1;entry.firstSeenAt??=candidate.arrivedAt;entry.lastSeenAt=candidate.arrivedAt;addCount(entry.favoriteGoodies,target.goodieId,1);
 target.uses+=1;bowls[0].servings-=1;
 if(bowls[0].servings===0)Object.assign(bowls[0],{foodId:null,servings:0,placedAt:null,expiresAt:null});
 put(yard.petbook,visitor.id,entry);yard.activeVisitors.push(clone(original));put(runtime.canonicalVisits,candidate.visitId,wrapper);
 put(runtime.canonicalVisitReceipts,intent.eventId,receipt);delete runtime.canonicalPending;
 runtime.cursorMs=candidate.arrivedAt;runtime.nextOpportunityAt=candidate.arrivedAt+YARD_HOUR_MS;yard.lastSimulatedAt=runtime.cursorMs;
 return {state:'admitted',prepared:true,ready:true,admission:true,visitId:candidate.visitId,eventId:receipt.eventId};
}

/** Validate the complete prospective admission against the same replay guards
 * before atomically assigning fresh Yard-owned fields. This prevents a debit
 * whose just-created save cannot be read back. No caller/player-wide clone is
 * ever written and no proposal.after object replaces current inventory. */
export function commitPreparedCanonicalVisit(player,evidence,options={}){
 if(!CANONICAL_VISIT_ADMISSION_ENABLED)return fail('CANONICAL_VISIT_ADMISSION_DISABLED');
 try{
  const draft={...player,yard:clone(player.yard),_yardV2:clone(player._yardV2)};
  const result=commitPreparedCanonicalVisitDraft(draft,evidence,options);if(result.state!=='admitted')return result;
  const checked=inspectReplayedCanonicalVisit(draft,evidence,{now:options.now});if(!checked.valid)return checked;
  player.yard=draft.yard;player._yardV2=draft._yardV2;return result;
 }catch{return fail('ADMISSION_STATE_REQUIRES_REVIEW');}
}

/** Existing admitted records still need source replay and exact-once completion
 * if future new-admission is disabled. This function never creates a visit.
 */
export function inspectReplayedCanonicalVisit(player,evidence,{now}={}){
 const runtime=player?._yardV2?.runtime,yard=player?.yard,record=evidence?.artifact?.record;
 if(player?._yardV2?.version!==3||evidence?.state!=='prepared'||evidence.execution?.sourceHash!==VISIT_JOB_SOURCE_HASH||!integer(now))return fail('REPLAY_EVIDENCE_REQUIRED');
 const wrapper=lookup(runtime?.canonicalVisits,record?.candidate?.visitId);
 if(!wrapper||wrapper.format!==CANONICAL_VISIT_WRAPPER||wrapper.sourceHash!==VISIT_JOB_SOURCE_HASH||wrapper.status!=='active'
  ||!object(wrapper.original)||!Array.isArray(yard?.activeVisitors)||!object(yard.activeVisitors.find(v=>v?.visitId===wrapper.visitId))
  ||digest(wrapper.proposal)!==digest(record)||wrapper.visitId!==record.candidate.visitId||wrapper.leavesAt!==record.candidate.leavesAt
  ||wrapper.original.visitorId!==record.candidate.visitorId||wrapper.original.slotId!==record.candidate.slotId||wrapper.original.goodieId!==record.candidate.goodieId
  ||wrapper.arrivedAt!==record.candidate.arrivedAt||wrapper.releaseAt!==record.releaseAt||wrapper.giftId!==record.economicIntent.giftId||digest(wrapper.original)!==digest(yard.activeVisitors.find(v=>v.visitId===wrapper.visitId)))return fail('REPLAY_WRAPPER_MISMATCH');
 if(!integer(runtime.cursorMs)||runtime.cursorMs<wrapper.arrivedAt||runtime.cursorMs>=wrapper.leavesAt||now<runtime.cursorMs
  ||runtime.nextOpportunityAt!==wrapper.arrivedAt+YARD_HOUR_MS||runtime.nextOpportunityAt<=wrapper.leavesAt)return fail('EARLIER_OPPORTUNITY_UNRESOLVED');
 const visitor=YARD_VISITORS[wrapper.original.visitorId],entry=lookup(yard.petbook,visitor?.id);
 if(!visitor||!object(entry)||!integer(entry.visits)||entry.visits<1||!object(entry.favoriteGoodies)
  ||!integer(entry.favoriteGoodies[record.candidate.goodieId])||entry.favoriteGoodies[record.candidate.goodieId]<1
  ||!integer(entry.firstSeenAt)||entry.firstSeenAt>wrapper.arrivedAt||entry.lastSeenAt!==wrapper.arrivedAt
  ||typeof entry.mementoReceived!=='boolean'||!object(yard.mementos)||!Array.isArray(yard.pendingGifts)||!yard.pendingGifts.every(object)||!object(runtime.giftLedger)
  ||!object(runtime.canonicalVisitReceipts)||!object(lookup(runtime.canonicalVisitReceipts,wrapper.eventId))||digest(lookup(runtime.canonicalVisitReceipts,wrapper.eventId))!==digest(receiptFor(wrapper))
  ||digest(wrapper.original)!==digest(originalFor(record))||yard.activeVisitors.length!==1
  ||!Array.isArray(yard.bowls)||yard.bowls.length!==1)return fail('OUTCOME_STATE_REQUIRES_REVIEW');
 const expectedBowl=clone(record.after.bowl);expireAt(expectedBowl,runtime.cursorMs);
 if(digest(yard.bowls[0])!==digest(expectedBowl))return fail('SAVED_ECONOMY_MISMATCH');
 const giftId=wrapper.giftId,prior=lookup(runtime.giftLedger,giftId),pendingGift=yard.pendingGifts.find(g=>g.id===giftId);
 if(prior!==undefined||pendingGift)return fail('OUTCOME_ALREADY_EXISTS_FOR_ACTIVE_VISIT');
 return {valid:true,wrapper,visitor,entry,giftId};
}
export function completeReplayedCanonicalVisit(player,evidence,{now}={}){
 const checked=inspectReplayedCanonicalVisit(player,evidence,{now});if(!checked.valid)return checked;
 const {wrapper,visitor,entry,giftId}=checked,runtime=player._yardV2.runtime,yard=player.yard;
 if(now<wrapper.leavesAt){
  expireAt(yard.bowls[0],now);runtime.cursorMs=now;yard.lastSimulatedAt=now;
  return {state:'active',prepared:true,ready:true,admission:false,visitId:wrapper.visitId};
 }
 let mementoId=null;
 if(!entry.mementoReceived&&!lookup(yard.mementos,visitor.id)&&entry.visits>=visitor.memento.threshold)mementoId=visitor.memento.id;
 const gift={id:giftId,visitorId:visitor.id,treats:randomInt(`${wrapper.visitId}:treats`,...visitor.gift.treats),
  shinyTreats:randomUnit(`${wrapper.visitId}:shiny`)<visitor.gift.shinyChance?1:0,mementoId,createdAt:wrapper.leavesAt};
 if(mementoId){entry.mementoReceived=true;put(yard.mementos,visitor.id,{id:mementoId,visitorId:visitor.id,name:visitor.memento.name,receivedAt:wrapper.leavesAt});}
 yard.pendingGifts.push(gift);put(runtime.giftLedger,giftId,{status:'earned',visitId:wrapper.visitId,gift:clone(gift)});
 expireAt(yard.bowls[0],wrapper.leavesAt);
 wrapper.status='completed';yard.activeVisitors=yard.activeVisitors.filter(v=>v.visitId!==wrapper.visitId);
 runtime.canonicalVisitReceipts[wrapper.eventId]={...runtime.canonicalVisitReceipts[wrapper.eventId],completedAt:wrapper.leavesAt,giftId};
 runtime.cursorMs=Math.max(runtime.cursorMs,wrapper.leavesAt);yard.lastSimulatedAt=runtime.cursorMs;
 return {state:'completed',prepared:true,ready:true,admission:false,visitId:wrapper.visitId,giftId};
}
