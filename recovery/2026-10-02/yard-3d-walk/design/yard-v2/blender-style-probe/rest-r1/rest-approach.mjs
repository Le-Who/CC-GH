/** Separate bounded terrain approach and paw-alignment proof. The frozen rest
 * timeline is composed only after an exact no-snap stand bridge. No art pass. */
import {readFileSync} from 'node:fs';
import {REST_CHAINS,WALK_CONFIG} from '../motion-r2/walk-solver.mjs';
import {buildKeyPosePack} from './rest-keyposes.mjs';
import {solveRestPose,buildRestTimelinePack} from './rest-timeline.mjs';
const keyPack=buildKeyPosePack(),stand=keyPack.poses[0],ids=Object.keys(REST_CHAINS);
export const SURFACE_PROXIES=JSON.parse(readFileSync(new URL('./contact-surface-proxies.json',import.meta.url),'utf8'));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const t=clamp(x);return t*t*t*(10+t*(-15+6*t));};
const mix=(a,b,t)=>a+(b-a)*t, mixVec=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const fract=x=>x-Math.floor(x);
const rotateYaw=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a),p[2]];
const C=exportConfig();
function exportConfig(){return Object.freeze({fps:20,startRootX:-2.6,walkDistance:2.6,walkSeconds:3.45,rampSeconds:.5,
  stride:.64,stanceRatio:.68,phaseOffsets:WALK_CONFIG.phaseOffsets,
  swingLiftFraction:.16,swingLandFraction:.84,flatLiftHeight:.09,terrainClearance:.035,
  allowedSolePenetration:.0012,nonflatSupportClearance:.004,finalStepSettleSeconds:.45,alignmentStepSeconds:.5,
  alignmentOrder:['hindFar','foreFar','foreNear','hindNear'],bodyBob:.02,terrainSweepSamples:129,bodySupportSmoothing:.01});}
export const REST_APPROACH_CONFIG=C;
export const APPROACH_SECONDS=C.walkSeconds+C.finalStepSettleSeconds+4*C.alignmentStepSeconds;
const triangles=SURFACE_PROXIES.cushion.triangles.map(indices=>{
  const [a,b,c]=indices.map(i=>SURFACE_PROXIES.cushion.vertices[i]);
  const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  return {a,b,c,det,minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),minY:Math.min(a[1],b[1],c[1]),maxY:Math.max(a[1],b[1],c[1])};
}).filter(t=>Math.abs(t.det)>1e-12);

