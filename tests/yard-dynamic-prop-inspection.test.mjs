import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanonicalNavigation,canonicalLayoutKey} from '../src/games/companion-yard-v2/pip-prototype/dynamic-navigation.mjs';
import {planCanonicalInspection,supportedPose,supportedWorldValid,interactionAnchors} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';
import {createCanonicalInspectionController,sampleLocalInspection} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-controller.mjs';
import {sampleMotion} from '../src/games/companion-yard-v2/pip-prototype/motion/kinematics.mjs';
import {angleDelta} from '../src/games/companion-yard-v2/pip-prototype/motion/trajectory.mjs';
const base=new URL('../src/games/companion-yard-v2/pip-prototype/',import.meta.url);
const actor=JSON.parse(fs.readFileSync(new URL('data/fixture.json',base))).actor;
const geometry=JSON.parse(fs.readFileSync(new URL('../game-logic/yard-v2/canonical-location-geometry.json',import.meta.url)));
const row=(x,y,id='a')=>({slotId:'canonical:'+id,goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x,y,condition:'new',uses:0,placedAt:1});
const rootDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const receipts=[];
function plan(rows,previous=supportedPose(actor)) {const args={geometry,rows,actor,targetSlotId:rows[0].slotId,previous},at=performance.now(),p=planCanonicalInspection(args);receipts.push({rows:rows.map(r=>[r.x,r.y]),ms:performance.now()-at,ok:p.ok,code:p.code,anchor:p.anchor?.id,stages:p.stages?.length,attempts:p.attempts?.length,inputJSONChars:JSON.stringify(args).length,resultJSONChars:JSON.stringify(p).length});return p;}
function samePose(a,b){assert.ok(rootDistance(a.root,b.root)<1e-7);assert.ok(Math.abs(angleDelta(a.heading,b.heading))<1e-7);for(const side of ['L','R']){assert.ok(rootDistance(a.feet[side].position,b.feet[side].position)<1e-7);assert.ok(Math.abs(a.feet[side].position.z-b.feet[side].position.z)<1e-7);assert.ok(Math.abs(angleDelta(a.feet[side].heading,b.feet[side].heading))<1e-7);}}
function checkPlan(p,rows){
 assert.equal(p.ok,true,p.code);const nav=createCanonicalNavigation({geometry,rows,actor});let previous=null;
 for(const stage of p.stages){
  const initial=sampleMotion(stage.route,stage.gait,actor,0);if(previous)samePose(previous,initial);
  let last=null;const plants=new Map();
  for(let t=0;t<=stage.route.totalMs;t+=16){const w=sampleMotion(stage.route,stage.gait,actor,t);assert.ok(supportedWorldValid(w,actor,nav));assert.ok(w.support.length>=1);if(last){assert.ok(rootDistance(w.root,last.root)<.19);assert.ok(Math.abs(angleDelta(w.heading,last.heading))<.055);}
   for(const f of Object.values(w.feet))if(f.planted){const old=plants.get(f.plantId);if(old){assert.deepEqual(f.position,old.position);assert.equal(f.heading,old.heading);}plants.set(f.plantId,f);}last=w;
  }
  previous=sampleMotion(stage.route,stage.gait,actor,stage.route.totalMs);assert.equal(previous.support.length,2);
 }
 samePose(previous??p.settled,p.settled);
}
test('normal committed target gets a true leaf-relative continuous path and repeat stays at actual settled pose',()=>{
 const rows=[row(98,118)],p=plan(rows);checkPlan(p,rows);assert.equal(p.anchor.id,'leaf-7');assert.equal(p.stages.length,1);assert.equal(p.stages[0].route.segments[0].kind,'quintic-heading-approach');
 const replay=plan(rows,p.settled);assert.equal(replay.ok,true);assert.equal(replay.holdOnly,true);assert.equal(replay.stages.length,0);samePose(replay.settled,p.settled);
});
test('blocked preferred side chooses another real leaf, with smoothly supported turn and unchanged planted headings',()=>{
 const rows=[row(98,118),row(94,135,'b')],p=plan(rows);checkPlan(p,rows);assert.notEqual(p.anchor.id,'leaf-7');assert.ok(p.stages.some(s=>s.kind==='orient-with-steps'));
});
test('two stored T2 instances require a connected detour around the actual other item',()=>{
 const rows=[row(110,125),row(95,125,'b')],p=plan(rows);checkPlan(p,rows);assert.equal(p.anchor.id,'leaf-2');assert.ok(p.stages.filter(s=>s.kind==='approach').length>=2);
});
test('a placement valid for the smaller T2 can still have every actor anchor blocked',()=>{
 const p=plan([row(35,115)]);assert.equal(p.ok,false);assert.equal(p.code,'NO_REACHABLE_INTERACTION_ANCHOR');assert.equal(p.attempts.length,16);
});
function controller(rows=[row(98,118)]){return createCanonicalInspectionController({geometry,actor,rows,planningNow:()=>0});}
test('moving target midwalk invalidates route, preserves root/support, and replans from recovered actual pose',()=>{
 const c=controller();assert.equal(c.request('canonical:a',0),true);c.tick(1000);const before=structuredClone(c.sample.world);assert.equal(before.support.length,1);
 c.updateLayout([row(108,122)],1000);assert.equal(c.state.phase,'recovering');for(const t of [1000,1100,1300,1500,1620]){c.tick(t);assert.deepEqual(c.sample.world.root,before.root);assert.equal(c.sample.world.heading,before.heading);for(const s of before.support){assert.deepEqual(c.sample.world.feet[s].position,before.feet[s].position);assert.equal(c.sample.world.feet[s].heading,before.feet[s].heading);}}
 assert.equal(c.sample.world.support.length,2);assert.equal(c.state.planCount,2);assert.equal(c.state.planLayoutKey,c.state.layoutKey);c.tick(100000);assert.equal(c.state.phase,'settled');assert.ok(c.sample.focus.x>100);
});
test('new other-item obstacle midwalk causes fresh admission; removed target cancels without reset',()=>{
 const c=controller();c.request('canonical:a',0);c.tick(1000);const before=structuredClone(c.sample.world);c.updateLayout([row(98,118),row(94,135,'b')],1000);c.tick(1620);assert.equal(c.state.planCount,2);assert.equal(c.state.planLayoutKey,c.state.layoutKey);assert.deepEqual(c.sample.world.root,before.root);c.tick(100000);assert.equal(c.state.phase,'settled');
 const d=controller();d.request('canonical:a',0);d.tick(1000);const old=structuredClone(d.sample.world);d.updateLayout([],1000);d.tick(1620);assert.equal(d.state.phase,'cancelled');assert.equal(d.state.active,false);assert.equal(d.sample.world.support.length,2);assert.deepEqual(d.sample.world.root,old.root);assert.equal(d.sample.world.heading,old.heading);d.tick(9000);assert.deepEqual(d.sample.world.root,old.root);
});
test('settled actor backs away from its old close envelope before visiting moved target',()=>{
 const first=plan([row(98,118)]),rows=[row(98,118),row(113,136,'b')],p=planCanonicalInspection({geometry,rows,actor,targetSlotId:'canonical:b',previous:first.settled});checkPlan(p,rows);assert.equal(p.stages[0].kind,'back-away');assert.equal(p.stages[0].route.fixedHeading,first.settled.heading);samePose(sampleMotion(p.stages[0].route,p.stages[0].gait,actor,0),first.settled);
});
test('layout hashes ignore row order and economic fields, but track every geometry mutation',()=>{
 const a=row(98,118),b=row(94,135,'b'),key=canonicalLayoutKey(geometry,[a,b]);assert.equal(key,canonicalLayoutKey(geometry,[{...b,placedAt:99},{...a,uses:1}]));assert.notEqual(key,canonicalLayoutKey(geometry,[a,{...b,x:b.x+1}]));assert.notEqual(key,canonicalLayoutKey(geometry,[a]));
});
test('blocked registered entry never invents a spawn and an existing actor rejects overlap',()=>{
 const c=controller([row(79,129.5)]);assert.equal(c.state.phase,'entry-blocked');assert.equal(c.sample,null);assert.equal(c.request('canonical:a',0),false);
 const d=controller();assert.equal(d.placementIsSafe(row(79,129.5,'b')),false);d.updateLayout([row(98,118),row(79,129.5,'b')],0);assert.equal(d.state.phase,'blocked-occupancy');assert.deepEqual(d.sample.world.root,supportedPose(actor).root);
});
test('asynchronous stale layout admission is ignored and planning wall time does not advance motion',async()=>{
 const requests=[],c=createCanonicalInspectionController({geometry,actor,rows:[row(98,118)],planner:args=>new Promise(resolve=>requests.push({args,resolve})),planningNow:()=>0});
 c.request('canonical:a',0);const held=structuredClone(c.sample.world);c.tick(500);samePose(held,c.sample.world);c.updateLayout([row(108,122)],500);assert.equal(requests.length,2);
 requests[0].resolve(planCanonicalInspection(requests[0].args));await Promise.resolve();assert.equal(c.state.phase,'planning');c.tick(1500);samePose(held,c.sample.world);
 requests[1].resolve(planCanonicalInspection(requests[1].args));await Promise.resolve();assert.equal(c.state.phase,'approaching');c.tick(1500);samePose(held,c.sample.world);assert.equal(c.state.planLayoutKey,c.state.layoutKey);
 c.dispose();assert.equal(c.tick(2000),null);
});
test('all eight real T2 leaf focuses and recovery feed unchanged R1 native skeleton without planted-foot motion',async()=>{
 const THREE=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js'),{GLTFLoader}=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/addons/loaders/GLTFLoader.js'),{createAdaptivePoseDriver}=await import('../src/games/companion-yard-v2/pip-prototype/prototype/adaptive-pose-driver.mjs');
 const cal=JSON.parse(fs.readFileSync(new URL('data/calibration.json',base))),bytes=fs.readFileSync(new URL('assets/pip.glb',base)),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const driver=createAdaptivePoseDriver(THREE,gltf,cal,{unitsPerSource:16}),bones=new Map();gltf.scene.traverse(o=>{if(o.isBone){const i=gltf.parser.associations.get(o)?.nodes;if(i!==undefined)bones.set(gltf.parser.json.nodes[i].name,o);}});
 const matrices=()=>Object.fromEntries([...bones].map(([n,b])=>[n,[...b.matrixWorld.elements]]));
 for(const a of interactionAnchors(actor,row(98,118))){const world=supportedPose(actor,{position:a.position,heading:a.heading});let first;for(const t of [0,360,650,1080,1500,1965]){driver.apply({world,startsFromSettled:true,styleFrame:96,anticipationU:1,settleU:1,inspection:sampleLocalInspection(world,a.focus,actor,t)});const m=matrices();if(!first)first=m;else for(const n of ['foot.L','foot.R'])for(let i=0;i<16;i++)assert.ok(Math.abs(m[n][i]-first[n][i])<1e-8);}}
 const c=controller();c.request('canonical:a',0);const walking=c.tick(1000);driver.apply(walking);const before=matrices();c.updateLayout([],1000);driver.apply(c.tick(1000));const recovered=matrices();for(const name of bones.keys())for(let i=0;i<16;i++)assert.ok(Math.abs(before[name][i]-recovered[name][i])<1e-8,'recovery start preserves '+name);
 driver.apply(c.tick(1620));assert.equal(c.sample.world.support.length,2);driver.dispose();
});
test('worker queue keeps only the latest pending request and resolves every job on retirement',async()=>{
 const {createCanonicalPlannerWorker}=await import('../src/games/companion-yard-v2/pip-prototype/dynamic-prop-worker-client.mjs');let retired=0;const sent=[],fake={postMessage:m=>sent.push(m),terminate:()=>retired++};const w=createCanonicalPlannerWorker({workerFactory:()=>fake});
 const a=w.plan({target:1}),b=w.plan({target:2}),c=w.plan({target:3});assert.equal(sent.length,1);assert.equal((await b).code,'PLANNER_SUPERSEDED');fake.onmessage({data:{id:sent[0].id,result:{ok:true,target:1}}});assert.equal((await a).target,1);assert.equal(sent.length,2);assert.equal(sent[1].args.target,3);w.dispose();w.dispose();assert.equal(retired,1);assert.equal((await c).code,'PLANNER_DISPOSED');assert.equal((await w.plan({})).code,'PLANNER_DISPOSED');
 const broken={postMessage(){},terminate(){}},failure=createCanonicalPlannerWorker({workerFactory:()=>broken}),pending=failure.plan({});broken.onerror();assert.equal((await pending).code,'PLANNER_WORKER_FAILED');assert.equal((await failure.plan({})).code,'PLANNER_WORKER_FAILED');failure.dispose();
});
test('real isolated planner worker returns admitted geometry without loading a mesh or renderer',async()=>{
 const {Worker}=await import('node:worker_threads'),{createCanonicalPlannerWorker}=await import('../src/games/companion-yard-v2/pip-prototype/dynamic-prop-worker-client.mjs');
 const url=new URL('../src/games/companion-yard-v2/pip-prototype/dynamic-prop-worker.mjs',import.meta.url).href;
 const source=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:data=>parentPort.postMessage(data)};await import(${JSON.stringify(url)});parentPort.on('message',data=>self.onmessage({data}));`;
 const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(source))),bridge={postMessage:data=>worker.postMessage(data),terminate:()=>worker.terminate()};worker.on('message',data=>bridge.onmessage?.({data}));worker.on('error',error=>bridge.onerror?.(error));
 const client=createCanonicalPlannerWorker({workerFactory:()=>bridge});try{const p=await client.plan({geometry,actor,rows:[row(98,118)],targetSlotId:'canonical:a',previous:supportedPose(actor)});assert.equal(p.ok,true,p.code);assert.equal(p.anchor.id,'leaf-7');assert.equal((await client.plan({oversized:'x'.repeat(32769)})).code,'PLANNER_INPUT_LIMIT');}finally{client.dispose();}
});
test.after(()=>{if(process.env.DYNAMIC_INSPECTION_RECEIPT)fs.writeFileSync(process.env.DYNAMIC_INSPECTION_RECEIPT,JSON.stringify({scope:'CPU canonical planner and actual GLB skeleton matrices; no browser pixels or visual acceptance',receipts},null,2)+'\n');});
