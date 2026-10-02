import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REST_CHAINS} from '../motion-r2/walk-solver.mjs';
import {buildKeyPosePack} from './rest-keyposes.mjs';
import {sampleRestTimeline} from './rest-timeline.mjs';
import {REST_APPROACH_CONFIG as C,SURFACE_PROXIES,APPROACH_SECONDS,surfaceHeight,fitPawSupport,minimumPawTerrainGap,
  rootDistance,timeAtRootDistance,sampleRestApproach,buildRestApproachPack,buildApproachAndRestPack} from './rest-approach.mjs';
const pack=buildRestApproachPack(),full=buildApproachAndRestPack(),keyPack=buildKeyPosePack(),ids=Object.keys(REST_CHAINS);
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),distance=(a,b)=>norm(sub(a,b));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const nearPoint=(a,b,eps=1e-10)=>near(distance(a,b),0,eps);
const rotateYaw=(v,y)=>[v[0]*Math.cos(y)-v[1]*Math.sin(y),v[0]*Math.sin(y)+v[1]*Math.cos(y),v[2]];
const worldVector=(v,f)=>add(add(mul(f.forward,v[0]),mul(f.side,v[1])),mul(f.up,v[2]));
const qAngle=(a,b)=>2*Math.acos(Math.min(1,Math.max(-1,Math.abs(dot(a,b)))));
const frameError=f=>Math.max(Math.abs(norm(f.forward)-1),Math.abs(norm(f.side)-1),Math.abs(norm(f.up)-1),
 Math.abs(dot(f.forward,f.side)),Math.abs(dot(f.forward,f.up)),Math.abs(dot(f.side,f.up)),Math.abs(dot(cross(f.forward,f.side),f.up)-1));
const sourceFiles=['./rest-timeline.mjs','./rest-timeline.test.mjs','./rest-timeline.json','./rest-keyposes.mjs','./rest-keyposes.json','../motion-r2/walk-solver.mjs','./contact-surface-proxies.json'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,sha(await readFile(new URL(p,import.meta.url)))])));
const audit={scope:'Dense exact FK/IK, world support, trajectory continuity and sampled lower-paw terrain check. Not full skin or visual acceptance.',
 visualStyleStatus:'REJECTED',skinContactValidated:false,transitionReachValidated:true,
 denseSampleIntervalSeconds:.001,denseSamples:5901,limbSolutions:0,unreachableCount:0,guideDegenerateCount:0,
 minimumInnerReachMargin:Infinity,minimumOuterReachMargin:Infinity,maximumReachError:0,
 maximumSpineLengthError:0,maximumNeckLengthError:0,maximumUpperLengthError:0,maximumLowerLengthError:0,
 maximumHipBindingError:0,maximumLocalWorldError:0,maximumPawAnkleOffsetError:0,maximumFrameError:0,
 maximumContactPositionDrift:0,maximumContactFacingDrift:0,maximumContactAnkleDrift:0,
 maximumLiftedPawsWalk:0,maximumLiftedPawsAlignment:0,maximumDenseJointDisplacement:0,maximumDenseQuaternionAngle:0,
 minimumConsecutiveQuaternionDot:Infinity,maximumDenseFrameAxisChange:0,maximumDenseJointSecondDifference:0,
 terrainSampleIntervalSeconds:.005,terrainPoseSamples:0,terrainLimbPoseSamples:0,solePointChecks:0,
 minimumSoleTerrainGap:Infinity,minimumContactSoleTerrainGap:Infinity,maximumContactSoleTerrainGap:-Infinity,
 terrainWorst:null,peakRootSpeed:0,minimumRootStep:Infinity,maximumBodyPitch:0,maximumExportedPawDisplacement:0,
 warnings:['Paw terrain QA is based on the supplied downsampled lower-surface points. Full evaluated skin gate remains required.',
 'Walking begins in a valid in-progress gait phase with hindFar airborne; it is not an initial stationary pose.']};
