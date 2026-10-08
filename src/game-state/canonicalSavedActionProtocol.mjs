/** Explicit saved food/inventory wire union. The existing outbox still owns
 * account fencing, durable nonces and retries; no general Yard grant is made. */
import {CANONICAL_SAVED_FOOD_ACTIONS,canonicalSavedFoodCapability,canonicalSavedFoodReplayAllowed,isCanonicalSavedFoodIntent} from './canonicalSavedFoodProtocol.mjs';
import {canonicalSavedPickupDescriptor} from './canonicalSavedPickupProtocol.mjs';
export const CANONICAL_SAVED_INVENTORY_ACTIONS=Object.freeze(['yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
function foodScope(snapshot){
 const r=snapshot?.yardRuntime,c=r?.canonicalInventoryActions,pickup=r?.canonicalPickupActions;
 if(pickup!==undefined&&!canonicalSavedPickupDescriptor(pickup))return null;
 if(c===undefined)return snapshot;
 if(!object(c)||Object.keys(c).sort().join(',')!=='actions,enabled,protocol'||c.protocol!=='yard-canonical-inventory-actions/v1'||c.enabled!==true
  ||!same(c.actions,CANONICAL_SAVED_INVENTORY_ACTIONS)||!same(r.supportedActions,[...CANONICAL_SAVED_FOOD_ACTIONS,...CANONICAL_SAVED_INVENTORY_ACTIONS,...(pickup?['yard.pickupGoodie']:[])]))return null;
 return {...snapshot,yardRuntime:{...r,supportedActions:[...CANONICAL_SAVED_FOOD_ACTIONS]}};
}
export function canonicalSavedActionCapability(snapshot){const food=foodScope(snapshot);return !!food&&canonicalSavedFoodCapability(food);}
export function isCanonicalSavedInventoryIntent(item){
 if(!item||!/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(item.clientActionId)||!object(item.payload))return false;
 const fields=Object.keys(item.payload).sort().join(',');
 return item.action==='yard.buyGoodie'?fields==='goodieId'&&typeof item.payload.goodieId==='string'&&item.payload.goodieId.length>0
  :['yard.collectGifts','yard.claimDailyLetter'].includes(item.action)&&fields==='';
}
export function canonicalSavedActionPendingResult(item,result){
 return (isCanonicalSavedFoodIntent(item)||isCanonicalSavedInventoryIntent(item))&&result?.error==='CANONICAL_ACTION_RECONCILIATION_PENDING'&&Number(result._httpStatus)===409;
}
export function canonicalSavedActionReplayAllowed(item,snapshot){
 if(!canonicalSavedActionCapability(snapshot)||item?.accountId!==snapshot.player.id)return false;
 if(isCanonicalSavedFoodIntent(item))return canonicalSavedFoodReplayAllowed(item,foodScope(snapshot));
 if(!isCanonicalSavedInventoryIntent(item)||!snapshot.yardRuntime.canonicalInventoryActions)return false;
 return item.action!=='yard.buyGoodie'||Object.hasOwn(snapshot.yardRuntime.supportedBindings?.goodies||{},item.payload.goodieId)
  &&snapshot.yardRuntime.supportedBindings.goodies[item.payload.goodieId]?.buy===true;
}
export function canonicalSavedActionResumeWitness(snapshot){
 if(!canonicalSavedActionCapability(snapshot))return null;
 const r=snapshot.yardRuntime;
 return structuredClone({player:{id:snapshot.player.id},yardRuntime:Object.fromEntries(['version','storageVersion','canonicalVisitProtocol','status','mutable','serverNow','actionProtocol','canonicalFoodActions','canonicalInventoryActions','canonicalPickupActions','supportedActions','supportedBindings'].filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]))});
}
export function canonicalSavedActionPermissionScope(snapshot){
 if(!canonicalSavedActionCapability(snapshot))return null;
 const r=snapshot.yardRuntime,b=r.supportedBindings;
 return JSON.stringify([snapshot.player.id,r.canonicalInventoryActions??null,...['kibble','berry_plate','bonito_bowl'].map(id=>[b?.foods?.[id]?.buy===true,b?.foods?.[id]?.set===true]),b?.bowls?.['bowl-1']?.set===true,
  Object.entries(b?.goodies||{}).filter(([,v])=>v?.buy===true).map(([id])=>id).sort()]);
}
