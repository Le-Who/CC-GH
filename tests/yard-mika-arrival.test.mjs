import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import calibration from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type:'json'};
import envelope from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type:'json'};
import {createMikaLocomotionRoute,sampleMikaLocomotion} from '../src/games/companion-yard-v2/mika-qa/mika-locomotion.mjs';
import {prepareMikaArrival} from '../src/games/companion-yard-v2/mika-qa/mika-arrival.mjs';
import {createMikaNativePoseDriver} from '../src/games/companion-yard-v2/mika-qa/mika-native-pose.mjs';
import {boundMikaPose} from '../src/games/companion-yard-v2/mika-qa/mika-envelope.mjs';

const vendor=new URL('../src/games/companion-yard-v2/pip-prototype/vendor/three/',import.meta.url);
registerHooks({resolve(s,c,n){return n(s==='three'?new URL('build/three.module.js',vendor).href:s,c);}});
const THREE=await import('three'),{GLTFLoader}=await import(new URL('addons/loaders/GLTFLoader.js',vendor));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function path(turn,heading=0) {
  const yaw=t=>heading+turn*smooth((t-.55)/2.85),p=[[0,0]];
  for(let i=1;i<=8000;i++) {
    const a=yaw(-2+(i-1)*.001),b=yaw(-2+i*.001),prev=p.at(-1);
    p.push([prev[0]+.74*.0005*(Math.cos(a)+Math.cos(b)),prev[1]+.74*.0005*(Math.sin(a)+Math.sin(b))]);
  }
  const zero=p[2000];
  return t=>{
    const k=(t+2)*1000,i=Math.max(0,Math.min(7999,Math.floor(k))),u=Math.max(0,Math.min(1,k-i));
    return {position:[7+p[i][0]+(p[i+1][0]-p[i][0])*u-zero[0],6+p[i][1]+(p[i+1][1]-p[i][1])*u-zero[1],0],heading:yaw(t)};
  };
}
function prepare(turn=-Math.PI/12,heading=0) {
  const route=createMikaLocomotionRoute(path(turn,heading),calibration,{mirrorPhase:turn>0,activeEnd:4.5});
  const cruise=t=>sampleMikaLocomotion(route,calibration,t);
  return {cruise,arrival:prepareMikaArrival(calibration,cruise)};
}
const components=sample=>[...sample.root.position,sample.root.heading,...Object.values(sample.boneMatrices).flat(2)];

// Complete-sample digests independently captured with the exact accepted
// 8aab52a32e6eb6bf3bdd8083dd9ec3d4691823db locomotion module, before extraction.
test('body/IK extraction preserves every cruise field at 161 times in each turn phase',()=>{
  for(const [turn,expected] of [
    [-Math.PI/12,'ca8380b14a5f968030b3bdf99f56ce180cc0d0fe4c59794db4affc4abd63453f'],
    [Math.PI/12,'b7a7a5e54bb77bcb9f7ad203df62025237046b148d8dc0de70f4612ff516533d'],
  ]) {
    const {cruise}=prepare(turn),hash=createHash('sha256');
    for(let i=0;i<=160;i++)hash.update(JSON.stringify(cruise(i/40)));
    assert.equal(hash.digest('hex'),expected);
  }
  assert.throws(()=>createMikaLocomotionRoute(t=>({position:[.70*t,0,0],heading:0}),calibration),/UNQUALIFIED_ROOT_SPEED/);
});

test('seam preserves root velocity and all 22 body/bone transforms across headings and mirrored phases',()=>{
  const eps=1e-5;
  for(const turn of [-Math.PI/12,Math.PI/12])for(const heading of [0,.7,Math.PI/2,Math.PI,-3*Math.PI/4]) {
    const {cruise,arrival}=prepare(turn,heading),before=cruise(4-eps),join=cruise(4),after=arrival.sample(4+eps);
    assert.equal(arrival.durationSeconds,6);
    assert.deepEqual(arrival.sample(4),join);
    const a=components(before),b=components(join),c=components(after);
    assert.equal(Object.keys(after.boneMatrices).length,22);
    for(let i=0;i<b.length;i++) {
      assert.ok(Math.abs(c[i]-b[i])<.0001,`component ${i}: no pose jump`);
      assert.ok(Math.abs((b[i]-a[i])/eps-(c[i]-b[i])/eps)<.02,`component ${i}: matching seam velocity`);
    }
    assert.ok(distance(before.root.position,join.root.position)/eps>.73999);
    assert.ok(Math.abs(distance(join.root.position,after.root.position)/eps-.74)<1e-8);
  }
});

