import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../game-logic/player.js';
import {executePersistentYardAction,ensurePersistentPlayerYard,inspectPlayerYard,publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
import {CANONICAL_LOCATION,canonicalStorageValid,canonicalFootprintValid} from '../game-logic/yard-v2/canonical-locations.mjs';
import {CANONICAL_FOOD_CONTRACT,CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX,validateCanonicalFoodDescriptor,selectCanonicalFoodState} from '../game-logic/yard-v2/canonical-food-contract.mjs';
import {canonicalCapability,canonicalCommandScope,canonicalReplayCapability} from '../src/game-state/canonicalYardProtocol.mjs';
import {canonicalItemState,checkCanonicalPlacement} from '../src/game-state/canonicalYardItems.mjs';
import {YARD_FOODS} from '../game-logic/yard-catalog.js';
import {prior as old} from './helpers/yard-food-prior-binary.mjs';
const NOW=1791288000000,options={canonicalItemPlacementEnabled:true,canonicalFoodLocationEnabled:true};
const payload=(extra={},v2=true)=>({...v2?CANONICAL_FOOD_LOCATION:CANONICAL_LOCATION,slotId:'canonical:food-check',goodieId:'leaf_pot',x:98,y:118,...extra});
function player(){const p=createDefaultPlayer('food-contract','Owner',NOW);p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.goodieInventory.leaf_pot=2;assert.equal(ensurePersistentPlayerYard(p,{now:NOW}).status,200);return p;}
const act=(p,action,data,id,opts=options)=>executePersistentYardAction(p,action,data,{now:NOW,actionId:id,...opts});
const snap=(p,opts=options)=>({player:{id:p.id},yard:structuredClone(p.yard),yardRuntime:publicPersistentYard(p,{now:NOW,...opts})});
const v1='yard-v2:canonical-v1/',v2=CANONICAL_FOOD_NONCE_PREFIX;
const withoutCommands=p=>{const copy=structuredClone(p);delete copy._yardV2.runtime.commandReceipts;return copy;};

test('new descriptor exact identity, source measurements and default-off projection do not mutate or admit',()=>{
 const p=player(),before=structuredClone(p),s=snap(p,{});
 assert.equal(validateCanonicalFoodDescriptor(CANONICAL_FOOD_CONTRACT),true);
 for(const patch of[{unionHeightCanonical:1.841},{assetSha256:'0'.repeat(64)},{geometryRevision:CANONICAL_LOCATION.geometryRevision},{presentationReady:true},{extra:true}])assert.equal(validateCanonicalFoodDescriptor({...CANONICAL_FOOD_CONTRACT,...patch}),false);
 assert.equal(CANONICAL_FOOD_CONTRACT.unionRadiusCanonical,3.843);assert.equal(CANONICAL_FOOD_CONTRACT.unionHeightCanonical,2.09);
 assert.equal(s.yardRuntime.foodLocationCapabilities.enabled,false);assert.equal(selectCanonicalFoodState(s).available,false);
 assert.equal(s.yardRuntime.itemPlacementCapabilities.geometryRevision,CANONICAL_LOCATION.geometryRevision);assert.equal(s.yardRuntime.itemPlacementCapabilities.visitAdmission,false);assert.deepEqual(p,before);
});

test('actual existing v1 overlap is preserved, blocks only food, and has an explicit v2 move/pickup escape',()=>{
 const p=player(),initial=structuredClone(p);
 assert.equal(canonicalFootprintValid(80,82),true);
 assert.equal(act(p,'yard.placeGoodie',payload({x:80,y:82},false),v1+'prior',{canonicalItemPlacementEnabled:true}).status,200);
 const row=structuredClone(p._yardV2.runtime.canonicalPlacements[0]),before=structuredClone(p),s=snap(p);
 assert.equal(inspectPlayerYard(p,{now:NOW}).status,200);assert.equal(canonicalStorageValid([row]),true);assert.deepEqual(p,before);
 assert.deepEqual(selectCanonicalFoodState(s),{available:false,state:null,reason:'CANONICAL_FOOD_SOCKET_OCCUPIED',occupiedSlotIds:[row.slotId]});
 assert.equal(canonicalItemState(s).available,true);assert.ok(canonicalCapability(s));assert.equal(canonicalCommandScope(s),CANONICAL_FOOD_LOCATION);
 assert.equal(checkCanonicalPlacement(s,{...payload({x:80,y:82}),placing:false}).errors[0].code,'CANONICAL_FOOD_REGION_RESERVED');
 assert.equal(act(p,'yard.moveGoodie',payload(),v2+'move').status,200);assert.equal(selectCanonicalFoodState(snap(p)).available,true);
 assert.equal(p._yardV2.version,2);assert.deepEqual(Object.fromEntries(Object.keys(CANONICAL_LOCATION).map(k=>[k,p._yardV2.runtime.canonicalPlacements[0][k]])),CANONICAL_LOCATION);
 assert.deepEqual(p.yard.bowls,initial.yard.bowls);assert.deepEqual(p.yard.foodInventory,initial.yard.foodInventory);assert.deepEqual(p._yardV2.runtime.visits,initial._yardV2.runtime.visits);
 assert.equal(act(p,'yard.pickupGoodie',payload(),v2+'pickup').status,200);assert.equal(p.yard.goodieInventory.leaf_pot,2);
});

test('new v2 placements and moves enforce union even empty; denied command replay never changes after occupancy changes',()=>{
 const p=player(),initial=structuredClone(p),command=payload({x:80,y:82}),id=v2+'food-collision';
 const denied=act(p,'yard.placeGoodie',command,id);assert.equal(denied.error,'CANONICAL_FOOD_REGION_RESERVED');assert.equal(denied.status,400);assert.ok(denied.receipt);assert.deepEqual(withoutCommands(p),withoutCommands(initial));
 const before=structuredClone(p);assert.equal(act(p,'yard.placeGoodie',command,id,{}).replayed,true);assert.deepEqual(p,before);
 assert.equal(act(p,'yard.placeGoodie',payload(),v2+'safe').status,200);
 assert.equal(act(p,'yard.moveGoodie',command,v2+'unsafe-move').error,'CANONICAL_FOOD_REGION_RESERVED');assert.equal(p._yardV2.runtime.canonicalPlacements[0].x,98);
 assert.equal(act(p,'yard.placeGoodie',payload({slotId:'canonical:second',x:72,y:145}),v2+'safe-second').status,200);
 assert.equal(p.yard.goodieInventory.leaf_pot,undefined);assert.equal(p._yardV2.runtime.canonicalPlacements.length,2);
});

test('receipt first replays exact committed v1 and mismatches fail; uncommitted v1 gets a durable decision only on active v2',()=>{
 const p=player(),cmd=payload({},false),id=v1+'lost';
 assert.equal(act(p,'yard.placeGoodie',cmd,id,{canonicalItemPlacementEnabled:true}).status,200);const before=structuredClone(p);
 assert.equal(act(p,'yard.placeGoodie',cmd,id,{...options,now:NOW+86400000}).replayed,true);assert.deepEqual(p,before);
 assert.equal(act(p,'yard.placeGoodie',{...cmd,x:72},id).error,'ACTION_ID_PAYLOAD_CONFLICT');assert.deepEqual(p,before);
 const fresh=player(),original=structuredClone(fresh);
 const temporary=act(fresh,'yard.placeGoodie',cmd,v1+'uncommitted',{canonicalFoodLocationEnabled:true});assert.equal(temporary.status,409);assert.equal(temporary.receipt,undefined);assert.deepEqual(fresh,original);
 const rejected=act(fresh,'yard.placeGoodie',cmd,v1+'uncommitted');assert.equal(rejected.error,'CANONICAL_COMMAND_SUPERSEDED');assert.equal(rejected.status,400);assert.equal(rejected.details.disposition,'retained-user-decision');assert.ok(rejected.receipt);assert.deepEqual(withoutCommands(fresh),withoutCommands(original));
 const after=structuredClone(fresh);assert.equal(act(fresh,'yard.placeGoodie',cmd,v1+'uncommitted',{}).replayed,true);assert.deepEqual(fresh,after);
 assert.equal(canonicalReplayCapability(snap(fresh),'yard.placeGoodie',v1+'uncommitted'),true);
 assert.equal(act(fresh,'yard.placeGoodie',payload(),v1+'wrong-scope').error,'CANONICAL_NONCE_REQUIRED');
 assert.equal(act(fresh,'yard.placeGoodie',payload({},false),v2+'wrong-scope').error,'CANONICAL_GEOMETRY_REVISION_MISMATCH');
});

test('derived mapping rollback keeps storage valid on exact prior binary; reactivation detects newly occupied socket',()=>{
 const p=player();assert.equal(act(p,'yard.placeGoodie',payload(),v2+'saved').status,200);const saved=structuredClone(p);
 assert.equal(old.inspectPlayerYard(p,{now:NOW}).status,200);assert.deepEqual(p,saved);
 const unavailable=old.executePersistentYardAction(p,'yard.moveGoodie',payload({x:72,y:145}),{now:NOW,actionId:v2+'old-server',canonicalItemPlacementEnabled:true});assert.equal(unavailable.error,'CANONICAL_NONCE_REQUIRED');assert.deepEqual(p,saved);
 assert.equal(selectCanonicalFoodState(snap(p,{})).available,false);
 assert.equal(old.executePersistentYardAction(p,'yard.moveGoodie',payload({x:80,y:82},false),{now:NOW,actionId:v1+'rollback-move',canonicalItemPlacementEnabled:true}).status,200);
 assert.equal(selectCanonicalFoodState(snap(p)).reason,'CANONICAL_FOOD_SOCKET_OCCUPIED');assert.equal(p._yardV2.version,2);
});

test('selector resolves exactly one shared bowl, preserves unknown states, and does not infer expiry or consume inventory',()=>{
 const p=player();const before=structuredClone(p),s=snap(p),b=s.yard.bowls.find(x=>x.id==='bowl-1');
 Object.assign(b,{foodId:null,servings:0});assert.equal(selectCanonicalFoodState(s).state,'empty');
 for(const foodId of Object.keys(YARD_FOODS)){Object.assign(b,{foodId,servings:1,placedAt:NOW-2000,expiresAt:NOW-1000});assert.equal(selectCanonicalFoodState(s).state,foodId);}
 b.foodId='future-food';assert.equal(selectCanonicalFoodState(s).reason,'CANONICAL_FOOD_UNSUPPORTED');
 b.foodId='kibble';b.servings=0;assert.equal(selectCanonicalFoodState(s).reason,'CANONICAL_BOWL_STATE_INVALID');
 s.yard.bowls.push({...b});assert.equal(selectCanonicalFoodState(s).reason,'CANONICAL_BOWL_DUPLICATE');
 s.yard.bowls=[{...b,id:'bowl-2'}];assert.equal(selectCanonicalFoodState(s).reason,'CANONICAL_BOWL_UNAVAILABLE');assert.deepEqual(p,before);
});

test('existing buy/fill costs, stock consumption, catalog serving count and lifetime remain authoritative',()=>{
 const p=player();p.yard.currencies.treats=1000;p.yard.currencies.shinyTreats=100;
 for(const [foodId,food]of Object.entries(YARD_FOODS)){
  const money=structuredClone(p.yard.currencies),stock=p.yard.foodInventory[foodId]||0;
  assert.equal(act(p,'yard.buyFood',{foodId,qty:1},'yard-v2:buy-'+foodId).status,200);
  for(const currency of ['treats','shinyTreats'])assert.equal(p.yard.currencies[currency],money[currency]-(food.cost[currency]||0));
  assert.equal(p.yard.foodInventory[foodId],stock+1);
  assert.equal(act(p,'yard.setFood',{foodId,bowlId:'bowl-1'},'yard-v2:fill-'+foodId).status,200);
  assert.equal(p.yard.foodInventory[foodId]||0,stock);const bowl=p.yard.bowls.find(b=>b.id==='bowl-1');assert.equal(bowl.servings,food.servings);assert.equal(bowl.placedAt,NOW);assert.equal(bowl.expiresAt,NOW+food.durationMs);assert.equal(selectCanonicalFoodState(snap(p)).state,foodId);
 }
 assert.equal(p.yard.bowls.length,1);assert.deepEqual(p._yardV2.runtime.visits,{});assert.deepEqual(p.yard.pendingGifts,[]);
});


test('selector rejects malformed ground and collisions using the authoritative storage geometry guard',()=>{
 const p=player();assert.equal(act(p,'yard.placeGoodie',payload(),v2+'valid-row').status,200);
 const base=snap(p);
 for(const edit of [s=>{s.yardRuntime.canonicalPlacements[0].x=-1000;s.yardRuntime.canonicalPlacements[0].y=-1000;},
  s=>s.yardRuntime.canonicalPlacements.push({...s.yardRuntime.canonicalPlacements[0],slotId:'canonical:overlap'}),
  s=>s.yard.placedGoodies.push({slotId:s.yardRuntime.canonicalPlacements[0].slotId})]){
  const s=structuredClone(base);edit(s);assert.equal(selectCanonicalFoodState(s).reason,'CANONICAL_AUTHORITATIVE_LAYOUT_INVALID');
 }
});
