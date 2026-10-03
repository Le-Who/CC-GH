import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createDefaultPlayer} from '../game-logic/player.js';
import {YARD_GOODIES,YARD_VISITORS,YARD_FOODS} from '../game-logic/yard-v2/catalog.mjs';
import {ACTOR_PROFILES} from '../game-logic/yard-v2/actor-profiles.mjs';
import {MOCHI_ACTOR_PROFILE,MOCHI_ACTOR_REFERENCE,MOCHI_RELEASE_GATE} from '../game-logic/yard-v2/mochi-actor-profile.mjs';
import {getMikaServerOptions} from '../game-logic/yard-v2/mika-media.mjs';
import {getYardServerOptions} from '../game-logic/yard-v2/yard-media.mjs';
import {createMochiMedia} from '../game-logic/yard-v2/mochi-media.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
import {validPresentationPlan} from '../game-logic/yard-v2/simulation.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {createMochiAcceptanceOptions} from './fixtures/yard-mochi-canonical/acceptance.mjs';
import {createMochiActorMediaEntry} from '../src/games/companion-yard-v2/mochi-actor-media.mjs';
import {courtyardPresentation} from '../src/games/companion-yard-v2/presentation.mjs';
import {selectPetPose} from '../src/games/companion-yard-v2/pose-selection.mjs';
import {MIKA_CLIPS} from '../game-logic/yard-v2/media/mika-clips.mjs';
import {edgeOpacity} from '../src/games/companion-yard-v2/edge-opacity.mjs';
import media from '../public/assets/yard-mochi/runtime-media.json' with {type:'json'};
import sourceManifest from '../public/assets/yard-mochi/SOURCE-MANIFEST.json' with {type:'json'};
const NOW=Date.UTC(2026,9,3,12),H=3600000,copy=structuredClone,accepted=createMochiAcceptanceOptions();
function player(){
 const p=createDefaultPlayer('mochi-canonical-20','Fixture',NOW);
 p.yard.placedGoodies=[{slotId:'mouse',goodieId:'yarn_mouse',x:50,y:45,condition:'new',uses:0,opaque:{keep:'target'}}];
 p.yard.bowls[0]={id:'bowl-1',foodId:'berry_plate',servings:5,placedAt:NOW,expiresAt:NOW+5*H};
 for(const id of Object.keys(YARD_GOODIES))p.yard.goodieInventory[id]=3;
 p.yard.goodieInventory.alchemy_living_arbor=4;p.yard.goodieInventory.alchemy_echo_chimes=7;p.yard.goodieInventory.future_prop=19;
 p.yard.foodInventory={kibble:11,berry_plate:12,bonito_bowl:13,future_food:23};
 p.yard.helper={...p.yard.helper,opaque:{keep:'helper'}};return p;
}
function admitted(){const p=player();assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...accepted}).status,200);
 assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...accepted}).status,200);
 const visit=Object.values(p._yardV2.runtime.visits).find(r=>r.original.visitorId==='mochi_bunny');assert.ok(visit);return{p,visit};}
const entry=()=>createMochiActorMediaEntry(media,{assetBaseURL:'https://qa.invalid/assets/yard-mochi/',profiles:accepted.actorProfiles});
const snapshot=(p,now,options=accepted)=>({yard:p.yard,yardRuntime:publicPersistentYard(p,{now,...options})});

