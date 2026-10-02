import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {lookupWalkPhase,WALK_PHASES,WALK_PHASE_UNITS_96} from './walk-phase-lookup.mjs';
import {sampleRoute,RAMP_DISTANCE_QUANTA} from './stride-routes.mjs';
import {createCourtyardAdapter} from './adapter.mjs';
import {createCourtyardAdapter as createPrevious} from './phase-baseline/adapter.mjs';
import {sampleRoute as samplePrevious} from './phase-baseline/stride-routes.mjs';
import {browserKernel as kernel} from './browser/kernel.mjs';
const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url)));
const fixture=await read('./walk-phase-contract.json'),basePaws=await read('./walk-contact-samples.json');
const clips=await read('./clip-contracts.json'),turns=await read('./turn-contracts.json');
const adapter=createCourtyardAdapter(kernel,{clips,turns}),previous=createPrevious(kernel,{clips,turns});
const make=(a,scenario='mouse')=>{
 const created=a.create({scenario});const initial=a.action(created.session,{action:'yard.setFood',actionId:'preview:phase-food',payload:{foodId:'kibble'}}).session;
 const admitted=a.advanceModel(initial,3600000);return{...created,initial,admitted,plan:Object.values(admitted.render.plans)[0]};
};
const episodes=Object.fromEntries(['mouse','cushion'].map(s=>[s,{current:make(adapter,s),previous:make(previous,s)}]));
const report={scope:'Explicit phase lookup and actual source-paw invariants; render/skin/browser validation separate',tests:0,
 phaseContractSha256:createHash('sha256').update(await readFile(new URL('./walk-phase-contract.json',import.meta.url))).digest('hex'),
 poseSourceSha256:fixture.sourcePosePackSha256,phaseNumerators:[...WALK_PHASE_UNITS_96],phaseDenominator:96,scenarios:{}};
