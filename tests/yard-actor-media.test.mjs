import test from 'node:test';
import assert from 'node:assert/strict';
import {createActorMediaEntry,resolveVisitActorMedia,actorEntryForPet} from '../src/games/companion-yard-v2/actor-media.mjs';
import {courtyardPresentation,visibleStatus} from '../src/games/companion-yard-v2/presentation.mjs';
import {selectPetPose} from '../src/games/companion-yard-v2/pose-selection.mjs';
import {MIKA_ACTOR_REFERENCE,MIKA_ACTOR_PROFILE} from '../game-logic/yard-v2/actor-profiles.mjs';
import {MIKA_CLIPS} from '../game-logic/yard-v2/media/mika-clips.mjs';
import {getMikaServerOptions,MIKA_PLACEMENT_SUGGESTIONS} from '../game-logic/yard-v2/mika-media.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {YARD_VISITORS,YARD_GOODIES,getYardGoodieActivities} from '../game-logic/yard-catalog.js';
import media from '../public/assets/yard-mika/runtime-media.json' with {type:'json'};
const copy=structuredClone,base='http://localhost/assets/yard-mika/';
const entry=()=>createActorMediaEntry(media,{reference:MIKA_ACTOR_REFERENCE,assetBaseURL:base,clips:MIKA_CLIPS});
const record=()=>({visitorId:'mika_cat',mediaAdmission:{bindingId:'mika-cushion-r1',goodieId:'sun_cushion'}});