/** Exact upper piecewise-planar cushion heightfield. Outside is the actual floor. */
export function surfaceHeight(x,y){let z=SURFACE_PROXIES.cushion.floorZ;
  for(const t of triangles){if(x<t.minX-1e-10||x>t.maxX+1e-10||y<t.minY-1e-10||y>t.maxY+1e-10)continue;
    const u=((t.b[1]-t.c[1])*(x-t.c[0])+(t.c[0]-t.b[0])*(y-t.c[1]))/t.det;
    const v=((t.c[1]-t.a[1])*(x-t.c[0])+(t.a[0]-t.c[0])*(y-t.c[1]))/t.det,w=1-u-v;
    if(u>=-1e-9&&v>=-1e-9&&w>=-1e-9)z=Math.max(z,u*t.a[2]+v*t.b[2]+w*t.c[2]);
  }return z;
}
const fittedCache=new Map();
/** Actual rigid lower-paw cloud translated/rotated to a candidate support. */
export function fitPawSupport(id,x,y,yaw=0){const key=[id,x,y,yaw].join(':');if(fittedCache.has(key))return fittedCache.get(key);
  let z=surfaceHeight(x,y);for(const p of SURFACE_PROXIES.paws[id].lowerSurfacePoints){const r=rotateYaw(p,yaw);z=Math.max(z,surfaceHeight(x+r[0],y+r[1])-r[2]-C.allowedSolePenetration);}
  // Preserve original exact 0/.18 authored planes within the measured mesh tolerance.
  if(Math.abs(z-.18)<1e-5)z=.18;if(Math.abs(z)<1e-5)z=0;
  // The first actual evaluated-skin gate found up to .003770 penetration near
  // the rim: subdivided/deformed solids extend below the downsampled proxy.
  // Correct only edge/rim supports, preserving exact original flat anchors.
  const nonflat=Math.abs(z)>.00001&&Math.abs(z-.18)>.00001;
  if(nonflat)z+=C.nonflatSupportClearance;
  const out={paw:[x,y,z],pawYaw:yaw,contact:true,supportId:null,swingPhase:'contact',swingProgress:null,loadHeight:z};
  fittedCache.set(key,out);return out;
}
export function minimumPawTerrainGap(id,worldPaw,yaw=0){let min=Infinity;
  for(const p of SURFACE_PROXIES.paws[id].lowerSurfacePoints){const r=rotateYaw(p,yaw);min=Math.min(min,worldPaw[2]+r[2]-surfaceHeight(worldPaw[0]+r[0],worldPaw[1]+r[1]));}return min;
}
const swingCache=new Map();
function swingPlan(id,from,to,tag){const key=[id,...from.paw,...to.paw,tag].join(':');if(swingCache.has(key))return swingCache.get(key);
  let maxFitZ=Math.max(from.paw[2],to.paw[2]),arcLift=C.flatLiftHeight;
  for(let i=0;i<C.terrainSweepSamples;i++){
    const q=i/(C.terrainSweepSamples-1),p=mixVec(from.paw,to.paw,smooth(q)),fit=fitPawSupport(id,p[0],p[1],0).paw[2];
    maxFitZ=Math.max(maxFitZ,fit);
    if(i>0&&i<C.terrainSweepSamples-1){const arc=16*q*q*(1-q)*(1-q);arcLift=Math.max(arcLift,(fit-p[2])/arc+C.terrainClearance);}
  }
  const apexZ=Math.max(maxFitZ+C.terrainClearance,from.paw[2]+C.flatLiftHeight,to.paw[2]+C.flatLiftHeight);
  const plan={id,from,to,tag,apexZ,maxFitZ,arcLift,mode:tag.startsWith('align:')?'vertical-lift-travel-land':'smooth-terrain-arc'};swingCache.set(key,plan);return plan;
}
function sampleSwing(plan,q){q=clamp(q);if(q<=1e-12)return {...plan.from};if(q>=1-1e-12)return {...plan.to};
  const a=C.swingLiftFraction,b=C.swingLandFraction,travel=smooth((q-a)/(b-a));
  const paw=mixVec(plan.from.paw,plan.to.paw,plan.mode==='smooth-terrain-arc'?smooth(q):travel);
  if(plan.mode==='smooth-terrain-arc')paw[2]+=plan.arcLift*16*q*q*(1-q)*(1-q);
  else paw[2]=q<a?mix(plan.from.paw[2],plan.apexZ,smooth(q/a)):q>b?mix(plan.apexZ,plan.to.paw[2],smooth((q-b)/(1-b))):plan.apexZ;
  return {paw,pawYaw:0,contact:false,supportId:null,swingPhase:q<a?'lift':q>b?'land':'air',swingProgress:q,
    loadHeight:mix(plan.from.loadHeight,plan.to.loadHeight,smooth(q)),stepId:plan.tag};
}
function gaitSupport(id,cycle){const r=REST_CHAINS[id],touchdown=(cycle+C.phaseOffsets[id])*C.stride;
  const x=C.startRootX+touchdown+r.nominalPawX+C.stride*C.stanceRatio/2;
  return {...fitPawSupport(id,x,r.paw[1]),supportId:`approach:${id}:${cycle}`};
}
function sampleGait(distance){const paws={},active=[];for(const id of ids){
  const raw=distance/C.stride-C.phaseOffsets[id];let cycle=Math.floor(raw),p=raw-cycle;
  if(1-p<1e-12){cycle++;p=0;}
  if(p<=C.stanceRatio+1e-12){paws[id]=gaitSupport(id,cycle);continue;}
  const q=(p-C.stanceRatio)/(1-C.stanceRatio),plan=swingPlan(id,gaitSupport(id,cycle),gaitSupport(id,cycle+1),`${id}:${cycle}->${cycle+1}`);
  paws[id]=sampleSwing(plan,q);active.push({id,q,plan});
}return {paws,active};}

