import protocol from '../../game-logic/yard-v2/canonical-item-protocol.json' with {type:'json'};
import {CANONICAL_FOOD_CONTRACT,CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX,canonicalCommandJson} from '../../game-logic/yard-v2/canonical-food-protocol.mjs';
import {sha256} from '../../game-logic/yard-v2/sha256.mjs';
import {canonicalSavedPickupCapability,SAVED_PICKUP_CAPABILITY} from './canonicalSavedPickupProtocol.mjs';
export {CANONICAL_FOOD_LOCATION};
export const CANONICAL_LOCATION=Object.freeze(protocol.location);
export const CANONICAL_ITEM=Object.freeze(protocol.item);
export const CANONICAL_MAX_PLACEMENTS=protocol.maxPlacements;
export const CANONICAL_ACTION_NONCE_PREFIX=protocol.noncePrefix;
const actions=protocol.actions;
const identity=value=>Object.entries(CANONICAL_LOCATION).every(([key,v])=>value?.[key]===v);
export const isCanonicalItemIntent=(payload,nonce)=>Object.keys(CANONICAL_LOCATION).some(key=>Object.hasOwn(payload||{},key))
 ||/^yard-v2:canonical-v/.test(String(nonce||''));
export const isCanonicalItemNonce=nonce=>typeof nonce==='string'&&/^yard-v2:canonical-v[12]\/[A-Za-z0-9_.:-]{1,96}$/.test(nonce);
const same=(v,scope)=>Object.entries(scope).every(([k,x])=>v?.[k]===x);
export function canonicalPresentationScope(snapshot){
 const cap=snapshot?.yardRuntime?.itemPlacementCapabilities;
 if(identity(cap))return CANONICAL_LOCATION;
 return same(cap,CANONICAL_FOOD_LOCATION)&&identity(cap.storageLocation)&&cap.foodContractId===CANONICAL_FOOD_CONTRACT.id?CANONICAL_FOOD_LOCATION:null;
}
export const canonicalCommandScope=snapshot=>canonicalCapability(snapshot)?canonicalPresentationScope(snapshot):null;
export const canonicalNoncePrefix=snapshot=>canonicalCapability(snapshot)?.actionNoncePrefix||null;
export function canonicalReplayCapability(snapshot,action,nonce){
 const cap=canonicalCapability(snapshot,action);
 return !!cap&&isCanonicalItemNonce(nonce)&&(nonce.startsWith(cap.actionNoncePrefix)||cap.replayNoncePrefixes?.some(prefix=>nonce.startsWith(prefix)));
}
export function canonicalSupersededReceipt(item,result){
 const d=result?.details;
 return Number(result?._httpStatus)===400&&result.error==='CANONICAL_COMMAND_SUPERSEDED'&&d?.disposition==='retained-user-decision'
  &&d.actionId===item.clientActionId&&d.requestHash===sha256(canonicalCommandJson({action:item.action,payload:item.payload}))
  &&same(d.replacementScope,CANONICAL_FOOD_LOCATION)&&item.clientActionId.startsWith(CANONICAL_ACTION_NONCE_PREFIX)&&identity(item.payload);
}
export const CANONICAL_PENDING_ERRORS=new Set(['LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT','UNSUPPORTED_YARD_STORAGE_VERSION','CANONICAL_LOCATION_UNKNOWN','CANONICAL_LOCATION_VERSION_MISMATCH','CANONICAL_GEOMETRY_REVISION_MISMATCH','CANONICAL_ITEM_PLACEMENT_DISABLED','CANONICAL_ACTION_UNSUPPORTED','CANONICAL_NONCE_REQUIRED','CANONICAL_LOCATION_REQUIRED']);
/** Startup-safe capability check. Geometry remains in the lazy Yard module. */
export function canonicalCapability(snapshot,action=null){
 if(snapshot?.yardRuntime?.itemPlacementCapabilities?.protocol===SAVED_PICKUP_CAPABILITY)return canonicalSavedPickupCapability(snapshot,action);
 const runtime=snapshot?.yardRuntime,cap=runtime?.itemPlacementCapabilities,item=cap?.items?.leaf_pot,rows=runtime?.canonicalPlacements,scope=canonicalPresentationScope(snapshot),foodAware=scope===CANONICAL_FOOD_LOCATION;
 const food=runtime?.foodLocationCapabilities;
 if(foodAware&&(!same(food,CANONICAL_FOOD_LOCATION)||food?.enabled!==true||food.descriptorId!==CANONICAL_FOOD_CONTRACT.id||!identity(food.storageLocation)
  ||food.coordinateSpace!==protocol.coordinateSpace||food.presentationReady!==false||food.runtimeActivated!==false||food.visitAdmission!==false
  ||JSON.stringify(cap.replayNoncePrefixes)!==JSON.stringify([CANONICAL_ACTION_NONCE_PREFIX,CANONICAL_FOOD_NONCE_PREFIX])))return null;
 if(runtime?.version!==1||runtime.status!=='ready'||runtime.mutable!==true||runtime.actionProtocol!=='yard-v2:'||runtime.error
  ||!scope||cap.enabled!==true||cap.readOnly!==false||cap.visitAdmission!==false||cap.coordinateSpace!==protocol.coordinateSpace
  ||cap.slotPrefix!==protocol.slotPrefix||cap.actionNoncePrefix!==(foodAware?CANONICAL_FOOD_NONCE_PREFIX:CANONICAL_ACTION_NONCE_PREFIX)||cap.maxPlacements!==protocol.maxPlacements
  ||!Array.isArray(cap.actions)||cap.actions.length!==actions.length||!actions.every(value=>cap.actions.includes(value))
  ||JSON.stringify(cap.domain)!==JSON.stringify(protocol.domain)||!Array.isArray(rows)||rows.length>protocol.maxPlacements
  ||!rows.every(row=>identity(row)&&row.goodieId===CANONICAL_ITEM.goodieId&&row.itemGeometryRevision===CANONICAL_ITEM.itemGeometryRevision
   &&/^canonical:[A-Za-z0-9_.:-]{1,80}$/.test(row.slotId)&&typeof row.slotId==='string'&&[row.x,row.y].every(Number.isFinite)
   &&row.condition==='new'&&row.uses===0&&Number.isSafeInteger(row.placedAt)&&row.placedAt>=0)
  ||item?.goodieId!==CANONICAL_ITEM.goodieId||item.itemGeometryRevision!==CANONICAL_ITEM.itemGeometryRevision||item.assetSha256!==CANONICAL_ITEM.assetSha256
  ||item.footprintRadius!==CANONICAL_ITEM.footprintRadius||item.conditions?.length!==1||item.conditions[0]!=='new'
  ||!['place','move','pickup'].every(key=>item[key]===true)||action&&!actions.includes(action))return null;
 return cap;
}
