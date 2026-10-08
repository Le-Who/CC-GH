import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{registerHooks}from'node:module';
import{createMikaYardQaLayer}from'../src/games/companion-yard-v2/mika-qa/mika-yard-layer.mjs';
import{createProjection,CAMERA_DIRECTION}from'../src/games/companion-yard-v2/projection.mjs';
import {mikaItemFixture} from './fixtures/mika-item-input.mjs';
const vendor=new URL('../src/games/companion-yard-v2/pip-prototype/vendor/three/',import.meta.url);registerHooks({resolve(s,c,n){return n(s==='three'?new URL('build/three.module.js',vendor).href:s,c);}});
const THREE=await import('three'),{GLTFLoader}=await import(new URL('addons/loaders/GLTFLoader.js',vendor));
for(const [width,height] of [[320,420],[390,650],[844,252]])test(`persisted-item native approach uses the normal camera ${width}x${height} and cancels current target changes`,async()=>{
 const oldDocument=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});let layer;
 try{
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url)),canvas=Object.assign(new EventTarget(),{width:1,height:1});let vertices=0,renders=0;
  layer=await createMikaYardQaLayer({itemApproach:true,cameraDirection:CAMERA_DIRECTION,presentationNow:()=>1000,reserveRGBA:()=>true,canvasFactory:()=>canvas,
   fetchImpl:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),
   loadDependencies:async()=>[THREE,{GLTFLoader},{createPipGardenLighting:()=>({dispose(){}})}],
   rendererFactory:()=>({shadowMap:{},setPixelRatio(){},setClearColor(){},setSize(w,h){canvas.width=w;canvas.height=h;},
    render(scene,camera){renders++;const v=new THREE.Vector3();scene.traverse(mesh=>{if(!mesh.isMesh)return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).project(camera);vertices++;assert.ok(Math.abs(v.x)<1&&Math.abs(v.y)<1&&Math.abs(v.z)<1);}});},dispose(){},forceContextLoss(){}})});
  const {snapshot,view}=mikaItemFixture([{slotId:'qa-mouse',goodieId:'yarn_mouse',x:64,y:54,condition:'new'}]);
  const original=structuredClone(snapshot),args={snapshot,view,projection:createProjection(width,height),sceneGeometry:{},shadow:()=>{}};
  for(const time of [0,3.9,4,4.001,4.5,4.9,5.5,6,4.2]){const f=layer.frame({...args,stamp:1000+time*1000});assert.ok(f,JSON.stringify(layer.diagnostics()));f.draw({drawImage(){}});}
  assert.equal(renders,9);assert.ok(vertices>450000);assert.deepEqual(snapshot,original);
  const d=layer.diagnostics();assert.equal(d.itemApproach.target.slotId,'qa-mouse');assert.equal(d.itemApproach.interactionReady,false);assert.equal(d.itemApproach.savedVisitReady,false);
  const changed=structuredClone(snapshot);changed.yard.placedGoodies[0].x++;
  layer.noteSnapshot(changed);assert.equal(layer.diagnostics().phase,'aborted');assert.equal(layer.diagnostics().reason,'LAYOUT_CHANGED');
  assert.equal(layer.frame({...args,stamp:2500}),null);assert.equal(layer.diagnostics().resources.retainedModelGPUBytes,0);
 }finally{layer?.dispose();globalThis.document=oldDocument;}
});
for(const[width,height]of[[320,420],[390,650],[844,252]])test(`QA layer normal camera ${width}x${height}: full native body, read-only lifecycle and abort`,async()=>{
 const oldDocument=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});
 try{
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url));let renders=0,copies=0,reserved=0,vertices=0;
  const canvas=Object.assign(new EventTarget(),{width:1,height:1});
  const layer=await createMikaYardQaLayer({cameraDirection:CAMERA_DIRECTION,presentationNow:()=>1000,reserveRGBA:n=>{reserved=n;return true;},canvasFactory:()=>canvas,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),loadDependencies:async()=>[THREE,{GLTFLoader},{createPipGardenLighting:()=>({dispose(){}})}],rendererFactory:()=>({shadowMap:{},setPixelRatio(){},setClearColor(){},setSize(w,h){canvas.width=w;canvas.height=h;},render(scene,camera){renders++;const v=new THREE.Vector3();scene.traverse(mesh=>{if(!mesh.isMesh)return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).project(camera);vertices++;assert.ok(Math.abs(v.x)<1&&Math.abs(v.y)<1&&Math.abs(v.z)<1,'all evaluated vertices inside actual normal camera');}});},dispose(){},forceContextLoss(){}})});
  assert.equal(layer.diagnostics().phase,'waiting-layout');
  const snapshot={player:{id:'qa-account'},yard:{remodel:'meadow',placedGoodies:[],bowls:[]}},before=structuredClone(snapshot),view={yard:snapshot.yard,props:[],pets:[],bowls:[]};
  const args={snapshot,view,projection:createProjection(width,height),sceneGeometry:{footprints:{},exclusions:[]},stamp:1000,shadow:()=>{}};
  const frame=layer.frame(args);assert.ok(frame);frame.draw({drawImage(){copies++;}});assert.equal(renders,1);assert.equal(copies,1);assert.deepEqual(snapshot,before);
  for(const time of [.35,.875,1.9,3.95]){const next=layer.frame({...args,stamp:1000+time*1000});assert.ok(next);next.draw({drawImage(){copies++;}});}
  assert.equal(renders,5);assert.equal(copies,5);assert.ok(vertices>250000);
  layer.noteSnapshot({...snapshot,yard:{...snapshot.yard,placedGoodies:[{slotId:'changed',goodieId:'yarn_mouse',x:50,y:50}]}});
  assert.equal(layer.diagnostics().phase,'aborted');assert.equal(reserved,0);assert.equal(layer.frame({...args,stamp:1500}),null);assert.equal(renders,5);layer.dispose();
 }finally{globalThis.document=oldDocument;}
});

