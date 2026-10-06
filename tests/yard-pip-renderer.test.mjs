import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';
import{createOptionalPipRenderer}from'../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import{admitPipResources}from'../src/games/companion-yard-v2/pip-prototype/resources.mjs';
import{createCleanProjection}from'../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import{makeRoute,sampleRoute}from'../src/games/companion-yard-v2/pip-prototype/routes.mjs';
import{makePlanterInspection,samplePlanterInspection}from'../src/games/companion-yard-v2/pip-prototype/planter-interaction.mjs';
const base=new URL('../src/games/companion-yard-v2/pip-prototype/',import.meta.url);
test('actual pinned GLB parses, shares projection and depth scene, and releases render resources',async()=>{
 const calibration=JSON.parse(await fs.readFile(new URL('data/calibration.json',base))),setup=JSON.parse(await fs.readFile(new URL('data/fixture.json',base))),descriptor=JSON.parse(await fs.readFile(new URL('data/location.json',base)));
 const planterBytes=await fs.readFile(new URL('assets/planter-t2.glb',base)),bytes=await fs.readFile(new URL('assets/pip.glb',base)),fragmentHelper=await fs.readFile(new URL('source/pip-rest-coat.glsl',base),'utf8');
 const canvas=new EventTarget();canvas.style={};canvas.dataset={};canvas.remove=()=>{canvas.parentNode=null;};const host={appendChild:c=>{c.parentNode=host;}};
 const ownedGeometry=new Set(),ownedMaterials=new Set(),retiredGeometry=new Set(),retiredMaterials=new Set();
 const resources=[],geometryBounds=[];let latestBounds=null,disposed=0,lost=0;
 const api=await createOptionalPipRenderer({enabled:true,actorUnitsPerSource:setup.actor.unitsPerSource,loadPlanterAssetBytes:async()=>planterBytes.buffer.slice(planterBytes.byteOffset,planterBytes.byteOffset+planterBytes.byteLength),loadAssetBytes:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),calibration,fragmentHelper,planter:{descriptor:setup.planter,placement:setup.placements[0]},presentationMode:'direct',directHost:host,canvasFactory:()=>canvas,viewport:createCleanProjection(descriptor,390,648).renderViewport,
  admitResources:r=>{resources.push(r);return admitPipResources(r);},setupLighting:({scene})=>{scene.traverse(o=>{if(o.geometry&&!ownedGeometry.has(o.geometry)){ownedGeometry.add(o.geometry);o.geometry.addEventListener('dispose',()=>retiredGeometry.add(o.geometry));}for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])if(!ownedMaterials.has(m)){ownedMaterials.add(m);m.addEventListener('dispose',()=>retiredMaterials.add(m));}});return()=>{};},rendererFactory:({THREE})=>({shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},dispose(){disposed++;},forceContextLoss(){lost++;},render(scene,camera){
   assert.equal(scene.children.length,3);const out=[];
   for(const object of scene.children){let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity,count=0;object.traverseVisible(o=>{if(!o.isMesh)return;const v=new THREE.Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld).project(camera);const x=(v.x+1)*canvas.width/2,y=(1-v.y)*canvas.height/2;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;}});out.push({left,top,right,bottom,width:right-left,height:bottom-top,vertices:count});}latestBounds=out;
  }})});
 const p=createCleanProjection(descriptor,390,648);for(const placement of[0,1]){api.setPlanterPlacement(setup.placements[placement]);let previous=null;
 for(let goal=0;goal<3;goal++){const run=makeRoute(setup,goal,0,previous);for(const at of[0,run.route.totalMs/2,run.route.totalMs]){
  const sample=sampleRoute(setup,run,at);assert.equal(api.renderDirect({sample,point:p.project(sample.world.root)}),true);const rect=api.diagnostics.lastFrame.rect;
  geometryBounds.push({placement,goal,atMs:at,pet:{...latestBounds[0],x:latestBounds[0].left+rect.x,y:latestBounds[0].top+rect.y},planter:{...latestBounds[1],x:latestBounds[1].left+rect.x,y:latestBounds[1].top+rect.y}});
  assert.ok(latestBounds.every(b=>b.left>=0&&b.top>=0&&b.right<=390&&b.bottom<=648));
 }previous=sampleRoute(setup,run,run.route.totalMs).world;}}
 const intent=makePlanterInspection(setup);api.setPlanterPlacement(setup.placements[0]);
 for(const at of[0,420,1357.5,2920,3100,3480,3570,3700,3900,4155,4700,4885]){
  const sample=samplePlanterInspection(setup,intent,at);api.renderDirect({sample,point:p.project(sample.world.root)});
  assert.ok(latestBounds.every(b=>b.left>=0&&b.top>=0&&b.right<=390&&b.bottom<=648),'Actual inspection mesh must fit calibrated garden raster');
  geometryBounds.push({intention:sample.intention,atMs:at,pet:latestBounds[0],planter:latestBounds[1]});
 }
 assert.equal(resources[0].knownCPUBufferPeakBytes,12223736);assert.equal(resources.at(-1).geometryGPUBufferBytes,3912908+115364+60);assert.equal(api.diagnostics.copies,0);assert.equal(api.diagnostics.directPresentations,30);
 api.dispose();api.dispose();assert.equal(disposed,1);assert.equal(lost,1);assert.equal(canvas.width,0);assert.equal(canvas.parentNode,null);assert.deepEqual(retiredGeometry,ownedGeometry);assert.deepEqual(retiredMaterials,ownedMaterials);
 if(process.env.PIP_GEOMETRY_REPORT){await fs.mkdir(path.dirname(process.env.PIP_GEOMETRY_REPORT),{recursive:true});await fs.writeFile(process.env.PIP_GEOMETRY_REPORT,JSON.stringify({status:'CPU projected actual mesh vertices; no browser or GPU pixels',referenceStage:[390,648],resources,ownedGeometryCount:ownedGeometry.size,ownedMaterialCount:ownedMaterials.size,allOwnedGeometryDisposed:retiredGeometry.size===ownedGeometry.size,allOwnedMaterialsDisposed:retiredMaterials.size===ownedMaterials.size,samples:geometryBounds},null,2)+'\n');}
});

