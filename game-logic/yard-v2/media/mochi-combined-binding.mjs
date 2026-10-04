/** Calibrated, opt-in Mochi composite candidate. Production admission stays shut
 * until visual QA and explicit actor registration; geometry planning is usable
 * independently for preview and regression tests. No save mutation occurs here. */
import {presentationReservationsConflict} from '../visit-reservations.mjs';
import {planningSceneWithObstacles,obstacleContextRevision} from '../prop-obstacles.mjs';
import {clone,deepFreeze,digest} from '../util.mjs';
import {footprint,overlaps,buildNavigation} from '../geometry.mjs';
import {groundCoverageAllowed,paddedConvexPolygon} from '../ground-coverage.mjs';
import {createAuthoredMotionGround} from './authored-motion-ground.mjs';
import {createAuthoredRouteAdapter} from './authored-stride-routes.mjs';
const finite=Number.isFinite,near=(a,b)=>Math.abs(a-b)<1e-6;
export const MOCHI_COMBINED_SCHEDULE='mochi-anchored-composite/v1';
export function createMochiCombinedCandidate({clip,strideContract,motionContract,scene}={}){
 const c=clone(clip),s=clone(scene),motion=clone(motionContract),routes=createAuthoredRouteAdapter({strideContract,motionContract:motion});
 if(c?.format!=='yard-combined-prop-binding/v1'||c.visitorId!=='mochi_bunny'||c.goodieId!=='yarn_mouse'
  ||c.geometryValidated!==true||c.propMode!=='composited'||c.staticProp!==true||c.unitsPerWorld!==motion.unitsPerWorld
  ||!s?.entry||![s.entry.x,s.entry.y].every(finite)||!s.footprints?.yarn_mouse
  ||c.entry.facing!==0||c.exit.facing!==0||c.samples[0].atMs!==0||c.samples.at(-1).atMs!==c.durationMs
  ||c.samples.some((r,i)=>r.atMs!==i*c.sourceSampleMs||r.root?.length!==3||!r.root.every(finite)))throw new TypeError('Complete calibrated Mochi combined source required');
 const loop=c.restLoop,period=loop.endMs-loop.startMs;
 if(!Number.isSafeInteger(period)||period<=0||loop.startMs<0||loop.endMs>c.durationMs||period!==loop.frames*c.sourceSampleMs)throw new TypeError('Validated source rest cycle required');
 deepFreeze(c);deepFreeze(s);const u=c.unitsPerWorld;
 const calibration=digest({clip:c,scene:s,motionId:motion.id,rootContract:strideContract});
 const binding=deepFreeze({id:c.id,revision:c.revision,visitorId:c.visitorId,goodieId:c.goodieId,activityIds:clone(c.activityIds),conditions:['new'],
  propMode:'composited',calibrationHash:calibration,playbackReady:false,requiredPhases:clone(c.requiredPhases),validatedPhases:clone(c.validatedPhases),
  unavailableReason:'BROWSER_VISUAL_QA_AND_ACTOR_REGISTRATION_REQUIRED'});
 const atRoot=(anchor,root)=>({x:anchor.x+root[0]*u,y:anchor.y+root[1]*u,z:root[2]});
 const box=(e,origin)=>({x:origin.x+e.minimum[0]*u,y:origin.y+e.minimum[1]*u,width:(e.maximum[0]-e.minimum[0])*u,height:(e.maximum[1]-e.minimum[1])*u});
 const requestedRows=candidate=>[...(candidate.active||[]),...(candidate.reserved||[])];
 const calibratedScene=s;
 function preflightCandidate(candidate,obstacleContext){
  const p=candidate?.placement,yard=candidate?.yard;
  const planning=planningSceneWithObstacles(calibratedScene,yard,obstacleContext);if(!planning.ok)return planning;const s=planning.scene;
  if(!p||p.goodieId!==c.goodieId||typeof p.slotId!=='string'||!p.slotId||![p.x,p.y].every(finite))return{ok:false,code:'TARGET_PROP_UNAVAILABLE'};
  if(candidate.visitor&&candidate.visitor.id!==c.visitorId)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
  if(!Number.isSafeInteger(candidate.at)||!Number.isSafeInteger(candidate.leavesAt)||candidate.leavesAt<=candidate.at)return{ok:false,code:'INVALID_VISIT_TIME'};
  if(p.condition!=='new'||!near(p.rotationZ??0,c.supportedPropYaw))return{ok:false,code:'TARGET_PROP_STATE_UNSUPPORTED'};
  if(!yard||!Array.isArray(yard.placedGoodies)||yard.placedGoodies.filter(q=>q.slotId===p.slotId).length!==1
   ||yard.placedGoodies.some(q=>![q.x,q.y].every(finite)||!s.footprints?.[q.goodieId]))return{ok:false,code:'PLACEMENT_CALIBRATION_UNAVAILABLE'};
  const stored=yard.placedGoodies.find(q=>q.slotId===p.slotId);
  if(stored.goodieId!==p.goodieId||stored.x!==p.x||stored.y!==p.y||!near(stored.rotationZ??0,p.rotationZ??0)||stored.condition!==p.condition)return{ok:false,code:'TARGET_PLACEMENT_MISMATCH'};
  const origin={x:p.x-c.propRoot[0]*u,y:p.y-c.propRoot[1]*u},startRoot=atRoot(origin,c.entry.root),endRoot=atRoot(origin,c.exit.root);
  const other=yard.placedGoodies.filter(q=>q.slotId!==p.slotId).map(q=>footprint(q,s));
  const obstacles=yard.placedGoodies.map(q=>footprint(q,s)).concat(s.exclusions||[]),outside=other.concat(s.exclusions||[]);
  if(obstacles.some(r=>!r))return{ok:false,code:'PROP_ENVELOPE_UNAVAILABLE'};
  const region=box(c.compositeEnvelope,origin);
  if(region.x<0||region.y<0||region.x+region.width>100||region.y+region.height>100||outside.some(r=>overlaps(region,r)))return{ok:false,code:'COMPOSITE_REGION_BLOCKED'};
  // Only the exact frozen target geometry is omitted here. Its complete source
  // approach/rest/departure has independent mesh clearance. External routes keep
  // the target in both sole and body obstacles, with no blanket exemption.
  const soles=c.groundFootprints.map(f=>paddedConvexPolygon(f.polygon,c.groundPaddingWorld));
  if(!groundCoverageAllowed(soles,origin,yard.remodel,{unitsPerWorld:u,obstacles:outside}))return{ok:false,code:'COMPOSITE_GROUND_UNSAFE'};
  const guard=createAuthoredMotionGround(motion,{remodel:yard.remodel,obstacles});
  const nav=buildNavigation(yard,{...s,actorRadius:.05,exclusions:s.exclusions||[]});
  const incoming=routes.plan({navigation:nav,guard,anchor:startRoot,entry:s.entry,incoming:true,atMs:candidate.at,portalHalfSize:s.entryClearance??4});
  const outgoing=routes.plan({navigation:nav,guard,anchor:endRoot,entry:s.entry,incoming:false,atMs:candidate.at,portalHalfSize:s.entryClearance??4});
  if(!incoming.ok||!outgoing.ok)return{ok:false,code:'AUTHORED_ROUTE_UNAVAILABLE',incomingReason:incoming.reason,outgoingReason:outgoing.reason};
  const fixed=incoming.durationMs+c.durationMs-period+outgoing.durationMs,cycles=Math.floor((candidate.leavesAt-candidate.at-fixed)/period);
  if(cycles<1)return{ok:false,code:'STAY_TOO_SHORT_FOR_AUTHORED_MOTION'};
  const delay=candidate.leavesAt-candidate.at-fixed-cycles*period;let cursor=candidate.at+delay;
  const segments=[];if(delay)segments.push({kind:'hidden',startAt:candidate.at,endAt:cursor,role:'entry-wait'});
  if(incoming.durationMs){segments.push({kind:'route',route:incoming,startAt:cursor,endAt:cursor+incoming.durationMs,role:'approach'});cursor+=incoming.durationMs;}
  const combinedStart=cursor;
  const add=(kind,duration,sourceStartMs,role,extra={})=>{segments.push({kind,startAt:cursor,endAt:cursor+duration,sourceStartMs,clipId:c.id,clipOrigin:clone(origin),propOwnerSlotId:p.slotId,role,...extra});cursor+=duration;};
  add('clip',loop.startMs,0,'play');add('loop',cycles*period,loop.startMs,'rest',{sourceEndMs:loop.endMs,cycles});add('clip',c.durationMs-loop.endMs,loop.endMs,'wake');
  const combinedEnd=cursor;
  if(outgoing.durationMs)segments.push({kind:'route',route:outgoing,startAt:cursor,endAt:candidate.leavesAt,role:'depart'});
  const reservations=[{startMs:combinedStart,endMs:combinedEnd,rect:region},
   ...incoming.legs.map(l=>guard.reservation(l,candidate.at+delay+l.startMs)),...outgoing.legs.map(l=>guard.reservation(l,combinedEnd+l.startMs))];
  for(const r of requestedRows(candidate)){
   const end=Number.isSafeInteger(r.leavesAt)?r.leavesAt:Number.MAX_SAFE_INTEGER,start=Number.isSafeInteger(r.arrivedAt)?r.arrivedAt:-Number.MAX_SAFE_INTEGER;
   if(presentationReservationsConflict(reservations,r))return{ok:false,code:'PRESENTATION_REGION_RESERVED'};
   if(r.slotId===p.slotId&&candidate.at<end&&candidate.leavesAt>start)return{ok:false,code:'TARGET_PROP_RESERVED'};
  }
  const schedule={version:MOCHI_COMBINED_SCHEDULE,arrivalAt:candidate.at,enterAt:candidate.at+delay,leavesAt:candidate.leavesAt,
   combinedStart,combinedEnd,propReleaseAt:combinedEnd,entryDelayMs:delay,loop:{...clone(loop),cycles},segments,propCommits:[],giftAuthority:'server-economic-visit-completion'};
  return{ok:true,plan:deepFreeze({...(planning.receipt?{obstacleReceipt:planning.receipt}:{}),version:3,clipId:c.id,calibrationHash:calibration,visitorId:c.visitorId,slotId:p.slotId,
   clipOrigin:origin,startRoot,endRoot,initialPlacement:clone(p),finalTransform:clone(p),requiresEndpointCommit:false,
   singleVisualOwner:'combined-clip-while-frame-ready',incoming,outgoing,schedule,reservations,reservationBoxes:reservations.map(r=>r.rect),runtimeActivated:false})};
 }
 function sample(plan,at){
  if(plan?.calibrationHash!==calibration||plan.schedule?.version!==MOCHI_COMBINED_SCHEDULE||!finite(at))return null;
  const schedule=plan.schedule;if(at<schedule.enterAt||at>=schedule.leavesAt)return null;
  const seg=schedule.segments.find(s=>at>=s.startAt&&at<s.endAt);if(!seg||seg.kind==='hidden')return null;
  if(seg.kind==='route')return{...routes.sample(seg.route,at-seg.startAt),phase:seg.role,role:seg.role,slotId:plan.slotId,propOwnerSlotId:null};
  const sourceMs=seg.sourceStartMs+(seg.kind==='loop'?(at-seg.startAt)%(seg.sourceEndMs-seg.sourceStartMs):at-seg.startAt);
  const index=Math.min(c.samples.length-1,Math.floor(sourceMs/c.sourceSampleMs)),row=c.samples[index];
  return{phase:'active-clip',role:seg.role,clipId:c.id,clipAtMs:sourceMs,frameIndex:index,clipOrigin:clone(plan.clipOrigin),position:atRoot(plan.clipOrigin,row.root),
   headingRadians:row.bodyYaw,slotId:plan.slotId,propOwnerSlotId:plan.slotId,containsTargetProp:true};
 }
 function compose(props,plan,at,{readyFrame=null}={}){
  if(!Array.isArray(props))throw new TypeError('Explicit prop rows required');
  const pose=sample(plan,at),target=plan?.initialPlacement?props.filter(p=>p.slotId===plan.slotId):[],current=target[0]?.transform||target[0];
  const unchanged=target.length===1&&target[0].goodieId===c.goodieId&&target[0].condition===plan.initialPlacement.condition&&current
   &&near(current.x,plan.initialPlacement.x)&&near(current.y,plan.initialPlacement.y)
   &&near(current.rotationZ??0,plan.initialPlacement.rotationZ??0);
  const decoded=readyFrame?.clipId===pose?.clipId&&readyFrame?.frameIndex===pose?.frameIndex;
  const owner=pose?.containsTargetProp&&decoded&&unchanged?plan.slotId:null;
  return{pose:(owner||!pose?.containsTargetProp)?pose:null,props:props.map(p=>p.slotId===owner?{...clone(p),drawStandalone:false,visualOwner:c.id}:clone(p)),
   targetSlotHidden:owner,clipOrigin:owner?clone(plan.clipOrigin):null,requiresCoherentFrameHold:!!pose?.containsTargetProp&&!owner,
   ...(pose?.containsTargetProp&&!unchanged?{issue:'TARGET_PROP_CHANGED'}:{})};
 }
 return Object.freeze({binding,clip:c,scene:s,preflightCandidate,sample,compose,
  preflight:()=>({ok:false,code:'BROWSER_VISUAL_QA_AND_ACTOR_REGISTRATION_REQUIRED'})});
}
