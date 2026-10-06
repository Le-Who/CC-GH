import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {createCleanProjection} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import {canvasRectToCSS,validateGardenViewport} from '../src/games/companion-yard-v2/pip-prototype/prototype/surface-placement.mjs';
import {admitPipResources,rgbaAdmission,GARDEN_RASTER,LIMITS,ENCODED_BACKGROUND_CPU_BYTES,COMBINED_KNOWN_CPU_PEAK} from '../src/games/companion-yard-v2/pip-prototype/resources.mjs';
import {makePlanterInspection,samplePlanterInspection} from '../src/games/companion-yard-v2/pip-prototype/planter-interaction.mjs';
import {makeRoute,sampleRoute} from '../src/games/companion-yard-v2/pip-prototype/routes.mjs';
import {canonicalFootprintValid} from '../game-logic/yard-v2/canonical-locations.mjs';
import {uiImageLifetimeLedger} from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import {canonicalItemCatalog} from '../src/games/companion-yard-v2/pip-prototype/item-catalog.mjs';

const base=new URL('../src/games/companion-yard-v2/pip-prototype/',import.meta.url);
const [setup,descriptor,calibration]=await Promise.all(['fixture','location','calibration'].map(async name=>JSON.parse(await fs.readFile(new URL(`data/${name}.json`,base)))));
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-9,`${message}: ${actual} != ${expected}`);
const canonical=v=>({x:v.x*12,y:-v.z*12,z:v.y*12});

async function harness(){
 const [pip,pot,fragmentHelper]=await Promise.all([fs.readFile(new URL('assets/pip.glb',base)),fs.readFile(new URL('assets/planter-t2.glb',base)),fs.readFile(new URL('source/pip-rest-coat.glsl',base),'utf8')]);
 const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),canvas=new EventTarget();canvas.style={};canvas.dataset={};canvas.remove=()=>{canvas.parentNode=null;};
 const host={appendChild:c=>{c.parentNode=host;}},resources=[],events=[];let THREE,scene,camera,allocations=0;
 const api=await createOptionalPipRenderer({enabled:true,actorUnitsPerSource:16,calibration,fragmentHelper,planter:{descriptor:setup.planter,placement:setup.placements[0]},presentationMode:'direct',directHost:host,canvasFactory:()=>canvas,
  viewport:createCleanProjection(descriptor,390,592).renderViewport,loadAssetBytes:async()=>ab(pip),loadPlanterAssetBytes:async()=>ab(pot),
  admitResources:r=>{resources.push(r);return admitPipResources({...r,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES});},onResources:r=>events.push(r),setupLighting:()=>()=>{},
  rendererFactory:o=>{THREE=o.THREE;return{shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){allocations++;canvas.width=w;canvas.height=h;},dispose(){},forceContextLoss(){},render(s,c){scene=s;camera=c;scene.updateMatrixWorld(true);}};}});
 const project=v=>{const ndc=v.clone().project(camera);return{x:(ndc.x+1)*canvas.width/2,y:(1-ndc.y)*canvas.height/2,z:ndc.z};};
 function vertices(object){const result=[],v=new THREE.Vector3();object.traverseVisible(o=>{if(!o.isMesh)return;for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);result.push({world:v.clone(),...project(v)});}});return result;}
 return{api,canvas,resources,events,project,vertices,get THREE(){return THREE;},get scene(){return scene;},get camera(){return camera;},get allocations(){return allocations;}};
}

