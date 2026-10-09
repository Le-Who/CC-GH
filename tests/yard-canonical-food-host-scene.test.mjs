import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPipYardScene} from '../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs';
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {planCanonicalInspection} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';
import {createUiImageReserve} from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import {CANONICAL_LOCATION,canonicalItemCapabilities} from '../game-logic/yard-v2/canonical-locations.mjs';
import {canonicalCommandScope,checkCanonicalPlacement} from '../src/game-state/canonicalYardItems.mjs';
import {createSceneOwner} from '../src/games/companion-yard-v2/scene-owner.mjs';

import {canonicalFoodCapabilities} from '../game-logic/yard-v2/canonical-food-protocol.mjs';
const snapshot={player:{id:'owner'},serverTime:1000,yard:{goodieInventory:{leaf_pot:2},foodInventory:{kibble:3,berry_plate:2,bonito_bowl:1},placedGoodies:[],bowls:[{id:'bowl-1',foodId:null,servings:0}]},yardRuntime:{version:1,status:'ready',mutable:true,actionProtocol:'yard-v2:',serverNow:1000,itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:true,canonicalFoodLocationEnabled:true}),canonicalPlacements:[],foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true})}};
// Real Three objects, loaders, pose application, renderer traversal and type
// contracts. GL commands are no-ops: this does NOT test shaders or GPU pixels.
function contextStub(canvas){
 const names=new Map();let constant=1;
 return new Proxy({canvas,drawingBufferColorSpace:'srgb',getContextAttributes:()=>({alpha:true}),getExtension:name=>name==='WEBGL_lose_context'?{loseContext(){},restoreContext(){}}:null,getShaderPrecisionFormat:()=>({rangeMin:127,rangeMax:127,precision:23}),getSupportedExtensions:()=>[],
  getParameter:key=>{const name=names.get(key);return name==='VERSION'?'WebGL 2.0':name==='VIEWPORT'||name==='SCISSOR_BOX'?[0,0,390,648]:16;},getProgramParameter:(_p,key)=>names.get(key)==='LINK_STATUS',getShaderParameter:()=>true,getProgramInfoLog:()=>'',getShaderInfoLog:()=>''},
 {get(target,key){if(key in target)return target[key];if(key==='drawingBufferWidth')return canvas.width;if(key==='drawingBufferHeight')return canvas.height;
  if(/^[A-Z_0-9]+$/.test(key)){const value=constant++;names.set(value,key);return target[key]=value;}
  return target[key]=key.startsWith('create')?()=>({}):()=>{};}});
}
function environment({nativeRenderer=false,owned=false,failGhost=false,startupClockGap=0,foodPreview=true,groundingRecipe='baseline',delayFood=null,failFood=false}={}){
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;doc.hasFocus=()=>true;
 globalThis.window=win;globalThis.document=doc;globalThis.devicePixelRatio=2;
 let observer,width=378,height=622,next=0,at=0,failureCount=0,clockStarted=false,interruptions=0;const frames=new Map(),failures=[],renders=[],notices=[],foodRequests=[],renderCanvases=[],restarts=[],views=[];
 globalThis.ResizeObserver=class{constructor(fn){observer=fn;}observe(){}disconnect(){}};
 const ctx={setTransform(a,b,c,d,e,f){this.transform={a,b,c,d,e,f};},getTransform(){return this.transform;},clearRect(){},fillRect(){},drawImage(){}};
 const rect=()=>({left:6,top:60,width,height}),canvas={style:{},width:0,height:0,getContext:()=>ctx,getBoundingClientRect:rect};
 const host={style:{},appendChild(c){c.parentNode=this;},getBoundingClientRect:rect};
 const fetchImpl=async (url,{signal}={})=>{if(String(url).includes('food-r2')){foodRequests.push({url:String(url),signal});if(delayFood)await delayFood;if(failFood)return{ok:false,status:500};}const b=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),json:async()=>JSON.parse(b),text:async()=>b.toString()};};
 const options={onView:value=>views.push(value),canonicalFoodPreview:foodPreview,groundingRecipe,onRestartRequired:()=>restarts.push(true),canonicalItems:true,directHost:host,uiImageOwner:createUiImageReserve(),onPointerInterrupt:()=>{interruptions++;scene.endPointer();scene.setGhost(null);},onFailure:(error,context)=>failures.push({message:error.message,stack:error.stack,context}),fetchImpl,decodeImage:async()=>({width:973,height:1616,close(){}}),now:()=>{const current=at;if(!clockStarted){clockStarted=true;at+=startupClockGap;}return current;},requestFrame:fn=>{frames.set(++next,fn);return next;},cancelFrame:id=>frames.delete(id),
  plannerWorkerFactory:()=>({plan:args=>Promise.resolve(planCanonicalInspection(args)),dispose(){}}),
  rendererFactory:args=>createOptionalPipRenderer({...args,canvasFactory:()=>{const c=new EventTarget();renderCanvases.push(c);c.style={};c.dataset={};c.remove=()=>{c.parentNode=null;};return c;},
   rendererFactory:({THREE,canvas})=>{const renderer=nativeRenderer?new THREE.WebGLRenderer({canvas,context:contextStub(canvas)}):({shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},dispose(){},forceContextLoss(){},render(world,camera){world.updateMatrixWorld(true);renders.push({children:world.children.map(o=>({name:o.name,visible:o.visible})),camera:camera.matrixWorld.toArray()});}});
    const render=renderer.render.bind(renderer);renderer.render=(world,camera)=>{render(world,camera);if(failGhost&&!failureCount&&world.children.some(group=>group.visible&&group.children.some(o=>o.visible&&o.userData.ghost))){failureCount++;throw new TypeError('Injected first ghost submission failure');}};return renderer;}})};
 const scene=owned?createSceneOwner(canvas,{...options,onError:error=>notices.push(error.code),onSceneFailure:detail=>notices.push(detail.mode),loadScene:async()=>({createPipYardScene})}):createPipYardScene(canvas,options);
 return{scene,canvas,host,options,failures,renders,notices,foodRequests,renderCanvases,restarts,views,get interruptions(){return interruptions;},tick(ms=0){at+=ms;const calls=[...frames.values()];frames.clear();calls.forEach(fn=>fn(at));},resize(w,h,{flush=true}={}){width=w;height=h;if(flush)observer();},flushResize(){observer();}};
}