const anchors={};let prior,priorDeltas;
for(let i=0;i<audit.denseSamples;i++){
 const t=i*.001,f=sampleRestApproach(t),deltas={};let lifted=0;
 audit.maximumBodyPitch=Math.max(audit.maximumBodyPitch,Math.abs(f.terrainBody.pitchRadians));
 for(const name of ['pelvis','lumbar','chest','neck']){
  const b=f.spine[name],error=Math.abs(distance(b.head,b.tail)-keyPack.restSpine[name].length),metric=name==='neck'?'maximumNeckLengthError':'maximumSpineLengthError';
  audit[metric]=Math.max(audit[metric],error);audit.maximumFrameError=Math.max(audit.maximumFrameError,frameError(b.frame));
 }
 for(const[id,l]of Object.entries(f.limbs)){
  audit.limbSolutions++;if(!l.reachable)audit.unreachableCount++;if(l.guideDegenerate)audit.guideDegenerateCount++;if(!l.contact)lifted++;
  audit.minimumInnerReachMargin=Math.min(audit.minimumInnerReachMargin,l.innerReachMargin);audit.minimumOuterReachMargin=Math.min(audit.minimumOuterReachMargin,l.outerReachMargin);
  audit.maximumReachError=Math.max(audit.maximumReachError,l.reachError);
  audit.maximumUpperLengthError=Math.max(audit.maximumUpperLengthError,Math.abs(distance(l.hip,l.knee)-REST_CHAINS[id].upperLength));
  audit.maximumLowerLengthError=Math.max(audit.maximumLowerLengthError,Math.abs(distance(l.knee,l.ankle)-REST_CHAINS[id].lowerLength));
  const hip=add(f.spineEndpoints[l.hipBinding.endpointIndex],worldVector(l.hipBinding.localOffset,l.anchorFrame));
  audit.maximumHipBindingError=Math.max(audit.maximumHipBindingError,distance(hip,l.hip));
  for(const k of ['hip','knee','ankle','paw'])audit.maximumLocalWorldError=Math.max(audit.maximumLocalWorldError,distance(add(l[k],f.root),l['world'+k[0].toUpperCase()+k.slice(1)]));
  audit.maximumPawAnkleOffsetError=Math.max(audit.maximumPawAnkleOffsetError,distance(sub(l.ankle,l.paw),rotateYaw(REST_CHAINS[id].ankleOffset,l.rotations.paw.yaw)));
  for(const b of Object.values(l.frames))audit.maximumFrameError=Math.max(audit.maximumFrameError,frameError(b));
  if(l.contact){
   assert.ok(l.supportId);anchors[l.supportId]??={paw:l.worldPaw,forward:l.pawForward,ankle:l.worldAnkle};
   const a=anchors[l.supportId];audit.maximumContactPositionDrift=Math.max(audit.maximumContactPositionDrift,distance(l.worldPaw,a.paw));
   audit.maximumContactFacingDrift=Math.max(audit.maximumContactFacingDrift,distance(l.pawForward,a.forward));audit.maximumContactAnkleDrift=Math.max(audit.maximumContactAnkleDrift,distance(l.worldAnkle,a.ankle));
  }else assert.equal(l.supportId,null);
  if(i%5===0){
   const gap=minimumPawTerrainGap(id,l.worldPaw,l.rotations.paw.yaw);audit.terrainLimbPoseSamples++;audit.solePointChecks+=SURFACE_PROXIES.paws[id].pointCount;
   if(gap<audit.minimumSoleTerrainGap){audit.minimumSoleTerrainGap=gap;audit.terrainWorst={timeSeconds:t,limb:id,contact:l.contact,worldPaw:l.worldPaw};}
   if(l.contact){audit.minimumContactSoleTerrainGap=Math.min(audit.minimumContactSoleTerrainGap,gap);audit.maximumContactSoleTerrainGap=Math.max(audit.maximumContactSoleTerrainGap,gap);}
  }
  if(prior){
   const old=prior.limbs[id];for(const p of ['worldHip','worldKnee','worldAnkle','worldPaw']){
    const delta=sub(l[p],old[p]);deltas[id+p]=delta;audit.maximumDenseJointDisplacement=Math.max(audit.maximumDenseJointDisplacement,norm(delta));
    if(priorDeltas?.[id+p])audit.maximumDenseJointSecondDifference=Math.max(audit.maximumDenseJointSecondDifference,distance(delta,priorDeltas[id+p]));
   }
   for(const b of ['upper','lower','paw']){
    audit.minimumConsecutiveQuaternionDot=Math.min(audit.minimumConsecutiveQuaternionDot,dot(l.rotations[b].quaternion,old.rotations[b].quaternion));
    audit.maximumDenseQuaternionAngle=Math.max(audit.maximumDenseQuaternionAngle,qAngle(l.rotations[b].quaternion,old.rotations[b].quaternion));
    for(const axis of ['up','side','forward'])audit.maximumDenseFrameAxisChange=Math.max(audit.maximumDenseFrameAxisChange,distance(l.frames[b][axis],old.frames[b][axis]));
   }
  }
 }
 if(i%5===0)audit.terrainPoseSamples++;
 const metric=f.phaseName==='align-on-cushion'?'maximumLiftedPawsAlignment':'maximumLiftedPawsWalk';audit[metric]=Math.max(audit[metric],lifted);
 if(prior){const step=f.root[0]-prior.root[0];audit.peakRootSpeed=Math.max(audit.peakRootSpeed,step/.001);audit.minimumRootStep=Math.min(audit.minimumRootStep,step);}
 prior=f;priorDeltas=deltas;
}
for(let i=1;i<pack.frames.length;i++)for(const id of ids)audit.maximumExportedPawDisplacement=Math.max(audit.maximumExportedPawDisplacement,distance(pack.frames[i].limbs[id].worldPaw,pack.frames[i-1].limbs[id].worldPaw));
function compareGeometry(a,b,eps=1e-10){
 nearPoint(a.root,b.root,eps);nearPoint(a.head.center,b.head.center,eps);nearPoint(a.head.forward,b.head.forward,eps);nearPoint(a.head.worldCenter,b.head.worldCenter,eps);near(a.eyeClose,b.eyeClose,eps);
 for(const n of ['pelvis','lumbar','chest','neck'])for(const k of ['head','tail','up','forward'])nearPoint(a.spine[n][k],b.spine[n][k],eps);
 for(const id of ids)for(const k of ['hip','knee','ankle','paw','worldHip','worldKnee','worldAnkle','worldPaw','pawForward'])nearPoint(a.limbs[id][k],b.limbs[id][k],eps);
}

