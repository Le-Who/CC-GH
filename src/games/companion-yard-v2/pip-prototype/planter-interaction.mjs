/** Finite visual-only intention. One straight, fixed-heading approach is admitted;
 * this does not turn, teleport an existing actor, loop, or write saved Yard state.
 * Coordinates are canonical ground units. The anchor follows the prop placement.
 */
import {buildGaitRequest,sampleMotion,inspectKinematics} from './motion/kinematics.mjs';
import {smooth,angleDelta} from './motion/trajectory.mjs';
import {makeNavigation} from './motion/polygon-domain.mjs';
import {bounds,corners,transform} from './motion/math.mjs';
import {locationFor} from './routes.mjs';

export const PLANTER_INSPECTION_VERSION='pip-planter-inspection/experimental-v1';
export const PLANTER_INSPECTION_ANCHOR=Object.freeze({
  id:'negative-x-leaf',outward:Object.freeze([-1,0]),
  focusLocalCanonical:Object.freeze([-3.190874934196472,-.01556065957993269,8.066513299942017]),
  bodyForwardReserveSource:.075,groundGapSource:.04,approachLengthSource:.55,
  noticeMs:180,leanMs:380,sniffFirstMs:180,sniffGapMs:130,sniffSecondMs:210,
  curiosityMs:270,recoverMs:520,earOverlapMs:95,
});
// Receipts are private to this module and this exact setup owner. A replay
// reuses only an immutable admitted run, never a caller-supplied route object.
const admissions=new WeakMap();
function freezeTree(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}return value;}
function rememberAdmission(run,setup,placementIndex){
  const frozen=freezeTree(run);admissions.set(frozen,{setup,placementIndex,signature:JSON.stringify(setup)});return frozen;
}
function inspectionTiming(anchor,attentionVariant){
  const noticeMs=anchor.noticeMs+attentionVariant*60,timing={noticeEnd:noticeMs,leanEnd:noticeMs+anchor.leanMs};
  timing.firstEnd=timing.leanEnd+anchor.sniffFirstMs;
  timing.secondStart=timing.firstEnd+anchor.sniffGapMs;
  timing.secondEnd=timing.secondStart+anchor.sniffSecondMs;
  timing.recoverStart=timing.secondEnd+anchor.curiosityMs;
  timing.end=timing.recoverStart+anchor.recoverMs+anchor.earOverlapMs;return timing;
}
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
const ramp=(time,start,duration)=>smooth((time-start)/duration);
const pulse=(time,start,duration)=>{
  const u=(time-start)/duration;
  return u<=0||u>=1?0:64*u**3*(1-u)**3;
};
function envelope(root,heading,half){return corners({x:-half.x,y:-half.y,width:2*half.x,height:2*half.y}).map(p=>transform(p,{...root,yaw:heading}));}
function sameSupportedPose(previous,initial){
  if(!previous?.feet||previous.support?.length!==2)throw Error('Inspection requires two supported paws');
  if(Math.hypot(previous.root.x-initial.root.x,previous.root.y-initial.root.y)>1e-6||Math.abs(angleDelta(previous.heading,initial.heading))>1e-6)throw Error('Inspection requires its admitted approach pose; no implicit turn or teleport');
  for(const side of ['L','R']){
    const a=previous.feet[side],b=initial.feet[side];
    if(!a.planted||Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z)>1e-6||Math.abs(angleDelta(a.heading,b.heading))>1e-6)throw Error('Inspection would shift a planted paw');
  }
}

export function makePlanterInspection(setup,placementIndex=0,{anchor=PLANTER_INSPECTION_ANCHOR,previous=null,attentionVariant=0,holdOnly=false}={}){
  const actor=setup.actor,placement=setup.placements[placementIndex],p=setup.planter;
  if(p.geometryRevision!=='yard-succulent-T2')throw Error('Inspection requires the measured T2 succulent');
  if(!placement||!Number.isInteger(attentionVariant)||attentionVariant<0||attentionVariant>1)throw Error('Invalid inspection placement or attention variant');
  if(anchor.id!=='negative-x-leaf'||anchor.outward[0]!==-1||anchor.outward[1]!==0)throw Error('Only the qualified straight negative-X inspection anchor is supported');
  const units=actor.unitsPerSource,radius=p.navigationRadiusCanonical??p.foliageDiameter/2;
  if(!Number.isFinite(units)||units<=0||!Number.isFinite(radius)||radius<=0)throw Error('Explicit actor scale and prop bounds required');
  const half={x:(actor.bodyHalfExtentsSource.x+anchor.bodyForwardReserveSource)*units,y:actor.bodyHalfExtentsSource.y*units};
  const standOff=radius+half.x+anchor.groundGapSource*units,heading=0;
  const goal={position:{x:placement[0]-standOff,y:placement[1]},heading};
  const start={position:{x:goal.position.x-anchor.approachLengthSource*units,y:goal.position.y},heading};
  const location=locationFor(setup,placementIndex),nav=makeNavigation(location,actor,start.position);
  // For this fixed-heading line, the union of body rectangles is exactly this
  // swept rectangle. No radial clearance reduction or free-form route is used.
  const sweptBody=bounds([...envelope(start.position,heading,half),...envelope(goal.position,heading,half)]);
  if(!nav.clearBox(sweptBody))throw Error('Inspection body runway blocked');
  const length=anchor.approachLengthSource*units;
  const moveMs=Math.ceil(1.875*length/(actor.maxSpeedSourcePerSecond*units)*1000/actor.halfStepMs)*actor.halfStepMs;
  const approach={ok:true,format:'yard-continuous-trajectory-request/v1',start,goal,length,maxCurvature:0,moveMs,
    anticipationMs:actor.anticipationMs,settleMs:actor.halfStepMs*2,
    totalMs:actor.anticipationMs+moveMs+actor.halfStepMs*2,
    segments:[{kind:'line',control:[start.position,goal.position],offset:0,length,arc:[{t:0,length:0},{t:1,length}]}],
    qualification:'One fixed-heading rectangle sweep, not arbitrary-route navigation'};
  const gait=buildGaitRequest(approach,actor),check=inspectKinematics(approach,gait,actor,nav);
  if(!check.ok)throw Error('Inspection gait rejected: '+check.failures[0]?.code);
  if(holdOnly&&!previous)throw Error('A repeated inspection requires the existing supported anchor pose');
  if(previous)sameSupportedPose(previous,sampleMotion(approach,gait,actor,holdOnly?approach.totalMs:0));
  const timing=inspectionTiming(anchor,attentionVariant);
  const focusLocal=p.inspectionFocusLocalCanonical??anchor.focusLocalCanonical;
  if(focusLocal.length!==3||!focusLocal.every(Number.isFinite)||Math.abs(focusLocal[1])>.1||focusLocal[0]>=0||focusLocal[2]<0||focusLocal[2]>p.height)throw Error('Inspection focus is outside the qualified negative-X leaf');
  const focus={x:placement[0]+focusLocal[0],y:placement[1]+focusLocal[1],z:focusLocal[2]};
  return rememberAdmission({kind:PLANTER_INSPECTION_VERSION,placementIndex,anchor:structuredClone(anchor),actorScale:units,approach,gait,startsFromSettled:Boolean(previous),check,
    route:{totalMs:(holdOnly?0:approach.totalMs)+timing.end},timing,attentionVariant,focus,sweptBody,holdOnly,
    bodyHalfExtentsCanonical:half,standOffCanonical:standOff,
    qualification:'CPU-admitted finite intention; native motion/art acceptance remains required'},setup,placementIndex);
}

