import './yard-inventory-only-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../game-logic/player.js';
import {YARD_GOODIES,YARD_VISITORS,YARD_FOODS} from '../game-logic/yard-v2/catalog.mjs';
import {ACTOR_PROFILES} from '../game-logic/yard-v2/actor-profiles.mjs';
import {PIP_ACTOR_PROFILE,PIP_ACTOR_REFERENCE,PIP_RELEASE_GATE} from '../game-logic/yard-v2/pip-actor-profile.mjs';
import {getMikaServerOptions} from '../game-logic/yard-v2/mika-media.mjs';
import {getYardServerOptions,createYardMedia} from '../game-logic/yard-v2/yard-media.mjs';
import {createPipMedia} from '../game-logic/yard-v2/pip-media.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
import {validPresentationPlan} from '../game-logic/yard-v2/simulation.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {createPipAcceptanceOptions} from './fixtures/yard-pip-canonical/acceptance.mjs';
import {createMochiAcceptanceOptions} from './fixtures/yard-mochi-canonical/acceptance.mjs';
import {createPipActorMediaEntry} from '../src/games/companion-yard-v2/pip-actor-media.mjs';
import {courtyardPresentation,checkPlacement} from '../src/games/companion-yard-v2/presentation.mjs';
import {selectPetPose} from '../src/games/companion-yard-v2/pose-selection.mjs';
import {MIKA_CLIPS} from '../game-logic/yard-v2/media/mika-clips.mjs';
import {edgeOpacity} from '../src/games/companion-yard-v2/edge-opacity.mjs';
import media from '../public/assets/yard-pip/runtime-media.json' with {type:'json'};
const NOW=Date.UTC(2026,9,3,12),H=3600000,copy=structuredClone,accepted=createPipAcceptanceOptions();
function player(){
 const p=createDefaultPlayer('pip-canonical-9','Fixture',NOW);
 p.yard.placedGoodies=[{slotId:'snack',goodieId:'snack_table',x:50,y:50,rotationZ:0,condition:'new',uses:0,opaque:{keep:'target'}}];
 p.yard.bowls[0]={id:'bowl-1',foodId:'berry_plate',servings:5,placedAt:NOW,expiresAt:NOW+5*H};
 for(const id of Object.keys(YARD_GOODIES))p.yard.goodieInventory[id]=3;
 p.yard.goodieInventory.alchemy_living_arbor=4;p.yard.goodieInventory.alchemy_echo_chimes=7;p.yard.goodieInventory.future_prop=19;
 p.yard.foodInventory={kibble:11,berry_plate:12,bonito_bowl:13,future_food:23};p.yard.helper={...p.yard.helper,opaque:{keep:'helper'}};return p;
}
let fixed;
function admitted(){if(fixed)return copy(fixed);const p=player();assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...accepted}).status,200);
 assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...accepted}).status,200);
 const visit=Object.values(p._yardV2.runtime.visits).find(r=>r.original.visitorId==='pip_hamster');assert.ok(visit);fixed={p,visit};return copy(fixed);}
const entry=()=>createPipActorMediaEntry(media,{assetBaseURL:'https://qa.invalid/assets/yard-pip/',profiles:accepted.actorProfiles});
const snapshot=(p,now,options=accepted)=>({yard:p.yard,yardRuntime:publicPersistentYard(p,{now,...options})});