test('actual Mika manifest is scoped without modifying pixels, page names or the loaded source object',()=>{
 const before=JSON.stringify(media),actor=entry();assert.deepEqual(actor.reference,MIKA_ACTOR_REFERENCE);assert.equal(actor.profile,MIKA_ACTOR_PROFILE);
 assert.equal(JSON.stringify(media),before);
 for(const [id,clip]of Object.entries(actor.manifest.clips)){
  assert.equal(clip.assetBaseURL,base);assert.equal(clip.assetRevision,media.manifestRevision);const {assetBaseURL,assetRevision,...rest}=clip;assert.deepEqual(rest,media.clips[id]);
 }
 assert.equal(actor.clips,MIKA_CLIPS);
});
test('wrong/missing actor, camera, scale, phase, turns or rest source cannot be declared locally ready',()=>{
 for(const change of [m=>delete m.walk.stride,m=>m.walk.stride=.4,m=>m.walk.cycleSeconds=1,
  m=>m.walk.facings[0].phaseSamples[1]=.08,m=>m.walk.facings[0].cameraDirection[0]=NaN,
  m=>m.walk.facings[0].cameraDirection[0]=0,m=>m.clips['mika-cushion-r1'].labelsBaked=true,
  m=>delete m.turns['0:1:2'],m=>delete m.clips['mika-ground-rest-r1']]){
  const changed=copy(media);change(changed);assert.throws(()=>createActorMediaEntry(changed,{reference:MIKA_ACTOR_REFERENCE,assetBaseURL:base,clips:MIKA_CLIPS}));
 }
 for(const reference of [null,{id:'mochi',revision:'not-authored'},{...MIKA_ACTOR_REFERENCE,revision:'future'}])
  assert.throws(()=>createActorMediaEntry(media,{reference,assetBaseURL:base,clips:MIKA_CLIPS}),/Unsupported actor profile/);
});
test('known old Mika binding resolves read-only; explicit malformed or foreign profile never takes the fallback',()=>{
 const actors={mika:entry()},old=record(),before=JSON.stringify(old);
 assert.equal(resolveVisitActorMedia(old,actors),actors.mika);assert.equal(JSON.stringify(old),before);
 const current={...record(),resolvedActorProfile:MIKA_ACTOR_REFERENCE,mediaAdmission:{...record().mediaAdmission,actorProfile:MIKA_ACTOR_REFERENCE}};
 assert.equal(resolveVisitActorMedia(current,actors),actors.mika);
 for(const ref of [null,{},'mika',{id:'mochi',revision:'not-authored'},{...MIKA_ACTOR_REFERENCE,revision:'future'}]){
  assert.equal(resolveVisitActorMedia({...old,mediaAdmission:{...old.mediaAdmission,actorProfile:ref}},actors),null);
  assert.equal(resolveVisitActorMedia({...old,resolvedActorProfile:ref},actors),null);
 }
 assert.equal(resolveVisitActorMedia({...old,visitorId:'mochi_bunny'},actors),null);
 assert.equal(resolveVisitActorMedia({...old,mediaAdmission:{...old.mediaAdmission,bindingId:'unrecognized'}},actors),null);
 assert.equal(resolveVisitActorMedia({...current,mediaAdmission:{...current.mediaAdmission,actorProfile:{id:'mochi',revision:'not-authored'}}},actors),null);
});
test('a pet cannot select another actor’s pixels even if a manifest has matching generic walk keys',()=>{
 const actors={mika:entry()},pet={visitorId:'mika_cat',actorProfile:MIKA_ACTOR_REFERENCE,headingRadians:0,gaitPhase:0,motion:{frameIndex:0}};
 const actor=actorEntryForPet(pet,actors);assert.equal(selectPetPose(actor.manifest,pet,{actorProfile:actor.profile}).index,0);
 for(const wrong of [{...pet,visitorId:'mochi_bunny'},{...pet,actorProfile:{id:'mochi',revision:'test'}},{...pet,actorProfile:null}])assert.throws(()=>actorEntryForPet(wrong,actors));
 assert.throws(()=>selectPetPose(media,{...pet,visitorId:'mochi_bunny'}),/profile mismatch/);
});
function admittedSnapshot(){
 const at=2000000000000,opts=getMikaServerOptions(),goodie=YARD_GOODIES.sun_cushion;
 const placement={goodieId:goodie.id,slotId:'cushion',...MIKA_PLACEMENT_SUGGESTIONS.sun_cushion,condition:'new',uses:0};
 const yard={remodel:'meadow',expansion:{level:1},placedGoodies:[placement],bowls:[],pendingGifts:[]};
 const binding=opts.mediaRegistry.bindings.find(b=>b.goodieId===goodie.id),activity=getYardGoodieActivities(goodie,'new').find(a=>binding.activityIds.includes(a.id));
 const admitted=createAdmissionPolicy(opts)({at,leavesAt:at+45*60000,slotId:placement.slotId,placement,yard,bowl:{id:'bowl-1',foodId:'kibble'},visitor:YARD_VISITORS.mika_cat,goodie,activity,reserved:[],active:[]});
 assert.equal(admitted.ok,true,admitted.code);const plan=admitted.binding.plan;
 const visit={visitId:'actual-preflight',visitorId:'mika_cat',slotId:'cushion',renderCompatible:true,resolvedActorProfile:MIKA_ACTOR_REFERENCE,releaseAt:plan.propReleaseAt,leavesAt:plan.schedule.leavesAt,mediaAdmission:admitted.binding};
 return{yard,yardRuntime:{mutable:true,visits:[visit],display:{placements:[],issues:[]}}};
}
test('admitted plan samples through its profile with one prop owner, while stale actor references remain preserved',()=>{
 const snapshot=admittedSnapshot(),actors={mika:entry()},plan=snapshot.yardRuntime.visits[0].mediaAdmission.plan;
 const before=JSON.stringify(snapshot);
 for(const segment of plan.schedule.segments.filter(s=>s.kind!=='hidden')){
  const v=courtyardPresentation(snapshot,segment.startAt+1,MIKA_CLIPS,{actorEntries:actors});assert.equal(v.pets.length,1);
  assert.deepEqual(v.pets[0].actorProfile,MIKA_ACTOR_REFERENCE);assert.equal(Number(v.props[0].drawStandalone)+v.pets.filter(p=>p.propOwnerSlotId==='cushion').length,1);
  const actor=actorEntryForPet(v.pets[0],actors);assert.doesNotThrow(()=>selectPetPose(actor.manifest,v.pets[0],{actorProfile:actor.profile}));
 }
 assert.equal(JSON.stringify(snapshot),before);
 const changed=copy(snapshot);changed.yardRuntime.visits[0].resolvedActorProfile={id:'mika',revision:'stale'};
 const at=plan.schedule.segments.find(s=>s.role==='rest').startAt+1;
 const v=courtyardPresentation(changed,at,MIKA_CLIPS,{actorEntries:actors});assert.equal(v.pets.length,0);assert.equal(v.legacy.length,1);assert.equal(v.props[0].drawStandalone,true);assert.equal(v.props[0].reserved,true);
});
test('visitor status supplies the actual catalog name instead of hardcoding Mika',()=>{
 const view={mutable:true,pendingGifts:[],legacy:[],pets:[{visitorId:'mochi_bunny',role:'rest'}]};
 assert.deepEqual(visibleStatus(view,(key,values)=>({key,values})),{key:'yard.persistent.status.rest',values:{name:'Mochi'}});
});
