import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js';
import {GLTFLoader} from '../src/games/companion-yard-v2/pip-prototype/vendor/three/addons/loaders/GLTFLoader.js';
import {createAdaptivePoseDriver} from '../src/games/companion-yard-v2/pip-prototype/prototype/adaptive-pose-driver.mjs';
import {makeRoute,sampleRoute} from '../src/games/companion-yard-v2/pip-prototype/routes.mjs';

// Frozen original-driver first applies protect approved geometry and authored
// nonuniform scale. The repeated/order tests use real GLTF bones and vertices.
const base=new URL('../src/games/companion-yard-v2/pip-prototype/',import.meta.url);
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/yard-pip-pose-replay/first-pass.json',import.meta.url)));
const assetURL=name=>new URL(name,base);
const bytes=fs.readFileSync(assetURL('assets/pip.glb'));
const calibrationBytes=fs.readFileSync(assetURL('data/calibration.json'));
const calibration=JSON.parse(calibrationBytes),setup=JSON.parse(fs.readFileSync(assetURL('data/fixture.json')));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const delta=(a,b)=>{assert.equal(a.length,b.length);let d=0;for(let i=0;i<a.length;i++){assert.ok(Number.isFinite(a[i]));d=Math.max(d,Math.abs(a[i]-b[i]));}return d;};
const near=(a,b,epsilon=1e-10,label='pose')=>assert.ok(delta(a,b)<=epsilon,`${label} delta ${delta(a,b)} > ${epsilon}`);
const sample=id=>structuredClone(fixture.cases.find(c=>c.id===id).sample);
const matrixData=bones=>bones.flatMap(b=>[...b.matrixWorld.elements]);
const localData=objects=>objects.flatMap(b=>[...b.position,...b.quaternion,...b.scale]);
function vertexData(meshes){const out=new Float64Array(meshes.reduce((n,m)=>n+m.geometry.attributes.position.count*3,0)),v=new THREE.Vector3();let j=0;for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);out[j++]=v.x;out[j++]=v.y;out[j++]=v.z;}return out;}
const vertexHash=vertices=>sha(JSON.stringify(Array.from(vertices,v=>Math.round(v*1e9))));
async function actor({framed=false}={}){
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const sourceFrame=framed?new THREE.Group():null;
 if(sourceFrame){sourceFrame.position.set(3,-2,5);sourceFrame.quaternion.setFromEuler(new THREE.Euler(.15,-.3,.2));sourceFrame.scale.setScalar(2);sourceFrame.add(gltf.scene);sourceFrame.updateMatrixWorld(true);}
 const bones=[],meshes=[],names=new Map(),nonBones=[];
 gltf.scene.traverse(o=>{if(o.isBone){bones.push(o);names.set(gltf.parser.json.nodes[gltf.parser.associations.get(o).nodes].name,o);}else nonBones.push(o);if(o.isMesh)meshes.push(o);});
 if(sourceFrame)nonBones.push(sourceFrame);
 const driver=createAdaptivePoseDriver(THREE,gltf,calibration,{unitsPerSource:16,sourceFrame});
 return{gltf,driver,sourceFrame,bones,meshes,names,nonBones,apply(value){driver.apply(value);return matrixData(bones);}};
}
function feetExact(a,value){
 const C=new THREE.Matrix4().makeRotationX(-Math.PI/2);
 for(const[contract,native]of Object.entries(calibration.boneSideMap.contractToNative)){
  const name='foot.'+native,rest=new THREE.Matrix4().set(...calibration.restMatrices[name].flat());
  const actual=new THREE.Vector3(...calibration.feet[native].soleCenterSource).applyMatrix4(rest.invert()).applyMatrix4(a.names.get(name).matrixWorld);
  const p=value.world.feet[contract].position,expected=new THREE.Vector3(p.x,p.y,p.z).divideScalar(16).applyMatrix4(C);
  if(a.sourceFrame)expected.applyMatrix4(a.sourceFrame.matrixWorld);
  near(actual.toArray(),expected.toArray(),1e-10,`${contract} sole target`);
 }
}
function sourceInventory(a){return a.meshes.map(m=>({mesh:m,geometry:m.geometry,material:m.material,skeleton:m.skeleton,
 attributes:Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,sha(Buffer.from(v.array.buffer,v.array.byteOffset,v.array.byteLength))])),
 index:m.geometry.index?sha(Buffer.from(m.geometry.index.array.buffer)):null,materialJSON:JSON.stringify(m.material.toJSON())}));}
function assertInventory(a,before){for(let i=0;i<before.length;i++){const b=before[i],m=a.meshes[i];assert.equal(m,b.mesh);assert.equal(m.geometry,b.geometry);assert.equal(m.material,b.material);assert.equal(m.skeleton,b.skeleton);const now=sourceInventory({meshes:[m]})[0];assert.deepEqual(now.attributes,b.attributes);assert.equal(now.index,b.index);assert.equal(now.materialJSON,b.materialJSON);}}

