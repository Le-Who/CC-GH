import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../game-logic/player.js';
import {YARD_GOODIES,YARD_VISITORS,YARD_FOODS} from '../game-logic/yard-v2/catalog.mjs';
import {ACTOR_PROFILES} from '../game-logic/yard-v2/actor-profiles.mjs';
import {PEBBLE_ACTOR_PROFILE,PEBBLE_ACTOR_REFERENCE,PEBBLE_RELEASE_GATE} from '../game-logic/yard-v2/pebble-actor-profile.mjs';
import {getMikaServerOptions} from '../game-logic/yard-v2/mika-media.mjs';
import {getYardServerOptions} from '../game-logic/yard-v2/yard-media.mjs';
import {createPebbleMedia} from '../game-logic/yard-v2/pebble-media.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
import {validPresentationPlan} from '../game-logic/yard-v2/simulation.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {createPebbleAcceptanceOptions} from './fixtures/yard-pebble-canonical/acceptance.mjs';
const NOW=Date.UTC(2026,9,3,12),H=3600000,copy=structuredClone,accepted=createPebbleAcceptanceOptions();
function player(){
 const p=createDefaultPlayer('pebble-canonical-13','Fixture',NOW);
 p.yard.placedGoodies=[{slotId:'leaf',goodieId:'leaf_pot',x:60,y:48,condition:'new',uses:0,opaque:{keep:'target'}}];
 p.yard.bowls[0]={id:'bowl-1',foodId:'berry_plate',servings:5,placedAt:NOW,expiresAt:NOW+5*H};
 for(const id of Object.keys(YARD_GOODIES))p.yard.goodieInventory[id]=3;
 p.yard.goodieInventory.alchemy_living_arbor=4;p.yard.goodieInventory.alchemy_echo_chimes=7;p.yard.goodieInventory.future_prop=19;
 p.yard.foodInventory={kibble:11,berry_plate:12,bonito_bowl:13,future_food:23};
 p.yard.helper={...p.yard.helper,opaque:{keep:'helper'}};return p;
}
function admitted(){const p=player();assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...accepted}).status,200);
 assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,...accepted}).status,200);
 const visit=Object.values(p._yardV2.runtime.visits).find(r=>r.original.visitorId==='pebble_pup');assert.ok(visit);return{p,visit};}
const snapshot=(p,now,options=accepted)=>({yard:p.yard,yardRuntime:publicPersistentYard(p,{now,...options})});

