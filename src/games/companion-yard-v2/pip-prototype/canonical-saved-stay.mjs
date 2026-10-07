/** Inactive source-only successor. Preserve the historical 84% target release:
 * finish a supported retreat to a free neutral anchor before releasing the prop.
 * No registry, clock, renderer, stock, wear, gift or persistence mutation. */
import geometrySource from '../../../../game-logic/yard-v2/canonical-location-geometry.json' with {type:'json'};
import itemProtocol from '../../../../game-logic/yard-v2/canonical-item-protocol.json' with {type:'json'};
import {deepFreeze,digest} from '../../../../game-logic/yard-v2/util.mjs';
import {prepareR1Stay,sampleR1Stay,r1StayLayoutKey,R1_STAY_FOOD_EXCLUSION} from './canonical-stay-presentation.mjs';
import {buildR1FrontPortal,planStayTransfer,qualifyStayStage,supportedLine} from './canonical-stay-routes.mjs';
import {createCanonicalNavigation} from './dynamic-navigation.mjs';
import {sampleMotion} from './motion/kinematics.mjs';

export const R1_SAVED_STAY_PROFILE='r1-peek-release84-neutral-rest/v1';
export const R1_SAVED_NAVIGATION_PROFILE='pip-food-r2-front-portal-curved-hulls/v1';
export const R1_SAVED_STAY_BINDINGS=Object.freeze([]);
export const r1SavedStayGeometry=()=>structuredClone({...geometrySource,exclusions:[...geometrySource.exclusions,R1_STAY_FOOD_EXCLUSION]});
const clone=structuredClone;
const duration=stages=>stages.reduce((n,s)=>n+Math.ceil(s.route.totalMs),0);
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const box=(points,r)=>{const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return {x:x-r,y:y-r,width:Math.max(...points.map(p=>p.x))-x+2*r,height:Math.max(...points.map(p=>p.y))-y+2*r};};
function radii(actor){return {body:Math.hypot(actor.bodyHalfExtentsSource.x+.075,actor.bodyHalfExtentsSource.y)*actor.unitsPerSource,sole:Math.hypot(actor.soleHalfExtentsSource.x,actor.soleHalfExtentsSource.y)*actor.unitsPerSource};}
function stillRequirement(world,actor,startMs,endMs,kind){const r=radii(actor);return {kind,startMs,endMs,bodyEnvelope:box([world.root],r.body),supportEnvelope:box(Object.values(world.feet).map(f=>f.position),r.sole)};}
function stageRequirements(stages,actor,startMs){const r=radii(actor);return stages.map(stage=>{const endMs=startMs+Math.ceil(stage.route.totalMs),roots=[stage.route.start.position,stage.route.goal.position,...(stage.route.segments??[]).flatMap(s=>s.control)],feet=[...Object.values(stage.gait.initial).map(f=>f.position),...stage.gait.events.flatMap(e=>[e.from.position,e.to.position])];const row={kind:stage.kind,startMs,endMs,bodyEnvelope:box(roots,r.body),supportEnvelope:box(feet,r.sole)};startMs=endMs;return row;});}
function sampleStages(stages,actor,elapsed){for(const stage of stages){const ms=Math.ceil(stage.route.totalMs);if(elapsed<ms){elapsed=Math.min(elapsed,stage.route.totalMs);const step=Math.max(0,(elapsed-stage.route.anticipationMs)/actor.halfStepMs);return {world:sampleMotion(stage.route,stage.gait,actor,elapsed),startsFromSettled:true,styleFrame:29+7.5*((step%2+2)%2),anticipationU:Math.max(0,Math.min(1,elapsed/stage.route.anticipationMs)),settleU:Math.max(0,Math.min(1,(elapsed-stage.route.anticipationMs-stage.route.moveMs)/stage.route.settleMs)),intention:stage.kind};}elapsed-=ms;}throw Error('R1_SAVED_STAGE_TIME_INVALID');}

/** The root, target, all placed props, food and entry route determine the anchor.
 * The bounded grid is a navigation search, never a fixed authored scene. The
 * complete rest envelopes must leave the same target's full incoming route free.
 * Future visitors still require ordinary time/space conflict checks. */
