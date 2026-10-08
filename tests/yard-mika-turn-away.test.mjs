import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import calibration from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type:'json'};
import envelope from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type:'json'};
import {createMikaLocomotionRoute,sampleMikaLocomotion,solveMikaLocomotionPose} from '../src/games/companion-yard-v2/mika-qa/mika-locomotion.mjs';
import {prepareMikaArrival} from '../src/games/companion-yard-v2/mika-qa/mika-arrival.mjs';
import {prepareMikaDeparture} from '../src/games/companion-yard-v2/mika-qa/mika-departure.mjs';
import {prepareMikaTurnAway} from '../src/games/companion-yard-v2/mika-qa/mika-turn-away.mjs';
import {createMikaNativePoseDriver} from '../src/games/companion-yard-v2/mika-qa/mika-native-pose.mjs';
import {boundMikaPose} from '../src/games/companion-yard-v2/mika-qa/mika-envelope.mjs';
const vendor=new URL('../src/games/companion-yard-v2/pip-prototype/vendor/three/',import.meta.url);
registerHooks({resolve(s,c,n){return n(s==='three'?new URL('build/three.module.js',vendor).href:s,c);}});
const THREE=await import('three'),{GLTFLoader}=await import(new URL('addons/loaders/GLTFLoader.js',vendor));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const components=s=>[...s.root.position,s.root.heading,...Object.values(s.boneMatrices).flat(2)];
const rotate=(p,h)=>[Math.cos(h)*p[0]-Math.sin(h)*p[1],Math.sin(h)*p[0]+Math.cos(h)*p[1],p[2]];
function incomingPath(turn,heading) {
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
function prepare(incomingTurn=-Math.PI/12,turnRadians=Math.PI/2,heading=0) {
  const incoming=createMikaLocomotionRoute(incomingPath(incomingTurn,heading),calibration,{mirrorPhase:incomingTurn>0,activeEnd:4.5});
  const arrival=prepareMikaArrival(calibration,t=>sampleMikaLocomotion(incoming,calibration,t)),initial=arrival.sample(6);
  return {initial,pivot:prepareMikaTurnAway(calibration,initial,turnRadians)};
}
function departureFrom(initial,mirrorPhase) {
  const h=initial.root.heading;
  const rootAt=t=>({position:[initial.root.position[0]+.74*(t+2-.45)*Math.cos(h),initial.root.position[1]+.74*(t+2-.45)*Math.sin(h),0],heading:h});
  const route=createMikaLocomotionRoute(rootAt,calibration,{mirrorPhase,historyStart:-4,activeStart:-2,activeEnd:4.5});
  const cruise=t=>sampleMikaLocomotion(route,calibration,t);
  return {cruise,departure:prepareMikaDeparture(calibration,initial,cruise)};
}

test('both bounded quarter turns preserve the exact initial pose and settle into the exact departure-compatible posture',()=>{
  const eps=1e-5;
  for(const incomingTurn of [-Math.PI/12,Math.PI/12])for(const turnRadians of [-Math.PI/2,Math.PI/2])for(const heading of [0,.7,Math.PI]) {
    const {initial,pivot}=prepare(incomingTurn,turnRadians,heading),end=pivot.sample(pivot.durationSeconds);
    assert.equal(pivot.durationSeconds,5.35);assert.deepEqual(pivot.sample(0),initial);
    assert.deepEqual(end.root.position,initial.root.position);assert.equal(end.root.heading,initial.root.heading+turnRadians);
    assert.equal(end.motionPhase,'standing-idle');assert.equal(end.rootSpeed,0);assert.equal(end.rootYawRate,0);
    const expected=solveMikaLocomotionPose(calibration,{root:end.root,time:end.time,phase:end.phase,contacts:end.contacts,lower:calibration.gait.lower-.022,headPitch:-.04});
    assert.deepEqual(end.boneMatrices,expected.boneMatrices);
    for(const [f,foot] of Object.entries(end.contacts)) {
      const offset=rotate(calibration.neutralPaws[f],end.root.heading);
      assert.deepEqual(foot.paw,end.root.position.map((v,i)=>v+offset[i]));
      assert.equal(foot.contact,true);assert.equal(foot.load,1);assert.equal(foot.curl,0);assert.equal(foot.yaw,end.root.heading);assert.equal(foot.nextSwingStart,null);
    }
    const a=components(initial),b=components(pivot.sample(eps)),c=components(pivot.sample(5.35-eps)),d=components(end);
    for(let i=0;i<a.length;i++){assert.ok(Math.abs(b[i]-a[i])/eps<1e-6);assert.ok(Math.abs(d[i]-c[i])/eps<1e-6);}
    for(const mirror of [false,true]) {
      const {cruise,departure}=departureFrom(end,mirror);
      assert.deepEqual(departure.sample(0),end);assert.deepEqual(departure.sample(2),cruise(0));
      for(let i=0;i<=80;i++)assert.deepEqual(departure.sample(i/40).reachFailures,[]);
    }
  }
});

test('root stays fixed, yaw stays calibrated and loaded paws stay world-locked through dense pivot samples',()=>{
  for(const incomingTurn of [-Math.PI/12,Math.PI/12])for(const turnRadians of [-Math.PI/2,Math.PI/2])for(const heading of [0,.7,Math.PI/2]) {
    const {initial,pivot}=prepare(incomingTurn,turnRadians,heading),anchors=new Map();let previous=initial;
    let nonNeutral=0,swingFrames=0;
    for(const [f,foot] of Object.entries(initial.contacts)) {
      const offset=rotate(calibration.neutralPaws[f],initial.root.heading);
      if(distance(foot.paw,initial.root.position.map((v,i)=>v+offset[i]))>.001)nonNeutral++;
    }
    assert.ok(nonNeutral>0,'the actual retained arrival support must be exercised');
    for(let i=0;i<=642;i++) {
      const s=pivot.sample(i/120);assert.deepEqual(s.root.position,initial.root.position);assert.equal(s.rootSpeed,0);
      assert.deepEqual(s.reachFailures,[]);assert.equal(Object.keys(s.boneMatrices).length,22);assert.ok(components(s).every(Number.isFinite));
      if(i)assert.ok(Math.abs(s.root.heading-previous.root.heading)*120<=calibration.gait.referencePeakYawRate);
      if(s.rootYawRate!==undefined)assert.ok(Math.abs(s.rootYawRate)<=calibration.gait.referencePeakYawRate);
      assert.ok(Object.values(s.contacts).filter(f=>f.contact).length>=2,'at least two grounded supports');
      for(const [f,foot] of Object.entries(s.contacts)) {
        assert.ok(foot.reachMargin>.1,`${f} at ${i/120}`);assert.ok(foot.load>=0&&foot.load<=1);
        if(foot.contact) {
          assert.equal(foot.paw[2],0);assert.equal(foot.curl,0);const anchor={paw:foot.paw,yaw:foot.yaw};
          if(anchors.has(foot.stanceId))assert.deepEqual(anchor,anchors.get(foot.stanceId),'world anchor and orientation must stay fixed');
          else anchors.set(foot.stanceId,anchor);
        }else swingFrames++;
      }
      previous=s;
    }
    assert.ok(swingFrames>0,'heading must be accompanied by real paw steps');
  }
});

test('body lowering, heading and every contact transition are continuous through subframe boundary probes',()=>{
  for(const turnRadians of [-Math.PI/2,Math.PI/2]) {
    const {pivot}=prepare(-Math.PI/12,turnRadians),times=[.24,.4,.7,4.24,4.4,4.44,4.5,5.2];
    for(const f of calibration.phaseOrder) {
      const index=calibration.phaseOrder.indexOf(f),swing=calibration.gait.swingSeconds[calibration.limbs[f].family];
      for(let k=0;k<6;k++) {
        const start=.2+index*.92/4+k*.92;
        for(const t of [start-.105,start,start+swing,start+swing+.105])if(t>0&&t<5.35)times.push(t);
      }
    }
    for(const t of times) {
      const a=components(pivot.sample(t-1e-7)),b=components(pivot.sample(t)),c=components(pivot.sample(t+1e-7));
      for(let i=0;i<b.length;i++)assert.ok(Math.abs(b[i]-a[i])<2e-5&&Math.abs(c[i]-b[i])<2e-5,`${turnRadians}/${t}/${i}`);
    }
  }
});

test('invalid turns, moving starts, wrong poses and out-of-bounds sample times fail closed',()=>{
  const {initial,pivot}=prepare();
  for(const turn of [0,.1,Math.PI,-Math.PI,Infinity,NaN,null,'1.5707963267948966'])assert.throws(()=>prepareMikaTurnAway(calibration,initial,turn),/UNQUALIFIED_MIKA_TURN_AWAY/);
  for(const mutate of [
    s=>{s.rootSpeed=.1;},s=>{s.motionPhase='arrival';},s=>{s.time=4;},s=>{s.contacts.foreNear.contact=false;},
    s=>{s.contacts.foreNear.load=.9;},s=>{s.contacts.foreNear.paw[0]+=.2;},s=>{s.contacts.foreNear.yaw+=.01;},
    s=>{s.contacts.foreNear.nextSwingStart=7;},s=>{s.boneMatrices.head[0][0]+=.01;},s=>{delete s.boneMatrices.tail_2;},
  ]) {const s=structuredClone(initial);mutate(s);assert.throws(()=>prepareMikaTurnAway(calibration,s,Math.PI/2),/UNQUALIFIED_MIKA_TURN_AWAY/);}
  for(const t of [-.001,5.351,NaN,Infinity,null,'0'])assert.throws(()=>pivot.sample(t),/INVALID_MIKA_TURN_AWAY_TIME/);
});

test('repeated times, scrubbing and mutation of input or returned objects do not accumulate transforms',()=>{
  const {initial,pivot}=prepare(),times=[0,.15,.2,.41,.9,1.6,2.4,3.7,4.4,4.825,5.2,5.35],expected=times.map(t=>pivot.sample(t));
  const fresh=prepareMikaTurnAway(calibration,initial,Math.PI/2);
  for(const i of [11,0,7,2,5,1,8,4,2,10,3,9,0,6]){assert.deepEqual(pivot.sample(times[i]),expected[i]);assert.deepEqual(fresh.sample(times[i]),expected[i]);}
  const s=pivot.sample(.41);s.contacts.foreNear.paw[0]=100;s.root.heading=100;s.boneMatrices.head[0][0]=100;assert.deepEqual(pivot.sample(.41),expected[3]);
  const c=structuredClone(calibration),start=structuredClone(initial),independent=prepareMikaTurnAway(c,start,Math.PI/2);
  c.gait.lower=99;start.root.position[0]=99;start.contacts.foreNear.paw[0]=99;assert.deepEqual(independent.sample(.41),expected[3]);
});
async function native() {
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const driver=createMikaNativePoseDriver(THREE,gltf,calibration),bones=[];
  gltf.scene.traverse(o=>{if(o.isBone)bones.push(o);});return {driver,bones};
}
const transforms=({driver,bones})=>[driver.root,...bones].map(o=>({position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),matrix:o.matrixWorld.toArray()}));

