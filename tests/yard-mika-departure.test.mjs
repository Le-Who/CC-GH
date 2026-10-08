import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import calibration from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type:'json'};
import envelope from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type:'json'};
import {createMikaLocomotionRoute,sampleMikaLocomotion} from '../src/games/companion-yard-v2/mika-qa/mika-locomotion.mjs';
import {prepareMikaArrival} from '../src/games/companion-yard-v2/mika-qa/mika-arrival.mjs';
import {prepareMikaDeparture} from '../src/games/companion-yard-v2/mika-qa/mika-departure.mjs';
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
function prepare(turn=-Math.PI/12,heading=0,mirrorPhase=turn>0) {
  const incoming=createMikaLocomotionRoute(incomingPath(turn,heading),calibration,{mirrorPhase:turn>0,activeEnd:4.5});
  const arrival=prepareMikaArrival(calibration,t=>sampleMikaLocomotion(incoming,calibration,t)),initial=arrival.sample(6),h=initial.root.heading;
  const rootAt=t=>({position:[initial.root.position[0]+.74*(t+2-.45)*Math.cos(h),initial.root.position[1]+.74*(t+2-.45)*Math.sin(h),0],heading:h});
  const route=createMikaLocomotionRoute(rootAt,calibration,{mirrorPhase,historyStart:-4,activeStart:-2,activeEnd:4.5});
  const cruise=t=>sampleMikaLocomotion(route,calibration,t),departure=prepareMikaDeparture(calibration,initial,cruise);
  return {arrival,initial,cruise,departure};
}

test('departure leaves both accepted source modules and the constant-speed cruise guard unchanged',()=>{
  for(const [name,hash] of [
    ['mika-locomotion.mjs','0fd31ac97bebd1aaa55f682efb598190a3b36ea189b71f55b15948f2ee7465d2'],
    ['mika-arrival.mjs','7ceccd5a9abdd195b02f89d6bb8fe9f35436dd736dcfe928c2823a8154be79af'],
  ])assert.equal(createHash('sha256').update(readFileSync(new URL(`../src/games/companion-yard-v2/mika-qa/${name}`,import.meta.url))).digest('hex'),hash);
  assert.throws(()=>createMikaLocomotionRoute(t=>({position:[.7*t,0,0],heading:0}),calibration),/UNQUALIFIED_ROOT_SPEED/);
});

test('exact stopped and outgoing seams preserve every root, body, bone and paw transform plus velocity',()=>{
  const eps=1e-5;
  for(const turn of [-Math.PI/12,Math.PI/12])for(const heading of [0,.7,Math.PI/2,Math.PI,-3*Math.PI/4]) {
    const {initial,cruise,departure}=prepare(turn,heading);
    assert.equal(departure.durationSeconds,2);
    assert.deepEqual(departure.sample(0),initial);assert.deepEqual(departure.sample(2),cruise(0));
    const a=components(initial),b=components(departure.sample(eps));
    for(let i=0;i<a.length;i++)assert.ok(Math.abs(b[i]-a[i])/eps<1e-6,`stationary start ${i}`);
    const before=components(departure.sample(2-eps)),join=components(departure.sample(2)),after=components(cruise(eps));
    for(let i=0;i<join.length;i++) {
      assert.ok(Math.abs(join[i]-before[i])<.0002,`outgoing seam ${i}`);
      assert.ok(Math.abs((join[i]-before[i])/eps-(after[i]-join[i])/eps)<.05,`outgoing velocity ${i}`);
    }
    assert.ok(distance(initial.root.position,departure.sample(eps).root.position)/eps<1e-8);
    assert.ok(Math.abs(distance(departure.sample(2-eps).root.position,cruise(0).root.position)/eps-.74)<1e-8);
    for(const f of calibration.phaseOrder) {
      assert.deepEqual(departure.sample(0).contacts[f],initial.contacts[f]);
      assert.deepEqual(departure.sample(2).contacts[f],cruise(0).contacts[f]);
    }
  }
});

