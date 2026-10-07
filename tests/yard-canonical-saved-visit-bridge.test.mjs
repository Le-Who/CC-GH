import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareCanonicalSavedVisit,restoreCanonicalSavedVisit,canonicalSavedVisitReservations,canonicalSavedVisitConflict,CANONICAL_SAVED_VISIT_ENABLED,CANONICAL_SAVED_VISIT_BINDINGS} from '../game-logic/yard-v2/canonical-saved-visit-bridge.mjs';
import {prepareR1SavedStay,sampleR1SavedStay,r1SavedStayGeometry,R1_SAVED_STAY_BINDINGS} from '../src/games/companion-yard-v2/pip-prototype/canonical-saved-stay.mjs';
import {canonicalStorageValid} from '../game-logic/yard-v2/canonical-locations.mjs';
import {inspectPlayerYard} from '../game-logic/yard-v2/service.mjs';
import {createCanonicalNavigation} from '../src/games/companion-yard-v2/pip-prototype/dynamic-navigation.mjs';
import {buildR1FrontPortal} from '../src/games/companion-yard-v2/pip-prototype/canonical-stay-routes.mjs';
import {supportedWorldValid} from '../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs';
import {sampleMotion} from '../src/games/companion-yard-v2/pip-prototype/motion/kinematics.mjs';
import {digest} from '../game-logic/yard-v2/util.mjs';
import {advanceYard} from '../game-logic/yard-v2/simulation.mjs';
import {createDefaultYardState} from '../game-logic/yard.js';
import {migratePlayerSnapshot} from '../game-logic/yard-v2/migration.mjs';
const row=(x=98,y=118,id='a')=>({slotId:`canonical:${id}`,goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x,y,condition:'new',uses:0,placedAt:1});
const input=(minutes=45)=>({candidate:{visitId:`visit_v2_source_${minutes}`,visitorId:'pip_hamster',goodieId:'leaf_pot',activityId:'peek',slotId:'canonical:a',arrivedAt:1000,leavesAt:1000+minutes*60000},rows:[row()],bowl:{id:'bowl-1',foodId:'kibble',servings:4,placedAt:1,expiresAt:7200000}});
const cache=new Map();function prepared(minutes=45){if(!cache.has(minutes)){const r=prepareCanonicalSavedVisit(input(minutes));assert.equal(r.prepared,true,r.code);cache.set(minutes,r);}return cache.get(minutes);}
const clone=structuredClone;
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const worldClose=(a,b)=>{assert.ok(Math.hypot(a.root.x-b.root.x,a.root.y-b.root.y)<1e-7);for(const side of ['L','R'])for(const key of ['x','y','z'])assert.ok(Math.abs(a.feet[side].position[key]-b.feet[side].position[key])<1e-7);};

test('both duration endpoints preserve original 84% release, unchanged absolute endpoints, one serving and one use',()=>{
 for(const minutes of [45,110]){const source=input(minutes),before=clone(source),r=prepareCanonicalSavedVisit(source);assert.equal(r.prepared,true,r.code);cache.set(minutes,r);
  assert.deepEqual(source,before);assert.equal(r.plan.releaseAt,1000+Math.ceil(minutes*60000*.84));assert.equal(r.plan.leavesAt,source.candidate.leavesAt);assert.equal(r.plan.arrivedAt,1000);
  assert.equal(r.record.after.rows[0].uses,1);assert.equal(r.record.before.rows[0].uses,0);assert.equal(r.record.after.bowl.servings,3);assert.equal(r.record.economicIntent.committed,false);assert.equal(r.record.economicIntent.giftCreationAt,source.candidate.leavesAt);
  assert.equal(r.admission,false);assert.equal(r.ready,false);assert.equal(Object.hasOwn(r,'ok'),false);assert.equal(Object.isFrozen(r.record),true);assert.equal(r.record.requiredContainerVersion,3);
 }
 assert.equal(CANONICAL_SAVED_VISIT_ENABLED,false);assert.deepEqual(CANONICAL_SAVED_VISIT_BINDINGS,[]);assert.deepEqual(R1_SAVED_STAY_BINDINGS,[]);
});

