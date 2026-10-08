/** Bounded P2 cruise-to-standing entry. Navigation owns the decelerating root;
 * the accepted cruise clock is never slowed or passed a non-cruising route.
 * Only a straight terminal continuation, settled by source time 4, is admitted.
 * This schedules contacts, not item navigation, obstacle or camera admission.
 */
import {solveMikaLocomotionPose} from './mika-locomotion.mjs';

const JOIN=4,DECEL=.9,DURATION=6,CONTINUATION_END=4.5;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth5=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const rotate=(p,yaw)=>[Math.cos(yaw)*p[0]-Math.sin(yaw)*p[1],Math.sin(yaw)*p[0]+Math.cos(yaw)*p[1],p[2]];
const vector=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const fail=()=>{throw Error('UNQUALIFIED_MIKA_ARRIVAL_CONTINUATION');};

/** sampleCruise is a prepared same-path P2 query, valid at least through 4.5.
 * The returned query accepts source times [4,6]. Inputs and returned samples
 * are not retained by reference, except the trusted immutable cruise query.
 */
export function prepareMikaArrival(calibration,sampleCruise) {
  if(typeof sampleCruise!=='function')fail();
  calibration=structuredClone(calibration);
  const initial=structuredClone(sampleCruise(JOIN)),g=calibration.gait;
  if(initial?.format!=='mika-locomotion-sample/v1'||initial.rootOwner!=='navigation'
    ||initial.time!==JOIN||initial.reachFailures?.length||!Number.isFinite(initial.phase)
    ||!vector(initial.root?.position)||Math.abs(initial.root.position[2])>1e-9
    ||!Number.isFinite(initial.root.heading)||!initial.contacts||!initial.boneMatrices)fail();
  const root0=initial.root,yaw=root0.heading;
  // Do not quietly freeze a still-turning route. The parent supplies an exact
  // admitted continuation; these probes also guard a swapped or retimed one.
  for(const t of [JOIN+.001,JOIN+.16,JOIN+.27,CONTINUATION_END]) {
    const next=sampleCruise(t),expected=add(root0.position,rotate([g.referenceSpeed*(t-JOIN),0,0],yaw));
    if(next?.format!==initial.format||next.time!==t||next.rootOwner!=='navigation'
      ||!vector(next.root?.position)||!Number.isFinite(next.root?.heading)
      ||Math.abs(next.root.heading-yaw)>1e-9||distance(next.root.position,expected)>1e-8)fail();
  }
  const finalRoot=add(root0.position,rotate([g.referenceSpeed*DECEL/2,0,0],yaw)),events={};
  for(const f of calibration.phaseOrder) {
    const foot=initial.contacts[f],family=calibration.limbs[f].family;
    if(!vector(foot?.paw)||![foot.yaw,foot.curl,foot.load,foot.swingStart,foot.swingEnd,foot.nextSwingStart].every(Number.isFinite)
      ||typeof foot.contact!=='boolean'||foot.load<0||foot.load>1||foot.swingStart>JOIN
      ||foot.swingEnd<foot.swingStart||foot.swingEnd>CONTINUATION_END
      ||foot.nextSwingStart<=JOIN||foot.nextSwingStart>JOIN+g.straightPeriod+1e-8
      ||foot.nextSwingStart<=foot.swingEnd||typeof foot.stanceId!=='string')fail();
    const landed=foot.contact?foot:sampleCruise(foot.swingEnd).contacts[f];
    if(!vector(landed?.paw)||!Number.isFinite(landed.yaw)||Math.abs(landed.paw[2])>1e-9||Math.abs(landed.curl)>1e-9)fail();
    const to=add(finalRoot,rotate(calibration.neutralPaws[f],yaw)),stepDistance=distance(landed.paw,to);
    // Preserve a sufficiently close existing support rather than adding a tiny
    // shuffle. A paw already unloading at the join must finish that release.
    const skip=stepDistance<.1&&foot.nextSwingStart-JOIN>=g.loadRampSeconds;
    events[f]={from:[landed.paw[0],landed.paw[1],0],to,yawFrom:landed.yaw,start:foot.nextSwingStart,
      end:foot.nextSwingStart+g.swingSeconds[family],skip,distance:stepDistance};
  }
  // Incoming body lead must already be zero. Check all 22 matrices at the seam
  // rather than infer continuity from the root or paw centers alone.
  const seam=solveMikaLocomotionPose(calibration,{root:root0,time:JOIN,phase:initial.phase,contacts:initial.contacts});
  if(Object.keys(initial.boneMatrices).length!==22||Object.entries(seam.boneMatrices).some(([name,rows])=>
    !Array.isArray(initial.boneMatrices[name])||rows.some((row,i)=>row.some((v,j)=>
      !Number.isFinite(initial.boneMatrices[name]?.[i]?.[j])||Math.abs(v-initial.boneMatrices[name][i][j])>1e-9))))fail();

  function sample(time) {
    if(!Number.isFinite(time)||time<JOIN||time>DURATION)throw Error('INVALID_MIKA_ARRIVAL_TIME');
    if(time===JOIN)return structuredClone(initial);
    const feet={};
    // Only the already airborne paws use the unchanged cruise clock. No new
    // cruise step may start after the join; all remaining events are below.
    let cruise;
    for(const f of calibration.phaseOrder) {
      const prior=initial.contacts[f],event=events[f],family=calibration.limbs[f].family;
      if(!prior.contact&&time<prior.swingEnd) {
        cruise??=sampleCruise(time);
        feet[f]=structuredClone(cruise.contacts[f]);
        continue;
      }
      if(event.skip||time<event.start) {
        const load=smooth5((time-prior.swingEnd)/g.loadRampSeconds)
          *(event.skip?1:1-smooth5((time-(event.start-g.loadRampSeconds))/g.loadRampSeconds));
        feet[f]={...prior,paw:[...event.from],yaw:event.yawFrom,curl:0,contact:true,load,
          stage:'support',nextSwingStart:event.skip?null:event.start};
        continue;
      }
      const inSwing=time<event.end,u=clamp((time-event.start)/(event.end-event.start)),s=smooth5(u);
      const paw=event.from.map((v,i)=>v+(event.to[i]-v)*s);
      const amplitude=Math.max(.5,Math.min(1,Math.sqrt(event.distance/.55))),peak=g.swingPeakFraction[family];
      const q=u<=peak?u/peak:(1-u)/(1-peak);
      if(inSwing)paw[2]+=g.swingHeight[family]*amplitude*Math.sin(Math.PI*.5*q)**2;
      feet[f]={paw:inSwing?paw:[...event.to],yaw:inSwing?event.yawFrom+(yaw-event.yawFrom)*s:yaw,
        curl:inSwing?g.airbornePitch[family]*amplitude*smooth5(u/.30)*(1-smooth5((u-.30)/.70)):0,
        contact:!inSwing,load:inSwing?0:smooth5((time-event.end)/g.loadRampSeconds),
        stage:inSwing?'final-swing':'settled-support',surface:'ground',terrainZ:0,
        stanceId:`${f}:arrival`,swingStart:event.start,swingEnd:event.end,nextSwingStart:null};
    }
    const u=clamp((time-JOIN)/DECEL);
    // Integral of v * (1 - smooth5(u)); C2 speed reaches exactly zero at 4.9.
    const travelled=g.referenceSpeed*DECEL*(u-(u**6-3*u**5+2.5*u**4));
    const root={position:add(root0.position,rotate([travelled,0,0],yaw)),heading:yaw};
    const pose=solveMikaLocomotionPose(calibration,{root,time,contacts:feet,
      phase:initial.phase+(time-JOIN)/g.straightPeriod,
      lower:g.lower-.022*smooth5((time-4.4)/.7),headPitch:-.04*smooth5((time-4.45)/.8)});
    return {...pose,motionPhase:time>=5.35?'standing-idle':'arrival',rootSpeed:g.referenceSpeed*(1-smooth5(u))};
  }
  return Object.freeze({durationSeconds:DURATION,sample});
}
