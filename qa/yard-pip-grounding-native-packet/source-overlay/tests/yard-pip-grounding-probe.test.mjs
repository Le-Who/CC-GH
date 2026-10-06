import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js';
import {createPipContactShadow,PIP_CONTACT_SHADOW} from '../src/games/companion-yard-v2/pip-prototype/prototype/pip-contact-shadow.mjs';
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {createPipGroundingBrowserProbe,GROUNDING_RECIPE} from './yard-pip-grounding-browser-probe.mjs';
import {admitPipResources,ENCODED_BACKGROUND_CPU_BYTES,LIMITS} from '../src/games/companion-yard-v2/pip-prototype/resources.mjs';
import {createCleanProjection} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import {makePlanterInspection,samplePlanterInspection} from '../src/games/companion-yard-v2/pip-prototype/planter-interaction.mjs';
const base=new URL('../src/games/companion-yard-v2/pip-prototype/',import.meta.url);
const [setup,descriptor,calibration]=await Promise.all(['fixture','location','calibration'].map(async n=>JSON.parse(await fs.readFile(new URL('data/'+n+'.json',base)))));
const [pip,pot,fragmentHelper]=await Promise.all([fs.readFile(new URL('assets/pip.glb',base)),fs.readFile(new URL('assets/planter-t2.glb',base)),fs.readFile(new URL('source/pip-rest-coat.glsl',base),'utf8')]);
const sample=samplePlanterInspection(setup,makePlanterInspection(setup),4885),bytes=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);