test('closed Pip preserves Mika, accepted Mochi, foods, catalog and every inventory field',()=>{
 assert.equal(PIP_RELEASE_GATE.accepted,false);assert.equal(PIP_ACTOR_PROFILE.playbackReady,false);assert.deepEqual(Object.keys(ACTOR_PROFILES),['mika']);
 const options=getYardServerOptions(),pip=createPipMedia(),withoutPip=createYardMedia({pip:{...pip,mediaRegistry:{...pip.mediaRegistry,bindings:[]}}});assert.deepEqual(options.mediaRegistry,withoutPip.mediaRegistry);assert.equal(options.sourceRegistry.bindings.find(b=>b.visitorId==='pip_hamster').playbackReady,false);
 const mochi=createMochiAcceptanceOptions();assert.equal(mochi.mediaRegistry.bindings.filter(b=>b.visitorId==='mochi_bunny').length,1);assert.equal(mochi.mediaRegistry.bindings.some(b=>b.visitorId==='pip_hamster'),false);assert.deepEqual(mochi.mediaRegistry.foodBindings,options.mediaRegistry.foodBindings);
 assert.equal(Object.keys(YARD_VISITORS).length,8);assert.equal(Object.keys(YARD_GOODIES).length,11);assert.equal(Object.keys(YARD_FOODS).length,3);
 const p=player(),before=copy(p.yard);ensurePersistentPlayerYard(p,{now:NOW});assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true}).status,200);
 assert.equal(Object.keys(p._yardV2.runtime.visits).length,0);assert.equal(p.yard.bowls[0].servings,5);assert.equal(p.yard.placedGoodies[0].uses,0);for(const key of['goodieInventory','foodInventory','helper','petbook'])assert.deepEqual(p.yard[key],before[key]);
 assert.throws(()=>createPipActorMediaEntry(media,{assetBaseURL:'https://qa.invalid/'}),/Registered exact/);
 const balance=copy(p.yard.currencies);assert.equal(executePersistentYardAction(p,'yard.buyGoodie',{goodieId:'snack_table'},{now:NOW+H,actionId:'yard-v2:closed-buy'}).status,409);assert.deepEqual(p.yard.currencies,balance);
});
test('real catalog probability admits an exact Pip schedule and spends only existing food/use',()=>{
 const {p,visit}=admitted(),plan=visit.mediaAdmission.plan;assert.equal(visit.original.activityId,'nibble');assert.equal(validPresentationPlan(plan,{at:visit.arrivedAt,leavesAt:visit.leavesAt,slotId:visit.slotId}),true);
 assert.deepEqual(visit.mediaAdmission.actorProfile,PIP_ACTOR_REFERENCE);assert.equal(plan.groundFootprintRevision,PIP_ACTOR_PROFILE.ground.revision);assert.equal(plan.incoming.initialFacing,0);assert.equal(plan.outgoing.initialFacing,4);
 assert.equal(p.yard.bowls[0].servings,4);assert.equal(p.yard.placedGoodies[0].uses,1);assert.equal(p.yard.placedGoodies[0].condition,'new');assert.equal(p.yard.petbook.pip_hamster.visits,1);assert.deepEqual(plan.propCommits,[]);assert.equal(p.yard.pendingGifts.length,0);
 const row=publicPersistentYard(p,{now:visit.arrivedAt,...accepted}).placementReadiness.find(r=>r.slotId==='snack');assert.equal(row.status,'ready');assert.equal(row.visitors.find(v=>v.visitorId==='pip_hamster').status,'ready');
 console.log('PIP_PERSISTENT_VISIT',JSON.stringify({durationMs:visit.leavesAt-visit.arrivedAt,loops:plan.schedule.loop.cycles,incoming:plan.incoming.durationMs,outgoing:plan.outgoing.durationMs}));
});
test('shared presentation owns exact source frames, contacts and prop throughout every handoff',()=>{
 const {p,visit}=admitted(),plan=visit.mediaAdmission.plan,actor=entry(),actors={pip:actor},before=JSON.stringify(p);const times=new Set([plan.schedule.enterAt-1,plan.schedule.leavesAt]);
 for(const s of plan.schedule.segments){for(const at of[s.startAt,s.startAt+1,s.endAt-1,s.endAt])times.add(at);const end=s.kind==='loop'?Math.min(s.endAt,s.startAt+2560):s.endAt;for(let at=s.startAt;at<end;at+=40)times.add(at);}
 for(const at of times){const v=courtyardPresentation(snapshot(p,at),at,MIKA_CLIPS,{actorEntries:actors,actorProfiles:accepted.actorProfiles});assert.equal(v.props[0].supported,true);assert.equal(v.props[0].stillId,'pip:target-snack-table');
 if(at<plan.schedule.enterAt||at>=visit.leavesAt){assert.equal(v.pets.length,0);assert.equal(v.props[0].drawStandalone,true);continue;}
 assert.equal(v.pets.length,1);assert.equal(v.legacy.length,0);const pet=v.pets[0],pose=selectPetPose(actor.manifest,pet,{actorProfile:actor.profile});assert.equal(pet.visitorId,'pip_hamster');assert.match(pose.clip.assetBaseURL,/yard-pip/);assert.equal(pose.clip.sourceSampleMs,40);
 assert.equal(Number(v.props[0].drawStandalone)+v.pets.filter(p=>p.propOwnerSlotId==='snack').length,1);
 if(pet.phase==='active-clip')assert.deepEqual(pet.clipOrigin,plan.clipOrigin);else assert.ok(Number.isFinite(edgeOpacity(pet.route.points,pet.phase,pet.groundDistance)));
 assert.equal(v.props[0].transform.x,50);assert.equal(v.props[0].transform.y,50);assert.ok(actor.presentation.requests(plan,at).lookahead.length<=1);
 }
 assert.equal(JSON.stringify(p),before);const at=plan.schedule.combinedStart+4800,rest=plan.schedule.combinedStart+17920;
 for(const [time,n]of[[at,2],[rest,4]]){const pet=courtyardPresentation(snapshot(p,time),time,MIKA_CLIPS,{actorEntries:actors,actorProfiles:accepted.actorProfiles}).pets[0],pose=selectPetPose(actor.manifest,pet,{actorProfile:actor.profile});assert.equal(pose.clip.groundContacts[pose.index].length,n);}
 assert.deepEqual(actor.groundShadow,{radiusX:.09,radiusY:.04,opacity:.25});
 assert.deepEqual(courtyardPresentation(snapshot(JSON.parse(before),at),at,MIKA_CLIPS,{actorEntries:actors,actorProfiles:accepted.actorProfiles}),courtyardPresentation(snapshot(p,at),at,MIKA_CLIPS,{actorEntries:actors,actorProfiles:accepted.actorProfiles}));
});
test('stale, moved, worn or closed records preserve the save and never render as another species',()=>{
 const {p,visit}=admitted(),at=visit.mediaAdmission.plan.schedule.combinedStart+4800,before=JSON.stringify(p),actor=entry(),args={actorEntries:{pip:actor},actorProfiles:accepted.actorProfiles};
 assert.equal(courtyardPresentation(snapshot(p,at,getYardServerOptions()),at,MIKA_CLIPS,args).pets.length,0);assert.equal(JSON.stringify(p),before);
 for(const mutate of[r=>r.mediaAdmission.plan.groundFootprintRevision='stale',r=>r.mediaAdmission.bindingCalibrationHash='stale',r=>r.mediaAdmission.actorProfile.revision='stale']){const q=copy(p);mutate(Object.values(q._yardV2.runtime.visits)[0]);assert.equal(snapshot(q,at).yardRuntime.visits[0].renderCompatible,false);}
 for(const mutate of[q=>q.x++,q=>q.condition='worn',q=>q.rotationZ=.1]){const snap=snapshot(p,at);snap.yard=copy(snap.yard);mutate(snap.yard.placedGoodies[0]);const view=courtyardPresentation(snap,at,MIKA_CLIPS,args);assert.equal(view.pets.length,0);assert.equal(view.props[0].drawStandalone,true);}
});
test('offline catch-up and reload remain partition-equivalent with one gift and no prop commits',()=>{
 const {p,visit}=admitted(),bulk=copy(p),parts=copy(p),end=visit.leavesAt+1,inventory=copy(p.yard.goodieInventory),outside=copy({resources:p.resources,garden:p.garden,merge:p.merge});
 assert.equal(ensurePersistentPlayerYard(bulk,{now:end,simulate:true,...accepted}).status,200);for(let at=visit.arrivedAt+15*60000;at<end;at+=15*60000)assert.equal(ensurePersistentPlayerYard(parts,{now:at,simulate:true,...accepted}).status,200);
 const restored=JSON.parse(JSON.stringify(parts));assert.equal(ensurePersistentPlayerYard(restored,{now:end,simulate:true,...accepted}).status,200);assert.deepEqual(restored,bulk);assert.equal(bulk.yard.pendingGifts.filter(g=>g.visitorId==='pip_hamster').length,1);assert.equal(Object.values(bulk._yardV2.runtime.visits)[0].status,'completed');assert.equal(Object.keys(bulk._yardV2.runtime.propCommitReceipts||{}).length,0);assert.deepEqual(bulk.yard.goodieInventory,inventory);assert.deepEqual({resources:bulk.resources,garden:bulk.garden,merge:bulk.merge},outside);
 const once=copy(bulk);ensurePersistentPlayerYard(bulk,{now:end,simulate:true,...accepted});assert.deepEqual(bulk,once);
});
test('album, favorite, helper food and gift collection retain durable replay semantics',()=>{
 const {p,visit}=admitted(),at=visit.arrivedAt+40000;const act=(action,payload,id,now=at)=>executePersistentYardAction(p,action,payload,{...accepted,now,actionId:`yard-v2:${id}`});
 const capture=act('yard.capturePhoto',{visitId:visit.visitId,caption:'Pip at the snack table'},'pip-photo');assert.equal(capture.status,200);assert.equal(capture.extras.photo.visitorId,'pip_hamster');assert.equal(capture.extras.photo.pose,'nibble');assert.equal(act('yard.favoritePhoto',{photoId:capture.extras.photo.id},'pip-favorite').status,200);assert.equal(p.yard.album.favoritePhotoId,capture.extras.photo.id);
 assert.equal(act('yard.configureCompanion',{name:'Buddy',preferredFoodId:'bonito_bowl'},'pip-helper').status,200);assert.deepEqual(p.yard.helper.opaque,{keep:'helper'});const saved=copy(p);assert.equal(act('yard.capturePhoto',{visitId:visit.visitId,caption:'Pip at the snack table'},'pip-photo',visit.leavesAt+H).replayed,true);assert.deepEqual(p,saved);
 ensurePersistentPlayerYard(p,{now:visit.leavesAt,simulate:true,...accepted});const gift=copy(p.yard.pendingGifts.find(g=>g.visitorId==='pip_hamster')),balance=copy(p.yard.currencies);assert.ok(gift);assert.equal(act('yard.collectGifts',{},'pip-collect',visit.leavesAt).status,200);assert.equal(p.yard.currencies.treats,balance.treats+gift.treats);const collected=copy(p);assert.equal(act('yard.collectGifts',{},'pip-collect',visit.leavesAt+H).replayed,true);assert.deepEqual(p,collected);
});
test('readiness cache retains no account slot ID or unknown metadata',()=>{const source=createPipMedia(),a=player().yard,first=source.sourcePlacementReadiness(a),b=copy(a);b.placedGoodies[0].slotId='other-account';b.placedGoodies[0].opaque={secret:'unused'};const second=source.sourcePlacementReadiness(b);assert.equal(second[0].slotId,'other-account');assert.equal(second[0].status,first[0].status);assert.equal(second[0].opaque,undefined);b.placedGoodies[0].uses=8;assert.equal(source.sourcePlacementReadiness(b)[0].status,'repair-required');});
test('accepted table actions preserve catalog prices, placement authority and exact replay',()=>{
 const p=player();p.yard.placedGoodies=[];p.yard.currencies.treats=500;ensurePersistentPlayerYard(p,{now:NOW,...accepted});
 const act=(action,payload,id)=>executePersistentYardAction(p,action,payload,{...accepted,now:NOW,actionId:`yard-v2:${id}`});
 const inventory=p.yard.goodieInventory.snack_table;assert.equal(act('yard.buyGoodie',{goodieId:'snack_table'},'pip-buy').status,200);assert.equal(p.yard.currencies.treats,340);assert.equal(p.yard.goodieInventory.snack_table,inventory+1);const bought=copy(p);assert.equal(act('yard.buyGoodie',{goodieId:'snack_table'},'pip-buy').replayed,true);assert.deepEqual(p,bought);
 const placed=act('yard.placeGoodie',{goodieId:'snack_table',slotId:'snack',x:50,y:50},'pip-place');assert.equal(placed.status,200);assert.equal(p.yard.placedGoodies[0].goodieId,'snack_table');
 p.yard.placedGoodies[0].uses=9;p.yard.placedGoodies[0].condition='worn';const balance=p.yard.currencies.treats;assert.equal(act('yard.fixGoodie',{slotId:p.yard.placedGoodies[0].slotId},'pip-fix').status,200);assert.equal(p.yard.currencies.treats,balance-40);assert.equal(p.yard.placedGoodies[0].condition,'new');assert.equal(p.yard.placedGoodies[0].uses,0);const repaired=copy(p);assert.equal(act('yard.fixGoodie',{slotId:p.yard.placedGoodies[0].slotId},'pip-fix').replayed,true);assert.deepEqual(p,repaired);
});
test('accepted Pip admission still rejects unsupported foods, worn transition and other props safely',()=>{
 const source=createPipMedia(),p=player(),placement=p.yard.placedGoodies[0],base={at:NOW,leavesAt:NOW+H,placement,yard:p.yard,visitor:YARD_VISITORS.pip_hamster,goodie:YARD_GOODIES.snack_table,activity:{id:'nibble'},bowl:p.yard.bowls[0],active:[],reserved:[]};
 for(const [mutate,code]of[[q=>q.placement.uses=8,'POST_ADMISSION_PROP_STATE_UNSUPPORTED'],[q=>q.bowl.foodId='future_food','FOOD_PRESENTATION_UNAVAILABLE'],[q=>q.activity.id='sniff','ACTIVITY_MEDIA_UNAVAILABLE'],[q=>q.active.push({visitorId:'pip_hamster',leavesAt:NOW+2*H}),'PIP_ALREADY_VISITING'],[q=>q.yard.placedGoodies.push({slotId:'future',goodieId:'leaf_pot',x:80,y:80}),'PLACEMENT_CALIBRATION_UNAVAILABLE']]){const q=copy(base);mutate(q);const before=JSON.stringify(q);assert.equal(source.preflightCandidate(q).code,code);assert.equal(JSON.stringify(q),before);}
 assert.equal(createAdmissionPolicy(getYardServerOptions())(base).ok,false);
});
test('canonical atlas bytes and manifest binding remain the frozen independent Pip source',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const seen=new Set();for(const clip of[...Object.values(media.clips),...Object.values(media.walk.facings),...Object.values(media.turns)])for(const page of clip.pages){if(seen.has(page.src))continue;seen.add(page.src);const bytes=await readFile(new URL('../public/assets/yard-pip/'+page.src,import.meta.url));assert.equal(bytes.length,page.encodedBytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),page.sha256);}
 assert.equal(seen.size,101);assert.equal(media.renderBindings['pip-snack-combined-r1'].bindingCalibrationHash,'59fdee75e4bacae7bb65c869745c93fb6607cb67d5e7bd5e12dfe58d052f4492');
 assert.equal(media.playbackReady,false);assert.equal(media.runtimeActivated,false);
});
