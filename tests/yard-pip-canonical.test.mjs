import './yard-inventory-only-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../game-logic/player.js';
import {YARD_GOODIES,YARD_VISITORS,YARD_FOODS} from '../game-logic/yard-v2/catalog.mjs';
import {ACTOR_PROFILES} from '../game-logic/yard-v2/actor-profiles.mjs';
import {PIP_ACTOR_PROFILE,PIP_ACTOR_REFERENCE} from '../game-logic/yard-v2/pip-actor-profile.mjs';
import {getMikaServerOptions} from '../game-logic/yard-v2/mika-media.mjs';
import {getYardServerOptions,createYardMedia} from '../game-logic/yard-v2/yard-media.mjs';
import {createPipMedia} from '../game-logic/yard-v2/pip-media.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
import {validPresentationPlan} from '../game-logic/yard-v2/simulation.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {createPipAcceptanceOptions} from './fixtures/yard-pip-canonical/acceptance.mjs';
import {createMochiAcceptanceOptions} from './fixtures/yard-mochi-canonical/acceptance.mjs';
const NOW=Date.UTC(2026,9,3,12),H=3600000,copy=structuredClone,accepted=createPipAcceptanceOptions();
// Release defaults now admit Pip. Model a closed source explicitly through the
// trusted server seam; never change the released profile, registry or manifest.
function closedPipSource(){
 const pip=createPipMedia();return{...pip,actorProfiles:{},
  candidateProfile:{...copy(pip.candidateProfile),playbackReady:false},
  mediaRegistry:{...copy(pip.mediaRegistry),bindings:pip.mediaRegistry.bindings.map(b=>({...copy(b),playbackReady:false,unavailableReason:'PIP_FULL_YARD_ACCEPTANCE_REQUIRED'}))},
  preflight:()=>({ok:false,code:'PIP_FULL_YARD_ACCEPTANCE_REQUIRED'})};
}
const closedPipOptions=()=>createYardMedia({pip:closedPipSource()});
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
const snapshot=(p,now,options=accepted)=>({yard:p.yard,yardRuntime:publicPersistentYard(p,{now,...options})});

