import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{createProjection,CAMERA_DIRECTION}from'../src/games/companion-yard-v2/projection.mjs';
const source=readFileSync(new URL('../src/games/companion-yard-v2/scene.mjs',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function harness(hidden=false){
 const originals=new Map(),set=(k,v)=>{originals.set(k,globalThis[k]);globalThis[k]=v;};
 set('document',Object.assign(new EventTarget(),{hidden}));set('location',{origin:'https://fixture.invalid'});set('devicePixelRatio',1);
 set('ResizeObserver',class{observe(){}disconnect(){}});set('requestAnimationFrame',()=>1);set('cancelAnimationFrame',()=>{});set('createImageBitmap',async()=>({width:1,height:1,close(){}}));
 const still=()=>({canvas:[1,1],worldPixelScale:1,pivotPx:[0,0]});
 set('fetch',async url=>({ok:true,blob:async()=>({}),json:async()=>String(url).includes('runtime-media.json')?{manifestRevision:'fixture-r1',renderBindings:{}}:{'sun-cushion-clean':still(),'yarn-mouse-clean':still(),'yarn-mouse-settled-clean':still()}}));
 class Atlas{constructor(){this.decodedBytes=0;this.reservedBytes=0;this.active=0;this.entries=new Map();this.pending=new Map();this.jobs=new Map();this.pinned=new Set();}reserveExternal(){return true;}dispose(){}}
 class Clock{update(value){this.value=value;}read(){return this.value??0;}}
 class Telemetry{atlas(){}snapshot(){return{};}}
 const policy={maxDecodedBytes:64*1024*1024,maxPages:3},ui={snapshot:()=>({bytes:0}),setAdmissionCheck(){}};
 const env={createUiImageReserve:()=>ui,uiImageLifetimeLedger:()=>({bytes:0}),LEGACY_M2_BACKGROUND:{url:'/background.webp',canvas:[1,1],decodedBytes:4},drawLegacyBackground(){},AtlasCache:Atlas,CANONICAL_ATLAS_POLICY:policy,CURRENT_FOUR_ATLAS_POLICY:policy,FAMILY_ATLAS_POLICY:policy,createProjection,CAMERA_DIRECTION,footprintPolygon(){return[];},FrameTelemetry:Telemetry,PresentationClock:Clock,courtyardPresentation:s=>({yard:s.yard,pets:[],props:[],plans:{},bowls:[]}),MIKA_SCENE:{footprints:{},exclusions:[]},clips:{},MIKA_RUNTIME_MEDIA_REVISION:'fixture-r1',FOOD_BINDINGS:{},foodBowlPresentation:()=>[],MIKA_ACTOR_REFERENCE:{},MOCHI_ACTOR_REFERENCE:{},PEBBLE_ACTOR_REFERENCE:{},PIP_ACTOR_REFERENCE:{},FAMILY_ACTOR_REFERENCES:{},YARD_ACTOR_PROFILES:{},resolveActorProfile:()=>false,createActorMediaEntry:()=>({manifest:{},propBindings:{}})};
 const body=source.replace(/^import[^\n]*\n/gm,'').replace('export function','function');
 const factory=new Function(...Object.keys(env),body+';return createCourtyardScene;')(...Object.values(env));
 const ctx=new Proxy({},{get:()=>()=>{}}),canvas={width:1,height:1,getContext:()=>ctx,getBoundingClientRect:()=>({width:390,height:650})};
 return{create:options=>{const scene=factory(canvas,{...options,uiImageOwner:ui});scene.update({player:{id:'same'},yard:{remodel:'meadow'},yardRuntime:{serverNow:1000}});return scene;},restore(){for(const[k,v]of originals)if(v===undefined)delete globalThis[k];else globalThis[k]=v;}};
}
test('ghost begun and cleared during module loading prevents QA actor admission',async()=>{
 const h=harness(),entered=deferred(),gate=deferred();let scene,created=0;
 try{scene=h.create({loadQaLayer:()=>{entered.resolve();return gate.promise;}});await entered.promise;scene.setGhost({slotId:'editing'});scene.setGhost(null);gate.resolve({createMikaYardQaLayer:async()=>{created++;return{diagnostics:()=>({phase:'waiting-layout'}),dispose(){}};}});await scene.ready;assert.equal(created,0);assert.equal(scene.diagnostics().qaMika.reason,'ITEM_EDITING');assert.equal(scene.diagnostics().ready,true);}
 finally{await scene?.dispose();h.restore();}
});
test('editing during actor construction is applied before any first frame',async()=>{
 const h=harness(),entered=deferred(),gate=deferred(),aborts=[];let scene;
 try{scene=h.create({loadQaLayer:async()=>({createMikaYardQaLayer:async()=>{entered.resolve();return gate.promise;}})});await entered.promise;scene.setGhost({slotId:'editing'});scene.setGhost(null);gate.resolve({abort:r=>aborts.push(r),diagnostics:()=>({phase:'aborted'}),dispose(){}});await scene.ready;assert.deepEqual(aborts,['ITEM_EDITING']);}
 finally{await scene?.dispose();h.restore();}
});
test('same-account session epoch changed during module loading remains fenced',async()=>{
 const h=harness(),entered=deferred(),gate=deferred();let scene,epoch=0,created=0;
 try{scene=h.create({qaSessionEpoch:()=>epoch,loadQaLayer:()=>{entered.resolve();return gate.promise;}});await entered.promise;epoch++;scene.update({player:{id:'same'},yard:{remodel:'meadow'}});gate.resolve({createMikaYardQaLayer:async()=>{created++;return{diagnostics:()=>({}),dispose(){}};}});await scene.ready;assert.equal(created,0);assert.equal(scene.diagnostics().qaMika.reason,'SESSION_CHANGED');}
 finally{await scene?.dispose();h.restore();}
});

test('hidden then visible during module loading cannot admit a late QA actor',async()=>{
 const h=harness(),entered=deferred(),gate=deferred();let scene,created=0;
 try{scene=h.create({loadQaLayer:()=>{entered.resolve();return gate.promise;}});await entered.promise;document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));gate.resolve({createMikaYardQaLayer:async()=>{created++;return{diagnostics:()=>({}),dispose(){}};}});await scene.ready;assert.equal(created,0);assert.equal(scene.diagnostics().qaMika.reason,'VISIBILITY_INTERRUPTED');assert.equal(scene.diagnostics().ready,true);}
 finally{await scene?.dispose();h.restore();}
});

