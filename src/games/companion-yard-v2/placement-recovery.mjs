/** UI guards only. The public outbox keeps sole ownership of nonce and payload. */
export const LOCAL_PLACEMENT_ERRORS=new Set(['OUTBOX_STORAGE_UNAVAILABLE','OUTBOX_STORAGE_INVALID','ACCOUNT_REQUIRED','ACCOUNT_CHANGED']);
export function ownsPlacement(state,ghost){
  return !!ghost&&!!ghost.ownerAccountId&&state.snapshot?.player?.id===ghost.ownerAccountId&&state.accountSession===ghost.ownerSession;
}
export function placementCommand(ghost){
  return{action:ghost.placing?'yard.placeGoodie':'yard.moveGoodie',payload:{slotId:ghost.slotId,goodieId:ghost.goodieId,x:ghost.x,y:ghost.y}};
}
export function pendingPlacement(state,ghost){
  if(!ownsPlacement(state,ghost))return null;
  const {action,payload}=placementCommand(ghost);
  return(state.pendingActions||[]).find(item=>item.status!=='failed'&&item.accountId===ghost.ownerAccountId&&item.action===action
    &&Object.keys(item.payload||{}).length===4&&Object.entries(payload).every(([key,value])=>item.payload[key]===value))||null;
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
    ||Object.keys(payload).length!==4||!['slotId','goodieId'].every(key=>typeof payload[key]==='string'&&payload[key])
    ||!Number.isFinite(payload.x)||!Number.isFinite(payload.y))return null;
  const ghost={...payload,placing:item.action==='yard.placeGoodie',ownerAccountId:item.accountId,ownerSession:state.accountSession,recoveryNonce:item.clientActionId};
  return retryablePlacement(state,ghost)?ghost:null;
}