test('closed Pip preserves Mika, accepted Mochi, foods, catalog and every inventory field',()=>{
 assert.deepEqual(Object.keys(ACTOR_PROFILES),['mika']);
 const pip=closedPipSource(),options=createYardMedia({pip}),withoutPip=createYardMedia({pip:{...pip,mediaRegistry:{...pip.mediaRegistry,bindings:[]}}});
 assert.deepEqual(options.mediaRegistry,withoutPip.mediaRegistry);assert.equal(options.sourceRegistry.bindings.find(b=>b.visitorId==='pip_hamster').playbackReady,false);assert.equal(options.actorProfiles.pip,undefined);
 const mika=getMikaServerOptions();assert.deepEqual(options.mediaRegistry.bindings.filter(b=>b.visitorId==='mika_cat'),mika.mediaRegistry.bindings);assert.deepEqual(options.actorProfiles.mika,mika.actorProfiles.mika);
 const mochi=createMochiAcceptanceOptions();assert.equal(options.mediaRegistry.bindings.filter(b=>b.visitorId==='mochi_bunny').length,1);assert.deepEqual(options.mediaRegistry.bindings.filter(b=>b.visitorId==='mochi_bunny'),mochi.mediaRegistry.bindings.filter(b=>b.visitorId==='mochi_bunny'));assert.equal(options.mediaRegistry.bindings.some(b=>b.visitorId==='pip_hamster'),false);assert.deepEqual(mochi.mediaRegistry.foodBindings,options.mediaRegistry.foodBindings);
 assert.equal(Object.keys(YARD_VISITORS).length,8);assert.equal(Object.keys(YARD_GOODIES).length,11);assert.equal(Object.keys(YARD_FOODS).length,3);
 const p=player(),before=copy(p.yard);assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...options}).status,200);assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...options}).status,200);
 assert.equal(Object.keys(p._yardV2.runtime.visits).length,0);assert.equal(p.yard.bowls[0].servings,5);assert.equal(p.yard.placedGoodies[0].uses,0);for(const key of['goodieInventory','foodInventory','helper','petbook'])assert.deepEqual(p.yard[key],before[key]);
 const balance=copy(p.yard.currencies);assert.equal(executePersistentYardAction(p,'yard.buyGoodie',{goodieId:'snack_table'},{now:NOW+H,actionId:'yard-v2:closed-buy',...options}).status,409);assert.deepEqual(p.yard.currencies,balance);
});
test('real catalog probability admits an exact Pip schedule and spends only existing food/use',()=>{
 const {p,visit}=admitted(),plan=visit.mediaAdmission.plan;assert.equal(visit.original.activityId,'nibble');assert.equal(validPresentationPlan(plan,{at:visit.arrivedAt,leavesAt:visit.leavesAt,slotId:visit.slotId}),true);
 assert.deepEqual(visit.mediaAdmission.actorProfile,PIP_ACTOR_REFERENCE);assert.equal(plan.groundFootprintRevision,PIP_ACTOR_PROFILE.ground.revision);assert.equal(plan.incoming.initialFacing,0);assert.equal(plan.outgoing.initialFacing,4);
 assert.equal(p.yard.bowls[0].servings,4);assert.equal(p.yard.placedGoodies[0].uses,1);assert.equal(p.yard.placedGoodies[0].condition,'new');assert.equal(p.yard.petbook.pip_hamster.visits,1);assert.deepEqual(plan.propCommits,[]);assert.equal(p.yard.pendingGifts.length,0);
 const row=publicPersistentYard(p,{now:visit.arrivedAt,...accepted}).placementReadiness.find(r=>r.slotId==='snack');assert.equal(row.status,'ready');assert.equal(row.visitors.find(v=>v.visitorId==='pip_hamster').status,'ready');
 console.log('PIP_PERSISTENT_VISIT',JSON.stringify({durationMs:visit.leavesAt-visit.arrivedAt,loops:plan.schedule.loop.cycles,incoming:plan.incoming.durationMs,outgoing:plan.outgoing.durationMs}));
});
test('closed and stale public admission preserve the saved Pip identity and records',()=>{
 const {p,visit}=admitted(),at=visit.mediaAdmission.plan.schedule.combinedStart+4800,before=JSON.stringify(p);
 const released=snapshot(p,at,getYardServerOptions());assert.equal(released.yardRuntime.visits[0].renderCompatible,true);
 const closed=snapshot(p,at,closedPipOptions());assert.equal(closed.yardRuntime.visits[0].renderCompatible,false);assert.ok(closed.yardRuntime.visits[0].presentationIssues.includes('INTERACTION_MEDIA_NOT_READY'));assert.equal(JSON.stringify(p),before);
 for(const mutate of[r=>r.mediaAdmission.plan.groundFootprintRevision='stale',r=>r.mediaAdmission.bindingCalibrationHash='stale',r=>r.mediaAdmission.actorProfile.revision='stale']){const q=copy(p);mutate(Object.values(q._yardV2.runtime.visits)[0]);assert.equal(snapshot(q,at).yardRuntime.visits[0].renderCompatible,false);}
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
 const before=JSON.stringify(base),admission=createAdmissionPolicy(getYardServerOptions())(base);assert.equal(admission.ok,true,admission.code);assert.deepEqual(admission.binding.actorProfile,PIP_ACTOR_REFERENCE);assert.equal(validPresentationPlan(admission.binding.plan,{at:base.at,leavesAt:base.leavesAt,slotId:placement.slotId}),true);
 assert.deepEqual(createAdmissionPolicy(closedPipOptions())(base),{ok:false,code:'UNSUPPORTED_VISIT_MEDIA'});assert.equal(JSON.stringify(base),before);
});
