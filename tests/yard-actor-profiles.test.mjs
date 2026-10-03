import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import golden from './fixtures/yard-actor-r3/golden.json' with {type:'json'};
import {ACTOR_PROFILES,MIKA_ACTOR_PROFILE as MIKA,MIKA_ACTOR_REFERENCE as REF,
  resolveActorProfile,resolveBindingActorProfile,resolveVisitActorProfile} from '../game-logic/yard-v2/actor-profiles.mjs';
import {MIKA_ACTOR_ASSETS} from '../game-logic/yard-v2/media/mika-actor-assets.mjs';
import {getMikaServerOptions,createMikaMedia,MIKA_SCENE} from '../game-logic/yard-v2/mika-media.mjs';
import {sampleRoute,routeProgram} from '../game-logic/yard-v2/media/stride-routes.mjs';
import {lookupWalkPhase} from '../game-logic/yard-v2/media/walk-phase-lookup.mjs';
import {sampleStay,buildStaySchedule,propTransformAt} from '../game-logic/yard-v2/media/stay-schedule.mjs';
import {createMotionGroundGuard} from '../game-logic/yard-v2/motion-ground-guard.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction,inspectPlayerYard} from '../game-logic/yard-v2/service.mjs';
import {createAdmissionPolicy,inspectPersistentYard} from '../game-logic/yard-v2/orchestrator.mjs';
import {digest} from '../game-logic/yard-v2/util.mjs';
const copy=value=>JSON.parse(JSON.stringify(value)),NOW=Date.UTC(2026,9,2,12),H=3600000;
const record=p=>Object.values(p._yardV2.runtime.visits)[0];
function samples(plan){
  const result=[];
  for(const s of plan.schedule.segments){
    const times=new Set([s.startAt,s.startAt+1,s.endAt-1,s.endAt]);
    if(s.kind==='loop'){for(let t=s.startAt;t<=Math.min(s.endAt,s.startAt+2400);t+=50)times.add(t);}
    else for(let t=s.startAt;t<=s.endAt;t+=50)times.add(t);
    for(const t of [...times].sort((a,b)=>a-b))result.push(sampleStay(plan,t,{visitId:'golden',visitorId:'mika_cat'},{actorProfile:MIKA}));
  }return result;
}
function routeSamples(plan){return[plan.incoming,plan.outgoing,...(plan.restApproach?[plan.restApproach]:[])].flatMap(route=>{
  const result=[];for(let t=0;t<=route.durationMs;t+=25)result.push(sampleRoute(route,t,{actorProfile:MIKA}));
  result.push(sampleRoute(route,route.durationMs,{actorProfile:MIKA}));return result;
});}
function withoutNewRefs(player){const result=copy(player);for(const r of Object.values(result._yardV2.runtime.visits))delete r.mediaAdmission?.actorProfile;return result;}

