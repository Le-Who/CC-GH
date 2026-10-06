import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPipYardScene} from '../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs';
import {createUiImageReserve} from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import {CANONICAL_LOCATION,CANONICAL_ITEM} from '../src/game-state/canonicalYardItems.mjs';
import {canonicalItemCapabilities} from '../game-logic/yard-v2/canonical-locations.mjs';
import {planCanonicalInspection} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';

const record=(slotId,x,y)=>({...CANONICAL_LOCATION,slotId,goodieId:'leaf_pot',itemGeometryRevision:CANONICAL_ITEM.itemGeometryRevision,x,y,condition:'new',uses:0,placedAt:1000});
const rows=[record('canonical:first',98,118),record('canonical:second',88,172)];
const snapshot=(items=rows)=>({player:{id:'owner'},serverTime:1000,yard:{goodieInventory:{leaf_pot:2-items.length}},yardRuntime:{version:1,status:'ready',mutable:true,actionProtocol:'yard-v2:',serverNow:1000,itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:true}),canonicalPlacements:items}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};

function environment({canonicalItems=true,decodeGate=null,planner=async()=>({ok:false,code:'TEST_NO_PATH'})}={}){
 const win=new EventTarget(),doc=new EventTarget(),frames=new Map(),events=[],renders=[],failures=[],decoding=deferred();
 let observer,width=378,height=622,at=0,frameId=0,onResources,contextLost=false,renderAllowed=true,renderError=null,interruptions=0;
 doc.hidden=false;doc.hasFocus=()=>true;globalThis.window=win;globalThis.document=doc;globalThis.devicePixelRatio=2;
 globalThis.ResizeObserver=class{constructor(fn){observer=fn;}observe(){}disconnect(){observer=null;}};
 function style(label){let visibility='';return{get visibility(){return visibility;},set visibility(value){visibility=value;events.push(`${label}:${value||'visible'}`);}};}
 const rect=()=>({left:6,top:60,width,height});
 const ctx={setTransform(a,b,c,d,e,f){this.transform={a,b,c,d,e,f};},getTransform(){return this.transform;},clearRect(){events.push('clear');},fillRect(){events.push('fill');},drawImage(){events.push('background');}};
 const canvas={width:0,height:0,style:style('background-visibility'),getContext:()=>ctx,getBoundingClientRect:rect};
 const host={style:style('direct-visibility'),appendChild(){},getBoundingClientRect:rect};
 const fetchImpl=async url=>{const bytes=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes),text:async()=>bytes.toString()};};
 const scene=createPipYardScene(canvas,{canonicalItems,directHost:host,uiImageOwner:createUiImageReserve(),now:()=>at,fetchImpl,
  requestFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelFrame:id=>frames.delete(id),
  plannerWorkerFactory:()=>({plan:planner,dispose(){}}),
  onPointerInterrupt:()=>{interruptions++;},onFailure:(error,context)=>failures.push({message:error.message,operation:context.operation}),
  decodeImage:async()=>{decoding.resolve();if(decodeGate)await decodeGate;return{width:973,height:1616,close(){}};},
  rendererFactory:async options=>{onResources=options.onResources;return{
   renderDirect:options=>{if(renderError)throw renderError;if(contextLost||!renderAllowed){events.push('render-refused');return false;}events.push('render');renders.push(structuredClone(options));return true;},
   resize(){events.push('direct-resize');},setPaused(){},setCanonicalPlacements(){},dispose(){},diagnostics:{}};}});
 if(canonicalItems)scene.update(snapshot());
 return{scene,canvas,host,doc,win,events,renders,failures,frames,decoding:decoding.promise,get interruptions(){return interruptions;},
  async ready(){await scene.ready;this.tick();events.length=0;},
  tick(ms=0){at+=ms;const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(at));},
  resize(w,h){width=w;height=h;observer?.();},
  context(value){contextLost=value;onResources({event:value?'context-lost':'context-restored'});},
  allowRender(value){renderAllowed=value;},failRender(value){renderError=value;}};
}
function hidden(e){assert.equal(e.canvas.style.visibility,'hidden');assert.equal(e.host.style.visibility,'hidden');}
function visible(e){assert.equal(e.canvas.style.visibility,'');assert.equal(e.host.style.visibility,'');}
function coherent(e){
 visible(e);const background=e.events.indexOf('background'),render=e.events.indexOf('render'),exposure=e.events.indexOf('background-visibility:visible');
 assert(background>=0&&render>background&&exposure>render,'Both fresh layers must precede exposure in the resize callback');
 assert(e.events.indexOf('direct-visibility:visible')>render);
}