test('finite cruise clock starts only after first successful canvas presentation, excluding preparation and GPU delay',async()=>{
 const oldDocument=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});
 let layer;
 try{
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url)),canvas=Object.assign(new EventTarget(),{width:1,height:1});let now=1000,copies=0,clockReads=0,failRender=false;
  const makeLayer=()=>createMikaYardQaLayer({cameraDirection:CAMERA_DIRECTION,presentationNow:()=>{clockReads++;return now;},reserveRGBA:()=>true,canvasFactory:()=>canvas,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),loadDependencies:async()=>[THREE,{GLTFLoader},{createPipGardenLighting:()=>({dispose(){}})}],rendererFactory:()=>({shadowMap:{},setPixelRatio(){},setClearColor(){},setSize(w,h){canvas.width=w;canvas.height=h;now+=200;},render(){now+=300;if(failRender)throw Error('FIRST_RENDER_FAILED');},dispose(){},forceContextLoss(){}})});
  layer=await makeLayer();
  const snapshot={player:{id:'qa-clock'},yard:{remodel:'meadow',placedGoodies:[],bowls:[]}},view={yard:snapshot.yard,props:[],pets:[],bowls:[]};
  const args={snapshot,view,projection:createProjection(320,420),sceneGeometry:{footprints:{},exclusions:[]},shadow:()=>{}};
  const prepared=layer.frame({...args,stamp:1000});assert.ok(prepared);assert.equal(layer.diagnostics().time,0);assert.equal(clockReads,0,'Preparation cannot own presentation epoch');
  // An undrawn prepared frame must not consume motion or expire the passage.
  const first=layer.frame({...args,stamp:2000});assert.equal(layer.diagnostics().time,0);assert.equal(clockReads,0);
  now=2300;first.draw({drawImage(){now+=50;copies++;}});const presentedAt=now;
  assert.equal(clockReads,1);assert.equal(copies,1);assert.equal(layer.diagnostics().time,0);
  const next=layer.frame({...args,stamp:presentedAt+100});assert.ok(next);assert.ok(Math.abs(layer.diagnostics().time-.1)<1e-10,'First100ms of actual presentation is100ms of gait');
  next.draw({drawImage(){copies++;}});assert.equal(clockReads,1,'Epoch must never restart on later frames');
  assert.ok(layer.frame({...args,stamp:presentedAt+4000}),'Full authored four-second interval remains available');assert.equal(layer.diagnostics().time,4);assert.equal(layer.diagnostics().phase,'running');
  assert.equal(layer.frame({...args,stamp:presentedAt+4001}),null);assert.equal(layer.diagnostics().phase,'complete');assert.equal(layer.diagnostics().resources.retainedModelCPUUpperBound,0);
  layer.dispose();failRender=true;clockReads=0;layer=await makeLayer();
  layer.frame({...args,stamp:now}).draw({drawImage(){throw Error('Copy must not run after failed render');}});
  assert.equal(layer.diagnostics().phase,'aborted');assert.equal(layer.diagnostics().reason,'FIRST_RENDER_FAILED');assert.equal(layer.diagnostics().frames,0);assert.equal(clockReads,0,'A failed first render cannot start the clock');assert.equal(layer.diagnostics().resources.retainedModelGPUBytes,0);
 }finally{layer?.dispose();globalThis.document=oldDocument;}
});

