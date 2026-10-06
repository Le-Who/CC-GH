/** Finite actual route calls after domain/outbox qualification. Only source-owned
 * inactive gates are opened in this process; no HTTP listener or DB is started. */
import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const gates=new Map([
 [new URL('../game-logic/yard-v2/canonical-locations.mjs',import.meta.url).href,['export const CANONICAL_ITEM_PLACEMENT_ENABLED = false;','export const CANONICAL_ITEM_PLACEMENT_ENABLED = true;']],
 [new URL('../game-logic/yard-v2/canonical-food-protocol.mjs',import.meta.url).href,['export const CANONICAL_FOOD_LOCATION_ENABLED=false;','export const CANONICAL_FOOD_LOCATION_ENABLED=true;']],
]);
registerHooks({load(u,c,next){const gate=gates.get(u);if(!gate)return next(u,c);const source=readFileSync(new URL(u),'utf8');assert.equal(source.split(gate[0]).length,2);return{shortCircuit:true,format:'module',source:source.replace(...gate)};}});
const {applyActionWithReceipt,buildSnapshot}=await import('../routes/player.js');
const {createDefaultPlayer}=await import('../game-logic/player.js');
const {ensurePersistentPlayerYard}=await import('../game-logic/yard-v2/service.mjs');
const {CANONICAL_LOCATION}=await import('../game-logic/yard-v2/canonical-locations.mjs');
const {CANONICAL_FOOD_LOCATION}=await import('../game-logic/yard-v2/canonical-food-contract.mjs');
const {prior}=await import('./helpers/yard-food-prior-binary.mjs');
const NOW=1791288000000,command=(v2=true,extra={})=>({...v2?CANONICAL_FOOD_LOCATION:CANONICAL_LOCATION,slotId:'canonical:api-food',goodieId:'leaf_pot',x:98,y:118,...extra});
function player(t){t.mock.method(Date,'now',()=>NOW);const p=createDefaultPlayer('food-api','Owner',NOW);p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.goodieInventory.leaf_pot=2;ensurePersistentPlayerYard(p,{now:NOW});buildSnapshot(p);return p;}
const request=(p,action,payload,clientActionId)=>applyActionWithReceipt(p,action,payload,{clientActionId,serverNow:NOW});

test('every canonical nonce family is reserved before generic or special-domain dispatch',async t=>{
 const p=player(t),before=structuredClone(p);
 for(const action of ['match3.syncMode','garden.r2.reconcile','garden.r2','merge.lab','yard.buyFood'])for(const nonce of ['yard-v2:canonical-v2/generic','yard-v2:canonical-v2/bad/tail',' yard-v2:canonical-v2/space','yard-v2:canonical-v99/future']){
  const result=await request(p,action,{foodId:'kibble',savedModes:{classic:{score:99}}},nonce);assert.equal(result.status,409);assert.equal(result.body.error,'CANONICAL_ACTION_UNSUPPORTED');assert.deepEqual(p,before);
 }
});

test('actual API commits and replays once with current v2 capability, then refuses stale v1 with retained decision evidence',async t=>{
 let p=player(t);const initial=structuredClone(p),nonce='yard-v2:canonical-v2/place',payload=command();
 const placed=await request(p,'yard.placeGoodie',payload,nonce);assert.equal(placed.status,200);assert.equal(placed.body.snapshot.yardRuntime.itemPlacementCapabilities.geometryRevision,CANONICAL_FOOD_LOCATION.geometryRevision);assert.equal(placed.body.snapshot.yardRuntime.itemPlacementCapabilities.visitAdmission,false);assert.equal(p.yard.goodieInventory.leaf_pot,1);
 p=JSON.parse(JSON.stringify(p));const once=structuredClone(p),replay=await request(p,'yard.placeGoodie',payload,nonce);assert.equal(replay.body.duplicate,true);assert.deepEqual(p,once);assert.equal(replay.body.snapshot.yardRuntime.itemPlacementCapabilities.actionNoncePrefix,'yard-v2:canonical-v2/');
 const rejected=await request(p,'yard.moveGoodie',command(false,{x:72,y:145}),'yard-v2:canonical-v1/stale');assert.equal(rejected.status,400);assert.equal(rejected.body.error,'CANONICAL_COMMAND_SUPERSEDED');assert.equal(rejected.body.details.disposition,'retained-user-decision');assert.equal(rejected.body.details.actionId,'yard-v2:canonical-v1/stale');assert.equal(p._yardV2.runtime.canonicalPlacements[0].x,98);
 assert.deepEqual(p.yard.bowls,initial.yard.bowls);assert.deepEqual(p.yard.foodInventory,initial.yard.foodInventory);assert.deepEqual(p.yard.currencies,initial.yard.currencies);assert.deepEqual(p._yardV2.runtime.visits,initial._yardV2.runtime.visits);
 assert.equal((await request(p,'match3.syncMode',{},nonce)).body.error,'ACTION_ID_PAYLOAD_CONFLICT');
});

test('actual API settles historical committed v1 nonce before geometry gate and returns current food capability',async t=>{
 const p=player(t),payload=command(false),nonce='yard-v2:canonical-v1/historical';
 const committed=prior.executePersistentYardAction(p,'yard.placeGoodie',payload,{now:NOW,actionId:nonce,canonicalItemPlacementEnabled:true});assert.equal(committed.status,200);const before=structuredClone(p);
 const replay=await request(p,'yard.placeGoodie',payload,nonce);assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);assert.equal(replay.body.snapshot.yardRuntime.itemPlacementCapabilities.geometryRevision,CANONICAL_FOOD_LOCATION.geometryRevision);assert.deepEqual(p,before);
 const collision=await request(p,'yard.moveGoodie',command(true,{x:80,y:82}),'yard-v2:canonical-v2/food-collision');assert.equal(collision.status,400);assert.equal(collision.body.error,'CANONICAL_FOOD_REGION_RESERVED');assert.equal(p._yardV2.runtime.canonicalPlacements[0].x,98);
});
