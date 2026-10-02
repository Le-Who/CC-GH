import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {routeProgram,sampleRoute,STRIDE_WORLD} from './stride-routes.mjs';
import {WALK_PHASES} from './walk-phase-lookup.mjs';
import {browserKernel as kernel} from './browser/kernel.mjs';
import {PREVIEW_SCENE,INITIAL_LAYOUT} from './adapter.mjs';
const H=3600000,scale=8,step=.64*scale;
const player=kernel.createDefaultPlayer('turn-route-fixture','Fixture',0);
let state=kernel.migratePlayerSnapshot(player,{now:0,seed:'courtyard-29'});
for(const p of INITIAL_LAYOUT)state=kernel.applyPrototypeAction(state,'yard.placeGoodie',p,{now:0,scene:PREVIEW_SCENE}).state;
const yard=state.player.yard;
const scene={...PREVIEW_SCENE,exclusions:[...PREVIEW_SCENE.exclusions,...yard.placedGoodies.map(p=>kernel.footprint(p,PREVIEW_SCENE)).filter(b=>!b.blocksMovement)]};
const navigation=kernel.buildNavigation(yard,scene);
const route=(incoming=true,anchor={x:18.92,y:47.12},extra={})=>routeProgram({navigation,anchor,entry:PREVIEW_SCENE.entry,incoming,initialPhase:0,...extra});
const report={status:'Pure source-nav/clock tests; real turn skin/media readiness separately gated',tests:0};
test('exact endpoint uses whole-stride cardinal travel with a source-valid nearby portal',()=>{
 const r=route();assert.equal(r.ok,true);assert.deepEqual(r.points.at(-1),{x:18.92,y:47.12});
 assert.ok(Math.abs(r.portal.x-90)<=4&&Math.abs(r.portal.y-68)<=4);
 assert.equal(navigation.segment(PREVIEW_SCENE.entry,r.portal),true);
 for(const l of r.legs)if(l.kind==='walk'){
  assert.ok([0,2,4,6].includes(l.facing));assert.ok(Math.abs(l.distance/step-Math.round(l.distance/step))<1e-10);
  assert.equal(navigation.segment(l.from,l.to),true);
 }
 assert.equal(r.legs.at(-1).kind,'walk');assert.equal(r.legs.at(-1).facing,0);
 report.mouseEntry={portal:r.portal,durationMs:r.durationMs,turnCount:r.turnCount};
});
test('one genuine90/180 at a corner replaces repeated45 clips; no adjacent reset-pauses',()=>{
 const r=route();
 for(let i=0;i<r.legs.length;i++)if(r.legs[i].kind==='turn'){
  const l=r.legs[i];assert.ok([2,4].includes(l.angleSteps));assert.equal(l.durationMs,l.angleSteps===2?2800:4400);
  assert.notEqual(r.legs[i+1]?.kind,'turn');
  if(l.angleSteps===4)assert.equal(l.direction,1);
 }
});
test('rest phase.5 departs through exact half-cycle runway with no phase reset',()=>{
 const r=route(false,{x:84.96,y:66},{initialPhase:.5});assert.equal(r.ok,true);
 const first=r.legs[0];assert.equal(first.canonicalRunway,true);assert.equal(first.distance,step/2);
 assert.equal(sampleRoute(r,0).gaitPhase,.5);assert.equal(sampleRoute(r,r.durationMs).gaitPhase,0);
 assert.ok(Math.abs(sampleRoute(r,r.durationMs).position.x-87.52)<1e-9);
});
test('arbitrary decimal moved anchors remain exact; no rounding of engine placement coordinates',()=>{
 const anchor={x:20.920001889,y:47.119995014};const r=route(true,anchor);assert.equal(r.ok,true);
 assert.deepEqual(r.points.at(-1),anchor);assert.deepEqual(sampleRoute(r,r.durationMs).position,anchor);
});
test('no viable turn envelope fails honestly instead of teleporting or changing heading',()=>{
 const r=route(true,{x:18.92,y:47.12},{canTurn:()=>false});assert.equal(r.ok,false);assert.equal(r.reason,'NO_PHASE_ALIGNED_ROUTE');
});
test('deterministic path, turn index and phase survive JSON reload',()=>{
 const r=route();assert.deepEqual(route(),r);
 const restored=JSON.parse(JSON.stringify(r));
 for(let t=0;t<=r.durationMs;t+=137)assert.deepEqual(sampleRoute(r,t),sampleRoute(restored,t));
});
test('root and atlas frame use the same quantized distance even while easing to a stop',()=>{
 const r=route();let foundSlow=false;
 for(const l of r.legs)if(l.kind==='walk'){
  const theta=l.facing*Math.PI/4;
  for(let t=l.startMs;t<l.endMs;t+=37){
   const p=sampleRoute(r,t),displayDistance=(p.position.x-l.from.x)*Math.cos(theta)+(p.position.y-l.from.y)*Math.sin(theta);
   const cycles=l.phaseStart+displayDistance/step;
   assert.ok(Math.abs(cycles-Math.floor(cycles+1e-9)-WALK_PHASES[p.motion.frameIndex])<1e-8);
   assert.ok(Math.hypot(p.position.x-p.continuousPosition.x,p.position.y-p.continuousPosition.y)<step/24+1e-8);
   foundSlow||=l.rampOutMs>0;
  }
 }assert.equal(foundSlow,true);
});
test('turn root stays fixed through every sampled pose and canonical phase0 joins',()=>{
 const r=route();for(const l of r.legs)if(l.kind==='turn'){
  for(let at=0;at<l.durationMs;at+=25){const p=sampleRoute(r,l.startMs+at);assert.deepEqual(p.position,l.position);assert.equal(p.gaitPhase,0);assert.equal(p.motion.angleSteps,l.angleSteps);}
  const before=sampleRoute(r,l.startMs),after=sampleRoute(r,l.endMs);
  assert.deepEqual(before.position,after.position);assert.equal(after.gaitPhase,0);
 }
});
test('actual canonical walk paw samples remain world-planted during slowdown and resume',async()=>{
 const source=JSON.parse(await readFile(new URL('./walk-phase-contract.json',import.meta.url)));
 const r=route();let checked=0,maxDrift=0;
 for(const l of r.legs)if(l.kind==='walk'){
  let prev=null;
  for(let t=l.startMs;t<l.endMs;t+=25){
   const p=sampleRoute(r,t),frame=source.entries[p.motion.frameIndex],yaw=p.headingRadians;
   const paws=Object.fromEntries(Object.entries(frame.localPaws).map(([id,limb])=>[id,{contact:limb.contact,
    point:[p.position.x+scale*(limb.paw[0]*Math.cos(yaw)-limb.paw[1]*Math.sin(yaw)),p.position.y+scale*(limb.paw[0]*Math.sin(yaw)+limb.paw[1]*Math.cos(yaw)),limb.paw[2]*scale]}]));
   if(prev)for(const id of Object.keys(paws))if(prev[id].contact&&paws[id].contact){const drift=Math.hypot(...paws[id].point.map((v,i)=>v-prev[id].point[i]));maxDrift=Math.max(maxDrift,drift);assert.ok(drift<1e-8);checked++;}
   prev=paws;
  }
 }assert.ok(checked>100);report.plantedPawChecks=checked;report.maximumPlantedPawDrift=maxDrift;
});
test('authored90/180 endpoint paw positions exactly match canonical phase0 in all cardinal facings',async()=>{
 const walk=JSON.parse(await readFile(new URL('./walk-contact-samples.json',import.meta.url)));
 const turns=JSON.parse(await readFile(new URL('./turn-contact-joins.json',import.meta.url)));
 const rotate=(p,y)=>[p[0]*Math.cos(y)-p[1]*Math.sin(y),p[0]*Math.sin(y)+p[1]*Math.cos(y),p[2]];
 let max=0;
 for(const clip of turns.clips)for(const [endpoint,yaw]of[['first',clip.startYawRadians],['last',clip.endYawRadians]])for(const limb of Object.keys(walk.frames[0].limbs)){
  const actual=rotate(turns.variants[clip.variantId][endpoint][limb].paw,clip.startYawRadians);
  const expected=rotate(walk.frames[0].limbs[limb].paw,yaw);
  const error=Math.hypot(...actual.map((v,i)=>v-expected[i]));max=Math.max(max,error);assert.ok(error<1e-9);
 }
 report.maximumAuthoredPawJoinErrorWorld=max;
});
test.after(async()=>{report.tests=10;await writeFile(new URL('./STRIDE-ROUTE-VALIDATION.json',import.meta.url),JSON.stringify(report,null,2)+'\n');});