test('actor leaves target and its incoming route by release, then remains grounded with no prop focus',()=>{
 const {record,plan}=prepared(),idle=plan.reservationRequirements.spatial.find(r=>r.kind==='neutral-rest');
 assert.equal(idle.startMs,plan.releaseAt);for(const b of plan.protectedIncomingBoxes)for(const a of [idle.bodyEnvelope,idle.supportEnvelope])assert.equal(overlap(a,b),false);
 for(const t of [plan.releaseAt,plan.releaseAt+1,(plan.releaseAt+plan.departureAt)/2,plan.departureAt-.001]){const s=sampleR1SavedStay(plan,t,{rows:record.after.rows});assert.equal(s.phase,'neutral-rest');assert.equal(s.sample.focus,undefined);assert.equal(s.sample.inspection,undefined);assert.equal(s.sample.world.support.length,2);assert.equal(s.needsAnimationFrame,false);assert.equal(s.nextChangeAt,plan.departureAt);worldClose(s.sample.world,plan.restWorld);}
 assert.equal(sampleR1SavedStay(plan,plan.retreatAt,{rows:record.after.rows}).sample.inspection,undefined);
});

test('retreat and final exit are supported source routes, with continuous planted targets and exact phase joins',()=>{
 const {record,plan}=prepared(),geometry=r1SavedStayGeometry(),ordinary=createCanonicalNavigation({geometry,rows:record.after.rows,actor:plan.actor}),portal=buildR1FrontPortal(geometry,plan.actor,record.after.rows);
 for(const [stages,initial] of [[plan.retreatStages,plan.inspectionPlan.settled],[plan.exitStages,plan.restWorld]]){let prior=initial;for(const s of stages){worldClose(sampleMotion(s.route,s.gait,plan.actor,0),prior);const plants=new Map(),nav=s.kind.startsWith('front-edge')?portal.navigation:ordinary;
   for(let t=0;t<=s.route.totalMs;t+=53){const w=sampleMotion(s.route,s.gait,plan.actor,t);assert.equal(supportedWorldValid(w,plan.actor,nav),true,`${s.kind}@${t}`);assert.ok(w.support.length);for(const f of Object.values(w.feet))if(f.planted){if(plants.has(f.plantId))assert.deepEqual(f.position,plants.get(f.plantId));plants.set(f.plantId,f.position);}}
   prior=sampleMotion(s.route,s.gait,plan.actor,s.route.totalMs);
  }}
 worldClose(plan.restWorld,plan.retreatStages.at(-1).end);worldClose(plan.inspectionPlan.final,plan.exitStages.at(-1).end);
 let end=plan.arrivedAt;for(const r of plan.reservationRequirements.spatial){assert.equal(r.startMs,end);assert.ok(r.endMs>r.startMs);end=r.endMs;}assert.equal(end,plan.leavesAt);
});

test('unavailable guests and activities never silently become Pip, and client enablement fields cannot admit',()=>{
 for(const patch of [{visitorId:'mika_cat'},{activityId:'sleep'},{goodieId:'cushion'}]){const x=input();Object.assign(x.candidate,patch);assert.equal(prepareCanonicalSavedVisit(x).code,'CANONICAL_SELECTED_CANDIDATE_UNSUPPORTED');}
 const x=input();Object.assign(x.candidate,{enabled:true,admission:true,ready:true,binding:'fake'});const r=prepareCanonicalSavedVisit(x);assert.equal(r.prepared,true);assert.equal(r.admission,false);assert.equal(r.ready,false);assert.equal(Object.hasOwn(r,'ok'),false);assert.ok(r.gates.includes('CANONICAL_SAVED_VISIT_ADMISSION_DISABLED'));
 const p=prepared().plan;assert.equal(prepareR1SavedStay({visitId:p.visitId,arrivedAt:p.arrivedAt,leavesAt:p.leavesAt,motionSeed:'x',targetSlotId:'canonical:a',rows:prepared().record.after.rows,motionProfile:'r1-brisk-pace-1.4-v1'}).code,'R1_SAVED_MOTION_PROFILE_UNAVAILABLE');
});

test('new-only art permits 6 to 7 and blocks 7 to 8 without weakening old item storage',()=>{
 const x=input();x.rows[0].uses=6;const r=prepareCanonicalSavedVisit(x);assert.equal(r.prepared,true,r.code);assert.equal(r.record.after.rows[0].uses,7);
 x.rows[0].uses=7;assert.equal(prepareCanonicalSavedVisit(x).code,'CANONICAL_POST_USE_CONDITION_UNAVAILABLE');assert.equal(x.rows[0].uses,7);
 assert.equal(canonicalStorageValid(input().rows),true);assert.equal(canonicalStorageValid(prepared().record.after.rows),false);
});

