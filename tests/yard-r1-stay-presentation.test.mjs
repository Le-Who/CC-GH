import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareR1Stay,sampleR1Stay,createR1StayPresenter,R1_STAY_BINDINGS,R1_STAY_FOOD_EXCLUSION,r1StayLayoutKey} from '../src/games/companion-yard-v2/pip-prototype/canonical-stay-presentation.mjs';
import {buildR1FrontPortal} from '../src/games/companion-yard-v2/pip-prototype/canonical-stay-routes.mjs';
import fixture from '../src/games/companion-yard-v2/pip-prototype/data/fixture.json' with {type:'json'};
import geometry from '../game-logic/yard-v2/canonical-location-geometry.json' with {type:'json'};
import {sampleMotion} from '../src/games/companion-yard-v2/pip-prototype/motion/kinematics.mjs';
import {createCanonicalNavigation,canonicalLayoutKey} from '../src/games/companion-yard-v2/pip-prototype/dynamic-navigation.mjs';
import {supportedWorldValid} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';

const row=(x=98,y=118,id='a')=>({slotId:'canonical:'+id,goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x,y,condition:'new',uses:0,placedAt:1});
const rows=[row()],args=(minutes=45)=>({visitId:'r1-source-only',arrivedAt:1000,leavesAt:1000+minutes*60000,motionSeed:'seed-v1',targetSlotId:'canonical:a',rows});
const cache=new Map();function plan(minutes=45){if(!cache.has(minutes)){const r=prepareR1Stay(args(minutes));assert.equal(r.prepared,true,r.code);cache.set(minutes,r.plan);}return cache.get(minutes);}
const sameWorld=(a,b)=>{for(const k of ['x','y'])assert.ok(Math.abs(a.root[k]-b.root[k])<1e-7);assert.ok(Math.abs(a.heading-b.heading)<1e-7);for(const side of ['L','R']){for(const k of ['x','y','z'])assert.ok(Math.abs(a.feet[side].position[k]-b.feet[side].position[k])<1e-7);assert.ok(Math.abs(a.feet[side].heading-b.feet[side].heading)<1e-7);}};