test('pinned real source identities and 17 original first-pass poses remain exact',async()=>{
 assert.equal(THREE.REVISION,fixture.threeRevision);assert.equal(sha(bytes),fixture.modelSha256);assert.equal(sha(calibrationBytes),fixture.calibrationSha256);assert.equal(calibration.sourceSha256,fixture.sourceSha256);
 for(const item of fixture.cases){const a=await actor();try{const before=sourceInventory(a),nonBones=localData(a.nonBones);a.apply(item.sample);assert.equal(a.bones.length,11);assert.deepEqual(a.bones.map(b=>b.name),item.bones.map(b=>b.name));near(matrixData(a.bones),item.bones.flatMap(b=>b.matrix),0,item.id);
  const vertices=vertexData(a.meshes);assert.equal(vertices.length/3,item.vertexCount);assert.equal(vertexHash(vertices),item.verticesSha256At1e9,item.id+' original mesh appearance');feetExact(a,item.sample);assertInventory(a,before);near(localData(a.nonBones),nonBones,0,'scene transform');
 }finally{a.driver.dispose();}}
});

test('1000 identical walking samples retain every bone and all 64860 vertices without scale clamp',async()=>{
 for(const framed of[false,true]){const a=await actor({framed}),value=sample('original-baseline-serverNow1695');try{
  const source=JSON.stringify(value),before=sourceInventory(a),nonBones=localData(a.nonBones),first=a.apply(value),locals=localData(a.bones),vertices=vertexData(a.meshes);
  assert.ok(a.names.get('hips').scale.toArray().some(v=>Math.abs(v-1)>.001),'Retain legitimate authored nonuniform hip scale');
  for(let i=1;i<=1000;i++){near(a.apply(value),first,0,`repeat ${i}, framed ${framed}`);near(localData(a.bones),locals,0,'local TRS');feetExact(a,value);if([1,2,10,100,1000].includes(i))near(vertexData(a.meshes),vertices,0,'every actual mesh vertex');}
  assert.equal(JSON.stringify(value),source);assertInventory(a,before);near(localData(a.nonBones),nonBones,0,'no frame/root/camera transform reset');
 }finally{a.driver.dispose();}}
});

test('random-access and reverse samples equal fresh loads, including cached identical channels',async()=>{
 for(const framed of[false,true]){
  const expected=[];
  for(const item of fixture.cases){const fresh=await actor({framed});fresh.apply(item.sample);expected.push({bones:matrixData(fresh.bones),vertices:vertexData(fresh.meshes)});fresh.driver.dispose();}
  const a=await actor({framed});try{let seed=0x511ca;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const order=[...fixture.cases.keys()].reverse();for(let i=0;i<60;i++)order.push(random()%fixture.cases.length);
   for(const i of order){const value=fixture.cases[i].sample;near(a.apply(value),expected[i].bones,1e-12,`random ${fixture.cases[i].id}`);near(vertexData(a.meshes),expected[i].vertices,1e-12,'random vertices');feetExact(a,value);}
   const index=0,before=a.apply(fixture.cases[index].sample),seam=a.driver.compareStyleSeam();assert.ok(Number.isFinite(seam));near(a.apply(fixture.cases[index].sample),before,1e-12,'diagnostic sampling must not pollute later pose');
  }finally{a.driver.dispose();}
 }
});

test('phase, foot lift/plant and style-loop boundaries converge with fresh and sequential sampling',async()=>{
 const run=makeRoute(setup,0,0),a=await actor(),boundaries=[420,732.5,1045,run.route.totalMs-625,run.route.totalMs];
 try{for(const t of boundaries){let previous=null;for(const epsilon of[.001,.0001,.00001]){const left=sampleRoute(setup,run,Math.max(0,t-epsilon)),right=sampleRoute(setup,run,t+epsilon);const b=a.apply(left),c=a.apply(right);const d=delta(b,c);assert.ok(d<.0001,`boundary ${t}: ${d}`);if(previous!==null)assert.ok(d<=previous*.2+3e-7,`boundary ${t} must converge`);previous=d;feetExact(a,right);}}
 }finally{a.driver.dispose();}
});

test('recovery preserves its intentional prior pose, anchors feet and finishes at original settle',async()=>{
 const a=await actor({framed:true}),last=sample('inspection-sniff'),recovery={...structuredClone(last),inspection:undefined,poseRecovery:{id:'layout-1',u:0}};
 try{const before=a.apply(last);near(a.apply(recovery),before,1e-10,'recovery start preserves displayed source pose');
  for(const u of[0,.1,.35,.8,1,.5,0,1]){recovery.poseRecovery.u=u;const first=a.apply(recovery),vertices=vertexData(a.meshes);for(let i=0;i<12;i++)near(a.apply(recovery),first,0,'recovery repeat');near(vertexData(a.meshes),vertices,0,'recovery vertices');feetExact(a,recovery);}
  const settled={...structuredClone(recovery),poseRecovery:undefined,settleU:1};const fresh=await actor({framed:true});try{near(matrixData(a.bones),fresh.apply(settled),1e-10,'recovery end');}finally{fresh.driver.dispose();}
  const resumed=sample('original-baseline-serverNow1695'),freshWalk=await actor({framed:true});try{near(a.apply(resumed),freshWalk.apply(resumed),1e-12,'resume original gait');}finally{freshWalk.driver.dispose();}
 }finally{a.driver.dispose();}
});

test('dispose and recreate on the same GLTF does not preserve procedural scale',async()=>{
 const a=await actor(),value=sample('original-baseline-serverNow1695'),first=a.apply(value);a.apply(sample('inspection-sniff'));a.driver.dispose();a.driver.dispose();
 const next=createAdaptivePoseDriver(THREE,a.gltf,calibration,{unitsPerSource:16});try{next.apply(value);near(matrixData(a.bones),first,1e-12,'same GLTF recreate');}finally{next.dispose();}
});
