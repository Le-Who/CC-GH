/** Source-ready server binding. Release admission remains closed; source
 * preflight is independently callable by trusted acceptance tests. */
import {createMochiCombinedCandidate} from './media/mochi-combined-binding.mjs';
import {MOCHI_ACTOR_ASSETS} from './media/mochi-actor-assets.mjs';
import {MOCHI_ACTOR_PROFILE,MOCHI_ACTOR_REFERENCE,MOCHI_RELEASE_GATE,MOCHI_RUNTIME_MEDIA_REVISION} from './mochi-actor-profile.mjs';
import {MIKA_SCENE} from './mika-media.mjs';
import {FOOD_BINDINGS,BOWL_BINDINGS,YARD_FOOD_MEDIA_REVISION} from './food-media.mjs';
import {foodRefillPolicy} from './availability.mjs';
import {YARD_GOODIES,YARD_VISITORS} from './catalog.mjs';
import {clone,deepFreeze,digest} from './util.mjs';
export const MOCHI_MEDIA_REVISION=MOCHI_RUNTIME_MEDIA_REVISION;
export function createMochiMedia({scene=MIKA_SCENE}={}){
 const {combined:clip,stride:strideContract,ground:motionContract}=MOCHI_ACTOR_ASSETS;
 const ready=MOCHI_RELEASE_GATE.accepted&&MOCHI_ACTOR_PROFILE.playbackReady;
 const source=createMochiCombinedCandidate({clip,strideContract,motionContract,scene});
 const binding=deepFreeze({...source.binding,actorProfile:MOCHI_ACTOR_REFERENCE,
  coverage:'persistent-authored-composite-rest',groundFootprintRevision:MOCHI_ACTOR_PROFILE.ground.revision,
  playbackReady:ready,...(!ready?{unavailableReason:'MOCHI_FULL_YARD_ACCEPTANCE_REQUIRED'}:{})});
 const registry=deepFreeze({revision:MOCHI_MEDIA_REVISION,kind:'persistent-mochi-candidate',
  foodMediaRevision:YARD_FOOD_MEDIA_REVISION,foodBindings:clone(FOOD_BINDINGS),bowlBindings:clone(BOWL_BINDINGS),bindings:[binding]});
 function preflightCandidate(candidate,b=binding){
  if(b.id!==binding.id||b.visitorId!==binding.visitorId||b.goodieId!==binding.goodieId
   ||b.revision!==binding.revision||b.calibrationHash!==binding.calibrationHash)return{ok:false,code:'MOCHI_BINDING_MISMATCH'};
  const food=foodRefillPolicy({foodId:candidate.bowl?.foodId,bowl:candidate.bowl,mediaRegistry:registry});
  if(!food.ok)return{ok:false,code:food.reason};
  if(candidate.yard?.remodel!=='meadow')return{ok:false,code:'REMODEL_PRESENTATION_UNAVAILABLE'};
  if(candidate.visitor?.id!==binding.visitorId)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
  if(candidate.activity?.id&&!binding.activityIds.includes(candidate.activity.id))return{ok:false,code:'ACTIVITY_MEDIA_UNAVAILABLE'};
  if([...(candidate.active||[]),...(candidate.reserved||[])].some(r=>(r.original?.visitorId||r.visitorId)===binding.visitorId
   &&(!Number.isFinite(r.leavesAt)||r.leavesAt>candidate.at)))return{ok:false,code:'MOCHI_ALREADY_VISITING'};
  // Admission itself consumes one use. Never start new-state pixels when that
  // same authoritative use would make the stored target worn or broken.
  const uses=candidate.placement?.uses??0,durability=YARD_GOODIES.yarn_mouse.durability;
  if(!Number.isSafeInteger(uses)||uses<0||uses+1>=durability)return{ok:false,code:'POST_ADMISSION_PROP_STATE_UNSUPPORTED'};
  const result=source.preflightCandidate(candidate);if(!result.ok)return result;
  const plan=clone(result.plan);Object.assign(plan,{actorProfile:clone(MOCHI_ACTOR_REFERENCE),
   groundFootprintRevision:MOCHI_ACTOR_PROFILE.ground.revision,arrivalAt:candidate.at,
   departureAt:plan.schedule.combinedEnd,propReleaseAt:plan.schedule.combinedEnd,
   segments:clone(plan.schedule.segments),propCommits:[],requiresEndpointCommit:false});
  return{ok:true,plan:deepFreeze(plan)};
 }
 const readinessCache=new Map();
 const sourcePlacementReadiness=yard=>{
  const placements=yard.placedGoodies||[],slots=placements.map(p=>p?.slotId);
  const key=digest({calibration:binding.calibrationHash,remodel:yard.remodel,expansion:yard.expansion?.level,
   rows:placements.map((p,i)=>({goodieId:p?.goodieId,x:p?.x,y:p?.y,rotationZ:p?.rotationZ??0,uses:p?.uses??0,condition:p?.condition,
    validSlot:typeof p?.slotId==='string'&&!!p.slotId,slotClass:slots.indexOf(slots[i])}))});
  const attach=rows=>clone(rows).map((row,i)=>({...row,slotId:slots[i]}));
  if(readinessCache.has(key))return attach(readinessCache.get(key));
  const result=placements.map(placement=>{
  if(placement.goodieId!=='yarn_mouse')return{slotId:placement.slotId,status:'media-unavailable',reason:'INTERACTION_MEDIA_NOT_READY'};
  const check=preflightCandidate({at:0,leavesAt:45*60000,placement,yard,visitor:YARD_VISITORS.mochi_bunny,activity:{id:'sniff'},bowl:{id:'bowl-1',foodId:'kibble'},active:[],reserved:[]});
  const status=check.ok?'ready':['TARGET_PROP_STATE_UNSUPPORTED','POST_ADMISSION_PROP_STATE_UNSUPPORTED'].includes(check.code)?'repair-required'
   :['PLACEMENT_CALIBRATION_UNAVAILABLE','REMODEL_PRESENTATION_UNAVAILABLE'].includes(check.code)?'media-unavailable':'reposition-needed';
  return{slotId:placement.slotId,goodieId:placement.goodieId,status,reason:check.ok?null:check.code};
  });
  if(readinessCache.size>=128)readinessCache.delete(readinessCache.keys().next().value);
  const rows=result.map(({slotId,...row})=>row);readinessCache.set(key,rows);return attach(rows);
 };
 return Object.freeze({mediaRegistry:registry,actorProfiles:Object.freeze(ready?{mochi:MOCHI_ACTOR_PROFILE}:{}),candidateProfile:MOCHI_ACTOR_PROFILE,
  scene:source.scene,source,preflightCandidate,sourcePlacementReadiness,
  preflight:(candidate,b)=>ready?preflightCandidate(candidate,b):({ok:false,code:'MOCHI_FULL_YARD_ACCEPTANCE_REQUIRED'})});
}
