import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';
import{createOptionalPipRenderer}from'../vendor/r5/src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import{admitPipResources}from'../vendor/r5/src/games/companion-yard-v2/pip-prototype/resources.mjs';
import{createCleanProjection}from'../vendor/r5/src/games/companion-yard-v2/pip-prototype/projection.mjs';
import{makeRoute,sampleRoute}from'../vendor/r5/src/games/companion-yard-v2/pip-prototype/routes.mjs';
const base=new URL('../vendor/r5/src/games/companion-yard-v2/pip-prototype/',import.meta.url);
test('actual pinned GLB parses, shares projection and depth scene, and releases render resources',async()=>{
 const calibration=JSON.parse(await fs.readFile(new URL('data/calibration.json',base))),setup=JSON.parse(await fs.readFile(new URL('data/fixture.json',base))),descriptor=JSON.parse(await fs.readFile(new URL('data/location.json',base)));
 const bytes=await fs.readFile(new URL('assets/pip.glb',base)),fragmentHelper=await fs.readFile(new URL('source/pip-rest-coat.glsl',base),'utf8');
 const canvas=new EventTarget();canvas.style={};canvas.dataset={};canvas.remove=()=>{canvas.parentNode=null;};const host={appendChild:c=>{c.parentNode=host;}};
 const resources=[],geometryBounds=[];let latestBounds=null,disposed=0,lost=0;
 const api=await createOptionalPipRenderer({enabled:true,loadAssetBytes:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),calibration,fragmentHelper,planter:{descriptor:setup.planter,placement:setup.placements[0]},presentationMode:'direct',directHost:host,canvasFactory:()=>canvas,widthCss:192,heightCss:192,dpr:1,sourcePixelsPerCss:43.98087,
  admitResources:r=>{resources.push(r);return admitPipResources(r);},setupLighting:()=>()=>{},rendererFactory:({THREE})=>({shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},dispose(){disposed++;},forceContextLoss(){lost++;},render(scene,camera){
   assert.equal(scene.children.length,2);const out=[];
   for(const object of scene.children){let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity,count=0;object.traverse(o=>{if(!o.isMesh)return;const v=new THREE.Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld).project(camera);const x=(v.x+1)*96,y=(1-v.y)*96;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;}});out.push({left,top,right,bottom,width:right-left,height:bottom-top,vertices:count});}latestBounds=out;
  }})});
 const p=createCleanProjection(descriptor,390,648);for(const placement of[0,1]){api.setPlanterPlacement(setup.placements[placement]);let previous=null;
 for(let goal=0;goal<3;goal++){const run=makeRoute(setup,goal,0,previous);for(const at of[0,run.route.totalMs/2,run.route.totalMs]){
  const sample=sampleRoute(setup,run,at);assert.equal(api.renderDirect({sample,point:p.project(sample.world.root)}),true);const rect=api.diagnostics.lastFrame.rect;
  geometryBounds.push({placement,goal,atMs:at,pet:{...latestBounds[0],x:latestBounds[0].left+rect.x,y:latestBounds[0].top+rect.y},planter:{...latestBounds[1],x:latestBounds[1].left+rect.x,y:latestBounds[1].top+rect.y}});
  assert.ok(latestBounds.every(b=>b.left>=0&&b.top>=0&&b.right<=192&&b.bottom<=192));
 }previous=sampleRoute(setup,run,run.route.totalMs).world;}}
 assert.equal(resources[0].knownCPUBufferPeakBytes,11872312);assert.equal(resources.at(-1).geometryGPUBufferBytes,3936972);assert.equal(api.diagnostics.copies,0);assert.equal(api.diagnostics.directPresentations,18);
 api.dispose();api.dispose();assert.equal(disposed,1);assert.equal(lost,1);assert.equal(canvas.width,0);assert.equal(canvas.parentNode,null);
 if(process.env.PIP_GEOMETRY_REPORT){await fs.mkdir(path.dirname(process.env.PIP_GEOMETRY_REPORT),{recursive:true});await fs.writeFile(process.env.PIP_GEOMETRY_REPORT,JSON.stringify({status:'CPU projected actual mesh vertices; no browser or GPU pixels',referenceStage:[390,648],samples:geometryBounds},null,2)+'\n');}
});
