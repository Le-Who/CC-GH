import test from 'node:test';import assert from 'node:assert/strict';import{setTimeout as delay}from'node:timers/promises';
import{withPlayerLock}from'../playerManager.js';
import{fixture}from'./fixtures/canonical-reconciliation-fixture.mjs';
import{initializeReleasedPlayerYard,executeReleasedYardAction,releasedYardSnapshot}from'../game-logic/yard-v2/player-release.mjs';
import{closeCanonicalRuntime}from'../game-logic/yard-v2/canonical-runtime.mjs';
import{YARD_FOODS}from'../game-logic/yard-v2/catalog.mjs';
test('normal source food commands wait without receipt, debit once, cold-replay replacement, preserve departure and gift',async t=>{
 const originalNow=Date.now;let now=1001;Date.now=()=>now;t.after(async()=>{await closeCanonicalRuntime();Date.now=originalNow;});const id='normal-food-command-pip';
 await withPlayerLock(id,p=>fixture(p));
 let initial;
 await withPlayerLock(id,p=>{initial=structuredClone(p.yard);const result=executeReleasedYardAction(p,'yard.buyFood',{foodId:'kibble',qty:1},{now,actionId:'yard-v2:pending-buy'});assert.equal(result.status,409);assert.equal(result.error,'CANONICAL_ACTION_RECONCILIATION_PENDING');assert.equal(p._yardV2.runtime.commandReceipts['yard-v2:pending-buy'],undefined);assert.deepEqual(p.yard.foodInventory,initial.foodInventory);assert.deepEqual(p.yard.currencies,initial.currencies);});
 async function ready(){const end=performance.now()+40000;while(performance.now()<end){let view;await withPlayerLock(id,p=>{initializeReleasedPlayerYard(p,{now,simulate:true});view=releasedYardSnapshot(p,{now}).yardRuntime;});if(view.status==='ready'&&view.canonicalVisits.length)return view;await delay(30);}throw Error('FOOD_RUNTIME_READY_TIMEOUT');}
 const first=await ready(),plan=first.canonicalVisits[0].plan;
 await withPlayerLock(id,p=>{const result=executeReleasedYardAction(p,'yard.buyFood',{foodId:'kibble',qty:1},{now,actionId:'yard-v2:pending-buy'});assert.equal(result.status,200,JSON.stringify(result));assert.equal(p.yard.foodInventory.kibble,initial.foodInventory.kibble+1);assert.equal(p.yard.currencies.treats,initial.currencies.treats-YARD_FOODS.kibble.cost.treats);});
 await withPlayerLock(id,p=>{const result=executeReleasedYardAction(p,'yard.setFood',{foodId:'kibble',bowlId:'bowl-1'},{now,actionId:'yard-v2:fill-one'});assert.equal(result.status,200,JSON.stringify(result));assert.equal(p.yard.foodInventory.kibble,initial.foodInventory.kibble);assert.equal(p.yard.bowls[0].servings,YARD_FOODS.kibble.servings);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);const view=releasedYardSnapshot(p,{now}).yardRuntime;assert.equal(view.status,'ready');assert.equal(view.canonicalVisits.length,1);assert.equal(view.canonicalFoodActions.enabled,true);assert.equal(view.mutable,false);});
 now=1002;await withPlayerLock(id,p=>{const before=structuredClone({yard:p.yard,runtime:p._yardV2.runtime});const result=executeReleasedYardAction(p,'yard.setFood',{foodId:'kibble',bowlId:'bowl-1'},{now,actionId:'yard-v2:fill-one'});assert.equal(result.status,200);assert.equal(result.replayed,true);assert.deepEqual({yard:p.yard,runtime:p._yardV2.runtime},before);});
 await closeCanonicalRuntime();await ready();
 await withPlayerLock(id,p=>{const wrapper=Object.values(p._yardV2.runtime.canonicalVisits)[0];assert.equal(wrapper.lastFoodActionId,'yard-v2:fill-one');assert.equal(wrapper.foodActionSequence,1);assert.equal(wrapper.leavesAt,plan.leavesAt);assert.equal(p.yard.bowls[0].servings,YARD_FOODS.kibble.servings);});
 now=plan.leavesAt;await withPlayerLock(id,p=>{initializeReleasedPlayerYard(p,{now,simulate:true});assert.equal(p.yard.activeVisitors.length,0);assert.equal(p.yard.pendingGifts.filter(g=>g.createdAt===plan.leavesAt).length,1);assert.equal(p._yardV2.runtime.canonicalPlacements[0].uses,1);});
 await withPlayerLock(id,p=>{initializeReleasedPlayerYard(p,{now,simulate:true});assert.equal(p.yard.pendingGifts.filter(g=>g.createdAt===plan.leavesAt).length,1);});
});
