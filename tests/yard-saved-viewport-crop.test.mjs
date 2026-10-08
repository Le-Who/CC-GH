import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createCleanProjection,savedVisitViewportVolumes,supportsCleanViewport} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const descriptor=read('../src/games/companion-yard-v2/pip-prototype/data/location.json');
const snapshot=read('./fixtures/canonical-saved-public.json');
const plan=snapshot.yardRuntime.canonicalVisits[0].plan;
const foodDescriptor=read('../game-logic/yard-v2/canonical-food-contract.json');
const geometry=read('../game-logic/yard-v2/canonical-location-geometry.json');
const sourceVolume=plan.inspectionPlan.portal.fullVolume;
const food={x:80,y:82,paddingCss:24};
function corners(volume){const out=[];for(const x of[-volume.radius,volume.radius])for(const y of[-volume.radius,volume.radius])for(const z of[0,volume.height])out.push({x:volume.center.x+x,y:volume.center.y+y,z:(volume.center.z??0)+z});return out;}
function actorVolume(root=plan.restWorld.root){return {id:'saved-Pip',center:root,...sourceVolume,paddingCss:6};}
for(const [width,height]of[[308,402],[378,678],[756,296]])for(const removed of[false,true])test(`source saved neutral body fits ${width}x${height}, removed=${removed}`,()=>{
 const rows=removed?[]:snapshot.yardRuntime.canonicalPlacements;
 const volume=actorVolume(),focus=rows[0]??{x:98,y:118};
 const requiredVolumes=savedVisitViewportVolumes(plan,{phase:'neutral-rest',sample:{world:plan.restWorld}},foodDescriptor,{rows,itemEnvelope:geometry.composition.itemEnvelope});
 const p=createCleanProjection(descriptor,width,height,{focus,framing:'top-biased',contextPoints:[food],requiredVolumes});
 const points=corners(volume).map(p.project),margin=volume.paddingCss*p.scale;
 assert.ok(points.every(q=>q.x>=margin-1e-8&&q.y>=margin-1e-8&&q.x<=width-margin+1e-8&&q.y<=height-margin+1e-8),JSON.stringify({stage:[width,height],top:p.art.y,points}));
 assert.ok(p.project(food).y>=24*p.scale&&p.project(food).y<=height-24*p.scale);
 assert.equal(p.scale,Math.min(width/390,1));assert.equal(p.actorUnitsPerSource,16);
 assert.equal(p.renderViewport.pixelsPerRenderUnit,descriptor.camera.pixelsPerSceneUnitCss*12/8);
 const restored=p.unprojectGround(p.project(plan.restWorld.root));assert.ok(Math.abs(restored.x-plan.restWorld.root.x)<1e-10&&Math.abs(restored.y-plan.restWorld.root.y)<1e-10);
});
test('framing follows authoritative rest and walk poses without moving source coordinates',()=>{
 const roots=[plan.restWorld.root,...plan.retreatStages.flatMap(stage=>[stage.route.start.position,stage.route.goal.position,...(stage.route.segments??[]).flatMap(s=>s.control)])];
 const original=JSON.stringify(plan);
 for(const [width,height]of[[308,402],[378,678],[756,296]])for(const root of roots){
  const volumes=savedVisitViewportVolumes(plan,{phase:'retreat',sample:{world:{root}}},foodDescriptor);
  const p=createCleanProjection(descriptor,width,height,{framing:'top-biased',requiredVolumes:volumes});
  const bound=p.requiredBounds.find(b=>b.id==='saved-Pip');
  assert.equal(bound.portalClipped,false);assert.ok(bound.x>=bound.padding&&bound.y>=bound.padding-1e-8&&bound.right<=width-bound.padding&&bound.bottom<=height-bound.padding+1e-8);
 }
 assert.equal(JSON.stringify(plan),original);
});
test('impossible fixed-scale common crop fails closed with exact geometry',()=>{
 const root=plan.inspectionPlan.approachStages[0].route.start.position;
 const requiredVolumes=savedVisitViewportVolumes(plan,{phase:'approach',sample:{world:{root}}},foodDescriptor,{rows:snapshot.yardRuntime.canonicalPlacements,itemEnvelope:geometry.composition.itemEnvelope});
 assert.throws(()=>createCleanProjection(descriptor,280,192,{framing:'top-biased',requiredVolumes}),error=>error.message==='CANONICAL_SAVED_VIEWPORT_CROP_UNAVAILABLE'&&error.geometry.minTop>error.geometry.maxTop);
});
test('source portal clipping is explicit and does not move the outside actor',()=>{
 const root={...plan.inspectionPlan.portal.outside,z:0};
 const volumes=savedVisitViewportVolumes(plan,{phase:'entrance',sample:{world:{root}}},foodDescriptor);
 const p=createCleanProjection(descriptor,756,296,{framing:'top-biased',requiredVolumes:volumes});
 const bound=p.requiredBounds.find(b=>b.id==='saved-Pip');assert.equal(bound.portalClipped,true);assert.ok(bound.full.y>=p.art.y+p.art.height);
 assert.deepEqual(volumes[0].center,root);assert.equal(p.scale,1);
 const inside=savedVisitViewportVolumes(plan,{phase:'exit',sample:{world:plan.restWorld}},foodDescriptor);
 const complete=createCleanProjection(descriptor,756,296,{framing:'top-biased',requiredVolumes:inside}).requiredBounds.find(b=>b.id==='saved-Pip');
 assert.equal(complete.portalClipped,false);assert.equal(complete.padding,6);assert.ok(complete.bottom<=290);
});
test('unregistered silhouette source fails closed',()=>{
 const invalid=structuredClone(plan);invalid.inspectionPlan.portal.fullVolume.radius=8;
 assert.throws(()=>savedVisitViewportVolumes(invalid,{phase:'neutral-rest',sample:{world:plan.restWorld}},foodDescriptor),/SOURCE_UNAVAILABLE/);
});
test('minimum viewport refusal remains unchanged',()=>{
 assert.equal(supportsCleanViewport(279,402),false);assert.equal(supportsCleanViewport(308,191),false);
 assert.throws(()=>createCleanProjection(descriptor,279,402),/280×192/);
 assert.throws(()=>createCleanProjection(descriptor,308,191),/280×192/);
});
test('actual resize callback hides infeasible composition and recovers the same owner on expansion',()=>{
 const source=fs.readFileSync(new URL('../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs',import.meta.url),'utf8');
 const start=source.indexOf(' function background(){'),end=source.indexOf('\n function presentation(){',start);
 assert.ok(start>0&&end>start,'extract the current scene callback, never a copied implementation');
 const rows=snapshot.yardRuntime.canonicalPlacements,root=plan.inspectionPlan.approachStages[0].route.start.position;
 const result={phase:'approach',sample:{world:{root}}},original=JSON.stringify(plan),reasons=new Set();
 let width=308,height=402,resizes=0,draws=0,disposals=0,cancelled=0;
 const canvas={width,height,style:{visibility:''},getBoundingClientRect:()=>({width,height})},directHost={style:{visibility:''}};
 const owner={resize(){resizes++;},setPaused(){},dispose(){disposals++;}};
 const clock={get paused(){return reasons.size>0;},setReason(reason,value){if(value)reasons.add(reason);else reasons.delete(reason);}};
 const scope={disposed:false,restartPending:false,foodReentryRequired:false,descriptor,canonicalItems:true,canonicalSavedVisits:true,itemPointerActive:false,ghost:null,
  canvas,directHost,ctx:{clearRect(){},fillRect(){},drawImage(){},setTransform(){}},setup:{placements:[[98,118]]},image:{},run:null,api:owner,
  projection:null,savedCropKey:null,viewportBlocked:false,rejectedViewport:null,viewportRefusals:0,viewportRecoveries:0,frozenResizePending:false,resolveViewport:null,lastFrame:null,
  createCleanProjection,savedVisitViewportVolumes,supportsCleanViewport,CANONICAL_FOOD_CONTRACT:foodDescriptor,canonicalGeometry:geometry,
  savedClient:{state:{plan},sample:()=>result},currentRows:()=>rows,displayedItem:()=>rows[0],currentItemState:()=>({available:true}),document:{hidden:false},clock,
  reserve(){},onPointerInterrupt(){},phase:()=>scope.viewportBlocked?'viewport-blocked':'approach',notify(){},publish(){},
  scheduler:{setPaused(){},cancelPending(){cancelled++;},invalidate(){}},
  hideSurface(hidden){canvas.style.visibility=directHost.style.visibility=hidden?'hidden':'';},
  pause(reason,value){clock.setReason(reason,value);},
  draw(){draws++;scope.lastFrame={visibility:'both',viewportBounds:scope.projection.requiredBounds};scope.hideSurface(false);}
 };
 vm.createContext(scope);vm.runInContext(source.slice(start,end),scope);
 scope.resize();assert.equal(draws,1);assert.equal(scope.viewportBlocked,false);assert.equal(canvas.style.visibility,'');
 width=280;height=192;scope.resize();
 assert.equal(scope.viewportBlocked,true);assert.equal(scope.rejectedViewport.code,'CANONICAL_SAVED_VIEWPORT_CROP_UNAVAILABLE');
 assert.equal(canvas.style.visibility,'hidden');assert.equal(directHost.style.visibility,'hidden');assert.equal(scope.lastFrame.visibility,'empty');
 assert.equal(draws,1);assert.equal(resizes,1);assert.equal(cancelled,1);assert.equal(reasons.has('viewport'),true);assert.equal(scope.api,owner);
 width=756;height=296;scope.resize();
 assert.equal(scope.viewportBlocked,false);assert.equal(scope.viewportRecoveries,1);assert.equal(reasons.has('viewport'),false);
 assert.equal(canvas.style.visibility,'');assert.equal(directHost.style.visibility,'');assert.equal(scope.lastFrame.visibility,'both');
 assert.equal(scope.api,owner);assert.equal(resizes,2);assert.equal(draws,2);assert.equal(disposals,0);assert.equal(JSON.stringify(plan),original);
});
