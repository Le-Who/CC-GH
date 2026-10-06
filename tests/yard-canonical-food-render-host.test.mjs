import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {admitPipResources,COMBINED_KNOWN_CPU_PEAK,LIMITS} from '../src/games/companion-yard-v2/pip-prototype/resources.mjs';
import {createCleanProjection} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import {canonicalFoodCapabilities} from '../game-logic/yard-v2/canonical-food-contract.mjs';

// The separate packet resolver reuses unchanged installed source. In a merged
// repository these assets resolve normally beside this test's source imports.
const repo=process.env.YARD_MAIN_ROOT?pathToFileURL(process.env.YARD_MAIN_ROOT+'/'):new URL('../',import.meta.url);
const source=new URL('src/games/companion-yard-v2/pip-prototype/',repo);
const fileBytes=async url=>{const b=await fs.readFile(url);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const fixture=async name=>JSON.parse(await fs.readFile(new URL('data/'+name+'.json',source)));
const snapshot=(foodId='kibble')=>({player:{id:'account-a'},yard:{bowls:[{id:'bowl-1',foodId,servings:foodId?4:0,placedAt:1,expiresAt:2}],foodInventory:{kibble:5}},
  yardRuntime:{version:1,status:'ready',canonicalPlacements:[],foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true})}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function make({enabled=true,loadFood=fileBytes,signal,baseOverride}={}){
  const [calibration,setup,location,fragmentHelper]=await Promise.all([fixture('calibration'),fixture('fixture'),fixture('location'),fs.readFile(new URL('source/pip-rest-coat.glsl',source),'utf8')]);
  const canvas=new EventTarget();canvas.style={};canvas.dataset={};canvas.remove=()=>{canvas.parentNode=null;};
  let scene,api,baseCalls=0,foodLoads=0,rendererDisposed=0,contextsRetired=0;
  const events=[],host={appendChild(c){c.parentNode=this;}};
  const base=()=>{baseCalls++;if(baseOverride)return baseOverride(api.resources);const r=api.resources;return {rgba:32*1024*1024,
    knownCPU:COMBINED_KNOWN_CPU_PEAK+r.boneDataTextureCPUBytesEstimate,
    estimatedGPU:r.geometryGPUBufferBytes+r.boneDataTextureGPUBytesEstimate+r.resizeDrawingBufferPeakEstimatedBytes+r.compositorResizePeakBytesEstimate};};
  api=await createOptionalPipRenderer({enabled:true,canonicalFoodEnabled:enabled,getBaseResourceUsage:base,signal,
    loadCanonicalFoodAssetBytes:(url,abort)=>{foodLoads++;return loadFood(url,abort);},
    actorUnitsPerSource:setup.actor.unitsPerSource,calibration,fragmentHelper,planter:{descriptor:setup.planter,placement:setup.placements[0]},
    loadAssetBytes:()=>fileBytes(new URL('assets/pip.glb',source)),loadPlanterAssetBytes:()=>fileBytes(new URL('assets/planter-t2.glb',source)),
    presentationMode:'direct',directHost:host,canvasFactory:()=>canvas,viewport:createCleanProjection(location,390,648).renderViewport,
    admitResources:admitPipResources,onResources:row=>events.push(row),setupLighting:args=>{scene=args.scene;return()=>{};},
    rendererFactory:()=>({shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},
      dispose(){rendererDisposed++;},forceContextLoss(){contextsRetired++;},render(){throw Error('No rendering is authorized or required by these lifecycle tests');}})});
  return {api,canvas,events,base,get scene(){return scene;},get foodLoads(){return foodLoads;},get baseCalls(){return baseCalls;},
    get rendererDisposed(){return rendererDisposed;},get contextsRetired(){return contextsRetired;},
    foodRoot(){return scene.children.find(o=>o.name==='Canonical food source R2 (one shared bowl-1)');}};
}

test('fixed-off, absent/malformed cap and occupied socket do not load food or allocate its owner',async()=>{
  for(const kind of ['off','absent','malformed','occupied']){
    const e=await make({enabled:kind!=='off'}),s=snapshot();
    try{
      if(kind==='absent')delete s.yardRuntime.foodLocationCapabilities;
      if(kind==='malformed')s.yardRuntime.foodLocationCapabilities.geometryRevision='pip-garden-t2-r1';
      if(kind==='occupied')s.yardRuntime.canonicalPlacements=[{...s.yardRuntime.foodLocationCapabilities.storageLocation,
        slotId:'canonical:existing',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:80,y:82,condition:'new',uses:0,placedAt:1}];
      assert.equal((await e.api.setCanonicalFoodSnapshot(s,{ownerKey:'account-a:session-1'})).available,false);
      assert.equal(e.foodLoads,0);assert.equal(e.baseCalls,0);assert.equal(e.foodRoot(),undefined);assert.equal(e.api.diagnostics.canonicalFood.ledger,null);
    }finally{await e.api.dispose();}
  }
});