test('canonical defaults preserve the entire Mika registry and all unavailable inventory behind the closed gate',()=>{
 assert.equal(MOCHI_RELEASE_GATE.accepted,false);assert.equal(MOCHI_ACTOR_PROFILE.playbackReady,false);assert.deepEqual(Object.keys(ACTOR_PROFILES),['mika']);
 const options=getYardServerOptions();assert.deepEqual(options.mediaRegistry,getMikaServerOptions().mediaRegistry);
 assert.equal(options.sourceRegistry.bindings.find(b=>b.visitorId==='mochi_bunny').playbackReady,false);
 assert.equal(Object.keys(YARD_VISITORS).length,8);assert.equal(Object.keys(YARD_FOODS).length,3);
 const p=player(),before=copy(p.yard);ensurePersistentPlayerYard(p,{now:NOW});assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true}).status,200);
 assert.equal(Object.keys(p._yardV2.runtime.visits).length,0);assert.equal(p.yard.bowls[0].servings,5);assert.equal(p.yard.placedGoodies[0].uses,0);
 assert.deepEqual(p.yard.goodieInventory,before.goodieInventory);assert.deepEqual(p.yard.foodInventory,before.foodInventory);assert.deepEqual(p.yard.helper,before.helper);assert.deepEqual(p.yard.petbook,before.petbook);
 assert.throws(()=>createMochiActorMediaEntry(media,{assetBaseURL:'https://qa.invalid/'}),/Registered exact/);
});
test('trusted acceptance uses real probabilistic admission and server-valid 83-minute schedule without catalog changes',()=>{
 const {p,visit}=admitted(),plan=visit.mediaAdmission.plan;
 assert.equal(visit.original.activityId,'sniff');assert.equal(visit.leavesAt-visit.arrivedAt,83*60000);
 assert.equal(validPresentationPlan(plan,{at:visit.arrivedAt,leavesAt:visit.leavesAt,slotId:visit.slotId}),true);
 assert.deepEqual(visit.mediaAdmission.actorProfile,MOCHI_ACTOR_REFERENCE);assert.equal(plan.groundFootprintRevision,MOCHI_ACTOR_PROFILE.ground.revision);
 assert.equal(plan.incoming.durationMs,25000);assert.equal(plan.outgoing.durationMs,19000);assert.equal(plan.schedule.loop.cycles,4098);
 assert.equal(p.yard.bowls[0].servings,4);assert.equal(p.yard.placedGoodies[0].uses,1);assert.equal(p.yard.placedGoodies[0].condition,'new');
 assert.equal(p.yard.petbook.mochi_bunny.visits,1);assert.deepEqual(plan.propCommits,[]);assert.equal(p.yard.pendingGifts.length,0);
 const readiness=publicPersistentYard(p,{now:visit.arrivedAt,...accepted}).placementReadiness.find(r=>r.slotId==='mouse');
 assert.equal(readiness.status,'ready');assert.equal(readiness.visitors.find(v=>v.visitorId==='mochi_bunny').status,'ready');
 assert.deepEqual(YARD_VISITORS.mochi_bunny.poses,['nap','nibble','stretch']);
});
test('public snapshot and shared presentation select only Mochi source rows across every handoff and full route',()=>{
 const {p,visit}=admitted(),plan=visit.mediaAdmission.plan,actor=entry(),actors={mochi:actor};const before=JSON.stringify(p);
 const times=new Set([plan.schedule.enterAt-1,plan.schedule.leavesAt]);
 for(const s of plan.schedule.segments){for(const t of [s.startAt,s.startAt+1,s.endAt-1,s.endAt])times.add(t);
  const max=s.kind==='loop'?Math.min(s.endAt,s.startAt+2400):s.endAt;for(let t=s.startAt;t<max;t+=50)times.add(t);}
 for(const at of times){const snap=snapshot(p,at),v=courtyardPresentation(snap,at,MIKA_CLIPS,{actorEntries:actors,actorProfiles:accepted.actorProfiles});
  if(at<plan.schedule.enterAt||at>=visit.leavesAt){assert.equal(v.pets.length,0);continue;}
  assert.equal(v.pets.length,1);assert.equal(v.legacy.length,0);const pet=v.pets[0],pose=selectPetPose(actor.manifest,pet,{actorProfile:actor.profile});
  assert.equal(pet.visitorId,'mochi_bunny');assert.match(pose.clip.assetBaseURL,/yard-mochi/);assert.ok(!pose.clip.id.startsWith('mika'));
  assert.equal(Number(v.props[0].drawStandalone)+v.pets.filter(p=>p.propOwnerSlotId==='mouse').length,1);assert.equal(v.props[0].stillId,'mochi:target-yarn-mouse');
  if(pet.phase==='active-clip')assert.deepEqual(pet.clipOrigin,plan.clipOrigin);else assert.ok(Number.isFinite(edgeOpacity(pet.route.points,pet.phase,pet.groundDistance)));
  assert.deepEqual(v.props[0].transform.x,50);assert.deepEqual(v.props[0].transform.y,45);
 }
 assert.equal(JSON.stringify(p),before);
 const loaded=JSON.parse(JSON.stringify(p)),at=plan.schedule.combinedStart+4200;
 assert.deepEqual(courtyardPresentation(snapshot(loaded,at),at,MIKA_CLIPS,{actorEntries:actors,actorProfiles:accepted.actorProfiles}),courtyardPresentation(snapshot(p,at),at,MIKA_CLIPS,{actorEntries:actors,actorProfiles:accepted.actorProfiles}));
});
test('closed or stale public admission never renders a saved Mochi as Mika or rewrites saved records',()=>{
 const {p,visit}=admitted(),at=visit.arrivedAt+30000,before=JSON.stringify(p),actor=entry();
 const closed=snapshot(p,at,getYardServerOptions());assert.equal(closed.yardRuntime.visits[0].renderCompatible,false);
 const v=courtyardPresentation(closed,at,MIKA_CLIPS,{actorEntries:{mochi:actor},actorProfiles:accepted.actorProfiles});assert.equal(v.pets.length,0);assert.equal(v.props[0].drawStandalone,true);
 assert.equal(JSON.stringify(p),before);
 const stale=copy(p);Object.values(stale._yardV2.runtime.visits)[0].mediaAdmission.plan.groundFootprintRevision='stale';
 assert.equal(snapshot(stale,at).yardRuntime.visits[0].renderCompatible,false);
 const moved=snapshot(p,at);moved.yard=copy(moved.yard);moved.yard.placedGoodies[0].x++;
 assert.equal(courtyardPresentation(moved,at,MIKA_CLIPS,{actorEntries:{mochi:actor},actorProfiles:accepted.actorProfiles}).pets.length,0);
});
test('native offline catch-up, reload, gift completion and inventory preservation are partition-equivalent',()=>{
 const {p,visit}=admitted(),bulk=copy(p),parts=copy(p),end=visit.leavesAt+1,outside=copy({resources:p.resources,garden:p.garden,merge:p.merge}),inventory=copy(p.yard.goodieInventory);
 assert.equal(ensurePersistentPlayerYard(bulk,{now:end,simulate:true,...accepted}).status,200);
 for(let at=visit.arrivedAt+15*60000;at<end;at+=15*60000)assert.equal(ensurePersistentPlayerYard(parts,{now:at,simulate:true,...accepted}).status,200);
 const restored=JSON.parse(JSON.stringify(parts));assert.equal(ensurePersistentPlayerYard(restored,{now:end,simulate:true,...accepted}).status,200);assert.deepEqual(restored,bulk);
 assert.equal(bulk.yard.pendingGifts.filter(g=>g.visitorId==='mochi_bunny').length,1);assert.equal(Object.values(bulk._yardV2.runtime.visits)[0].status,'completed');assert.equal(Object.keys(bulk._yardV2.runtime.propCommitReceipts||{}).length,0);
 assert.deepEqual(bulk.yard.goodieInventory,inventory);assert.deepEqual({resources:bulk.resources,garden:bulk.garden,merge:bulk.merge},outside);
 const once=copy(bulk);ensurePersistentPlayerYard(bulk,{now:end,simulate:true,...accepted});assert.deepEqual(bulk,once);
});
test('source preflight rejects state transitions, duplicate actors, food gaps and occupied body regions',()=>{
 const {p,visit}=admitted(),m=createMochiMedia(),placement={...p.yard.placedGoodies[0],uses:0};
 const candidate={at:NOW+H,leavesAt:NOW+2*H,placement,visitor:YARD_VISITORS.mochi_bunny,goodie:YARD_GOODIES.yarn_mouse,activity:{id:'sniff'},bowl:{id:'bowl-1',foodId:'berry_plate'},yard:{...copy(p.yard),placedGoodies:[placement]},active:[],reserved:[]};
 for(const [change,code]of [[c=>c.placement.uses=6,'POST_ADMISSION_PROP_STATE_UNSUPPORTED'],[c=>c.bowl.foodId='future_food','FOOD_PRESENTATION_UNAVAILABLE'],[c=>c.active.push(visit),'MOCHI_ALREADY_VISITING'],[c=>c.reserved.push({visitorId:'other',slotId:'other',arrivedAt:NOW,leavesAt:NOW+9*H,reservationBoxes:[{x:30,y:35,width:40,height:40}]}),'PRESENTATION_REGION_RESERVED']]){
  const c=copy(candidate);change(c);assert.equal(m.preflightCandidate(c).code,code);
 }
 assert.equal(createAdmissionPolicy(getYardServerOptions())(candidate).ok,false);
});
test('actual canonical media pages are byte-identical to reviewed source and preserve actor identity',async()=>{
 assert.equal(sourceManifest.files.length,49);for(const file of sourceManifest.files){const data=await readFile(new URL(`../public/assets/yard-mochi/${file.path}`,import.meta.url));assert.equal(data.length,file.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256);}
 const a=entry();for(const change of [m=>m.actorProfile.id='mika',m=>m.renderBindings['mochi-mouse-combined-r1'].bindingCalibrationHash='stale',m=>m.sourceMedia.cardinal.walk.stride=.64]){
  const m=copy(media);change(m);assert.throws(()=>createMochiActorMediaEntry(m,{assetBaseURL:a.assetBaseURL,profiles:accepted.actorProfiles}));
 }
 assert.equal(media.runtimeActivated,false);assert.equal(media.playbackReady,false);
});
test('Mochi album, helper preference and gift collection use existing durable actions with exact replay',()=>{
 const {p,visit}=admitted(),at=visit.arrivedAt+30000;
 const act=(action,payload,id,now=at)=>executePersistentYardAction(p,action,payload,{...accepted,now,actionId:`yard-v2:${id}`});
 const capture=act('yard.capturePhoto',{visitId:visit.visitId,caption:'Mochi with the mouse'},'mochi-photo');assert.equal(capture.status,200);
 assert.equal(capture.extras.photo.visitorId,'mochi_bunny');assert.equal(capture.extras.photo.pose,'sniff');assert.equal(p.yard.album.photos.length,1);
 assert.equal(act('yard.favoritePhoto',{photoId:capture.extras.photo.id},'mochi-favorite').status,200);assert.equal(p.yard.album.favoritePhotoId,capture.extras.photo.id);
 assert.equal(act('yard.configureCompanion',{name:'Buddy',preferredFoodId:'bonito_bowl'},'mochi-helper').status,200);assert.equal(p.yard.helper.preferredFoodId,'bonito_bowl');assert.deepEqual(p.yard.helper.opaque,{keep:'helper'});
 const saved=copy(p);assert.equal(act('yard.capturePhoto',{visitId:visit.visitId,caption:'Mochi with the mouse'},'mochi-photo',visit.leavesAt+H).replayed,true);assert.deepEqual(p,saved);
 ensurePersistentPlayerYard(p,{now:visit.leavesAt,simulate:true,...accepted});const gift=copy(p.yard.pendingGifts.find(g=>g.visitorId==='mochi_bunny')),balance=copy(p.yard.currencies);
 assert.ok(gift);assert.equal(act('yard.collectGifts',{},'mochi-collect',visit.leavesAt).status,200);assert.equal(p.yard.currencies.treats,balance.treats+gift.treats);
 const collected=copy(p);assert.equal(act('yard.collectGifts',{},'mochi-collect',visit.leavesAt+H).replayed,true);assert.deepEqual(p,collected);
});
test('Mochi placement readiness cache retains neither account slot IDs nor opaque inventory metadata',()=>{
 const m=createMochiMedia(),a=player().yard,first=m.sourcePlacementReadiness(a),b=copy(a);b.placedGoodies[0].slotId='other-account-slot';b.placedGoodies[0].opaque={secret:'must-not-copy'};
 const result=m.sourcePlacementReadiness(b);assert.equal(result[0].slotId,'other-account-slot');assert.equal(result[0].status,first[0].status);assert.equal(result[0].opaque,undefined);
 b.placedGoodies[0].uses=6;assert.equal(m.sourcePlacementReadiness(b)[0].status,'repair-required');assert.equal(first[0].status,'ready');
});