test('actual root walk covers2.6 units with smooth≈.881 speed; .64-stride phase is driven by distance',()=>{
 nearPoint(pack.frames[0].root,[-2.6,0,0]);nearPoint(sampleRestApproach(C.walkSeconds).root,[0,0,0]);
 assert.ok(audit.peakRootSpeed>.88&&audit.peakRootSpeed<.89);assert.ok(audit.minimumRootStep>=-1e-12);
 for(const f of pack.frames){near(f.root[2],0);near(f.gaitPhase,(f.distance/.64)%1);nearPoint(f.head.worldCenter,add(f.head.center,f.root));}
 for(const t of [0,C.walkSeconds])near((rootDistance(t+1e-5)-rootDistance(t-1e-5))/(2e-5),0,1e-8);
 for(let i=0;i<=100;i++)near(rootDistance(timeAtRootDistance(i*C.walkDistance/100)),i*C.walkDistance/100,1e-10);
});

test('all23,604 dense limb solves retain full3D reach, exact anatomy, hip bindings and local/world coordinates',()=>{
 assert.equal(audit.limbSolutions,23604);assert.equal(audit.unreachableCount,0);assert.equal(audit.guideDegenerateCount,0);
 assert.ok(audit.minimumOuterReachMargin>.027);assert.ok(audit.minimumInnerReachMargin>.23);
 for(const k of ['maximumReachError','maximumSpineLengthError','maximumNeckLengthError','maximumUpperLengthError','maximumLowerLengthError',
  'maximumHipBindingError','maximumLocalWorldError','maximumPawAnkleOffsetError','maximumFrameError'])near(audit[k],0);
 for(const f of pack.frames){assert.equal(f.globalScale,1);assert.equal(f.visualStyleStatus,'REJECTED');for(const[id,l]of Object.entries(f.limbs))assert.deepEqual(l.hipBinding,keyPack.hipBindings[id]);}
});

test('the exact upper triangle field includes raised rim, seat and outside floor',()=>{
 near(surfaceHeight(-3,0),0);near(surfaceHeight(0,0),.18,1e-7);
 const maximumVertexZ=Math.max(...SURFACE_PROXIES.cushion.vertices.map(v=>v[2]));assert.ok(maximumVertexZ>.234&&maximumVertexZ<.236);
 let rim=false;for(const v of SURFACE_PROXIES.cushion.vertices)if(surfaceHeight(v[0],v[1])>.23)rim=true;assert.ok(rim);
 for(const id of ids){assert.ok(SURFACE_PROXIES.paws[id].pointCount>=300);near(fitPawSupport(id,keyPack.poses[0].limbs[id].paw[0],REST_CHAINS[id].paw[1]).paw[2],.18);}
});

test('1,181 swept poses keep every sampled sole point above actual terrain within−.0012 tolerance',()=>{
 assert.equal(audit.terrainPoseSamples,1181);assert.equal(audit.terrainLimbPoseSamples,4724);assert.ok(audit.solePointChecks>1500000);
 assert.ok(audit.minimumSoleTerrainGap>=-.0012-1e-10);assert.ok(audit.maximumContactSoleTerrainGap<C.nonflatSupportClearance);
 assert.equal(audit.skinContactValidated,false);
});