test('garden raster preserves every static T2 vertex phase through approach, sniff, settle, routes and headings',async()=>{
 const e=await harness(),p=createCleanProjection(descriptor,390,592),inspection=makePlanterInspection(setup);let staticVertices,matrices,rect,phaseSamples=0,maxAnchorError=0;
 function render(sample){
  assert.equal(e.api.renderDirect({sample,point:p.project(sample.world.root)}),true);const d=e.api.diagnostics.lastFrame;
  matrices??={world:d.cameraWorld,projection:d.cameraProjection};assert.deepEqual(d.cameraWorld,matrices.world);assert.deepEqual(d.cameraProjection,matrices.projection);
  const currentRect={x:d.rect.x,y:d.rect.y,width:d.rect.width,height:d.rect.height};rect??=currentRect;assert.deepEqual(currentRect,rect);
  const root=e.project(new e.THREE.Vector3(...d.rootGLTF)),ideal=p.project(sample.world.root);
  close(root.x+d.rect.x,ideal.x,'ideal root X');close(root.y+d.rect.y,ideal.y,'ideal root Y');
  const actual=e.vertices(e.scene.children[1]);staticVertices??=actual;
  actual.forEach((v,i)=>{assert.equal(v.x,staticVertices[i].x);assert.equal(v.y,staticVertices[i].y);assert.equal(v.z,staticVertices[i].z);const q=p.project(canonical(v.world));maxAnchorError=Math.max(maxAnchorError,Math.abs(v.x+d.rect.x-q.x),Math.abs(v.y+d.rect.y-q.y));});
  // Recover the calibrated sole point from each real foot bone. This checks
  // planted/lifted paw contacts independently of the canvas anchor contract.
  for(const [contract,native]of Object.entries(calibration.boneSideMap.contractToNative)){
   const bone=e.scene.getObjectByName('foot'+native);let matched=bone;
   if(!matched)e.scene.traverse(o=>{if(o.isBone&&o.name.replace(/[._]/g,'')==='foot'+native)matched=o;});
   assert.ok(matched,'actual foot bone');const inverseRest=new e.THREE.Matrix4().set(...calibration.restMatrices['foot.'+native].flat()).invert();
   const foot=new e.THREE.Vector3(...calibration.feet[native].soleCenterSource).applyMatrix4(inverseRest).applyMatrix4(matched.matrixWorld),expected=sample.world.feet[contract].position,world=canonical(foot);
   close(world.x,expected.x,'paw world X');close(world.y,expected.y,'paw world Y');close(world.z,expected.z,'paw world Z');
  }
  phaseSamples++;
 }
 try{
  // Dense source-derived samples include every named pose boundary. This is
  // a CPU lattice test, not an assertion about recorded browser pixels.
  for(let t=0;t<=inspection.route.totalMs;t+=40)render(samplePlanterInspection(setup,inspection,t));
  for(const t of[420,2295,2920,3100,3480,3570,3700,3900,4155,4700,4885])render(samplePlanterInspection(setup,inspection,t));
  let previous=null;for(let goal=0;goal<3;goal++){const run=makeRoute(setup,goal,0,previous);for(const t of[0,run.route.totalMs*.25,run.route.totalMs*.5,run.route.totalMs])render(sampleRoute(setup,run,t));previous=sampleRoute(setup,run,run.route.totalMs).world;}
  // Deliberately separate the actor and prop by more than the old 192px tile
  // while rotating measured paw/root transforms together. No route admission
  // is claimed: this isolates the renderer's dynamic-world coverage contract.
  const neutral=sampleRoute(setup,makeRoute(setup,0,0),0);
  for(const [x,y,heading]of[[70,90,0],[122,85,Math.PI/2],[110,135,Math.PI],[80,160,-Math.PI/2]]){
   const sample=structuredClone(neutral),old=sample.world.root,angle=heading-sample.world.heading;
   for(const foot of Object.values(sample.world.feet)){const dx=foot.position.x-old.x,dy=foot.position.y-old.y;foot.position.x=x+dx*Math.cos(angle)-dy*Math.sin(angle);foot.position.y=y+dx*Math.sin(angle)+dy*Math.cos(angle);foot.heading+=angle;}
   sample.world.root={x,y,z:0};sample.world.heading=heading;render(sample);
   for(const v of e.vertices(e.scene.children[0]))assert.ok(v.x>=0&&v.x<=390&&v.y>=0&&v.y<=648&&Math.abs(v.z)<=1,'full dynamic actor mesh stays within garden raster');
  }
  assert.ok(maxAnchorError<1e-9);assert.equal(e.allocations,1);
  if(process.env.PIP_RASTER_REPORT)await fs.writeFile(process.env.PIP_RASTER_REPORT,JSON.stringify({status:'CPU Three projection and real GLB geometry only; browser pixels unverified',phaseSamples,staticVertices:staticVertices.length,staticRasterExcursion:0,maxAnchorError,backing:[e.canvas.width,e.canvas.height],resource:e.api.resources},null,2)+'\n');
 }finally{e.api.dispose();}
});

