/** Pip-specific calibrated source candidate. Default admission is always closed.
 * Only the exact static new-state Snack Table is covered by this source. */
import {clone,deepFreeze,digest} from '../util.mjs';
import {PIP_ACTOR_REFERENCE,PIP_ACTOR_PROFILE} from '../pip-actor-profile.mjs';
import {footprint,overlaps,buildNavigation} from '../geometry.mjs';
import {groundCoverageAllowed,paddedConvexPolygon} from '../ground-coverage.mjs';
import {createPipMotionGround} from './pip-authored-motion-ground.mjs';
import {createPipRouteAdapter} from './pip-authored-routes.mjs';
import {YARD_GOODIES} from '../catalog.mjs';
import {foodRefillPolicy} from '../availability.mjs';
import {FOOD_BINDINGS,BOWL_BINDINGS,foodVesselExclusion} from '../food-media.mjs';
const finite=Number.isFinite,near=(a,b)=>Math.abs(a-b)<1e-6;
export const PIP_SCHEDULE='pip-snack-persistent/v1';
export function createPipSnackCandidate({clip,strideContract,motionContract,scene}={}){
 const c=clone(clip),u=8,prop=c?.propEnvelope,root=c?.propRoot;
 if(c?.format!=='yard-combined-prop-binding/v1'||c.id!=='pip-snack-combined-r1'||c.visitorId!=='pip_hamster'||c.goodieId!=='snack_table'||c.geometryValidated!==true||c.playbackReady!==false||c.runtimeActivated!==false||c.sourceSampleMs!==40||c.unitsPerWorld!==u||c.entry?.facing!==0||c.exit?.facing!==4||c.propMode!=='composited'||c.staticProp!==true||c.samples?.some((r,i)=>r.atMs!==i*40)||c.samples.at(-1).atMs!==c.durationMs)throw TypeError('Exact closed Pip/table source required');
 const footprintSize={width:2*Math.max(Math.abs(prop.minimum[0]-root[0]),Math.abs(prop.maximum[0]-root[0]))*u,height:2*Math.max(Math.abs(prop.minimum[1]-root[1]),Math.abs(prop.maximum[1]-root[1]))*u};
 const s=clone(scene||{entry:{x:90,y:68},entryClearance:4,exclusions:[foodVesselExclusion()],footprints:{yarn_mouse:{width:8.8,height:3.2},sun_cushion:{width:22.4,height:19.2},snack_table:footprintSize}});
 if(!s.entry||![s.entry.x,s.entry.y].every(finite)||!near(s.footprints?.snack_table?.width,footprintSize.width)||!near(s.footprints.snack_table.height,footprintSize.height))throw TypeError('Exact source table footprint required');
 const routes=createPipRouteAdapter({strideContract,motionContract}),loop=c.restLoop,period=loop.endMs-loop.startMs;
 if(loop.startMs!==17920||loop.endMs!==19200||period!==32*40||loop.fps!==25)throw TypeError('Exact Pip source rest loop required');
 deepFreeze(c);deepFreeze(s);const calibration=digest({actorProfile:PIP_ACTOR_PROFILE,clip:c,scene:s,motion:motionContract,stride:strideContract});
 const binding=deepFreeze({id:c.id,revision:c.revision,visitorId:c.visitorId,goodieId:c.goodieId,activityIds:['nibble'],conditions:['new'],actorProfile:clone(PIP_ACTOR_REFERENCE),groundFootprintRevision:PIP_ACTOR_PROFILE.ground.revision,propMode:'composited',calibrationHash:calibration,playbackReady:false,requiredPhases:clone(c.requiredPhases),validatedPhases:clone(c.validatedPhases),unavailableReason:'PIP_CANONICAL_VISIT_AND_BROWSER_ACCEPTANCE_REQUIRED'});
 const mediaRegistry=deepFreeze({revision:'pip-snack-candidate/r1',kind:'inactive-pip-source',bindings:[binding],foodBindings:clone(FOOD_BINDINGS),bowlBindings:clone(BOWL_BINDINGS)});
 const atRoot=(origin,r)=>({x:origin.x+r[0]*u,y:origin.y+r[1]*u,z:r[2]});
 const box=(e,o)=>({x:o.x+e.minimum[0]*u,y:o.y+e.minimum[1]*u,width:(e.maximum[0]-e.minimum[0])*u,height:(e.maximum[1]-e.minimum[1])*u});
 function preflightCandidate(candidate){
  const p=candidate?.placement,yard=candidate?.yard;
  if(!p||p.goodieId!==c.goodieId||typeof p.slotId!=='string'||!p.slotId||![p.x,p.y].every(finite))return{ok:false,code:'TARGET_PROP_UNAVAILABLE'};
  if(candidate.visitor?.id!==c.visitorId)return{ok:false,code:'ACTOR_PROFILE_UNAVAILABLE'};
  if(candidate.activity?.id!=='nibble')return{ok:false,code:'ACTIVITY_MEDIA_UNAVAILABLE'};
  if(!Number.isSafeInteger(candidate.at)||!Number.isSafeInteger(candidate.leavesAt)||candidate.leavesAt<=candidate.at)return{ok:false,code:'INVALID_VISIT_TIME'};
  const food=foodRefillPolicy({foodId:candidate.bowl?.foodId,bowl:candidate.bowl,mediaRegistry});if(!food.ok)return{ok:false,code:food.reason};
  if(yard?.remodel!=='meadow')return{ok:false,code:'REMODEL_PRESENTATION_UNAVAILABLE'};
  if(p.condition!=='new'||!near(p.rotationZ??0,0))return{ok:false,code:'TARGET_PROP_STATE_UNSUPPORTED'};
  const uses=p.uses??0;if(!Number.isSafeInteger(uses)||uses<0||uses+1>=YARD_GOODIES.snack_table.durability)return{ok:false,code:'POST_ADMISSION_PROP_STATE_UNSUPPORTED'};
  if(!Array.isArray(yard.placedGoodies)||yard.placedGoodies.filter(q=>q.slotId===p.slotId).length!==1||yard.placedGoodies.some(q=>![q.x,q.y].every(finite)||!s.footprints[q.goodieId]))return{ok:false,code:'PLACEMENT_CALIBRATION_UNAVAILABLE'};
  const stored=yard.placedGoodies.find(q=>q.slotId===p.slotId);
  if(stored.goodieId!==p.goodieId||stored.x!==p.x||stored.y!==p.y||stored.condition!==p.condition||!near(stored.rotationZ??0,p.rotationZ??0)||(stored.uses??0)!==uses)return{ok:false,code:'TARGET_PLACEMENT_MISMATCH'};
  const existing=[...(candidate.active||[]),...(candidate.reserved||[])];
  if(existing.some(r=>(r.original?.visitorId||r.visitorId)===c.visitorId&&(!finite(r.leavesAt)||r.leavesAt>candidate.at)))return{ok:false,code:'PIP_ALREADY_VISITING'};
  const origin={x:p.x-c.propRoot[0]*u,y:p.y-c.propRoot[1]*u},startRoot=atRoot(origin,c.entry.root),endRoot=atRoot(origin,c.exit.root);
  const obstacles=yard.placedGoodies.map(q=>footprint(q,s)).concat(s.exclusions||[]),outside=yard.placedGoodies.filter(q=>q.slotId!==p.slotId).map(q=>footprint(q,s)).concat(s.exclusions||[]),region=box(c.compositeEnvelope,origin);
  if(region.x<0||region.y<0||region.x+region.width>100||region.y+region.height>100||outside.some(r=>overlaps(region,r)))return{ok:false,code:'COMPOSITE_REGION_BLOCKED'};
  const soles=c.groundFootprints.map(f=>paddedConvexPolygon(f.polygon,c.groundPaddingWorld));
  if(!groundCoverageAllowed(soles,origin,yard.remodel,{unitsPerWorld:u,obstacles:outside}))return{ok:false,code:'COMPOSITE_GROUND_UNSAFE'};
  // Target omission is confined to this exact source whose solid clearance and
  // real tabletop support rays passed. External routes retain every obstacle.
  const guard=createPipMotionGround(motionContract,{remodel:yard.remodel,obstacles}),navigation=buildNavigation(yard,{...s,actorRadius:.05});
  const incoming=routes.plan({navigation,guard,anchor:startRoot,entry:s.entry,incoming:true,initialFacing:0,atMs:candidate.at,portalHalfSize:s.entryClearance??4});
  const outgoing=routes.plan({navigation,guard,anchor:endRoot,entry:s.entry,incoming:false,initialFacing:4,atMs:candidate.at,portalHalfSize:s.entryClearance??4});
  if(!incoming.ok||!outgoing.ok)return{ok:false,code:'PIP_AUTHORED_ROUTE_UNAVAILABLE',incomingReason:incoming.reason,outgoingReason:outgoing.reason};
  const fixed=incoming.durationMs+c.durationMs-period+outgoing.durationMs,cycles=Math.floor((candidate.leavesAt-candidate.at-fixed)/period);
  if(cycles<1)return{ok:false,code:'STAY_TOO_SHORT_FOR_AUTHORED_MOTION'};
  const delay=candidate.leavesAt-candidate.at-fixed-cycles*period;let cursor=candidate.at+delay;const segments=[];
  if(delay)segments.push({kind:'hidden',startAt:candidate.at,endAt:cursor,role:'entry-wait'});
  if(incoming.durationMs){segments.push({kind:'route',route:incoming,startAt:cursor,endAt:cursor+incoming.durationMs,role:'approach'});cursor+=incoming.durationMs;}
  const combinedStart=cursor,add=(kind,duration,sourceStartMs,role,extra={})=>{segments.push({kind,startAt:cursor,endAt:cursor+duration,sourceStartMs,clipId:c.id,clipOrigin:clone(origin),propOwnerSlotId:p.slotId,role,...extra});cursor+=duration;};
  add('clip',loop.startMs,0,'nibble');add('loop',cycles*period,loop.startMs,'rest',{sourceEndMs:loop.endMs,cycles});add('clip',c.durationMs-loop.endMs,loop.endMs,'wake');const combinedEnd=cursor;
  if(outgoing.durationMs)segments.push({kind:'route',route:outgoing,startAt:cursor,endAt:candidate.leavesAt,role:'depart'});
  const reservations=[{startMs:combinedStart,endMs:combinedEnd,rect:region},...incoming.legs.map(l=>guard.reservation(l,candidate.at+delay+l.startMs)),...outgoing.legs.map(l=>guard.reservation(l,combinedEnd+l.startMs))];
  for(const r of existing){
   const end=Number.isSafeInteger(r.leavesAt)?r.leavesAt:Number.MAX_SAFE_INTEGER,start=Number.isSafeInteger(r.arrivedAt)?r.arrivedAt:-Number.MAX_SAFE_INTEGER,boxes=r.mediaAdmission?.plan?.reservationBoxes||r.reservationBoxes||[];
   if(reservations.some(n=>n.startMs<end&&n.endMs>start&&boxes.some(old=>overlaps(n.rect,old))))return{ok:false,code:'PRESENTATION_REGION_RESERVED'};
   if(r.slotId===p.slotId&&candidate.at<end&&candidate.leavesAt>start)return{ok:false,code:'TARGET_PROP_RESERVED'};
  }
  const schedule={version:PIP_SCHEDULE,arrivalAt:candidate.at,enterAt:candidate.at+delay,leavesAt:candidate.leavesAt,combinedStart,combinedEnd,propReleaseAt:combinedEnd,entryDelayMs:delay,loop:{...clone(loop),cycles},segments,propCommits:[],giftAuthority:'server-economic-visit-completion'};
  return{ok:true,plan:deepFreeze({version:3,actorProfile:clone(PIP_ACTOR_REFERENCE),groundFootprintRevision:PIP_ACTOR_PROFILE.ground.revision,arrivalAt:candidate.at,departureAt:combinedEnd,propReleaseAt:combinedEnd,segments:clone(segments),propCommits:[],clipId:c.id,calibrationHash:calibration,visitorId:c.visitorId,slotId:p.slotId,clipOrigin:origin,startRoot,endRoot,initialPlacement:clone(p),finalTransform:clone(p),requiresEndpointCommit:false,singleVisualOwner:'exact-composite-frame-while-ready',incoming,outgoing,schedule,reservations,reservationBoxes:reservations.map(r=>r.rect),runtimeActivated:false})};
 }
 function sample(plan,at){
  if(plan?.calibrationHash!==calibration||plan.schedule?.version!==PIP_SCHEDULE||!finite(at))return null;
  const s=plan.schedule;if(at<s.enterAt||at>=s.leavesAt)return null;const seg=s.segments.find(v=>at>=v.startAt&&at<v.endAt);if(!seg||seg.kind==='hidden')return null;
  if(seg.kind==='route')return{...routes.sample(seg.route,at-seg.startAt),phase:seg.role,role:seg.role,slotId:plan.slotId,propOwnerSlotId:null};
  const sourceMs=seg.sourceStartMs+(seg.kind==='loop'?(at-seg.startAt)%(seg.sourceEndMs-seg.sourceStartMs):at-seg.startAt),index=Math.min(c.samples.length-1,Math.floor(sourceMs/40)),row=c.samples[index];
  return{phase:'active-clip',role:seg.role,sourceRole:row.role,clipId:c.id,clipAtMs:sourceMs,frameIndex:index,clipOrigin:clone(plan.clipOrigin),position:atRoot(plan.clipOrigin,row.root),headingRadians:row.bodyYaw,slotId:plan.slotId,propOwnerSlotId:plan.slotId,containsTargetProp:true};
 }
 function compose(props,plan,at,{readyFrame=null}={}){
  if(!Array.isArray(props))throw TypeError('Explicit current prop rows required');const pose=sample(plan,at),target=props.filter(p=>p.slotId===plan?.slotId),current=target[0]?.transform||target[0];
  const unchanged=target.length===1&&target[0].goodieId===c.goodieId&&target[0].condition===plan.initialPlacement.condition&&current&&near(current.x,plan.initialPlacement.x)&&near(current.y,plan.initialPlacement.y)&&near(current.rotationZ??0,plan.initialPlacement.rotationZ??0);
  const decoded=readyFrame?.clipId===pose?.clipId&&readyFrame?.frameIndex===pose?.frameIndex&&readyFrame?.sourceRevision===c.revision,owner=pose?.containsTargetProp&&decoded&&unchanged?plan.slotId:null;
  return{pose:(owner||!pose?.containsTargetProp)?pose:null,props:props.map(p=>p.slotId===owner?{...clone(p),drawStandalone:false,visualOwner:c.id}:clone(p)),targetSlotHidden:owner,clipOrigin:owner?clone(plan.clipOrigin):null,requiresCoherentFrameHold:!!pose?.containsTargetProp&&!owner,...(pose?.containsTargetProp&&!unchanged?{issue:'TARGET_PROP_CHANGED'}:{})};
 }
 return Object.freeze({binding,mediaRegistry,clip:c,scene:s,routes,preflightCandidate,sample,compose,actorProfiles:Object.freeze({}),preflight:()=>({ok:false,code:'PIP_CANONICAL_VISIT_AND_BROWSER_ACCEPTANCE_REQUIRED'})});
}