/** Cubic velocity ramp, integrated exactly; accumulated DISTANCE drives gait. */
export function rootDistance(timeSeconds){const t=clamp(timeSeconds,0,C.walkSeconds),r=C.rampSeconds,v=C.walkDistance/(C.walkSeconds-r);
  const ramp=u=>u*u*u-.5*u*u*u*u;
  if(t<r)return v*r*ramp(t/r);
  if(t>C.walkSeconds-r)return C.walkDistance-v*r*ramp((C.walkSeconds-t)/r);
  return v*(t-r/2);
}
export function timeAtRootDistance(distance){let low=0,high=C.walkSeconds;
  for(let i=0;i<60;i++){const mid=(low+high)/2;if(rootDistance(mid)<distance)low=mid;else high=mid;}return(low+high)/2;
}
function bodySpec(paws,distance,bobAmount=1){
  const low=(a,b)=>{const k=C.bodySupportSmoothing;return(a+b-Math.sqrt((a-b)**2+k*k)+k)/2;};
  const rear=low(paws.hindNear.loadHeight,paws.hindFar.loadHeight),front=low(paws.foreNear.loadHeight,paws.foreFar.loadHeight);
  const slope=Math.atan2(front-rear,1.10),phase=fract(distance/C.stride*2),bob=-C.bodyBob*16*phase**2*(1-phase)**2*bobAmount;
  const yawPitch=['pelvis','lumbar','chest'].map(n=>[0,stand.spine[n].frame.rotation.pitch+slope]);
  return {pelvis:[-.78,0,.68+rear+bob],yawPitch,
    neckYawPitch:[stand.spine.neck.frame.rotation.yaw,stand.spine.neck.frame.rotation.pitch+slope],
    headYaw:stand.head.rotation.yaw,headPitch:slope,eyeClose:0,
    terrainBody:{rearLoadHeight:rear,frontLoadHeight:front,pitchRadians:slope,bob}};
}
const stoppedGait=sampleGait(C.walkDistance);
const landedPaws=Object.fromEntries(ids.map(id=>[id,stoppedGait.active.find(a=>a.id===id)?.plan.to??stoppedGait.paws[id]]));
const exactPaws=Object.fromEntries(ids.map(id=>[id,{paw:[...stand.limbs[id].paw],pawYaw:0,contact:true,supportId:`cushion:initial:${id}`,
  swingPhase:'contact',swingProgress:null,loadHeight:.18}]));
const alignmentPlans=Object.fromEntries(ids.map(id=>[id,swingPlan(id,landedPaws[id],exactPaws[id],`align:${id}`)]));

function localizePose(worldPaws,root,spec){
  const localPaws=Object.fromEntries(ids.map(id=>[id,{...worldPaws[id],paw:sub(worldPaws[id].paw,root)}]));
  const pose=solveRestPose(spec,localPaws);pose.root=[...root];
  pose.head.worldCenter=add(pose.head.center,root);
  for(const[id,l]of Object.entries(pose.limbs)){
    for(const key of ['hip','knee','ankle','paw'])l['world'+key[0].toUpperCase()+key.slice(1)]=add(l[key],root);
    l.requestedWorldPaw=add(l.requestedPaw,root);l.requestedWorldAnkle=add(l.requestedAnkle,root);
    l.loadHeight=worldPaws[id].loadHeight;l.stepId=worldPaws[id].stepId??null;
  }return pose;
}

export function sampleRestApproach(timeSeconds){
  if(!Number.isFinite(timeSeconds))throw new TypeError('Finite time required');
  const t=clamp(timeSeconds,0,APPROACH_SECONDS);let paws,distance,phaseName,progress,root,bobAmount=1;
  if(t<=C.walkSeconds){distance=rootDistance(t);({paws}=sampleGait(distance));phaseName='walk-approach';progress=t/C.walkSeconds;root=[C.startRootX+distance,0,0];}
  else if(t<C.walkSeconds+C.finalStepSettleSeconds){
    distance=C.walkDistance;progress=(t-C.walkSeconds)/C.finalStepSettleSeconds;phaseName='finish-step';root=[0,0,0];
    paws={...stoppedGait.paws};for(const active of stoppedGait.active)paws[active.id]=sampleSwing(active.plan,mix(active.q,1,smooth(progress)));bobAmount=1-smooth(progress);
  }else{
    distance=C.walkDistance;phaseName='align-on-cushion';root=[0,0,0];bobAmount=0;
    const raw=(t-C.walkSeconds-C.finalStepSettleSeconds)/C.alignmentStepSeconds;
    const scaled=Math.abs(raw-Math.round(raw))<1e-12?Math.round(raw):raw,stage=Math.min(3,Math.floor(scaled)),u=clamp(scaled-stage);
    progress=scaled/4;paws={...landedPaws};for(let i=0;i<4;i++){const id=C.alignmentOrder[i];if(i<stage)paws[id]=exactPaws[id];else if(i===stage)paws[id]=sampleSwing(alignmentPlans[id],u);}
  }
  const spec=bodySpec(paws,distance,bobAmount),pose=localizePose(paws,root,spec);
  return {frame:Math.round(t*C.fps),timeSeconds:t,phaseName,phaseProgress:progress,distance,gaitPhase:fract(distance/C.stride),
    ...pose,curlAmount:0,terrainBody:spec.terrainBody};
}

