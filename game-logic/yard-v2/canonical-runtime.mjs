/** Normal service integration for the first single-Pip saved visit. All writes
 * occur in the caller's fresh player transaction; planning remains post-commit. */
import {createCanonicalVisitReconciler,stageCanonicalVisitPreparation,inspectCanonicalPlayerState} from './canonical-visit-reconciliation.mjs';
import {CANONICAL_VISIT_PRESENTATION_PROTOCOL} from './canonical-visit-placement-contract.mjs';
import {canonicalFoodCapabilities,selectCanonicalFoodState} from './canonical-food-contract.mjs';
import {canonicalItemCapabilities} from './canonical-locations.mjs';
import {probeCanonicalFoodAction} from './canonical-food-actions.mjs';
import {YARD_HOUR_MS,YARD_FOODS} from './catalog.mjs';
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
  &&Array.isArray(r.canonicalPlacements)&&r.canonicalPlacements.length===1&&Array.isArray(player.yard?.bowls)&&player.yard.bowls.length===1;
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
  const result=stageCanonicalVisitPreparation(player,{slotId:r.canonicalPlacements[0].slotId,at});
  if(result.state==='pending'){owner().register(player);return {status:200,mutable:false,yard:player.yard,reconciliation:result};}
  if(!['NO_SELECTED_CANDIDATE','SELECTED_CANDIDATE_UNSUPPORTED','CROSS_OPPORTUNITY_STAY_UNQUALIFIED'].includes(result.code))return failure(result.code);
  const eventId=digest({ownerId:player.id,seed:r.seed,at,slotId:r.canonicalPlacements[0].slotId,n:0});
  r.canonicalVisitReceipts[eventId]={eventId,kind:'not-admitted',at,reason:result.code};
  r.cursorMs=at;r.nextOpportunityAt=at+YARD_HOUR_MS;
 }
 const at=Math.min(now,r.nextOpportunityAt-1);expire(player,at);r.cursorMs=at;player.yard.lastSimulatedAt=at;
 return {status:200,mutable:false,yard:player.yard};
}
function foodPresentation(runtime){
 if(runtime.status!=='ready'||runtime.error)return runtime;
 return {...runtime,canonicalFoodActions:{protocol:'yard-canonical-food-actions/v1',enabled:true,actions:['yard.buyFood','yard.setFood']},
  supportedActions:['yard.buyFood','yard.setFood'],supportedBindings:{goodies:{},foods:Object.fromEntries(Object.keys(YARD_FOODS).map(id=>[id,{buy:true,set:true}])),bowls:{'bowl-1':{set:true}}}};
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
 const probe=probeCanonicalFoodAction(player,action,payload,{now,actionId});
 if(!probe.needsReconciliation)return probe;
 const advanced=ensureCanonicalPlayerYard(player,{now,simulate:true});
 if(advanced.status!==200)return advanced;
 return owner().applyFood(player,action,payload,{now,actionId});
}
export async function closeCanonicalRuntime(){if(reconciler){await reconciler.close();reconciler=undefined;}}
