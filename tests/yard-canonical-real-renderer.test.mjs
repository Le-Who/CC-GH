import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPipYardScene} from '../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs';
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {planCanonicalInspection} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';
import {createUiImageReserve} from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import {CANONICAL_LOCATION,canonicalItemCapabilities} from '../game-logic/yard-v2/canonical-locations.mjs';
import {createSceneOwner} from '../src/games/companion-yard-v2/scene-owner.mjs';

const snapshot={player:{id:'owner'},serverTime:1000,yard:{goodieInventory:{leaf_pot:2}},yardRuntime:{version:1,status:'ready',mutable:true,actionProtocol:'yard-v2:',serverNow:1000,itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:true}),canonicalPlacements:[]}};
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
function environment({nativeRenderer=false,owned=false,failGhost=false}={}){
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;doc.hasFocus=()=>true;
 globalThis.window=win;globalThis.document=doc;globalThis.devicePixelRatio=2;
 let observer,width=378,height=622,next=0,at=0,failureCount=0;const frames=new Map(),failures=[],renders=[],notices=[],legacyGhosts=[];
 globalThis.ResizeObserver=class{constructor(fn){observer=fn;}observe(){}disconnect(){}};
 const ctx={setTransform(a,b,c,d,e,f){this.transform={a,b,c,d,e,f};},getTransform(){return this.transform;},clearRect(){},fillRect(){},drawImage(){}};
 const rect=()=>({left:6,top:60,width,height}),canvas={style:{},width:0,height:0,getContext:()=>ctx,getBoundingClientRect:rect};
 const host={style:{},appendChild(c){c.parentNode=this;},getBoundingClientRect:rect};
 const fetchImpl=async url=>{const b=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),json:async()=>JSON.parse(b),text:async()=>b.toString()};};
 const options={canonicalItems:true,directHost:host,uiImageOwner:createUiImageReserve(),onFailure:(error,context)=>failures.push({message:error.message,stack:error.stack,context}),fetchImpl,decodeImage:async()=>({width:973,height:1616,close(){}}),now:()=>at,requestFrame:fn=>{frames.set(++next,fn);return next;},cancelFrame:id=>frames.delete(id),
  plannerWorkerFactory:()=>({plan:args=>Promise.resolve(planCanonicalInspection(args)),dispose(){}}),
  rendererFactory:args=>createOptionalPipRenderer({...args,canvasFactory:()=>{const c=new EventTarget();c.style={};c.dataset={};c.remove=()=>{c.parentNode=null;};return c;},
   rendererFactory:({THREE,canvas})=>{const renderer=nativeRenderer?new THREE.WebGLRenderer({canvas,context:contextStub(canvas)}):({shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},dispose(){},forceContextLoss(){},render(world,camera){world.updateMatrixWorld(true);renders.push({children:world.children.map(o=>({name:o.name,visible:o.visible})),camera:camera.matrixWorld.toArray()});}});
    const render=renderer.render.bind(renderer);renderer.render=(world,camera)=>{render(world,camera);if(failGhost&&!failureCount&&world.children.some(group=>group.visible&&group.children.some(o=>o.visible&&o.userData.ghost))){failureCount++;throw new TypeError('Injected first ghost submission failure');}};return renderer;}})};
 const scene=owned?createSceneOwner(canvas,{...options,prototypeAllowed:true,onError:error=>notices.push(error.code),onSceneFailure:detail=>notices.push(detail.mode),createLegacy:()=>({update(){},setGhost:g=>legacyGhosts.push(g),dispose(){},diagnostics:()=>({ready:true})}),loadPrototype:async()=>({createPipYardScene})}):createPipYardScene(canvas,options);
 return{scene,failures,renders,notices,legacyGhosts,tick(ms=0){at+=ms;const calls=[...frames.values()];frames.clear();calls.forEach(fn=>fn(at));},resize(w,h){width=w;height=h;observer();}};
}