test('late authored prop parse and invalid placement release every owned mesh and material',async()=>{
 const THREE=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js');
 const{GLTFLoader}=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/addons/loaders/GLTFLoader.js');
 const{createCalibratedPlanter}=await import('../src/games/companion-yard-v2/pip-prototype/prototype/calibrated-planter.mjs');
 const setup=JSON.parse(await fs.readFile(new URL('data/fixture.json',base))),buffer=await fs.readFile(new URL('assets/planter-t2.glb',base));
 const bytes=()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
 for(const mode of['cancel-after-parse','invalid-placement']){
  const gltf=await new GLTFLoader().parseAsync(bytes(),''),geometry=new Set(),material=new Set(),releasedGeometry=new Set(),releasedMaterial=new Set(),controller=new AbortController();
  gltf.scene.traverse(o=>{if(o.geometry){geometry.add(o.geometry);o.geometry.addEventListener('dispose',()=>releasedGeometry.add(o.geometry));}for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){material.add(m);m.addEventListener('dispose',()=>releasedMaterial.add(m));}});
  const loader={async parseAsync(){if(mode==='cancel-after-parse')controller.abort();return gltf;}};
  await assert.rejects(createCalibratedPlanter(THREE,{descriptor:setup.planter,placement:mode==='invalid-placement'?[0,0,1]:setup.placements[0],loader,loadAssetBytes:async()=>bytes(),signal:controller.signal}),mode==='cancel-after-parse'?/abort/i:/flat canonical/);
  assert.deepEqual(releasedGeometry,geometry);assert.deepEqual(releasedMaterial,material);assert.equal(gltf.scene.children.length,0);
 }
});

test('cancellation during prop byte loading never allocates a stale drawing surface',async()=>{
 const calibration=JSON.parse(await fs.readFile(new URL('data/calibration.json',base))),setup=JSON.parse(await fs.readFile(new URL('data/fixture.json',base))),fragmentHelper=await fs.readFile(new URL('source/pip-rest-coat.glsl',base),'utf8');
 const pip=await fs.readFile(new URL('assets/pip.glb',base)),prop=await fs.readFile(new URL('assets/planter-t2.glb',base)),controller=new AbortController();
 let enter,finish,allocations=0;const entered=new Promise(r=>enter=r),pending=new Promise(r=>finish=r),events=[];
 const loading=createOptionalPipRenderer({enabled:true,signal:controller.signal,actorUnitsPerSource:16,calibration,fragmentHelper,planter:{descriptor:setup.planter,placement:setup.placements[0]},
  loadAssetBytes:async()=>pip.buffer.slice(pip.byteOffset,pip.byteOffset+pip.byteLength),loadPlanterAssetBytes:async()=>{enter();return pending;},
  admitResources:admitPipResources,onResources:r=>events.push(r),setupLighting:()=>()=>{},canvasFactory:()=>{allocations++;throw Error('stale canvas');}});
 await entered;controller.abort();finish(prop.buffer.slice(prop.byteOffset,prop.byteOffset+prop.byteLength));await assert.rejects(loading,/abort/i);
 assert.equal(allocations,0);assert.equal(events.filter(r=>r.event==='disposed').length,1);
});