test('food, placement time, duplicate slots and invalid stay inputs fail before route preparation',()=>{
 for(const alter of [x=>x.rows[0].placedAt=1001,x=>x.rows.push(clone(x.rows[0])),x=>Object.assign(x.rows[0],{x:80,y:82}),x=>x.rows[0].condition='worn']){const x=input();alter(x);assert.equal(prepareCanonicalSavedVisit(x).prepared,false);}
 for(const patch of [{id:'bowl-2'},{servings:0},{placedAt:1001},{expiresAt:1000},{foodId:'unknown'}]){const x=input();Object.assign(x.bowl,patch);assert.equal(prepareCanonicalSavedVisit(x).code,'CANONICAL_AUTHORITATIVE_FOOD_UNAVAILABLE');}
 const x=input();x.candidate.leavesAt+=1;assert.equal(prepareCanonicalSavedVisit(x).code,'CANONICAL_SERVER_CANDIDATE_INVALID');
});

test('last serving uses the unchanged clear-bowl convention without creating stock or rewards',()=>{
 const x=input();x.bowl.servings=1;const before=clone(x),r=prepareCanonicalSavedVisit(x);assert.equal(r.prepared,true,r.code);assert.deepEqual(r.record.after.bowl,{id:'bowl-1',foodId:null,servings:0,placedAt:null,expiresAt:null});assert.deepEqual(x,before);assert.equal(r.record.economicIntent.giftId,`gift_v2_${digest(x.candidate.visitId).slice(0,32)}`);
});

test('JSON reload rebuilds exact source plan against post-use rows; stale pre-use snapshot is rejected',()=>{
 const r=prepared(),record=JSON.parse(JSON.stringify(r.record));const reload=restoreCanonicalSavedVisit(record,{rows:record.after.rows,serverNow:r.plan.releaseAt+23});assert.equal(reload.prepared,true,reload.code);assert.deepEqual(reload.plan,r.plan);assert.equal(reload.sample.phase,'neutral-rest');
 assert.equal(restoreCanonicalSavedVisit(record,{rows:record.before.rows}).code,'CANONICAL_SAVED_VISIT_LAYOUT_STALE');
 assert.equal(restoreCanonicalSavedVisit(record,{serverNow:r.plan.releaseAt}).code,'CANONICAL_CURRENT_ROWS_REQUIRED');
});

test('rehashed malicious saved envelopes, clocks and stock are rejected by source replay, not trusted hashes',()=>{
 const original=prepared().record;
 for(const mutate of [r=>r.reservations.spatial[0].bodyEnvelope.width=.01,r=>r.releaseAt+=1,r=>r.after.rows[0].uses+=1,r=>r.after.bowl.servings+=1,r=>r.presentationHash='0'.repeat(64),r=>r.motionSeed='different']){const r=clone(original);mutate(r);delete r.recordHash;r.recordHash=digest(r);assert.equal(restoreCanonicalSavedVisit(r).code,'CANONICAL_SAVED_VISIT_SOURCE_REPLAY_MISMATCH');}
});

test('unknown future profile/version stays opaque and does not mutate saved bytes',()=>{
 for(const mutate of [r=>r.format='yard-canonical-saved-visit/v999',r=>r.profile.navigationProfile='legacy-ground',r=>r.status='active',r=>r.requiredContainerVersion=2]){const r=clone(prepared().record);mutate(r);const bytes=JSON.stringify(r);assert.equal(restoreCanonicalSavedVisit(r).prepared,false);assert.equal(JSON.stringify(r),bytes);}
});

test('half-open target release retains neutral body reservations through exit and fully ends at leavesAt',()=>{
 const {record,plan}=prepared();assert.equal(canonicalSavedVisitReservations(record,plan.releaseAt-1).targetReserved,true);const at=canonicalSavedVisitReservations(record,plan.releaseAt);assert.equal(at.targetReserved,false);assert.equal(at.boxes.length,2);const end=canonicalSavedVisitReservations(record,plan.leavesAt);assert.equal(end.targetReserved,false);assert.deepEqual(end.boxes,[]);
 assert.equal(canonicalSavedVisitReservations({format:'old-visit'},plan.releaseAt).prepared,false);
});

test('placement conflict detects the neutral body and respects exact half-open departure boundary',()=>{
 const {record,plan}=prepared(),rect=plan.reservationRequirements.spatial.find(r=>r.kind==='neutral-rest').bodyEnvelope;
 assert.equal(canonicalSavedVisitConflict(record,{rect,startMs:plan.releaseAt,endMs:plan.releaseAt+1}).conflict,true);
 assert.equal(canonicalSavedVisitConflict(record,{rect,startMs:plan.leavesAt,endMs:plan.leavesAt+1}).conflict,false);
 assert.equal(canonicalSavedVisitConflict(record,{rect,startMs:plan.releaseAt,endMs:plan.releaseAt+1,navigationProfile:'old'}).code,'CANONICAL_RESERVATION_PROFILE_MISMATCH');
});

