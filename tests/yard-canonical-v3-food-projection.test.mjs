import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalFoodCapabilities,selectCanonicalFoodState} from '../game-logic/yard-v2/canonical-food-contract.mjs';
import {CANONICAL_VISIT_PRESENTATION_PROTOCOL} from '../game-logic/yard-v2/canonical-visit-placement-contract.mjs';
import {request} from './fixtures/canonical-visit-worker-input.mjs';
function snapshot(){const input=request().input;return {yard:{placedGoodies:[],bowls:[input.bowl]},yardRuntime:{version:1,status:'ready',canonicalPlacements:input.rows,foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true})}};}
test('explicit v3 projection supports genuine post-use row without changing v1/v2 uses-zero contract',()=>{
 const s=snapshot();assert.equal(selectCanonicalFoodState(s).state,'kibble');s.yardRuntime.canonicalPlacements[0].uses=1;
 assert.equal(selectCanonicalFoodState(s).reason,'CANONICAL_AUTHORITATIVE_LAYOUT_INVALID');
 Object.assign(s.yardRuntime,{storageVersion:3,canonicalVisitProtocol:CANONICAL_VISIT_PRESENTATION_PROTOCOL});
 assert.equal(selectCanonicalFoodState(s).state,'kibble');assert.equal(s.yardRuntime.canonicalPlacements[0].uses,1);
});
test('unknown presentation versions and invalid consumed rows remain unavailable',()=>{
 const s=snapshot();Object.assign(s.yardRuntime,{storageVersion:4});assert.equal(selectCanonicalFoodState(s).available,false);
 s.yardRuntime.storageVersion=3;assert.equal(selectCanonicalFoodState(s).available,false);
 s.yardRuntime.canonicalVisitProtocol=CANONICAL_VISIT_PRESENTATION_PROTOCOL;
 for(const uses of [-1,8,1.5,'1']){s.yardRuntime.canonicalPlacements[0].uses=uses;assert.equal(selectCanonicalFoodState(s).available,false);}
 s.yardRuntime.canonicalPlacements[0].uses=1;s.yardRuntime.canonicalPlacements[0].condition='worn';assert.equal(selectCanonicalFoodState(s).available,false);
});