/** Lightweight manual replay at the already admitted two-paw goal. No grid,
 * route build or gait requalification runs in the click handler. */
export function repeatPlanterInspection(setup,admitted,{previous,attentionVariant=0}={}){
  const receipt=admissions.get(admitted);
  if(!receipt||receipt.setup!==setup||receipt.placementIndex!==admitted.placementIndex||receipt.signature!==JSON.stringify(setup))throw Error('Inspection admission changed; a new supported route is required');
  if(!Number.isInteger(attentionVariant)||attentionVariant<0||attentionVariant>1)throw Error('Invalid inspection attention variant');
  sameSupportedPose(previous,sampleMotion(admitted.approach,admitted.gait,setup.actor,admitted.approach.totalMs));
  const timing=inspectionTiming(admitted.anchor,attentionVariant);
  return rememberAdmission({...admitted,startsFromSettled:true,holdOnly:true,attentionVariant,timing,route:{totalMs:timing.end}},setup,receipt.placementIndex);
}

export function samplePlanterInspection(setup,run,elapsedMs){
  if(run?.kind!==PLANTER_INSPECTION_VERSION||setup.actor.unitsPerSource!==run.actorScale)throw Error('Inspection actor scale changed');
  const at=limit(elapsedMs,0,run.route.totalMs),r=run.approach,a=setup.actor;
  const approachAt=run.holdOnly?r.totalMs:Math.min(at,r.totalMs),step=Math.max(0,(approachAt-r.anticipationMs)/a.halfStepMs);
  const world=sampleMotion(r,run.gait,a,approachAt);
  const sample={world,startsFromSettled:run.startsFromSettled,styleFrame:29+7.5*((step%2+2)%2),
    anticipationU:limit(approachAt/r.anticipationMs,0,1),settleU:limit((approachAt-r.anticipationMs-r.moveMs)/r.settleMs,0,1)};
  if(!run.holdOnly&&at<=r.totalMs)return {...sample,intention:'approach-leaf'};
  const t=at-(run.holdOnly?0:r.totalMs),{anchor:h,timing:q}=run;
  const channels=time=>{
    const lean=ramp(time,q.noticeEnd,h.leanMs)*(1-ramp(time,q.recoverStart,h.recoverMs));
    return {anticipate:pulse(time,0,q.noticeEnd),lean,
      sniff:pulse(time,q.leanEnd,h.sniffFirstMs)+.72*pulse(time,q.secondStart,h.sniffSecondMs),
      curiosity:pulse(time,q.secondEnd,h.curiosityMs+h.recoverMs*.4)};
  };
  const value=channels(t),delayed=channels(t-h.earOverlapMs),done=t>=q.end;
  const theta=world.heading+Math.PI/2,dx=(run.focus.x-world.root.x)/run.actorScale,dy=(run.focus.y-world.root.y)/run.actorScale;
  sample.inspection={version:PLANTER_INSPECTION_VERSION,...value,
    earFollow:done?0:delayed.lean,earSniff:done?0:delayed.sniff,
    focusSource:[Math.cos(theta)*dx+Math.sin(theta)*dy,-Math.sin(theta)*dx+Math.cos(theta)*dy,(run.focus.z-world.root.z)/run.actorScale],
    attentionSide:run.attentionVariant===0?1:-1};
  // Full-pose reserve is used for geometry checks; it does not scale the mesh.
  world.bodyPolygon=envelope(world.root,world.heading,run.bodyHalfExtentsCanonical);
  world.phase=done?'inspection-complete':t<q.noticeEnd?'notice-leaf':t<q.leanEnd?'weight-forward':t<q.secondEnd?'sniff-leaf':t<q.recoverStart?'curious-pause':'soft-recovery';
  sample.intention=world.phase;sample.focus=run.focus;
  return sample;
}