test('legal moved props, CSS transforms and viewport extremes preserve the reference grid without reallocating',async()=>{
 const e=await harness(),sample=samplePlanterInspection(setup,makePlanterInspection(setup),0),legal=[];
 for(let x=0;x<=200;x+=2)for(let y=0;y<=220;y+=2)if(canonicalFootprintValid(x,y))legal.push({x,y});
 const extremes=[legal.reduce((a,b)=>a.x<b.x?a:b),legal.reduce((a,b)=>a.x>b.x?a:b),legal.reduce((a,b)=>a.y<b.y?a:b),legal.reduce((a,b)=>a.y>b.y?a:b),{x:98,y:118}];
 let root,cameraWorld,cameraProjection;
 try{
  for(const target of extremes)for(const [width,height]of[[280,192],[320,274],[360,568],[390,592],[414,700],[478,192],[754,282],[1024,768],[1280,720]]){
   const p=createCleanProjection(descriptor,width,height,{focus:target}),backingWidth=Math.round(width*2),backingHeight=Math.round(height*2),presentation={a:backingWidth/width,d:backingHeight/height,backingWidth,backingHeight,contentWidth:width,contentHeight:height,offsetLeft:3.25,offsetTop:5.125};
   e.api.resize({viewport:p.renderViewport});e.api.setPlanterPlacement([target.x,target.y,0]);e.api.renderDirect({sample,point:p.project(target),visibility:'planter',presentation});const d=e.api.diagnostics.lastFrame;
   root??=d.rootGLTF;cameraWorld??=d.cameraWorld;cameraProjection??=d.cameraProjection;assert.deepEqual(d.rootGLTF,root);assert.deepEqual(d.cameraWorld,cameraWorld);assert.deepEqual(d.cameraProjection,cameraProjection);
   assert.deepEqual(d.cssRect,canvasRectToCSS(d.rect,presentation));
   for(const v of e.vertices(e.scene.children[1])){assert.ok(v.x>=0&&v.x<=390&&v.y>=0&&v.y<=648&&Math.abs(v.z)<=1,'full real T2 mesh fits fixed raster at legal extremes');const q=p.project(canonical(v.world));close(d.rect.x+v.x*p.scale,q.x,'moved prop X');close(d.rect.y+v.y*p.scale,q.y,'moved prop Y');}
  }
  assert.equal(e.allocations,1);assert.equal(e.api.diagnostics.resizes,1);assert.deepEqual([e.canvas.width,e.canvas.height],[390,648]);
  const before=e.api.diagnostics.renders;e.api.setPaused(true);assert.equal(e.api.renderDirect({sample}),false);e.api.resize({viewport:createCleanProjection(descriptor,320,274).renderViewport});assert.equal(e.api.renderDirect({sample,forcePausedRedraw:true}),true);assert.equal(e.api.diagnostics.renders,before+1);
  const held=e.api.diagnostics.lastFrame;e.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(e.api.renderDirect({sample,forcePausedRedraw:true}),false);assert.deepEqual(e.api.diagnostics.lastFrame,held);
  e.canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(e.api.renderDirect({sample}),false);assert.equal(e.api.renderDirect({sample,forcePausedRedraw:true}),true);assert.deepEqual(e.api.diagnostics.lastFrame.cameraWorld,held.cameraWorld);assert.deepEqual(e.api.diagnostics.lastFrame.cameraProjection,held.cameraProjection);assert.equal(e.api.diagnostics.contextRestorations,1);assert.equal(e.allocations,1);
  assert.throws(()=>e.api.resize({viewport:{...createCleanProjection(descriptor,390,592).renderViewport,pixelsPerRenderUnit:44}}),/calibration/);
 }finally{e.api.dispose();}
 assert.equal(e.canvas.width,0);assert.equal(e.canvas.height,0);assert.equal(e.api.renderDirect({sample}),false);assert.equal(e.api.resize(),false);
});