test('r3 baseline fixture is immutable and provenance is self-contained',()=>{
  const bytes=readFileSync(new URL('./fixtures/yard-actor-r3/golden.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'8b9cb9a7936a90e3bef25e816fb48d4f04f3d19c39ca85b0f302b46a8af78bf1');
  assert.equal(golden.format,'yard-actor-r3-golden/v1');assert.equal(Object.keys(golden.sources).length,11);
});
test('Mika profile extraction retains the complete r3 registry bytes and every approved route/stay output',()=>{
  const options=getMikaServerOptions();assert.deepEqual(options.mediaRegistry,golden.registry);
  for(const c of golden.cases){
    const binding=options.mediaRegistry.bindings.find(b=>b.id===c.bindingId),out=options.preflight(copy(c.candidate),binding);
    assert.equal(out.ok,true);assert.deepEqual(out.plan,c.plan,`${c.goodieId}:${c.yaw}:${c.minutes}`);
    assert.equal(digest(samples(out.plan)),c.sampleDigest);assert.equal(digest(routeSamples(out.plan)),c.routeSampleDigest);
    assert.deepEqual(options.placementReadiness(copy(c.candidate.yard)),c.readiness);
  }
});
test('only the immutable Mika profile is ready; malformed or foreign explicit refs never downgrade to legacy',()=>{
  assert.deepEqual(Object.keys(ACTOR_PROFILES),['mika']);assert.equal(resolveActorProfile(REF),MIKA);
  assert.deepEqual(MIKA.turns.durations,MIKA_ACTOR_ASSETS.turns.durations);
  assert.deepEqual([...MIKA.turns.variants].sort(),Object.keys(MIKA_ACTOR_ASSETS.turns.variants).sort());
  assert.equal(MIKA.turns.entryPhase,MIKA_ACTOR_ASSETS.turns.entryPhase);assert.equal(MIKA.turns.exitPhase,MIKA_ACTOR_ASSETS.turns.exitPhase);
  assert.ok(MIKA.ground.revision.endsWith(golden.sources['media/ground-footprints.json']));
  assert.throws(()=>{MIKA.locomotion.strideWorld=7;},TypeError);assert.throws(()=>{MIKA_ACTOR_ASSETS.turns.durations[2]=1;},TypeError);
  assert.equal(resolveActorProfile({id:'mochi',revision:'unapproved'}),null);
  const b=golden.registry.bindings[0],r=record(golden.admittedPlayer),own=golden.registry.bindings.find(b=>b.id===r.mediaAdmission.bindingId);
  assert.equal(resolveBindingActorProfile(b),MIKA);assert.equal(resolveVisitActorProfile(r,own),MIKA);
  for(const actorProfile of [null,{},'',false,{id:'mika',revision:'future'},{id:'mochi',revision:'mika-actor/r1'}]){
    assert.equal(resolveBindingActorProfile({...b,actorProfile}),null);
    assert.equal(resolveVisitActorProfile({...r,mediaAdmission:{...r.mediaAdmission,actorProfile}},own),null);
  }
  assert.equal(resolveVisitActorProfile({...r,original:{...r.original,visitorId:'mochi_bunny'}},own),null);
  assert.equal(resolveBindingActorProfile({...b,visitorId:'mochi_bunny'}),null);
});
test('new admission adds only its actor reference; r3 economics, commits, claim result and replay remain identical',()=>{
  let p=copy(golden.initialPlayer);ensurePersistentPlayerYard(p,{now:NOW});ensurePersistentPlayerYard(p,{now:NOW+4*H,simulate:true});
  assert.deepEqual(record(p).mediaAdmission.actorProfile,REF);assert.deepEqual(withoutNewRefs(p),golden.admittedPlayer);
  const projection=publicPersistentYard(p,{now:golden.projectionTime});assert.deepEqual(projection.visits[0].resolvedActorProfile,REF);
  delete projection.visits[0].resolvedActorProfile;delete projection.visits[0].mediaAdmission.actorProfile;
  assert.deepEqual(projection,golden.publicProjection);
  const at=record(p).leavesAt;ensurePersistentPlayerYard(p,{now:at,simulate:true});assert.deepEqual(withoutNewRefs(p),golden.completedPlayer);
  const result=executePersistentYardAction(p,'yard.collectGifts',{},golden.claimOptions);assert.deepEqual(copy(result),golden.claimResult);
  assert.deepEqual(withoutNewRefs(p),golden.claimedPlayer);p=copy(p);const before=digest(p);
  assert.equal(executePersistentYardAction(p,'yard.collectGifts',{},golden.claimOptions).replayed,true);assert.equal(digest(p),before);
});
test('actual old player roundtrip resolves a known Mika without backfill, reroute or re-time',()=>{
  let p=copy(golden.admittedPlayer),before=digest(p),r=record(p),plan=digest(r.mediaAdmission.plan);
  const out=publicPersistentYard(p,{now:golden.projectionTime});assert.equal(out.visits[0].renderCompatible,true);
  assert.deepEqual(out.visits[0].resolvedActorProfile,REF);assert.equal(digest(p),before);assert.equal(Object.hasOwn(r.mediaAdmission,'actorProfile'),false);
  ensurePersistentPlayerYard(p,{now:r.leavesAt,simulate:true});assert.deepEqual(p,golden.completedPlayer);
  executePersistentYardAction(p,'yard.collectGifts',{},golden.claimOptions);assert.deepEqual(p,golden.claimedPlayer);
  assert.equal(digest(record(p).mediaAdmission.plan),plan);p=copy(p);before=digest(p);
  assert.equal(executePersistentYardAction(p,'yard.collectGifts',{},golden.claimOptions).replayed,true);assert.equal(digest(p),before);
});
test('profile compatibility stays pinned across registry growth and strict for unpinned legacy calibration',()=>{
  const p=copy(golden.admittedPlayer),b=getMikaServerOptions(),registry=copy(b.mediaRegistry);
  registry.bindings.push({id:'mochi-unapproved',revision:'pending',visitorId:'mochi_bunny',playbackReady:false});registry.revision+=':unrelated';
  const options={...b,mediaRegistry:registry,now:golden.projectionTime},before=digest(p);
  assert.equal(publicPersistentYard(p,options).visits[0].renderCompatible,true);
  const state=inspectPlayerYard(p,options).state;assert.equal(inspectPersistentYard(state,options).visits[0].renderCompatible,true);
  assert.equal(digest(p),before);
  delete record(p).mediaAdmission.bindingCalibrationHash;
  assert.equal(publicPersistentYard(p,{now:golden.projectionTime}).visits[0].renderCompatible,true);
  assert.equal(publicPersistentYard(p,options).visits[0].renderCompatible,false);
  record(p).mediaAdmission.actorProfile={id:'mika',revision:'future'};
  const rejected=publicPersistentYard(p,{now:golden.projectionTime}).visits[0];
  assert.equal(rejected.renderCompatible,false);assert.equal(Object.hasOwn(rejected,'resolvedActorProfile'),false);
  assert.ok(rejected.presentationIssues.includes('ACTOR_PROFILE_UNAVAILABLE'));
});
test('an unapproved Mochi binding fails before preflight and before any economic consumption',()=>{
  const opts=getMikaServerOptions(),registry=copy(opts.mediaRegistry),base=registry.bindings.find(b=>b.goodieId==='sun_cushion');
  const bunny={...base,id:'mochi-unapproved',visitorId:'mochi_bunny',actorProfile:{id:'mochi',revision:'pending'}};
  registry.bindings=[bunny];let called=0;
  const policy=createAdmissionPolicy({mediaRegistry:registry,preflight:()=>{called++;return{ok:true,plan:null};}});
  const c=copy(golden.cases.find(c=>c.goodieId==='sun_cushion').candidate);
  assert.equal(policy({...c,visitor:{id:'mochi_bunny'},goodie:{id:'sun_cushion'},activity:{id:base.activityIds[0]}}).code,'ACTOR_PROFILE_UNAVAILABLE');
  assert.equal(called,0);
  const p=copy(golden.initialPlayer);ensurePersistentPlayerYard(p,{now:NOW,mediaRegistry:registry});
  ensurePersistentPlayerYard(p,{now:NOW+12*H,simulate:true,mediaRegistry:registry,preflight:()=>{called++;return{ok:true,plan:null};}});
  assert.equal(called,0);assert.equal(p.yard.bowls[0].servings,99);assert.equal(p.yard.placedGoodies[0].uses,0);
  assert.deepEqual(p.yard.petbook,{});assert.deepEqual(p.yard.pendingGifts,[]);assert.deepEqual(p.yard.activeVisitors,[]);
});

// Mathematical helper input only. It is deliberately unregistered and NOT ready.
const mathProfile=()=>({...copy(MIKA),id:'TEST_ONLY_MATH',revision:'fixture/v1',visitorId:'test-only',playbackReady:false,
  locomotion:{...copy(MIKA.locomotion),strideWorld:.3,cycleMs:900,phaseDenominator:4,phaseUnits:[0,1,2,3],phaseSamples:[0,.25,.5,.75]},
  ground:{revision:'TEST_ONLY_GROUND/v1',phaseStarts:[0,.5]}});
test('route and sampler select the supplied stride/cycle/table without registering a playable actor',()=>{
  const actorProfile=mathProfile(),navigation={passable:()=>true,segment:()=>true};
  assert.equal(resolveActorProfile(actorProfile),null);
  const p=routeProgram({navigation,anchor:{x:50,y:50},entry:{x:54.8,y:50},portalHalfSize:0,incoming:false,actorProfile});
  assert.equal(p.ok,true);assert.equal(p.durationMs,1800);assert.equal(p.distance,4.8);
  const s=sampleRoute(p,449,{actorProfile});assert.equal(s.gaitPhase,.25);assert.equal(s.motion.frameIndex,1);assert.equal(s.position.x,50.6);
  const endpoint=sampleRoute(p,p.durationMs,{actorProfile});assert.deepEqual(endpoint.position,p.points.at(-1));assert.equal(endpoint.gaitPhase,0);
  assert.deepEqual(sampleRoute(copy(p),449,{actorProfile}),s);
  const half=routeProgram({navigation,anchor:{x:50,y:50},entry:{x:53.6,y:50},portalHalfSize:0,incoming:false,initialPhase:.5,actorProfile});
  assert.equal(half.ok,true);assert.equal(half.legs[0].distance,1.2);assert.equal(half.legs[0].durationMs,450);
  const turn=routeProgram({navigation,anchor:{x:50,y:50},entry:{x:54.8,y:54.8},portalHalfSize:0,incoming:false,actorProfile,turnDurations:{2:1700,4:2500}});
  assert.equal(turn.ok,true);assert.equal(turn.legs.find(l=>l.kind==='turn').durationMs,1700);
  assert.equal(turn.legs.filter(l=>l.kind==='walk').some(l=>l.rampOutDistance===2.4*2/24),true);
});
test('parameterized phase lookup handles wrap/negative cycles and refuses malformed tables',()=>{
  const locomotion=mathProfile().locomotion;
  assert.deepEqual(lookupWalkPhase(-.1,{locomotion}),{frameIndex:3,phase:.75,cycle:-1,sampledCycles:-.25});
  assert.equal(lookupWalkPhase(1,{locomotion}).phase,0);
  for(const malformed of [{...locomotion,phaseUnits:[0,2,1,3]},{...locomotion,phaseSamples:[0,.2,.5,.75]}])
    assert.throws(()=>lookupWalkPhase(.4,{locomotion:malformed}),/ordered actor phase table/);
  assert.equal(lookupWalkPhase(1/96).frameIndex,1);assert.equal(lookupWalkPhase(1/48).frameIndex,2);
});
test('ground compilation cannot reuse another actor/contract/calibration with identical facing keys',()=>{
  const p=mathProfile(),yard={remodel:'meadow',placedGoodies:[]},scene={exclusions:[]};
  const contract=x=>({validated:true,derivation:{requiredPaddingWorld:0},walk:{0:{validated:true,footprints:[{polygon:[[x,0],[x+.02,0],[x+.02,.02],[x,.02]]}]}}});
  const source={revision:p.ground.revision,contract:contract(0)};
  const options={scene,actorProfile:p,groundFootprints:source,calibrationHash:'calibration-A'};
  const from={x:50,y:50},to={x:52.4,y:50};
  assert.equal(createMotionGroundGuard(yard,options).walkSegment(from,to,0),true);
  const second={...p,id:'TEST_ONLY_OTHER'};
  assert.equal(createMotionGroundGuard(yard,{...options,actorProfile:second,calibrationHash:'calibration-B',groundFootprints:{revision:p.ground.revision,contract:contract(20)}}).walkSegment(from,to,0),false);
  assert.equal(createMotionGroundGuard(yard,options).walkSegment(from,to,0),true);
  assert.equal(createMotionGroundGuard(yard,{...options,groundFootprints:{...source,revision:'wrong'}}).walkSegment(from,to,0),false);
  assert.equal(createMotionGroundGuard(yard,{...options,groundFootprints:{revision:p.ground.revision,contract:{...source.contract,validated:false}}}).walkSegment(from,to,0),false);
  for(const strideWorld of [0,-1,NaN,Infinity])assert.equal(createMotionGroundGuard(yard,{...options,
    actorProfile:{...p,locomotion:{...p.locomotion,strideWorld}}}).walkSegment(from,to,0),false);
  assert.equal(createMotionGroundGuard(yard,{...options,actorProfile:{...p,ground:{...p.ground,phaseStarts:[NaN]}}}).walkSegment(from,to,0,NaN),false);
});
test('readiness is actor-scoped, calibration-aware and cannot leak a cached ready result',()=>{
  const opts=createMikaMedia(MIKA_ACTOR_ASSETS.clips,MIKA_ACTOR_ASSETS.turns),yard=copy(golden.cases[0].candidate.yard);
  const before=opts.placementReadiness(yard);assert.ok(before.every(r=>r.status==='ready'));
  assert.ok(opts.placementReadiness(yard,{actorProfile:{id:'mochi',revision:'pending'}}).every(r=>r.reason==='ACTOR_PROFILE_UNAVAILABLE'));
  const b=opts.mediaRegistry.bindings.find(b=>b.goodieId==='sun_cushion');
  opts.mediaRegistry.bindings.unshift({...b,id:'mochi-pending',visitorId:'mochi_bunny',playbackReady:false});
  assert.deepEqual(opts.placementReadiness(yard),before);
  b.calibrationHash='new-calibration';b.playbackReady=false;
  assert.equal(opts.placementReadiness(yard).find(r=>r.slotId==='sun_cushion').reason,'INTERACTION_MEDIA_NOT_READY');
  b.playbackReady=true;assert.deepEqual(opts.placementReadiness(yard),before);
});
test('rest loop selection comes from the actor interaction contract, never the goodie name alone',()=>{
  const c=golden.cases.find(c=>c.goodieId==='sun_cushion'),clip=MIKA_ACTOR_ASSETS.clips[c.bindingId],profile=mathProfile();
  profile.interactions={};assert.equal(buildStaySchedule(c.candidate,c.plan,clip,null,{actorProfile:profile}).code,'ACTOR_INTERACTION_PROFILE_UNAVAILABLE');
  profile.interactions={[clip.id]:{goodieId:clip.goodieId,restMode:'on-prop',restClipId:clip.id,loop:{startMs:9000,endMs:9600,fps:20,frames:12}}};
  const schedule=buildStaySchedule(c.candidate,c.plan,clip,null,{actorProfile:profile});assert.equal(schedule.ok,true);
  assert.equal(schedule.loop.startMs,9000);assert.equal(schedule.loop.endMs,9600);assert.equal(schedule.leavesAt,c.candidate.leavesAt);
  assert.equal(buildStaySchedule(c.candidate,c.plan,clip,null).loop.startMs,9500);
  assert.deepEqual(propTransformAt(c.plan,clip,c.plan.schedule.leavesAt),c.plan.finalTransform);
});
