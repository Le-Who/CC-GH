/** Bounded stand-on-cushion / sit / curl / rest / uncurl / stand proof.
 * Original rest bones and R2 leg anatomy are immutable. FK preserves lengths;
 * grounded paws retain independent WORLD position and yaw. Numeric pass is not art QA.
 */
import { REST_CHAINS } from '../motion-r2/walk-solver.mjs';
import { buildKeyPosePack, frameFromYawPitch, solveGuidedIK, KEY_POSE_SPECS } from './rest-keyposes.mjs';
const keyPack = buildKeyPosePack();
const keys = Object.fromEntries(keyPack.poses.map(p => [p.name,p]));
const spineNames = ['pelvis','lumbar','chest'];
const ids = Object.keys(REST_CHAINS);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>mul(v,1/Math.hypot(...v));
const distance=(a,b)=>Math.hypot(...sub(a,b));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const t=clamp(x);return t*t*t*(10+t*(-15+6*t));};
const mix=(a,b,t)=>a+(b-a)*t;
const mixVec=(a,b,t)=>a.map((x,i)=>mix(x,b[i],t));
const rad=x=>x*Math.PI/180;
const rotateYaw=(v,y)=>[v[0]*Math.cos(y)-v[1]*Math.sin(y),v[0]*Math.sin(y)+v[1]*Math.cos(y),v[2]];
const worldVector=(v,f)=>add(add(mul(f.forward,v[0]),mul(f.side,v[1])),mul(f.up,v[2]));
const localVector=(v,f)=>[dot(v,f.forward),dot(v,f.side),dot(v,f.up)];
const between=(a,b)=>{const v=sub(b,a);return frameFromYawPitch(a,Math.atan2(v[1],v[0]),Math.atan2(v[2],Math.hypot(v[0],v[1])));};

// Match the armature's original-rest-vector.rotation_difference(posedVector).
// Direction-only yaw/pitch has a 180-degree roll flip at a vertical upper leg;
// a shortest-arc quaternion and its rotated full frame have no such pole.
function limbFrame(a,b,restA,restB){
  const rest=between(restA,restB),forward=unit(sub(b,a)),d=dot(rest.forward,forward);
  if(d< -1+1e-9)throw new RangeError('Limb direction reached shortest-arc antipodal singularity');
  const quaternion=unit([1+d,...cross(rest.forward,forward)]);
  const rotate=v=>{const q=quaternion.slice(1),twice=mul(cross(q,v),2);return add(add(v,mul(twice,quaternion[0])),cross(q,twice));};
  return {origin:[...a],forward,side:rotate(rest.side),up:rotate(rest.up),
    rotation:{quaternion,quaternionOrder:'wxyz',reference:'original-rest-bone',restDirectionDot:d}};
}

export const REST_TIMELINE_CONFIG = Object.freeze({
  fps:20,durationSeconds:8.4,
  phases:[
    {name:'stand',start:0,end:.2},
    {name:'sit',start:.2,end:1.2},
    {name:'curl',start:1.2,end:3.6},
    {name:'rest',start:3.6,end:4.8},
    {name:'uncurl',start:4.8,end:7.2},
    {name:'stand-up',start:7.2,end:8.2},
    {name:'stand',start:8.2,end:8.4},
  ],
  tuckOrder:['hindNear','foreNear','foreFar','hindFar'],
  bodyCurlRanges:[[0,.15],[.15,.35],[.35,.70],[.70,1]],
  swingSeconds:.6,liftHeight:.07,liftEnd:.18,landStart:.82,
  pelvisLiftArc:.01,
  breathing:{lumbarPitchDegrees:.35,chestPitchDegrees:.55,cycles:1},
  source:'Original calibrated rest-r1 keys, flat rest coordinates, R2 limb lengths',
});

