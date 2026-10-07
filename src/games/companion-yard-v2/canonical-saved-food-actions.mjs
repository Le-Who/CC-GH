import{CANONICAL_SAVED_FOOD_ACTIONS as ACTIONS}from'../../game-state/canonicalSavedFoodProtocol.mjs';
import{canonicalSavedActionCapability as canonicalSavedFoodCapability}from'../../game-state/canonicalSavedActionProtocol.mjs';
import{YARD_FOODS}from'../../../game-logic/yard-catalog.js';
import{selectCanonicalFoodState}from'../../../game-logic/yard-v2/canonical-food-contract.mjs';
const activePhases=new Set(['empty','not-arrived','entrance','approach','interaction','rest','retreat','neutral-rest','exit']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
/** A read-only saved scene may expose only this explicit two-command carveout.
 * This grants no general Yard/item/fixture authority and never changes a save.
 * Existing authenticated transport, account fence, nonce and outbox own sending. */
export function canonicalSavedFoodReady(snapshot,current,sceneState=current?.visualPrototype){
 const r=snapshot?.yardRuntime,v=sceneState;
 if(!canonicalSavedFoodCapability(snapshot))return false;
 if(current?.canonicalSavedVisits!==true||current.canonicalItems!==true||current.mutable!==false||current.itemMutable!==false||current.mediaReady!==true
  ||current.runtime?.storageVersion!==3||current.runtime.canonicalVisitProtocol!==r.canonicalVisitProtocol||current.runtime.status!=='ready'
  ||current.runtime.serverNow!==r.serverNow||v?.ready!==true||v.canonicalSavedVisits!==true||v.actorUnitsPerSource!==16
  ||v.restartPending!==false||v.viewportBlocked!==false||v.plannerWorkerActive!==false||v.itemEditing!==false||v.itemActionPending!==false
  ||v.savedVisit?.status!=='ready'||!Array.isArray(v.pauseReasons)||v.pauseReasons.length!==0||!activePhases.has(v.phase))return false;
 if(!Array.isArray(r.canonicalVisits)||r.canonicalVisits.length>1||!Array.isArray(r.visits)||r.visits.length!==0)return false;
 if(r.canonicalVisits.length===1){const row=r.canonicalVisits[0];if(!object(row)||row.visitId!==row.plan?.visitId||v.savedVisit.visitId!==row.visitId)return false;}
 else if(v.savedVisit.visitId!==null||v.phase!=='empty')return false;
 const food=current.canonicalFood,selected=selectCanonicalFoodState(snapshot);
 if(!selected.available||food?.loading!==false||food.reentryRequired!==false||food.reserved!==true||food.render?.available!==true||food.render.state!==selected.state)return false;
 const currencies=snapshot.yard?.currencies,inventory=snapshot.yard?.foodInventory;
 return object(currencies)&&['treats','shinyTreats'].every(k=>count(currencies[k]))&&object(inventory)&&object(r.supportedBindings?.foods)&&object(r.supportedBindings?.bowls);
}
export function canonicalSavedFoodCommandAllowed(snapshot,current,action,payload,sceneState=current?.visualPrototype){
 if(!canonicalSavedFoodReady(snapshot,current,sceneState)||!ACTIONS.includes(action)||!object(payload)||typeof payload.foodId!=='string'||!Object.hasOwn(YARD_FOODS,payload.foodId))return false;
 const r=snapshot.yardRuntime,id=payload.foodId,binding=Object.hasOwn(r.supportedBindings.foods,id)?r.supportedBindings.foods[id]:null;
 const stock=Object.hasOwn(snapshot.yard.foodInventory,id)?snapshot.yard.foodInventory[id]:0;if(!count(stock)||!object(binding))return false;
 const fields=Object.keys(payload).sort().join(',');
 if(action==='yard.setFood')return fields==='bowlId,foodId'&&payload.bowlId==='bowl-1'&&r.supportedBindings.bowls['bowl-1']?.set===true&&binding.set===true&&stock>0;
 return fields==='foodId,qty'&&payload.qty===1&&binding.buy===true&&['treats','shinyTreats'].every(k=>count(YARD_FOODS[id].cost[k])&&snapshot.yard.currencies[k]>=YARD_FOODS[id].cost[k]);
}
