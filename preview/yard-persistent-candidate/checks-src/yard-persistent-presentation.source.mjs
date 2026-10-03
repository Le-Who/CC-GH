import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMikaServerOptions,MIKA_PLACEMENT_SUGGESTIONS } from '../game-logic/yard-v2/mika-media.mjs';
import { sampleStay, buildStaySchedule, propTransformAt } from '../game-logic/yard-v2/media/stay-schedule.mjs';
import { courtyardPresentation } from '../src/games/companion-yard-v2/presentation.mjs';
import { selectPetPose } from '../src/games/companion-yard-v2/pose-selection.mjs';
import { PresentationClock } from '../src/games/companion-yard-v2/presentation-clock.mjs';
import { MIKA_RUNTIME_MEDIA_REVISION } from '../game-logic/yard-v2/media/runtime-version.mjs';
import clips from '../game-logic/yard-v2/media/clip-contracts.json' with {type:'json'};
import media from '../public/assets/yard-mika/runtime-media.json' with {type:'json'};

const at=2000000000000;
function make(minutes=45){
  const options=getMikaServerOptions(),placement={slotId:'cushion',goodieId:'sun_cushion',...MIKA_PLACEMENT_SUGGESTIONS.sun_cushion,condition:'new',uses:0};
  const yard={remodel:'meadow',expansion:{level:1},placedGoodies:[{slotId:'mouse',goodieId:'yarn_mouse',...MIKA_PLACEMENT_SUGGESTIONS.yarn_mouse,condition:'new',uses:0},placement]};
  const binding=options.mediaRegistry.bindings.find(b=>b.goodieId==='sun_cushion');
  const candidate={at,leavesAt:at+minutes*60000,slotId:'cushion',placement,yard,bowl:{id:'bowl-1',foodId:'kibble'},reserved:[],active:[]};
  const result=options.preflight(candidate,binding);assert.equal(result.ok,true,result.code);return{...result,candidate,yard};
}
test('45–110 minute stays preserve physical timing and fill the entire visible interval',()=>{
  for(let minutes=45;minutes<=110;minutes++){
    const {plan}=make(minutes),s=plan.schedule;
    assert.ok(s.entryDelayMs>=0&&s.entryDelayMs<1200);assert.equal(s.leavesAt,at+minutes*60000);
    assert.equal(s.segments[0].startAt,at);assert.equal(s.segments.at(-1).endAt,s.leavesAt);
    for(let i=1;i<s.segments.length;i++)assert.equal(s.segments[i].startAt,s.segments[i-1].endAt);
    const loop=s.segments.find(x=>x.kind==='loop');assert.equal((loop.endAt-loop.startAt)%1200,0);
    assert.equal(s.segments.find(x=>x.role==='settle').endAt-s.segments.find(x=>x.role==='settle').startAt,9500);
    assert.equal(s.segments.find(x=>x.role==='wake').endAt-s.segments.find(x=>x.role==='wake').startAt,9500);
    assert.equal(s.propReleaseAt,s.segments.find(x=>x.role==='wake').endAt);
    assert.equal(sampleStay(plan,s.enterAt-1),null);assert.equal(sampleStay(plan,s.leavesAt),null);
  }
});
test('breathing loop uses24 actual source frames and its exact source tile at the exit seam',()=>{
  const {plan}=make(71),loop=plan.schedule.segments.find(s=>s.kind==='loop');
  const indices=[];for(let ms=0;ms<1200;ms+=50)indices.push(selectPetPose(media,sampleStay(plan,loop.startAt+ms)).index);
  assert.deepEqual(indices,Array.from({length:24},(_,i)=>190+i));
  assert.equal(selectPetPose(media,sampleStay(plan,loop.startAt+1200)).index,190);
  assert.equal(selectPetPose(media,sampleStay(plan,loop.endAt)).index,190);
  assert.equal(selectPetPose(media,sampleStay(plan,loop.endAt+50)).index,215);
});
test('reload random access samples the same pose, origin and owner without frame history',()=>{
  const {plan}=make(110),restored=JSON.parse(JSON.stringify(plan));
  for(const segment of plan.schedule.segments){
    for(const time of [segment.startAt,segment.startAt+1,segment.endAt-1])assert.deepEqual(sampleStay(restored,time,{visitId:'visit'}),sampleStay(plan,time,{visitId:'visit'}));
  }
});
test('cushion has exactly one render owner through settle/rest/wake and releases after step-off',()=>{
  const {plan,candidate,yard}=make();const visit={renderCompatible:true,visitId:'v',visitorId:'mika_cat',slotId:'cushion',releaseAt:plan.propReleaseAt,leavesAt:candidate.leavesAt,mediaAdmission:{plan,bindingId:"mika-cushion-r1",goodieId:"sun_cushion"}};
  const snapshot={yard:{...yard,bowls:[],pendingGifts:[]},yardRuntime:{mutable:true,visits:[visit],display:{placements:[],issues:[]}}};
  for(const segment of plan.schedule.segments){
    const view=courtyardPresentation(snapshot,segment.startAt+1,clips),prop=view.props.find(p=>p.slotId==='cushion');
    const owns=view.pets.filter(p=>p.propOwnerSlotId==='cushion').length;
    assert.equal(Number(prop.drawStandalone)+owns,1);
    assert.equal(prop.reserved,segment.startAt+1<plan.propReleaseAt);
  }
  const view=courtyardPresentation(snapshot,plan.propReleaseAt,clips);assert.equal(view.props.find(p=>p.slotId==='cushion').drawStandalone,true);
  assert.equal(view.pets[0].phase,'depart');
});
test('missing floor-rest media cannot turn a short mouse clip into a long stay',()=>{
  const {plan,candidate}=make();assert.equal(buildStaySchedule(candidate,plan,clips['mika-mouse-r1'],null).code,'LONG_STAY_GROUND_REST_UNAVAILABLE');
});
test('legacy slot projection never rewrites its saved placement',()=>{
  const raw={slotId:'legacy',goodieId:'yarn_mouse',uses:0,condition:'new',unknown:'retained'};
  const snapshot={yard:{placedGoodies:[raw]},yardRuntime:{mutable:true,visits:[],display:{placements:[{slotId:'legacy',displayPlacement:{...raw,x:35,y:45}}],issues:[]}}};
  const before=JSON.stringify(snapshot),view=courtyardPresentation(snapshot,at,clips);
  assert.equal(view.props[0].transform.x,35);assert.equal(view.props[0].transform.y,45);assert.equal(JSON.stringify(snapshot),before);assert.equal(Object.hasOwn(raw,'x'),false);
});
test('unknown legacy visitor remains a status record instead of inventing a static pet animation',()=>{
  const snapshot={yard:{placedGoodies:[]},yardRuntime:{mutable:true,visits:[{visitId:'legacy',visitorId:'willow_fox',source:'legacy'}],display:{placements:[],issues:[]}}};
  const view=courtyardPresentation(snapshot,at,clips);assert.equal(view.pets.length,0);assert.equal(view.legacy[0].presentationStatus,'preserved-legacy-visit');
});
test('persisted final prop transform survives presentation completion and clone/reload',()=>{
  const {plan}=make(),after=propTransformAt(plan,clips[plan.clipId],plan.schedule.leavesAt+1000);
  assert.deepEqual(after,plan.finalTransform);
  assert.deepEqual(propTransformAt(JSON.parse(JSON.stringify(plan)),clips[plan.clipId],plan.schedule.leavesAt+1000),after);
});
test('actual media atlas pages exist and known aliases reference identical measured poses',()=>{
  const pages=new Set([...Object.values(media.clips),...Object.values(media.walk.facings),...Object.values(media.turns)].flatMap(c=>c.pages.map(p=>p.src)));
  for(const path of pages)assert.ok(fs.statSync(new URL(`../public/assets/yard-mika/${path}`,import.meta.url)).size>0,path);
  const c=clips['mika-cushion-r1'];assert.deepEqual(c.samples[190].root,c.samples[214].root);assert.deepEqual(c.samples[190].prop,c.samples[214].prop);
});
test('a delayed snapshot refresh cannot rewind the displayed motion clock',()=>{
  let local=100;const clock=new PresentationClock(()=>local);assert.equal(clock.read(),null);clock.update(at);
  local+=1000;assert.equal(clock.read(),at+1000);clock.update(at+950);assert.equal(clock.read(),at+1000);
  local+=50;assert.equal(clock.read(),at+1050);clock.update(at+1075);assert.equal(clock.read(),at+1075);
  assert.throws(()=>clock.update(NaN),/authoritative/);
});
test('served runtime bindings match the source calibration and reject stale cached media without changing a save',()=>{
  assert.equal(media.manifestRevision,MIKA_RUNTIME_MEDIA_REVISION);
  const {plan,candidate,yard}=make(),b=getMikaServerOptions().mediaRegistry.bindings.find(b=>b.id===plan.clipId);
  assert.equal(media.renderBindings[b.id].bindingRevision,b.revision);
  assert.equal(media.renderBindings[b.id].bindingCalibrationHash,b.calibrationHash);
  const record={visitId:'v',visitorId:'mika_cat',slotId:'cushion',releaseAt:plan.propReleaseAt,leavesAt:candidate.leavesAt,renderCompatible:true,
    mediaAdmission:{plan,bindingId:b.id,goodieId:b.goodieId,bindingRevision:b.revision,bindingCalibrationHash:b.calibrationHash}};
  const snapshot={yard,yardRuntime:{mutable:true,visits:[record],display:{placements:[],issues:[]}}},before=JSON.stringify(snapshot),time=plan.schedule.segments.find(s=>s.role==='settle').startAt+500;
  assert.equal(courtyardPresentation(snapshot,time,clips,{mediaRevisions:media.renderBindings}).pets.length,1);
  const old=structuredClone(media.renderBindings);old[b.id].bindingRevision='old-cached-pose';
  const stale=courtyardPresentation(snapshot,time,clips,{mediaRevisions:old});assert.equal(stale.pets.length,0);assert.equal(stale.legacy.length,1);
  assert.equal(stale.props.find(p=>p.slotId==='cushion').drawStandalone,true);assert.equal(JSON.stringify(snapshot),before);
});
