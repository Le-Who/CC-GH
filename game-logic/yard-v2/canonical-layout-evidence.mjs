/** Read-only extension of the existing command receipt journal. This bounded
 * format proves only removal of the sole released target, never item movement,
 * admission, ownership acquisition, or a new command capability. Source replay
 * and the complete fresh-transaction visitor inspector remain prerequisites. */
import {clone,digest,integer} from './util.mjs';
import {isCanonicalItemNonce} from './canonical-locations.mjs';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from './canonical-food-protocol.mjs';

export const CANONICAL_RELEASED_PICKUP_FORMAT='yard-canonical-released-pickup/v1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const invalid=()=>({valid:false,code:'CANONICAL_LAYOUT_EVIDENCE_INVALID'});
const sameScope=value=>Object.entries(CANONICAL_FOOD_LOCATION).every(([k,v])=>value?.[k]===v);
function payloadValid(receipt,extension,actionId){
 const payload=extension.payload;if(!object(payload))return false;
 if(/^[A-Za-z0-9_.:-]+$/.test(actionId))return Object.keys(payload).join(',')==='slotId';
 return isCanonicalItemNonce(actionId)&&actionId.startsWith(CANONICAL_FOOD_NONCE_PREFIX)
  &&Object.keys(payload).sort().join(',')===[...Object.keys(CANONICAL_FOOD_LOCATION),'slotId'].sort().join(',')
  &&sameScope(payload)&&sameScope(receipt)&&sameScope(receipt.extras);
}

export function inspectCanonicalLayoutAfterActions({wrapper,record,commandReceipts,rows,cursorMs}={}){
 try{
  if(!object(wrapper)||!object(record)||!object(record.candidate)||!object(commandReceipts)
   ||!Array.isArray(rows)||!Array.isArray(record.after?.rows)||record.after.rows.length!==1
   ||!integer(record.candidate.arrivedAt)||!integer(record.candidate.leavesAt)||record.candidate.leavesAt<=record.candidate.arrivedAt
   ||record.releaseAt!==record.candidate.arrivedAt+Math.ceil((record.candidate.leavesAt-record.candidate.arrivedAt)*.84)
   ||!integer(cursorMs)||cursorMs<record.candidate.arrivedAt
   ||wrapper.visitId!==record.candidate.visitId||wrapper.arrivedAt!==record.candidate.arrivedAt
   ||wrapper.leavesAt!==record.candidate.leavesAt||wrapper.releaseAt!==record.releaseAt
   ||typeof wrapper.eventId!=='string'||!wrapper.eventId||digest(wrapper.proposal)!==digest(record))return invalid();
  const target=record.after.rows[0];
  if(!object(target)||target.slotId!==record.candidate.slotId||target.goodieId!==record.candidate.goodieId)return invalid();
  const pickups=[];
  for(const [actionId,receipt] of Object.entries(commandReceipts)){
   const extension=receipt?.canonicalLayout;
   if(!object(extension)||extension.visitId!==wrapper.visitId&&extension.eventId!==wrapper.eventId)continue;
   if(!(/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(actionId)||isCanonicalItemNonce(actionId))||!object(receipt)
    ||receipt.format!=='yard-action-receipt/v1'||receipt.actionId!==actionId||receipt.action!=='yard.pickupGoodie'
    ||receipt.status!==200||Object.hasOwn(receipt,'error')||!integer(receipt.at)
    ||receipt.at<record.releaseAt||receipt.at>=record.candidate.leavesAt||receipt.at>cursorMs
    ||extension.format!==CANONICAL_RELEASED_PICKUP_FORMAT||extension.visitId!==wrapper.visitId||extension.eventId!==wrapper.eventId
    ||!payloadValid(receipt,extension,actionId)||extension.payload.slotId!==target.slotId
    ||receipt.requestHash!==digest({action:'yard.pickupGoodie',payload:extension.payload})
    ||receipt.extras?.slotId!==target.slotId||receipt.extras?.goodieId!==target.goodieId)return invalid();
   pickups.push({actionId,at:receipt.at});
  }
  const hasPointer=Object.hasOwn(wrapper,'releasedPickupActionId');
  if(!pickups.length)return !hasPointer&&digest(rows)===digest(record.after.rows)?{valid:true,pickupAt:null}:invalid();
  if(pickups.length!==1||!hasPointer||wrapper.releasedPickupActionId!==pickups[0].actionId||rows.length!==0)return invalid();
  return {valid:true,pickupAt:pickups[0].at};
 }catch{return invalid();}
}

/** Same-time commands occur after source catch-up. An opportunity therefore
 * sees rows from strictly earlier commands; ordinary presentation includes it. */
export function canonicalLayoutRowsAt(record,proof,at,{beforeCommands=false}={}){
 if(!proof?.valid||!integer(at))throw Error('CANONICAL_LAYOUT_EVIDENCE_INVALID');
 return proof.pickupAt!==null&&(beforeCommands?proof.pickupAt<at:proof.pickupAt<=at)?[]:clone(record.after.rows);
}