test('planted world paw/ankle positions and facings stay fixed while root advances',()=>{
 assert.ok(Object.keys(anchors).length>20);near(audit.maximumContactPositionDrift,0);near(audit.maximumContactFacingDrift,0);near(audit.maximumContactAnkleDrift,0);
 let partialClimb=false;for(const f of pack.frames){const contacts=Object.values(f.limbs).filter(l=>l.contact);if(Math.max(...contacts.map(l=>l.worldPaw[2]))-Math.min(...contacts.map(l=>l.worldPaw[2]))>.15)partialClimb=true;}
 assert.ok(partialClimb,'Actual floor/rim/seat support mix must exist');assert.ok(audit.maximumBodyPitch>.12);
});

test('gait and frame orientations are continuous without target snaps, pole flips or quaternion sign changes',()=>{
 assert.ok(audit.maximumDenseJointDisplacement<.006);assert.ok(audit.maximumDenseQuaternionAngle<.02);
 assert.ok(audit.maximumDenseFrameAxisChange<.02);assert.ok(audit.minimumConsecutiveQuaternionDot>.9999);
 assert.ok(audit.maximumDenseJointSecondDifference<.0002);
 for(const e of pack.events){
  const left=sampleRestApproach(e.timeSeconds-1e-7),right=sampleRestApproach(e.timeSeconds+1e-7);
  compareGeometry(left,right,2e-6);nearPoint(left.limbs[e.limb].worldPaw,right.limbs[e.limb].worldPaw,1e-8);
  assert.equal(sampleRestApproach(e.timeSeconds).limbs[e.limb].contact,true);
 }
});

test('finish-step completes only the already airborne final foot; alignment lifts one foot at a time',()=>{
 assert.equal(audit.maximumLiftedPawsWalk,2);assert.equal(audit.maximumLiftedPawsAlignment,1);
 const stopped=sampleRestApproach(C.walkSeconds);assert.deepEqual(ids.filter(id=>!stopped.limbs[id].contact),['hindFar']);
 for(const f of pack.frames.filter(f=>f.phaseName==='finish-step'))for(const id of ids.filter(id=>id!=='hindFar'))nearPoint(f.limbs[id].worldPaw,stopped.limbs[id].worldPaw);
 for(let i=0;i<4;i++){
  const t=C.walkSeconds+C.finalStepSettleSeconds+i*.5,id=C.alignmentOrder[i],mid=sampleRestApproach(t+.25);
  assert.deepEqual(ids.filter(id=>!mid.limbs[id].contact),[id]);
  for(const u of [0,.5])for(const l of Object.values(sampleRestApproach(t+u).limbs))assert.equal(l.contact,true);
 }
});

test('final pose bridges exactly to frozen rest pose0 with all original stand anchors and orientations',()=>{
 const end=sampleRestApproach(APPROACH_SECONDS),rest=sampleRestTimeline(0);compareGeometry(end,rest,2e-15);
 for(const id of ids){assert.equal(end.limbs[id].supportId,rest.limbs[id].supportId);assert.equal(end.limbs[id].contact,true);}
});

test('combined proof is genuine walk→align→sit→curl→rest→uncurl→stand with one shared bridge frame',()=>{
 assert.equal(pack.frames.length,119);assert.equal(full.frames.length,287);near(full.durationSeconds,14.3);near(full.restStartSeconds,5.9);
 assert.equal(full.frames[0].phaseName,'walk-approach');assert.equal(full.frames.at(-1).phaseName,'stand');
 for(let i=0;i<full.frames.length;i++){assert.equal(full.frames[i].frame,i);near(full.frames[i].timeSeconds,i/20);}
 assert.ok(full.frames.some(f=>f.phaseName==='curl'));assert.ok(full.frames.some(f=>f.phaseName==='uncurl'));
 compareGeometry(full.frames[118],sampleRestTimeline(0),2e-15);compareGeometry(full.frames.at(-1),sampleRestTimeline(8.4),2e-15);
});

test('sampling is deterministic and original sources, static keys and frozen rest files remain unchanged',async()=>{
 assert.deepEqual(sampleRestApproach(1.234),sampleRestApproach(1.234));assert.throws(()=>sampleRestApproach(NaN),TypeError);
 for(const p of sourceFiles)assert.equal(sha(await readFile(new URL(p,import.meta.url))),sourceHashes[p]);
});

test('save separate approach and combined JSON artifacts with honest dense audit and source integrity',async()=>{
 for(const[name,body]of [['rest-approach',pack],['rest-approach-full',full]]){
  const output={...body,audit,sourceIntegrity:{sha256:sourceHashes}},tmp=new URL(`./${name}.json.tmp`,import.meta.url),dest=new URL(`./${name}.json`,import.meta.url);
  await writeFile(tmp,JSON.stringify(output,null,2)+'\n');await rename(tmp,dest);
 }
 console.log(JSON.stringify(audit));
});