test('one real loaded food owner follows four current states and exact full base budget without allocations or writes',async()=>{
  const e=await make();
  try{
    let geometry,material;
    for(const food of [null,'kibble','berry_plate','bonito_bowl',null]){
      const s=snapshot(food),before=JSON.stringify(s),result=await e.api.setCanonicalFoodSnapshot(s,{ownerKey:'account-a:session-1'});
      assert.equal(result.state,food??'empty');assert.equal(JSON.stringify(s),before);const root=e.foodRoot();assert.ok(root.visible);
      assert.equal(root.children.filter(g=>g.visible&&g.name.endsWith('Vessel')).length,1);
      const mesh=root.getObjectByName('CeramicBowlMesh');if(geometry){assert.strictEqual(mesh.geometry,geometry);assert.strictEqual(mesh.material,material);}else{geometry=mesh.geometry;material=mesh.material;}
    }
    assert.equal(e.foodLoads,1);const r=e.api.resources,d=e.api.diagnostics.canonicalFood,b=e.base();
    assert.equal(r.geometryGPUBufferBytes,4028332);assert.equal(r.boneDataTextureCPUBytesEstimate,1024);
    assert.equal(b.knownCPU,15112796);assert.equal(b.estimatedGPU,10094636);
    assert.equal(d.ledger.total.knownCPU,15845860);assert.equal(d.ledger.total.estimatedGPU,10575668);assert.equal(d.ledger.total.rgba,b.rgba);
    assert.ok(d.ledger.total.estimatedGPU<=LIMITS.estimatedGPU);assert.ok(e.events.some(r=>r.event==='canonical-food-changed'&&r.selection.state==='bonito_bowl'));
  }finally{await e.api.dispose();}
});

test('same-owner updates during deferred loading select latest snapshot with one parse, hiding cleared pixels promptly',async()=>{
  const entered=deferred(),release=deferred(),e=await make({loadFood:async url=>{entered.resolve();await release.promise;return fileBytes(url);}});
  try{
    const first=e.api.setCanonicalFoodSnapshot(snapshot('kibble'),{ownerKey:'a:1'});await entered.promise;
    const second=e.api.setCanonicalFoodSnapshot(snapshot('berry_plate'),{ownerKey:'a:1'});assert.equal(e.foodLoads,1);
    assert.equal(e.events.at(-1).event,'canonical-food-changed');assert.equal(e.events.at(-1).selection.available,false);
    release.resolve();await first;const result=await second;assert.equal(result.state,'berry_plate');assert.equal(e.foodLoads,1);
    assert.equal(e.api.diagnostics.canonicalFood.binding.state,'berry_plate');
  }finally{release.resolve();await e.api.dispose();}
});

test('owner replacement aborts and waits for old unresolved load, then exposes only the new account',async()=>{
  const entered=deferred(),release=deferred();let firstSignal;
  const e=await make({loadFood:async(url,signal)=>{if(!firstSignal){firstSignal=signal;entered.resolve();await release.promise;}return fileBytes(url);}});
  try{
    const first=e.api.setCanonicalFoodSnapshot(snapshot('kibble'),{ownerKey:'a:1'});await entered.promise;
    const second=e.api.setCanonicalFoodSnapshot(snapshot('bonito_bowl'),{ownerKey:'b:2'});assert.equal(firstSignal.aborted,true);
    await Promise.resolve();assert.equal(e.foodLoads,1,'replacement waits until canceled allocation settles');
    release.resolve();assert.equal((await first).available,false);assert.equal((await second).state,'bonito_bowl');
    assert.equal(e.foodLoads,2);assert.equal(e.api.diagnostics.canonicalFood.hasOwner,true);assert.equal(e.scene.children.filter(o=>o.name.includes('food source')).length,1);
  }finally{release.resolve();await e.api.dispose();}
});

test('disposal synchronously retires renderer but its returned barrier waits for canceled food bytes',async()=>{
  const entered=deferred(),release=deferred();let signal;
  const e=await make({loadFood:async(url,s)=>{signal=s;entered.resolve();await release.promise;return fileBytes(url);}});
  const setting=e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'a:1'});await entered.promise;
  const retiring=e.api.dispose();let settled=false;retiring.then(()=>{settled=true;});await Promise.resolve();
  assert.equal(signal.aborted,true);assert.equal(e.rendererDisposed,1);assert.equal(e.contextsRetired,1);assert.equal(settled,false);
  assert.equal(e.api.diagnostics.canonicalFood.ledger.loadingOrLiveOwners,1,'pending bytes retain reservation');
  assert.strictEqual(e.api.dispose(),retiring);release.resolve();await setting;await retiring;
  assert.equal(settled,true);assert.equal(e.api.diagnostics.canonicalFood.ledger.loadingOrLiveOwners,0);assert.equal(e.api.diagnostics.canonicalFood.ledger.retiredOwners,0);
  assert.equal(e.foodRoot(),undefined);assert.equal((await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'a:1'})).reason,'CANONICAL_FOOD_DISPOSED');
});

