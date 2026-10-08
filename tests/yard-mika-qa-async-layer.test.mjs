import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{registerHooks}from'node:module';
import{createMikaYardQaLayer}from'../src/games/companion-yard-v2/mika-qa/mika-yard-layer.mjs';
const vendor=new URL('../src/games/companion-yard-v2/pip-prototype/vendor/three/',import.meta.url);registerHooks({resolve(s,c,n){return n(s==='three'?new URL('build/three.module.js',vendor).href:s,c);}});
const THREE=await import('three'),{GLTFLoader}=await import(new URL('addons/loaders/GLTFLoader.js',vendor));
const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url));
const freshDocument=hidden=>Object.assign(new EventTarget(),{hidden});
const fetchAsset=async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const lightModule={createPipGardenLighting:()=>({dispose(){}})};
test('cancellation during GLB parse disposes the parsed model before returning',async()=>{
 const old=globalThis.document;globalThis.document=freshDocument(false);let layer;
 try{
  let release,enteredResolve;const entered=new Promise(r=>enteredResolve=r),controller=new AbortController(),counts={geometry:0,material:0,skeleton:0};
  const model={traverse(visit){visit({geometry:{dispose(){counts.geometry++;}},material:{dispose(){counts.material++;}},skeleton:{dispose(){counts.skeleton++;}}});}};
  class DelayedLoader{parseAsync(){enteredResolve();return new Promise(r=>release=r);}}
  const pending=createMikaYardQaLayer({signal:controller.signal,cameraDirection:[5.66,-8,3.97],reserveRGBA:()=>true,fetchImpl:fetchAsset,loadDependencies:async()=>[THREE,{GLTFLoader:DelayedLoader},lightModule]});
  await entered;controller.abort();release({scene:model,parser:{json:{}}});layer=await pending;
  assert.equal(layer.diagnostics().phase,'aborted');assert.deepEqual(counts,{geometry:1,material:1,skeleton:1});
 }finally{layer?.dispose();globalThis.document=old;}
});
test('hidden at construction prevents QA imports or allocations',async()=>{
 const old=globalThis.document;globalThis.document=freshDocument(true);let layer,calls=0;
 try{layer=await createMikaYardQaLayer({reserveRGBA:()=>true,loadDependencies:async()=>{calls++;throw Error('unexpected import');}});assert.equal(layer.diagnostics().phase,'aborted');assert.equal(calls,0);}
 finally{layer?.dispose();globalThis.document=old;}
});
test('hidden then visible while dependencies load remains a sticky interruption',async()=>{
 const old=globalThis.document;globalThis.document=freshDocument(false);let layer;
 try{
  let release,enteredResolve,fetches=0;const entered=new Promise(r=>enteredResolve=r),canvas=Object.assign(new EventTarget(),{width:1,height:1});
  const pending=createMikaYardQaLayer({cameraDirection:[5.66,-8,3.97],reserveRGBA:()=>true,canvasFactory:()=>canvas,fetchImpl:async()=>{fetches++;return fetchAsset();},loadDependencies:()=>{enteredResolve();return new Promise(r=>release=r);},rendererFactory:()=>({shadowMap:{},setPixelRatio(){},setClearColor(){},dispose(){},forceContextLoss(){}})});
  await entered;document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));release([THREE,{GLTFLoader},lightModule]);layer=await pending;
  assert.equal(layer.diagnostics().phase,'aborted');assert.equal(layer.diagnostics().reason,'VISIBILITY_INTERRUPTED');assert.equal(fetches,0);
 }finally{layer?.dispose();globalThis.document=old;}
});