test('terminal source sample wins over stale layout without awarding a gift or advancing a clock',()=>{
 const {record,plan}=prepared(),before=clone(record),r=restoreCanonicalSavedVisit(record,{rows:null,serverNow:plan.leavesAt});assert.equal(r.prepared,true,r.code);assert.equal(r.sample.phase,'departed');assert.equal(r.sample.sample,null);assert.deepEqual(record,before);
 for(const t of [plan.releaseAt+1,plan.retreatAt+500,plan.arrivedAt-1,plan.departureAt+300,plan.releaseAt+1]){const expected=sampleR1SavedStay(plan,t,{rows:record.after.rows}),again=sampleR1SavedStay(JSON.parse(JSON.stringify(plan)),t,{rows:record.after.rows});assert.deepEqual(again,expected);}
});

test('old authoritative service rejects proposed container v3 read-only and preserves the complete save on rollback',()=>{
 const player={schemaVersion:11,id:'rollback-proof',yard:{sentinel:'retained'},_yardV2:{format:'yard-persistent/v1',version:3,runtime:{canonicalVisits:{one:clone(prepared().record)},canonicalPlacements:clone(prepared().record.after.rows),legacyUnknown:{keep:true}},migration:{rawBackup:{historic:true}},legacyReceipts:[{keep:true}]},otherGame:{wallet:73}};
 const before=clone(player),r=inspectPlayerYard(player,{now:1000});assert.equal(r.status,409);assert.equal(r.mutable,false);assert.equal(r.error,'UNSUPPORTED_YARD_STORAGE_VERSION');assert.deepEqual(player,before);
});

test('user layout moves change target-derived rest and route identities rather than selecting an authored scene',()=>{
 const x=input();x.rows[0].x=98;x.rows[0].y=116;const r=prepareCanonicalSavedVisit(x);assert.equal(r.prepared,true,r.code);assert.notDeepEqual(r.plan.restWorld.root,prepared().plan.restWorld.root);assert.notEqual(r.record.presentationHash,prepared().record.presentationHash);assert.deepEqual(r.plan.inspectionPlan.target,r.record.after.rows[0]);
 const nav=createCanonicalNavigation({geometry:r1SavedStayGeometry(),rows:r.record.after.rows,actor:r.plan.actor});assert.equal(nav.passable(r.plan.restWorld.root),true);
});

test('a valid item placement without a qualified readmission-safe rest/exit refuses the visit without fallback',()=>{
 const x=input();x.rows[0].x=108;x.rows[0].y=126;const before=clone(x),r=prepareCanonicalSavedVisit(x);assert.equal(r.prepared,false);assert.equal(r.code,'R1_SAVED_NO_NEUTRAL_REST_ANCHOR');assert.equal(r.ready,false);assert.equal(r.admission,false);assert.deepEqual(x,before);
});

