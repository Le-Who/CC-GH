import test from 'node:test';
import assert from 'node:assert/strict';
import c from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type:'json'};
import e from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type:'json'};
import {mikaItemFixture} from './fixtures/mika-item-input.mjs';
import {bindMikaPersistedItems,planMikaItemArrival,planMikaItemContinuation,planMikaItemContinuationAsync} from '../src/games/companion-yard-v2/mika-qa/mika-item-approach.mjs';
import {planMikaYardQaContinuation,planMikaYardQaContinuationAsync,sampleMikaYardQaCruise,polygonHitsBox} from '../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
import {createProjection} from '../src/games/companion-yard-v2/projection.mjs';
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function fixture(target=[88,62],viewport=null){
 const input=mikaItemFixture([{slotId:'first',goodieId:'yarn_mouse',x:60,y:45,condition:'new'},{slotId:'second',goodieId:'yarn_mouse',x:target[0],y:target[1],condition:'new'}]);
 const bound=bindMikaPersistedItems(input.snapshot,input.view),p=viewport&&createProjection(...viewport);
 const acceptSweep=p?(s,v)=>s.every(a=>[v.min,v.max].every(z=>{const q=p.project({...a,z});return q.x>=3&&q.y>=3&&q.x<=p.width-3&&q.y<=p.height-3;})):()=>true;
 const first=planMikaItemArrival(bound,c,e,{targetSlotId:'first',acceptSweep});assert.equal(first.ok,true);
 const stopped=sampleMikaYardQaCruise(first.plan,bound.binding.layout,6).sample;
 return{...input,bound,first,stopped,acceptSweep};
}
function seam(at,t){
 const h=1e-5,a=at(t-h),b=at(t),d=at(t+h);
 assert(dist(a.root.position,b.root.position)<.0001);assert(dist(b.root.position,d.root.position)<.0001);
 assert(Math.abs(a.root.heading-b.root.heading)<.0001);assert(Math.abs(d.root.heading-b.root.heading)<.0001);
 for(const name of Object.keys(b.boneMatrices))for(let i=0;i<4;i++)for(let j=0;j<4;j++){
  assert(Math.abs(a.boneMatrices[name][i][j]-b.boneMatrices[name][i][j])<.001,name);
  assert(Math.abs(d.boneMatrices[name][i][j]-b.boneMatrices[name][i][j])<.001,name);
 }
 for(const id of Object.keys(b.contacts)){
  assert(dist(a.contacts[id].paw,b.contacts[id].paw)<.001,id);assert(dist(b.contacts[id].paw,d.contacts[id].paw)<.001,id);
 }
 return[dist(a.root.position,b.root.position)/h,dist(b.root.position,d.root.position)/h];
}
test('2/3/4-second constant-speed clips hand actual contact phases into unchanged arrival (isolated clear-ground physics fixture)',()=>{
 const {stopped}=fixture();
 // Deliberately isolate cadence here; this square is not released Yard admission.
 const layout={remodel:'meadow',maskRows:Array.from({length:51},()=>[[0,100]]),obstacles:[]};
 const phases=new Set();
 for(const cruiseSeconds of [2,3,4]){
  const plan=planMikaYardQaContinuation(layout,c,e,stopped,{acceptCandidate:p=>p.cruiseSeconds===cruiseSeconds&&p.pivotSeconds===0});assert.equal(plan.ok,true,JSON.stringify(plan));assert.equal(plan.cruiseSeconds,cruiseSeconds);
  const at=t=>{const r=sampleMikaYardQaCruise(plan,layout,t);assert.equal(r.status,'ready');return r.sample;};
  assert.deepEqual(at(0),stopped);assert(dist(at(.00001).root.position,stopped.root.position)<1e-9);
  for(const t of [2,2+cruiseSeconds])for(const speed of seam(at,t))assert(Math.abs(speed-.74)<1e-5,String(speed));
  const incoming=at(2+cruiseSeconds);phases.add(incoming.phase.toFixed(6));
  for(let i=0;i<=plan.duration*60;i++)assert.equal(at(i/60).reachFailures.length,0);
  const terminal=at(plan.duration),idle=at(plan.duration-.4);assert.deepEqual(terminal.root,idle.root);
  for(const id of c.phaseOrder){assert.equal(terminal.contacts[id].contact,true);assert(dist(terminal.contacts[id].paw,idle.contacts[id].paw)<1e-10);}
  assert.deepEqual(at(2+cruiseSeconds+.2),at(2+cruiseSeconds+.2));
 }
 assert.equal(phases.size,3,'Every selected duration retains its own actual gait phase');
});
test('three source-valid selected targets admit a same-pose two-leg path in normal cameras including wrapped compact status with previous target retained',()=>{
 for(const target of [[88,62],[87,57],[87,54]])for(const viewport of [[308,346],[308,331.625],[378,622],[756,240]]){
  const {bound,stopped,acceptSweep}=fixture(target,viewport),before=structuredClone(stopped),next=planMikaItemContinuation(bound,c,e,stopped,'second',{acceptSweep});
  assert.equal(next.ok,true,`${target} ${viewport}: ${next.reason}`);assert.deepEqual(stopped,before);assert.equal(next.target.slotId,'second');assert.equal(next.target.x,target[0]);assert.equal(next.target.y,target[1]);
  if(target[0]===87&&target[1]===54){const projection=createProjection(...viewport),box=next.target.box;for(const x of[box.x,box.x+box.width])for(const y of[box.y,box.y+box.height]){const q=projection.project({x,y});assert(q.x>=3&&q.x<=projection.width-3&&q.y>=3&&q.y<=projection.height-3,'The chosen visible target footprint fits this normal camera');}}
  assert.equal(next.plan.turnAwayRadians,Math.PI/2);assert.equal(next.plan.cruiseSeconds,2);assert.equal(next.plan.duration,11.35);
  assert.deepEqual(next.plan.start,{x:stopped.root.position[0]*8,y:stopped.root.position[1]*8});assert.equal(next.plan.heading,stopped.root.heading);
  assert(bound.binding.layout.obstacles.some(box=>box.id==='first'));for(const box of bound.binding.layout.obstacles)assert.equal(polygonHitsBox(next.plan.sweep,box),false);
  const at=t=>{const result=sampleMikaYardQaCruise(next.plan,bound.binding.layout,t);assert.equal(result.status,'ready');return result.sample;};assert.deepEqual(at(0),stopped);
  seam(at,5.35);for(const t of [7.35,9.35])for(const speed of seam(at,t))assert(Math.abs(speed-.74)<1e-5);
  for(const t of [0,.5,2.5,5.35,6.2,7.35,8,9.35,10,11.35])assert.equal(at(t).reachFailures.length,0);
 }
});
test('missing/wrong selected slots and blocked current-pose routes decline without mutating the stopped pose; layout cancellation is permanent',()=>{
 const {bound,stopped,acceptSweep}=fixture(),before=structuredClone(stopped);
 assert.equal(planMikaItemContinuation(bound,c,e,stopped,'missing').reason,'NATIVE_ITEM_TARGET_UNAVAILABLE');
 const blocked=structuredClone(bound);blocked.binding.layout.obstacles.push({id:'blocked-current-body',x:stopped.root.position[0]*8-2,y:stopped.root.position[1]*8-2,width:4,height:4});
 assert.equal(planMikaItemContinuation(blocked,c,e,stopped,'second').ok,false);assert.deepEqual(stopped,before);
 assert.equal(planMikaItemArrival(bound,c,e,{targetSlotId:'missing'}).ok,false);
 const next=planMikaItemContinuation(bound,c,e,stopped,'second',{acceptSweep});assert.equal(next.ok,true);
 const changed=structuredClone(bound.binding.layout);changed.obstacles.find(box=>box.id==='second').x++;
 assert.equal(sampleMikaYardQaCruise(next.plan,bound.binding.layout,2).status,'ready');
 assert.deepEqual(sampleMikaYardQaCruise(next.plan,changed,2.1),{status:'aborted',reason:'LAYOUT_CHANGED'});
 assert.deepEqual(sampleMikaYardQaCruise(next.plan,bound.binding.layout,3),{status:'aborted',reason:'LAYOUT_CHANGED'});assert.deepEqual(stopped,before);
});