test('non-neutral stopped paws remain locked until their own release, then join only after a real touchdown',()=>{
  for(const turn of [-Math.PI/12,Math.PI/12])for(const mirrorPhase of [false,true])for(const heading of [0,.7,Math.PI/2]) {
    const {initial,cruise,departure}=prepare(turn,heading,mirrorPhase),first=cruise(-2),anchors=new Map();
    const nonNeutral=calibration.phaseOrder.filter(f=>{
      const offset=rotate(calibration.neutralPaws[f],initial.root.heading),neutral=initial.root.position.map((v,i)=>v+offset[i]);
      return distance(initial.contacts[f].paw,neutral)>.001;
    });
    assert.ok(nonNeutral.length>0,'fixture must include an actual retained arrival support');
    let previous=initial,speed=0;
    for(let i=0;i<=500;i++) {
      const time=i/250,s=departure.sample(time),canonical=cruise(time-2);
      assert.equal(Object.keys(s.boneMatrices).length,22);assert.ok(components(s).every(Number.isFinite));
      assert.deepEqual(s.reachFailures,[]);assert.equal(s.root.heading,initial.root.heading);
      if(i) {
        const nextSpeed=distance(s.root.position,previous.root.position)*250;
        assert.ok(nextSpeed+1e-9>=speed,'root accelerates monotonically');assert.ok(nextSpeed<=.74+1e-9);speed=nextSpeed;
      }
      for(const [f,foot] of Object.entries(s.contacts)) {
        const start=first.contacts[f].nextSwingStart+2,end=start+calibration.gait.swingSeconds[calibration.limbs[f].family];
        assert.ok(foot.reachMargin>.04,`${f}: calibrated reach`);assert.ok(foot.load>=-1e-12&&foot.load<=1+1e-12);
        if(time<start) {assert.equal(foot.contact,true);assert.deepEqual(foot.paw,initial.contacts[f].paw);assert.equal(foot.yaw,initial.contacts[f].yaw);}
        if(time>start&&time<end)assert.equal(foot.contact,false);
        if(time>=end)for(const key of ['paw','yaw','curl','contact','load','stanceId'])assert.deepEqual(foot[key],canonical.contacts[f][key]);
        if(foot.contact) {
          const anchor={paw:foot.paw,yaw:foot.yaw};
          if(anchors.has(foot.stanceId))assert.deepEqual(anchor,anchors.get(foot.stanceId),'a support cannot teleport, slide or rotate');
          else anchors.set(foot.stanceId,anchor);
        }
      }
      previous=s;
    }
    assert.ok(Math.abs(distance(initial.root.position,departure.sample(2).root.position)-1.147)<1e-12);
    assert.equal(departure.sample(.9).rootSpeed,.74);assert.equal(departure.sample(.001).motionPhase,'departing');
  }
});

test('release, touchdown, acceleration and canonical handover boundaries are pose-continuous',()=>{
  for(const turn of [-Math.PI/12,Math.PI/12]) {
    const {cruise,departure}=prepare(turn),first=cruise(-2);
    const events=[.9,...calibration.phaseOrder.flatMap(f=>{
      const start=first.contacts[f].nextSwingStart+2;
      return [start-calibration.gait.loadRampSeconds,start,start+calibration.gait.swingSeconds[calibration.limbs[f].family]];
    })];
    for(const t of events) {
      const a=components(departure.sample(t-1e-7)),b=components(departure.sample(t)),c=components(departure.sample(t+1e-7));
      for(let i=0;i<b.length;i++)assert.ok(Math.abs(b[i]-a[i])<2e-5&&Math.abs(c[i]-b[i])<2e-5,`${t}/${i}`);
    }
  }
});

test('repeated times, scrubbing, preparation and returned-data mutation do not change departure',()=>{
  const {initial,cruise,departure}=prepare(),times=[0,.04,.137,.3,.7,.85,1.105,1.7,2];
  const expected=times.map(t=>departure.sample(t)),fresh=prepareMikaDeparture(calibration,initial,cruise);
  for(const i of [8,0,4,3,7,4,1,6,2,8,0,5]) {
    assert.deepEqual(departure.sample(times[i]),expected[i]);assert.deepEqual(fresh.sample(times[i]),expected[i]);
  }
  const modified=departure.sample(.3);modified.root.position[0]=100;modified.contacts.foreNear.paw[0]=200;modified.boneMatrices.head[0][0]=300;
  assert.deepEqual(departure.sample(.3),expected[3]);
  const c=structuredClone(calibration),s=structuredClone(initial),independent=prepareMikaDeparture(c,s,cruise);
  c.gait.lower=99;s.contacts.foreNear.paw[0]=99;s.boneMatrices.head[0][0]=99;s.root.position[0]=99;
  assert.deepEqual(independent.sample(.3),expected[3]);assert.deepEqual(independent.sample(0),initial);
});

