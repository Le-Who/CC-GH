import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanonicalNavigation} from '../src/games/companion-yard-v2/pip-prototype/dynamic-navigation.mjs';
import {continuousDetourTrajectory,reachablePolyline,CONTINUOUS_DETOUR_LIMITS} from '../src/games/companion-yard-v2/pip-prototype/dynamic-trajectory.mjs';
import {planCanonicalInspection,supportedPose,supportedWorldValid} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';
import {canonicalFoodNavigationGeometry} from '../src/games/companion-yard-v2/pip-prototype/canonical-food-scene.mjs';
import {sampleMotion} from '../src/games/companion-yard-v2/pip-prototype/motion/kinematics.mjs';
import {angleDelta,sampleSegment,sampleTrajectory,smooth} from '../src/games/companion-yard-v2/pip-prototype/motion/trajectory.mjs';
const actor=JSON.parse(fs.readFileSync(new URL('../src/games/companion-yard-v2/pip-prototype/data/fixture.json',import.meta.url))).actor;
const baseGeometry=JSON.parse(fs.readFileSync(new URL('../game-logic/yard-v2/canonical-location-geometry.json',import.meta.url)));
const geometry=canonicalFoodNavigationGeometry(baseGeometry,{reserved:true});
const row=(x=80,y=60,id='a')=>({slotId:'canonical:'+id,goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x,y});
const rows=[row()],previous=supportedPose(actor),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),receipts=[];
function plan(g=geometry,r=rows){return planCanonicalInspection({geometry:g,rows:r,actor,targetSlotId:r[0].slotId,previous});}
function samePose(a,b){assert.ok(distance(a.root,b.root)<1e-8);assert.ok(Math.abs(angleDelta(a.heading,b.heading))<1e-8);for(const side of ['L','R']){assert.deepEqual(a.feet[side].position,b.feet[side].position);assert.equal(a.feet[side].heading,b.feet[side].heading);}}
function joinTime(route,s){let a=0,b=1;for(let i=0;i<60;i++){const m=(a+b)/2;if(smooth(m)*route.length<s)a=m;else b=m;}return route.anticipationMs+(a+b)/2*route.moveMs;}
function checkPlan(p,g=geometry,r=rows){
 assert.equal(p.ok,true,p.code);const nav=createCanonicalNavigation({geometry:g,rows:r,actor});let preceding=previous,samples=0,maxCurvature=0,maxStep=0;
 for(const stage of p.stages){
  const {route,gait}=stage;samePose(sampleMotion(route,gait,actor,0),preceding);const plants=new Map();let last=null;
  const times=[...new Set([0,route.totalMs,...Array.from({length:Math.ceil(route.totalMs/16)},(_,i)=>i*16),...gait.events.flatMap(e=>[e.startMs,e.endMs,(e.startMs+e.endMs)/2])])].sort((a,b)=>a-b);
  for(const t of times){const w=sampleMotion(route,gait,actor,t);samples++;assert.ok(supportedWorldValid(w,actor,nav),'full envelope at '+t);assert.ok(w.support.length>=1);if(last){maxStep=Math.max(maxStep,distance(w.root,last.root));assert.ok(Math.abs(angleDelta(w.heading,last.heading))<.055);}for(const f of Object.values(w.feet))if(f.planted){const prior=plants.get(f.plantId);if(prior){assert.deepEqual(f.position,prior.position);assert.equal(f.heading,prior.heading);}plants.set(f.plantId,f);}last=w;}
  preceding=sampleMotion(route,gait,actor,route.totalMs);assert.equal(preceding.support.length,2);
  if(route.motionKind==='supported-turn')continue;
  const expectedMs=Math.max(2,Math.ceil(1.875*route.length/(actor.maxSpeedSourcePerSecond*actor.unitsPerSource)*1000/actor.halfStepMs))*actor.halfStepMs;assert.equal(route.moveMs,expectedMs);
  for(let i=0;i<route.segments.length;i++){
   const segment=route.segments[i];for(let n=0;n<=1000;n++){const s=sampleSegment(segment,n/1000),v=s.tangent,a=s.second,k=Math.abs(v.x*a.y-v.y*a.x)/Math.hypot(v.x,v.y)**3;assert.ok(Number.isFinite(k));maxCurvature=Math.max(maxCurvature,k);assert.ok(k<=actor.maxPathCurvaturePerSource/actor.unitsPerSource+1e-8);}
   if(!i)continue;
   const before=sampleSegment(route.segments[i-1],1),after=sampleSegment(segment,0);
   assert.ok(distance(before.point,after.point)<1e-8);assert.ok(Math.abs(angleDelta(Math.atan2(before.tangent.y,before.tangent.x),Math.atan2(after.tangent.y,after.tangent.x)))<1e-8);
   for(const s of [before,after])assert.ok(Math.abs(s.tangent.x*s.second.y-s.tangent.y*s.second.x)/Math.hypot(s.tangent.x,s.tangent.y)**3<1e-9);
   const at=joinTime(route,segment.offset),a=sampleTrajectory(route,at-.1),b=sampleTrajectory(route,at+.1);assert.ok(a.moving&&b.moving);assert.ok(distance(a.root,b.root)>0);assert.ok(Math.abs(angleDelta(a.heading,b.heading))<1e-3);
  }
 }
 samePose(p.settled,preceding);assert.ok(maxStep<.19);return {samples,maxCurvature,maxStep};
}
test('exact fixed-food case is one genuine curved approach, with supported endpoints and continuous joins',()=>{
 const p=plan();assert.equal(p.anchor.id,'leaf-5');assert.equal(p.stages.length,1);assert.equal(p.stages[0].kind,'approach');const route=p.stages[0].route;
 assert.deepEqual(route.segments.map(s=>s.kind),['quintic-heading-approach','quintic-heading-approach','line']);assert.deepEqual(route.planningWork,{waypoints:3,tangentVariants:1,curveAttempts:2,hullChecks:4});
 assert.ok(route.maxCurvature>.1);assert.ok(Math.abs(angleDelta(route.start.heading,previous.heading))<1e-10);assert.ok(Math.abs(angleDelta(route.goal.heading,p.anchor.heading))<1e-10);
 const proof=checkPlan(p);receipts.push({case:'exact-food',anchor:p.anchor.id,stages:p.stages.length,length:route.length,totalMs:route.totalMs,moveMs:route.moveMs,planningWork:route.planningWork,joins:route.segments.slice(1).map(s=>({atMs:joinTime(route,s.offset),position:s.control[0]})),...proof});
 const former=plan(baseGeometry),nav=createCanonicalNavigation({geometry,rows,actor});assert.equal(former.anchor.id,'leaf-6');assert.equal(former.stages.length,1);let hits=0;for(const stage of former.stages)for(let t=0;t<=stage.route.totalMs;t+=16)if(!supportedWorldValid(sampleMotion(stage.route,stage.gait,actor,t),actor,nav))hits++;assert.ok(hits>0);receipts.push({case:'food-free-route-against-food',hits});
 assert.deepEqual(plan(),p,'route and bounded search are deterministic');
});
test('moved exclusion creates a different certified curve; no stale route or fixed-coordinate detour',()=>{
 const moved=structuredClone(geometry);moved.exclusions.at(-1).polygon=moved.exclusions.at(-1).polygon.map(([x,y])=>[x+4,y]);
 const original=plan(),p=plan(moved);assert.notEqual(p.layoutKey,original.layoutKey);assert.equal(p.stages.length,1);assert.ok(p.stages[0].route.planningWork);assert.notDeepEqual(p.stages[0].route.segments,original.stages[0].route.segments);const proof=checkPlan(p,moved);receipts.push({case:'moved-obstacle',stages:p.stages.length,length:p.stages[0].route.length,planningWork:p.stages[0].route.planningWork,...proof});
});
test('all anchors blocked rejects without inventing a route or weakening clearance',()=>{
 const p=plan(baseGeometry,[row(35,115)]);assert.equal(p.ok,false);assert.equal(p.code,'NO_REACHABLE_INTERACTION_ANCHOR');assert.equal(p.stages,undefined);assert.equal(p.attempts.length,24);assert.ok(p.attempts.every(a=>a.code==='ANCHOR_BLOCKED'));receipts.push({case:'all-blocked',code:p.code,attempts:p.attempts.length});
});
test('a connected narrow corner refuses smoothing; supported fallback still works on a no-fit food approach',()=>{
 const g={domain:{min:[0,0],max:[200,220]},groundZ:0,ground:[[80,140],[103,140],[103,83],[150,83],[150,60],[80,60]],exclusions:[],composition:{canonicalPerSceneUnit:1,camera:{pixelsPerSceneUnitCss:1,right:[1,0,0],down:[0,1,0],projectionOriginCss:[0,0],projectionOriginCanonical:[0,0]},art:{width:200,height:220},foregroundExclusions:[]}};
 const nav=createCanonicalNavigation({geometry:g,rows:[],actor}),start={position:{x:91.5,y:125},heading:-Math.PI/2},goal={position:{x:130,y:71.5},heading:0};assert.ok(reachablePolyline(nav,start.position,goal.position));assert.equal(continuousDetourTrajectory(actor,start,goal,nav),null);
 const tight=structuredClone(geometry);tight.exclusions.at(-1).polygon=tight.exclusions.at(-1).polygon.map(([x,y])=>[x,y-6]);const p=plan(tight);assert.equal(p.ok,true);assert.equal(p.stages.length,6);assert.ok(p.stages.some(s=>s.route.motionKind==='supported-turn'));assert.ok(p.stages.every(s=>!s.route.planningWork));const proof=checkPlan(p,tight);receipts.push({case:'narrow-no-fit-fallback',stages:p.stages.length,...proof});
});
test('curve certificate work and navigation flood are bounded and cached for the supported departure',()=>{
 let calls=0;const nav={segment:()=>true,passable:()=>true,clearControlHull(){calls++;return false;}};
 assert.equal(continuousDetourTrajectory(actor,{position:{x:40,y:40},heading:0},{position:{x:80,y:40},heading:0},nav),null);
 const limits=CONTINUOUS_DETOUR_LIMITS;assert.equal(calls,6*limits.tangentVariants*(limits.hullSubdivisionDepth+1));assert.ok(calls<=6*limits.tangentVariants*(limits.maxWaypoints-1)*(2**(limits.hullSubdivisionDepth+1)-1));
 const real=createCanonicalNavigation({geometry,rows,actor}),entry={x:79,y:129.5},first=real.withEntry(entry);assert.equal(real.withEntry({...entry}),first);assert.ok(first.reachableCells<=101*111);entry.x=0;assert.equal(real.withEntry({x:79,y:129.5}),first);const target={x:96,y:80};assert.deepEqual(first.routeTo(target).points[0],{x:79,y:129.5});first.routeTo(target).points[0].x=0;assert.equal(real.withEntry({x:79,y:129.5}),first);assert.notEqual(real.withEntry({x:80,y:130}),first);
 receipts.push({case:'bounded-work',rejectedHullChecks:calls,gridMaximum:101*111,reachableCells:first.reachableCells,limits});
});
test.after(()=>{if(process.env.DETOUR_RECEIPT)fs.writeFileSync(process.env.DETOUR_RECEIPT,JSON.stringify({scope:'Deterministic CPU route/envelope/kinematic checks only; no native frames or visual acceptance.',receipts},null,2)+'\n');});
