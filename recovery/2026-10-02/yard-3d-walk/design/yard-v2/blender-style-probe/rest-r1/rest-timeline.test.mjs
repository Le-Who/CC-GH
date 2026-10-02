import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REST_CHAINS} from '../motion-r2/walk-solver.mjs';
import {buildKeyPosePack,sampleKeyPose} from './rest-keyposes.mjs';
import {REST_TIMELINE_CONFIG as C,buildRestTimelinePack,sampleRestTimeline} from './rest-timeline.mjs';
const pack=buildRestTimelinePack(),keyPack=buildKeyPosePack(),ids=Object.keys(REST_CHAINS);
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),distance=(a,b)=>norm(sub(a,b));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const nearPoint=(a,b,eps=1e-10)=>near(distance(a,b),0,eps);
const rotateYaw=(v,y)=>[v[0]*Math.cos(y)-v[1]*Math.sin(y),v[0]*Math.sin(y)+v[1]*Math.cos(y),v[2]];
const worldVector=(v,f)=>add(add(mul(f.forward,v[0]),mul(f.side,v[1])),mul(f.up,v[2]));
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.max(-1,Math.abs(dot(a,b)))));
const frameError=f=>Math.max(Math.abs(norm(f.forward)-1),Math.abs(norm(f.side)-1),Math.abs(norm(f.up)-1),
  Math.abs(dot(f.forward,f.side)),Math.abs(dot(f.forward,f.up)),Math.abs(dot(f.side,f.up)),Math.abs(dot(cross(f.forward,f.side),f.up)-1));