test('moving or unqualified starts, altered poses, wrong roots/headings and insufficient release ramps fail closed',()=>{
  const {initial,cruise,departure}=prepare();
  for(const time of [-.001,2.001,NaN,Infinity,'0',null])assert.throws(()=>departure.sample(time),/INVALID_MIKA_DEPARTURE_TIME/);
  for(const mutate of [
    s=>{s.rootSpeed=.1;},s=>{s.motionPhase='arrival';},s=>{s.time=4;},s=>{s.root.position[2]=.1;},
    s=>{s.contacts.foreNear.contact=false;},s=>{s.contacts.foreNear.load=.9;},s=>{s.contacts.foreNear.paw[0]+=.2;},
    s=>{s.contacts.foreNear.curl=.01;},s=>{s.contacts.foreNear.nextSwingStart=7;},s=>{s.boneMatrices.head[0][0]+=.01;},
    s=>{delete s.boneMatrices.tail_2;},
  ]) {const s=structuredClone(initial);mutate(s);assert.throws(()=>prepareMikaDeparture(calibration,s,cruise),/UNQUALIFIED_MIKA_DEPARTURE/);}
  for(const mutate of [
    s=>{s.root.heading+=.01;},s=>{s.root.position[0]+=.01;},s=>{s.time+=.01;},s=>{s.boneMatrices.head[0][0]+=.01;},
  ])assert.throws(()=>prepareMikaDeparture(calibration,initial,t=>{const s=cruise(t);mutate(s);return s;}),/UNQUALIFIED_MIKA_DEPARTURE/);
  // Root/heading alone cannot authorize snapping an already releasing paw.
  assert.throws(()=>prepareMikaDeparture(calibration,initial,t=>{
    const s=cruise(t);if(t===-2)s.contacts.foreNear.nextSwingStart=-1.99;return s;
  }),/UNQUALIFIED_MIKA_DEPARTURE/);
});

async function native() {
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const driver=createMikaNativePoseDriver(THREE,gltf,calibration),bones=[];
  gltf.scene.traverse(o=>{if(o.isBone)bones.push(o);});return {driver,bones};
}
const transforms=({driver,bones})=>[driver.root,...bones].map(o=>({position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),matrix:o.matrixWorld.toArray()}));
test('real GLB repeats, scrubs and starts fresh with identical all-bone matrices and no scale accumulation',async()=>{
  const a=await native(),b=await native();
  for(const turn of [-Math.PI/12,Math.PI/12]) {
    const {initial,cruise,departure}=prepare(turn,.7),times=[0,.04,.16,.3,.62,.85,.9,1.105,1.7,2];
    a.driver.apply(initial);const idle=transforms(a);a.driver.apply(departure.sample(0));assert.deepEqual(transforms(a),idle);
    const saved=times.map(t=>{a.driver.apply(departure.sample(t));return transforms(a);});
    for(const i of [9,0,5,2,5,7,1,3,9,4,0]) {
      a.driver.apply(departure.sample(times[i]));b.driver.apply(departure.sample(times[i]));
      assert.deepEqual(transforms(a),saved[i]);assert.deepEqual(transforms(b),saved[i]);
      for(const bone of a.bones)for(const value of bone.scale.toArray())assert.ok(Math.abs(value-1)<1e-6);
    }
    a.driver.apply(departure.sample(2));b.driver.apply(cruise(0));assert.deepEqual(transforms(a),transforms(b));
  }
});

test('actual paw skin stays locked from stopped pose through release and every native vertex stays in its envelope',async()=>{
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
  for(const turn of [-Math.PI/12,Math.PI/12]) {
    const {departure}=prepare(turn,.7),locked=new Map();
    for(let i=0;i<=80;i++) {
      const s=departure.sample(i/40);driver.apply(s);
      for(const [f,foot] of Object.entries(s.contacts))if(foot.contact) {
        const vertices=paws[f].map(({mesh,index})=>mesh.getVertexPosition(index,v).applyMatrix4(mesh.matrixWorld).toArray());
        if(locked.has(foot.stanceId))vertices.forEach((p,j)=>assert.ok(distance(p,locked.get(foot.stanceId)[j])<1e-6));
        else locked.set(foot.stanceId,vertices);
      }
      if(i%10===0) {
        const box=boundMikaPose(s,envelope),inverseRoot=new THREE.Matrix4().makeRotationZ(-s.root.heading).multiply(new THREE.Matrix4().makeTranslation(...s.root.position.map(x=>-x)));
        for(const mesh of driver.skinned)for(let j=0;j<mesh.geometry.attributes.position.count;j++) {
          mesh.getVertexPosition(j,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(C).applyMatrix4(inverseRoot);
          for(let k=0;k<3;k++)assert.ok(v.getComponent(k)>=box.min[k]&&v.getComponent(k)<=box.max[k]);
        }
      }
    }
  }
});
