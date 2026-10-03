/** Source-ready server binding. Release admission remains closed; source
 * preflight is independently callable by trusted acceptance tests. */
import {createCompositeVisitorCandidate} from './media/composite-visitor.mjs';
import {PEBBLE_ACTOR_ASSETS} from './media/pebble-actor-assets.mjs';
import {PEBBLE_ACTOR_PROFILE,PEBBLE_ACTOR_REFERENCE,PEBBLE_RELEASE_GATE,PEBBLE_MEDIA_REVISION} from './pebble-actor-profile.mjs';
import {MIKA_SCENE} from './mika-media.mjs';
import {FOOD_BINDINGS,BOWL_BINDINGS,YARD_FOOD_MEDIA_REVISION} from './food-media.mjs';
import {foodRefillPolicy} from './availability.mjs';
import {YARD_GOODIES,YARD_VISITORS} from './catalog.mjs';
import {clone,deepFreeze,digest} from './util.mjs';
export {PEBBLE_MEDIA_REVISION} from './pebble-actor-profile.mjs';
export function createPebbleMedia({scene}={}){
 const pb=PEBBLE_ACTOR_ASSETS.combined.propBounds,pr=PEBBLE_ACTOR_ASSETS.combined.propRoot;
 const leaf={width:2*(Math.max(Math.abs(pb.min[0]-pr[0]),Math.abs(pb.max[0]-pr[0]))+.025)*8,height:2*(Math.max(Math.abs(pb.min[1]-pr[1]),Math.abs(pb.max[1]-pr[1]))+.025)*8};
 scene=scene||{...MIKA_SCENE,footprints:{...MIKA_SCENE.footprints,leaf_pot:leaf}};
 const {combined:clip,stride:strideContract,ground:motionContract}=PEBBLE_ACTOR_ASSETS;
 const ready=PEBBLE_RELEASE_GATE.accepted&&PEBBLE_ACTOR_PROFILE.playbackReady;
 const source=createCompositeVisitorCandidate({clip,strideContract,motionContract,scene});
 const binding=deepFreeze({...source.binding,actorProfile:PEBBLE_ACTOR_REFERENCE,
  coverage:'persistent-authored-composite-rest',groundFootprintRevision:PEBBLE_ACTOR_PROFILE.ground.revision,
  playbackReady:ready,...(!ready?{unavailableReason:'PEBBLE_FULL_YARD_ACCEPTANCE_REQUIRED'}:{})});
 const registry=deepFreeze({revision:PEBBLE_MEDIA_REVISION,kind:'persistent-pebble-candidate',
  foodMediaRevision:YARD_FOOD_MEDIA_REVISION,foodBindings:clone(FOOD_BINDINGS),bowlBindings:clone(BOWL_BINDINGS),bindings:[binding]});
 function preflightCandidate(candidate,b=binding){
  if(b.id!==binding.id||b.visitorId!==binding.visitorId||b.goodieId!==binding.goodieId
   ||b.revision!==binding.revision||b.calibrationHash!==binding.calibrationHash)return{ok:false,code:'PEBBLE_BINDING_MISMATCH'};
  const food=foodRefillPolicy({foodId:candidate.bowl?.foodId,bowl:candidate.bowl,mediaRegistry:registry});
  if(!food.ok)return{ok:false,code:food.reason};
  if(candidate.yard?.remodel!=='meadow')return{ok:false,code:'REMODEL_PRESENTATION_UNAVAILABLE'};
  if(candidate.visitor?.id!==binding.visitorId)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
  if(candidate.activity?.id&&!binding.activityIds.includes(candidate.activity.id))return{ok:false,code:'ACTIVITY_MEDIA_UNAVAILABLE'};
  if([...(candidate.active||[]),...(candidate.reserved||[])].some(r=>(r.original?.visitorId||r.visitorId)===binding.visitorId
   &&(!Number.isFinite(r.leavesAt)||r.leavesAt>candidate.at)))return{ok:false,code:'PEBBLE_ALREADY_VISITING'};
  // Admission itself consumes one use. Never start new-state pixels when that
  // same authoritative use would make the stored target worn or broken.
  const uses=candidate.placement?.uses??0,durability=YARD_GOODIES.leaf_pot.durability;
  if(!Number.isSafeInteger(uses)||uses<0||uses+1>=durability)return{ok:false,code:'POST_ADMISSION_PROP_STATE_UNSUPPORTED'};
  const result=source.preflightCandidate(candidate);if(!result.ok)return result;
  const plan=clone(result.plan);Object.assign(plan,{actorProfile:clone(PEBBLE_ACTOR_REFERENCE),
   groundFootprintRevision:PEBBLE_ACTOR_PROFILE.ground.revision,arrivalAt:candidate.at,
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
  if(placement.goodieId!=='leaf_pot')return{slotId:placement.slotId,status:'media-unavailable',reason:'INTERACTION_MEDIA_NOT_READY'};
  const check=preflightCandidate({at:0,leavesAt:45*60000,placement,yard,visitor:YARD_VISITORS.pebble_pup,activity:{id:'sniff'},bowl:{id:'bowl-1',foodId:'kibble'},active:[],reserved:[]});
  const status=check.ok?'ready':['TARGET_PROP_STATE_UNSUPPORTED','POST_ADMISSION_PROP_STATE_UNSUPPORTED'].includes(check.code)?'repair-required'
   :['PLACEMENT_CALIBRATION_UNAVAILABLE','REMODEL_PRESENTATION_UNAVAILABLE'].includes(check.code)?'media-unavailable':'reposition-needed';
  return{slotId:placement.slotId,goodieId:placement.goodieId,status,reason:check.ok?null:check.code};
  });
  if(readinessCache.size>=128)readinessCache.delete(readinessCache.keys().next().value);
  const rows=result.map(({slotId,...row})=>row);readinessCache.set(key,rows);return attach(rows);
 };
 return Object.freeze({mediaRegistry:registry,actorProfiles:Object.freeze(ready?{pebble:PEBBLE_ACTOR_PROFILE}:{}),candidateProfile:PEBBLE_ACTOR_PROFILE,
  scene:source.scene,source,preflightCandidate,sourcePlacementReadiness,
  preflight:(candidate,b)=>ready?preflightCandidate(candidate,b):({ok:false,code:'PEBBLE_FULL_YARD_ACCEPTANCE_REQUIRED'})});
}