test('real pinned R1 prepares both complete server stays with integral contiguous boundaries and closed registry',()=>{
 for(const minutes of [45,110]){const p=plan(minutes);assert.deepEqual(p.phases.map(p=>p.phase),['entrance','approach','interaction','rest','exit']);let end=p.arrivedAt;
  for(const s of p.phases){assert.equal(s.startMs,end);assert.ok(Number.isSafeInteger(s.startMs)&&Number.isSafeInteger(s.endMs)&&s.endMs>s.startMs);end=s.endMs;}assert.equal(end,p.leavesAt);
  assert.equal(p.proposedPropReleaseAt,p.phases.at(-1).startMs);assert.deepEqual(p.propCommits,[]);assert.equal(p.actor.unitsPerSource,16);assert.equal(p.source.modelSha256,'74edd9400bcb69266ce670c977f05bf3ae8c62b448877f4ee34967565815c45b');
  assert.equal(Object.isFrozen(p),true);assert.equal(p.qualification.visual,false);assert.equal(p.qualification.admission,false);assert.deepEqual(R1_STAY_BINDINGS,[]);
 }
});
test('sparse varied behavior is seeded, has real focus, zero sniff, long quiet pauses and no stretched source clip',()=>{
 const p=plan(),events=p.episodes.filter(e=>e.kind!=='quiet-rest');assert.deepEqual(new Set(events.map(e=>e.kind)),new Set(['leaf-look','ear-listen','curiosity-tilt']));
 assert.ok(events.length>20&&events.length<70);for(let i=1;i<events.length;i++)assert.notEqual(events[i].kind,events[i-1].kind);
 const quiet=p.episodes.filter(e=>e.kind==='quiet-rest').reduce((n,e)=>n+e.endMs-e.startMs,0),rest=p.phases[3];assert.ok(quiet/(rest.endMs-rest.startMs)>.88);
 for(const e of p.episodes){const r=sampleR1Stay(p,(e.startMs+e.endMs)/2);assert.equal(r.sample.styleFrame,96);assert.equal(r.sample.world.support.length,2);assert.equal(r.sample.intention,e.kind);if(r.sample.inspection){assert.equal(r.sample.inspection.sniff,0);assert.equal(r.sample.inspection.earSniff,0);assert.deepEqual(r.sample.focus,p.anchor.focus);}}
 const repeated=prepareR1Stay(args());assert.deepEqual(repeated.plan,p);const changed=prepareR1Stay({...args(),motionSeed:'seed-v2'});assert.equal(changed.prepared,true,changed.code);assert.notDeepEqual(changed.plan.episodes,p.episodes);
});
test('random access, reload and hidden-tab catch-up preserve the same absolute server sample',()=>{
 const p=plan(110),times=[p.arrivedAt-1,p.arrivedAt,p.phases[1].startMs+1000,p.phases[2].startMs+2200,p.arrivedAt+38*60000,p.departureAt+1500,p.leavesAt-1,p.leavesAt];
 const expected=times.map(t=>sampleR1Stay(p,t)),presenter=createR1StayPresenter(JSON.parse(JSON.stringify(p)));
 for(let i=times.length-1;i>=0;i--)assert.deepEqual(presenter.sampleAt(times[i],geometry,rows),expected[i]);
 assert.equal(expected[0].sample,null);assert.equal(expected.at(-1).phase,'departed');assert.equal(expected.at(-1).sample,null);
 assert.equal(presenter.sampleAt(p.arrivedAt+60000,geometry,[row(99,118)]).code,'R1_STAY_LAYOUT_CHANGED');
});
test('portal is genuinely off-raster at both ends, confined to actor-only world-domain extension',()=>{
 const p=plan(),g=JSON.stringify(geometry),portal=buildR1FrontPortal(geometry,fixture.actor,rows),nav=createCanonicalNavigation({geometry,rows,actor:fixture.actor});
 assert.equal(portal.actorOnly,true);assert.ok(portal.hiddenTop>=portal.clipBottom+3.999);assert.equal(nav.passable(portal.outside),false);assert.equal(nav.passable(portal.join),true);
 for(const [x,y] of portal.groundExtension){assert.ok(x>=0&&x<=200);assert.ok(y>=0&&y<=220);}assert.equal(JSON.stringify(geometry),g);
 assert.deepEqual(p.initial.root,p.final.root);assert.equal(p.entranceStages[0].kind,'front-edge-enter');assert.equal(p.exitStages.at(-1).kind,'front-edge-exit');
 assert.equal(portal.navigation.visualPoint({...portal.join,x:portal.join.x+1}),false,'composition exception cannot escape the single corridor');
});
test('actual entrance, approach and exit retain support and continuous planted targets',()=>{
 const p=plan(),ordinary=createCanonicalNavigation({geometry,rows,actor:fixture.actor}),portal=buildR1FrontPortal(geometry,fixture.actor,rows);let previous=p.initial;
 for(const stage of [...p.entranceStages,...p.approachStages,...p.exitStages]){
  const nav=stage.kind.startsWith('front-edge')?portal.navigation:ordinary,plants=new Map();sameWorld(previous,sampleMotion(stage.route,stage.gait,p.actor,0));
  for(let t=0;t<stage.route.totalMs;t+=31){const w=sampleMotion(stage.route,stage.gait,p.actor,t);assert.ok(w.support.length);assert.equal(supportedWorldValid(w,p.actor,nav),true,`${stage.kind} ${t}`);for(const f of Object.values(w.feet))if(f.planted){if(plants.has(f.plantId))assert.deepEqual(f.position,plants.get(f.plantId));plants.set(f.plantId,f.position);}}
  previous=sampleMotion(stage.route,stage.gait,p.actor,stage.route.totalMs);assert.equal(previous.support.length,2);
 }
 sameWorld(previous,p.final);
});
test('blocked portal, stale source, future target and unreachable actual target fail without side effects',()=>{
 const input=args(),snapshot=JSON.stringify(input);assert.equal(prepareR1Stay({...input,actor:{...fixture.actor,unitsPerSource:12}}).code,'R1_STAY_SOURCE_REVISION_MISMATCH');
 assert.equal(prepareR1Stay({...input,rows:[{...row(),placedAt:1001}]}).code,'R1_STAY_TARGET_NOT_PRESENT_AT_ARRIVAL');
 const portal=buildR1FrontPortal(geometry,fixture.actor,rows),blocked=prepareR1Stay({...input,rows:[row(),row(portal.join.x,portal.join.y,'blocker')]});assert.equal(blocked.prepared,false);assert.equal(blocked.code,'R1_PORTAL_CORRIDOR_BLOCKED');
 const unreachable=prepareR1Stay({...input,rows:[row(35,115)]});assert.equal(unreachable.prepared,false);assert.equal(unreachable.code,'NO_REACHABLE_INTERACTION_ANCHOR');assert.equal(JSON.stringify(input),snapshot);
});
test('actual pinned GLB accepts every gesture and keeps both supported foot matrices unchanged',async()=>{
 const THREE=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js'),{GLTFLoader}=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/addons/loaders/GLTFLoader.js'),{createAdaptivePoseDriver}=await import('../src/games/companion-yard-v2/pip-prototype/prototype/adaptive-pose-driver.mjs');
 // The overlay fallback paths are resolved by the supplied source harness.
 const read=name=>fs.readFileSync(new URL(import.meta.resolve('../src/games/companion-yard-v2/pip-prototype/'+name))),cal=JSON.parse(read('data/calibration.json')),bytes=read('assets/pip.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const driver=createAdaptivePoseDriver(THREE,gltf,cal,{unitsPerSource:16}),bones=new Map();gltf.scene.traverse(o=>{if(o.isBone){const i=gltf.parser.associations.get(o)?.nodes;if(i!==undefined)bones.set(gltf.parser.json.nodes[i].name,o);}});
 const matrices=()=>Object.fromEntries([...bones].map(([n,b])=>[n,[...b.matrixWorld.elements]])),p=plan(),times=[p.phases[2].startMs,...p.episodes.filter(e=>e.kind!=='quiet-rest').slice(0,12).flatMap(e=>[e.startMs,e.startMs+(e.endMs-e.startMs)*.5,e.endMs-1]),p.phases[2].startMs+2700];
 driver.apply(sampleR1Stay(p,p.phases[2].startMs).sample);const still=matrices();let moved=false;
 for(const t of times){driver.apply(sampleR1Stay(p,t).sample);const m=matrices();for(const n of ['foot.L','foot.R'])for(let i=0;i<16;i++)assert.ok(Math.abs(m[n][i]-still[n][i])<1e-8);moved||=m.head.some((v,i)=>Math.abs(v-still.head[i])>1e-4);}
 assert.equal(moved,true);
 // Evaluated skinned vertices, not a root-only disappearance claim. This is
 // CPU projection, still no native raster/shader/compositor evidence.
 const c=geometry.composition.camera,scale=c.pixelsPerSceneUnitCss/8;
 for(const t of [p.arrivedAt,p.leavesAt-.01]){driver.apply(sampleR1Stay(p,t).sample);let minY=Infinity,count=0;gltf.scene.traverse(mesh=>{if(!mesh.isMesh)return;const attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++){const v=new THREE.Vector3().fromBufferAttribute(attr,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);const wx=v.x*16,wy=-v.z*16,wz=v.y*16,sy=c.projectionOriginCss[1]+((wx-c.projectionOriginCanonical[0])*c.down[0]+(wy-c.projectionOriginCanonical[1])*c.down[1]+wz*c.down[2])*scale;minY=Math.min(minY,sy);count++;}});assert.ok(count>1000);assert.ok(minY>geometry.composition.art.height,`all ${count} vertices hidden: minY ${minY}`);}
 driver.dispose();
});