test('arrival locks supports, completes in-flight paws and settles into a finite, item-facing idle',()=>{
  for(const turn of [-Math.PI/12,Math.PI/12])for(const heading of [0,.7,Math.PI/2]) {
    const {cruise,arrival}=prepare(turn,heading),initial=cruise(4),anchors=new Map();
    let previous=initial,speed=.74;
    for(let i=0;i<=480;i++) {
      const time=4+i/240,s=arrival.sample(time);
      assert.equal(s.rootOwner,'navigation');assert.equal(s.root.heading,initial.root.heading);
      assert.deepEqual(s.reachFailures,[]);
      assert.ok(components(s).every(Number.isFinite));
      if(i) {
        const nextSpeed=distance(s.root.position,previous.root.position)*240;
        assert.ok(nextSpeed<=speed+1e-9,'root decelerates monotonically');speed=nextSpeed;
      }
      for(const [f,foot] of Object.entries(s.contacts)) {
        assert.ok(foot.reachMargin>.08,`${f}: finite calibrated reach`);
        assert.ok(foot.load>=0&&foot.load<=1);
        if(!initial.contacts[f].contact&&time<initial.contacts[f].swingEnd)
          for(const key of ['paw','yaw','curl','contact','load','stanceId'])assert.deepEqual(foot[key],cruise(time).contacts[f][key]);
        if(foot.contact) {
          assert.equal(foot.paw[2],0);assert.equal(foot.curl,0);
          const key=foot.stanceId,anchor={paw:foot.paw,yaw:foot.yaw};
          if(anchors.has(key))assert.deepEqual(anchor,anchors.get(key),'a loaded support cannot slide or rotate');
          else anchors.set(key,anchor);
        }
      }
      previous=s;
    }
    const stop=arrival.sample(4.9),idle=arrival.sample(5.35),end=arrival.sample(6);
    assert.ok(Math.abs(distance(initial.root.position,stop.root.position)-.333)<1e-12);
    assert.deepEqual(stop.root,end.root);assert.deepEqual(idle.boneMatrices,end.boneMatrices);
    assert.equal(stop.rootSpeed,0);assert.equal(end.rootSpeed,0);assert.equal(idle.motionPhase,'standing-idle');
    assert.ok(Object.values(idle.contacts).every(f=>f.contact&&f.load===1));
  }
});

test('all contact event boundaries are pose-continuous and inputs/samples cannot corrupt the prepared entry',()=>{
  for(const turn of [-Math.PI/12,Math.PI/12]) {
    const {cruise,arrival}=prepare(turn),initial=cruise(4);
    const events=[4.4,4.9,5.1,5.25,...Object.values(initial.contacts).flatMap(f=>[f.swingEnd,f.nextSwingStart,f.nextSwingStart+(f.stanceId.startsWith('fore')?.27:.255)])].filter(t=>t>4&&t<6);
    for(const t of events) {
      const a=components(arrival.sample(t-1e-7)),b=components(arrival.sample(t)),c=components(arrival.sample(t+1e-7));
      for(let i=0;i<b.length;i++)assert.ok(Math.abs(b[i]-a[i])<2e-5&&Math.abs(c[i]-b[i])<2e-5,`${t}/${i}`);
    }
    const times=[4,4.02,4.137,4.47,4.9,5.25,6,4.47,4],expected=times.map(t=>arrival.sample(t));
    for(let i=times.length-1;i>=0;i--)assert.deepEqual(arrival.sample(times[i]),expected[i]);
    const changed=arrival.sample(4.47);changed.root.position[0]=900;changed.boneMatrices.head[0][0]=500;changed.contacts.foreNear.paw[0]=300;
    assert.deepEqual(arrival.sample(4.47),expected[3]);
    const c=structuredClone(calibration),independent=prepareMikaArrival(c,cruise),saved=independent.sample(5.5);c.gait.lower=99;c.neutralPaws.foreNear[0]=99;
    assert.deepEqual(independent.sample(5.5),saved);
  }
});

