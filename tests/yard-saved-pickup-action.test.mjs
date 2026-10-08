import {canonicalSavedPickupCapability,canonicalSavedPickupNewIntentAllowed,canonicalSavedPickupReplayAllowed} from '../src/game-state/canonicalSavedPickupProtocol.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {withPlayerLock,afterPlayerCommit} from '../playerManager.js';
import {fixture,row} from './fixtures/canonical-reconciliation-fixture.mjs';
import {ensureCanonicalPlayerYard,executeCanonicalYardAction,publicCanonicalPlayerYard,closeCanonicalRuntime} from '../game-logic/yard-v2/canonical-runtime.mjs';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from '../game-logic/yard-v2/canonical-food-protocol.mjs';

for(const [minutes,seed] of [[45,null],[60,'long-stay:1703'],[65,'zero-row-hour:974'],[110,'zero-row-long:498']])test(`actual ${minutes}-minute visit pickup commits once, projects coherently and cold-replays`,async t=>{
 const owner='actual-released-pickup-'+minutes,oldNow=Date.now;let now=1001;Date.now=()=>now;
 t.after(async()=>{await closeCanonicalRuntime();Date.now=oldNow;});
 await withPlayerLock(owner,p=>{fixture(p);if(seed)p._yardV2.runtime.seed=seed;});
 async function ready(){const end=performance.now()+45000;while(performance.now()<end){let view;await withPlayerLock(owner,p=>{ensureCanonicalPlayerYard(p,{now,simulate:true});view=publicCanonicalPlayerYard(p,{now});});if(view.status==='ready'&&view.canonicalVisits?.length)return view;await delay(20);}throw Error('PICKUP_VISIT_READY_TIMEOUT');}
 const initial=await ready(),plan=initial.canonicalVisits[0].plan;
 const client=view=>({player:{id:owner},yardRuntime:view});
 assert.ok(canonicalSavedPickupCapability(client(initial)),'actual server advertisement is accepted by the strict client');
 assert.equal(plan.leavesAt-plan.arrivedAt,minutes*60000);
 assert.deepEqual(initial.itemPlacementCapabilities.actions,['yard.pickupGoodie']);
 assert.equal(initial.itemPlacementCapabilities.items.leaf_pot.place,false);
 assert.equal(initial.itemPlacementCapabilities.items.leaf_pot.move,false);
 assert.deepEqual(initial.itemPlacementCapabilities.pickupReadySlotIds,[]);
 const actionId=CANONICAL_FOOD_NONCE_PREFIX+'actual-pickup',payload={...CANONICAL_FOOD_LOCATION,slotId:row.slotId};
 now=plan.releaseAt-1;
 await withPlayerLock(owner,p=>{
  const result=executeCanonicalYardAction(p,'yard.pickupGoodie',payload,{now,actionId});
  assert.equal(result.error,'CANONICAL_TARGET_RESERVED');
  assert.equal(p._yardV2.runtime.commandReceipts[actionId],undefined);
  assert.equal(p._yardV2.runtime.canonicalPlacements.length,1);
 });
 now=plan.releaseAt;
 let before,committed;
 await withPlayerLock(owner,p=>{before=structuredClone({yard:p.yard,runtime:p._yardV2.runtime});const view=publicCanonicalPlayerYard(p,{now});assert.deepEqual(view.itemPlacementCapabilities.pickupReadySlotIds,[row.slotId]);assert.equal(canonicalSavedPickupNewIntentAllowed(client(view),'yard.pickupGoodie',payload),true);});
 const results=await Promise.all([0,1].map(()=>withPlayerLock(owner,p=>{
  const result=executeCanonicalYardAction(p,'yard.pickupGoodie',payload,{now,actionId});
  assert.equal(result.status,200,result.error);
  afterPlayerCommit(p,winning=>{committed=publicCanonicalPlayerYard(winning,{now});},{beforeSync:true});
  return result;
 })));
 assert.equal(results.filter(result=>result.replayed).length,1);
 assert.equal(committed.status,'ready',JSON.stringify(committed));
 assert.deepEqual(committed.canonicalPlacements,[]);
 assert.deepEqual(committed.itemPlacementCapabilities.pickupReadySlotIds,[]);
 assert.equal(canonicalSavedPickupNewIntentAllowed(client(committed),'yard.pickupGoodie',payload),false);
 assert.equal(canonicalSavedPickupReplayAllowed({accountId:owner,action:'yard.pickupGoodie',payload,clientActionId:actionId},client(committed)),true);
 assert.deepEqual(committed.canonicalVisits[0].plan,plan);
 await withPlayerLock(owner,p=>{
  assert.equal(p.yard.goodieInventory.leaf_pot,(before.yard.goodieInventory.leaf_pot||0)+1);
  assert.deepEqual(p.yard.currencies,before.yard.currencies);
  assert.deepEqual(p.yard.bowls,before.yard.bowls);
  assert.equal(p.yard.activeVisitors[0].leavesAt,plan.leavesAt);
  assert.equal(p._yardV2.runtime.commandReceipts[actionId].action,'yard.pickupGoodie');
  const second=executeCanonicalYardAction(p,'yard.pickupGoodie',payload,{now,actionId:actionId+'-second'});
  assert.equal(second.status,400);assert.equal(second.error,'CANONICAL_SLOT_NOT_FOUND');
  assert.equal(p.yard.goodieInventory.leaf_pot,(before.yard.goodieInventory.leaf_pot||0)+1);
 });
 await closeCanonicalRuntime();
 await withPlayerLock(owner,p=>{
  const before=JSON.stringify({yard:p.yard,runtime:p._yardV2.runtime});
  const replay=executeCanonicalYardAction(p,'yard.pickupGoodie',payload,{now:plan.leavesAt+100000,actionId});
  assert.equal(replay.replayed,true,replay.error);
  assert.equal(JSON.stringify({yard:p.yard,runtime:p._yardV2.runtime}),before);
  assert.equal(executeCanonicalYardAction(p,'yard.pickupGoodie',{...payload,slotId:'canonical:other'},{now,actionId}).error,'ACTION_ID_PAYLOAD_CONFLICT');
 });
 const cold=await ready();assert.deepEqual(cold.canonicalPlacements,[]);assert.deepEqual(cold.canonicalVisits[0].plan,plan);
 if(minutes>60){
  now=Math.max(now,plan.arrivedAt+3600000);
  await withPlayerLock(owner,p=>{
   assert.equal(ensureCanonicalPlayerYard(p,{now,simulate:true}).status,200);
   const hour=Object.values(p._yardV2.runtime.canonicalVisitReceipts).find(r=>r.at===plan.arrivedAt+3600000);
   assert.ok(hour,'original source hourly opportunity is retained');
   assert.equal(hour.reason,minutes===65?'NO_PLACED_TARGET':'TARGET_CAPACITY_RESERVED');
   assert.equal(p._yardV2.runtime.nextOpportunityAt,plan.arrivedAt+7200000);
  });
 }
 now=plan.leavesAt;
 await withPlayerLock(owner,p=>{
  assert.equal(ensureCanonicalPlayerYard(p,{now,simulate:true}).status,200);
  assert.equal(p.yard.activeVisitors.length,0);assert.equal(p.yard.pendingGifts.length,1);
  assert.equal(p.yard.pendingGifts[0].createdAt,plan.leavesAt);
  const gift=structuredClone(p.yard.pendingGifts);
  assert.equal(ensureCanonicalPlayerYard(p,{now,simulate:true}).status,200);
  assert.deepEqual(p.yard.pendingGifts,gift);
 });
});
