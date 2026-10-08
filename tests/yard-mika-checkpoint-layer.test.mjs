import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createMikaYardQaLayer} from '../src/games/companion-yard-v2/mika-qa/mika-yard-layer.mjs';
import {createProjection,CAMERA_DIRECTION} from '../src/games/companion-yard-v2/projection.mjs';
import {mikaItemFixture} from './fixtures/mika-item-input.mjs';
import {bindMikaPersistedItems} from '../src/games/companion-yard-v2/mika-qa/mika-item-approach.mjs';
import {MIKA_NATIVE_SETTLED_SOURCE_HASH,mikaNativeLayoutHash,validateMikaNativeAction} from '../game-logic/yard-v2/mika-native-settled-recipe.mjs';
const vendor=new URL('../src/games/companion-yard-v2/pip-prototype/vendor/three/',import.meta.url);
registerHooks({resolve(s,c,n){return n(s==='three'?new URL('build/three.module.js',vendor).href:s,c);}});
const THREE=await import('three'),{GLTFLoader}=await import(new URL('addons/loaders/GLTFLoader.js',vendor));
const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url));
const target={slotId:'next',goodieId:'yarn_mouse',x:87,y:54,rotationZ:0,condition:'new'};
function fixture(){
 const f=mikaItemFixture([{slotId:'first',goodieId:'yarn_mouse',x:60,y:45,rotationZ:0,condition:'new'},target]);
 const bound=bindMikaPersistedItems(f.snapshot,f.view);assert.equal(bound.ok,true);
 f.snapshot.yardRuntime.nativeMikaCheckpointCapabilities={version:1,enabled:true,action:'yard.saveNativeMikaCheckpoint',actionNoncePrefix:'yard-v2:',status:'absent',hasCheckpoint:false,sourceHash:MIKA_NATIVE_SETTLED_SOURCE_HASH,layoutHash:mikaNativeLayoutHash(bound),priorRevision:0};
 f.snapshot.yardRuntime.nativeMikaCheckpoint=null;return {...f,bound};
}
function acknowledge(f,intent,nonce,previous=null){
 const checked=validateMikaNativeAction(intent.payload.recipeJson,f.bound,previous?.checkpointJson??null);assert.equal(checked.ok,true,checked.reason);
 const cp={format:'native-mika-settled-checkpoint/v1',version:1,revision:intent.payload.priorRevision+1,accountId:f.snapshot.player.id,sourceHash:MIKA_NATIVE_SETTLED_SOURCE_HASH,layoutHash:mikaNativeLayoutHash(f.bound),checkpointJson:checked.checkpointJson,actionId:nonce,savedAt:1000};
 f.snapshot={...f.snapshot,yardRuntime:{...f.snapshot.yardRuntime,nativeMikaCheckpointCapabilities:{...f.snapshot.yardRuntime.nativeMikaCheckpointCapabilities,status:'ready',hasCheckpoint:true,priorRevision:cp.revision},nativeMikaCheckpoint:cp}};return cp;
}
async function owner(){
 const canvas=Object.assign(new EventTarget(),{width:1,height:1});let now=1000,lastPose,rgba;
 const layer=await createMikaYardQaLayer({itemApproach:true,continuation:true,cameraDirection:CAMERA_DIRECTION,presentationNow:()=>now,reserveRGBA:n=>(rgba=n,true),canvasFactory:()=>canvas,parkedCanvasFactory:()=>({width:0,height:0,getContext:()=>({drawImage(){}})}),
  fetchImpl:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),
  loadDependencies:async()=>[THREE,{GLTFLoader},{createPipGardenLighting:()=>({dispose(){}})}],
  rendererFactory:()=>({shadowMap:{},setPixelRatio(){},setClearColor(){},setSize(w,h){canvas.width=w;canvas.height=h;},render(){},dispose(){},forceContextLoss(){}})});
 return {layer,setNow:t=>{now=t;},rgba:()=>rgba,frame(f,stamp,draw=true,projection=createProjection(320,420)){
  now=stamp;const frame=layer.frame({snapshot:f.snapshot,view:f.view,projection,sceneGeometry:{},stamp,shadow(){}});
  if(frame){lastPose=structuredClone(frame.snapshot.sample);if(draw)frame.draw({drawImage(){}});}return frame;
 },pose:()=>lastPose};
}
test('checkpoint export waits for terminal draw and server acknowledgment; reload keeps exact pose and continues',async()=>{
 const original=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});let a,b;
 try{
  const f=fixture();a=await owner();a.frame(f,1000);a.frame(f,7001,false);
  const scope={ownerId:a.layer.commandState().ownerId,actionId:1,clientActionId:'yard-v2:first'};
  assert.equal(a.layer.prepareCheckpoint(scope).reason,'NATIVE_CHECKPOINT_NOT_SETTLED');
  a.frame(f,7001);const stopped=a.pose(),intent=a.layer.prepareCheckpoint(scope);assert.equal(intent.ok,true,intent.reason);
  assert.deepEqual(a.layer.prepareCheckpoint(scope),intent,'same pending nonce retains exact signed payload');
  assert.equal((await a.layer.requestItemArrival('next')).reason,'NATIVE_CHECKPOINT_PENDING');
  const cp=acknowledge(f,intent,scope.clientActionId);a.layer.noteSnapshot(f.snapshot);assert.equal(a.layer.commandState().checkpoint.savedAction,1);
  await a.layer.dispose();assert.equal(a.rgba(),0);
  b=await owner();b.frame(f,8000);assert.deepEqual(b.pose(),stopped,'reload restores complete original terminal sample');
  assert.equal(b.layer.commandState().checkpoint.restored,true);assert.equal(b.layer.commandState().checkpoint.savedAction,1);assert.equal(b.layer.diagnostics().reason,'CHECKPOINT_RESTORED');
  const next=await b.layer.requestItemArrival('next');assert.equal(next.ok,true,next.reason);b.frame(f,9000);
  assert.deepEqual(b.pose(),stopped,'departure starts at the exact restored pose');
  b.frame(f,9000+b.layer.commandState().duration*1000+1);const nextScope={ownerId:b.layer.commandState().ownerId,actionId:2,clientActionId:'yard-v2:next'};
  const nextIntent=b.layer.prepareCheckpoint(nextScope);assert.equal(nextIntent.ok,true,nextIntent.reason);assert.equal(nextIntent.payload.priorRevision,1);
  const second=acknowledge(f,nextIntent,nextScope.clientActionId,cp);b.layer.noteSnapshot(f.snapshot);assert.equal(second.revision,2);assert.equal(b.layer.commandState().checkpoint.savedAction,2);
 }finally{await a?.layer.dispose();await b?.layer.dispose();globalThis.document=original;}
});
test('unknown checkpoint and external revision retire instead of bootstrapping; real resize still cancels restore',async()=>{
 const original=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});let a,b,c;
 try{
  const f=fixture();a=await owner();a.frame(f,1000);a.frame(f,7001);const scope={ownerId:a.layer.commandState().ownerId,actionId:1,clientActionId:'yard-v2:first'};const cp=acknowledge(f,a.layer.prepareCheckpoint(scope),scope.clientActionId);a.layer.noteSnapshot(f.snapshot);
  const replaced=structuredClone(f.snapshot);replaced.yardRuntime.nativeMikaCheckpoint.actionId='yard-v2:foreign';a.layer.noteSnapshot(replaced);assert.equal(a.layer.diagnostics().reason,'NATIVE_CHECKPOINT_REPLACED');assert.equal(a.rgba(),0);
  b=await owner();const broken={...f,snapshot:structuredClone(f.snapshot)};broken.snapshot.yardRuntime.nativeMikaCheckpoint.checkpointJson='{"version":99}';assert.equal(b.frame(broken,8000),null);assert.equal(b.layer.diagnostics().frames,0);assert.equal(b.rgba(),0);
  c=await owner();assert.ok(c.frame(f,9000));assert.equal(c.frame(f,9100,true,createProjection(321,420)),null);assert.equal(c.layer.diagnostics().reason,'VIEWPORT_CHANGED');assert.equal(c.rgba(),0);
  assert.equal(cp.revision,1);
 }finally{await a?.layer.dispose();await b?.layer.dispose();await c?.layer.dispose();globalThis.document=original;}
});
