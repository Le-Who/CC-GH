import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import{createHash}from'node:crypto';
import{createSceneOwner}from'../src/games/companion-yard-v2/scene-owner.mjs';
import{createCleanProjection,assertCleanComposition}from'../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import{makeRoute,sampleRoute,assertPlacement}from'../src/games/companion-yard-v2/pip-prototype/routes.mjs';
import{makePlanterInspection,repeatPlanterInspection,samplePlanterInspection}from'../src/games/companion-yard-v2/pip-prototype/planter-interaction.mjs';
import{acquirePipLease,admitPipResources,rgbaAdmission,KNOWN_CPU_BUFFER_PEAK}from'../src/games/companion-yard-v2/pip-prototype/resources.mjs';
import{createUiImageReserve,uiImageLifetimeLedger}from'../src/games/companion-yard-v2/ui-image-reserve.mjs';
const base=new URL('../src/games/companion-yard-v2/pip-prototype/',import.meta.url);
const setup=JSON.parse(await fs.readFile(new URL('data/fixture.json',base))),descriptor=JSON.parse(await fs.readFile(new URL('data/location.json',base)));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function env(){
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;doc.hasFocus=()=>true;
 const frames=new Map();let next=0,now=0;globalThis.window=win;globalThis.document=doc;globalThis.devicePixelRatio=2;
 globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){}disconnect(){this.disconnected=true;}};
 const request=fn=>{frames.set(++next,fn);return next;},cancel=id=>frames.delete(id);
 const ctx={setTransform(a,b,c,d,e,f){this.transform={a,b,c,d,e,f};},getTransform(){return this.transform||{a:1,b:0,c:0,d:1,e:0,f:0};},clearRect(){},fillRect(){},drawImage(){}};
 const canvas={width:780,height:1296,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:390,height:648})};
 const host={appendChild(c){c.parentNode=this;},getBoundingClientRect:canvas.getBoundingClientRect};
 return{win,doc,frames,request,cancel,canvas,host,now:()=>now,advance(ms){now+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));}};
}
test('R1 and coat remain frozen; reviewed motion and recovery adapters retain exact pins',async()=>{
 const hashes={'assets/pip.glb':'74edd9400bcb69266ce670c977f05bf3ae8c62b448877f4ee34967565815c45b','assets/clean-garden.png':'c159eb042e282930b02c5f84002aa8dfd18ba377ea830985b6a1847b86d2ff79'};
 for(const[p,h]of Object.entries(hashes))assert.equal(createHash('sha256').update(await fs.readFile(new URL(p,base))).digest('hex'),h);
 const frozenHashes={"source/pip-analytical-coat.mjs":"9d99e1475696463b68c3af04c3e0c8b0bc4b716435a227d79978f39a67ef9241","source/pip-rest-coat.glsl":"58fe97c9518a26ee3b458f02e185665e0494e3d4bbde83be9f93711d9638e367","prototype/adaptive-pose-driver.mjs":"5caf9eddc141247655a8ca76e85987e063dcd502d5a7f37d5b04bb184f01fe3e","prototype/calibrated-planter.mjs":"a5cba814b61f358abca97b5c9c7bbf87f05c29a994ed646e7ce3e76e81db8c56","motion/trajectory.mjs":"c004ccd88f71ff35e69fef3433e0c77b461b787d207eef45b1d8e3dd1878669e","motion/kinematics.mjs":"c0c6541ad8f6ae84a6f94f6a9485b1414d80ded831e3bde934106659ef14e7e1"};
 for(const[p,h]of Object.entries(frozenHashes))assert.equal(createHash('sha256').update(await fs.readFile(new URL(p,base))).digest('hex'),h);
});
test('camera shares uniform canonical XYZ mapping with image; short height does not shrink the pet',()=>{
 const full=createCleanProjection(descriptor,390,648),short=createCleanProjection(descriptor,390,400),phone=createCleanProjection(descriptor,320,372);
 assert.equal(full.sourcePixelsPerCss,short.sourcePixelsPerCss);assert.equal(phone.scale,320/390);
 const a=full.project({x:90,y:110,z:0}),b=full.project({x:90,y:110,z:8});assert.equal(a.x,195);assert.equal(a.y,420);assert.ok(Math.abs(b.y-a.y-descriptor.camera.down[2]*descriptor.camera.pixelsPerSceneUnitCss)<1e-10);
 assert.throws(()=>createCleanProjection(descriptor,200,100));
});
test('finite routes keep original supported feet and explicit foreground refusal',()=>{
 for(const placement of[0,1]){let previous=null;for(let goal=0;goal<3;goal++){
  const run=makeRoute(setup,goal,placement,previous);for(let at=0;at<=run.route.totalMs;at+=100){const s=sampleRoute(setup,run,at);assertCleanComposition(createCleanProjection(descriptor,390,648),s.world.root,setup.placements[placement]);}
  previous=sampleRoute(setup,run,run.route.totalMs).world;assertPlacement(setup,placement,previous);
 }}
 assert.throws(()=>makeRoute(setup,3,0));assert.throws(()=>assertCleanComposition(createCleanProjection(descriptor,390,648),{x:20,y:180,z:0},setup.placements[0]),/foreground|artwork/);
});
test('hold-only repeats reuse one immutable admission and reject changed geometry or owner',()=>{
 const local=structuredClone(setup),first=makePlanterInspection(local),previous=samplePlanterInspection(local,first,first.route.totalMs).world;
 const repeated=repeatPlanterInspection(local,first,{previous,attentionVariant:1});
 assert.equal(repeated.approach,first.approach);assert.equal(repeated.gait,first.gait);assert.equal(repeated.check,first.check);assert.equal(repeated.route.totalMs,2025);
 assert.ok(Object.isFrozen(first));assert.ok(Object.isFrozen(first.approach.start.position));assert.ok(Object.isFrozen(first.gait.events[0].to.position));
 assert.throws(()=>repeatPlanterInspection(local,{...first},{previous}),/admission changed/);
 assert.throws(()=>repeatPlanterInspection(structuredClone(local),first,{previous}),/admission changed/);
 const wrong=structuredClone(previous);wrong.heading=.2;assert.throws(()=>repeatPlanterInspection(local,first,{previous:wrong}),/no implicit turn/);
 for(const change of[s=>s.placements[0][0]++,s=>s.actor.unitsPerSource++,s=>s.location.ground[0][0]++,s=>s.planter.inspectionFocusLocalCanonical[0]--]){
  const saved=JSON.stringify(local);change(local);assert.throws(()=>repeatPlanterInspection(local,first,{previous}),/admission changed/);Object.assign(local,JSON.parse(saved));
 }
 const completed=samplePlanterInspection(local,repeated,repeated.route.totalMs).world,again=repeatPlanterInspection(local,repeated,{previous:completed});assert.equal(again.approach,first.approach);assert.equal(again.gait,first.gait);assert.equal(again.route.totalMs,1965);
 assert.deepEqual(samplePlanterInspection(local,again,0).world.feet,previous.feet);
});
test('separate CPU/GPU admission rejects the former undercount and concurrent owners',()=>{
 const release=acquirePipLease();assert.throws(acquirePipLease);release();release();acquirePipLease()();
 const pre={stage:'before-import-and-load',separateFromYard64MiBRGBALedger:true,cpuGLBBytes:4093160,cpuParsedBinaryBufferBytes:4052292,cpuBufferViewCopiesBytes:4052292,knownCPUBufferPeakBytes:KNOWN_CPU_BUFFER_PEAK,contactShadowGeometryCPUBytes:60,contactShadowPendingCPUBytes:0};
 assert.equal(admitPipResources(pre),true);assert.equal(admitPipResources({...pre,knownCPUBufferPeakBytes:7909452}),false);
 assert.equal(rgbaAdmission({uiBytes:23145580,backgroundBytes:6289472,currentCanvasBytes:4043520,pendingCanvasBytes:4043520}).totalBytes,37522092);
 assert.equal(rgbaAdmission({uiBytes:64*1024*1024,currentCanvasBytes:4}).fits,false);
});
test('mode owner stays default-off and awaits legacy retirement before importing Pip; rollback waits too',async()=>{
 const e=env(),old=deferred(),pip=deferred(),events=[];let importCount=0;
 const ui={setAdmissionCheck:fn=>events.push(fn?'gate':'ungated')};
 const factory=id=>(_canvas,options)=>{events.push('create:'+id);return{update(){},setGhost(){},dispose(){events.push('dispose:'+id);return id==='legacy'?old.promise:pip.promise;},diagnostics:()=>({id})};};
 const owner=createSceneOwner(e.canvas,{prototypeAllowed:true,directHost:e.host,uiImageOwner:ui,createLegacy:factory('legacy'),loadPrototype:async()=>{importCount++;return{createPipYardScene:factory('pip')};}});
 await owner.ready;assert.equal(importCount,0);const enabled=owner.setPrototypeEnabled(true);await flush();assert.equal(importCount,0);old.resolve();await enabled;assert.equal(importCount,1);
 const disabled=owner.setPrototypeEnabled(false);await flush();assert.equal(events.filter(x=>x==='create:legacy').length,1);pip.resolve();await disabled;assert.equal(events.filter(x=>x==='create:legacy').length,2);await owner.dispose();
});
test('denied gate, repeated switches, pagehide/bfcache and unmount cannot activate stale owners',async()=>{
 const e=env(),pending=deferred(),created=[];const create=id=>()=>({update(){},dispose:()=>Promise.resolve(),diagnostics:()=>({id})});
 const owner=createSceneOwner(e.canvas,{prototypeAllowed:true,uiImageOwner:{setAdmissionCheck(){}},createLegacy:()=>{created.push('legacy');return create('legacy')();},loadPrototype:()=>pending.promise});
 await owner.ready;const start=owner.setPrototypeEnabled(true);await flush();const stop=owner.setPrototypeEnabled(false);pending.resolve({createPipYardScene:()=>{created.push('pip');return create('pip')();}});await start;await stop;assert.equal(created.includes('pip'),false);
 e.win.dispatchEvent(new Event('pagehide'));await flush();const shown=new Event('pageshow');shown.persisted=true;e.win.dispatchEvent(shown);await flush();assert.equal(owner.diagnostics().enabled,false);await owner.dispose();
 const denied=createSceneOwner(e.canvas,{createLegacy:create('legacy'),loadPrototype:()=>{throw Error('must not import');}});assert.equal(await denied.setPrototypeEnabled(true),false);await denied.dispose();
});
test('new React owner waits for the previous owner retirement across component remount',async()=>{
 const e=env(),pending=deferred(),events=[];let gate;
 const ui={setAdmissionCheck:fn=>{gate=fn;}};
 const legacy=label=>()=>{events.push(label);e.canvas.width=390;ui.setAdmissionCheck(()=>true);return{update(){},dispose(){return Promise.resolve();}};};
 const first=createSceneOwner(e.canvas,{prototypeAllowed:true,uiImageOwner:ui,createLegacy:legacy('legacy-first'),loadPrototype:async()=>({createPipYardScene:()=>({update(){},dispose(){events.push('retire-pip');return pending.promise;}})})});
 await first.ready;await first.setPrototypeEnabled(true);const oldRetired=first.dispose();
 const second=createSceneOwner(e.canvas,{uiImageOwner:ui,createLegacy:legacy('legacy-second'),loadPrototype:()=>{throw Error('unexpected prototype import');}});
 await flush();assert.equal(events.includes('legacy-second'),false);assert.equal(gate(),false);
 pending.resolve();await oldRetired;await second.ready;await flush();assert.equal(events.at(-1),'legacy-second');assert.equal(e.canvas.width,390);assert.equal(gate(),true);await second.dispose();
});
test('R1 default portrait is separately charged; legacy aliases retain their owners',async()=>{
 const inv=JSON.parse(await fs.readFile(new URL('../src/games/companion-yard-v2/ui-image-inventory.json',import.meta.url)));
 assert.equal(inv.rows.some(r=>r.url.includes('2ad3a018')),false);assert.ok(inv.rows.some(r=>String(r.sourceUrls).includes('78d5a3dfdddf')||r.url.includes('78d5a3dfdddf')));const r1=inv.rows.find(r=>r.url.includes('/r1-pip/'));assert.equal(r1.width*r1.height*4,34768);
 assert.equal(uiImageLifetimeLedger().bytes,23364236);
});
test('actual optional scene uses shared stage, remains read-only and cleans asynchronous resources',async()=>{
 const e=env();const{createPipYardScene}=await import('../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs');
 let renders=0,disposals=0,closed=0,paused=false;const options=[],states=[],views=[];
 const rendererFactory=async args=>{assert.equal(args.presentationMode,'direct');return{renderDirect:o=>{options.push(o);renders++;return true;},resize(){},setPaused:p=>paused=p,setPlanterPlacement(){},dispose(){disposals++;},diagnostics:{contextLost:false}};};
 const fetchImpl=async url=>{const bytes=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes),text:async()=>bytes.toString()};};
 const scene=createPipYardScene(e.canvas,{directHost:e.host,uiImageOwner:createUiImageReserve(),onView:v=>views.push(v),onPrototypeState:s=>states.push(s),onFailure:error=>{throw error;},rendererFactory,fetchImpl,decodeImage:async()=>({width:973,height:1616,close(){closed++;}}),now:e.now,requestFrame:e.request,cancelFrame:e.cancel});
 scene.update({serverTime:0,yard:null});await scene.ready;assert.ok(renders>0);assert.equal(views.at(-1).mutable,false);assert.equal(scene.hit({}),null);assert.equal(scene.point({}),null);
 const admitted=makePlanterInspection(setup);assert.equal(scene.diagnostics().route.durationMs,4885);assert.deepEqual(options[0].sample.world,samplePlanterInspection(setup,admitted,0).world);assert.throws(()=>scene.inspectAgain());assert.throws(()=>scene.moveTo(1));assert.throws(()=>scene.movePlanter(1));
 e.advance(scene.diagnostics().route.durationMs);assert.equal(scene.diagnostics().settled,true);e.advance(1000);assert.equal(e.frames.size,0);const before=renders;
 const supported=options.at(-1).sample.world;scene.inspectAgain();e.advance(0);assert.deepEqual(options.at(-1).sample.world.feet,supported.feet);assert.deepEqual(options.at(-1).sample.world.root,supported.root);assert.equal(scene.diagnostics().route.holdOnly,true);assert.equal(scene.diagnostics().inspectionCount,1);e.advance(500);e.win.dispatchEvent(new Event('blur'));const at=scene.diagnostics().lastFrame.elapsedMs;e.advance(3000);assert.equal(scene.diagnostics().lastFrame.elapsedMs,at);assert.equal(paused,true);
 e.doc.hidden=true;e.doc.dispatchEvent(new Event('visibilitychange'));e.win.dispatchEvent(new Event('focus'));assert.equal(paused,true);e.doc.hidden=false;e.doc.dispatchEvent(new Event('visibilitychange'));e.advance(5000);assert.ok(renders>before);
 assert.ok(options.every(o=>o.presentation&&o.sample.world.root.x>0));const d=scene.diagnostics();assert.equal(d.rgba.legacyAtlasBytes,0);assert.ok(d.peakRgba<=64*1024*1024);await scene.dispose();await scene.dispose();assert.equal(disposals,1);assert.equal(closed,1);assert.equal(e.frames.size,0);acquirePipLease()();
});
test('real renderer charges its bounded color/compositor reserve to the scene before creating a surface',async()=>{
 const {createPipYardScene}=await import('../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs'),{createOptionalPipRenderer}=await import('../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs');
 for(const deny of[false,true]){
  const e=env(),failures=[];let allocations=0;
  const extraUI=64*1024*1024-973*1616*4-780*1296*4-4043520+1;
  const ui=deny?{setAdmissionCheck(){},snapshot:()=>({bytes:extraUI})}:createUiImageReserve();
  const fetchImpl=async url=>{const bytes=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes),text:async()=>bytes.toString()};};
  const scene=createPipYardScene(e.canvas,{directHost:e.host,uiImageOwner:ui,onFailure:error=>failures.push(error.message),fetchImpl,decodeImage:async()=>({width:973,height:1616,close(){}}),now:e.now,requestFrame:e.request,cancelFrame:e.cancel,
   rendererFactory:args=>createOptionalPipRenderer({...args,canvasFactory:()=>{allocations++;const c=new EventTarget();c.style={};c.dataset={};c.remove=()=>{};return c;},rendererFactory:({canvas})=>({shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},render(){},dispose(){},forceContextLoss(){}})})});
  try{await scene.ready;const d=scene.diagnostics();assert.equal(allocations,deny?0:1);assert.equal(d.rgba.directSurfaceBytes,deny?0:4043520);assert.equal(d.rgba.totalBytes,d.rgba.uiBytes+d.rgba.backgroundBytes+d.rgba.currentCanvasBytes+d.rgba.directSurfaceBytes);
   if(deny)assert.match(failures[0],/resource admission rejected/);else{assert.deepEqual(failures,[]);assert.equal(d.renderer.renders,1);assert.equal(d.resources.ownedRGBASurfacePeakBytes,4043520);}
  }finally{await scene.dispose();}
 }
});
test('interrupted actual renderer creation holds lease until stale renderer is disposed',async()=>{
 const e=env();const{createPipYardScene}=await import('../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs');
 const loading=deferred(),entered=deferred();let disposed=0,closed=0;
 const fetchImpl=async url=>{const bytes=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes),text:async()=>bytes.toString()};};
 const scene=createPipYardScene(e.canvas,{directHost:e.host,uiImageOwner:createUiImageReserve(),rendererFactory:()=>{entered.resolve();return loading.promise;},fetchImpl,decodeImage:async()=>({width:973,height:1616,close(){closed++;}}),now:e.now,requestFrame:e.request,cancelFrame:e.cancel});
 await entered.promise;const retired=scene.dispose();assert.throws(acquirePipLease);loading.resolve({dispose(){disposed++;}});await retired;
 assert.equal(disposed,1);assert.equal(closed,1);assert.equal(e.frames.size,0);acquirePipLease()();
});
test('context restoration while blurred redraws the displayed pose once and preserves pause',async()=>{
 const e=env();const{createPipYardScene}=await import('../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs');
 let resources,rendered=[];const fetchImpl=async url=>{const bytes=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes),text:async()=>bytes.toString()};};
 const scene=createPipYardScene(e.canvas,{directHost:e.host,uiImageOwner:createUiImageReserve(),rendererFactory:async args=>{resources=args.onResources;return{renderDirect:o=>{rendered.push(o);return true;},resize(){},setPaused(){},dispose(){},diagnostics:{}};},fetchImpl,decodeImage:async()=>({width:973,height:1616,close(){}}),now:e.now,requestFrame:e.request,cancelFrame:e.cancel});
 await scene.ready;e.advance(600);const elapsed=scene.diagnostics().lastFrame.elapsedMs;e.win.dispatchEvent(new Event('blur'));resources({event:'context-lost'});e.advance(3000);resources({event:'context-restored'});assert.equal(e.frames.size,1);e.advance(3000);assert.equal(scene.diagnostics().lastFrame.elapsedMs,elapsed);assert.equal(e.frames.size,0);assert.equal(rendered.at(-1).forcePausedRedraw,true);await scene.dispose();
});

test('failed retirement blocks subsequent mounts instead of admitting overlapping owners',async()=>{
 const e=env(),errors=[];let created=0;
 const first=createSceneOwner(e.canvas,{uiImageOwner:{setAdmissionCheck(){}},createLegacy:()=>({update(){},dispose:()=>Promise.reject(Error('retirement failed'))}),loadPrototype:async()=>{throw Error('unused');}});
 await first.ready;await first.dispose();
 const second=createSceneOwner(e.canvas,{uiImageOwner:{setAdmissionCheck(){}},onError:error=>errors.push(error.message),createLegacy:()=>{created++;return{dispose(){}};},loadPrototype:async()=>{throw Error('unused');}});
 await second.ready;assert.equal(created,0);assert.deepEqual(errors,['retirement failed']);await second.dispose();
});