export function buildRestApproachPack(){const count=Math.round(APPROACH_SECONDS*C.fps)+1;
  const events=[];
  for(const id of ids)for(let cycle=-1;cycle<=5;cycle++){
    for(const[type,offset,support]of [['paw-land',0,cycle],['paw-liftoff',C.stanceRatio,cycle]]){
      const d=(cycle+C.phaseOffsets[id]+offset)*C.stride;
      if(d>=0&&d<=C.walkDistance)events.push({type,phaseName:'walk-approach',timeSeconds:timeAtRootDistance(d),distance:d,limb:id,supportId:`approach:${id}:${support}`});
    }
  }
  for(const a of stoppedGait.active)events.push({type:'paw-land',phaseName:'finish-step',timeSeconds:C.walkSeconds+C.finalStepSettleSeconds,limb:a.id,supportId:a.plan.to.supportId});
  for(let i=0;i<4;i++){
    const id=C.alignmentOrder[i],t=C.walkSeconds+C.finalStepSettleSeconds+i*C.alignmentStepSeconds;
    events.push({type:'paw-liftoff',phaseName:'align-on-cushion',timeSeconds:t,limb:id,supportId:landedPaws[id].supportId},
      {type:'paw-land',phaseName:'align-on-cushion',timeSeconds:t+C.alignmentStepSeconds,limb:id,supportId:exactPaws[id].supportId});
  }
  return {version:1,motionRevision:'rest-approach-terrain-candidate-1',sourceLegAnatomy:'R2',visualStyleStatus:'REJECTED',skinContactValidated:false,
    scope:'Actual distance-driven walk, terrain-fit paw steps, stop and one-paw alignment. Preview proof only; full solid skin gate required.',
    coordinateSystem:'All renderer bones and paw centers are ACTOR LOCAL. world*=root+local; actor root travels along worldX. Original flat rest bones unchanged.',
    fps:C.fps,durationSeconds:APPROACH_SECONDS,frameCount:count,config:C,cushion:keyPack.cushion,events:events.sort((a,b)=>a.timeSeconds-b.timeSeconds),
    restSpine:keyPack.restSpine,restHead:keyPack.restHead,restLimbs:keyPack.restLimbs,hipBindings:keyPack.hipBindings,
    phases:[{name:'walk-approach',start:0,end:C.walkSeconds},{name:'finish-step',start:C.walkSeconds,end:C.walkSeconds+C.finalStepSettleSeconds},
      {name:'align-on-cushion',start:C.walkSeconds+C.finalStepSettleSeconds,end:APPROACH_SECONDS}],
    warnings:['Starts already in a valid walking phase, with hindFar airborne; no fake static approach.',
      'Surface fits use downsampled sole clouds and the exact cushion triangle heightfield; full solid skin validation remains required.',
      'The body pitches and rises from a smoothed lower rear/front support height; actor rootZ is always0. No global mesh scaling.',
      'Walking uses smooth horizontal+vertical terrain arcs. Alignment uses separate lift, travel, land. A completed swing never becomes a sliding support.',
      'Nonflat/rim supports include a disclosed +.004 clearance after the first actual solid-skin gate found−.003770 rim penetration. Exact flat0/.18 supports are unchanged.'],
    frames:Array.from({length:count},(_,i)=>sampleRestApproach(i/C.fps))};}
export function buildApproachAndRestPack(){const approach=buildRestApproachPack(),rest=buildRestTimelinePack();
  return {...approach,motionRevision:'rest-walk-align-full-proof-candidate-1',durationSeconds:APPROACH_SECONDS+rest.durationSeconds,
    frameCount:approach.frameCount+rest.frames.length-1,restStartSeconds:APPROACH_SECONDS,
    phases:[...approach.phases,...rest.config.phases.map(p=>({...p,start:p.start+APPROACH_SECONDS,end:p.end+APPROACH_SECONDS}))],
    events:[...approach.events,...rest.events.map(e=>({...e,timeSeconds:e.timeSeconds+APPROACH_SECONDS}))],
    frames:[...approach.frames,...rest.frames.slice(1).map(f=>({...f,frame:f.frame+approach.frameCount-1,timeSeconds:f.timeSeconds+APPROACH_SECONDS}))]};}