function neutralRest(base,geometry,rows){
 const actor=base.actor,nav=createCanonicalNavigation({geometry,rows,actor}),r=radii(actor);
 const protectedBoxes=base.reservationRequirements.spatial.filter(x=>x.endMs<=base.phases[2].startMs||x.kind==='peek-and-rest').flatMap(x=>[x.bodyEnvelope,x.supportEnvelope]);
 const occupiedTargetBoxes=base.reservationRequirements.spatial.filter(x=>x.kind==='peek-and-rest').flatMap(x=>[x.bodyEnvelope,x.supportEnvelope]);
 const exitGeometry={...geometry,exclusions:[...geometry.exclusions,...occupiedTargetBoxes.map((b,i)=>({id:`readmission-target:${i}`,kind:'source-r1-readmission-envelope',polygon:[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]]}))]};
 const exitNavigation=createCanonicalNavigation({geometry:exitGeometry,rows,actor}),exitReachable=exitNavigation.withEntry(base.portal.join);
 const candidates=[];for(let y=geometry.domain.min[1];y<=geometry.domain.max[1];y+=4)for(let x=geometry.domain.min[0];x<=geometry.domain.max[0];x+=4){const position={x,y};if(!nav.passable(position)||!exitNavigation.passable(position)||protectedBoxes.some(b=>overlap(box([position],r.body),b))||!exitReachable.routeTo(position))continue;candidates.push(position);}
 candidates.sort((a,b)=>Math.hypot(a.x-base.settled.root.x,a.y-base.settled.root.y)-Math.hypot(b.x-base.settled.root.x,b.y-base.settled.root.y)||a.x-b.x||a.y-b.y);
 for(const position of candidates.slice(0,24)){
  const heading=Math.atan2(base.portal.join.y-position.y,base.portal.join.x-position.x);
  const transfer=planStayTransfer({geometry,rows,actor,previous:base.settled,goal:{position,heading}});if(!transfer.prepared)continue;
  const rest=stillRequirement(transfer.settled,actor,0,1,'neutral-rest');if(protectedBoxes.some(b=>overlap(rest.bodyEnvelope,b)||overlap(rest.supportEnvelope,b)))continue;
  // The released target may immediately be occupied by the next admitted Pip.
  // Its stationary body/support zone is a real obstacle for our complete exit,
  // rather than being assumed empty after clearing our own target ownership.
  const exit=planStayTransfer({geometry:exitGeometry,rows,actor,previous:transfer.settled,goal:{position:base.portal.join,heading:base.portal.outwardHeading}});if(!exit.prepared)continue;
  if(stageRequirements(exit.stages,actor,0).some(s=>occupiedTargetBoxes.some(b=>overlap(s.bodyEnvelope,b)||overlap(s.supportEnvelope,b))))continue;
  const portal=buildR1FrontPortal(geometry,actor,rows),outside=qualifyStayStage(supportedLine(actor,{position:portal.join,heading:portal.outwardHeading},portal.outside),actor,exit.settled,portal.navigation,'front-edge-exit');if(!outside.prepared)continue;
  return {transfer,exitStages:[...exit.stages,outside],restWorld:transfer.settled,protectedBoxes,occupiedTargetBoxes,search:{spacing:4,maxRouteAttempts:24,selected:position}};
 }
 throw Error('R1_SAVED_NO_NEUTRAL_REST_ANCHOR');
}

export function prepareR1SavedStay(input={}){
 try{
  if(input.motionProfile&&input.motionProfile!=='r1-supported-baseline-v1')throw Error('R1_SAVED_MOTION_PROFILE_UNAVAILABLE');
  const geometry=r1SavedStayGeometry();
  const prepared=prepareR1Stay({...input,geometry,motionProfile:'r1-supported-baseline-v1'});if(!prepared.prepared)throw Error(prepared.code);
  const base=prepared.plan,neutral=neutralRest(base,geometry,input.rows),releaseAt=base.arrivedAt+Math.ceil((base.leavesAt-base.arrivedAt)*.84),retreatAt=releaseAt-duration(neutral.transfer.stages),departureAt=base.leavesAt-duration(neutral.exitStages);
  if(retreatAt<=base.phases[2].endMs+30000||departureAt<=releaseAt)throw Error('R1_SAVED_REST_TIMING_UNAVAILABLE');
  // Finish the last leaf gesture before locomotion; do not cut a seeded look
  // abruptly merely because the fixed economic release lands inside it.
  const inspectionPlan=clone(base);
  inspectionPlan.episodes=inspectionPlan.episodes.filter(e=>e.startMs<retreatAt).map(e=>{
   if(e.endMs<=retreatAt)return e;
   if(e.kind==='quiet-rest'||retreatAt-e.startMs>=1000)return {...e,endMs:retreatAt};
   return {kind:'quiet-rest',startMs:e.startMs,endMs:retreatAt,target:'supported-rest'};
  });
  const spatial=[...base.reservationRequirements.spatial.filter(r=>r.endMs<=base.phases[2].startMs),stillRequirement(base.settled,base.actor,base.phases[2].startMs,retreatAt,'peek-and-target-rest'),...stageRequirements(neutral.transfer.stages,base.actor,retreatAt),stillRequirement(neutral.restWorld,base.actor,releaseAt,departureAt,'neutral-rest'),...stageRequirements(neutral.exitStages,base.actor,departureAt)];
  const plan={format:'yard-canonical-stay/v3',profile:R1_SAVED_STAY_PROFILE,navigationProfile:R1_SAVED_NAVIGATION_PROFILE,visitId:base.visitId,arrivedAt:base.arrivedAt,leavesAt:base.leavesAt,releaseAt,retreatAt,departureAt,layoutKey:base.layoutKey,storageScope:clone(base.storageScope),navigationScope:clone(base.navigationScope),geometryHash:digest(geometry),source:clone(base.source),actor:clone(base.actor),inspectionPlan:base,retreatStages:neutral.transfer.stages,restWorld:neutral.restWorld,exitStages:neutral.exitStages,search:neutral.search,protectedIncomingBoxes:neutral.protectedBoxes,reservationRequirements:{format:'canonical-visit-reservation-requirements/v2',authoritative:false,coordinateSpace:'canonical-ground',locationId:base.locationId,navigationProfile:R1_SAVED_NAVIGATION_PROFILE,target:{slotId:base.target.slotId,startMs:base.arrivedAt,endMs:releaseAt},spatial},qualification:{admission:false,visual:false,fullStay:false}};
  plan.inspectionPlan=inspectionPlan;
  plan.readmissionOccupancy={revision:'same-target-r1-full-envelope/v1',boxes:neutral.occupiedTargetBoxes};
  return {prepared:true,ready:false,admission:false,plan:deepFreeze(plan)};
 }catch(error){return {prepared:false,ready:false,admission:false,code:error.message};}
}

