/** Bounded P2 standing-to-cruise handoff in absolute source coordinates.
 * Navigation owns the single root. Actual stopped supports are retained until
 * their first complete outgoing swing, never replaced by neutral-paw guesses.
 * Route, item, obstacle and camera admission remain the integration owner's.
 */
import {solveMikaLocomotionPose} from './mika-locomotion.mjs';

const DURATION=2,ACCEL=.9;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth5=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const rotate=(p,yaw)=>[Math.cos(yaw)*p[0]-Math.sin(yaw)*p[1],Math.sin(yaw)*p[0]+Math.cos(yaw)*p[1],p[2]];
const vector=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const fail=()=>{throw Error('UNQUALIFIED_MIKA_DEPARTURE');};
function sameBones(a,b) {
  return a&&Object.keys(a).length===22&&Object.entries(b).every(([name,rows])=>
    Array.isArray(a[name])&&a[name].length===4&&rows.every((row,i)=>
      Array.isArray(a[name][i])&&a[name][i].length===4&&row.every((v,j)=>Number.isFinite(a[name][i][j])&&Math.abs(v-a[name][i][j])<=1e-9)));
}

/** sampleCruise is a trusted prepared constant-speed, same-heading query for
 * local cruise times [-2,0]. Its history must extend earlier than -2 for the
 * unchanged gait scheduler. Cruise time 0 is departure time 2, after 1.147
 * source units at the P2 speed. Neither input samples nor calibration mutate.
 */