test('the last seeded leaf gesture settles before retreat and new phase samples drive the unchanged actual R1 skeleton',async()=>{
 const {record,plan}=prepared(),before=sampleR1SavedStay(plan,plan.retreatAt-.001,{rows:record.after.rows});
 if(before.sample.inspection)for(const key of ['anticipate','lean','sniff','curiosity','earFollow','earSniff'])assert.ok(Math.abs(before.sample.inspection[key])<1e-6,key);
 const THREE=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js'),{GLTFLoader}=await import('../src/games/companion-yard-v2/pip-prototype/vendor/three/addons/loaders/GLTFLoader.js'),{createAdaptivePoseDriver}=await import('../src/games/companion-yard-v2/pip-prototype/prototype/adaptive-pose-driver.mjs');
 const read=name=>fs.readFileSync(new URL(import.meta.resolve('../src/games/companion-yard-v2/pip-prototype/'+name))),cal=JSON.parse(read('data/calibration.json')),bytes=read('assets/pip.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const driver=createAdaptivePoseDriver(THREE,gltf,cal,{unitsPerSource:16}),bones=new Map();gltf.scene.traverse(o=>{if(o.isBone){const i=gltf.parser.associations.get(o)?.nodes;if(i!==undefined)bones.set(gltf.parser.json.nodes[i].name,o);}});
 const soles={};for(const side of ['L','R']){const native=cal.boneSideMap.contractToNative[side],rest=new THREE.Matrix4().set(...cal.restMatrices['foot.'+native].flat());soles[side]=new THREE.Vector3(...cal.feet[native].soleCenterSource).applyMatrix4(rest.invert());}
 const times=[plan.retreatAt-.001,plan.retreatAt,plan.releaseAt-.001,plan.releaseAt,plan.releaseAt+10000,plan.departureAt,plan.leavesAt-.001];for(let t=plan.retreatAt;t<plan.releaseAt;t+=211)times.push(t);
 for(const t of times){const sample=sampleR1SavedStay(plan,t,{rows:record.after.rows}).sample;driver.apply(sample);for(const side of ['L','R']){const native=cal.boneSideMap.contractToNative[side],v=soles[side].clone().applyMatrix4(bones.get('foot.'+native).matrixWorld),target=sample.world.feet[side].position;assert.ok(Math.hypot(v.x*16-target.x,-v.z*16-target.y,v.y*16-target.z)<1e-7);}}
 driver.dispose();
});

test('save source-only review samples with explicit closed gates',()=>{
 for(const minutes of [45,110])fs.writeFileSync(new URL(`../../sample-${minutes}m.json`,import.meta.url),JSON.stringify({record:prepared(minutes).record,plan:prepared(minutes).plan},null,2)+'\n');
});

test('real historical lottery callback cannot interpret this prepared bridge as admission or spend any resource',()=>{
 const H=3600000,yard=createDefaultYardState(0);yard.placedGoodies=[{slotId:'legacy-boundary-pot',goodieId:'leaf_pot',x:60,y:35,uses:0,condition:'new',placedAt:0}];yard.bowls=[{id:'bowl-1',foodId:'kibble',servings:1,placedAt:0,expiresAt:10*H}];
 const state=migratePlayerSnapshot({id:'CODE-ONLY-callback-boundary',yard},{now:0}),before=clone(state);
 const control=advanceYard(state,H,{admissionPolicy:()=>({ok:true,admission:false})});assert.equal(Object.keys(control.runtime.visits).length,1);
 let count=0;const safe=advanceYard(state,H,{admissionPolicy:()=>{count++;return prepared();}});assert.equal(count,1);assert.deepEqual(safe.runtime.visits,{});assert.deepEqual(safe.runtime.giftLedger,{});
 for(const key of ['bowls','placedGoodies','petbook','activeVisitors','pendingGifts','currencies'])assert.deepEqual(safe.player.yard[key],before.player.yard[key],key);
 assert.deepEqual(state,before);
});

test('independent complete reservation comparison permits immediate same-target readmission at the original 84% release',()=>{
 const first=prepared(),secondInput=input();secondInput.candidate.visitId='second-authoritative-lottery-candidate';secondInput.candidate.arrivedAt=first.plan.releaseAt;secondInput.candidate.leavesAt=first.plan.releaseAt+45*60000;secondInput.rows=clone(first.record.after.rows);secondInput.bowl=clone(first.record.after.bowl);
 const second=prepareCanonicalSavedVisit(secondInput);assert.equal(second.prepared,true,second.code);assert.equal(second.record.after.rows[0].uses,2);
 // Independent pairwise time/space check, including the old visitor's later
 // exit against the new visitor's occupied target, not just the release frame.
 const intervals=r=>[...r.reservations.spatial.flatMap(s=>[{start:s.startMs,end:s.endMs,rect:s.bodyEnvelope},{start:s.startMs,end:s.endMs,rect:s.supportEnvelope}]),{start:r.reservations.target.startMs,end:r.reservations.target.endMs,rect:r.reservations.target.rect}];
 let compared=0;for(const a of intervals(first.record))for(const b of intervals(second.record))if(a.start<b.end&&a.end>b.start){compared++;assert.equal(overlap(a.rect,b.rect),false,JSON.stringify({a,b}));}
 assert.ok(compared>10);assert.equal(first.plan.releaseAt,second.plan.arrivedAt);
 const stillFirst=restoreCanonicalSavedVisit(first.record,{rows:second.record.after.rows,serverNow:first.plan.releaseAt});assert.equal(stillFirst.prepared,true,stillFirst.code);assert.equal(stillFirst.sample.phase,'neutral-rest');assert.equal(stillFirst.sample.sample.inspection,undefined);
 assert.equal(restoreCanonicalSavedVisit(first.record,{rows:second.record.after.rows,serverNow:first.plan.releaseAt-1}).code,'CANONICAL_SAVED_VISIT_LAYOUT_STALE');
 for(const patch of [{x:first.record.after.rows[0].x+1},{placedAt:2},{uses:0},{condition:'worn',uses:8}]){const rows=clone(second.record.after.rows);Object.assign(rows[0],patch);assert.equal(sampleR1SavedStay(first.plan,first.plan.releaseAt+1,{rows}).phase,'unavailable');}
});
