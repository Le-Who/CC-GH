/** Source-ready server binding. Release admission remains closed; source
 * preflight is independently callable by trusted acceptance tests. */
import {obstacleContextRevision} from './prop-obstacles.mjs';
import {createPipSnackCandidate} from './media/pip-snack-binding.mjs';
import {PIP_ACTOR_ASSETS} from './media/pip-actor-assets.mjs';
import {PIP_ACTOR_PROFILE,PIP_ACTOR_REFERENCE,PIP_RELEASE_GATE,PIP_MEDIA_REVISION as PROFILE_MEDIA_REVISION} from './pip-actor-profile.mjs';
import {FOOD_BINDINGS,BOWL_BINDINGS,YARD_FOOD_MEDIA_REVISION} from './food-media.mjs';
import {foodRefillPolicy} from './availability.mjs';
import {YARD_GOODIES,YARD_VISITORS} from './catalog.mjs';
import {clone,deepFreeze,digest} from './util.mjs';
export const PIP_MEDIA_REVISION=PROFILE_MEDIA_REVISION;
export function createPipMedia({scene}={}){
 const {combined:clip,stride:strideContract,ground:motionContract}=PIP_ACTOR_ASSETS;
 const ready=PIP_RELEASE_GATE.accepted&&PIP_ACTOR_PROFILE.playbackReady;
 const source=createPipSnackCandidate({clip,strideContract,motionContract,scene});
 const binding=deepFreeze({...source.binding,actorProfile:PIP_ACTOR_REFERENCE,
  coverage:'persistent-authored-composite-rest',groundFootprintRevision:PIP_ACTOR_PROFILE.ground.revision,
  playbackReady:ready,...(!ready?{unavailableReason:'PIP_FULL_YARD_ACCEPTANCE_REQUIRED'}:{})});
 const registry=deepFreeze({revision:PIP_MEDIA_REVISION,kind:'persistent-pip-candidate',
  foodMediaRevision:YARD_FOOD_MEDIA_REVISION,foodBindings:clone(FOOD_BINDINGS),bowlBindings:clone(BOWL_BINDINGS),bindings:[binding]});
 function preflightCandidate(candidate,b=binding,obstacleContext){
  if(b.id!==binding.id||b.visitorId!==binding.visitorId||b.goodieId!==binding.goodieId
   ||b.revision!==binding.revision||b.calibrationHash!==binding.calibrationHash)return{ok:false,code:'PIP_BINDING_MISMATCH'};
  const food=foodRefillPolicy({foodId:candidate.bowl?.foodId,bowl:candidate.bowl,mediaRegistry:registry});
  if(!food.ok)return{ok:false,code:food.reason};
  if(candidate.yard?.remodel!=='meadow')return{ok:false,code:'REMODEL_PRESENTATION_UNAVAILABLE'};
  if(candidate.visitor?.id!==binding.visitorId)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
  if(candidate.activity?.id&&!binding.activityIds.includes(candidate.activity.id))return{ok:false,code:'ACTIVITY_MEDIA_UNAVAILABLE'};
  if([...(candidate.active||[]),...(candidate.reserved||[])].some(r=>(r.original?.visitorId||r.visitorId)===binding.visitorId
   &&(!Number.isFinite(r.leavesAt)||r.leavesAt>candidate.at)))return{ok:false,code:'PIP_ALREADY_VISITING'};
  // Admission itself consumes one use. Never start new-state pixels when that
  // same authoritative use would make the stored target worn or broken.
  const uses=candidate.placement?.uses??0,durability=YARD_GOODIES.snack_table.durability;
  if(!Number.isSafeInteger(uses)||uses<0||uses+1>=durability)return{ok:false,code:'POST_ADMISSION_PROP_STATE_UNSUPPORTED'};
  const result=source.preflightCandidate(candidate,obstacleContext);if(!result.ok)return result;
  const plan=clone(result.plan);Object.assign(plan,{actorProfile:clone(PIP_ACTOR_REFERENCE),
   groundFootprintRevision:PIP_ACTOR_PROFILE.ground.revision,arrivalAt:candidate.at,
   departureAt:plan.schedule.combinedEnd,propReleaseAt:plan.schedule.combinedEnd,
   segments:clone(plan.schedule.segments),propCommits:[],requiresEndpointCommit:false});
  return{ok:true,plan:deepFreeze(plan)};
 }
 const readinessCache=new Map();
 const sourcePlacementReadiness=(yard,obstacleContext)=>{
  const placements=yard.placedGoodies||[],slots=placements.map(p=>p?.slotId);
  const key=digest({obstacleRevision:obstacleContextRevision(obstacleContext),calibration:binding.calibrationHash,remodel:yard.remodel,expansion:yard.expansion?.level,
   rows:placements.map((p,i)=>({goodieId:p?.goodieId,x:p?.x,y:p?.y,rotationZ:p?.rotationZ??0,uses:p?.uses??0,condition:p?.condition,
    validSlot:typeof p?.slotId==='string'&&!!p.slotId,slotClass:slots.indexOf(slots[i])}))});
  const attach=rows=>clone(rows).map((row,i)=>({...row,slotId:slots[i]}));
  if(readinessCache.has(key))return attach(readinessCache.get(key));
  const result=placements.map(placement=>{
  if(placement.goodieId!=='snack_table')return{slotId:placement.slotId,status:'media-unavailable',reason:'INTERACTION_MEDIA_NOT_READY'};
  const check=preflightCandidate({at:0,leavesAt:45*60000,placement,yard,visitor:YARD_VISITORS.pip_hamster,activity:{id:'nibble'},bowl:{id:'bowl-1',foodId:'kibble'},active:[],reserved:[]},binding,obstacleContext);
  const status=check.ok?'ready':['TARGET_PROP_STATE_UNSUPPORTED','POST_ADMISSION_PROP_STATE_UNSUPPORTED'].includes(check.code)?'repair-required'
   :['PLACEMENT_CALIBRATION_UNAVAILABLE','REMODEL_PRESENTATION_UNAVAILABLE','PROP_OBSTACLE_SOURCE_UNAVAILABLE','PROP_OBSTACLE_STATE_UNSUPPORTED','UNTRUSTED_PROP_OBSTACLE_CONTEXT'].includes(check.code)?'media-unavailable':'reposition-needed';
  return{slotId:placement.slotId,goodieId:placement.goodieId,status,reason:check.ok?null:check.code};
  });
  if(readinessCache.size>=128)readinessCache.delete(readinessCache.keys().next().value);
  const rows=result.map(({slotId,...row})=>row);readinessCache.set(key,rows);return attach(rows);
 };
 return Object.freeze({mediaRegistry:registry,actorProfiles:Object.freeze(ready?{pip:PIP_ACTOR_PROFILE}:{}),candidateProfile:PIP_ACTOR_PROFILE,
  scene:source.scene,source,preflightCandidate,sourcePlacementReadiness,
  preflight:(candidate,b,obstacleContext)=>ready?preflightCandidate(candidate,b,obstacleContext):({ok:false,code:'PIP_FULL_YARD_ACCEPTANCE_REQUIRED'})});
}
