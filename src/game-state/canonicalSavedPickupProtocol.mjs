/** Startup-safe pickup-only wire contract. No broad Yard mutability, renderer,
 * route planner, inventory grant or admission authority is introduced. */
import protocol from '../../game-logic/yard-v2/canonical-item-protocol.json' with {type:'json'};
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX,CANONICAL_FOOD_CONTRACT} from '../../game-logic/yard-v2/canonical-food-protocol.mjs';
export const SAVED_PICKUP_CAPABILITY='yard-canonical-saved-pickup-capability/v1';
const ACTION='yard.pickupGoodie',actions=[ACTION],object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const scope=(value,expected)=>Object.entries(expected).every(([k,v])=>value?.[k]===v);
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function canonicalSavedPickupDescriptor(value){return object(value)&&Object.keys(value).sort().join(',')==='actions,enabled,protocol'
 &&value.protocol==='yard-canonical-released-pickup-actions/v1'&&value.enabled===true&&same(value.actions,actions);}
export function canonicalSavedPickupCapability(snapshot,action=null){
 const r=snapshot?.yardRuntime,c=r?.itemPlacementCapabilities,item=c?.items?.leaf_pot,rows=r?.canonicalPlacements,visits=r?.canonicalVisits;
 if(!snapshot?.player?.id||action!==null&&action!==ACTION||r?.version!==1||r.storageVersion!==3||r.canonicalVisitProtocol!=='yard-canonical-authoritative/v1'
  ||r.status!=='ready'||r.error||r.mutable!==false||r.actionProtocol!=='yard-v2:'||!count(r.serverNow)
  ||!canonicalSavedPickupDescriptor(r.canonicalPickupActions)||c?.protocol!==SAVED_PICKUP_CAPABILITY
  ||!same(r.supportedActions,['yard.buyFood','yard.setFood','yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter',ACTION])
  ||r.supportedBindings?.goodies?.leaf_pot?.pickup!==true||r.supportedBindings.goodies.leaf_pot.place!==false||r.supportedBindings.goodies.leaf_pot.move!==false
  ||!object(c.items)||Object.keys(c.items).join(',')!=='leaf_pot'
  ||!Object.entries(r.supportedBindings.goodies).every(([id,b])=>object(b)&&b.place===false&&b.move===false&&b.fix===false&&b.pickup===(id==='leaf_pot'))
  ||!scope(c,CANONICAL_FOOD_LOCATION)||!scope(c.storageLocation,protocol.location)||c.foodContractId!==CANONICAL_FOOD_CONTRACT.id
  ||c.enabled!==true||c.readOnly!==false||c.visitAdmission!==false||c.coordinateSpace!==protocol.coordinateSpace
  ||c.slotPrefix!==protocol.slotPrefix||c.actionNoncePrefix!==CANONICAL_FOOD_NONCE_PREFIX||c.maxPlacements!==protocol.maxPlacements
  ||!same(c.actions,actions)||!same(c.replayNoncePrefixes,[CANONICAL_FOOD_NONCE_PREFIX])||JSON.stringify(c.domain)!==JSON.stringify(protocol.domain)
  ||!Array.isArray(rows)||rows.length>1||!Array.isArray(visits)||visits.length>1||!Array.isArray(r.visits)||r.visits.length
  ||!rows.every(row=>scope(row,protocol.location)&&row.goodieId==='leaf_pot'&&row.itemGeometryRevision===protocol.item.itemGeometryRevision
    &&typeof row.slotId==='string'&&/^canonical:[A-Za-z0-9_.:-]{1,80}$/.test(row.slotId)&&[row.x,row.y].every(Number.isFinite)
    &&row.condition==='new'&&count(row.uses)&&row.uses<protocol.item.durability&&count(row.placedAt))
  ||item?.goodieId!==protocol.item.goodieId||item.itemGeometryRevision!==protocol.item.itemGeometryRevision||item.assetSha256!==protocol.item.assetSha256
  ||item.footprintRadius!==protocol.item.footprintRadius||!same(item.conditions,['new'])||item.place!==false||item.move!==false||item.pickup!==true)return null;
 const food=r.foodLocationCapabilities;
 if(!scope(food,CANONICAL_FOOD_LOCATION)||food.enabled!==true||food.descriptorId!==CANONICAL_FOOD_CONTRACT.id||!scope(food.storageLocation,protocol.location)
  ||food.coordinateSpace!==protocol.coordinateSpace||food.presentationReady!==false||food.runtimeActivated!==false||food.visitAdmission!==false)return null;
 let expected=[];
 if(visits.length){
  const visit=visits[0],plan=visit?.plan;
  if(typeof visit?.visitId!=='string'||visit.visitId!==plan?.visitId||plan.format!=='yard-canonical-stay/v3'||plan.profile!=='r1-peek-release84-neutral-rest/v1'
   ||!count(plan.arrivedAt)||!count(plan.leavesAt)||plan.leavesAt-plan.arrivedAt<45*60000||plan.leavesAt-plan.arrivedAt>110*60000||(plan.leavesAt-plan.arrivedAt)%60000!==0
   ||plan.releaseAt!==plan.arrivedAt+Math.ceil((plan.leavesAt-plan.arrivedAt)*.84))return null;
  if(rows.length&&r.targetReserved===false&&r.serverNow>=plan.releaseAt&&r.serverNow<plan.leavesAt&&rows[0].slotId===plan.inspectionPlan?.target?.slotId)expected=[rows[0].slotId];
 }
 return same(c.pickupReadySlotIds,expected)?c:null;
}
function payloadValid(payload){return object(payload)&&Object.keys(payload).sort().join(',')===[...Object.keys(CANONICAL_FOOD_LOCATION),'slotId'].sort().join(',')
 &&scope(payload,CANONICAL_FOOD_LOCATION)&&typeof payload.slotId==='string'&&/^canonical:[A-Za-z0-9_.:-]{1,80}$/.test(payload.slotId);}
export function canonicalSavedPickupNewIntentAllowed(snapshot,action,payload){const c=canonicalSavedPickupCapability(snapshot,action);return !!c&&payloadValid(payload)&&c.pickupReadySlotIds.includes(payload.slotId);}
export function canonicalSavedPickupReplayAllowed(item,snapshot){return !!canonicalSavedPickupCapability(snapshot,item?.action)&&item?.action===ACTION&&item.accountId===snapshot.player.id
 &&typeof item.clientActionId==='string'&&/^yard-v2:canonical-v2\/[A-Za-z0-9_.:-]{1,96}$/.test(item.clientActionId)&&payloadValid(item.payload);}