test('loaded food disposal precedes base inventory, so every actual food geometry/material is disposed once',async()=>{
  const e=await make();await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'a:1'});
  const geometries=new Set(),materials=new Set(),counts=new Map();
  e.foodRoot().traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);});
  for(const owned of [...geometries,...materials]){counts.set(owned,0);owned.addEventListener('dispose',()=>counts.set(owned,counts.get(owned)+1));}
  const retiring=e.api.dispose();await retiring;await e.api.dispose();
  assert.equal(geometries.size,11);assert.equal(materials.size,10);assert.ok([...counts.values()].every(n=>n===1));
  assert.equal(e.api.diagnostics.canonicalFood.ledger.retiredOwners,0);assert.equal(e.rendererDisposed,1);
});

test('context loss stays blocked on restore and requests a fresh fully retired renderer under the unchanged cap',async()=>{
  const e=await make();try{
    await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'a:1'});const b=e.base(),r=e.api.resources;
    const overlapping=b.estimatedGPU+r.geometryGPUBufferBytes+r.boneDataTextureGPUBytesEstimate+481032;
    assert.equal(overlapping,14605024);assert.ok(overlapping>LIMITS.estimatedGPU);
    e.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(e.foodRoot(),undefined);assert.equal(e.api.diagnostics.contextLost,true);
    e.canvas.dispatchEvent(new Event('webglcontextrestored'));e.canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.equal(e.api.diagnostics.contextLost,true);assert.equal(e.api.diagnostics.canonicalFood.restartRequired,true);
    assert.equal(e.events.filter(r=>r.event==='canonical-food-context-restart-required').length,1);
    assert.equal(e.api.renderDirect(),false,'blocked before any render work or backend command');
    assert.equal((await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'a:1'})).available,false);assert.equal(e.foodLoads,1);
    assert.equal(e.api.diagnostics.canonicalFood.ledger.retiredOwners,1);
  }finally{await e.api.dispose();}assert.equal(e.api.diagnostics.canonicalFood.ledger.retiredOwners,0);
});

test('baseline context restore remains unchanged and late parent abort prevents re-exposure',async()=>{
  const baseline=await make({enabled:false});try{
    baseline.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));baseline.canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.equal(baseline.api.diagnostics.contextLost,false);assert.ok(baseline.events.some(r=>r.event==='context-restored'));assert.equal(baseline.foodLoads,0);
  }finally{await baseline.api.dispose();}
  const controller=new AbortController(),e=await make({signal:controller.signal});try{
    await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'a:1'});controller.abort();assert.equal(e.foodRoot(),undefined);
    assert.equal((await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'b:2'})).reason,'CANONICAL_FOOD_ABORTED');assert.equal(e.foodLoads,1);
  }finally{await e.api.dispose();}
});

test('retired overlapping owners remain charged and eventual admission refusal causes no extra load',async()=>{
  const e=await make();try{
    for(let i=0;i<5;i++)assert.equal((await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'account:'+i})).available,true);
    const next=await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey:'account:5'});
    assert.equal(next.available,false);assert.match(next.error,/resource cap/);assert.equal(e.foodLoads,5);assert.equal(e.foodRoot(),undefined);
    const d=e.api.diagnostics.canonicalFood;assert.equal(d.ledger.retiredOwners,5);assert.ok(d.ledger.total.estimatedGPU<=LIMITS.estimatedGPU);
  }finally{await e.api.dispose();}assert.equal(e.api.diagnostics.canonicalFood.ledger.retiredOwners,0);
});

test('actual numeric and direct-scene opaque owner tokens qualify and compare by identity without stringification',async()=>{
  const e=await make();try{
    const first={},second={},symbol=Symbol('session');
    for(const [ownerKey,loads] of [[0,1],[0,1],['0',2],[first,3],[first,3],[second,4],[symbol,5],[symbol,5]]){
      assert.equal((await e.api.setCanonicalFoodSnapshot(snapshot(),{ownerKey})).available,true);
      assert.equal(e.foodLoads,loads);assert.equal(e.api.diagnostics.canonicalFood.ownerKeyType,typeof ownerKey);
      assert.doesNotThrow(()=>structuredClone(e.api.diagnostics),'diagnostics never expose uncloneable opaque identity');
    }
  }finally{await e.api.dispose();}
});