function jointSpec(name){const k=keys[name];return {
  pelvis:[...k.spineEndpoints[0]],
  yawPitch:spineNames.map(n=>[k.spine[n].frame.rotation.yaw,k.spine[n].frame.rotation.pitch]),
  neckYawPitch:[k.spine.neck.frame.rotation.yaw,k.spine.neck.frame.rotation.pitch],
  headYaw:k.head.rotation.yaw,headPitch:k.head.rotation.pitch,eyeClose:k.eyeClose,
};}
const specs={stand:jointSpec('stand'),sit:jointSpec('sit'),curl:jointSpec('curl')};
function blendSpec(a,b,t){return {pelvis:mixVec(a.pelvis,b.pelvis,t),yawPitch:a.yawPitch.map((v,i)=>mixVec(v,b.yawPitch[i],t)),
 neckYawPitch:mixVec(a.neckYawPitch,b.neckYawPitch,t),headYaw:mix(a.headYaw,b.headYaw,t),headPitch:mix(a.headPitch,b.headPitch,t),eyeClose:mix(a.eyeClose,b.eyeClose,t)};}
function anchored(name){return Object.fromEntries(ids.map(id=>[id,{paw:[...keys[name].limbs[id].paw],pawYaw:keys[name].limbs[id].rotations.paw.yaw,
 contact:true,supportId:`cushion:${name==='curl'?'curled':'initial'}:${id}`,swingPhase:'contact',swingProgress:null}]));}

/** At v=0/1 all paws are in their exact authored support poses. At most one
 * pawn is airborne; all other paw centers AND paw facings stay exactly fixed. */
function curlState(v){
  const c=REST_TIMELINE_CONFIG, normalized=clamp(v);
  const raw=normalized*4,scaled=Math.abs(raw-Math.round(raw))<1e-12?Math.round(raw):raw;
  const stage=Math.min(3,Math.floor(scaled));
  let u=scaled-stage;
  for(const boundary of [c.liftEnd,c.landStart])if(Math.abs(u-boundary)<1e-12)u=boundary;
  const range=c.bodyCurlRanges[stage], amount=mix(range[0],range[1],smooth(u));
  const spec=blendSpec(specs.sit,specs.curl,amount);
  spec.pelvis[2]+=c.pelvisLiftArc*Math.sin(Math.PI*amount)**2;
  const paws=anchored('sit');
  for(let i=0;i<4;i++){
    const id=c.tuckOrder[i];
    if(i<stage || (i===stage && u>=1)){paws[id]=anchored('curl')[id];continue;}
    if(i!==stage||u<=0)continue;
    const from=keys.sit.limbs[id],to=keys.curl.limbs[id];
    const travel=smooth((u-c.liftEnd)/(c.landStart-c.liftEnd));
    const lift=u<c.liftEnd?smooth(u/c.liftEnd):u>c.landStart?smooth((1-u)/(1-c.landStart)):1;
    const paw=mixVec(from.paw,to.paw,travel);paw[2]+=c.liftHeight*lift;
    paws[id]={paw,pawYaw:mix(from.rotations.paw.yaw,to.rotations.paw.yaw,travel),contact:false,supportId:null,
      swingPhase:u<c.liftEnd?'lift':u>c.landStart?'land':'air',swingProgress:u};
  }
  return {spec,paws,curlAmount:amount,tuckStage:stage,tuckProgress:u,activePaw:u>0&&u<1?c.tuckOrder[stage]:null};
}

/** Reusable FK+IK assembly. No endpoint interpolation, target clipping, body scale,
 * or paw contact relocation is used. Unreachable solves are reported honestly. */