test('unsupported times, retimed or still-turning terminal continuations and mismatched seam poses fail closed',()=>{
  const {cruise,arrival}=prepare();
  for(const t of [3.999,6.001,NaN,Infinity,-Infinity,'4',null])assert.throws(()=>arrival.sample(t),/INVALID_MIKA_ARRIVAL_TIME/);
  for(const mutate of [
    (s,t)=>{if(t>4)s.root.heading+=.001;},
    (s,t)=>{if(t>4)s.root.position[0]+=.001;},
    (s,t)=>{if(t===4)s.boneMatrices.head[0][3]+=.001;},
    (s,t)=>{if(t===4)s.contacts.foreNear.nextSwingStart=9;},
  ])assert.throws(()=>prepareMikaArrival(calibration,t=>{const s=cruise(t);mutate(s,t);return s;}),/UNQUALIFIED_MIKA_ARRIVAL_CONTINUATION/);
});

async function native() {
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const driver=createMikaNativePoseDriver(THREE,gltf,calibration),bones=[];
  gltf.scene.traverse(o=>{if(o.isBone)bones.push(o);});
  return {driver,bones};
}
const nativeTransforms=({driver,bones})=>[driver.root,...bones].map(o=>({position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),matrix:o.matrixWorld.toArray()}));
test('the actual P2 GLB repeats, scrubs and recreates all transforms without accumulated scales',async()=>{
  const a=await native(),b=await native();
  for(const turn of [-Math.PI/12,Math.PI/12]) {
    const {arrival}=prepare(turn,.7),times=[4,4.037,4.15,4.37,4.73,4.9,5.15,5.35,6];
    const saved=times.map(t=>{a.driver.apply(arrival.sample(t));return nativeTransforms(a);});
    for(const i of [8,0,5,2,5,6,1,3,8,4,0]) {
      a.driver.apply(arrival.sample(times[i]));b.driver.apply(arrival.sample(times[i]));
      assert.deepEqual(nativeTransforms(a),saved[i]);assert.deepEqual(nativeTransforms(b),saved[i]);
      for(const bone of a.bones)for(const value of bone.scale.toArray())assert.ok(Math.abs(value-1)<1e-6);
    }
  }
});

test('evaluated native paw skin stays planted and every skin vertex remains in the body envelope',async()=>{
  const {driver}=await native(),v=new THREE.Vector3(),C=new THREE.Matrix4().makeRotationX(Math.PI/2);
  const pawVertices=Object.fromEntries(calibration.phaseOrder.map(f=>[f,[]]));
  for(const mesh of driver.skinned) {
    const joints=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    for(let i=0;i<joints.count;i++)for(let k=0;k<4;k++)if(weights.getComponent(i,k)>1-1e-7) {
      const bone=mesh.skeleton.bones[joints.getComponent(i,k)];
      for(const f of calibration.phaseOrder)if(bone.name===`${f}_paw`)pawVertices[f].push({mesh,index:i});
    }
  }
  for(const rows of Object.values(pawVertices))assert.ok(rows.length>0,'P2 contains rigid paw vertices');
  for(const turn of [-Math.PI/12,Math.PI/12]) {
    const {arrival}=prepare(turn,.7),locked=new Map();
    for(let i=0;i<=60;i++) {
      const sample=arrival.sample(4+i/30);driver.apply(sample);
      for(const [f,foot] of Object.entries(sample.contacts))if(foot.contact) {
        const vertices=pawVertices[f].map(({mesh,index})=>mesh.getVertexPosition(index,v).applyMatrix4(mesh.matrixWorld).toArray());
        if(locked.has(foot.stanceId))vertices.forEach((p,j)=>assert.ok(distance(p,locked.get(foot.stanceId)[j])<1e-6));
        else locked.set(foot.stanceId,vertices);
      }
      if(i%10===0) {
        const box=boundMikaPose(sample,envelope);
        const inverseRoot=new THREE.Matrix4().makeRotationZ(-sample.root.heading).multiply(new THREE.Matrix4().makeTranslation(...sample.root.position.map(x=>-x)));
        for(const mesh of driver.skinned)for(let j=0;j<mesh.geometry.attributes.position.count;j++) {
          mesh.getVertexPosition(j,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(C).applyMatrix4(inverseRoot);
          for(let k=0;k<3;k++)assert.ok(v.getComponent(k)>=box.min[k]&&v.getComponent(k)<=box.max[k]);
        }
      }
    }
  }
});