test('ready valid resize presents matching layers before RAF, even when draw returns no continuation',async()=>{
 const e=environment();try{
  await e.ready();const before=e.scene.diagnostics(),callbacks=before.scheduler.callbacks;
  e.resize(478,230);coherent(e);const after=e.scene.diagnostics();
  assert.equal(after.scheduler.callbacks,callbacks);assert.equal(after.frameCount,before.frameCount+1);
  assert.equal(after.projection.width,478);assert.equal(after.projection.height,230);
  assert.equal(e.renders.at(-1).presentation.contentHeight,230);assert.equal(after.pauseReasons.includes('canonical-idle'),true);
  assert.equal(after.lastFrame.elapsedMs,before.lastFrame.elapsedMs);assert.deepEqual(after.lastFrame.root,before.lastFrame.root);
  assert.equal(e.frames.size,1);assert(after.rgba.fits);assert(after.peakRgba<=64*1024*1024);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});

test('invalid size stays hidden and charged; recovery first presents the held source pose before RAF',async()=>{
 const e=environment({canonicalItems:false});try{
  await e.ready();e.tick(700);const before=e.scene.diagnostics(),held=structuredClone(before.lastFrame),backing=[e.canvas.width,e.canvas.height];
  e.resize(478,120);hidden(e);assert.equal(e.frames.size,0);assert.deepEqual([e.canvas.width,e.canvas.height],backing);
  assert.equal(e.scene.diagnostics().rgba.totalBytes,before.rgba.totalBytes);e.tick(10000);e.events.length=0;
  e.resize(754,230);coherent(e);const recovered=e.scene.diagnostics();
  assert.deepEqual(recovered.lastFrame.root,held.root);assert.equal(recovered.lastFrame.elapsedMs,held.elapsedMs);
  assert.equal(recovered.viewportRecoveries,1);assert.equal(recovered.viewportBlocked,false);
  e.tick(16);assert(e.scene.diagnostics().lastFrame.elapsedMs>held.elapsedMs);assert(e.scene.diagnostics().lastFrame.elapsedMs<1000);
  assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});

test('edit entry, cancel and committed response resize expose the current ghost or authoritative rows before RAF',async()=>{
 const e=environment();try{
  await e.ready();const held=structuredClone(e.scene.diagnostics().dynamicSample.world),elapsed=e.scene.diagnostics().lastFrame.elapsedMs;
  const ghost={...rows[1],placing:false,valid:true};e.scene.setGhost(ghost);e.resize(378,599);coherent(e);
  assert.deepEqual(e.scene.diagnostics().lastFrame.ghost,ghost);assert.equal(e.renders.at(-1).visibility,'planter');
  assert.deepEqual(e.scene.diagnostics().dynamicSample.world,held);assert.equal(e.scene.diagnostics().lastFrame.elapsedMs,elapsed);
  e.events.length=0;e.scene.setGhost(null);e.resize(378,622);coherent(e);
  assert.equal(e.scene.diagnostics().lastFrame.ghost,null);assert.deepEqual(e.scene.diagnostics().lastFrame.records,rows);assert.equal(e.renders.at(-1).visibility,'both');
  e.scene.setGhost(ghost);e.resize(378,599);e.scene.setGhost({...ghost,x:94,y:135});
  e.scene.setCanonicalActionPending(true);e.scene.setGhost(null);const moved=[rows[0],{...rows[1],x:94,y:135}];e.scene.update(snapshot(moved));
  e.events.length=0;e.resize(378,622);coherent(e);
  assert.equal(e.scene.diagnostics().lastFrame.ghost,null);assert.deepEqual(e.scene.diagnostics().lastFrame.records,moved);assert.equal(e.renders.at(-1).visibility,'planter');
  assert.deepEqual(e.scene.diagnostics().dynamicSample.world,held);assert.equal(e.scene.diagnostics().lastFrame.elapsedMs,elapsed);
  e.scene.setCanonicalActionPending(false);e.tick();assert.equal(e.renders.at(-1).visibility,'both');assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});

test('active canonical inspection keeps its source epoch and editing freezes its current pose across immediate resize',async()=>{
 const e=environment({planner:async options=>planCanonicalInspection(options)});try{
  await e.ready();assert.equal(e.scene.inspectCanonicalSlot(rows[0].slotId),true);await Promise.resolve();await Promise.resolve();e.tick(600);
  const before=e.scene.diagnostics();assert.equal(before.interaction.active,true);e.events.length=0;e.resize(478,230);coherent(e);
  assert.equal(e.scene.diagnostics().lastFrame.elapsedMs,before.lastFrame.elapsedMs);assert.deepEqual(e.scene.diagnostics().dynamicSample.world,before.dynamicSample.world);
  e.tick(16);const moving=e.scene.diagnostics();assert(moving.lastFrame.elapsedMs>before.lastFrame.elapsedMs);
  e.scene.setGhost({...rows[1],placing:false,valid:true});e.events.length=0;e.resize(378,599);coherent(e);e.tick(2000);
  assert.equal(e.scene.diagnostics().lastFrame.elapsedMs,moving.lastFrame.elapsedMs);assert.deepEqual(e.scene.diagnostics().dynamicSample.world,moving.dynamicSample.world);
  e.scene.setGhost(null);e.resize(378,622);e.tick(16);assert.equal(e.scene.diagnostics().lastFrame.elapsedMs,moving.lastFrame.elapsedMs+16);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});

test('resize ends pointer ownership before synchronous presentation and disposed owners cannot draw',async()=>{
 const e=environment();try{
  await e.ready();e.scene.setGhost({...rows[1],placing:false,valid:true,x:94,y:135});e.scene.beginPointer();
  e.resize(478,230);coherent(e);assert.equal(e.interruptions,1);assert.equal(e.scene.diagnostics().lastFrame.ghost,null);
  assert.deepEqual(e.scene.diagnostics().lastFrame.records,rows);await e.scene.dispose();const count=e.renders.length;
  e.resize(378,622);e.tick(1000);assert.equal(e.renders.length,count);assert.equal(e.frames.size,0);
 }finally{await e.scene.dispose();}
});

test('missing decoded assets and hidden owners cannot expose a resized surface',async()=>{
 const gate=deferred(),e=environment({decodeGate:gate.promise});try{
  await e.decoding;e.resize(478,230);hidden(e);e.tick();hidden(e);assert.equal(e.renders.length,0);
  gate.resolve();await e.ready();visible(e);e.doc.hidden=true;e.doc.dispatchEvent(new Event('visibilitychange'));
  const count=e.renders.length;e.resize(378,599);hidden(e);assert.equal(e.renders.length,count);e.tick(2000);hidden(e);
  e.doc.hidden=false;e.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(e.frames.size,1);e.tick();visible(e);
  assert.equal(e.scene.diagnostics().pauseReasons.includes('canonical-idle'),true);assert.deepEqual(e.failures,[]);
 }finally{gate.resolve();await e.scene.dispose();}
});

test('unknown snapshot resize never exposes stale objects and retains the fresh empty garden contract',async()=>{
 const e=environment();try{
  await e.ready();const unknown=snapshot();delete unknown.yardRuntime.canonicalPlacements;e.scene.update(unknown);
  const count=e.renders.length;e.resize(478,230);hidden(e);assert.equal(e.renders.length,count);e.tick();visible(e);
  assert.equal(e.scene.diagnostics().lastFrame.canonicalState,'unavailable');assert.equal(e.renders.at(-1).visibility,'empty');
  assert.deepEqual(e.scene.diagnostics().lastFrame.records,[]);assert.equal(e.scene.diagnostics().lastFrame.ghost,null);
  e.events.length=0;e.scene.update(snapshot());coherent(e);assert.deepEqual(e.scene.diagnostics().lastFrame.records,rows);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});

test('context loss or a refused render never reveals the repainted background; restoration requires a fresh render',async()=>{
 const e=environment();try{
  await e.ready();e.context(true);e.resize(478,230);hidden(e);assert(e.events.includes('render-refused'));e.tick();hidden(e);
  e.events.length=0;e.context(false);hidden(e);e.tick();visible(e);assert(e.events.indexOf('background-visibility:visible')>e.events.indexOf('render'));
  e.allowRender(false);e.events.length=0;e.resize(378,599);hidden(e);e.tick();hidden(e);assert(!e.events.includes('background-visibility:visible'));
  e.allowRender(true);e.events.length=0;e.resize(378,622);coherent(e);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});

test('resource rejection and render exceptions preserve hiding and report the existing failure path',async()=>{
 const e=environment();try{
  await e.ready();const before=e.scene.diagnostics(),backing=[e.canvas.width,e.canvas.height],count=e.renders.length;
  e.resize(4000,4000);hidden(e);assert.deepEqual([e.canvas.width,e.canvas.height],backing);assert.equal(e.renders.length,count);
  assert.deepEqual(e.scene.diagnostics().projection,before.projection);assert.match(e.failures.at(-1).message,/admission rejected/);assert.equal(e.failures.at(-1).operation,'resize');
  e.failRender(Error('TEST_RENDER_FAILURE'));e.resize(478,230);hidden(e);assert.equal(e.failures.at(-1).operation,'canonical-render');assert.equal(e.failures.at(-1).message,'TEST_RENDER_FAILURE');
 }finally{await e.scene.dispose();}
});
