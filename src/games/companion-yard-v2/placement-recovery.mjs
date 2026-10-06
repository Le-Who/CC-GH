import {CANONICAL_LOCATION,isCanonicalItemIntent,isCanonicalItemNonce} from '../../game-state/canonicalYardItems.mjs';
/** UI guards only. The public outbox keeps sole ownership of nonce and payload. */
export const LOCAL_PLACEMENT_ERRORS=new Set(['OUTBOX_STORAGE_UNAVAILABLE','OUTBOX_STORAGE_INVALID','ACCOUNT_REQUIRED','ACCOUNT_CHANGED']);
export function ownsPlacement(state,ghost){
  return !!ghost&&!!ghost.ownerAccountId&&state.snapshot?.player?.id===ghost.ownerAccountId&&state.accountSession===ghost.ownerSession;
}
export function placementCommand(ghost){
  const canonical=isCanonicalItemIntent(ghost);
  return{action:ghost.placing?'yard.placeGoodie':'yard.moveGoodie',payload:{slotId:ghost.slotId,...(!canonical||ghost.placing?{goodieId:ghost.goodieId}:{}),x:ghost.x,y:ghost.y,...(canonical?Object.fromEntries(Object.keys(CANONICAL_LOCATION).map(key=>[key,ghost[key]])):{})}};
}
export function pendingPlacement(state,ghost){
  if(!ownsPlacement(state,ghost))return null;
  const {action,payload}=placementCommand(ghost);
  return(state.pendingActions||[]).find(item=>item.status!=='failed'&&item.accountId===ghost.ownerAccountId&&item.action===action
    &&(!isCanonicalItemIntent(payload)||isCanonicalItemNonce(item.clientActionId))
    &&Object.keys(item.payload||{}).length===Object.keys(payload).length&&Object.entries(payload).every(([key,value])=>item.payload[key]===value))||null;
}
export function retryablePlacement(state,ghost){
  const item=pendingPlacement(state,ghost);
  if(!item||ghost.recoveryNonce!==item.clientActionId||!String(item.clientActionId).startsWith('yard-v2:')
    ||state.outboxStorageError!=='OUTBOX_STORAGE_UNAVAILABLE'||!['pending','sending'].includes(item.status)||item.requiresYardResume
    ||(state.pendingActions||[]).filter(row=>row.status!=='failed').length!==1)return null;
  return item;
}
export function recoverPlacement(state){
  const pending=(state.pendingActions||[]).filter(item=>item.status!=='failed');
  if(pending.length!==1||state.outboxStorageError!=='OUTBOX_STORAGE_UNAVAILABLE')return null;
  const item=pending[0],payload=item.payload||{};
  if(item.accountId!==state.snapshot?.player?.id||!['yard.placeGoodie','yard.moveGoodie'].includes(item.action)
    ||!validPlacementPayload(item)
    ||!Number.isFinite(payload.x)||!Number.isFinite(payload.y))return null;
  const ghost={...payload,...(isCanonicalItemIntent(payload)?{goodieId:'leaf_pot'}:{}),placing:item.action==='yard.placeGoodie',ownerAccountId:item.accountId,ownerSession:state.accountSession,recoveryNonce:item.clientActionId};
  return retryablePlacement(state,ghost)?ghost:null;
}

function validPlacementPayload(item){
 const p=item.payload||{},canonical=isCanonicalItemIntent(p,item.clientActionId);
 if(!canonical)return Object.keys(p).length===4&&['slotId','goodieId'].every(key=>typeof p[key]==='string'&&p[key]);
 return isCanonicalItemNonce(item.clientActionId)&&Object.keys(p).length===(item.action==='yard.placeGoodie'?7:6)
  &&Object.entries(CANONICAL_LOCATION).every(([key,v])=>p[key]===v)&&/^canonical:[A-Za-z0-9_.:-]{1,80}$/.test(p.slotId)
  &&(item.action!=='yard.placeGoodie'||p.goodieId==='leaf_pot');
}