for(const groundingRecipe of['baseline','pip-garden-grounding-v1'])test(`real scene owns one shared bowl and exact full budget under ${groundingRecipe}`,async()=>{
 const e=environment({groundingRecipe}),saved=structuredClone(snapshot);try{
  e.scene.update(saved);await e.scene.ready;e.tick();assert.deepEqual(e.failures,[]);assert.equal(e.foodRequests.length,1);
  let d=e.scene.diagnostics();assert.equal(d.canonicalFood.state,'empty');assert.equal(d.canonicalFood.render.state,'empty');assert.match(d.route.layoutKey,/pip-garden:food:bowl-1/);
  const ledger=d.foodResources;assert.equal(ledger.base.knownCPU,15112796);assert.equal(ledger.total.knownCPU,15845860);assert.equal(ledger.total.estimatedGPU,10575668);assert.equal(ledger.total.rgba,Math.max(d.rgba.totalBytes,d.peakRgba));assert.equal(ledger.loadingOrLiveOwners,1);assert.equal(ledger.visibleOwners,1);
  const before=JSON.stringify(saved);const poses=[];
  for(const foodId of['kibble','berry_plate','bonito_bowl']){const next=structuredClone(saved);next.yard.bowls[0]={id:'bowl-1',foodId,servings:2,placedAt:1,expiresAt:999};e.scene.update(next);await e.scene.foodReady;e.tick();d=e.scene.diagnostics();assert.equal(d.canonicalFood.render.state,foodId);assert.equal(d.foodResources.loadingOrLiveOwners,1);assert.equal(d.foodResources.visibleOwners,1);poses.push(d.dynamicSample.world);}
  assert.equal(e.foodRequests.length,1,'food changes reuse existing source geometry');assert.equal(JSON.stringify(saved),before);assert.deepEqual(poses[0],poses[2]);
  const frames=d.frameCount;e.resize(756,252);e.tick();assert.ok(e.scene.diagnostics().frameCount>frames);assert.equal(e.scene.diagnostics().foodResources.total.rgba,Math.max(e.scene.diagnostics().rgba.totalBytes,e.scene.diagnostics().peakRgba));
 }finally{await e.scene.dispose();}
 const retired=e.scene.diagnostics();assert.equal(retired.foodResources.loadingOrLiveOwners,0);assert.equal(retired.foodResources.retiredOwners,0);assert.equal(retired.renderer.disposed,true);
});
test('default scene and disabled server never request or parse the food GLB',async()=>{
 for(const foodPreview of[false,true]){const e=environment({foodPreview}),saved=structuredClone(snapshot);if(foodPreview)saved.yardRuntime.foodLocationCapabilities.enabled=false;
 try{e.scene.update(saved);await e.scene.ready;e.tick();assert.deepEqual(e.failures,[]);assert.equal(e.foodRequests.length,0);assert.doesNotMatch(e.scene.diagnostics().route.layoutKey,/pip-garden:food:bowl-1/);}finally{await e.scene.dispose();}}
});
test('occupied saved socket hides food with reason and pickup reveals the same owner',async()=>{
 const e=environment(),saved=structuredClone(snapshot);try{e.scene.update(saved);await e.scene.ready;
 saved.yardRuntime.canonicalPlacements=[{...CANONICAL_LOCATION,slotId:'canonical:old-pot',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:80,y:82,condition:'new',uses:0,placedAt:1}];e.scene.update(saved);await e.scene.foodReady;e.tick();const blocked=e.scene.diagnostics();assert.equal(blocked.canonicalFood.reason,'CANONICAL_FOOD_SOCKET_OCCUPIED');assert.deepEqual(blocked.canonicalFood.occupiedSlotIds,['canonical:old-pot']);assert.equal(blocked.foodResources.visibleOwners,0);assert.match(blocked.route.layoutKey,/pip-garden:food:bowl-1/);
 saved.yardRuntime.canonicalPlacements=[];e.scene.update(saved);await e.scene.foodReady;e.tick();assert.equal(e.scene.diagnostics().canonicalFood.render.state,'empty');assert.equal(e.scene.diagnostics().foodResources.visibleOwners,1);assert.equal(e.foodRequests.length,1);
 }finally{await e.scene.dispose();}
});
test('food-aware placement checks current command scope before actor clearance without changing the proposal or pose',async()=>{
 const e=environment(),saved=structuredClone(snapshot),before=structuredClone(saved);try{
  e.scene.update(saved);await e.scene.ready;e.tick();assert.deepEqual(e.failures,[]);
  const held=structuredClone(e.scene.diagnostics().dynamicSample.world);
  const proposal={...canonicalCommandScope(saved),slotId:'canonical:food-aware-place',goodieId:'leaf_pot',x:98,y:118,placing:true},original=structuredClone(proposal);
  assert.equal(proposal.geometryRevision,'pip-garden-t2-food-r2');assert.equal(Object.hasOwn(proposal,'itemGeometryRevision'),false);
  assert.equal(checkCanonicalPlacement(saved,proposal).ok,true);assert.equal(e.scene.checkPlacement(proposal).ok,true);
  for(const changed of[{...CANONICAL_LOCATION},{geometryRevision:'unregistered'},{locationId:'other-garden'},{locationVersion:2},{goodieId:'sun_cushion'}]){
   assert.equal(e.scene.checkPlacement({...proposal,...changed}).errors[0].code,'CANONICAL_GEOMETRY_REVISION_MISMATCH');
  }
  const occupied={...proposal,x:held.root.x,y:held.root.y};assert.equal(checkCanonicalPlacement(saved,occupied).ok,true);
  assert.equal(e.scene.checkPlacement(occupied).errors[0].code,'CANONICAL_ACTOR_OCCUPIED');
  assert.equal(e.scene.checkPlacement({...proposal,x:80,y:82}).errors[0].code,'CANONICAL_FOOD_REGION_RESERVED');
  assert.equal(e.scene.checkPlacement({...proposal,x:0,y:0}).errors[0].code,'CANONICAL_PLACEMENT_INVALID');
  e.scene.setGhost({...proposal,valid:true});e.tick(1000);
  assert.deepEqual(e.scene.diagnostics().dynamicSample.world,held);assert.deepEqual(saved,before);assert.deepEqual(proposal,original);
  assert.deepEqual(e.scene.diagnostics().canonicalRecords,[]);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});
test('food-aware move can escape a saved socket overlap while preserving other pot, food and actual actor exclusions',async()=>{
 const e=environment(),saved=structuredClone(snapshot);
 const old={...CANONICAL_LOCATION,slotId:'canonical:old-pot',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:80,y:82,condition:'new',uses:0,placedAt:1};
 saved.yardRuntime.canonicalPlacements=[old,{...old,slotId:'canonical:other-pot',x:72,y:145}];
 const before=structuredClone(saved);try{
  e.scene.update(saved);await e.scene.ready;e.tick();assert.deepEqual(e.failures,[]);
  const start=e.scene.diagnostics(),held=structuredClone(start.dynamicSample.world);
  assert.equal(start.canonicalFood.reason,'CANONICAL_FOOD_SOCKET_OCCUPIED');assert.deepEqual(start.canonicalFood.occupiedSlotIds,[old.slotId]);
  const proposal={...canonicalCommandScope(saved),slotId:old.slotId,goodieId:'leaf_pot',x:98,y:118,placing:false},original=structuredClone(proposal);
  assert.equal(checkCanonicalPlacement(saved,proposal).ok,true);assert.equal(e.scene.checkPlacement(proposal).ok,true);
  assert.equal(e.scene.checkPlacement({...proposal,...CANONICAL_LOCATION}).errors[0].code,'CANONICAL_GEOMETRY_REVISION_MISMATCH');
  assert.equal(e.scene.checkPlacement({...proposal,x:72,y:145}).errors[0].code,'CANONICAL_PLACEMENT_INVALID');
  assert.equal(e.scene.checkPlacement({...proposal,x:80,y:82}).errors[0].code,'CANONICAL_FOOD_REGION_RESERVED');
  const occupied={...proposal,x:held.root.x,y:held.root.y};assert.equal(checkCanonicalPlacement(saved,occupied).ok,true);
  assert.equal(e.scene.checkPlacement(occupied).errors[0].code,'CANONICAL_ACTOR_OCCUPIED');
  e.scene.setGhost({...proposal,valid:true});e.tick(1000);assert.equal(e.scene.checkPlacement(proposal).ok,true);
  const end=e.scene.diagnostics();assert.deepEqual(end.dynamicSample.world,held);assert.deepEqual(end.canonicalRecords,before.yardRuntime.canonicalPlacements);
  assert.equal(end.canonicalFood.reason,'CANONICAL_FOOD_SOCKET_OCCUPIED');assert.deepEqual(saved,before);assert.deepEqual(proposal,original);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});
test('food-aware proposal cannot obtain clearance from disabled or forged capabilities',async()=>{
 const e=environment();try{
  e.scene.update(snapshot);await e.scene.ready;e.tick();const held=structuredClone(e.scene.diagnostics().dynamicSample.world);
  const proposal={...canonicalCommandScope(snapshot),slotId:'canonical:guarded-place',goodieId:'leaf_pot',x:98,y:118,placing:true};
  for(const change of[s=>s.yardRuntime.itemPlacementCapabilities.enabled=false,s=>s.yardRuntime.itemPlacementCapabilities.storageLocation.geometryRevision='unregistered',s=>s.yardRuntime.foodLocationCapabilities.enabled=false]){
   const saved=structuredClone(snapshot);change(saved);e.scene.update(saved);
   assert.equal(e.scene.checkPlacement(proposal).errors[0].code,'CANONICAL_ITEM_PLACEMENT_DISABLED');
   assert.deepEqual(e.scene.diagnostics().dynamicSample.world,held);
  }
  assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});
test('food context recovery retires complete owner before replacement and redraws fresh current state',async()=>{
 const e=environment({owned:true});try{e.scene.update(snapshot,{accountSession:1});await e.scene.ready;e.tick();assert.equal(e.foodRequests.length,1);
 const old=e.renderCanvases[0],lost=new Event('webglcontextlost',{cancelable:true});old.dispatchEvent(lost);assert.equal(lost.defaultPrevented,true);old.dispatchEvent(new Event('webglcontextrestored'));await e.scene.ready;await e.scene.ready;e.tick();
 const d=e.scene.diagnostics();assert.equal(e.foodRequests.length,2);assert.equal(d.retirements,1);assert.equal(d.lastRetired.foodResources.retiredOwners,0);assert.equal(d.scene.canonicalFood.render.state,'empty');assert.ok(d.scene.frameCount>0);assert.deepEqual(e.failures,[]);assert.deepEqual(e.notices,[]);
 }finally{await e.scene.dispose();}
});
test('enabling the food socket under the actual former crossing pose stays hidden until explicit clean restart',async()=>{
 const e=environment(),saved=structuredClone(snapshot);saved.yardRuntime.foodLocationCapabilities.enabled=false;saved.yardRuntime.itemPlacementCapabilities=canonicalItemCapabilities({canonicalItemPlacementEnabled:true});saved.yardRuntime.canonicalPlacements=[{...CANONICAL_LOCATION,slotId:'canonical:north',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:80,y:60,condition:'new',uses:0,placedAt:1}];
 try{e.scene.update(saved);await e.scene.ready;assert.equal(e.scene.inspectCanonicalSlot('canonical:north'),true);await Promise.resolve();e.tick(7200);const before=e.scene.diagnostics();assert.ok(before.dynamicSample.world.root.y<94&&before.dynamicSample.world.root.y>90);assert.equal(e.foodRequests.length,0);
 saved.yardRuntime.foodLocationCapabilities.enabled=true;saved.yardRuntime.itemPlacementCapabilities=canonicalItemCapabilities({canonicalItemPlacementEnabled:true,canonicalFoodLocationEnabled:true});e.scene.update(saved);e.tick();assert.equal(e.restarts.length,0);const after=e.scene.diagnostics();assert.equal(after.canonicalFood.reentryRequired,true);assert.equal(after.phase,'reentry-required');assert.equal(e.foodRequests.length,0);assert.equal(after.frameCount,before.frameCount);assert.deepEqual(after.dynamicSample.world,before.dynamicSample.world);
 }finally{await e.scene.dispose();}
});
test('unmount during delayed food bytes aborts its signal and holds the scene lease until retirement settles',async()=>{
 let release;const delayed=new Promise(resolve=>{release=resolve;}),e=environment({delayFood:delayed});e.scene.update(snapshot);
 for(let i=0;i<100&&!e.foodRequests.length;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(e.foodRequests.length,1);assert.equal(e.views.at(-1).canonicalFood.loading,true);assert.equal(e.views.at(-1).canonicalFood.render.available,false);
 let finished=false;const retirement=e.scene.dispose().then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);assert.equal(e.foodRequests[0].signal.aborted,true);
 const {acquirePipLease}=await import('../src/games/companion-yard-v2/pip-prototype/resources.mjs');assert.throws(acquirePipLease,/owner/);
 release();await retirement;assert.equal(finished,true);assert.equal(e.scene.diagnostics().foodResources.loadingOrLiveOwners,0);assert.equal(e.scene.diagnostics().foodResources.retiredOwners,0);acquirePipLease()();assert.deepEqual(e.failures,[]);
});
test('actual asset failure publishes unavailable art without changing the saved bowl or inventory',async()=>{
 const e=environment({failFood:true}),saved=structuredClone(snapshot),before=JSON.stringify(saved);try{e.scene.update(saved);await e.scene.ready;e.tick();assert.equal(e.foodRequests.length,1);const view=e.views.at(-1);assert.equal(view.canonicalFood.loading,false);assert.equal(view.canonicalFood.render.available,false);assert.equal(view.canonicalFood.render.reason,'CANONICAL_FOOD_UNAVAILABLE');assert.equal(JSON.stringify(saved),before);assert.equal(e.scene.diagnostics().foodResources.loadingOrLiveOwners,0);assert.deepEqual(e.failures,[]);}finally{await e.scene.dispose();}
});
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const waitForFood=async e=>{for(let i=0;i<100&&!e.foodRequests.length;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(e.foodRequests.length,1);};
test('actual pending food load fences A-B-A replacement through the whole scene owner',async()=>{
 let release;const delayed=new Promise(resolve=>{release=resolve;}),e=environment({owned:true,delayFood:delayed}),session={};
 e.scene.update(snapshot,{accountSession:session});await waitForFood(e);
 const b=structuredClone(snapshot);b.player.id='B';e.scene.update(b,{accountSession:{}});e.scene.update(snapshot,{accountSession:{}});await settle();assert.equal(e.foodRequests[0].signal.aborted,true);assert.equal(e.renderCanvases.length,1);assert.equal(e.foodRequests.length,1);assert.equal(e.scene.diagnostics().mode,'transition');
 release();await e.scene.ready;await e.scene.ready;e.tick();assert.equal(e.renderCanvases.length,2);assert.equal(e.foodRequests.length,2);assert.equal(e.scene.diagnostics().scene.canonicalFood.render.state,'empty');assert.equal(e.scene.diagnostics().lastRetired.foodResources.loadingOrLiveOwners,0);
 const stable={width:e.canvas.width,height:e.canvas.height,canvas:e.canvas.style.visibility,host:e.host.style.visibility};e.renderCanvases[0].dispatchEvent(new Event('webglcontextrestored'));await settle();assert.deepEqual({width:e.canvas.width,height:e.canvas.height,canvas:e.canvas.style.visibility,host:e.host.style.visibility},stable);await e.scene.dispose();
});
test('immediate React-style remount on the shared canvas cannot allocate before delayed old food retirement',async()=>{
 let release,next;const delayed=new Promise(resolve=>{release=resolve;}),e=environment({owned:true,delayFood:delayed});
 try{
  e.scene.update(snapshot,{accountSession:1});await waitForFood(e);
  const old=e.scene.dispose();let newCreates=0;
  next=createSceneOwner(e.canvas,{...e.options,uiImageOwner:createUiImageReserve(),loadScene:async()=>({createPipYardScene:(canvas,options)=>{newCreates++;return createPipYardScene(canvas,options);}})});
  next.update(snapshot);await settle();assert.equal(newCreates,0);assert.equal(e.foodRequests[0].signal.aborted,true);assert.equal(e.foodRequests.length,1);
  release();await old;await next.ready;e.tick();assert.equal(newCreates,1);assert.equal(e.renderCanvases.length,2);assert.equal(e.foodRequests.length,2);
  const d=next.diagnostics();assert.equal(d.mode,'canonical-items');assert.equal(d.scene.canonicalFood.render.state,'empty');assert.equal(d.scene.foodResources.loadingOrLiveOwners,1);
  assert.equal(e.scene.diagnostics().lastRetired.foodResources.loadingOrLiveOwners,0);
  const stable={width:e.canvas.width,height:e.canvas.height,canvas:e.canvas.style.visibility,host:e.host.style.visibility};
  e.renderCanvases[0].dispatchEvent(new Event('webglcontextrestored'));await settle();
  assert.deepEqual({width:e.canvas.width,height:e.canvas.height,canvas:e.canvas.style.visibility,host:e.host.style.visibility},stable);
  assert.equal(newCreates,1);assert.deepEqual(e.failures,[]);
 }finally{release();await next?.dispose();await e.scene.dispose();}
});

// Replay of the 320px editor's DOM-rect ordering. The dimensions below model
// one-line -> two-line status wrapping; this is control-flow evidence, not a
// browser measurement of the failed immutable-image run.
test('a wrapped collision status during pointer-up reproduces editor cancellation',async()=>{
 const e=environment(),saved=structuredClone(snapshot);
 saved.yardRuntime.canonicalPlacements=[{...CANONICAL_LOCATION,slotId:'canonical:owned-overlap',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:98.00000137319513,y:117.99999959263963,condition:'new',uses:0,placedAt:1}];
 try{
  e.scene.update(saved);await e.scene.ready;e.resize(308,323.109375);e.tick();
  const held=structuredClone(e.scene.diagnostics().dynamicSample.world),proposal={...canonicalCommandScope(saved),slotId:'canonical:owned-overlap',goodieId:'leaf_pot',x:saved.yardRuntime.canonicalPlacements[0].x,y:saved.yardRuntime.canonicalPlacements[0].y,placing:false};
  e.scene.setGhost({...proposal,valid:true});e.tick();e.scene.beginPointer();
  const invalid={...proposal,x:80,y:82},check=e.scene.checkPlacement(invalid);
  assert.equal(check.errors[0].code,'CANONICAL_FOOD_REGION_RESERVED');
  e.scene.setGhost({...invalid,valid:false,placementError:check.errors[0].code});
  // React's discrete event commit grows the auto-sized status before the
  // pointer-up event, with ResizeObserver still undelivered.
  e.resize(308,308.71875,{flush:false});e.scene.endPointer();e.tick();
  assert.equal(e.interruptions,1);assert.equal(e.scene.diagnostics().itemEditing,false);
  assert.equal(e.scene.diagnostics().lastFrame.ghost,null);
  assert.deepEqual(e.scene.diagnostics().canonicalRecords,saved.yardRuntime.canonicalPlacements);
  assert.deepEqual(e.scene.diagnostics().dynamicSample.world,held);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});

test('a reserved collision-status row keeps food, actor and bounds refusals editable; viewport changes still cancel',async()=>{
 for(const delayedResize of[false,true]){
  const e=environment(),saved=structuredClone(snapshot);
  saved.yardRuntime.canonicalPlacements=[{...CANONICAL_LOCATION,slotId:'canonical:owned-overlap',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:98.00000137319513,y:117.99999959263963,condition:'new',uses:0,placedAt:1}];
  const before=structuredClone(saved);
  try{
   e.scene.update(saved);await e.scene.ready;e.resize(308,308.71875);e.tick();
   const held=structuredClone(e.scene.diagnostics().dynamicSample.world),proposal={...canonicalCommandScope(saved),slotId:'canonical:owned-overlap',goodieId:'leaf_pot',x:saved.yardRuntime.canonicalPlacements[0].x,y:saved.yardRuntime.canonicalPlacements[0].y,placing:false};
   e.scene.setGhost({...proposal,valid:true});e.tick();
   for(const[x,y,expected]of[[80,82,'CANONICAL_FOOD_REGION_RESERVED'],[held.root.x,held.root.y,'CANONICAL_ACTOR_OCCUPIED'],[0,0,'CANONICAL_PLACEMENT_INVALID']]){
    e.scene.beginPointer();const invalid={...proposal,x,y},check=e.scene.checkPlacement(invalid);
    assert.equal(check.errors[0].code,expected);
    e.scene.setGhost({...invalid,valid:false,placementError:check.errors[0].code});
    e.flushResize();e.scene.endPointer();e.tick();
    const d=e.scene.diagnostics();assert.equal(e.interruptions,0);assert.equal(d.itemEditing,true);
    assert.equal(d.lastFrame.ghost.valid,false);assert.equal(d.lastFrame.ghost.placementError,expected);
    assert.deepEqual(d.dynamicSample.world,held);assert.deepEqual(d.canonicalRecords,before.yardRuntime.canonicalPlacements);
   }
   e.scene.beginPointer();e.resize(482,194,{flush:!delayedResize});e.scene.endPointer();e.flushResize();e.tick();
   assert.equal(e.interruptions,1);assert.equal(e.scene.diagnostics().itemEditing,false);
   assert.deepEqual(saved,before);assert.deepEqual(e.failures,[]);
  }finally{await e.scene.dispose();}
 }
});

test('normal owner starts canonical, preserves pending intent through restart and retires every resource on exit',async()=>{
 const e=environment({owned:true}),saved=structuredClone(snapshot),before=structuredClone(snapshot);
 try{
  e.scene.update(saved,{accountSession:1});e.scene.setCanonicalActionPending(true);await e.scene.ready;e.tick();
  assert.equal(e.scene.diagnostics().mode,'canonical-items');assert.equal(e.scene.diagnostics().enabled,true);
  assert.equal(e.foodRequests.length,1);assert.equal(e.renderCanvases.length,1);
  assert.equal(e.scene.diagnostics().scene.itemActionPending,true);assert.equal(e.scene.diagnostics().scene.renderer.paused,true);
  assert.equal(e.scene.setPrototypeEnabled,undefined);assert.equal(await e.scene.setCanonicalItemsEnabled(false),false);
  await e.scene.restart();await e.scene.ready;e.tick();
  assert.equal(e.scene.diagnostics().mode,'canonical-items');assert.equal(e.foodRequests.length,2);
  assert.equal(e.scene.diagnostics().scene.itemActionPending,true);assert.equal(e.scene.diagnostics().scene.renderer.paused,true);
  assert.equal(e.scene.diagnostics().lastRetired.renderer.disposed,true);
  assert.equal(e.scene.diagnostics().lastRetired.foodResources.loadingOrLiveOwners,0);
  assert.deepEqual(saved,before);assert.deepEqual(e.failures,[]);assert.deepEqual(e.notices,[]);
 }finally{await e.scene.dispose();}
 const d=e.scene.diagnostics();assert.equal(d.mode,'disposed');assert.equal(d.enabled,false);
 assert.equal(d.lastRetired.renderer.disposed,true);assert.equal(d.lastRetired.foodResources.loadingOrLiveOwners,0);
});