export function solveRestPose(spec,pawStates){
  const points=[[...spec.pelvis]],spine={},frames=[];
  for(let i=0;i<3;i++){
    const frame=frameFromYawPitch(points[i],...spec.yawPitch[i]);
    const length=keyPack.restSpine[spineNames[i]].length,tail=add(points[i],mul(frame.forward,length));
    spine[spineNames[i]]={head:points[i],tail,up:frame.up,forward:frame.forward,length,frame,
      parentLocalAxes:i===0?null:{forward:localVector(frame.forward,frames[i-1]),side:localVector(frame.side,frames[i-1]),up:localVector(frame.up,frames[i-1])}};
    frames.push(frame);points.push(tail);
  }
  const neckFrame=frameFromYawPitch(points[3],...spec.neckYawPitch),neckLength=keyPack.restSpine.neck.length;
  const headCenter=add(points[3],mul(neckFrame.forward,neckLength));
  spine.neck={head:points[3],tail:headCenter,up:neckFrame.up,forward:neckFrame.forward,length:neckLength,frame:neckFrame};
  const headFrame=frameFromYawPitch(headCenter,spec.headYaw,spec.headPitch),limbs={};
  for(const [id,rest] of Object.entries(REST_CHAINS)){
    const binding=keyPack.hipBindings[id],frame=frames[rest.family==='fore'?2:0],p=pawStates[id];
    const hip=add(points[binding.endpointIndex],worldVector(binding.localOffset,frame));
    const requestedPaw=[...p.paw],ankleOffset=rotateYaw(rest.ankleOffset,p.pawYaw),requestedAnkle=add(requestedPaw,ankleOffset);
    const kneeGuide=rotateYaw([rest.bend,0,0],frame.rotation.yaw);
    const ik=solveGuidedIK(hip,requestedAnkle,rest.upperLength,rest.lowerLength,kneeGuide);
    const ankle=ik.ankle,paw=ik.reachable?requestedPaw:sub(ankle,ankleOffset);
    const upper=limbFrame(hip,ik.knee,rest.hip,rest.knee),lower=limbFrame(ik.knee,ankle,rest.knee,rest.ankle),pawFrame=frameFromYawPitch(paw,p.pawYaw,0);
    pawFrame.rotation.quaternion=[Math.cos(p.pawYaw/2),0,0,Math.sin(p.pawYaw/2)];
    pawFrame.rotation.quaternionOrder='wxyz';pawFrame.rotation.reference='world';
    limbs[id]={hip,knee:ik.knee,ankle,paw,worldHip:[...hip],worldKnee:[...ik.knee],worldAnkle:[...ankle],worldPaw:[...paw],
      pawForward:pawFrame.forward,pawUp:pawFrame.up,ankleOffset,requestedPaw,requestedAnkle,kneeGuide,hipBinding:binding,anchorFrame:frame,
      rotations:{upper:upper.rotation,lower:lower.rotation,paw:pawFrame.rotation},frames:{upper,lower,paw:pawFrame},
      contact:p.contact&&ik.reachable,supportId:p.supportId,swingPhase:p.swingPhase,swingProgress:p.swingProgress,
      upperLength:rest.upperLength,lowerLength:rest.lowerLength,reachable:ik.reachable,reachError:ik.reachError,
      requestedDistance:ik.requestedDistance,minimumReach:ik.minimumReach,maximumReach:ik.maximumReach,
      innerReachMargin:ik.innerReachMargin,outerReachMargin:ik.outerReachMargin,guideDegenerate:ik.guideDegenerate};
  }
  return {root:[0,0,0],spine,spineEndpoints:points,head:{center:headCenter,worldCenter:[...headCenter],forward:headFrame.forward,up:headFrame.up,frame:headFrame,rotation:headFrame.rotation},
    limbs,eyeClose:spec.eyeClose,reachable:Object.values(limbs).every(l=>l.reachable),globalScale:1,skinContactValidated:false,visualStyleStatus:'REJECTED'};
}