test('continued owner reuses one actual model across both actions, refuses in place and cannot revive after cancellation',async()=>{
 const oldDocument=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});let layer,releasePlanner;
 try{
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url)),canvas=Object.assign(new EventTarget(),{width:1,height:1});let fetches=0,now=1000,modelState,holdPlanning=false;
  layer=await createMikaYardQaLayer({itemApproach:true,continuation:true,yieldPlanning:()=>new Promise(resolve=>{if(holdPlanning)releasePlanner=resolve;else setTimeout(resolve,0);}),cameraDirection:CAMERA_DIRECTION,presentationNow:()=>now,reserveRGBA:()=>true,canvasFactory:()=>canvas,
   fetchImpl:async()=>{fetches++;return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};},
   loadDependencies:async()=>[THREE,{GLTFLoader},{createPipGardenLighting:()=>({dispose(){}})}],
   rendererFactory:()=>({shadowMap:{},setPixelRatio(){},setClearColor(){},setSize(w,h){canvas.width=w;canvas.height=h;},
    render(scene){modelState=[];scene.traverse(node=>{if(node.isBone)modelState.push([node.name,...node.matrixWorld.elements,...node.scale.toArray()]);});},dispose(){},forceContextLoss(){}})});
  const {snapshot,view}=mikaItemFixture([{slotId:'qa-mouse',goodieId:'yarn_mouse',x:60,y:45,condition:'new'},{slotId:'qa-next',goodieId:'yarn_mouse',x:88,y:62,condition:'new'}]);
  const args={snapshot,view,projection:createProjection(320,420),sceneGeometry:{},shadow:()=>{}};
  const draw=t=>{now=1000+t*1000;const f=layer.frame({...args,stamp:now});assert.ok(f);f.draw({drawImage(){}});};
  assert.deepEqual(await layer.requestItemArrival('qa-mouse'),{ok:false,reason:'NATIVE_ACTOR_NOT_SETTLED'});
  draw(0);draw(6);const terminal=structuredClone(modelState);draw(6.01);
  const d=layer.diagnostics();assert.equal(d.phase,'parked');assert.equal(d.time,6);assert.equal(d.actionsStarted,1);assert.equal(d.actionsCompleted,1);assert.equal(d.resources.graphicsRetired,false);assert.deepEqual(modelState,terminal);
  assert.deepEqual(await layer.requestItemArrival('qa-mouse'),{ok:false,reason:'ALREADY_ARRIVED'});
  assert.deepEqual(await layer.requestItemArrival('missing'),{ok:false,reason:'NATIVE_ITEM_TARGET_UNAVAILABLE'});
  draw(7.5);assert.deepEqual(modelState,terminal);assert.equal(layer.diagnostics().actorInstance,d.actorInstance);assert.deepEqual(layer.diagnostics().position,d.position);assert.equal(layer.diagnostics().time,6);assert.equal(fetches,1);
  assert.equal((await layer.requestItemArrival('qa-next')).ok,true);assert.equal(layer.diagnostics().actorInstance,d.actorInstance);assert.deepEqual(layer.diagnostics().plan.start,d.position);
  assert.equal((await layer.requestItemArrival('qa-next')).reason,'NATIVE_ACTOR_NOT_SETTLED');
  draw(7.6);assert.deepEqual(modelState,terminal,'First continuation draw must be the exact previous terminal model pose');
  for(const elapsed of [.5,2.5,5.35,5.35001,6.4,7.35,7.35001,9.35,9.35001,11.35,11.4])draw(7.6+elapsed);
  const second=layer.diagnostics();assert.equal(second.phase,'parked');assert.equal(second.actionsStarted,2);assert.equal(second.actionsCompleted,2);assert.equal(second.actorInstance,d.actorInstance);assert.equal(fetches,1);assert.notDeepEqual(second.position,d.position);
  holdPlanning=true;const late=layer.requestItemArrival('qa-mouse');assert.equal(layer.diagnostics().phase,'planning');assert.equal(typeof releasePlanner,'function');
  const retainedPose=structuredClone(modelState);draw(20);assert.deepEqual(modelState,retainedPose,'The same parked actor continues rendering while the planner yields');
  const moved=structuredClone(snapshot);moved.yard.placedGoodies[1].x++;
  layer.noteSnapshot(moved);const cancelled=layer.diagnostics();assert.equal(cancelled.phase,'aborted');assert.equal(cancelled.reason,'LAYOUT_CHANGED');assert.deepEqual(cancelled.position,second.position);assert.equal(cancelled.actorInstance,d.actorInstance);assert.equal(cancelled.resources.retainedModelGPUBytes,0);assert.equal(cancelled.resources.rgbaBytes,0);
  assert.deepEqual(await layer.requestItemArrival('qa-mouse'),{ok:false,reason:'NATIVE_ACTION_UNAVAILABLE'});assert.equal(fetches,1);assert.equal(layer.frame({...args,stamp:9000}),null);
  let settled=false;const retirement=layer.dispose().then(()=>settled=true);await Promise.resolve();assert.equal(settled,false,'Owner retirement waits for pending planner release');releasePlanner();
  assert.equal((await late).ok,false);await retirement;assert.equal(settled,true);assert.equal(layer.diagnostics().phase,'disposed');assert.equal(layer.diagnostics().planning.pending,false);assert.equal(layer.diagnostics().actionsStarted,2);
 }finally{releasePlanner?.();await layer?.dispose();globalThis.document=oldDocument;}
});