const directions=[[1,0],[0,1],[-1,0],[0,-1]],step=.64*8;
const straight=(facing=0,phaseStart=0)=>{
 const [dx,dy]=directions[facing/2],distance=step*3,from={x:50,y:50},to={x:50+dx*distance,y:50+dy*distance};
 return{ok:true,points:[from,to],durationMs:3600,legs:[{kind:'walk',facing,from,to,distance,phaseStart,phaseEnd:phaseStart,
 startMs:0,endMs:3600,durationMs:3600,rampInDistance:0,rampInMs:0,rampOutDistance:0,rampOutMs:0,cruiseDistance:distance,cruiseMs:3600}]};
};
const identity=p=>JSON.stringify([p.position,p.motion.kind,p.motion.kind==='walk'?[p.motion.facing,p.motion.frameIndex]:[p.motion.fromFacing,p.motion.direction,p.motion.angleSteps,Math.floor(p.motion.atMs/50)]]);
function maxHold(program,sample,offset=0){let key=null,count=0,max=0;for(let t=offset;t<program.durationMs;t+=50){const k=identity(sample(program,t));count=k===key?count+1:1;max=Math.max(max,count*50);key=k;}return max;}
test('shared table is exact24 base phases plus four true extra phases, cardinal only',()=>{
 assert.deepEqual(WALK_PHASE_UNITS_96,[0,1,2,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,72,76,80,84,88,92,94,95]);
 assert.deepEqual(WALK_PHASES,fixture.phases);assert.deepEqual(WALK_PHASE_UNITS_96,fixture.phaseNumerators);
 assert.equal(fixture.phaseDenominator,96);assert.deepEqual(fixture.facings,[0,2,4,6]);
 assert.equal(WALK_PHASES.length,28);assert.equal(new Set(WALK_PHASES).size,28);
 assert.equal(lookupWalkPhase(.5).frameIndex,14);assert.equal(lookupWalkPhase(1/24).frameIndex,3);
});
test('floor lookup respects every boundary, previous interval, signed cycles and cycle wrap',()=>{
 for(const cycle of [-9,-2,-1,0,1,7,50])for(let i=0;i<WALK_PHASES.length;i++){
  const at=cycle+WALK_PHASES[i],exact=lookupWalkPhase(at),before=lookupWalkPhase(at-1e-7),after=lookupWalkPhase(at+1e-7);
  assert.equal(exact.frameIndex,i);assert.equal(exact.cycle,cycle);assert.ok(Math.abs(exact.sampledCycles-at)<1e-13);
  assert.equal(after.frameIndex,i);assert.equal(before.frameIndex,i?i-1:27);assert.equal(before.cycle,i?cycle:cycle-1);
 }
 for(const bad of [NaN,Infinity,-Infinity,undefined])assert.throws(()=>lookupWalkPhase(bad),/Finite/);
});
test('source base24 paw and contact fixtures are unchanged after inserting four poses',()=>{
 for(const entry of fixture.entries.filter(e=>e.baselineFrameIndex!==null)){
  const base=basePaws.frames[entry.baselineFrameIndex];
  for(const [name,limb] of Object.entries(base.limbs)){
   assert.deepEqual(entry.localPaws[name].paw,limb.paw);assert.equal(entry.localPaws[name].contact,limb.contact);
  }
 }
 assert.equal(fixture.entries.filter(e=>e.baselineFrameIndex===null).length,4);
});
test('shared root/phase choice stays coherent at all28 boundaries in forward and reverse cardinal headings',()=>{
 for(const facing of [0,2,4,6])for(const initialPhase of [0,.5]){
  const program=straight(facing,initialPhase),[dx,dy]=directions[facing/2];
  for(let t=0;t<=3600;t+=7){
   const p=sampleRoute(program,t),d=(p.position.x-50)*dx+(p.position.y-50)*dy;
   const chosen=lookupWalkPhase(initialPhase+t/1200);
   assert.equal(p.motion.frameIndex,chosen.frameIndex);assert.equal(p.gaitPhase,chosen.phase);
   assert.ok(Math.abs(d-(chosen.sampledCycles-initialPhase)*step)<1e-9);
   assert.ok(Math.hypot(p.position.x-p.continuousPosition.x,p.position.y-p.continuousPosition.y)<=step/24+1e-9);
   assert.equal(p.headingRadians,facing*Math.PI/4);
  }
 }
});
test('24 base-phase fixtures still select exact same world roots despite different table indices',()=>{
 for(const facing of [0,2,4,6]){
  const program=straight(facing);
  for(let i=0;i<=72;i++){
   const a=sampleRoute(program,i*50),b=samplePrevious(program,i*50);
   assert.equal(a.gaitPhase,b.gaitPhase);assert.ok(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)<1e-9);
   assert.equal(fixture.entries[a.motion.frameIndex].baselineFrameIndex,b.motion.frameIndex);
  }
 }
});
test('new source paws remain planted through added phases and negative/positive wrap in allcardinal headings',()=>{
 let maxDrift=0,checks=0;
 for(const facing of [0,2,4,6]){
  const yaw=facing*Math.PI/4,anchors=new Map();
  for(let cycle=-2;cycle<=2;cycle++)for(const entry of fixture.entries){
   const root=(cycle+entry.phase)*.64;
   for(const [name,l] of Object.entries(entry.localPaws))if(l.contact){
    const id=`${name}:${cycle+l.supportCycleOffset}`,local=[root+l.paw[0],l.paw[1],l.paw[2]];
    const world=[local[0]*Math.cos(yaw)-local[1]*Math.sin(yaw),local[0]*Math.sin(yaw)+local[1]*Math.cos(yaw),local[2]];
    if(anchors.has(id)){const drift=Math.hypot(...world.map((v,i)=>v-anchors.get(id)[i]));maxDrift=Math.max(maxDrift,drift);assert.ok(drift<1e-10);checks++;}
    else anchors.set(id,world);
   }
  }
 }
 report.signedCycleSupportChecks=checks;report.maxSignedCycleSupportDriftWorld=maxDrift;assert.ok(checks>1000);
});
test('physical ramps remain2/24 stride and every path, corner, heading and duration matches r4',()=>{
 assert.equal(RAMP_DISTANCE_QUANTA,2);
 for(const s of Object.values(episodes))for(const key of ['entryMotion','exitMotion']){
  assert.deepEqual(s.current.plan[key],s.previous.plan[key]);
  for(const leg of s.current.plan[key].legs)if(leg.kind==='walk'){
   assert.ok(leg.rampInDistance===0||Math.abs(leg.rampInDistance-step*2/24)<1e-12);
   assert.ok(leg.rampOutDistance===0||Math.abs(leg.rampOutDistance-step*2/24)<1e-12);
   assert.ok(leg.rampInMs<=200+1e-9&&leg.rampOutMs<=200+1e-9);
  }
 }
});
test('intended20fps repeated pose/root holds stay atmost100ms across every offset around allnine corners',()=>{
 for(const [name,s] of Object.entries(episodes)){
  const rows={};for(const key of ['entryMotion','exitMotion']){
   const r=s.current.plan[key],before=s.previous.plan[key];let max=0,old=0;
   for(let offset=0;offset<50;offset++){max=Math.max(max,maxHold(r,sampleRoute,offset));old=Math.max(old,maxHold(before,samplePrevious,offset));}
   assert.ok(max<=100);if(r.turnCount)assert.equal(old,150);
   rows[key]={durationMs:r.durationMs,turnCount:r.turnCount,maxIdenticalPoseAndRootMs:max,previousMaxMs:old};
  }report.scenarios[name]=rows;
 }
});
test('leg prefetch cursor and28-phase display are identical after JSON reload and arbitrary skipped ticks',()=>{
 for(const s of Object.values(episodes)){
  const once=adapter.advancePresentation(s.current.initial,180000);let sliced=s.current.initial;
  const times=[8000,...s.current.plan.entryMotion.legs.flatMap(l=>[8000+l.startMs,8000+l.startMs+77,8000+l.endMs-1]),60000,180000].sort((a,b)=>a-b);
  for(const t of times){sliced=adapter.advancePresentation(sliced,t);const before=adapter.view(sliced),r=adapter.restore(adapter.encode(sliced).value,s.current.backup);assert.equal(r.ok,true);sliced=r.session;assert.deepEqual(adapter.view(sliced),before);}
  assert.deepEqual(sliced,once);assert.deepEqual(once.kernel,previous.advancePresentation(s.previous.initial,180000).kernel);
 }
});
test('targeted mouse terminal patch is integrated:6250 composite125,6300 walkphase0,6350 phase1/24 atindex3',()=>{
 const s=episodes.mouse.current,start=8000+s.plan.presentation.approachMs;
 const view=t=>adapter.view(adapter.advancePresentation(s.initial,start+t));
 const a=view(6250),b=view(6300),c=view(6350);
 assert.equal(a.pets[0].phase,'active-clip');assert.equal(a.pets[0].clipAtMs,6250);
 assert.equal(b.pets[0].phase,'depart');assert.equal(b.pets[0].gaitPhase,0);assert.equal(b.pets[0].motion.frameIndex,0);
 assert.equal(c.pets[0].gaitPhase,1/24);assert.equal(c.pets[0].motion.frameIndex,3);
 assert.equal(a.props.find(p=>p.slotId==='mouse').drawStandalone,false);assert.equal(b.props.find(p=>p.slotId==='mouse').drawStandalone,true);
 assert.equal(clips['mika-mouse-r1'].contactAtMs,3350);assert.equal(clips['mika-mouse-r1'].finalTransformAtMs,3900);
 assert.equal(clips['mika-mouse-r1'].durationMs,6300);assert.equal(clips['mika-mouse-r1'].playbackFrameCount,126);
 assert.equal(clips['mika-mouse-r1'].media.frameCount,128);
});
test('phase-table config revision preserves inactive old fixtures and quarantines active old saves verbatim',()=>{
 assert.notEqual(adapter.configHash,previous.configHash);
 const s=episodes.mouse.previous,raw=previous.encode(s.initial).value,result=adapter.restore(raw,s.backup);
 assert.equal(result.ok,true);assert.equal(result.recoverySource,raw);assert.deepEqual(result.session.kernel,s.initial.kernel);
 const active=previous.encode(s.admitted).value,r=adapter.restore(active,s.backup);assert.equal(r.ok,false);assert.equal(r.rawSnapshot,active);
});
test('empty and zero-duration routes expose finite canonical frame0 and an explicit absent leg',()=>{
 const point={x:37.00000188941175,y:44.99999501352009};
 for(const legs of [[],[{kind:'walk',from:point,to:point,facing:0,phaseStart:0,distance:0,durationMs:0,startMs:0,endMs:0}]]){
  const route={ok:true,points:[point],legs,durationMs:0};
  for(const time of [-1,0,1000]){
   const p=sampleRoute(route,time);assert.deepEqual(p.position,point);assert.deepEqual(p.continuousPosition,point);
   assert.equal(p.gaitPhase,0);assert.equal(p.headingRadians,0);assert.equal(p.groundDistance,0);assert.equal(p.continuousGroundDistance,0);
   assert.deepEqual(p.motion,{kind:'walk',facing:0,frameIndex:0,atMs:0,durationMs:0,legIndex:-1,routeElapsedMs:0});
   assert.deepEqual(sampleRoute(JSON.parse(JSON.stringify(route)),time),p);
  }
 }
});
test.after(async()=>{report.tests=12;await writeFile(new URL('./WALK-PHASE-VALIDATION.json',import.meta.url),JSON.stringify(report,null,2)+'\n');});