test('existing direct renderer adapter resumes at server time and draws no obsolete changed-layout route',async()=>{
 const {createR1StayRenderAdapter}=await import('../src/games/companion-yard-v2/pip-prototype/canonical-stay-runtime-adapter.mjs');
 const calls=[],renderer={setCanonicalPlacements:(r,o)=>calls.push({rows:r,options:o}),renderDirect:o=>{calls.push(o);return true;}},p=plan(),adapter=createR1StayRenderAdapter({plan:p,renderer,project:p=>({x:p.x,y:p.y}),setPresentationVisible:()=>true});
 assert.equal(adapter.drawAt({serverNow:p.arrivedAt+100,geometry,rows,drawingEnabled:false}).drawn,false);assert.equal(calls.length,0);
 const now=p.arrivedAt+22*60000,result=adapter.drawAt({serverNow:now,geometry,rows});assert.equal(result.drawn,true);assert.deepEqual(calls.at(-1).sample,sampleR1Stay(p,now).sample);
 const before=calls.length;assert.equal(adapter.drawAt({serverNow:now+1,geometry,rows:[row(99,118)]}).drawn,false);assert.equal(calls.length,before);
 adapter.drawAt({serverNow:p.leavesAt,geometry,rows});assert.equal(calls.at(-1).visibility,'planter');assert.equal(calls.at(-1).sample.intention,'departed');
});