test('same-layout runtime revocation during yielded planning cannot acknowledge or start an obsolete action',async()=>{
 const oldDocument=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});let layer,release;
 try{
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url)),canvas=Object.assign(new EventTarget(),{width:1,height:1});let firstYield=true;
  layer=await createMikaYardQaLayer({itemApproach:true,continuation:true,cameraDirection:CAMERA_DIRECTION,presentationNow:()=>1000,reserveRGBA:()=>true,canvasFactory:()=>canvas,
   yieldPlanning:()=>firstYield?(firstYield=false,new Promise(resolve=>release=resolve)):Promise.resolve(),
   fetchImpl:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),
   loadDependencies:async()=>[THREE,{GLTFLoader},{createPipGardenLighting:()=>({dispose(){}})}],
   rendererFactory:()=>({shadowMap:{},setPixelRatio(){},setClearColor(){},setSize(w,h){canvas.width=w;canvas.height=h;},render(){},dispose(){},forceContextLoss(){}})});
  const {snapshot,view}=mikaItemFixture([{slotId:'first',goodieId:'yarn_mouse',x:60,y:45,condition:'new'},{slotId:'second',goodieId:'yarn_mouse',x:88,y:62,condition:'new'}]);
  const args={snapshot,view,projection:createProjection(308,346),sceneGeometry:{},shadow:()=>{}};
  layer.frame({...args,stamp:1000}).draw({drawImage(){}});layer.frame({...args,stamp:7010}).draw({drawImage(){}});const parked=layer.diagnostics();assert.equal(parked.phase,'parked');
  const pending=layer.requestItemArrival('second');assert.equal(layer.diagnostics().phase,'planning');assert.equal(typeof release,'function');
  const revoked=structuredClone(snapshot);revoked.yardRuntime.status='blocked';layer.noteSnapshot(revoked);
  // Complete the pending planner before any next frame can perform its guard.
  release();const result=await pending;assert.equal(result.ok,false);assert.equal(result.reason,'NATIVE_ITEM_RUNTIME_UNSUPPORTED');
  const d=layer.diagnostics();assert.equal(d.phase,'aborted');assert.equal(d.actionsStarted,1);assert.equal(d.actorInstance,parked.actorInstance);assert.deepEqual(d.position,parked.position);assert.equal(d.resources.graphicsRetired,true);assert.equal(d.resources.retainedModelGPUBytes,0);assert.equal(d.planning.pending,false);
  assert.equal(layer.frame({...args,stamp:8000}),null);assert.equal((await layer.requestItemArrival('second')).ok,false);
 }finally{release?.();await layer?.dispose();globalThis.document=oldDocument;}
});
