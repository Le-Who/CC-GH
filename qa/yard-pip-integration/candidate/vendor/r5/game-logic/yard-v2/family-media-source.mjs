/** Closed exact-source integration. Selection follows the existing saved use
 * contract; this module never changes wear timing, food, capacity or rewards. */
import {FAMILY_ASSETS,FAMILY_ACTOR_IDS} from './media/family-assets.mjs';
import {createCompositeVisitorCandidate} from './media/composite-visitor.mjs';
import {MIKA_SCENE} from './mika-media.mjs';
import {FOOD_BINDINGS,BOWL_BINDINGS,YARD_FOOD_MEDIA_REVISION} from './food-media.mjs';
import {foodRefillPolicy} from './availability.mjs';
import {YARD_GOODIES,YARD_VISITORS,getYardGoodieActivities} from './catalog.mjs';
import {obstacleContextRevision} from './prop-obstacles.mjs';
import {clone,deepFreeze,digest} from './util.mjs';
import {FAMILY_ACTOR_PROFILES,FAMILY_ACTOR_REFERENCES} from './family-actor-profile.mjs';
export {FAMILY_RELEASE_GATE,FAMILY_ACTOR_PROFILES,FAMILY_ACTOR_REFERENCES} from './family-actor-profile.mjs';
export const conditionAtUses=(uses,durability)=>uses>=durability*2?'broken':uses>=durability?'worn':'new';
const routePhases=['route-approach','route-turn','route-departure'];
const sourceCache=new Map();
/** Used by the offline identity compiler as well. Cannot grant readiness. */
export function createFamilySourceMedia(actorId,{scene=MIKA_SCENE}={}){
 if(!Object.hasOwn(FAMILY_ASSETS,actorId))throw Error('Exact frozen family actor required');
 if(scene===MIKA_SCENE&&sourceCache.has(actorId))return sourceCache.get(actorId);
 const d=FAMILY_ASSETS[actorId],profile=FAMILY_ACTOR_PROFILES[actorId],reference=FAMILY_ACTOR_REFERENCES[actorId],u=profile.unitsPerWorld,bounds=d.prop.bounds,padding=d.prop.paddingWorld;
 const footprint={width:2*(Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0]))+padding)*u,height:2*(Math.max(Math.abs(bounds.min[1]),Math.abs(bounds.max[1]))+padding)*u};
 const calibrated={...clone(scene),footprints:{...clone(scene.footprints),[d.goodieId]:footprint}};
 const sources=Object.fromEntries(Object.entries(d.clips).map(([id,clip])=>[id,createCompositeVisitorCandidate({clip,strideContract:d.stride,motionContract:d.ground,scene:calibrated})]));
 const bindings=Object.entries(d.activities).map(([activity,ids])=>{
  const first=sources[ids[0]].binding,phases=[...first.requiredPhases,...routePhases];
  if(ids.some(id=>JSON.stringify(sources[id].binding.requiredPhases)!==JSON.stringify(first.requiredPhases)))throw Error('Condition source phases disagree');
  return deepFreeze({...clone(first),id:`${actorId}-${d.goodieId}-${activity}-r2`,revision:`${actorId}-${activity}-conditions/r2`,
   calibrationHash:digest({sourceCalibrations:ids.map(id=>({id,calibration:sources[id].binding.calibrationHash})),conditionPolicy:'saved-admission-use/v1',activity}),
   activityIds:[activity],conditions:ids.map(id=>d.clips[id].conditions[0]),actorProfile:reference,coverage:'persistent-authored-composite-rest',
   conditionContract:deepFreeze(Object.fromEntries(ids.map(id=>[d.clips[id].conditions[0],{clipId:id,sourceCalibrationHash:sources[id].binding.calibrationHash}]))),
   requiredPhases:phases,validatedPhases:phases,groundFootprintRevision:profile.ground.revision,playbackReady:false,unavailableReason:'FAMILY_FULL_YARD_ACCEPTANCE_REQUIRED'});
 });
 const registry=deepFreeze({revision:`${actorId}-closed-source/r2`,kind:'persistent-family-candidate',foodMediaRevision:YARD_FOOD_MEDIA_REVISION,foodBindings:clone(FOOD_BINDINGS),bowlBindings:clone(BOWL_BINDINGS),bindings});
 function preflightCandidate(candidate,bindingArg=bindings[0],context){
  const b=bindings.find(b=>b.id===bindingArg?.id);
  if(!b||b.revision!==bindingArg.revision||b.calibrationHash!==bindingArg.calibrationHash||b.visitorId!==bindingArg.visitorId||b.goodieId!==bindingArg.goodieId)return{ok:false,code:'FAMILY_BINDING_MISMATCH'};
  if(candidate.visitor?.id!==profile.visitorId)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
  const required=YARD_VISITORS[profile.visitorId].requires;
  if(required&&(candidate.placement?.goodieId!==required.goodieId||candidate.bowl?.foodId!==required.foodId))return{ok:false,code:'REQUIRED_PROP_OR_FOOD_UNAVAILABLE'};
  const food=foodRefillPolicy({foodId:candidate.bowl?.foodId,bowl:candidate.bowl,mediaRegistry:registry});if(!food.ok)return{ok:false,code:food.reason};
  if(candidate.yard?.remodel!=='meadow')return{ok:false,code:'REMODEL_PRESENTATION_UNAVAILABLE'};
  if(!b.activityIds.includes(candidate.activity?.id))return{ok:false,code:'ACTIVITY_MEDIA_UNAVAILABLE'};
  if([...(candidate.active||[]),...(candidate.reserved||[])].some(r=>(r.original?.visitorId||r.visitorId)===profile.visitorId&&(!Number.isFinite(r.leavesAt)||r.leavesAt>candidate.at)))return{ok:false,code:'FAMILY_ACTOR_ALREADY_VISITING'};
  const uses=candidate.placement?.uses??0,durability=YARD_GOODIES[d.goodieId].durability;
  if(!Number.isSafeInteger(uses)||uses<0||uses===Number.MAX_SAFE_INTEGER)return{ok:false,code:'INVALID_PROP_USES'};
  const before=conditionAtUses(uses,durability),after=conditionAtUses(uses+1,durability);
  if(candidate.placement.condition!==before)return{ok:false,code:'SAVED_PROP_CONDITION_MISMATCH'};
  if(!getYardGoodieActivities(YARD_GOODIES[d.goodieId],before).some(a=>a.id===candidate.activity.id))return{ok:false,code:'ACTIVITY_MEDIA_UNAVAILABLE'};
  const clipId=d.activities[candidate.activity.id]?.find(id=>d.clips[id].conditions[0]===after);
  if(!clipId)return{ok:false,code:'POST_ADMISSION_PROP_STATE_UNSUPPORTED'};
  // Copies predict the source state after successful admission. The server
  // still commits the same one use and serving only after accepting this plan.
  const projected=clone(candidate),p=projected.placement;
  if(!Array.isArray(projected.yard?.placedGoodies)||projected.yard.placedGoodies.filter(q=>q.slotId===p.slotId).length!==1)return{ok:false,code:'TARGET_PLACEMENT_MISMATCH'};
  const stored=projected.yard.placedGoodies.find(q=>q.slotId===p.slotId);
  if(stored.condition!==before||(stored.uses??0)!==uses)return{ok:false,code:'TARGET_PLACEMENT_MISMATCH'};
  projected.placement={...p,condition:after,uses:uses+1};
  projected.yard.placedGoodies=projected.yard.placedGoodies.map(row=>row.slotId===p.slotId?{...row,condition:after,uses:uses+1}:row);
  const result=sources[clipId].preflightCandidate(projected,context);if(!result.ok)return result;
  const plan=clone(result.plan);Object.assign(plan,{bindingCalibrationHash:b.calibrationHash,actorProfile:clone(reference),groundFootprintRevision:profile.ground.revision,
   arrivalAt:candidate.at,departureAt:plan.schedule.combinedEnd,propReleaseAt:plan.schedule.combinedEnd,segments:clone(plan.schedule.segments),propCommits:[],requiresEndpointCommit:false,
   conditionReceipt:{version:'saved-admission-use/v1',usesBefore:uses,usesAfter:uses+1,conditionBefore:before,conditionAfter:after,sourceClipId:clipId}});
  return{ok:true,plan:deepFreeze(plan)};
 }
 const readinessCache=new Map();
 function sourcePlacementReadiness(yard,context){
  const placements=yard.placedGoodies||[],slots=placements.map(p=>p?.slotId);
  const key=digest({actor:actorId,context:obstacleContextRevision(context),remodel:yard.remodel,expansion:yard.expansion?.level,
   rows:placements.map((p,i)=>({goodieId:p?.goodieId,x:p?.x,y:p?.y,rotationZ:p?.rotationZ??0,uses:p?.uses??0,condition:p?.condition,
    validSlot:typeof p?.slotId==='string'&&!!p.slotId,slotClass:slots.indexOf(slots[i])}))});
  const attach=rows=>clone(rows).map((row,i)=>({...row,slotId:slots[i]}));
  if(readinessCache.has(key))return attach(readinessCache.get(key));
  const rows=placements.map(placement=>{
   if(placement.goodieId!==d.goodieId)return{slotId:placement.slotId,status:'media-unavailable',reason:'INTERACTION_MEDIA_NOT_READY'};
   const b=bindings.find(b=>getYardGoodieActivities(YARD_GOODIES[d.goodieId],placement.condition).some(a=>b.activityIds.includes(a.id))),activity={id:b?.activityIds[0]};
   const r=b?preflightCandidate({at:0,leavesAt:45*60000,placement,yard,visitor:YARD_VISITORS[profile.visitorId],activity,bowl:{id:'bowl-1',foodId:YARD_VISITORS[profile.visitorId].requires?.foodId||'berry_plate'},active:[],reserved:[]},b,context):{ok:false,code:'ACTIVITY_MEDIA_UNAVAILABLE'};
   return{slotId:placement.slotId,goodieId:d.goodieId,status:r.ok?'ready':['POST_ADMISSION_PROP_STATE_UNSUPPORTED','SAVED_PROP_CONDITION_MISMATCH'].includes(r.code)?'repair-required':['REMODEL_PRESENTATION_UNAVAILABLE','PROP_OBSTACLE_SOURCE_UNAVAILABLE','PROP_OBSTACLE_STATE_UNSUPPORTED','UNTRUSTED_PROP_OBSTACLE_CONTEXT'].includes(r.code)?'media-unavailable':'reposition-needed',reason:r.ok?null:r.code};
  });
  if(readinessCache.size>=128)readinessCache.delete(readinessCache.keys().next().value);
  const cached=rows.map(({slotId,...row})=>row);readinessCache.set(key,cached);return attach(cached);
 }
 const result=Object.freeze({mediaRegistry:registry,actorProfiles:Object.freeze({}),candidateProfile:profile,reference,scene:deepFreeze(calibrated),sources:deepFreeze(sources),clips:d.clips,
  preflightCandidate,sourcePlacementReadiness,preflight:()=>({ok:false,code:'FAMILY_FULL_YARD_ACCEPTANCE_REQUIRED'})});
 if(scene===MIKA_SCENE)sourceCache.set(actorId,result);return result;
}