test('a scene created hidden never starts QA even if shown before assets finish',async()=>{
 const h=harness(true);let scene,imports=0;
 try{scene=h.create({loadQaLayer:async()=>{imports++;return{};}});document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await scene.ready;assert.equal(imports,0);assert.equal(scene.diagnostics().qaMika.reason,'VISIBILITY_INTERRUPTED');}
 finally{await scene?.dispose();h.restore();}
});

test('real entry fences A→B→A while module or actor construction is pending',async()=>{
 for(const actorPending of [false,true])for(const context of [undefined,{accountSession:Object.freeze({revision:1})}]){
  const h=harness(),entered=deferred(),gate=deferred(),aborts=[];let scene,created=0;
  try{
   const entry=readFileSync(new URL('../src/games/companion-yard-v2/scene-entry.mjs',import.meta.url),'utf8').replace(/^import.*\n/gm,'').replace('export function','function').replaceAll('import.meta.env','env');
   const make=new Function('env','createLegacy','createSceneOwner','DEFAULT_RENDER_PROFILE','PAINTED_RENDER_PROFILE',entry+';return createCourtyardScene;')({VITE_YARD_MIKA_QA:'true'},(_,options)=>h.create({...options,loadQaLayer:()=>{if(!actorPending){entered.resolve();return gate.promise;}return Promise.resolve({createMikaYardQaLayer:()=>{created++;entered.resolve();return gate.promise;}});}}),(_,options)=>options.createLegacy({},{}),'default','painted');
   scene=make({},{});scene.update({player:{id:'A'},yard:{remodel:'meadow'}},context);await entered.promise;scene.update({player:{id:'B'},yard:{remodel:'meadow'}},context);scene.update({player:{id:'A'},yard:{remodel:'meadow'}},context);
   const layer={abort:r=>aborts.push(r),diagnostics:()=>({phase:'aborted'}),dispose(){}};
   gate.resolve(actorPending?layer:{createMikaYardQaLayer:async()=>{created++;return layer;}});await scene.ready;
   if(actorPending)assert.deepEqual(aborts,['SESSION_CHANGED']);else{assert.equal(created,0);assert.equal(scene.diagnostics().qaMika.reason,'SESSION_CHANGED');}
  }finally{await scene?.dispose();h.restore();}
 }
});


test('normal scene disposal awaits a pending native planner retirement before replacement',async()=>{
 const h=harness(),gate=deferred();let scene,disposed=0;
 try{scene=h.create({loadQaLayer:async()=>({createMikaYardQaLayer:async()=>({diagnostics:()=>({phase:'parked'}),dispose(){disposed++;return gate.promise;}})})});await scene.ready;
  let settled=false;const retiring=scene.dispose().then(()=>settled=true);await Promise.resolve();assert.equal(disposed,1);assert.equal(settled,false);gate.resolve();await retiring;assert.equal(settled,true);
 }finally{gate.resolve();await scene?.dispose();h.restore();}
});
