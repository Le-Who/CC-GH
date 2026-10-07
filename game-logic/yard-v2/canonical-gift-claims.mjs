/** Read-only guard for the existing source collectGifts handler. Completed
 * admission/ledger evidence and catalog reward derivation validate claims;
 * these checks never grant active-plan or geometry-replay authority. */
import {YARD_FOODS,YARD_GOODIES,YARD_VISITORS,getYardGoodieActivities} from './catalog.mjs';
import {selectOpportunity} from './opportunity-selection.mjs';
import {canonicalVisitPlacementRowsValid} from './canonical-visit-placement-contract.mjs';
import {canonicalOpportunityEventId,canonicalVisitOriginalFor,canonicalVisitMementoStateValid} from './canonical-unique-visit-clock.mjs';
import {VISIT_JOB_SOURCE_HASH} from './canonical-visit-job-contract.mjs';
import {digest,integer,lookup,compareText,randomInt,randomUnit} from './util.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const invalid=()=>({valid:false,code:'CANONICAL_GIFT_EVIDENCE_INVALID'});
function sourceClaimEvidence(r,now){
 const actions=r.actionReceipts??{},commands=r.commandReceipts,claimed=new Map();
 if(!object(actions)||!object(commands))return null;
 const evidence=new Set(),claimShape=r=>r?.action==='yard.collectGifts'||object(r)&&(Object.hasOwn(r,'giftIds')||Object.hasOwn(r,'collected'));
 for(const [id,command] of Object.entries(commands))if(command?.action==='yard.collectGifts'&&command.status===200||claimShape(command?.extras?.receipt))evidence.add(id);
 for(const [id,receipt] of Object.entries(actions))if(claimShape(receipt))evidence.add(id);
 for(const id of evidence){
  const receipt=lookup(actions,id),command=lookup(commands,id);
  if(!object(receipt)||receipt.action!=='yard.collectGifts'||receipt.actionId!==id||!/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(id)||!integer(receipt.at)||receipt.at>now
   ||!Array.isArray(receipt.giftIds)||new Set(receipt.giftIds).size!==receipt.giftIds.length
   ||command?.format!=='yard-action-receipt/v1'||command.action!=='yard.collectGifts'||command.actionId!==id||command.status!==200||command.at!==receipt.at
   ||Object.hasOwn(command,'error')||typeof command.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(command.requestHash)
   ||digest(command.extras?.receipt)!==digest(receipt)||digest(command.extras?.collected)!==digest(receipt.collected))return null;
  const total={treats:0,shinyTreats:0,gifts:0};
  for(const giftId of receipt.giftIds){
   const ledger=lookup(r.giftLedger,giftId);
   if(typeof giftId!=='string'||claimed.has(giftId)||ledger?.status!=='claimed'||ledger.claimedAt!==receipt.at||!object(ledger.gift))return null;
   total.treats+=ledger.gift.treats;total.shinyTreats+=ledger.gift.shinyTreats;total.gifts++;
   if(!integer(total.treats)||!integer(total.shinyTreats))return null;
   claimed.set(giftId,id);
  }
  if(digest(receipt.collected)!==digest(total))return null;
 }
 return claimed;
}
export function inspectCanonicalGiftClaims(player,{now}={}){
 try{
  const r=player._yardV2.runtime,y=player.yard;
  if(!integer(now)||!object(r.giftLedger)||!object(r.canonicalVisits)||!object(r.canonicalVisitReceipts)
   ||!object(y.petbook)||!object(y.mementos)||!Array.isArray(y.pendingGifts))return invalid();
  for(const w of Object.values(r.canonicalVisits))if(w?.status==='completed'&&lookup(r.giftLedger,w.giftId)===undefined)return invalid();
  const claimed=sourceClaimEvidence(r,now);if(!claimed)return invalid();
  const pending=new Map();
  for(const gift of y.pendingGifts){if(!object(gift)||typeof gift.id!=='string'||pending.has(gift.id))return invalid();pending.set(gift.id,gift);}
  for(const [giftId,ledger] of Object.entries(r.giftLedger)){
   const w=lookup(r.canonicalVisits,ledger?.visitId),record=w?.proposal,c=record?.candidate;
   if(!object(ledger)||!['earned','claimed'].includes(ledger.status)||w?.status!=='completed'||w.format!=='yard-authoritative-canonical-visit/v1'
    ||w.sourceHash!==VISIT_JOB_SOURCE_HASH||record?.format!=='yard-canonical-saved-visit/v2'||record.status!=='prepared-inactive'||record.authoritative!==false||record.requiredContainerVersion!==3
    ||!c||c.visitId!==w.visitId||c.visitorId!=='pip_hamster'||c.goodieId!=='leaf_pot'||c.activityId!=='peek'
    ||!integer(c.arrivedAt)||!integer(c.leavesAt)||c.leavesAt<=c.arrivedAt||c.leavesAt>now||w.arrivedAt!==c.arrivedAt||w.leavesAt!==c.leavesAt
    ||giftId!==w.giftId||giftId!==`gift_v2_${digest(c.visitId).slice(0,32)}`||record.motionSeed!==digest(`${c.visitId}:motion`).slice(0,16)
    ||digest(w.original)!==digest(canonicalVisitOriginalFor(record)))return invalid();
   const rows=record.before?.rows,bowl=record.before?.bowl;
   if(!Array.isArray(rows)||rows.length!==1||!canonicalVisitPlacementRowsValid(rows)||rows[0].slotId!==c.slotId||rows[0].placedAt>c.arrivedAt
    ||!object(bowl)||!lookup(YARD_FOODS,bowl.foodId)||!integer(bowl.servings)||bowl.servings<1||!integer(bowl.placedAt)||bowl.placedAt>c.arrivedAt||!integer(bowl.expiresAt)||bowl.expiresAt<=c.arrivedAt)return invalid();
   const goodie=YARD_GOODIES[c.goodieId],selected=selectOpportunity({seed:r.seed,at:c.arrivedAt,placed:rows[0],goodie,
    available:getYardGoodieActivities(goodie,rows[0].condition).sort((a,b)=>compareText(a.id,b.id)),bowls:[bowl],n:0});
   if(!selected||selected.id!==c.visitId||selected.visitor.id!==c.visitorId||selected.activity.id!==c.activityId||selected.leavesAt!==c.leavesAt
    ||w.eventId!==canonicalOpportunityEventId(player,c.arrivedAt,c.slotId))return invalid();
   const receipt={eventId:w.eventId,visitId:w.visitId,kind:'admitted',at:w.arrivedAt,sourceHash:VISIT_JOB_SOURCE_HASH,completedAt:w.leavesAt,giftId};
   if(digest(lookup(r.canonicalVisitReceipts,w.eventId))!==digest(receipt))return invalid();
   const visitor=YARD_VISITORS[c.visitorId],entry=lookup(y.petbook,c.visitorId),memento=lookup(y.mementos,c.visitorId);
   if(!object(entry)||!integer(entry.visits)||entry.visits<1||!object(entry.favoriteGoodies)||!integer(entry.favoriteGoodies[c.goodieId])||entry.favoriteGoodies[c.goodieId]<1
    ||!integer(entry.firstSeenAt)||entry.firstSeenAt>w.arrivedAt||!integer(entry.lastSeenAt)||entry.lastSeenAt<w.arrivedAt||entry.lastSeenAt>now
    ||!canonicalVisitMementoStateValid({entry,mementos:y.mementos,visitor,arrivedAt:now}))return invalid();
   const expected={id:giftId,visitorId:c.visitorId,treats:randomInt(`${w.visitId}:treats`,...visitor.gift.treats),
    shinyTreats:randomUnit(`${w.visitId}:shiny`)<visitor.gift.shinyChance?1:0,mementoId:memento?.receivedAt===w.leavesAt?visitor.memento.id:null,createdAt:w.leavesAt};
   if(digest(ledger.gift)!==digest(expected))return invalid();
   if(ledger.status==='earned'){if(digest(pending.get(giftId))!==digest(expected))return invalid();pending.delete(giftId);}
   else if(!claimed.has(giftId)||pending.has(giftId)||!integer(ledger.claimedAt)||ledger.claimedAt<w.leavesAt||ledger.claimedAt>now)return invalid();
  }
  return pending.size?invalid():{valid:true};
 }catch{return invalid();}
}