/** A newly admitted same-target visitor increments wear after our release. New
 * condition art and identical geometry/lifetime permit this one monotonic update
 * without rewriting the old visit. Every other changed layout still needs an
 * authoritative replan. Before release even this target-use change is stale. */
export function r1SavedStayLayoutCompatible(plan,serverNow,geometry,rows){
 try{
  if(!Number.isFinite(serverNow))return false;
  if(r1StayLayoutKey(geometry,rows)===plan.layoutKey)return true;
  if(serverNow<plan.releaseAt)return false;
  const target=plan.inspectionPlan.target,current=rows.find(r=>r.slotId===target.slotId);
  if(!current||current.condition!=='new'||!Number.isSafeInteger(current.uses)||current.uses<target.uses||current.uses>=itemProtocol.item.durability)return false;
  return r1StayLayoutKey(geometry,rows.map(r=>r.slotId===target.slotId?{...r,uses:target.uses}:r))===plan.layoutKey;
 }catch{return false;}
}

export function sampleR1SavedStay(plan,serverNow,{rows,geometry=r1SavedStayGeometry()}={}){
 if(plan?.format!=='yard-canonical-stay/v3'||plan.profile!==R1_SAVED_STAY_PROFILE||!Number.isFinite(serverNow))throw Error('R1_SAVED_SAMPLE_INVALID');
 const base={visitId:plan.visitId,serverNow,admission:false,savedVisitor:false};
 if(serverNow>=plan.leavesAt)return {...base,phase:'departed',sample:null,nextChangeAt:null,needsAnimationFrame:false};
 let key;try{key=r1StayLayoutKey(geometry,rows);}catch{return {...base,phase:'unavailable',code:'R1_SAVED_CURRENT_LAYOUT_INVALID',sample:null,nextChangeAt:null,needsAnimationFrame:false};}
 if(key!==plan.layoutKey&&!r1SavedStayLayoutCompatible(plan,serverNow,geometry,rows))return {...base,phase:'unavailable',code:'R1_SAVED_LAYOUT_CHANGED',sample:null,nextChangeAt:null,needsAnimationFrame:false};
 if(serverNow<plan.retreatAt){const sampled=sampleR1Stay(plan.inspectionPlan,serverNow);return {...sampled,nextChangeAt:sampled.nextChangeAt===null?null:Math.min(sampled.nextChangeAt,plan.retreatAt)};}
 if(serverNow<plan.releaseAt)return {...base,phase:'retreat',sample:sampleStages(plan.retreatStages,plan.actor,serverNow-plan.retreatAt),nextChangeAt:plan.releaseAt,needsAnimationFrame:true};
 if(serverNow<plan.departureAt)return {...base,phase:'neutral-rest',sample:{world:clone(plan.restWorld),startsFromSettled:true,styleFrame:96,anticipationU:1,settleU:1,intention:'neutral-rest'},nextChangeAt:plan.departureAt,needsAnimationFrame:false};
 return {...base,phase:'exit',sample:sampleStages(plan.exitStages,plan.actor,serverNow-plan.departureAt),nextChangeAt:plan.leavesAt,needsAnimationFrame:true};
}
