import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js';
import {pipGroundingRecipe,createPipGardenLighting} from '../src/games/companion-yard-v2/pip-prototype/grounding-recipe.mjs';
import {createPipContactShadow} from '../src/games/companion-yard-v2/pip-prototype/prototype/pip-contact-shadow.mjs';
import {createPipYardScene} from '../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs';
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {createSceneOwner} from '../src/games/companion-yard-v2/scene-owner.mjs';
import {createUiImageReserve} from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import {PIP_GROUNDING_PREVIEW_RECIPE,pipPreviewGroundingRecipe} from '../src/games/companion-yard-v2/pip-preview-gate.mjs';
const warm=PIP_GROUNDING_PREVIEW_RECIPE;
const lightsOf=scene=>scene.children.filter(o=>o.isAmbientLight||o.isDirectionalLight).map(l=>({color:l.color.toArray(),intensity:l.intensity,position:l.position.toArray(),target:l.target?.position.toArray()??null}));

test('runtime recipe matches qualified values, restores exact original lights, and retains light objects/directions',()=>{
 const scene=new THREE.Scene(),renderer={},target=new THREE.Vector3(7,.5,-11),owner=createPipGardenLighting({THREE,scene,renderer,target});
 const baseline=owner.diagnostics,objects=[...scene.children];assert.equal(renderer.toneMapping,THREE.NoToneMapping);assert.equal(objects.length,7);
 assert.deepEqual(baseline.lights.map(l=>[l.color,l.intensity]),[[[.78,.83,.93],.55],[[1,1,1],1.8],[[1,1,1],.76],[[1,1,1],1.2]]);
 owner.setRecipe(warm);assert.deepEqual(owner.diagnostics.lights.map(l=>[l.color,l.intensity]),[[[.86,.87,.82],.55],[[.99,.96,.88],2.15],[[.93,.96,1],.44],[[1,.98,.94],.42]]);
 assert.deepEqual(scene.children,objects);assert.deepEqual(owner.diagnostics.lights.map(l=>[l.position,l.target]),baseline.lights.map(l=>[l.position,l.target]));
 owner.setRecipe('baseline');assert.deepEqual(owner.diagnostics,baseline);assert.throws(()=>owner.setRecipe('unknown'));assert.deepEqual(owner.diagnostics,baseline);
 assert(Object.isFrozen(pipGroundingRecipe(warm).ambient.color));assert.throws(()=>pipGroundingRecipe(warm).contact.body[0]=50);assert.throws(()=>pipGroundingRecipe({id:warm}));
 owner.dispose();owner.dispose();assert.equal(scene.children.length,0);assert.equal(owner.setRecipe(warm),false);
});
test('warm contact keeps the same quad, actual soles and unsupported-surface behavior; baseline restores exactly',()=>{
 const source={world:{root:{x:90,y:120,z:0},heading:.25,feet:{L:{position:{x:88,y:121,z:0},heading:.25,planted:true},R:{position:{x:92,y:119,z:0},heading:.25,planted:true}}}};
 const shadow=createPipContactShadow(THREE,{actorUnitsPerSource:16});shadow.update(source);const baseline=shadow.diagnostics,geometry=shadow.mesh.geometry,material=shadow.mesh.material;
 assert.deepEqual(baseline.strength,[.21,.29,.29]);shadow.setRecipe(warm);shadow.update(source);const candidate=shadow.diagnostics;
 assert.deepEqual(candidate.strength,[.29,.37,.37]);for(const key of ['body','left','right'])assert.deepEqual(candidate[key].slice(0,2),baseline[key].slice(0,2));
 for(const key of ['groundY','bodyAxis','leftAxis','rightAxis','flatSupport'])assert.deepEqual(candidate[key],baseline[key]);
 assert.deepEqual(candidate.body.slice(2),[.39*(16/12),.49*(16/12)]);assert.deepEqual(candidate.left.slice(2),[.15*(16/12),.12*(16/12)]);
 const lifted=structuredClone(source);lifted.world.feet.L.position.z=.4;lifted.world.feet.L.planted=false;shadow.update(lifted);assert(Math.abs(shadow.diagnostics.strength[1]-.37*Math.exp(-1))<1e-12);
 const raised=structuredClone(source);for(const f of Object.values(raised.world.feet))f.position.z=2;shadow.update(raised);assert.equal(shadow.mesh.visible,false);
 shadow.setRecipe('baseline');shadow.update(source);assert.deepEqual(shadow.diagnostics,baseline);assert.equal(shadow.mesh.geometry,geometry);assert.equal(shadow.mesh.material,material);assert.equal(geometry.attributes.position.array.byteLength+geometry.index.array.byteLength,60);
 geometry.dispose();material.dispose();
});
function environment(t){
 const keys=['window','document','devicePixelRatio','ResizeObserver'];const old=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const win=new EventTarget(),doc=new EventTarget(),frames=new Map();doc.hidden=false;doc.hasFocus=()=>true;let next=0;
 Object.assign(globalThis,{window:win,document:doc,devicePixelRatio:2,ResizeObserver:class{observe(){}disconnect(){}}});
 t.after(()=>{for(const key of keys){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key];}});
 const rect=()=>({left:0,top:0,width:390,height:648}),ctx={setTransform(a,b,c,d,e,f){this.t={a,b,c,d,e,f};},getTransform(){return this.t||{a:1,b:0,c:0,d:1,e:0,f:0};},clearRect(){},fillRect(){},drawImage(){}};
 const canvas={style:{visibility:''},width:0,height:0,getContext:()=>ctx,getBoundingClientRect:rect},host={style:{visibility:''},appendChild(c){c.parentNode=this;},getBoundingClientRect:rect};
 return {canvas,host,frames,request:fn=>{frames.set(++next,fn);return next;},cancel:id=>frames.delete(id)};
}
test('actual optional Yard owner forwards explicit preview recipe into real R1 renderer and returns to an exact baseline owner',async t=>{
 const e=environment(t),runs=[];let live=0;
 for(const search of ['?yardPipPreview=1','?yardPipPreview=1&yardPipGrounding='+warm,'?yardPipPreview=1']){
   const recipe=pipPreviewGroundingRecipe({enabled:true,search}),errors=[],lights=[],renders=[],ui=createUiImageReserve();let allocations=0;
   const fetchImpl=async url=>{const b=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),json:async()=>JSON.parse(b),text:async()=>b.toString()};};
   const options={groundingRecipe:recipe,directHost:e.host,uiImageOwner:ui,onFailure:error=>errors.push(error.message),fetchImpl,decodeImage:async()=>({width:973,height:1616,close(){}}),now:()=>0,requestFrame:e.request,cancelFrame:e.cancel,
     rendererFactory:args=>{assert.equal(args.groundingRecipe,recipe);return createOptionalPipRenderer({...args,canvasFactory:()=>{assert.equal(live++,0);allocations++;const c=new EventTarget();c.style={};c.dataset={};c.remove=()=>{c.parentNode=null;};return c;},rendererFactory:({canvas})=>({shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},dispose(){live--;},forceContextLoss(){},render(scene,camera){scene.updateMatrixWorld(true);lights.push(lightsOf(scene));renders.push({camera:camera.matrixWorld.toArray(),geometry:scene.children.filter(o=>o.isGroup).map(o=>o.matrixWorld.toArray())});}})});},
   };
   const owner=createSceneOwner(e.canvas,{...options,prototypeAllowed:true,createLegacy:()=>({update(){},dispose(){},diagnostics:()=>({ready:true})}),loadPrototype:async()=>({createPipYardScene})});
   try{
     await owner.ready;assert.equal(allocations,0);await owner.setPrototypeEnabled(true);await owner.ready;
     const d=owner.diagnostics().scene;assert.deepEqual(errors,[]);assert.equal(d.groundingRecipe,recipe);assert.equal(d.renderer.groundingRecipe,recipe);assert.equal(d.renderer.contactShadow.recipe,recipe);
     assert.deepEqual(d.renderer.contactShadow.strength,recipe==='baseline'?[.21,.29,.29]:[.29,.37,.37]);assert.equal(d.resources.geometryGPUBufferBytes,4028332);assert.equal(d.resources.knownCPUBufferPeakBytes,12223736);assert.equal(d.resources.ownedRGBASurfacePeakBytes,4043520);assert.equal(d.renderer.copies,0);assert.equal(d.rgba.fits,true);
     assert.equal(Object.keys(d.resources).some(k=>k.startsWith('quality')),false);assert.equal(d.resources.assetImageTextureBytes,0);assert.equal(d.renderer.contactShadow.version,'pip-flat-ground-contact-v1');
     runs.push({recipe,lights:lights.at(-1),contact:d.renderer.contactShadow,resources:d.resources,pose:d.lastFrame,render:renders.at(-1)});
     await owner.setPrototypeEnabled(false);assert.equal(live,0);assert.equal(owner.diagnostics().mode,'legacy');
   }finally{await owner.dispose();}
 }
 assert.deepEqual(runs[2],runs[0]);assert.deepEqual(runs[1].pose,runs[0].pose);assert.deepEqual(runs[1].render,runs[0].render);assert.deepEqual(runs[1].resources,runs[0].resources);assert.equal(live,0);
});
test('real React preview wiring forwards the selected recipe without importing QA or weakening the build gate',async()=>{
 const release=await fs.readFile(new URL('../src/games/companion-yard-v2/YardReleaseGame.jsx',import.meta.url),'utf8'),courtyard=await fs.readFile(new URL('../src/games/companion-yard-v2/CourtyardGame.jsx',import.meta.url),'utf8'),scene=await fs.readFile(new URL('../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs',import.meta.url),'utf8');
 assert.match(release,/pipPreviewGroundingRecipe\(\{enabled:allowPipPrototype/);assert.match(release,/pipGroundingRecipe=\{pipGroundingRecipe\}/);assert.match(courtyard,/groundingRecipe:allowPipPrototype\?pipGroundingRecipe:'baseline'/);
 assert.doesNotMatch(scene,/quality|__yardGroundingNative|tests\//);assert.match(scene,/createPipGardenLighting/);
});