test('garden backing replaces only the local tile cap and fails closed on total ownership overruns',async()=>{
 const e=await harness();try{
  const row=e.api.resources,pixels=390*648;assert.deepEqual(GARDEN_RASTER,{width:390,height:648,pixels});assert.equal(row.geometryGPUBufferBytes,4028272);assert.equal(row.boneDataTextureGPUBytesEstimate,1024);
  assert.equal(row.drawingBufferColorBytes,1010880);assert.equal(row.resizeDrawingBufferPeakEstimatedBytes,4043520);assert.equal(row.compositorResizePeakBytesEstimate,2021760);assert.equal(row.ownedRGBASurfacePeakBytes,4043520);
  const gpu=row.geometryGPUBufferBytes+row.boneDataTextureGPUBytesEstimate+row.resizeDrawingBufferPeakEstimatedBytes+row.compositorResizePeakBytesEstimate;assert.equal(gpu,10094576);assert.ok(gpu<LIMITS.estimatedGPU);assert.equal(LIMITS.estimatedGPU,12*1024*1024);assert.equal(LIMITS.knownCPU,16*1024*1024);assert.equal(LIMITS.rgba,64*1024*1024);assert.equal(COMBINED_KNOWN_CPU_PEAK+row.boneDataTextureCPUBytesEstimate,15112736);
  const uiBytes=uiImageLifetimeLedger(canonicalItemCatalog).bytes;
  for(const [w,h]of[[320,568],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720]]){
   const backing=w*h*16,r=rgbaAdmission({uiBytes,backgroundBytes:973*1616*4,currentCanvasBytes:backing,pendingCanvasBytes:backing,directSurfaceBytes:row.ownedRGBASurfacePeakBytes});assert.equal(r.fits,true);assert.ok(r.totalBytes<=LIMITS.rgba);
  }
  for(const bad of[{backingWidth:391},{backingHeight:649},{ownedRGBASurfacePeakBytes:0},{compositorResizePeakBytesEstimate:0},{resizeDrawingBufferPeakEstimatedBytes:0},{geometryGPUBufferBytes:LIMITS.estimatedGPU},{boneDataTextureCPUBytesEstimate:LIMITS.knownCPU},{presentationMode:'unknown'}])assert.equal(admitPipResources({...row,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES,...bad}),false);
  assert.equal(rgbaAdmission({uiBytes:LIMITS.rgba,directSurfaceBytes:4}).fits,false);
  for(const bad of[{width:391},{height:649},{width:320,height:648},{anchorRender:[0,NaN,0]}])assert.throws(()=>validateGardenViewport({...createCleanProjection(descriptor,390,592).renderViewport,...bad}),/bounded garden viewport/);
 }finally{e.api.dispose();}
});

