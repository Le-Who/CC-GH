import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{registerHooks}from'node:module';
import{createMikaYardQaLayer}from'../src/games/companion-yard-v2/mika-qa/mika-yard-layer.mjs';
import{createProjection,CAMERA_DIRECTION}from'../src/games/companion-yard-v2/projection.mjs';
const vendor=new URL('../src/games/companion-yard-v2/pip-prototype/vendor/three/',import.meta.url);registerHooks({resolve(s,c,n){return n(s==='three'?new URL('build/three.module.js',vendor).href:s,c);}});
const THREE=await import('three'),{GLTFLoader}=await import(new URL('addons/loaders/GLTFLoader.js',vendor));
for(const[width,height]of[[320,420],[390,650],[844,252]])test(`QA layer normal camera ${width}x${height}: full native body, read-only lifecycle and abort`,async()=>{
 const oldDocument=globalThis.document;globalThis.document=Object.assign(new EventTarget(),{hidden:false});
 try{
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url));let renders=0,copies=0,reserved=0,vertices=0;
  const canvas=Object.assign(new EventTarget(),{width:1,height:1});
  const layer=await createMikaYardQaLayer({cameraDirection:CAMERA_DIRECTION,reserveRGBA:n=>{reserved=n;return true;},canvasFactory:()=>canvas,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),loadDependencies:async()=>[THREE,{GLTFLoader},{createPipGardenLighting:()=>({dispose(){}})}],rendererFactory:()=>({shadowMap:{},setPixelRatio(){},setClearColor(){},setSize(w,h){canvas.width=w;canvas.height=h;},render(scene,camera){renders++;const v=new THREE.Vector3();scene.traverse(mesh=>{if(!mesh.isMesh)return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).project(camera);vertices++;assert.ok(Math.abs(v.x)<1&&Math.abs(v.y)<1&&Math.abs(v.z)<1,'all evaluated vertices inside actual normal camera');}});},dispose(){},forceContextLoss(){}})});
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
