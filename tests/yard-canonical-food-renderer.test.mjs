import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from '../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js';
import {GLTFLoader} from '../src/games/companion-yard-v2/pip-prototype/vendor/three/addons/loaders/GLTFLoader.js';
import {FOOD_ASSET_R2,canonicalFoodAssetURL,createCalibratedFood,createCanonicalFoodResourceOwner} from '../src/games/companion-yard-v2/pip-prototype/prototype/calibrated-food.mjs';
import {CANONICAL_FOOD_CONTRACT,canonicalFoodCapabilities,selectCanonicalFoodState} from '../game-logic/yard-v2/canonical-food-contract.mjs';
import {LIMITS,COMBINED_KNOWN_CPU_PEAK} from '../src/games/companion-yard-v2/pip-prototype/resources.mjs';

const assetUrl=new URL('../src/games/companion-yard-v2/pip-prototype/assets/food-r2/yard-food-source-r2.glb',import.meta.url);
const readBytes=async()=>{const b=await fs.readFile(assetUrl);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const baseUsage=()=>({rgba:4*1024*1024,knownCPU:COMBINED_KNOWN_CPU_PEAK+1024,estimatedGPU:10*1024*1024});
const resources=()=>createCanonicalFoodResourceOwner({getBaseUsage:baseUsage});
function snapshot(foodId=null) {
  return {yard:{bowls:[{id:'bowl-1',foodId,servings:foodId?4:0,placedAt:1,expiresAt:2,unknown:{preserve:true}},
    {id:'bowl-2',foodId:'bonito_bowl',servings:6,unknown:{preserve:'second'}}],foodInventory:{kibble:1,berry_plate:2,bonito_bowl:3}},
    yardRuntime:{version:1,status:'ready',canonicalPlacements:[],foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true})}};
}
async function create(options={}) {
  return createCalibratedFood(THREE,{enabled:true,descriptor:CANONICAL_FOOD_CONTRACT,
    loader:new GLTFLoader(),loadAssetBytes:readBytes,resourceOwner:resources(),...options});
}
function owned(root) {
  const geometries=new Set(),materials=new Set(),attributes=new Set(),buffers=new Set();let triangles=0;
  root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);triangles+=o.geometry.index.count/3;
    for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
    for(const a of [...Object.values(o.geometry.attributes),o.geometry.index]){attributes.add(a);buffers.add(a.array.buffer);}});
  return {geometries,materials,attributes,buffers,triangles};
}
function visibleCanonicalVertices(root) {
  const points=[];root.updateMatrixWorld(true);
  root.traverseVisible(o=>{if(!o.isMesh)return;const attr=o.geometry.attributes.position;
    for(let i=0;i<attr.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(o.matrixWorld);
      points.push([12*p.x,-12*p.z,12*p.y]);
    }});
  return points;
}

test('ordinary import and disabled factory perform no load or resource admission',async()=>{
  let touched=0;
  const value=await createCalibratedFood(null,{loadAssetBytes(){touched++;},resourceOwner:{reserve(){touched++;}}});
  assert.equal(value,null);assert.equal(touched,0);
  assert.equal(canonicalFoodAssetURL().href,assetUrl.href);assert.throws(()=>canonicalFoodAssetURL('historical-bowl'),/identity/);
});

test('actual pinned GLB parses once into measured deduplicated buffers and initially hidden variants',async()=>{
  const bytes=await readBytes(),data=new DataView(bytes),jsonLength=data.getUint32(12,true);
  assert.equal(crypto.createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),FOOD_ASSET_R2.sha256);
  const source=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonLength)));
  const resourceOwner=resources(),owner=await create({resourceOwner});
  try {
    const actual=owned(owner.root),views=source.bufferViews.reduce((n,row)=>n+row.byteLength,0);
    assert.equal(source.meshes.length,6);assert.equal(actual.geometries.size,11);assert.equal(actual.materials.size,10);
    assert.equal(actual.triangles,13190);assert.equal(actual.buffers.size,32);assert.equal(actual.attributes.size,32);
    assert.equal([...actual.buffers].reduce((n,b)=>n+b.byteLength,0),views);
    assert.equal(owner.resources.knownCPUBufferPeakBytes,bytes.byteLength+source.buffers[0].byteLength+views+36);
    assert.equal(owner.resources.geometryGPUBufferBytes,[...actual.attributes].reduce((n,a)=>n+a.array.byteLength,0));
    assert.equal(owner.resources.contextRestoreGPUBufferPeakBytes,2*views);
    assert.equal(owner.resources.uniqueCPUBufferCount,34);
    assert.equal(owner.root.visible,false);assert.ok(owner.root.children.every(o=>!o.visible));
    assert.equal(visibleCanonicalVertices(owner.root).length,0);
    assert.deepEqual(owner.root.position.toArray(),[80/12,0,-82/12]);assert.deepEqual(owner.root.scale.toArray(),[1,1,1]);
    assert.equal(owner.resources.imageTextureBytes,0);assert.equal(owner.resources.rgbaSurfaceBytes,0);
    const strawberry=owner.root.getObjectByName('StrawberriesAndBlueberries');
    assert.strictEqual(strawberry.children[0].geometry.index,strawberry.children[1].geometry.index,'one shared index, never charged or copied twice');
    for(const m of actual.materials)assert.ok(!Object.values(m).some(v=>v?.isTexture));
  }finally{owner.dispose();}
  assert.equal(resourceOwner.snapshot().loadingOrLiveOwners,0);assert.equal(resourceOwner.snapshot().retiredOwners,0);
});