test('native P2 models repeat and scrub every changed transform with stable scales, including a fresh instance',async()=>{
  const a=await native(),b=await native();
  for(const turnRadians of [-Math.PI/2,Math.PI/2]) {
    const {initial,pivot}=prepare(-Math.PI/12,turnRadians,.7),times=[0,.17,.4,.9,1.6,2.4,3.7,4.4,4.825,5.35];
    a.driver.apply(initial);const idle=transforms(a);a.driver.apply(pivot.sample(0));assert.deepEqual(transforms(a),idle);
    const saved=times.map(t=>{a.driver.apply(pivot.sample(t));return transforms(a);});
    for(const i of [9,0,5,2,5,7,1,3,9,4,0]) {
      a.driver.apply(pivot.sample(times[i]));b.driver.apply(pivot.sample(times[i]));
      assert.deepEqual(transforms(a),saved[i]);assert.deepEqual(transforms(b),saved[i]);
      for(const bone of a.bones)for(const value of bone.scale.toArray())assert.ok(Math.abs(value-1)<1e-6);
    }
    const end=pivot.sample(5.35),{departure}=departureFrom(end,false);
    a.driver.apply(end);b.driver.apply(departure.sample(0));assert.deepEqual(transforms(a),transforms(b));
  }
});

test('actual planted paw skin remains world-locked during changing heading and all skin vertices stay bounded',async()=>{
  const {driver}=await native(),v=new THREE.Vector3(),C=new THREE.Matrix4().makeRotationX(Math.PI/2);
  const paws=Object.fromEntries(calibration.phaseOrder.map(f=>[f,[]]));
  for(const mesh of driver.skinned) {
    const joints=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    for(let i=0;i<joints.count;i++)for(let k=0;k<4;k++)if(weights.getComponent(i,k)>1-1e-7) {
      const bone=mesh.skeleton.bones[joints.getComponent(i,k)];
      for(const f of calibration.phaseOrder)if(bone.name===`${f}_paw`)paws[f].push({mesh,index:i});
    }
  }
  for(const rows of Object.values(paws))assert.ok(rows.length>0);
  for(const turnRadians of [-Math.PI/2,Math.PI/2]) {
    const {pivot}=prepare(-Math.PI/12,turnRadians,.7),locked=new Map();
    for(let i=0;i<=107;i++) {
      const s=pivot.sample(i/20);driver.apply(s);
      for(const [f,foot] of Object.entries(s.contacts))if(foot.contact) {
        const vertices=paws[f].map(({mesh,index})=>mesh.getVertexPosition(index,v).applyMatrix4(mesh.matrixWorld).toArray());
        if(locked.has(foot.stanceId))vertices.forEach((p,j)=>assert.ok(distance(p,locked.get(foot.stanceId)[j])<1e-6));
        else locked.set(foot.stanceId,vertices);
      }
      if(i%10===0||i===107) {
        const box=boundMikaPose(s,envelope),inverseRoot=new THREE.Matrix4().makeRotationZ(-s.root.heading).multiply(new THREE.Matrix4().makeTranslation(...s.root.position.map(x=>-x)));
        for(const mesh of driver.skinned)for(let j=0;j<mesh.geometry.attributes.position.count;j++) {
          mesh.getVertexPosition(j,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(C).applyMatrix4(inverseRoot);
          for(let k=0;k<3;k++)assert.ok(v.getComponent(k)>=box.min[k]&&v.getComponent(k)<=box.max[k]);
        }
      }
    }
  }
});