test('incremental planning yields bounded work and exactly matches synchronous candidate and pose samples',async()=>{
 const {bound,stopped,acceptSweep}=fixture(),sync=planMikaItemContinuation(bound,c,e,stopped,'second',{acceptSweep});assert.equal(sync.ok,true);
 let yields=0,maxSlice=0,heartbeat=0;const sliceTimes=[];const timer=setInterval(()=>heartbeat++,0);
 try{
  const incremental=await planMikaItemContinuationAsync(bound,c,e,stopped,'second',{acceptSweep,onSlice:(ms,stage)=>{maxSlice=Math.max(maxSlice,ms);sliceTimes.push({ms,stage});},yieldTask:()=>new Promise(resolve=>setTimeout(()=>{yields++;resolve();},0))});
  assert.deepEqual(incremental,sync);assert(sliceTimes.length>=Math.floor(sync.plan.duration*40/4));assert(yields>5);assert(heartbeat>5,'Other real tasks run before planning completes');
  for(let frame=0;frame<=100;frame++){const t=sync.plan.duration*frame/100;assert.deepEqual(sampleMikaYardQaCruise(incremental.plan,bound.binding.layout,t),sampleMikaYardQaCruise(sync.plan,bound.binding.layout,t));}
  console.log(JSON.stringify({incrementalSlices:yields,maxSliceMs:maxSlice,otherTasks:heartbeat,worstSlices:sliceTimes.sort((a,b)=>b.ms-a.ms).slice(0,6)}));
 }finally{clearInterval(timer);}
});
test('cancellation between planning slices closes the iterator without admitting a stale plan',async()=>{
 const {bound,stopped}=fixture(),controller=new AbortController();let yields=0;
 await assert.rejects(planMikaItemContinuationAsync(bound,c,e,stopped,'second',{signal:controller.signal,yieldTask:async()=>{yields++;if(yields===4)controller.abort(Error('layout changed'));}}),/layout changed/);
 assert.equal(yields,4);assert.equal(stopped.motionPhase,'standing-idle');
 const already=new AbortController();already.abort(Error('owner disposed'));let work=0;
 await assert.rejects(planMikaYardQaContinuationAsync(bound.binding.layout,c,e,stopped,{signal:already.signal,onSlice:()=>work++}),/owner disposed/);assert.equal(work,0);
});