test('the exact R2 food obstacle is accepted and arbitrary obstacle or world revisions remain rejected',()=>{
 const foodGeometry={...geometry,exclusions:[...geometry.exclusions,R1_STAY_FOOD_EXCLUSION]},input={...args(),geometry:foodGeometry};
 const r=prepareR1Stay(input);assert.equal(r.prepared,true,r.code);assert.equal(r.plan.navigationRevision,'pip-garden-t2-food-r2');assert.deepEqual(r.plan.foodObstacle,R1_STAY_FOOD_EXCLUSION);
 assert.notEqual(r.plan.layoutKey,plan().layoutKey);assert.equal(sampleR1Stay(r.plan,r.plan.arrivedAt+50000,{layoutKey:r1StayLayoutKey(geometry,rows)}).code,'R1_STAY_LAYOUT_CHANGED');
 const bad=structuredClone(foodGeometry);bad.exclusions.at(-1).polygon[0][0]+=.001;assert.equal(prepareR1Stay({...input,geometry:bad}).code,'R1_STAY_SOURCE_REVISION_MISMATCH');
});
let briskPlan;
function brisk(){if(!briskPlan){const r=prepareR1Stay({...args(),motionProfile:'r1-brisk-pace-1.4-v1'});assert.equal(r.prepared,true,r.code);briskPlan=r.plan;}return briskPlan;}
test('one explicit brisk motion preserves shape, source amplitudes, stride budget and exact server release times',()=>{
 const b=plan(),p=brisk();for(const k of ['arrivedAt','leavesAt','departureAt','proposedPropReleaseAt'])assert.equal(p[k],b[k]);
 assert.equal(p.source.movementRevision,'r1-brisk-pace-1.4-v1');assert.equal(p.source.comparisonOnly,true);assert.equal(b.source.comparisonOnly,false);
 assert.ok(p.phases[2].startMs<b.phases[2].startMs);assert.ok(p.exitHoldMs>0);assert.equal(p.exitStages.some(s=>s.kind==='return-to-portal-curved'),true);assert.equal(p.exitStages.some(s=>s.kind==='face-exit-with-steps'),false);
 for(const key of Object.keys(b.actor))if(!['halfStepMs','anticipationMs','maxSpeedSourcePerSecond'].includes(key))assert.deepEqual(p.actor[key],b.actor[key]);
 assert.ok(Math.abs(p.actor.halfStepMs*p.actor.maxSpeedSourcePerSecond-b.actor.halfStepMs*b.actor.maxSpeedSourcePerSecond)<1e-10);
 assert.equal(sampleR1Stay(p,p.departureAt).sample.intention,'quiet-before-exit');sameWorld(sampleR1Stay(p,p.departureAt+p.exitHoldMs).sample.world,p.settled);
 assert.equal(prepareR1Stay({...args(),motionProfile:'unreviewed-fast'}).code,'R1_STAY_MOTION_PROFILE_UNREGISTERED');
});
test('brisk routes independently recheck support, reach, obstacle envelopes and planted-foot continuity',()=>{
 const p=brisk(),ordinary=createCanonicalNavigation({geometry,rows,actor:p.actor}),portal=buildR1FrontPortal(geometry,p.actor,rows);let previous=p.initial;
 for(const stage of [...p.entranceStages,...p.approachStages,...p.exitStages]){
  sameWorld(previous,sampleMotion(stage.route,stage.gait,p.actor,0));const nav=stage.kind.startsWith('front-edge')?portal.navigation:ordinary,plants=new Map();
  for(let t=0;t<=stage.route.totalMs;t+=17){const w=sampleMotion(stage.route,stage.gait,p.actor,t);assert.equal(supportedWorldValid(w,p.actor,nav),true,stage.kind);assert.ok(w.support.length);for(const f of Object.values(w.feet)){assert.ok(Math.hypot(w.root.x-f.position.x,w.root.y-f.position.y)<=p.actor.maxFootReachSource*p.actor.unitsPerSource+1e-6);if(f.planted){if(plants.has(f.plantId))assert.deepEqual(f.position,plants.get(f.plantId));plants.set(f.plantId,f.position);}}}
  previous=sampleMotion(stage.route,stage.gait,p.actor,stage.route.totalMs);
 }
 sameWorld(previous,p.final);
});
test('brisk candidate drives the real GLB and measured sole centers at actual faster timings',async()=>{
 const THREE=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js'),{GLTFLoader}=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/addons/loaders/GLTFLoader.js'),{createAdaptivePoseDriver}=await import('../src/games/companion-yard-v2/pip-prototype/prototype/adaptive-pose-driver.mjs');
 const read=name=>fs.readFileSync(new URL(import.meta.resolve('../src/games/companion-yard-v2/pip-prototype/'+name))),cal=JSON.parse(read('data/calibration.json')),bytes=read('assets/pip.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const driver=createAdaptivePoseDriver(THREE,gltf,cal,{unitsPerSource:16}),bones=new Map();gltf.scene.traverse(o=>{if(o.isBone){const i=gltf.parser.associations.get(o)?.nodes;if(i!==undefined)bones.set(gltf.parser.json.nodes[i].name,o);}});
 const localSoles={};for(const side of ['L','R']){const native=cal.boneSideMap.contractToNative[side],rest=new THREE.Matrix4().set(...cal.restMatrices['foot.'+native].flat());localSoles[side]=new THREE.Vector3(...cal.feet[native].soleCenterSource).applyMatrix4(rest.invert());}
 const p=brisk();let checked=0,maxError=0;
 for(const phase of [p.phases[0],p.phases[1],p.phases[4]])for(let at=phase.startMs;at<phase.endMs;at+=137){
  const sample=sampleR1Stay(p,at).sample;driver.apply(sample);
  for(const side of ['L','R']){const native=cal.boneSideMap.contractToNative[side],v=localSoles[side].clone().applyMatrix4(bones.get('foot.'+native).matrixWorld),target=sample.world.feet[side].position,error=Math.hypot(v.x*16-target.x,-v.z*16-target.y,v.y*16-target.z);maxError=Math.max(maxError,error);assert.ok(error<1e-7);}
  checked++;
 }
 assert.ok(checked>300);assert.ok(maxError<1e-7);driver.dispose();
});