test('canonical defaults preserve the entire Mika registry and all unavailable inventory behind the closed gate',()=>{
 assert.equal(PEBBLE_RELEASE_GATE.accepted,false);assert.equal(PEBBLE_ACTOR_PROFILE.playbackReady,false);assert.deepEqual(Object.keys(ACTOR_PROFILES),['mika']);
 const options=getYardServerOptions();assert.deepEqual(options.mediaRegistry,getMikaServerOptions().mediaRegistry);
 assert.equal(options.sourceRegistry.bindings.find(b=>b.visitorId==='pebble_pup').playbackReady,false);
 assert.equal(Object.keys(YARD_VISITORS).length,8);assert.equal(Object.keys(YARD_FOODS).length,3);
 const p=player(),before=copy(p.yard);ensurePersistentPlayerYard(p,{now:NOW});assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true}).status,200);
 assert.equal(Object.keys(p._yardV2.runtime.visits).length,0);assert.equal(p.yard.bowls[0].servings,5);assert.equal(p.yard.placedGoodies[0].uses,0);
 assert.deepEqual(p.yard.goodieInventory,before.goodieInventory);assert.deepEqual(p.yard.foodInventory,before.foodInventory);assert.deepEqual(p.yard.helper,before.helper);assert.deepEqual(p.yard.petbook,before.petbook);
});
test('trusted acceptance uses real probabilistic admission and server-valid 92-minute schedule without catalog changes',()=>{
 const {p,visit}=admitted(),plan=visit.mediaAdmission.plan;
 assert.equal(visit.original.activityId,'sniff');assert.equal(visit.leavesAt-visit.arrivedAt,92*60000);
 assert.equal(validPresentationPlan(plan,{at:visit.arrivedAt,leavesAt:visit.leavesAt,slotId:visit.slotId}),true);
 assert.deepEqual(visit.mediaAdmission.actorProfile,PEBBLE_ACTOR_REFERENCE);assert.equal(plan.groundFootprintRevision,PEBBLE_ACTOR_PROFILE.ground.revision);
 assert.equal(plan.incoming.durationMs,25800);assert.equal(plan.outgoing.durationMs,23800);assert.equal(plan.schedule.loop.cycles,3408);
 assert.equal(p.yard.bowls[0].servings,4);assert.equal(p.yard.placedGoodies[0].uses,1);assert.equal(p.yard.placedGoodies[0].condition,'new');
 assert.equal(p.yard.petbook.pebble_pup.visits,1);assert.deepEqual(plan.propCommits,[]);assert.equal(p.yard.pendingGifts.length,0);
 const readiness=publicPersistentYard(p,{now:visit.arrivedAt,...accepted}).placementReadiness.find(r=>r.slotId==='leaf');
 assert.equal(readiness.status,'ready');assert.equal(readiness.visitors.find(v=>v.visitorId==='pebble_pup').status,'ready');
 assert.deepEqual(YARD_VISITORS.pebble_pup.poses,['sniff','roll','sit']);
});
test('closed or stale public admission preserves saved Pebble records',()=>{
 const {p,visit}=admitted(),at=visit.arrivedAt+30000,before=JSON.stringify(p);
 const closed=snapshot(p,at,getYardServerOptions());assert.equal(closed.yardRuntime.visits[0].renderCompatible,false);
 assert.equal(JSON.stringify(p),before);
 const stale=copy(p);Object.values(stale._yardV2.runtime.visits)[0].mediaAdmission.plan.groundFootprintRevision='stale';
 assert.equal(snapshot(stale,at).yardRuntime.visits[0].renderCompatible,false);
});
test('native offline catch-up, reload, gift completion and inventory preservation are partition-equivalent',()=>{
 const {p,visit}=admitted(),bulk=copy(p),parts=copy(p),end=visit.leavesAt+1,outside=copy({resources:p.resources,garden:p.garden,merge:p.merge}),inventory=copy(p.yard.goodieInventory);
 assert.equal(ensurePersistentPlayerYard(bulk,{now:end,simulate:true,...accepted}).status,200);
 for(let at=visit.arrivedAt+15*60000;at<end;at+=15*60000)assert.equal(ensurePersistentPlayerYard(parts,{now:at,simulate:true,...accepted}).status,200);
 const restored=JSON.parse(JSON.stringify(parts));assert.equal(ensurePersistentPlayerYard(restored,{now:end,simulate:true,...accepted}).status,200);assert.deepEqual(restored,bulk);
 assert.equal(bulk.yard.pendingGifts.filter(g=>g.visitorId==='pebble_pup').length,1);assert.equal(Object.values(bulk._yardV2.runtime.visits)[0].status,'completed');assert.equal(Object.keys(bulk._yardV2.runtime.propCommitReceipts||{}).length,0);
 assert.deepEqual(bulk.yard.goodieInventory,inventory);assert.deepEqual({resources:bulk.resources,garden:bulk.garden,merge:bulk.merge},outside);
 const once=copy(bulk);ensurePersistentPlayerYard(bulk,{now:end,simulate:true,...accepted});assert.deepEqual(bulk,once);
});
test('source preflight rejects state transitions, duplicate actors, food gaps and occupied body regions',()=>{
 const {p,visit}=admitted(),m=createPebbleMedia(),placement={...p.yard.placedGoodies[0],uses:0};
 const candidate={at:NOW+H,leavesAt:NOW+2*H,placement,visitor:YARD_VISITORS.pebble_pup,goodie:YARD_GOODIES.leaf_pot,activity:{id:'sniff'},bowl:{id:'bowl-1',foodId:'berry_plate'},yard:{...copy(p.yard),placedGoodies:[placement]},active:[],reserved:[]};
 for(const [change,code]of [[c=>c.placement.uses=7,'POST_ADMISSION_PROP_STATE_UNSUPPORTED'],[c=>c.bowl.foodId='future_food','FOOD_PRESENTATION_UNAVAILABLE'],[c=>c.active.push(visit),'PEBBLE_ALREADY_VISITING'],[c=>c.reserved.push({visitorId:'other',slotId:'other',arrivedAt:NOW,leavesAt:NOW+9*H,reservationBoxes:[{x:30,y:35,width:40,height:40}]}),'PRESENTATION_REGION_RESERVED']]){
  const c=copy(candidate);change(c);assert.equal(m.preflightCandidate(c).code,code);
 }
 assert.equal(createAdmissionPolicy(getYardServerOptions())(candidate).ok,false);
});
test('Pebble album, helper preference and gift collection use existing durable actions with exact replay',()=>{
 const {p,visit}=admitted(),at=visit.arrivedAt+30000;
 const act=(action,payload,id,now=at)=>executePersistentYardAction(p,action,payload,{...accepted,now,actionId:`yard-v2:${id}`});
 const capture=act('yard.capturePhoto',{visitId:visit.visitId,caption:'Pebble with the leaf'},'pebble-photo');assert.equal(capture.status,200);
 assert.equal(capture.extras.photo.visitorId,'pebble_pup');assert.equal(capture.extras.photo.pose,'sniff');assert.equal(p.yard.album.photos.length,1);
 assert.equal(act('yard.favoritePhoto',{photoId:capture.extras.photo.id},'pebble-favorite').status,200);assert.equal(p.yard.album.favoritePhotoId,capture.extras.photo.id);
 assert.equal(act('yard.configureCompanion',{name:'Buddy',preferredFoodId:'bonito_bowl'},'pebble-helper').status,200);assert.equal(p.yard.helper.preferredFoodId,'bonito_bowl');assert.deepEqual(p.yard.helper.opaque,{keep:'helper'});
 const saved=copy(p);assert.equal(act('yard.capturePhoto',{visitId:visit.visitId,caption:'Pebble with the leaf'},'pebble-photo',visit.leavesAt+H).replayed,true);assert.deepEqual(p,saved);
 ensurePersistentPlayerYard(p,{now:visit.leavesAt,simulate:true,...accepted});const gift=copy(p.yard.pendingGifts.find(g=>g.visitorId==='pebble_pup')),balance=copy(p.yard.currencies);
 assert.ok(gift);assert.equal(act('yard.collectGifts',{},'pebble-collect',visit.leavesAt).status,200);assert.equal(p.yard.currencies.treats,balance.treats+gift.treats);
 const collected=copy(p);assert.equal(act('yard.collectGifts',{},'pebble-collect',visit.leavesAt+H).replayed,true);assert.deepEqual(p,collected);
});
test('Pebble placement readiness cache retains neither account slot IDs nor opaque inventory metadata',()=>{
 const m=createPebbleMedia(),a=player().yard,first=m.sourcePlacementReadiness(a),b=copy(a);b.placedGoodies[0].slotId='other-account-slot';b.placedGoodies[0].opaque={secret:'must-not-copy'};
 const result=m.sourcePlacementReadiness(b);assert.equal(result[0].slotId,'other-account-slot');assert.equal(result[0].status,first[0].status);assert.equal(result[0].opaque,undefined);
 b.placedGoodies[0].uses=7;assert.equal(m.sourcePlacementReadiness(b)[0].status,'repair-required');assert.equal(first[0].status,'ready');
});
test('Leaf Pot buy, place and repair remain gate-controlled and use unchanged catalog prices',()=>{
 const p=player();p.yard.placedGoodies=[];p.yard.currencies.treats=1000;ensurePersistentPlayerYard(p,{now:NOW,...accepted});
 const closed=copy(p),before=copy(closed.yard.currencies);const denied=executePersistentYardAction(closed,'yard.buyGoodie',{goodieId:'leaf_pot'},{now:NOW,actionId:'yard-v2:leaf-closed'});
 assert.equal(denied.status,409);assert.deepEqual(closed.yard.currencies,before);
 const owned=p.yard.goodieInventory.leaf_pot;
 const act=(action,payload,id)=>executePersistentYardAction(p,action,payload,{...accepted,now:NOW,actionId:`yard-v2:${id}`});
 const buy=act('yard.buyGoodie',{goodieId:'leaf_pot'},'leaf-buy');assert.equal(buy.status,200);assert.equal(p.yard.goodieInventory.leaf_pot,owned+1);assert.equal(p.yard.currencies.treats,1000-YARD_GOODIES.leaf_pot.cost.treats);
 assert.equal(act('yard.placeGoodie',{goodieId:'leaf_pot',slotId:'leaf-buy',x:60,y:48},'leaf-place').status,200);assert.equal(p.yard.goodieInventory.leaf_pot,owned);
 const target=p.yard.placedGoodies.find(p=>p.slotId==='leaf-buy');target.condition='worn';target.uses=8;
 assert.equal(act('yard.fixGoodie',{slotId:'leaf-buy'},'leaf-repair').status,200);assert.equal(p.yard.placedGoodies[0].condition,'new');assert.equal(p.yard.placedGoodies[0].uses,0);assert.equal(p.yard.currencies.treats,1000-YARD_GOODIES.leaf_pot.cost.treats-YARD_GOODIES.leaf_pot.fixCost.treats);
 const saved=copy(p);assert.equal(act('yard.buyGoodie',{goodieId:'leaf_pot'},'leaf-buy').replayed,true);assert.deepEqual(p,saved);
});