export function prepareMikaDeparture(calibration,stoppedSample,sampleCruise) {
  const work=prepareMikaDepartureSteps(calibration,stoppedSample,sampleCruise);let step;
  do{step=work.next();}while(!step.done);return step.value;
}
/** Preparation-only slices; the pose query and all contact math are identical. */
export function* prepareMikaDepartureSteps(calibration,stoppedSample,sampleCruise) {
  if(typeof sampleCruise!=='function')fail();
  calibration=structuredClone(calibration);
  const initial=structuredClone(stoppedSample),g=calibration?.gait;
  if(initial?.format!=='mika-locomotion-sample/v1'||initial.rootOwner!=='navigation'
    ||initial.motionPhase!=='standing-idle'||initial.rootSpeed!==0||initial.reachFailures?.length
    ||!Number.isFinite(initial.time)||initial.time<5.35||initial.time>6||!Number.isFinite(initial.phase)||!g
    ||!vector(initial.root?.position)||Math.abs(initial.root.position[2])>1e-9
    ||!Number.isFinite(initial.root.heading)||!initial.contacts)fail();
  const root0=initial.root,yaw=root0.heading,events={};
  for(const f of calibration.phaseOrder) {
    const foot=initial.contacts[f],neutral=add(root0.position,rotate(calibration.neutralPaws[f],yaw));
    if(!vector(foot?.paw)||Math.abs(foot.paw[2])>1e-9||foot.contact!==true||foot.load!==1
      ||foot.curl!==0||!Number.isFinite(foot.yaw)||Math.abs(foot.yaw-yaw)>1e-9
      ||foot.nextSwingStart!==null||foot.surface!=='ground'||foot.terrainZ!==0
      ||typeof foot.stanceId!=='string'||distance(foot.paw,neutral)>.1+1e-8)fail();
  }
  const stopped=solveMikaLocomotionPose(calibration,{root:root0,time:initial.time,phase:initial.phase,
    contacts:initial.contacts,lower:g.lower-.022,headPitch:-.04});
  if(!sameBones(initial.boneMatrices,stopped.boneMatrices))fail();
  // This is not a general acceleration solver. Reject a different root,
  // heading, body lead or timing instead of repairing the cruise definition.
  for(const t of [-2,-1.9,-1.5,-1,-.5,0]) {
    const s=sampleCruise(t),expected=add(root0.position,rotate([g.referenceSpeed*(t+DURATION-ACCEL/2),0,0],yaw));
    if(s?.format!==initial.format||s.rootOwner!=='navigation'||s.time!==t||s.reachFailures?.length
      ||!vector(s.root?.position)||!Number.isFinite(s.root.heading)||Math.abs(s.root.heading-yaw)>1e-9
      ||distance(s.root.position,expected)>1e-8)fail();
    const pose=solveMikaLocomotionPose(calibration,{root:s.root,time:s.time,phase:s.phase,contacts:s.contacts});
    if(!sameBones(s.boneMatrices,pose.boneMatrices))fail();
    yield {stage:'departure-continuation-check'};
  }
  const first=sampleCruise(-DURATION);
  for(const f of calibration.phaseOrder) {
    const foot=first.contacts[f],family=calibration.limbs[f].family,start=foot?.nextSwingStart+DURATION,end=start+g.swingSeconds[family];
    // Allow a full, zero-derivative unload ramp from the exact all-loaded pose.
    if(!Number.isFinite(start)||start<g.loadRampSeconds||start>g.straightPeriod+1e-8||end>=DURATION)fail();
    const landing=sampleCruise(end-DURATION+1e-7).contacts[f],swing=sampleCruise(start-DURATION+g.swingSeconds[family]/2).contacts[f];
    if(!vector(landing?.paw)||landing.contact!==true||Math.abs(landing.paw[2])>1e-9||Math.abs(landing.yaw-yaw)>1e-9
      ||landing.curl!==0||landing.stanceId!==swing.stanceId
      ||swing.contact!==false||Math.abs(swing.swingStart+DURATION-start)>1e-8)fail();
    events[f]={start,end,to:[landing.paw[0],landing.paw[1],0],stanceId:swing.stanceId,
      distance:distance(initial.contacts[f].paw,landing.paw)};
    yield {stage:'departure-contact-schedule'};
  }
  const canonicalFrom=Math.max(ACCEL,...Object.values(events).map(e=>e.end));

  function sample(time) {
    if(!Number.isFinite(time)||time<0||time>DURATION)throw Error('INVALID_MIKA_DEPARTURE_TIME');
    if(time===0)return structuredClone(initial);
    const cruise=sampleCruise(time-DURATION);
    if(time===DURATION)return structuredClone(cruise);
    if(time>=canonicalFrom)return {...structuredClone(cruise),time,motionPhase:'departing',rootSpeed:g.referenceSpeed};
    const feet={};
    for(const f of calibration.phaseOrder) {
      const prior=initial.contacts[f],event=events[f],family=calibration.limbs[f].family;
      if(time<event.start) {
        feet[f]={...prior,paw:[...prior.paw],load:clamp(1-smooth5((time-event.start+g.loadRampSeconds)/g.loadRampSeconds)),
          nextSwingStart:event.start,stage:'departure-support'};
      }else if(time<event.end) {
        const u=(time-event.start)/(event.end-event.start),s=smooth5(u),peak=g.swingPeakFraction[family];
        const amplitude=Math.max(.5,Math.min(1,Math.sqrt(event.distance/.55))),q=u<=peak?u/peak:(1-u)/(1-peak);
        const paw=prior.paw.map((v,i)=>v+(event.to[i]-v)*s);
        paw[2]+=g.swingHeight[family]*amplitude*Math.sin(Math.PI*.5*q)**2;
        feet[f]={...cruise.contacts[f],paw,yaw,curl:g.airbornePitch[family]*amplitude*smooth5(u/.30)*(1-smooth5((u-.30)/.70)),
          contact:false,load:0,stage:'departure-swing',stanceId:event.stanceId};
      }else feet[f]=structuredClone(cruise.contacts[f]);
    }
    const u=clamp(time/ACCEL),travelled=g.referenceSpeed*ACCEL*(u**6-3*u**5+2.5*u**4);
    const root=time>=ACCEL?cruise.root:{position:add(root0.position,rotate([travelled,0,0],yaw)),heading:yaw};
    const blend=smooth5(time/ACCEL);
    const pose=solveMikaLocomotionPose(calibration,{root,time,contacts:feet,phase:cruise.phase,
      lower:g.lower-.022*(1-blend),headPitch:-.04*(1-blend)});
    return {...pose,motionPhase:'departing',rootSpeed:g.referenceSpeed*smooth5(u)};
  }
  return Object.freeze({durationSeconds:DURATION,sample});
}
