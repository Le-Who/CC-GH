/** Startup-safe wire guards only: no renderer, geometry, catalogue or economics. */
export const CANONICAL_SAVED_FOOD_PENDING='CANONICAL_ACTION_RECONCILIATION_PENDING';
export const CANONICAL_SAVED_FOOD_ACTIONS=Object.freeze(['yard.buyFood','yard.setFood']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exactActions=v=>Array.isArray(v)&&v.length===2&&v[0]==='yard.buyFood'&&v[1]==='yard.setFood';
export function canonicalSavedFoodCapability(snapshot){
 const r=snapshot?.yardRuntime,c=r?.canonicalFoodActions;
 return !!snapshot?.player?.id&&r?.version===1&&r.storageVersion===3&&r.canonicalVisitProtocol==='yard-canonical-authoritative/v1'
  &&r.status==='ready'&&!r.error&&r.mutable===false&&r.actionProtocol==='yard-v2:'&&Number.isSafeInteger(r.serverNow)&&r.serverNow>=0
  &&object(c)&&Object.keys(c).sort().join(',')==='actions,enabled,protocol'&&c.protocol==='yard-canonical-food-actions/v1'
  &&c.enabled===true&&exactActions(c.actions)&&exactActions(r.supportedActions);
}
export function isCanonicalSavedFoodCommand(action,payload){
 if(!object(payload)||!['kibble','berry_plate','bonito_bowl'].includes(payload.foodId))return false;
 const fields=Object.keys(payload).sort().join(',');
 return action==='yard.buyFood'?fields==='foodId,qty'&&payload.qty===1:action==='yard.setFood'&&fields==='bowlId,foodId'&&payload.bowlId==='bowl-1';
}
export function isCanonicalSavedFoodIntent(item){return !!item&&/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(item.clientActionId)&&isCanonicalSavedFoodCommand(item.action,item.payload);}
export function canonicalSavedFoodPendingResult(item,result){return isCanonicalSavedFoodIntent(item)&&result?.error===CANONICAL_SAVED_FOOD_PENDING&&Number(result._httpStatus)===409;}
export function canonicalSavedFoodReplayAllowed(item,snapshot){
 if(!canonicalSavedFoodCapability(snapshot)||!isCanonicalSavedFoodIntent(item)||item.accountId!==snapshot.player.id)return false;
 const bindings=snapshot.yardRuntime.supportedBindings,id=item.payload.foodId;
 // Do not re-price/recheck stock on receipt replay: a lost acknowledgement may
 // already have consumed currency or stock. Server receipt lookup is authoritative.
 return item.action==='yard.buyFood'?bindings?.foods?.[id]?.buy===true:bindings?.foods?.[id]?.set===true&&bindings?.bowls?.['bowl-1']?.set===true;
}

/** Snapshot only the actual fresh HTTP permission scope. Later protected/cache
 * merges must not expand that grant for an already retained command. */
export function canonicalSavedFoodResumeWitness(snapshot){
 if(!canonicalSavedFoodCapability(snapshot))return null;
 const r=snapshot.yardRuntime;
 return structuredClone({player:{id:snapshot.player.id},yardRuntime:Object.fromEntries(['version','storageVersion','canonicalVisitProtocol','status','mutable','serverNow','actionProtocol','canonicalFoodActions','supportedActions','supportedBindings'].map(k=>[k,r[k]]))});
}

/** Only the narrow command-binding scope participates, never stock or prices. */
export function canonicalSavedFoodPermissionScope(snapshot){
 if(!canonicalSavedFoodCapability(snapshot))return null;
 const b=snapshot.yardRuntime.supportedBindings;
 return JSON.stringify([snapshot.player.id,...['kibble','berry_plate','bonito_bowl'].map(id=>[b?.foods?.[id]?.buy===true,b?.foods?.[id]?.set===true]),b?.bowls?.['bowl-1']?.set===true]);
}
