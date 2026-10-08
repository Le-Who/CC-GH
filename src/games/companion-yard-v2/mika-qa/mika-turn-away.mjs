/** Bounded contact-stepped P2 quarter turn from a validated stopped pose.
 * The navigation root stays at its exact world position. Heading changes only
 * while independently scheduled paws step onto new fixed support anchors.
 * This does not admit a route, clear an obstacle or authorize an interaction.
 */
import {solveMikaLocomotionPose} from './mika-locomotion.mjs';

const TURN_START=.4,TURN_SECONDS=4,TURN_END=4.4,DURATION=5.35;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth5=x=>{x=clamp(x);return clamp(x*x*x*(x*(x*6-15)+10));};
const rotate=(p,y)=>[Math.cos(y)*p[0]-Math.sin(y)*p[1],Math.sin(y)*p[0]+Math.cos(y)*p[1],p[2]];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const vector=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const fail=()=>{throw Error('UNQUALIFIED_MIKA_TURN_AWAY');};

/** Exactly +pi/2 or -pi/2 is qualified here. Returned sample times are [0,5.35].
 * The terminal standing sample can feed prepareMikaDeparture without resetting
 * its root, heading, actual supports or any of the 22 bone transforms.
 */
export function prepareMikaTurnAway(calibration,stoppedSample,turnRadians) {
  if(turnRadians!==Math.PI/2&&turnRadians!==-Math.PI/2)fail();
  calibration=structuredClone(calibration);
  const initial=structuredClone(stoppedSample),g=calibration?.gait;
  if(initial?.format!=='mika-locomotion-sample/v1'||initial.rootOwner!=='navigation'
    ||initial.motionPhase!=='standing-idle'||initial.rootSpeed!==0||initial.reachFailures?.length
    ||!Number.isFinite(initial.time)||initial.time<5.35||initial.time>6||!Number.isFinite(initial.phase)||!g
    ||!vector(initial.root?.position)||Math.abs(initial.root.position[2])>1e-9
    ||!Number.isFinite(initial.root.heading)||!initial.contacts)fail();
  const root0=initial.root,finalYaw=root0.heading+turnRadians;
  const heading=t=>root0.heading+turnRadians*smooth5((t-TURN_START)/TURN_SECONDS);
  const target=(f,t)=>add(root0.position,rotate(calibration.neutralPaws[f],heading(t)));
  const swapped={foreNear:'foreFar',foreFar:'foreNear',hindNear:'hindFar',hindFar:'hindNear'},events={};
  for(const f of calibration.phaseOrder) {
    const foot=initial.contacts[f];
    if(!vector(foot?.paw)||Math.abs(foot.paw[2])>1e-9||foot.contact!==true||foot.load!==1||foot.curl!==0
      ||!Number.isFinite(foot.yaw)||Math.abs(foot.yaw-root0.heading)>1e-9||foot.nextSwingStart!==null
      ||foot.surface!=='ground'||foot.terrainZ!==0||typeof foot.stanceId!=='string'||distance(foot.paw,target(f,0))>.1+1e-8)fail();
    const family=calibration.limbs[f].family,index=calibration.phaseOrder.indexOf(turnRadians>0?swapped[f]:f),rows=[];
    let from=[...foot.paw],yawFrom=foot.yaw;
    for(let k=0;k<8;k++) {
      const start=.2+index*g.straightPeriod/4+k*g.straightPeriod,end=start+g.swingSeconds[family];
      const mid=(end+start+g.straightPeriod)/2,to=target(f,mid),yawTo=heading(mid);
      rows.push({start,end,from,to,yawFrom,yawTo,stanceId:`${f}:turn-away:${k}`,distance:distance(from,to)});
      from=to;yawFrom=yawTo;
      if(mid>=TURN_END)break;
    }
    if(rows.at(-1).yawTo!==finalYaw||rows.at(-1).end+g.loadRampSeconds>5.2)fail();
    events[f]=rows;
  }
  const stopped=solveMikaLocomotionPose(calibration,{root:root0,time:initial.time,phase:initial.phase,
    contacts:initial.contacts,lower:g.lower-.022,headPitch:-.04});
  if(!initial.boneMatrices||Object.keys(initial.boneMatrices).length!==22||Object.entries(stopped.boneMatrices).some(([name,rows])=>
    !Array.isArray(initial.boneMatrices[name])||initial.boneMatrices[name].length!==4||rows.some((row,i)=>
      !Array.isArray(initial.boneMatrices[name][i])||initial.boneMatrices[name][i].length!==4||row.some((v,j)=>
        !Number.isFinite(initial.boneMatrices[name][i][j])||Math.abs(v-initial.boneMatrices[name][i][j])>1e-9))))fail();
  if(Math.abs(turnRadians)*1.875/TURN_SECONDS>g.referencePeakYawRate)fail();

  function sample(time) {
    if(!Number.isFinite(time)||time<0||time>DURATION)throw Error('INVALID_MIKA_TURN_AWAY_TIME');
    if(time===0)return structuredClone(initial);
    const feet={};
    for(const f of calibration.phaseOrder) {
      const family=calibration.limbs[f].family,rows=events[f],current=rows.findIndex(e=>time<e.end);
      const previous=current===-1?rows.at(-1):current?rows[current-1]:null;
      const event=current===-1?null:rows[current];
      if(!event||time<event.start) {
        const prior=previous?{paw:previous.to,yaw:previous.yawTo,stanceId:previous.stanceId,
          swingStart:previous.start,swingEnd:previous.end}:initial.contacts[f];
        const load=(previous?smooth5((time-previous.end)/g.loadRampSeconds):1)
          *(event?1-smooth5((time-event.start+g.loadRampSeconds)/g.loadRampSeconds):1);
        feet[f]={...prior,paw:[...prior.paw],curl:0,contact:true,load:clamp(load),stage:event?'turn-support':'settled-support',
          surface:'ground',terrainZ:0,nextSwingStart:event?.start??null};
      }else {
        const u=(time-event.start)/(event.end-event.start),s=smooth5(u),peak=g.swingPeakFraction[family];
        const amplitude=Math.max(.5,Math.min(1,Math.sqrt(event.distance/.55))),q=u<=peak?u/peak:(1-u)/(1-peak);
        const paw=event.from.map((v,i)=>v+(event.to[i]-v)*s);
        paw[2]+=g.swingHeight[family]*amplitude*Math.sin(Math.PI*.5*q)**2;
        feet[f]={paw,yaw:event.yawFrom+(event.yawTo-event.yawFrom)*s,
          curl:g.airbornePitch[family]*amplitude*smooth5(u/.30)*(1-smooth5((u-.30)/.70)),contact:false,load:0,
          stage:'turn-swing',surface:'ground',terrainZ:0,stanceId:event.stanceId,swingStart:event.start,swingEnd:event.end,
          nextSwingStart:rows[current+1]?.start??null};
      }
    }
    const yaw=heading(time),lead=heading(time+g.leadAheadSeconds)-heading(time-g.leadBehindSeconds);
    const lowered=smooth5(time/.7)*(1-smooth5((time-4.5)/.7));
    const root={position:[...root0.position],heading:yaw};
    const pose=solveMikaLocomotionPose(calibration,{root,time,contacts:feet,phase:initial.phase+time/g.straightPeriod,
      lead,lower:g.lower-.022+.022*lowered,headPitch:-.04});
    const u=clamp((time-TURN_START)/TURN_SECONDS);
    return {...pose,motionPhase:time===DURATION?'standing-idle':'turning-away',rootSpeed:0,
      rootYawRate:u>0&&u<1?turnRadians/TURN_SECONDS*30*u*u*(1-u)*(1-u):0};
  }
  return Object.freeze({durationSeconds:DURATION,sample});
}