test('existing contact buffers stay 60 bytes and recipe preserves ground centers, axes, attenuation and restoration',()=>{
 const a=createPipContactShadow(THREE,{actorUnitsPerSource:16}),geometry=a.mesh.geometry,attrs=Object.values(geometry.attributes),index=geometry.index;
 a.update(sample);const baseline=a.diagnostics;a.setRecipe(GROUNDING_RECIPE.id);a.update(sample);const candidate=a.diagnostics;
 assert.equal(PIP_CONTACT_SHADOW.version,'pip-flat-ground-contact-v1');assert.equal(PIP_CONTACT_SHADOW.drawPrimitives,1);
 assert.equal(attrs.reduce((n,v)=>n+v.array.byteLength,0)+index.array.byteLength,60);assert.equal(a.mesh.geometry,geometry);
 for(const key of ['body','left','right'])assert.deepEqual(candidate[key].slice(0,2),baseline[key].slice(0,2));
 for(const key of ['groundY','bodyAxis','leftAxis','rightAxis','flatSupport'])assert.deepEqual(candidate[key],baseline[key]);
 assert.deepEqual(candidate.strength,[.29,.37,.37]);assert.deepEqual(candidate.body.slice(2),[.39*16/12,.49*16/12]);
 a.setRecipe('baseline');a.update(sample);assert.deepEqual(a.diagnostics,baseline);assert.throws(()=>a.setRecipe('exterior'));assert.throws(()=>a.setRecipe({body:100}));
 a.mesh.geometry.dispose();a.mesh.material.dispose();
});
test('raised supports stay hidden and lifted feet attenuate on the unchanged scale',()=>{
 const a=createPipContactShadow(THREE,{actorUnitsPerSource:16});a.setRecipe(GROUNDING_RECIPE.id);
 const raised=structuredClone(sample);for(const f of Object.values(raised.world.feet))f.position.z=2;a.update(raised);assert.equal(a.mesh.visible,false);
 const lifted=structuredClone(sample);lifted.world.feet.L.position.z=.4;lifted.world.feet.L.planted=false;a.update(lifted);assert.equal(a.mesh.visible,true);assert(Math.abs(a.diagnostics.strength[1]-.37*Math.exp(-1))<1e-12);assert.equal(a.diagnostics.strength[2],.37);
 a.mesh.geometry.dispose();a.mesh.material.dispose();
});
async function harness(){
 const canvas=new EventTarget();canvas.style={};canvas.dataset={};canvas.remove=()=>{canvas.parentNode=null;};const host={appendChild(c){c.parentNode=host;}};
 const geometries=new Set(),materials=new Set(),released=new Set();let calls=0,disposals=0;
 class Renderer{constructor(){this.shadowMap={};this.info={render:{calls:7,triangles:123}};}setClearColor(){}getClearAlpha(){return 0;}setPixelRatio(){}setSize(w,h){canvas.width=w;canvas.height=h;}render(scene,camera){calls++;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);scene.traverse(o=>{if(o.geometry&&!geometries.has(o.geometry)){geometries.add(o.geometry);o.geometry.addEventListener('dispose',()=>released.add(o.geometry));}for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])if(!materials.has(m)){materials.add(m);m.addEventListener('dispose',()=>released.add(m));}});}dispose(){disposals++;}forceContextLoss(){}}
 const probe=createPipGroundingBrowserProbe({createRenderer:options=>createOptionalPipRenderer({...options,canvasFactory:()=>canvas,rendererFactory:()=>options.rendererFactory({THREE:{...THREE,WebGLRenderer:Renderer}})})});
 const api=await probe.rendererFactory({enabled:true,actorUnitsPerSource:16,calibration,fragmentHelper,presentationMode:'direct',directHost:host,planter:{descriptor:setup.planter,placement:setup.placements[0]},viewport:createCleanProjection(descriptor,390,648).renderViewport,loadAssetBytes:async()=>bytes(pip),loadPlanterAssetBytes:async()=>bytes(pot),admitResources:r=>admitPipResources({...r,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES}),setupLighting({scene}){const lights=[new THREE.AmbientLight(new THREE.Color().setRGB(.78,.83,.93,THREE.LinearSRGBColorSpace),.55),... [1.8,.76,1.2].map(v=>new THREE.DirectionalLight(0xffffff,v))];scene.add(...lights);return()=>lights.forEach(l=>scene.remove(l));}});
 return {api,probe,geometries,materials,released,get calls(){return calls;},get disposals(){return disposals;}};
}
test('actual pinned R1/T2 renderer changes only light and shadow parameters, with exact resources and no extra render pass',async()=>{
 const h=await harness();try{
 h.api.setCanonicalPlacements([{slotId:'one',x:98,y:118},{slotId:'two',x:72,y:145}]);h.api.renderDirect({sample,visibility:'both'});const resources=h.api.resources,frame=h.api.diagnostics.lastFrame,props=h.api.diagnostics.propInstances;
 assert.equal(resources.geometryGPUBufferBytes,4028332);assert.equal(resources.knownCPUBufferPeakBytes,12223736);assert.equal(resources.ownedRGBASurfacePeakBytes,4043520);assert.equal(resources.contactShadowImageTextureBytes,0);assert.deepEqual(Object.keys(resources).filter(k=>k.startsWith('quality')),[]);
 const gpu=resources.geometryGPUBufferBytes+resources.boneDataTextureGPUBytesEstimate+resources.resizeDrawingBufferPeakEstimatedBytes+resources.compositorResizePeakBytesEstimate;assert.equal(gpu,10094636);assert(gpu<LIMITS.estimatedGPU);
 h.probe.hold({selectedSlotId:'one'});const count=h.calls;h.probe.render(GROUNDING_RECIPE.id);assert.equal(h.calls,count+1);assert.deepEqual(h.api.diagnostics.lastFrame,frame);assert.deepEqual(h.api.diagnostics.propInstances,props);assert.deepEqual(h.api.resources,resources);
 assert.deepEqual(h.probe.diagnostics().appliedLights,[GROUNDING_RECIPE.ambient,...GROUNDING_RECIPE.directional]);assert.equal(h.api.diagnostics.copies,0);
 h.probe.render('baseline');assert.deepEqual(h.probe.diagnostics().appliedLights.map(l=>l.intensity),[.55,1.8,.76,1.2]);assert.deepEqual(h.api.diagnostics.contactShadow.strength,[.21,.29,.29]);
 assert.throws(()=>h.probe.choose('contact'));assert.throws(()=>h.probe.choose('exterior'));assert.equal(h.api.renderDirect({sample}),false);
 }finally{h.api.dispose();}assert.equal(h.disposals,1);assert.equal(h.released.size,h.geometries.size+h.materials.size);assert.equal(h.probe.diagnostics().disposed,true);
});

test('idle UI frames before Inspect cannot consume the bounded motion trace',async()=>{
 const h=await harness();try{
   for(let i=0;i<40;i++)h.api.renderDirect({sample,visibility:'both'});
   assert.equal(h.probe.motion().trace.length,0);h.probe.beginTrace();assert.throws(()=>h.probe.beginTrace(),/One live route/);
   h.api.renderDirect({sample,visibility:'both'});const moving=samplePlanterInspection(setup,makePlanterInspection(setup),1000);assert.equal(moving.world.moving,true);h.api.renderDirect({sample:moving,visibility:'both'});
   assert(h.probe.motion().trace.some(r=>r.world.moving));assert(h.probe.motion().trace.length<=32);assert.equal(h.probe.motion().timeScale,1);
 }finally{h.api.dispose();}
});