test('the original exhausted search yields throughout all eighteen refused candidates',{timeout:30000},async()=>{
 const f=mikaItemFixture([{slotId:'first',goodieId:'yarn_mouse',x:64,y:54,condition:'new'}]),bound=bindMikaPersistedItems(f.snapshot,f.view),first=planMikaItemArrival(bound,c,e);
 const stopped=sampleMikaYardQaCruise(first.plan,bound.binding.layout,6).sample;let beats=0,slices=0,maxSlice=0;const timer=setInterval(()=>beats++,0),start=performance.now();
 try{const result=await planMikaYardQaContinuationAsync(bound.binding.layout,c,e,stopped,{onSlice:ms=>{slices++;maxSlice=Math.max(maxSlice,ms);}});
  assert.deepEqual(result,{ok:false,reason:'NO_CLEAR_MIKA_CONTINUATION',candidates:18});assert(slices>1000);assert(beats>20);
  console.log(JSON.stringify({exhaustedWallMs:performance.now()-start,slices,maxSliceMs:maxSlice,otherTasks:beats}));
 }finally{clearInterval(timer);}
});


test('authoritative reserved-entry projection rejects88,65 before native planning',()=>{
 const {snapshot,view}=mikaItemFixture([{slotId:'first',goodieId:'yarn_mouse',x:60,y:45,condition:'new'},{slotId:'entry-overlap',goodieId:'yarn_mouse',x:88,y:65,condition:'new'}]);
 assert.equal(snapshot.yardRuntime.display.ok,false);assert(snapshot.yardRuntime.display.issues.some(issue=>issue.code==='EXCLUSION_COLLISION'&&issue.slotId==='entry-overlap'));
 assert.equal(bindMikaPersistedItems(snapshot,view).ok,false);
});
