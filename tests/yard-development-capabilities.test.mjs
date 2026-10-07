/** Ordinary exported product entrypoints. No source/import replacement, preload,
 * HTTP listener, browser, database or dev authentication. Route checks use the
 * real Telegram signature verifier and existing test-only in-memory account store. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sign} from '@tma.js/init-data-node';
import {createDefaultPlayer} from '../game-logic/player.js';
import {YARD_GOODIES,YARD_FOODS} from '../game-logic/yard-catalog.js';
import {initializeReleasedPlayerYard,executeReleasedYardAction,releasedYardSnapshot} from '../game-logic/yard-v2/player-release.mjs';
import {executePersistentYardAction,publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
import {YARD_DEVELOPMENT_RELEASE_POLICY,yardDevelopmentOptions,yardDevelopmentSnapshot} from '../game-logic/yard-v2/development-release-policy.mjs';
import {CANONICAL_ITEM_PLACEMENT_ENABLED,CANONICAL_LOCATION} from '../game-logic/yard-v2/canonical-locations.mjs';
import {CANONICAL_FOOD_LOCATION_ENABLED,CANONICAL_FOOD_LOCATION,selectCanonicalFoodState} from '../game-logic/yard-v2/canonical-food-contract.mjs';
import {getYardServerOptions} from '../game-logic/yard-v2/yard-media.mjs';
import {digest} from '../game-logic/yard-v2/util.mjs';
import playerRoutes,{applyActionWithReceipt,buildSnapshot} from '../routes/player.js';
import {requireAuth,resolveUser} from '../middleware/auth.js';
import {withPlayerLock} from '../playerManager.js';
import {getDb} from '../db.js';
import {isRedisEnabled} from '../redisAdapter.js';
import {getIO} from '../socketManager.js';

const NOW=Date.UTC(2026,9,6,12),HOUR=3600000;
const closed=Object.freeze({...YARD_DEVELOPMENT_RELEASE_POLICY,enabled:false});
const copy=value=>structuredClone(value);
const command=(extra={})=>({...CANONICAL_FOOD_LOCATION,goodieId:'leaf_pot',slotId:'canonical:development-one',x:98,y:118,...extra});
const execute=(p,action,payload,id,now=NOW)=>executeReleasedYardAction(p,action,payload,{now,actionId:id});
const view=p=>releasedYardSnapshot(p,{now:NOW}).yardRuntime;
function player(t,id='development-owner') {
  t.mock.method(Date,'now',()=>NOW);
  const p=createDefaultPlayer(id,'Owner',NOW);
  assert.equal(initializeReleasedPlayerYard(p,{now:NOW}).status,200);
  return p;
}
const outsideYard=p=>Object.fromEntries(Object.entries(p).filter(([key])=>!['yard','_yardV2'].includes(key)));

test('source policy coherently enables normal initialization, mutations and snapshots without claiming production acceptance',t=>{
  const p=player(t),mediaBefore=digest(getYardServerOptions());
  assert.equal(Object.isFrozen(YARD_DEVELOPMENT_RELEASE_POLICY),true);
  assert.equal(CANONICAL_ITEM_PLACEMENT_ENABLED,false);
  assert.equal(CANONICAL_FOOD_LOCATION_ENABLED,false);
  assert.equal(publicPersistentYard(p,{now:NOW}).itemPlacementCapabilities.enabled,false);
  const runtime=view(p),items=runtime.itemPlacementCapabilities,food=runtime.foodLocationCapabilities;
  assert.equal(items.enabled,true);assert.equal(items.maxPlacements,2);
  assert.deepEqual(Object.keys(items.items),['leaf_pot']);
  assert.deepEqual(items.actions,['yard.placeGoodie','yard.moveGoodie','yard.pickupGoodie']);
  assert.equal(items.visitAdmission,false);assert.equal(food.enabled,true);
  for(const key of ['presentationReady','runtimeActivated','visitAdmission'])assert.equal(food[key],false);
  assert.equal(runtime.developmentRelease.mode,'development-live');
  assert.equal(runtime.developmentRelease.productionAccepted,false);
  assert.equal(runtime.developmentRelease.canonicalVisitAdmission,false);
  assert.equal(runtime.supportedBindings.goodies.leaf_pot.buy,true);
  assert.equal(runtime.supportedBindings.goodies.leaf_pot.developmentPurchase,true);
  assert.equal(runtime.canonicalFoodState.bowlId,'bowl-1');
  assert.equal(digest(getYardServerOptions()),mediaBefore,'Development must not change any actor/admission registry');
});

test('closed trusted policy and malformed storage fail closed despite forged capability, registry and saved fields',t=>{
  const p=player(t);p.yard.goodieInventory.leaf_pot=1;
  const forged={now:NOW,actionId:'yard-v2:canonical-v2/forged',canonicalItemPlacementEnabled:true,
    canonicalFoodLocationEnabled:true,actionPolicy:()=>({ok:true}),mediaRegistry:{bindings:[]},
    enabled:true,developmentRelease:{enabled:true},yardPipPreview:true};
  const options=yardDevelopmentOptions(forged,closed),before=copy(p);
  assert.equal(options.canonicalItemPlacementEnabled,false);
  assert.equal(options.canonicalFoodLocationEnabled,false);
  assert.equal(options.mediaRegistry,undefined);
  assert.notEqual(options.actionPolicy,forged.actionPolicy);
  const denied=executePersistentYardAction(p,'yard.placeGoodie',command({canonicalItemPlacementEnabled:true,enabled:true}),options);
  assert.equal(denied.status,409);assert.deepEqual(p,before);
  const snapshot=yardDevelopmentSnapshot(publicPersistentYard(p,options),closed);
  assert.equal(snapshot.itemPlacementCapabilities.enabled,false);
  assert.equal(snapshot.foodLocationCapabilities.enabled,false);
  assert.equal(snapshot.developmentRelease.enabled,false);
  // A request cannot turn the reviewed source mode off or grant new scope.
  assert.equal(releasedYardSnapshot(p,{now:NOW,canonicalItemPlacementEnabled:false}).yardRuntime.itemPlacementCapabilities.enabled,true);
  assert.equal(execute(p,'yard.placeGoodie',command({goodieId:'moon_lamp',enabled:true}),'yard-v2:canonical-v2/not-a-pot').status,400);
  p._yardV2.version=99;const malformed=copy(p);
  assert.equal(initializeReleasedPlayerYard(p,forged).status,409);
  const invalid=view(p);assert.equal(invalid.mutable,false);assert.equal(invalid.itemPlacementCapabilities.enabled,false);
  assert.equal(invalid.foodLocationCapabilities.enabled,false);assert.deepEqual(p,malformed);
});

test('development purchase keeps exact catalog economics and receipt-first replay, then supports two placed pots only',t=>{
  let p=player(t),outside=copy(outsideYard(p));
  assert.equal(p.yard.currencies.treats,80);assert.equal(p.yard.goodieInventory.leaf_pot,undefined);
  assert.deepEqual(YARD_GOODIES.leaf_pot.cost,{treats:140,shinyTreats:0});
  const buy={goodieId:'leaf_pot'},failed='yard-v2:development-insufficient';
  assert.equal(execute(p,'yard.buyGoodie',buy,failed).error,'not enough yard currency');
  const rejected=copy(p._yardV2.runtime.commandReceipts[failed]);
  p.yard.currencies.treats=420;
  assert.equal(execute(p,'yard.buyGoodie',buy,failed).replayed,true);
  assert.equal(p.yard.currencies.treats,420);assert.deepEqual(p._yardV2.runtime.commandReceipts[failed],rejected);
  for(let i=1;i<=3;i++)assert.equal(execute(p,'yard.buyGoodie',buy,'yard-v2:development-buy-'+i).status,200);
  assert.equal(p.yard.currencies.treats,0);assert.equal(p.yard.goodieInventory.leaf_pot,3);
  const bought=copy(p);assert.equal(execute(p,'yard.buyGoodie',buy,'yard-v2:development-buy-1',NOW+HOUR).replayed,true);assert.deepEqual(p,bought);
  const first=command(),second=command({slotId:'canonical:development-two',x:72,y:145});
  assert.equal(execute(p,'yard.placeGoodie',first,'yard-v2:canonical-v2/first').status,200);
  p=JSON.parse(JSON.stringify(p));
  assert.equal(execute(p,'yard.placeGoodie',second,'yard-v2:canonical-v2/second').status,200);
  const full=copy(p._yardV2.runtime.canonicalPlacements);
  assert.equal(execute(p,'yard.placeGoodie',command({slotId:'canonical:overflow',x:88,y:172}),'yard-v2:canonical-v2/overflow').status,400);
  assert.deepEqual(p._yardV2.runtime.canonicalPlacements,full);assert.equal(p.yard.goodieInventory.leaf_pot,1);
  assert.equal(execute(p,'yard.moveGoodie',command({x:88,y:172}),'yard-v2:canonical-v2/move').status,200);
  assert.equal(execute(p,'yard.pickupGoodie',command(),'yard-v2:canonical-v2/pickup').status,200);
  assert.equal(p.yard.goodieInventory.leaf_pot,2);assert.deepEqual(p._yardV2.runtime.canonicalPlacements,[second].map(row=>full.find(p=>p.slotId===row.slotId)));
  const once=copy(p);assert.equal(execute(p,'yard.pickupGoodie',command(),'yard-v2:canonical-v2/pickup').replayed,true);assert.deepEqual(p,once);
  const closedReplay=executePersistentYardAction(p,'yard.pickupGoodie',command(),yardDevelopmentOptions({now:NOW+HOUR,actionId:'yard-v2:canonical-v2/pickup'},closed));
  assert.equal(closedReplay.replayed,true);assert.deepEqual(p,once,'Previously committed receipt settles before a closed capability gate');
  assert.equal(execute(p,'yard.moveGoodie',command(),'yard-v2:canonical-v2/pickup').error,'ACTION_ID_PAYLOAD_CONFLICT');
  assert.deepEqual(outsideYard(p),outside);
});

test('shared bowl-1 uses real food purchases, stock, catalog servings and derived render states',t=>{
  const p=player(t);p.yard.currencies={treats:10000,shinyTreats:10000};
  const outside=copy(outsideYard(p)),bowlId='bowl-1';
  for(const foodId of ['kibble','berry_plate','bonito_bowl']){
    const food=YARD_FOODS[foodId],wallet=copy(p.yard.currencies),stock=p.yard.foodInventory[foodId]||0;
    const buy=execute(p,'yard.buyFood',{foodId,qty:1},'yard-v2:development-food-buy-'+foodId);
    assert.equal(buy.status,200);assert.equal(p.yard.foodInventory[foodId],stock+1);
    for(const currency of ['treats','shinyTreats'])assert.equal(p.yard.currencies[currency],wallet[currency]-(food.cost[currency]||0));
    assert.equal(execute(p,'yard.setFood',{foodId,bowlId},'yard-v2:development-food-fill-'+foodId).status,200);
    assert.equal(p.yard.foodInventory[foodId]||0,stock);
    const bowl=p.yard.bowls.find(row=>row.id===bowlId);assert.equal(bowl.foodId,foodId);assert.equal(bowl.servings,food.servings);
    const runtime=view(p);assert.equal(runtime.supportedBindings.foods[foodId].buy,true);assert.equal(runtime.supportedBindings.foods[foodId].set,true);
    assert.deepEqual(runtime.canonicalFoodState,selectCanonicalFoodState({yard:p.yard,yardRuntime:runtime}));assert.equal(runtime.canonicalFoodState.state,foodId);
    const once=copy(p);assert.equal(execute(p,'yard.setFood',{foodId,bowlId},'yard-v2:development-food-fill-'+foodId).replayed,true);assert.deepEqual(p,once);
  }
  assert.equal(view(p).supportedBindings.bowls['bowl-2'].set,false);
  const bowls=copy(p.yard.bowls),inventory=copy(p.yard.foodInventory);
  assert.equal(execute(p,'yard.setFood',{foodId:'kibble',bowlId:'bowl-2',enabled:true},'yard-v2:development-other-bowl').status,409);
  assert.deepEqual(p.yard.bowls,bowls);assert.deepEqual(p.yard.foodInventory,inventory);assert.deepEqual(outsideYard(p),outside);
});

test('storage v1 upgrades on current placement without changing archived input, prior receipts or retained pending intent identity',t=>{
  const p=player(t);assert.equal(p._yardV2.version,1);
  p.yard.currencies.treats=140;
  assert.equal(execute(p,'yard.buyGoodie',{goodieId:'leaf_pot'},'yard-v2:development-prior-buy').status,200);
  const migration=copy(p._yardV2.migration),legacyReceipts=copy(p._yardV2.legacyReceipts),prior=copy(p._yardV2.runtime.commandReceipts);
  const pending={action:'yard.placeGoodie',payload:{...CANONICAL_LOCATION,goodieId:'leaf_pot',slotId:'canonical:pending-v1',x:98,y:118},clientActionId:'yard-v2:canonical-v1/pending',accountId:p.id};
  const originalPending=copy(pending),hash=digest({action:pending.action,payload:pending.payload});
  const decision=execute(p,pending.action,pending.payload,pending.clientActionId);
  assert.equal(decision.error,'CANONICAL_COMMAND_SUPERSEDED');assert.equal(decision.status,400);
  assert.deepEqual(decision.details,{disposition:'retained-user-decision',actionId:pending.clientActionId,requestHash:hash,replacementScope:{...CANONICAL_FOOD_LOCATION}});
  assert.deepEqual(pending,originalPending);assert.equal(p.yard.goodieInventory.leaf_pot,1);
  assert.equal(p._yardV2.version,1);assert.equal(execute(p,'yard.placeGoodie',command(),'yard-v2:canonical-v2/current').status,200);
  assert.equal(p._yardV2.version,2);assert.deepEqual(p._yardV2.migration,migration);assert.deepEqual(p._yardV2.legacyReceipts,legacyReceipts);
  for(const [id,receipt] of Object.entries(prior))assert.deepEqual(p._yardV2.runtime.commandReceipts[id],receipt);
  const reloaded=JSON.parse(JSON.stringify(p)),before=copy(reloaded);
  assert.equal(execute(reloaded,pending.action,pending.payload,pending.clientActionId,NOW+HOUR).replayed,true);assert.deepEqual(reloaded,before);
  assert.equal(initializeReleasedPlayerYard(reloaded,{now:NOW}).status,200);assert.equal(view(reloaded).itemPlacementCapabilities.enabled,true);
});

test('canonical items never become saved visitors, food consumption, wear, gifts or photos on ordinary advancement',t=>{
  const p=player(t);p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.goodieInventory.leaf_pot=2;
  assert.equal(execute(p,'yard.placeGoodie',command(),'yard-v2:canonical-v2/no-visitor-one').status,200);
  assert.equal(execute(p,'yard.placeGoodie',command({slotId:'canonical:no-visitor-two',x:72,y:145}),'yard-v2:canonical-v2/no-visitor-two').status,200);
  const state=copy({rows:p._yardV2.runtime.canonicalPlacements,bowls:p.yard.bowls,food:p.yard.foodInventory,gifts:p.yard.pendingGifts,photos:p.yard.album.photos});
  assert.equal(initializeReleasedPlayerYard(p,{now:NOW+HOUR,simulate:true}).status,200);
  assert.deepEqual(p._yardV2.runtime.visits,{});assert.deepEqual(p.yard.activeVisitors,[]);
  assert.deepEqual({rows:p._yardV2.runtime.canonicalPlacements,bowls:p.yard.bowls,food:p.yard.foodInventory,gifts:p.yard.pendingGifts,photos:p.yard.album.photos},state);
});

test('real signed authentication and normal route handlers preserve owner fencing, reject dev auth, and ignore client enablement fields',async t=>{
  t.mock.method(Date,'now',()=>NOW);
  for(const [key,value] of Object.entries({NODE_ENV:'test',DEV_AUTH_ENABLED:'false',TELEGRAM_BOT_TOKEN:'123456:development-unit-test-token'})){
    const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});
  }
  assert.equal(getDb(),null);assert.equal(isRedisEnabled(),false);assert.equal(getIO(),null);
  const router=playerRoutes(requireAuth,resolveUser);
  const signed=id=>'tma '+sign({user:{id,first_name:'Development Test'}},process.env.TELEGRAM_BOT_TOKEN,new Date(NOW));
  async function request(method,path,{body={},authorization=signed(7101),query={}}={}) {
    const layer=router.stack.find(row=>row.route?.path===path&&row.route.methods[method]);assert.ok(layer);
    const req={method:method.toUpperCase(),body,query,headers:{authorization}},res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    for(const handler of layer.route.stack){let next=false;await handler.handle(req,res,error=>{if(error)throw error;next=true;});if(!next)break;}
    return {status:res.statusCode,body:res.body,req};
  }
  assert.equal((await request('get','/api/player/snapshot',{authorization:'dev forged'})).status,401);
  assert.equal((await request('get','/api/player/snapshot',{authorization:''})).status,401);
  const initial=await request('get','/api/player/snapshot',{query:{userId:'someone-else',canonicalItemPlacementEnabled:'false',yardPipPreview:'1'}});
  assert.equal(initial.status,200);assert.equal(initial.req.authenticatedUser.provider,'telegram');
  assert.equal(initial.body.player.id,'telegram:7101');assert.equal(initial.body.yardRuntime.itemPlacementCapabilities.enabled,true);
  await withPlayerLock('telegram:7101',p=>{p.yard.currencies.treats=140;});
  const buy={action:'yard.buyGoodie',payload:{goodieId:'leaf_pot'},clientActionId:'yard-v2:development-route-buy',accountId:'telegram:7101',userId:'someone-else',canonicalItemPlacementEnabled:false};
  const mismatch=await request('post','/api/player/mutate',{body:{...buy,accountId:'someone-else'}});assert.equal(mismatch.status,409);assert.equal(mismatch.body.error,'ACCOUNT_CHANGED');
  const bought=await request('post','/api/player/mutate',{body:buy});assert.equal(bought.status,200);assert.equal(bought.body.snapshot.yard.currencies.treats,0);assert.equal(bought.body.snapshot.yard.goodieInventory.leaf_pot,1);
  const place={action:'yard.placeGoodie',payload:command(),clientActionId:'yard-v2:canonical-v2/route-place',accountId:'telegram:7101'};
  const placed=await request('post','/api/player/mutate',{body:place});assert.equal(placed.status,200);assert.equal(placed.body.snapshot.yardRuntime.canonicalPlacements.length,1);
  const replay=await request('post','/api/player/mutate',{body:place});assert.equal(replay.body.duplicate,true);
  assert.equal(replay.body.snapshot.yardRuntime.canonicalPlacements.length,1);
  const other=await request('get','/api/player/snapshot',{authorization:signed(7102)});assert.equal(other.body.player.id,'telegram:7102');assert.equal(other.body.yardRuntime.canonicalPlacements.length,0);
  assert.equal((await request('post','/api/player/mutate',{authorization:signed(7102),body:place})).body.error,'ACCOUNT_CHANGED');
  assert.equal(getDb(),null);assert.equal(isRedisEnabled(),false);assert.equal(getIO(),null);
});

test('ordinary applyActionWithReceipt and buildSnapshot agree on source-owned capabilities with no test loader',async t=>{
  const p=player(t);p.yard.currencies.treats=140;
  const bought=await applyActionWithReceipt(p,'yard.buyGoodie',{goodieId:'leaf_pot'},{clientActionId:'yard-v2:development-exported-buy',serverNow:NOW});
  assert.equal(bought.status,200);assert.equal(bought.body.snapshot.yardRuntime.itemPlacementCapabilities.enabled,true);
  const placed=await applyActionWithReceipt(p,'yard.placeGoodie',command(),{clientActionId:'yard-v2:canonical-v2/exported-place',serverNow:NOW});
  assert.equal(placed.status,200);
  assert.deepEqual(buildSnapshot(p).yardRuntime.canonicalPlacements,placed.body.snapshot.yardRuntime.canonicalPlacements);
  assert.deepEqual(buildSnapshot(p).yardRuntime.foodLocationCapabilities,placed.body.snapshot.yardRuntime.foodLocationCapabilities);
});