export function sampleRestTimeline(timeSeconds){
  if(!Number.isFinite(timeSeconds))throw new TypeError('Finite timeline time required');
  const t=clamp(timeSeconds,0,REST_TIMELINE_CONFIG.durationSeconds);
  const phase=REST_TIMELINE_CONFIG.phases.find(p=>t>=p.start&&t<p.end)||REST_TIMELINE_CONFIG.phases.at(-1);
  const u=clamp((t-phase.start)/(phase.end-phase.start));let state;
  if(phase.name==='stand')state={spec:blendSpec(specs.stand,specs.stand,0),paws:anchored('stand'),curlAmount:0};
  if(phase.name==='sit'||phase.name==='stand-up'){
    const v=phase.name==='sit'?smooth(u):smooth(1-u);
    state={spec:blendSpec(specs.stand,specs.sit,v),paws:anchored('sit'),curlAmount:0};
  }
  if(phase.name==='curl'||phase.name==='uncurl'){
    state=curlState(phase.name==='curl'?u:1-u);
    if(phase.name==='uncurl')for(const p of Object.values(state.paws)){
      if(p.swingPhase==='lift')p.swingPhase='land';else if(p.swingPhase==='land')p.swingPhase='lift';
      if(p.swingProgress!==null)p.swingProgress=1-p.swingProgress;
    }
  }
  if(phase.name==='rest'){
    const spec=blendSpec(specs.curl,specs.curl,0),breath=Math.sin(Math.PI*REST_TIMELINE_CONFIG.breathing.cycles*u)**2;
    spec.yawPitch[1][1]+=rad(REST_TIMELINE_CONFIG.breathing.lumbarPitchDegrees)*breath;
    spec.yawPitch[2][1]+=rad(REST_TIMELINE_CONFIG.breathing.chestPitchDegrees)*breath;
    state={spec,paws:anchored('curl'),curlAmount:1,breathAmount:breath};
  }
  return {frame:Math.round(t*REST_TIMELINE_CONFIG.fps),timeSeconds:t,phaseName:phase.name,phaseProgress:u,
    ...solveRestPose(state.spec,state.paws),curlAmount:state.curlAmount,activePaw:state.activePaw??null,
    tuckStage:state.tuckStage??null,tuckProgress:state.tuckProgress??null,breathAmount:state.breathAmount??0};
}

export function buildRestTimelinePack(){
  const count=Math.round(REST_TIMELINE_CONFIG.durationSeconds*REST_TIMELINE_CONFIG.fps)+1;
  const frames=Array.from({length:count},(_,i)=>sampleRestTimeline(i/REST_TIMELINE_CONFIG.fps));
  const events=[];
  for(let i=0;i<4;i++){
    const id=REST_TIMELINE_CONFIG.tuckOrder[i],start=1.2+.6*i,end=start+.6;
    events.push({type:'paw-liftoff',timeSeconds:start,phaseName:'curl',limb:id,fromSupport:`cushion:initial:${id}`},
      {type:'paw-land',timeSeconds:end,phaseName:'curl',limb:id,toSupport:`cushion:curled:${id}`},
      {type:'paw-liftoff',timeSeconds:8.4-end,phaseName:'uncurl',limb:id,fromSupport:`cushion:curled:${id}`},
      {type:'paw-land',timeSeconds:8.4-start,phaseName:'uncurl',limb:id,toSupport:`cushion:initial:${id}`});
  }
  return {version:1,motionRevision:'rest-r1-continuous-timeline-candidate-1',sourceLegAnatomy:'R2',visualStyleStatus:'REJECTED',
    scope:'Bounded articulated rest transition proof only; no walking, no production acceptance, no skin pass.',
    coordinateSystem:keyPack.coordinateSystem,angleUnits:keyPack.angleUnits,frameAxes:keyPack.frameAxes,
    limbRotationConvention:'Upper/lower quaternion [w,x,y,z] is the shortest-arc delta from the ORIGINAL rest bone, matching Blender rotation_difference. Full limb frames are continuously rotated rest axes. Paw yaw and quaternion are WORLD facing. No Euler upper/lower fields: yaw/pitch has a pole flip during sit.',
    fps:REST_TIMELINE_CONFIG.fps,durationSeconds:REST_TIMELINE_CONFIG.durationSeconds,frameCount:frames.length,
    cushion:keyPack.cushion,restSpine:keyPack.restSpine,restHead:keyPack.restHead,restLimbs:keyPack.restLimbs,hipBindings:keyPack.hipBindings,
    authoredSpecs:KEY_POSE_SPECS,config:REST_TIMELINE_CONFIG,
    authoredChanges:[{path:'curl.pelvis.z',change:'Add +0.01 sin²(pi * bodyCurlAmount) arc, zero at authored sit/curl keys',reason:'Tiny interim body clearance lift; mesh QA remains required'}],
    warnings:['No walk or cushion alignment included; caller must append actual locomotion.',
      'Numerical reach/contact validation does not establish real skin clearance, paw self-intersection or visual quality.',
      'Art remains REJECTED; standing/sit/curl keys are inherited unchanged.'],
    events:events.sort((a,b)=>a.timeSeconds-b.timeSeconds),frames};
}