test('two committed T2 roots and one ghost share buffers, retain other-item raster phase and dispose once',async()=>{
 const e=await harness(),sample=samplePlanterInspection(setup,makePlanterInspection(setup),0),p=createCleanProjection(descriptor,390,592);
 const records=[{slotId:'a',x:98,y:118},{slotId:'b',x:72,y:145}];
 const ownedGeometry=new Set(),ownedMaterials=new Set(),retiredGeometry=new Map(),retiredMaterials=new Map();
 try{
  e.api.setCanonicalPlacements(records);e.api.renderDirect({sample,point:p.project(records[0]),visibility:'both'});
  const group=e.scene.children[1],roots=group.children;assert.equal(roots.length,3);
  const inventories=roots.map(root=>{const rows=[];root.traverse(o=>{if(o.isMesh)rows.push({geometry:o.geometry,material:o.material});});return rows;});
  assert.equal(inventories[0].length,6);
  for(let i=0;i<inventories[0].length;i++)for(let j=1;j<3;j++){assert.equal(inventories[j][i].geometry,inventories[0][i].geometry);assert.equal(inventories[j][i].material,inventories[0][i].material);}
  group.traverse(o=>{if(o.geometry&&!ownedGeometry.has(o.geometry)){ownedGeometry.add(o.geometry);o.geometry.addEventListener('dispose',()=>retiredGeometry.set(o.geometry,(retiredGeometry.get(o.geometry)??0)+1));}for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])if(!ownedMaterials.has(m)){ownedMaterials.add(m);m.addEventListener('dispose',()=>retiredMaterials.set(m,(retiredMaterials.get(m)??0)+1));}});
  const other=e.vertices(roots[1]),camera=e.api.diagnostics.lastFrame.cameraWorld;
  for(const [x,y,valid]of[[100,115,true],[120,95,true],[72,145,false],[80,160,true]]){
   e.api.setCanonicalPlacements(records,{ghost:{slotId:'a',x,y,valid},selectedSlotId:'a'});e.api.renderDirect({sample,visibility:'both'});
   assert.equal(roots[0].visible,false);assert.equal(roots[1].visible,true);assert.equal(roots[2].visible,true);assert.equal(e.scene.children[0].visible,true);assert.deepEqual(e.api.diagnostics.lastFrame.cameraWorld,camera);
   e.vertices(roots[1]).forEach((v,i)=>{assert.equal(v.x,other[i].x);assert.equal(v.y,other[i].y);assert.equal(v.z,other[i].z);});
   assert.deepEqual(roots[0].position.toArray(),[98/12,0,-118/12]);
  }
  e.api.setCanonicalPlacements(records);assert.equal(roots[0].visible,true);assert.equal(roots[2].visible,false);assert.deepEqual(roots[0].position.toArray(),[98/12,0,-118/12]);
  const moved=[{...records[0],x:110,y:120},records[1]];e.api.setCanonicalPlacements(moved);assert.deepEqual(roots[0].position.toArray(),[110/12,0,-120/12]);
  e.api.setCanonicalPlacements(moved,{ghost:{slotId:'new',x:80,y:160,placing:true}});assert.equal(roots.filter(r=>r.visible).length,3);
  const before=e.api.diagnostics.propInstances;for(const bad of[[...records,{slotId:'c',x:80,y:160}],[records[0],records[0]],[{slotId:'a',x:NaN,y:0}]]){assert.throws(()=>e.api.setCanonicalPlacements(bad),/Bounded/);assert.deepEqual(e.api.diagnostics.propInstances,before);}
  assert.throws(()=>e.api.setCanonicalPlacements(records,{ghost:{slotId:'bad',x:0,y:Infinity}}),/Bounded/);assert.deepEqual(e.api.diagnostics.propInstances,before);
  assert.equal(e.api.resources.geometryGPUBufferBytes,4028272);assert.equal(e.api.resources.propInstanceCapacity,3);assert.equal(e.api.resources.propBuffersShared,true);assert.equal(e.allocations,1);
 }finally{e.api.dispose();e.api.dispose();}
 assert.equal(retiredGeometry.size,ownedGeometry.size);assert.equal(retiredMaterials.size,ownedMaterials.size);for(const n of [...retiredGeometry.values(),...retiredMaterials.values()])assert.equal(n,1);
 assert.equal(e.api.setCanonicalPlacements(records),false);
});