test('brisk quiet exit ends target attention at the unchanged release boundary while retaining every spatial interval',()=>{
 const p=brisk(),r=p.reservationRequirements;assert.equal(r.authoritative,false);assert.equal(r.target.endMs,plan().departureAt);let end=p.arrivedAt;
 for(const interval of r.spatial){assert.equal(interval.startMs,end);assert.ok(interval.endMs>interval.startMs);for(const box of [interval.bodyEnvelope,interval.supportEnvelope])assert.ok(box.width>0&&box.height>0);end=interval.endMs;}assert.equal(end,p.leavesAt);
 const wait=r.spatial.find(s=>s.kind==='exit-supported-wait');assert.equal(wait.startMs,p.departureAt);assert.equal(wait.endMs,p.departureAt+p.exitHoldMs);
 const sample=sampleR1Stay(p,p.departureAt+1);assert.equal(sample.sample.inspection,undefined);assert.equal(sample.sample.focus,undefined);assert.equal(sample.propUse,false);assert.equal(sample.reservationIntent.targetRequired,false);assert.equal(sample.reservationIntent.bodyAndExitRequired,true);sameWorld(sample.sample.world,p.settled);
});

test('host visibility contract clears stale, terminal, disabled and failed renderer surfaces',async()=>{
 const {createR1StayRenderAdapter}=await import('../src/games/companion-yard-v2/pip-prototype/canonical-stay-runtime-adapter.mjs'),p=plan();
 function setup(){const state={wrapper:false,actor:false,paused:false,contextLost:false,fail:false};const renderer={setCanonicalPlacements(){},renderDirect({visibility,forcePausedRedraw=false}){if(state.fail)throw Error('RENDER_FAILURE');if(state.contextLost||state.paused&&!forcePausedRedraw)return false;state.actor=visibility==='both'||visibility==='pet';return true;}},adapter=createR1StayRenderAdapter({plan:p,renderer,project:p=>p,setPresentationVisible:value=>{state.wrapper=value;return true;}});adapter.drawAt({serverNow:p.arrivedAt+60000,geometry,rows});assert.equal(state.wrapper&&state.actor,true);return {state,adapter};}
 for(const mode of ['stale','stale-departed','paused-departed','disabled-departed','lost-departed','lost-active','throw-active','malformed-active','malformed-departed','host-invalidation']){
  const {state,adapter}=setup();state.paused=mode==='paused-departed';state.contextLost=mode.startsWith('lost');state.fail=mode==='throw-active';
  if(mode==='host-invalidation')adapter.invalidate();else{const input={serverNow:mode.endsWith('departed')?p.leavesAt:p.arrivedAt+60001,geometry:mode.startsWith('malformed')?null:geometry,rows:mode.startsWith('malformed')?null:mode.startsWith('stale')?[row(99,118)]:rows,drawingEnabled:mode!=='disabled-departed'};if(state.fail)assert.throws(()=>adapter.drawAt(input),/RENDER_FAILURE/);else adapter.drawAt(input);}
  assert.equal(state.wrapper&&state.actor,false,mode);
 }
 assert.throws(()=>createR1StayRenderAdapter({plan:p,renderer:{setCanonicalPlacements(){},renderDirect(){}},project:p=>p}),/VISIBILITY_CONTROL_REQUIRED/);
});
test('quiet, pre-exit and pre-arrival states expose exact wakes; movement exposes RAF demand; terminal wins over stale layout',()=>{
 const p=plan(),q=p.episodes.find(e=>e.kind==='quiet-rest'),quiet=sampleR1Stay(p,q.startMs+1);assert.equal(quiet.nextChangeAt,q.endMs);assert.equal(quiet.needsAnimationFrame,false);
 assert.equal(sampleR1Stay(p,p.arrivedAt-1).nextChangeAt,p.arrivedAt);assert.equal(sampleR1Stay(p,p.arrivedAt+100).needsAnimationFrame,true);
 const c=brisk(),waiting=sampleR1Stay(c,c.departureAt+1);assert.equal(waiting.nextChangeAt,c.departureAt+c.exitHoldMs);assert.equal(waiting.needsAnimationFrame,false);
 const end=sampleR1Stay(p,p.leavesAt,{layoutKey:'changed'});assert.equal(end.phase,'departed');assert.equal(end.nextChangeAt,null);assert.equal(end.needsAnimationFrame,false);
 assert.equal(createR1StayPresenter(p).sampleAt(p.leavesAt,null,null).phase,'departed');
});
test('stay identity rejects altered condition, uses or placement lifetime without changing the navigation key',()=>{
 const p=plan(),presenter=createR1StayPresenter(p);
 for(const patch of [{condition:'worn'},{uses:1},{placedAt:2}]){const changed=[{...row(),...patch}];assert.equal(canonicalLayoutKey(geometry,changed),canonicalLayoutKey(geometry,rows));assert.equal(presenter.sampleAt(p.arrivedAt+60000,geometry,changed).code,'R1_STAY_LAYOUT_CHANGED');}
 assert.deepEqual(p.storageScope,{locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1'});assert.equal(p.navigationScope.portalRevision,'actor-only-corridor-v1');assert.equal(p.geometryRevision,undefined);
});
test('fractional boundaries keep every gesture channel in range and feed the unchanged strict actual pose driver',async()=>{
 const THREE=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js'),{GLTFLoader}=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/addons/loaders/GLTFLoader.js'),{createAdaptivePoseDriver}=await import('../src/games/companion-yard-v2/pip-prototype/prototype/adaptive-pose-driver.mjs');
 const read=name=>fs.readFileSync(new URL(import.meta.resolve('../src/games/companion-yard-v2/pip-prototype/'+name))),cal=JSON.parse(read('data/calibration.json')),bytes=read('assets/pip.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),driver=createAdaptivePoseDriver(THREE,gltf,cal,{unitsPerSource:16});
 const longBrisk=prepareR1Stay({...args(110),motionProfile:'r1-brisk-pace-1.4-v1'});assert.equal(longBrisk.prepared,true,longBrisk.code);let checked=0;
 for(const p of [plan(),plan(110),brisk(),longBrisk.plan])for(const e of [p.phases[2],...p.episodes.filter(e=>e.kind!=='quiet-rest')])for(const delta of [.1,.01,.001,.0001]){
  const sample=sampleR1Stay(p,e.endMs-delta).sample;for(const key of ['anticipate','lean','sniff','curiosity','earFollow','earSniff'])assert.ok(sample.inspection[key]>=0&&sample.inspection[key]<=1,`${key} at ${e.endMs-delta}`);driver.apply(sample);checked++;
 }
 assert.ok(checked>900);driver.dispose();
});
test('copied R2 obstacle capability exactly matches the independently owned food host contract',async()=>{
 const {CANONICAL_FOOD_EXCLUSION,canonicalFoodNavigationGeometry}=await import('../src/games/companion-yard-v2/pip-prototype/canonical-food-scene.mjs');
 assert.deepEqual(R1_STAY_FOOD_EXCLUSION,CANONICAL_FOOD_EXCLUSION);
 assert.deepEqual(canonicalFoodNavigationGeometry(geometry,{reserved:true}),{...geometry,exclusions:[...geometry.exclusions,R1_STAY_FOOD_EXCLUSION]});
});
