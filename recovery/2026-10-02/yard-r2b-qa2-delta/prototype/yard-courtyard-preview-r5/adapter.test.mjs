import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createCourtyardAdapter,PREVIEW_SCENE} from './adapter.mjs';
import {WALK_PHASES} from './walk-phase-lookup.mjs';
import {nodeKernel} from './kernel-node.mjs';
import {browserKernel} from './browser/kernel.mjs';
const binding=process.env.YARD_TEST_KERNEL==='browser'?'browser':'node',kernel=binding==='browser'?browserKernel:nodeKernel;
const clips=JSON.parse(await readFile(new URL('./clip-contracts.json',import.meta.url)));
const rawTurns=JSON.parse(await readFile(new URL('./turn-contracts.json',import.meta.url)));
const turns=rawTurns;
const adapter=createCourtyardAdapter(kernel,{clips,turns});
function start(scenario='mouse'){
 const {session,backup}=adapter.create({scenario});
 const response=adapter.action(session,{action:'yard.setFood',payload:{foodId:'kibble'},actionId:'preview:food'});
 assert.equal(response.status,200);return{session:response.session,backup};
}
const initial=start(),admitted=adapter.advanceModel(initial.session,3600000),plan=Object.values(admitted.render.plans)[0],visit=Object.values(admitted.kernel.runtime.visits)[0];
const report={status:'R3 technical turn playback; browser/art/production acceptance remains open',binding,tests:0};
test('actual kernel admission remains Mika and one reserved prop; cardinal route is a render sidecar',()=>{
 assert.equal(admitted.blocker,null);assert.equal(visit.original.visitorId,'mika_cat');assert.equal(visit.original.goodieId,'yarn_mouse');
 assert.deepEqual(admitted.kernel,kernel.advanceYard(initial.session.kernel,3600000,{scene:PREVIEW_SCENE}));
 assert.ok(plan.entryMotion.turnCount>0);assert.ok(plan.exitMotion.turnCount>0);
});
test('free movement and real turn selection retain the existing phase/action contract',()=>{
 const turn=plan.entryMotion.legs.find(l=>l.kind==='turn');
 const screen=8000+turn.startMs+251;
 const state=adapter.advancePresentation(initial.session,screen),pet=adapter.view(state).pets[0];
 assert.equal(pet.phase,'approach');assert.equal(pet.motion.kind,'turn');
 assert.equal(pet.motion.atMs,251);assert.equal(pet.motion.angleSteps,turn.angleSteps);assert.equal(pet.motion.fromFacing,turn.fromFacing);
 assert.equal(pet.motion.durationMs,turn.durationMs);assert.deepEqual(pet.position,turn.position);
 const later=adapter.view(adapter.advancePresentation(state,screen+177)).pets[0];assert.deepEqual(later.position,pet.position);
 assert.equal(later.motion.atMs,428);assert.notEqual(later.headingRadians,undefined);
});
test('mid-turn reload, skipped ticks and zero post-clip waits are partition stable',()=>{
 const once=adapter.advancePresentation(initial.session,180000);let sliced=initial.session;
 for(const at of[1,8000,12345,18417,25333,41987,58331,75000,180000]){
  sliced=adapter.advancePresentation(sliced,at);const result=adapter.restore(adapter.encode(sliced).value,initial.backup);assert.equal(result.ok,true);sliced=result.session;
 }
 assert.deepEqual(sliced,once);assert.equal(once.kernel.player.yard.pendingGifts.length,1);
 const end=8000+plan.presentation.approachMs+clips[plan.clipId].durationMs;
 const departure=adapter.advancePresentation(initial.session,end);assert.equal(departure.kernel.runtime.cursorMs,visit.timeline.departAt);
 assert.equal(adapter.view(departure).pets[0].phase,'depart');
});
test('display position and explicit28-slot walk phase share the same sampled distance',()=>{
 const first=plan.entryMotion.legs.find(l=>l.kind==='walk');
 for(let t=0;t<first.durationMs;t+=31){
  const p=adapter.view(adapter.advancePresentation(initial.session,8000+first.startMs+t)).pets[0];
  assert.equal(p.motion.kind,'walk');assert.equal(p.gaitPhase,WALK_PHASES[p.motion.frameIndex]);
  const d=Math.hypot(p.position.x-first.from.x,p.position.y-first.from.y);
  const cycles=d/(.64*8);assert.ok(Math.abs(cycles-Math.floor(cycles+1e-9)-p.gaitPhase)<1e-7);
 }
});
test('every turn envelope is reserved against later placement until Mika exits',()=>{
 const box=plan.turnReservations[0];assert.ok(box.width>20&&box.height>20);
 const check=adapter.placementCheck(admitted,'yard.moveGoodie',{slotId:'cushion',x:box.x+box.width/2,y:box.y+box.height/2});
 assert.ok(check.errors.some(e=>e.code==='RESERVED_STEP_TURN'));
});
test('callbacks cannot credit gifts; no-frame completion and repeated claim pay once',()=>{
 const invalid=adapter.action(admitted,{action:'turn-complete',actionId:'preview:fake'});assert.equal(invalid.status,400);
 const completed=adapter.advancePresentation(initial.session,180000);
 assert.equal(completed.kernel.player.yard.pendingGifts.length,1);assert.equal(completed.kernel.player.yard.pendingGifts[0].createdAt,visit.leavesAt);
 const claimed=adapter.action(completed,{action:'yard.collectGifts',actionId:'preview:claim'});
 assert.equal(claimed.extras.receipt.collected.gifts,1);
 const replay=adapter.action(claimed.session,{action:'yard.collectGifts',actionId:'preview:claim'});assert.equal(replay.replayed,true);assert.deepEqual(replay.session,claimed.session);
 assert.deepEqual(claimed.session.kernel.player.resources,initial.session.kernel.player.resources);
});
test('exact user collector move remains accepted, unrounded and lossless through prior-version recovery',()=>{
 const {session,backup}=adapter.create();
 const moved=adapter.action(session,{action:'yard.moveGoodie',actionId:'preview:moved',payload:{slotId:'mouse',x:37.00000188941175,y:44.99999501352009}});
 assert.equal(moved.status,200);
 const payload=structuredClone(moved.session);payload.format='yard-courtyard-preview/v2';payload.version=2;payload.configHash='prior-r2-config';
 const raw=JSON.stringify({format:'yard-courtyard-save/v2',payload,sha256:kernel.digest(payload)});
 const result=adapter.restore(raw,backup);assert.equal(result.ok,true);assert.equal(result.recoverySource,raw);assert.deepEqual(result.session.kernel,payload.kernel);
 const placement=result.session.kernel.player.yard.placedGoodies.find(p=>p.slotId==='mouse');
 assert.equal(placement.x,37.00000188941175);assert.equal(placement.y,44.99999501352009);
});
test('active incompatible saves and malformed/future versions remain recoverable readonly',()=>{
 const data=JSON.parse(adapter.encode(admitted).value);data.payload.configHash='previous';data.sha256=kernel.digest(data.payload);
 const raw=JSON.stringify(data),result=adapter.restore(raw,initial.backup);assert.equal(result.ok,false);assert.equal(result.rawSnapshot,raw);
 const future=JSON.parse(adapter.encode(initial.session).value);future.payload.version=999;future.sha256=kernel.digest(future.payload);
 assert.equal(adapter.restore(JSON.stringify(future),initial.backup).ok,false);
});
test('unapproved turn media is gated instead of falling back to snapped sprite headings',()=>{
 const blocked=createCourtyardAdapter(kernel,{clips,turns:{...turns,playbackReady:false}});
 const {session}=blocked.create();let s=blocked.action(session,{action:'yard.setFood',actionId:'preview:f',payload:{foodId:'kibble'}}).session;
 s=blocked.advancePresentation(s,180000);assert.equal(s.blocker.code,'TURN_MEDIA_NOT_READY');assert.equal(s.render.plans[Object.keys(s.kernel.runtime.visits)[0]],undefined);
});
test('new fixed bowl seed resolves both routes without dropping the full visible envelope',()=>{
 assert.deepEqual(PREVIEW_SCENE.bowlAnchor,{x:25,y:83});
 const f=start('cushion'),state=adapter.advancePresentation(f.session,180000);
 assert.equal(state.blocker,null);assert.equal(state.kernel.player.yard.pendingGifts.length,1);
 const p=state.kernel.player.yard.placedGoodies.find(p=>p.slotId==='cushion');assert.equal(p.x,56);assert.equal(p.y,66);
 const prior=createCourtyardAdapter(kernel,{clips,turns,scene:{...PREVIEW_SCENE,bowlAnchor:{x:25,y:80},exclusions:[{x:21.4,y:76.4,width:7.2,height:7.2}]}});
 const old=prior.create({scenario:'cushion'}).session;
 const rejected=prior.action(old,{action:'yard.setFood',actionId:'preview:old-food',payload:{foodId:'kibble'}});
 assert.equal(rejected.status,400);assert.equal(rejected.error,'REPOSITION_REQUIRED');
 assert.deepEqual(rejected.session.kernel.player.yard.foodInventory,old.kernel.player.yard.foodInventory);
 assert.deepEqual(rejected.session.kernel.player.yard.placedGoodies,old.kernel.player.yard.placedGoodies);
});
test('placement preflight rejects a turn-impossible layout before food or a visit can be spent',()=>{
 const {session}=adapter.create();
 const result=adapter.action(session,{action:'yard.moveGoodie',actionId:'preview:impossible',payload:{slotId:'cushion',x:56,y:69}});
 assert.equal(result.status,400);assert.deepEqual(result.session.kernel.player.yard.placedGoodies,session.kernel.player.yard.placedGoodies);
 assert.ok(result.details.some(e=>e.code==='PHASE_ALIGNED_ROUTE_UNAVAILABLE'));
 const ghost=adapter.placementCheck(admitted,'yard.moveGoodie',{slotId:'cushion',x:plan.entryRoute[1].x,y:plan.entryRoute[1].y});
 assert.equal(ghost.ok,false);
});
test('delivered turn manifest matches all12 approved real atlas clips and explicit technical-only scope',async()=>{
 const evidence=JSON.parse(await readFile(new URL('./turn-media-evidence.json',import.meta.url)));
 assert.equal(rawTurns.playbackReady,true);assert.equal(evidence.atlas.turnFrames,812);assert.equal(evidence.atlas.turnClips,12);
 assert.equal(rawTurns.artUnderReview,true);assert.equal(rawTurns.browserQANotRun,true);
 assert.equal(rawTurns.sourcePoseSha256,'bbebc5bb8d1bc62b2593b472af3a21601f6053a2381c1422bb706b432a0fbb05');
 assert.equal(rawTurns.atlasValidationSha256,'7b3078ee77c36b97dcdcecc817287a162d2956d884864e00d59c82c7e81fa246');
 assert.deepEqual(Object.keys(rawTurns.variants).sort(),Object.keys(evidence.clips).sort());
 for(const[key,v]of Object.entries(rawTurns.variants)){
  const media=evidence.clips[key];assert.equal(v.frameCount,media.frameCount);assert.equal(v.durationMs,media.durationMs);
  assert.equal(v.actorEnvelope.validated,true);assert.deepEqual(v.rootDelta,[0,0,0]);assert.equal(v.entryPhase,0);assert.equal(v.exitPhase,0);
  assert.equal(v.yawByFrame.length,v.frameCount);
 }
});
test.after(async()=>{report.tests=12;report.mouseRoute=plan.presentation;report.oldBowlConflictPreserved=true;report.newBowlAnchor=PREVIEW_SCENE.bowlAnchor;await writeFile(new URL(`./VALIDATION-${binding}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');});
