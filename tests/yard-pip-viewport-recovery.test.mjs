import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';
import{createPipYardScene}from'../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs';
import{createUiImageReserve}from'../src/games/companion-yard-v2/ui-image-reserve.mjs';
import{acquirePipLease}from'../src/games/companion-yard-v2/pip-prototype/resources.mjs';
import{supportsCleanViewport,CLEAN_STAGE_MIN}from'../src/games/companion-yard-v2/pip-prototype/projection.mjs';

function environment(width=390,height=549.125){
 const win=new EventTarget(),doc=new EventTarget(),observers=[],frames=new Map(),requests=[],renders=[],states=[],failures=[];let id=0,now=0,creates=0,disposals=0,resizes=0;
 doc.hidden=false;doc.hasFocus=()=>true;globalThis.window=win;globalThis.document=doc;globalThis.devicePixelRatio=2;
 globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 const ctx={setTransform(a,b,c,d,e,f){this.t={a,b,c,d,e,f};},getTransform(){return this.t||{a:1,b:0,c:0,d:1,e:0,f:0};},clearRect(){},fillRect(){},drawImage(){}};
 const rect=()=>({left:0,top:0,width,height}),canvas={style:{visibility:''},width:0,height:0,getContext:()=>ctx,getBoundingClientRect:rect};
 const host={style:{visibility:''},appendChild(){},getBoundingClientRect:rect};
 const fetchImpl=async url=>{requests.push(String(url));const bytes=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes),text:async()=>bytes.toString()};};
 const scene=createPipYardScene(canvas,{directHost:host,uiImageOwner:createUiImageReserve(),now:()=>now,requestFrame:fn=>{frames.set(++id,fn);return id;},cancelFrame:n=>frames.delete(n),fetchImpl,
  decodeImage:async()=>({width:973,height:1616,close(){}}),onFailure:error=>failures.push(error.message),onPrototypeState:s=>states.push(s),
  rendererFactory:async()=>{creates++;return{renderDirect:options=>{renders.push(structuredClone(options));return true;},resize(){resizes++;},setPaused(){},setPlanterPlacement(){},dispose(){disposals++;},diagnostics:{}};}});
 return{scene,canvas,host,win,doc,frames,requests,renders,states,failures,get creates(){return creates;},get disposals(){return disposals;},get resizes(){return resizes;},
  resize(w,h){width=w;height=h;for(const o of observers)if(!o.disconnected)o.fn();},
  tick(ms){now+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));}};
}
async function until(predicate){const end=Date.now()+5000;while(!predicate()){if(Date.now()>end)throw Error('Timed out waiting for local state');await new Promise(r=>setTimeout(r,2));}}
test('supported phone/landscape resizes retain one settled owner and the same displayed root',async()=>{
 const e=environment();try{await e.scene.ready;e.tick(4000);const held=structuredClone(e.scene.diagnostics().lastFrame);
  for(const[w,h]of[[478,212],[754,282],[320,274],[390,572]]){e.resize(w,h);e.tick(16);const s=e.scene.diagnostics();assert.equal(s.viewportBlocked,false);assert.equal(s.settled,true);assert.deepEqual(s.lastFrame.root,held.root);assert.equal(s.lastFrame.elapsedMs,held.elapsedMs);assert.equal(s.projection.width,w);assert.equal(s.projection.height,h);assert.equal(e.canvas.style.visibility,'');assert.equal(e.host.style.visibility,'');assert.equal(e.frames.size,0);}
  assert.equal(e.creates,1);assert.equal(e.disposals,0);assert.deepEqual(e.failures,[]);assert.deepEqual(CLEAN_STAGE_MIN,{width:280,height:192});assert.equal(supportsCleanViewport(478,160.25),false);
 }finally{await e.scene.dispose();}
});
test('undersized moving preview remains charged, pauses without RAF, then redraws the exact displayed pose',async()=>{
 const e=environment();try{await e.scene.ready;e.tick(700);const held=structuredClone(e.scene.diagnostics().lastFrame),backing=[e.canvas.width,e.canvas.height],resources=e.scene.diagnostics().rgba.totalBytes,resizes=e.resizes;
  e.resize(478,160.25);const blocked=e.scene.diagnostics();assert.equal(blocked.enabled,true);assert.equal(blocked.viewportBlocked,true);assert.deepEqual(blocked.rejectedViewport,{width:478,height:160.25});assert.ok(blocked.pauseReasons.includes('viewport'));
  assert.deepEqual([e.canvas.width,e.canvas.height],backing);assert.equal(blocked.rgba.totalBytes,resources);assert.equal(e.resizes,resizes);assert.equal(e.canvas.style.visibility,'hidden');assert.equal(e.host.style.visibility,'hidden');assert.equal(e.frames.size,0);assert.throws(()=>e.scene.moveTo(1));assert.throws(()=>e.scene.movePlanter(1));
  e.tick(10000);assert.deepEqual(e.scene.diagnostics().lastFrame,held);e.resize(754,230.25);e.tick(16);const resumed=e.scene.diagnostics();assert.equal(resumed.viewportBlocked,false);assert.equal(resumed.viewportRecoveries,1);assert.deepEqual(resumed.lastFrame.root,held.root);assert.equal(resumed.lastFrame.elapsedMs,held.elapsedMs);assert.equal(e.creates,1);assert.equal(e.disposals,0);assert.equal(e.host.style.visibility,'');
  e.tick(16);assert.ok(e.scene.diagnostics().lastFrame.elapsedMs>held.elapsedMs);assert.ok(e.scene.diagnostics().lastFrame.elapsedMs<1000);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});
test('viewport recovery preserves overlapping blur/hidden pause reasons',async()=>{
 const e=environment();try{await e.scene.ready;e.tick(4000);const held=structuredClone(e.scene.diagnostics().lastFrame);e.resize(478,120);e.win.dispatchEvent(new Event('blur'));e.doc.hidden=true;e.doc.dispatchEvent(new Event('visibilitychange'));e.tick(2000);
  e.resize(754,230);e.tick(16);let s=e.scene.diagnostics();assert.equal(s.viewportBlocked,false);assert.ok(s.pauseReasons.includes('blur'));assert.ok(s.pauseReasons.includes('hidden'));assert.deepEqual(s.lastFrame.root,held.root);assert.equal(e.frames.size,0);
  e.win.dispatchEvent(new Event('focus'));assert.ok(e.scene.diagnostics().pauseReasons.includes('hidden'));e.doc.hidden=false;e.doc.dispatchEvent(new Event('visibilitychange'));e.tick(16);s=e.scene.diagnostics();assert.equal(s.settled,true);assert.deepEqual(s.pauseReasons,[]);assert.equal(e.frames.size,0);
 }finally{await e.scene.dispose();}
});
test('initial undersize defers large asset loading and resumes only when supported',async()=>{
 const e=environment(478,120);try{await until(()=>e.scene.diagnostics().viewportBlocked);assert.equal(e.requests.length,2);assert.equal(e.requests.some(u=>/clean-garden|pip\.glb|calibration/.test(u)),false);assert.equal(e.creates,0);assert.equal(e.frames.size,0);assert.throws(acquirePipLease);
  e.resize(754,230);await e.scene.ready;e.tick(4000);assert.equal(e.creates,1);assert.equal(e.scene.diagnostics().settled,true);assert.equal(e.scene.diagnostics().viewportBlocked,false);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});
test('disable while waiting for viewport releases the wait and lease without starting a renderer',async()=>{
 const e=environment(478,120);await until(()=>e.scene.diagnostics().viewportBlocked);await e.scene.dispose();await e.scene.ready;
 assert.equal(e.creates,0);assert.equal(e.requests.length,2);assert.equal(e.frames.size,0);assert.equal(e.canvas.style.visibility,'');assert.equal(e.host.style.visibility,'');acquirePipLease()();e.resize(754,230);assert.equal(e.creates,0);
});

test('supported resize hides both old surfaces until matching redraw, and a blocked resize cancels queued paused work',async()=>{
 const e=environment();try{await e.scene.ready;e.tick(4000);const held=structuredClone(e.scene.diagnostics().lastFrame);e.resize(478,212);assert.equal(e.canvas.style.visibility,'hidden');assert.equal(e.host.style.visibility,'hidden');e.tick(16);assert.equal(e.canvas.style.visibility,'');assert.equal(e.host.style.visibility,'');
  e.win.dispatchEvent(new Event('blur'));e.resize(754,230);assert.equal(e.frames.size,1);e.resize(478,120);assert.equal(e.frames.size,0);e.tick(3000);assert.deepEqual(e.scene.diagnostics().lastFrame.root,held.root);assert.equal(e.host.style.visibility,'hidden');
  e.resize(754,230);assert.equal(e.frames.size,1);e.tick(16);assert.equal(e.host.style.visibility,'');assert.ok(e.scene.diagnostics().pauseReasons.includes('blur'));assert.equal(e.frames.size,0);assert.deepEqual(e.failures,[]);
 }finally{await e.scene.dispose();}
});
