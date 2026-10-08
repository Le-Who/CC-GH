/** Normal service integration for the first single-Pip saved visit. All writes
 * occur in the caller's fresh player transaction; planning remains post-commit. */
import {createCanonicalVisitReconciler,stageCanonicalVisitPreparation,inspectCanonicalPlayerState} from './canonical-visit-reconciliation.mjs';
import {CANONICAL_VISIT_PRESENTATION_PROTOCOL} from './canonical-visit-placement-contract.mjs';
import {canonicalFoodCapabilities,selectCanonicalFoodState} from './canonical-food-contract.mjs';
import {canonicalItemCapabilities} from './canonical-locations.mjs';
import {finishCanonicalDepartureCheckpoint} from './canonical-unique-visit-clock.mjs';
import {probeCanonicalFoodAction} from './canonical-food-actions.mjs';
import {probeCanonicalSavedItemAction,CANONICAL_SAVED_ITEM_ACTIONS_ENABLED} from './canonical-saved-item-actions.mjs';
import {CANONICAL_FOOD_NONCE_PREFIX} from './canonical-food-protocol.mjs';
import {YARD_HOUR_MS,YARD_FOODS,YARD_GOODIES} from './catalog.mjs';
import {clone,integer,digest} from './util.mjs';
export const CANONICAL_RUNTIME_ENABLED=false;
let reconciler;
const owner=()=>reconciler??=createCanonicalVisitReconciler();
const failure=error=>({status:409,error,mutable:false});
const active=p=>Object.values(p._yardV2.runtime.canonicalVisits||{}).some(v=>v.status==='active');
function shape(player,now){
 const s=player?._yardV2,r=s?.runtime;
 return s?.format==='yard-persistent/v1'&&s.version===3&&r?.version===1&&typeof r.canonicalRevision==='string'&&r.canonicalRevision.length>0
  &&integer(now)&&integer(r.cursorMs)&&integer(r.nextOpportunityAt)&&r.nextOpportunityAt>r.cursorMs
  &&Array.isArray(r.canonicalPlacements)&&r.canonicalPlacements.length<=1&&Array.isArray(player.yard?.bowls)&&player.yard.bowls.length===1;
}
function expire(player,at){for(const b of player.yard.bowls)if(b.foodId&&integer(b.expiresAt)&&b.expiresAt<=at)Object.assign(b,{foodId:null,servings:0,placedAt:null,expiresAt:null});}
export function ensureCanonicalPlayerYard(player,{now=Date.now(),simulate=false}={}){
 if(!CANONICAL_RUNTIME_ENABLED)return failure('CANONICAL_RUNTIME_DISABLED');
 if(!shape(player,now)||!inspectCanonicalPlayerState(player).valid)return failure('CANONICAL_RUNTIME_REQUIRES_REVIEW');
 const r=player._yardV2.runtime;
 if(now<r.cursorMs)return failure('INVALID_YARD_SERVER_TIME');
 if(player.yard.helper?.unlocked&&player.yard.helper?.autoRefill)return failure('CANONICAL_AUTO_REFILL_UNQUALIFIED');
 if(!simulate)return {status:200,mutable:false,yard:player.yard};
 if(active(player)||r.canonicalPending){
  const result=owner().advance(player,{now});
  if(result.state!=='completed')return {status:200,mutable:false,yard:player.yard,reconciliation:result};
 }
 // Chronological source opportunities; unsupported selections consume their own
 // hour without rerolling or consuming stock. Bound work per ordinary request.
 for(let n=0;r.nextOpportunityAt<=now&&n<48;n++){
  const at=r.nextOpportunityAt;if(!integer(at+YARD_HOUR_MS))return failure('INVALID_YARD_SERVER_TIME');expire(player,at);
  // No placement means the source opportunity has no candidate or debit.
  if(!r.canonicalPlacements.length){
   if(!finishCanonicalDepartureCheckpoint(player))return failure('CANONICAL_DEPARTURE_CHECKPOINT_INVALID');
   r.cursorMs=at;r.nextOpportunityAt=at+YARD_HOUR_MS;continue;
  }
  const result=stageCanonicalVisitPreparation(player,{slotId:r.canonicalPlacements[0].slotId,at});
  if(result.state==='pending'){owner().register(player);return {status:200,mutable:false,yard:player.yard,reconciliation:result};}
  if(!['NO_SELECTED_CANDIDATE','SELECTED_CANDIDATE_UNSUPPORTED'].includes(result.code))return failure(result.code);
  if(!finishCanonicalDepartureCheckpoint(player))return failure('CANONICAL_DEPARTURE_CHECKPOINT_INVALID');
  const eventId=digest({ownerId:player.id,seed:r.seed,at,slotId:r.canonicalPlacements[0].slotId,n:0});
  r.canonicalVisitReceipts[eventId]={eventId,kind:'not-admitted',at,reason:result.code};
  r.cursorMs=at;r.nextOpportunityAt=at+YARD_HOUR_MS;
 }
 const at=Math.min(now,r.nextOpportunityAt-1);expire(player,at);r.cursorMs=at;player.yard.lastSimulatedAt=at;
 return {status:200,mutable:false,yard:player.yard};
}
function foodPresentation(runtime){
 if(runtime.status!=='ready'||runtime.error)return runtime;
 const view={...runtime,canonicalFoodActions:{protocol:'yard-canonical-food-actions/v1',enabled:true,actions:['yard.buyFood','yard.setFood']},
  canonicalInventoryActions:{protocol:'yard-canonical-inventory-actions/v1',enabled:true,actions:['yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter']},
  supportedActions:['yard.buyFood','yard.setFood','yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter'],supportedBindings:{goodies:Object.fromEntries(Object.keys(YARD_GOODIES).map(id=>[id,{buy:true,place:false,move:false,pickup:false,fix:false}])),foods:Object.fromEntries(Object.keys(YARD_FOODS).map(id=>[id,{buy:true,set:true}])),bowls:{'bowl-1':{set:true}}}};
 if(!CANONICAL_SAVED_ITEM_ACTIONS_ENABLED)return view;
 const cap=canonicalItemCapabilities({canonicalItemPlacementEnabled:true,canonicalFoodLocationEnabled:true});
 const plan=runtime.canonicalVisits?.length===1?runtime.canonicalVisits[0].plan:null,row=runtime.canonicalPlacements?.length===1?runtime.canonicalPlacements[0]:null;
 const ready=plan&&row&&runtime.targetReserved===false&&runtime.serverNow>=plan.releaseAt&&runtime.serverNow<plan.leavesAt&&row.slotId===plan.inspectionPlan?.target?.slotId;
 return {...view,canonicalPickupActions:{protocol:'yard-canonical-released-pickup-actions/v1',enabled:true,actions:['yard.pickupGoodie']},
  supportedActions:[...view.supportedActions,'yard.pickupGoodie'],supportedBindings:{...view.supportedBindings,goodies:{...view.supportedBindings.goodies,leaf_pot:{...view.supportedBindings.goodies.leaf_pot,pickup:true}}},
  itemPlacementCapabilities:{...cap,protocol:'yard-canonical-saved-pickup-capability/v1',actions:['yard.pickupGoodie'],replayNoncePrefixes:[CANONICAL_FOOD_NONCE_PREFIX],
   pickupReadySlotIds:ready?[row.slotId]:[],items:{leaf_pot:{...cap.items.leaf_pot,place:false,move:false,pickup:true}}}};
}
export function publicCanonicalPlayerYard(player,{now=Date.now()}={}){
 const base={version:1,storageVersion:3,canonicalVisitProtocol:CANONICAL_VISIT_PRESENTATION_PROTOCOL,serverNow:now,mutable:false,
  visits:[],canonicalVisits:[],reservations:[],placementReadiness:[],supportedActions:[],actionProtocol:'yard-v2:'};
 if(!CANONICAL_RUNTIME_ENABLED||!shape(player,now)||!inspectCanonicalPlayerState(player).valid||player.yard.helper?.unlocked&&player.yard.helper?.autoRefill)return {...base,status:'review-required',error:'CANONICAL_RUNTIME_REQUIRES_REVIEW',canonicalPlacements:[]};
 const common={...base,canonicalPlacements:clone(player._yardV2.runtime.canonicalPlacements),
  foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true}),itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:false,canonicalFoodLocationEnabled:true})};
 if(active(player))return foodPresentation({...common,...owner().project(player,{now})});
 const r=player._yardV2.runtime;
 const due=r.canonicalPending||r.nextOpportunityAt<=now||player.yard.bowls.some(b=>b.foodId&&b.expiresAt<=now);
 const result={...common,status:due?'reconciliation-pending':'ready'};
 result.canonicalFoodState=selectCanonicalFoodState({yard:player.yard,yardRuntime:result});return foodPresentation(result);
}
export function executeCanonicalYardAction(player,action,payload={}, {now=Date.now(),actionId}={}){
 if(!CANONICAL_RUNTIME_ENABLED)return failure('CANONICAL_RUNTIME_DISABLED');
 const item=action==='yard.pickupGoodie';
 const probe=(item?probeCanonicalSavedItemAction:probeCanonicalFoodAction)(player,action,payload,{now,actionId});
 if(!probe.needsReconciliation)return item&&probe.replayed?owner().applyPickup(player,payload,{now,actionId}):probe;
 const advanced=ensureCanonicalPlayerYard(player,{now,simulate:true});
 if(advanced.status!==200)return advanced;
 return item?owner().applyPickup(player,payload,{now,actionId}):owner().applyFood(player,action,payload,{now,actionId});
}
export async function closeCanonicalRuntime(){if(reconciler){await reconciler.close();reconciler=undefined;}}
