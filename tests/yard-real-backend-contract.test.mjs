import test from 'node:test';
import assert from 'node:assert/strict';
import {requireDisposableBackend,requireExternalId,selectCurrentFixture,FIXED_SEED,TEST_REFILL_FOOD_ID} from '../scripts/yard-real-backend-contract.mjs';
import {createDefaultYardState} from '../game-logic/yard.js';
import {YARD_FOODS} from '../game-logic/yard-v2/catalog.mjs';
const env={NODE_ENV:'test',YARD_SAVED_VISIT_PG:'1',DEV_AUTH_ENABLED:'true',DATABASE_URL:'postgres://ccgh_visit_test@127.0.0.1:55437/ccgh_visit_test',REDIS_URL:''};
test('ephemeral setup refuses every broader DB/server/environment destination',()=>{
 assert.equal(requireDisposableBackend(env),'http://127.0.0.1:3199');
 for(const patch of [{NODE_ENV:'production'},{YARD_SAVED_VISIT_PG:''},{DEV_AUTH_ENABLED:''},{REDIS_URL:'redis://127.0.0.1'},
  {DATABASE_URL:'postgres://ccgh_visit_test@127.0.0.1:5432/ccgh_visit_test'},
  {DATABASE_URL:'postgres://ccgh_visit_test@database.example:55437/ccgh_visit_test'},
  {DATABASE_URL:'postgres://ccgh_visit_test@127.0.0.1:55437/production'},
  {DATABASE_URL:'postgres://ccgh_visit_test:secret@127.0.0.1:55437/ccgh_visit_test'}])assert.throws(()=>requireDisposableBackend({...env,...patch}));
 assert.throws(()=>requireDisposableBackend(env,'https://production.example'));
 assert.throws(()=>requireDisposableBackend(env,'http://127.0.0.1:3199/?enable=true'));
 assert.equal(requireExternalId('saved-pip-real-example_1'),'saved-pip-real-example_1');assert.throws(()=>requireExternalId('owner'));
});
test('fixed seed produces a current-time genuine source Pip selection, no handcrafted saved record',()=>{
 for(const now of [1791357900000,1791357960123,Date.now()]){
  const selected=selectCurrentFixture(now);assert.equal(selected.seed,FIXED_SEED);
  assert.equal(selected.candidate.visitorId,'pip_hamster');assert.equal(selected.candidate.activityId,'peek');
  assert.equal(selected.candidate.leavesAt-selected.at,45*60000);
  assert.ok(selected.at>=now-120000&&selected.at<now-60000);assert.equal(selected.row.uses,0);
  assert.equal(selected.row.placedAt,selected.at-1);assert.equal(selected.plan,undefined);assert.equal(selected.record,undefined);
  assert.deepEqual(selectCurrentFixture(now),selected);
 }
});
test('real buy/refill target is source-affordable using the untouched default wallet',()=>{
 const yard=createDefaultYardState(1791357900000),before=structuredClone(yard),food=YARD_FOODS[TEST_REFILL_FOOD_ID];
 assert.equal(TEST_REFILL_FOOD_ID,'bonito_bowl');assert.deepEqual(yard.currencies,{treats:80,shinyTreats:3});
 assert.deepEqual(food.cost,{treats:0,shinyTreats:2});
 for(const currency of ['treats','shinyTreats'])assert.ok(yard.currencies[currency]>=(food.cost[currency]||0));
 assert.deepEqual(yard,before);
});