const finiteTree=v=>{if(typeof v==='number')assert.ok(Number.isFinite(v));else if(v&&typeof v==='object')Object.values(v).forEach(finiteTree);};
const sourceFiles=['../motion-r2/walk-solver.mjs','./rest-keyposes.mjs','./rest-keyposes.json','./rest-skin-audit.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,sha(await readFile(new URL(p,import.meta.url)))])));
const audit={scope:'Dense skeletal reach, fixed lengths, support continuity and rotation check only. Not a real mesh or art pass.',
  visualStyleStatus:'REJECTED',skinContactValidated:false,transitionReachValidated:true,denseSamples:8401,denseSampleIntervalSeconds:.001,
  limbSolutions:0,unreachableCount:0,guideDegenerateCount:0,maximumLiftedPaws:0,
  minimumInnerReachMargin:Infinity,minimumOuterReachMargin:Infinity,minimumJointCenterZ:Infinity,minimumCushionFootprintMargin:Infinity,
  maximumSpineLengthError:0,maximumNeckLengthError:0,maximumUpperLengthError:0,maximumLowerLengthError:0,
  maximumHipBindingError:0,maximumPawAnkleOffsetError:0,maximumFrameError:0,maximumReachError:0,
  maximumContactPositionDrift:0,maximumContactFacingDrift:0,maximumContactAnkleDrift:0,
  maximumDenseJointDisplacement:0,maximumDensePawDisplacement:0,maximumDenseFrameAxisChange:0,maximumDenseQuaternionAngle:0,
  maximumExportedPawDisplacement:0,minimumRestDirectionDot:Infinity,minimumConsecutiveQuaternionDot:Infinity,
  maximumPawSpeedApprox:0,warnings:[]};
let previous;
const anchors={};
for(let i=0;i<audit.denseSamples;i++){
  const pose=sampleRestTimeline(i*.001);let lifted=0;
  for(const name of ['pelvis','lumbar','chest','neck']){
    const f=pose.spine[name],error=Math.abs(distance(f.head,f.tail)-keyPack.restSpine[name].length);
    const label=name==='neck'?'maximumNeckLengthError':'maximumSpineLengthError';audit[label]=Math.max(audit[label],error);
    audit.maximumFrameError=Math.max(audit.maximumFrameError,frameError(f.frame));
  }
  for(const[id,l]of Object.entries(pose.limbs)){
    audit.limbSolutions++;if(!l.reachable)audit.unreachableCount++;if(l.guideDegenerate)audit.guideDegenerateCount++;
    if(!l.contact)lifted++;
    audit.minimumInnerReachMargin=Math.min(audit.minimumInnerReachMargin,l.innerReachMargin);
    audit.minimumOuterReachMargin=Math.min(audit.minimumOuterReachMargin,l.outerReachMargin);
    audit.maximumReachError=Math.max(audit.maximumReachError,l.reachError);
    audit.maximumUpperLengthError=Math.max(audit.maximumUpperLengthError,Math.abs(distance(l.hip,l.knee)-REST_CHAINS[id].upperLength));
    audit.maximumLowerLengthError=Math.max(audit.maximumLowerLengthError,Math.abs(distance(l.knee,l.ankle)-REST_CHAINS[id].lowerLength));
    audit.minimumJointCenterZ=Math.min(audit.minimumJointCenterZ,...['hip','knee','ankle','paw'].map(k=>l[k][2]));
    const reconstructed=add(pose.spineEndpoints[l.hipBinding.endpointIndex],worldVector(l.hipBinding.localOffset,l.anchorFrame));
    audit.maximumHipBindingError=Math.max(audit.maximumHipBindingError,distance(l.hip,reconstructed));
    audit.maximumPawAnkleOffsetError=Math.max(audit.maximumPawAnkleOffsetError,distance(sub(l.ankle,l.paw),rotateYaw(REST_CHAINS[id].ankleOffset,l.rotations.paw.yaw)));
    for(const frame of Object.values(l.frames))audit.maximumFrameError=Math.max(audit.maximumFrameError,frameError(frame));
    for(const bone of ['upper','lower'])audit.minimumRestDirectionDot=Math.min(audit.minimumRestDirectionDot,l.rotations[bone].restDirectionDot);
    const yaw=l.rotations.paw.yaw,extentX=.21*Math.abs(Math.cos(yaw))+.165*Math.abs(Math.sin(yaw)),extentY=.21*Math.abs(Math.sin(yaw))+.165*Math.abs(Math.cos(yaw));
    audit.minimumCushionFootprintMargin=Math.min(audit.minimumCushionFootprintMargin,
      pack.cushion.width/2-Math.abs(l.paw[0]-pack.cushion.center[0])-extentX,pack.cushion.depth/2-Math.abs(l.paw[1]-pack.cushion.center[1])-extentY);
    if(l.contact){
      assert.ok(l.supportId);anchors[l.supportId]??={paw:l.paw,forward:l.pawForward,ankle:l.ankle};
      const anchor=anchors[l.supportId];audit.maximumContactPositionDrift=Math.max(audit.maximumContactPositionDrift,distance(l.worldPaw,anchor.paw));
      audit.maximumContactFacingDrift=Math.max(audit.maximumContactFacingDrift,distance(l.pawForward,anchor.forward));
      audit.maximumContactAnkleDrift=Math.max(audit.maximumContactAnkleDrift,distance(l.worldAnkle,anchor.ankle));
      near(l.paw[2],pack.cushion.topZ);
    }else assert.equal(l.supportId,null);
    if(previous){
      const old=previous.limbs[id],pawStep=distance(l.paw,old.paw);
      audit.maximumDensePawDisplacement=Math.max(audit.maximumDensePawDisplacement,pawStep);
      for(const k of ['hip','knee','ankle','paw'])audit.maximumDenseJointDisplacement=Math.max(audit.maximumDenseJointDisplacement,distance(l[k],old[k]));
      for(const bone of ['upper','lower','paw']){
        const q=l.rotations[bone].quaternion,oq=old.rotations[bone].quaternion;
        audit.minimumConsecutiveQuaternionDot=Math.min(audit.minimumConsecutiveQuaternionDot,dot(q,oq));
        audit.maximumDenseQuaternionAngle=Math.max(audit.maximumDenseQuaternionAngle,angle(q,oq));
        for(const axis of ['forward','side','up'])audit.maximumDenseFrameAxisChange=Math.max(audit.maximumDenseFrameAxisChange,distance(l.frames[bone][axis],old.frames[bone][axis]));
      }
    }
  }
  audit.maximumLiftedPaws=Math.max(audit.maximumLiftedPaws,lifted);previous=pose;
}
audit.maximumPawSpeedApprox=audit.maximumDensePawDisplacement/.001;
for(let i=1;i<pack.frames.length;i++)for(const id of ids)audit.maximumExportedPawDisplacement=Math.max(audit.maximumExportedPawDisplacement,distance(pack.frames[i].limbs[id].paw,pack.frames[i-1].limbs[id].paw));
audit.warnings.push('Forepaw travel is long: peak paw speed ≈'+audit.maximumPawSpeedApprox.toFixed(3)+' units/s and maximum 20fps paw displacement '+audit.maximumExportedPawDisplacement.toFixed(3)+' units. Visual timing review required.');
audit.warnings.push('Geometric joint centers and conservative footprints exclude neither skin-floor intersections nor paw/body self-intersections.');

function compareGeometry(a,b,eps=1e-9){
  nearPoint(a.root,b.root,eps);nearPoint(a.head.center,b.head.center,eps);nearPoint(a.head.forward,b.head.forward,eps);near(a.eyeClose,b.eyeClose,eps);
  for(const name of ['pelvis','lumbar','chest','neck'])for(const k of ['head','tail','up','forward'])nearPoint(a.spine[name][k],b.spine[name][k],eps);
  for(const id of ids){for(const k of ['hip','knee','ankle','paw','pawForward'])nearPoint(a.limbs[id][k],b.limbs[id][k],eps);}
}

test('export is an 8.4-second,20fps bounded rest proof with complete schema and honest status',()=>{
  assert.equal(pack.frames.length,169);assert.equal(pack.fps,20);assert.equal(pack.durationSeconds,8.4);
  assert.equal(pack.visualStyleStatus,'REJECTED');assert.ok(!pack.config.phases.some(p=>/walk|align/.test(p.name)));
  for(const f of pack.frames){finiteTree(f);assert.deepEqual(f.root,[0,0,0]);assert.equal(f.globalScale,1);assert.equal(f.skinContactValidated,false);
    near(f.frame/20,f.timeSeconds);assert.ok(f.phaseName);assert.ok(f.curlAmount>=0&&f.curlAmount<=1);
    for(const l of Object.values(f.limbs))for(const k of ['hip','knee','ankle','paw'])nearPoint(l[k],l['world'+k[0].toUpperCase()+k.slice(1)]);
  }
});

test('all authored stand/sit/curl geometries are reached exactly and final stand returns exactly',()=>{
  for(const[t,key]of [[0,'stand'],[.2,'stand'],[1.2,'sit'],[3.6,'curl'],[4.8,'curl'],[7.2,'sit'],[8.2,'stand'],[8.4,'stand']])compareGeometry(sampleRestTimeline(t),sampleKeyPose(key));
});

test('33,604 dense limb solutions remain fully reachable without clipping, bone scaling or degeneracy',()=>{
  assert.equal(audit.limbSolutions,33604);assert.equal(audit.unreachableCount,0);assert.equal(audit.guideDegenerateCount,0);
  assert.ok(audit.minimumInnerReachMargin>.09);assert.ok(audit.minimumOuterReachMargin>.025);
  near(audit.maximumReachError,0);near(audit.maximumSpineLengthError,0);near(audit.maximumNeckLengthError,0);
  near(audit.maximumUpperLengthError,0);near(audit.maximumLowerLengthError,0);
  assert.ok(audit.minimumJointCenterZ>=pack.cushion.topZ-1e-10);assert.ok(audit.minimumCushionFootprintMargin>0);
});

test('hips retain exact original body binding; knee guide follows body, ankle offset follows paw facing',()=>{
  near(audit.maximumHipBindingError,0);near(audit.maximumPawAnkleOffsetError,0);
  let decoupled=0;
  for(const f of pack.frames)for(const[id,l]of Object.entries(f.limbs)){
    assert.deepEqual(l.hipBinding,keyPack.hipBindings[id]);nearPoint(l.kneeGuide,rotateYaw([REST_CHAINS[id].bend,0,0],l.anchorFrame.rotation.yaw));
    nearPoint(l.pawForward,rotateYaw([1,0,0],l.rotations.paw.yaw));
    if(l.contact&&Math.abs(l.rotations.paw.yaw-l.anchorFrame.rotation.yaw)>.2)decoupled++;
  }
  assert.ok(decoupled>10,'Grounded paws must visibly decouple from body turn');
});

test('every support holds one invariant WORLD paw position, facing and ankle; at most one paw lifts',()=>{
  assert.equal(Object.keys(anchors).length,8);assert.equal(audit.maximumLiftedPaws,1);
  near(audit.maximumContactPositionDrift,0);near(audit.maximumContactFacingDrift,0);near(audit.maximumContactAnkleDrift,0);
  for(const f of pack.frames.filter(f=>['stand','sit','stand-up','rest'].includes(f.phaseName)))for(const l of Object.values(f.limbs))assert.equal(l.contact,true);
});

test('each tuck has distinct stationary-XY lift, airborne transport, stationary-XY land and support boundaries',()=>{
  for(let i=0;i<4;i++){
    const id=C.tuckOrder[i],start=1.2+i*.6;
    for(const[u,label,key]of [[.09,'lift','sit'],[.5,'air',null],[.91,'land','curl']]){
      const f=sampleRestTimeline(start+.6*u),l=f.limbs[id];assert.equal(f.activePaw,id);assert.equal(l.contact,false);assert.equal(l.swingPhase,label);
      assert.ok(l.paw[2]>pack.cushion.topZ+.02);assert.equal(Object.values(f.limbs).filter(l=>!l.contact).length,1);
      if(key){const anchor=sampleKeyPose(key).limbs[id];nearPoint(l.paw.slice(0,2),anchor.paw.slice(0,2));near(l.rotations.paw.yaw,anchor.rotations.paw.yaw);}
    }
    for(const t of [start,start+.6])for(const l of Object.values(sampleRestTimeline(t).limbs))assert.equal(l.contact,true);
  }
});

test('uncurl traverses exactly the same safe geometry in reverse and reverses lift/land labels',()=>{
  for(let i=0;i<=2400;i++){
    const t=1.2+i*.001,a=sampleRestTimeline(t),b=sampleRestTimeline(8.4-t);compareGeometry(a,b,3e-12);
    for(const id of ids){const x=a.limbs[id],y=b.limbs[id];assert.equal(x.contact,y.contact);assert.equal(x.supportId,y.supportId);
      assert.equal(y.swingPhase,x.swingPhase==='lift'?'land':x.swingPhase==='land'?'lift':x.swingPhase);}
  }
});

test('quaternions and full axes stay continuous through upper-leg vertical poses with no sign or roll flips',()=>{
  near(audit.maximumFrameError,0);assert.ok(audit.minimumRestDirectionDot>-.9);
  assert.ok(audit.minimumConsecutiveQuaternionDot>.9999);assert.ok(audit.maximumDenseQuaternionAngle<.02);
  assert.ok(audit.maximumDenseFrameAxisChange<.02);assert.ok(audit.maximumDenseJointDisplacement<.01);
  for(const f of pack.frames)for(const l of Object.values(f.limbs))for(const name of ['upper','lower','paw'])near(norm(l.rotations[name].quaternion),1);
});

test('phase, foot-event and lift/travel/land boundaries have continuous geometry and zero point-speed at full-support changes',()=>{
  const boundaries=[...new Set([...C.phases.flatMap(p=>[p.start,p.end]),...pack.events.map(e=>e.timeSeconds)])];
  for(const t of boundaries){
    const left=sampleRestTimeline(t-1e-6),right=sampleRestTimeline(t+1e-6);compareGeometry(left,right,1e-9);
    for(const id of ids)nearPoint(left.limbs[id].paw,right.limbs[id].paw,1e-9);
  }
  for(const e of pack.events){const f=sampleRestTimeline(e.timeSeconds);assert.equal(f.limbs[e.limb].contact,true);near(e.timeSeconds*20,Math.round(e.timeSeconds*20));}
  assert.equal(pack.events.length,16);
});

test('rest breathing articulates spine only, holds pelvis and all support points, and joins rest boundaries continuously',()=>{
  const zero=sampleRestTimeline(3.6),peak=sampleRestTimeline(4.2);
  nearPoint(zero.spine.pelvis.head,peak.spine.pelvis.head);nearPoint(zero.spine.pelvis.tail,peak.spine.pelvis.tail);
  assert.ok(distance(zero.spine.chest.tail,peak.spine.chest.tail)>.003);
  assert.ok(distance(zero.head.center,peak.head.center)<.01);
  for(const id of ids)nearPoint(zero.limbs[id].paw,peak.limbs[id].paw);
  assert.equal(peak.eyeClose,1);assert.equal(peak.curlAmount,1);
});

test('explicitly disclosed tiny pelvis lift preserves exact curl endpoints; sampling is deterministic',()=>{
  assert.equal(C.pelvisLiftArc,.01);assert.equal(pack.authoredChanges.length,1);
  assert.deepEqual(sampleRestTimeline(2.125),sampleRestTimeline(2.125));
  assert.throws(()=>sampleRestTimeline(NaN),TypeError);compareGeometry(sampleRestTimeline(-1),sampleRestTimeline(0));
  compareGeometry(sampleRestTimeline(20),sampleRestTimeline(8.4));
});

test('atomically save audited timeline without modifying static keys, calibrated skin audit or R2 anatomy source',async()=>{
  for(const p of sourceFiles)assert.equal(sha(await readFile(new URL(p,import.meta.url))),sourceHashes[p]);
  const output={...pack,audit,sourceIntegrity:{sha256:sourceHashes}};
  const temporary=new URL('./rest-timeline.json.tmp',import.meta.url),destination=new URL('./rest-timeline.json',import.meta.url);
  await writeFile(temporary,JSON.stringify(output,null,2)+'\n');await rename(temporary,destination);
  console.log(JSON.stringify(audit));
});