test('actual canonical scene and R1/T2 renderer enter the UI ghost and resize without failure',async()=>{
 const e=environment({nativeRenderer:true});try{
  e.scene.update(snapshot);await e.scene.ready;e.tick();assert.deepEqual(e.failures,[]);assert.equal(e.scene.diagnostics().lastFrame.visibility,'pet');
  const anchor=e.scene.defaultItemAnchor();
  const ghost={...anchor,...CANONICAL_LOCATION,slotId:'canonical:actual-ui',goodieId:'leaf_pot',placing:true,ownerAccountId:'owner',ownerSession:1};
  const valid=e.scene.checkPlacement(ghost);assert.equal(valid.ok,true);assert.equal(Object.hasOwn(ghost,'itemGeometryRevision'),false);
  e.scene.setGhost({...ghost,valid:valid.ok,placementError:valid.errors?.[0]?.code});e.tick();
  assert.deepEqual(e.failures,[]);assert.equal(e.scene.diagnostics().lastFrame.visibility,'planter');
  assert.deepEqual(e.scene.diagnostics().renderer.propInstances.filter(row=>row.visible).map(row=>row.slotId),[ghost.slotId]);
  e.resize(378,599.75);e.tick();assert.deepEqual(e.failures,[]);assert.equal(e.scene.diagnostics().lastFrame.visibility,'planter');
  const held=e.scene.diagnostics().dynamicSample.world;
  e.scene.beginPointer();e.scene.setGhost({...ghost,x:72,y:145,valid:true});e.tick();assert.deepEqual(e.failures,[]);assert.deepEqual(e.scene.diagnostics().dynamicSample.world,held);
  e.scene.endPointer();e.scene.setGhost(null);e.tick();assert.equal(e.scene.diagnostics().lastFrame.visibility,'pet');
  const row={...CANONICAL_LOCATION,slotId:ghost.slotId,goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:98,y:118,condition:'new',uses:0,placedAt:1000};
  e.scene.update({...snapshot,yardRuntime:{...snapshot.yardRuntime,canonicalPlacements:[row]}});e.tick();
  const moving={...ghost,x:72,y:145,placing:false};assert.equal(e.scene.checkPlacement(moving).ok,true);
  e.scene.setGhost({...moving,valid:true});e.tick();assert.deepEqual(e.failures,[]);assert.equal(e.scene.diagnostics().lastFrame.visibility,'planter');
  assert.deepEqual(e.scene.diagnostics().renderer.propInstances.filter(row=>row.visible).map(row=>row.position),[[6,0,-145/12]]);
  e.scene.setGhost(null);e.tick();assert.deepEqual(e.scene.diagnostics().renderer.propInstances.filter(row=>row.visible).map(row=>row.position),[[98/12,0,-118/12]]);
 }finally{await e.scene.dispose();}
});

test('real first ghost failure retains its cause, retires before fallback and never forwards canonical ghosts to legacy',async()=>{
 const e=environment({nativeRenderer:true,owned:true,failGhost:true});
 const intent={clientActionId:'yard-v2:canonical-v1/held',payload:{...CANONICAL_LOCATION,slotId:'canonical:actual-ui',goodieId:'leaf_pot',x:98,y:118}},saved=JSON.stringify(intent);
 try{
  e.scene.update(snapshot);await e.scene.ready;await e.scene.setCanonicalItemsEnabled(true);await e.scene.ready;e.tick();
  const ghost={...intent.payload,placing:true,ownerAccountId:'owner',ownerSession:1,valid:true};
  e.scene.setCanonicalActionPending(true);e.scene.setGhost(ghost);e.tick();
  for(let i=0;i<20;i++)await Promise.resolve();await e.scene.ready;
  const d=e.scene.diagnostics();assert.equal(d.mode,'legacy');assert.equal(d.lastFailure.name,'TypeError');assert.equal(d.lastFailure.message,'Injected first ghost submission failure');assert.match(d.lastFailure.stack,/yard-canonical-real-renderer/);
  assert.equal(d.lastFailure.context.operation,'canonical-render');assert.equal(d.lastFailure.context.ghost.slotId,ghost.slotId);assert.equal(d.lastFailure.context.renderer.propInstances[2].visible,true);
  assert.deepEqual(e.notices,['canonical-items','YARD_PIP_SCENE_FAILED']);assert.equal(e.scene.setGhost(ghost),false);assert.deepEqual(e.legacyGhosts,[]);assert.equal(JSON.stringify(intent),saved);
  await e.scene.setCanonicalItemsEnabled(true);await e.scene.ready;e.scene.setCanonicalActionPending(false);e.scene.setGhost(ghost);e.tick();assert.equal(e.scene.diagnostics().mode,'canonical-items');assert.equal(e.scene.diagnostics().scene.lastFrame.visibility,'planter');
  assert.equal(e.scene.diagnostics().lastFailure.message,'Injected first ghost submission failure','evidence survives explicit retry');
 }finally{await e.scene.dispose();}
});