test('four snapshot states show one vessel, preserve source shapes, axes, unique economy and buffer identity',async()=>{
  const owner=await create(),original=owned(owner.root),expected={empty:['BowlVessel'],kibble:['BowlVessel','KibbleContents'],
    berry_plate:['BerryPlateVessel','BerryContents'],bonito_bowl:['BowlVessel','BonitoContents']};
  const beforeGeometry=new Map([...original.attributes].map(a=>[a,crypto.createHash('sha256').update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex')]));
  try {
    for(const state of ['empty','kibble','berry_plate','bonito_bowl','empty']){
      const current=snapshot(state==='empty'?null:state),before=JSON.stringify(current);
      assert.equal(selectCanonicalFoodState(current).available,true,'test snapshot passes actual domain authority/placement checks');
      assert.equal(owner.selectSnapshot(current).state,state);assert.equal(owner.root.visible,true);
      assert.deepEqual(owner.diagnostics.visibleGroups,expected[state]);
      assert.equal(owner.root.children.filter(g=>g.visible&&g.name.endsWith('Vessel')).length,1);
      assert.equal(JSON.stringify(current),before,'snapshot including bowl-2 and shared food stock unchanged');
      const points=visibleCanonicalVertices(owner.root),min=points.reduce((a,p)=>a.map((v,i)=>Math.min(v,p[i])),[Infinity,Infinity,Infinity]);
      const max=points.reduce((a,p)=>a.map((v,i)=>Math.max(v,p[i])),[-Infinity,-Infinity,-Infinity]);
      assert.ok(Math.abs(min[2])<1e-7,'vessel support remains on canonical z=0');
      assert.ok(min[0]>=80-3.843&&max[0]<=80+3.843&&min[1]>=82-3.843&&max[1]<=82+3.843);
      assert.ok(max[2]<=2.09);if(state==='bonito_bowl')assert.ok(max[2]>2.0889,'R2 mound, not R1 low fill');
      if(state==='berry_plate')assert.ok(max[0]>83.84&&min[0]<76.16,'plate wider than bowl');
      if(state==='kibble'){
        const kibble=owner.root.getObjectByName('KibbleContents'),box=new THREE.Box3().setFromObject(kibble);
        assert.ok(Math.abs(12*box.min.x-(80-2.4240732192993164))<1e-6);
        assert.ok(Math.abs(-12*box.max.z-(82-2.367284595966339))<1e-6,'canonical +Y is glTF -Z');
      }
    }
    for(let i=0;i<30;i++)owner.selectSnapshot(snapshot(i%2?'kibble':'berry_plate'));
    const after=owned(owner.root);assert.deepEqual(after.attributes,original.attributes);assert.deepEqual(after.materials,original.materials);
    for(const [a,hash] of beforeGeometry)assert.equal(crypto.createHash('sha256').update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex'),hash);
    assert.equal(owner.diagnostics.loads,1);
  }finally{owner.dispose();}
});

test('missing/duplicate/unsupported/invalid bowls hide the prior state without altering saved data',async()=>{
  const owner=await create();
  try {
    const variants=[s=>delete s.yard.bowls,s=>s.yard.bowls.shift(),s=>s.yard.bowls.push({...s.yard.bowls[0]}),
      s=>s.yard.bowls[0].foodId='future_food',s=>s.yard.bowls[0].servings=-1,s=>s.yard.bowls[0].servings=NaN];
    for(const mutate of variants){owner.selectSnapshot(snapshot('kibble'));const next=snapshot('bonito_bowl');mutate(next);const before=structuredClone(next);
      const result=owner.selectSnapshot(next);assert.equal(result.available,false);assert.equal(owner.root.visible,false);
      assert.equal(owner.diagnostics.visibleGroups.length,0);assert.deepEqual(next,before);}
  }finally{owner.dispose();}
});

test('descriptor, exact length and hash failures refuse parsing and unwind reservations',async()=>{
  const resourceOwner=resources();let parsed=0,loads=0;
  const loader={parseAsync(){parsed++;throw Error('must not parse');}},loadAssetBytes=async()=>{loads++;return readBytes();};
  for(const descriptor of [{...CANONICAL_FOOD_CONTRACT,canonicalUnitsPerSource:16},
    {...CANONICAL_FOOD_CONTRACT,geometryRevision:'pip-garden-t2-r1'},
    {...CANONICAL_FOOD_CONTRACT,unionHeightCanonical:1.841},
    {...CANONICAL_FOOD_CONTRACT,anchorCanonicalXYZ:[25,83,0]},
    {...CANONICAL_FOOD_CONTRACT,assetSha256:'0'.repeat(64)}]){
    await assert.rejects(create({descriptor,loader,loadAssetBytes,resourceOwner}),/descriptor/);
  }
  assert.equal(loads,0);
  await assert.rejects(create({loader,resourceOwner,loadAssetBytes:async()=>new ArrayBuffer(20)}),/byte identity/);
  const wrong=await readBytes();new Uint8Array(wrong)[wrong.byteLength-1]^=1;
  await assert.rejects(create({loader,resourceOwner,loadAssetBytes:async()=>wrong}),/hash mismatch/);
  assert.equal(parsed,0);assert.equal(resourceOwner.snapshot().loadingOrLiveOwners,0);
});

test('disabled authority or an occupied saved socket clears visible food without moving the saved pot',async()=>{
  const owner=await create();
  try {
    for(const mutate of [s=>s.yardRuntime.foodLocationCapabilities.enabled=false,s=>delete s.yardRuntime.foodLocationCapabilities,
      s=>s.yardRuntime.canonicalPlacements.push({...s.yardRuntime.foodLocationCapabilities.storageLocation,
        slotId:'canonical:existing-pot',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:80,y:82,condition:'new',uses:0,placedAt:1})]){
      assert.equal(owner.selectSnapshot(snapshot('kibble')).available,true);const current=snapshot('berry_plate');mutate(current);const before=structuredClone(current);
      assert.equal(owner.selectSnapshot(current).available,false);assert.equal(owner.root.visible,false);assert.deepEqual(current,before);
    }
  }finally{owner.dispose();}
});

test('actual late parse cancellation and loaded validation failure dispose every unique resource once',async()=>{
  for(const kind of ['abort','structure']){
    const controller=new AbortController(),resourceOwner=resources(),disposed={geometry:0,material:0};let parsed;
    const loader={async parseAsync(...args){
      parsed=await new GLTFLoader().parseAsync(...args);const actual=owned(parsed.scene);
      for(const g of actual.geometries)g.addEventListener('dispose',()=>disposed.geometry++);
      for(const m of actual.materials)m.addEventListener('dispose',()=>disposed.material++);
      if(kind==='abort')controller.abort();else parsed.scene.children[0].name='UnexpectedVessel';return parsed;
    }};
    await assert.rejects(create({loader,signal:controller.signal,resourceOwner}),kind==='abort'?{name:'AbortError'}:/source structure/);
    assert.deepEqual(disposed,{geometry:11,material:10});assert.equal(parsed.scene.children.length,0);
    assert.equal(resourceOwner.snapshot().loadingOrLiveOwners,0);assert.equal(resourceOwner.snapshot().retiredOwners,0);
  }
});

test('context loss/restore requalifies current snapshot with the same buffers and no visible variants while lost',async()=>{
  const owner=await create(),before=owned(owner.root);
  try {
    owner.selectSnapshot(snapshot('kibble'));assert.equal(owner.contextLost(),true);assert.equal(owner.root.visible,false);
    assert.equal(owner.contextLost(),false);assert.equal(owner.selectSnapshot(snapshot('berry_plate')).available,false);
    assert.equal(owner.root.visible,false);assert.equal(owner.contextRestored(snapshot('bonito_bowl')).state,'bonito_bowl');
    assert.deepEqual(owned(owner.root).attributes,before.attributes);assert.equal(owner.diagnostics.loads,1);
    owner.contextLost();assert.equal(owner.contextRestored(undefined).available,false);assert.equal(owner.root.visible,false);
  }finally{owner.dispose();owner.dispose();}
  assert.equal(owner.diagnostics.disposals,1);assert.equal(owner.contextLost(),false);assert.equal(owner.contextRestored(snapshot()),false);
  assert.equal(owner.selectSnapshot(snapshot()).reason,'FOOD_OWNER_DISPOSED');
});

test('abort after ready retires unexposed or attached owners before stale snapshots can expose them',async()=>{
  for(const exposed of [false,true]){
    const controller=new AbortController(),resourceOwner=resources(),owner=await create({resourceOwner,signal:controller.signal});
    const originalRoot=owner.root,actual=owned(originalRoot),disposed={geometry:0,material:0},host=new THREE.Scene();
    for(const g of actual.geometries)g.addEventListener('dispose',()=>disposed.geometry++);
    for(const m of actual.materials)m.addEventListener('dispose',()=>disposed.material++);
    if(exposed){host.add(owner.root);assert.equal(owner.selectSnapshot(snapshot('kibble')).available,true);}
    controller.abort();controller.abort();owner.dispose();
    assert.equal(owner.diagnostics.disposed,true);assert.equal(owner.diagnostics.disposals,1);
    assert.equal(originalRoot.visible,false);assert.equal(originalRoot.children.length,0);assert.equal(host.children.length,0);
    assert.equal(owner.selectSnapshot(snapshot('berry_plate')).reason,'FOOD_OWNER_DISPOSED');
    assert.deepEqual(disposed,{geometry:11,material:10});assert.equal(resourceOwner.snapshot().loadingOrLiveOwners,0);
    assert.equal(resourceOwner.snapshot().retiredOwners,exposed?1:0);resourceOwner.releaseRetiredAfterRendererDisposal();
  }
});

test('shared caps charge old/new owners and context overlap; disposal retains pending GPU until renderer retirement',async()=>{
  const resourceOwner=resources(),first=await create({resourceOwner}),second=await create({resourceOwner});
  let thirdLoaded=false;
  try {
    const base=baseUsage(),u=resourceOwner.snapshot();
    assert.equal(u.total.knownCPU,base.knownCPU+2*FOOD_ASSET_R2.knownCPUBufferPeakBytes);
    assert.equal(u.total.estimatedGPU,base.estimatedGPU+4*FOOD_ASSET_R2.geometryGPUBufferBytes);
    assert.equal(u.total.rgba,base.rgba);assert.ok(u.total.knownCPU<=LIMITS.knownCPU);
    await assert.rejects(create({resourceOwner,loadAssetBytes:async()=>{thirdLoaded=true;return readBytes();}}),/resource cap/);assert.equal(thirdLoaded,false);
    assert.equal(first.selectSnapshot(snapshot('kibble')).available,true);
    assert.equal(second.selectSnapshot(snapshot('berry_plate')).reason,'FOOD_OWNER_ALREADY_VISIBLE');
    assert.equal(second.root.visible,false);first.hide();assert.equal(second.selectSnapshot(snapshot('berry_plate')).available,true);
    const actual=owned(second.root),disposed={geometry:0,material:0};
    for(const g of actual.geometries)g.addEventListener('dispose',()=>disposed.geometry++);
    for(const m of actual.materials)m.addEventListener('dispose',()=>disposed.material++);
    first.dispose();second.dispose();second.dispose();assert.deepEqual(disposed,{geometry:11,material:10});
    const retired=resourceOwner.snapshot();assert.equal(retired.loadingOrLiveOwners,0);assert.equal(retired.retiredOwners,2);
    assert.equal(retired.total.knownCPU,base.knownCPU);assert.equal(retired.total.estimatedGPU,u.total.estimatedGPU);
    resourceOwner.releaseRetiredAfterRendererDisposal();assert.deepEqual(resourceOwner.snapshot().total,base);
  }finally{first.dispose();second.dispose();resourceOwner.releaseRetiredAfterRendererDisposal();}
});

test('current host cap changes block context restoration and all fixed caps remain unchanged',async()=>{
  let base=baseUsage();const resourceOwner=createCanonicalFoodResourceOwner({getBaseUsage:()=>base}),owner=await create({resourceOwner});
  try{
    assert.deepEqual(resourceOwner.snapshot().limits,{rgba:64*1024*1024,knownCPU:16*1024*1024,estimatedGPU:12*1024*1024});
    owner.selectSnapshot(snapshot('kibble'));owner.contextLost();base={...base,estimatedGPU:LIMITS.estimatedGPU};
    assert.throws(()=>owner.contextRestored(snapshot('kibble')),/resource cap/);assert.equal(owner.root.visible,false);assert.equal(owner.diagnostics.contextLost,true);
    base=baseUsage();assert.equal(owner.contextRestored(snapshot('kibble')).available,true);
  }finally{owner.dispose();resourceOwner.releaseRetiredAfterRendererDisposal();}
});

test('every global cap and malformed accounting refuse asset allocation before load',async()=>{
  for(const base of [{rgba:LIMITS.rgba+1,knownCPU:0,estimatedGPU:0},
    {rgba:0,knownCPU:LIMITS.knownCPU,estimatedGPU:0},{rgba:0,knownCPU:0,estimatedGPU:LIMITS.estimatedGPU},
    {rgba:0,knownCPU:NaN,estimatedGPU:0}]){
    let loaded=false;const resourceOwner=createCanonicalFoodResourceOwner({getBaseUsage:()=>base});
    await assert.rejects(create({resourceOwner,loadAssetBytes:async()=>{loaded=true;return readBytes();}}),/resource cap|host resource/);
    assert.equal(loaded,false);
  }
});
