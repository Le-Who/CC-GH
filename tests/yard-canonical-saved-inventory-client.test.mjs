import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalSavedActionCapability as capability,canonicalSavedActionReplayAllowed as replay,canonicalSavedActionPendingResult as pending,canonicalSavedActionResumeWitness as witness} from '../src/game-state/canonicalSavedActionProtocol.mjs';
const food=['yard.buyFood','yard.setFood'],inventory=['yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter'];
const snapshot=()=>({player:{id:'owner'},yardRuntime:{version:1,storageVersion:3,canonicalVisitProtocol:'yard-canonical-authoritative/v1',status:'ready',mutable:false,serverNow:1001,actionProtocol:'yard-v2:',canonicalFoodActions:{protocol:'yard-canonical-food-actions/v1',enabled:true,actions:food},canonicalInventoryActions:{protocol:'yard-canonical-inventory-actions/v1',enabled:true,actions:inventory},supportedActions:[...food,...inventory],supportedBindings:{goodies:{leaf_pot:{buy:true}},foods:{kibble:{buy:true,set:true}},bowls:{'bowl-1':{set:true}}}}});
const item=(action,payload)=>({accountId:'owner',clientActionId:'yard-v2:inventory',action,payload});
test('explicit saved inventory scope allows exact source commands and durable replay without rechecking consumed stock',()=>{
 const s=snapshot();assert(capability(s));
 for(const i of [item('yard.buyGoodie',{goodieId:'leaf_pot'}),item('yard.collectGifts',{}),item('yard.claimDailyLetter',{})]){
  assert(replay(i,s));assert(replay(i,witness(s)));assert(pending(i,{error:'CANONICAL_ACTION_RECONCILIATION_PENDING',_httpStatus:409}));
 }
});
test('unknown capability, payload expansion, account mismatch and disabled binding do not grant inventory authority',()=>{
 for(const mutate of [s=>s.yardRuntime.supportedActions.push('yard.configureCompanion'),s=>s.yardRuntime.canonicalInventoryActions.enabled=false,s=>s.yardRuntime.canonicalInventoryActions.actions.pop(),s=>s.yardRuntime.canonicalInventoryActions.extra=true]){
  const s=snapshot();mutate(s);assert.equal(capability(s),false);
 }
 const s=snapshot();for(const i of [item('yard.collectGifts',{amount:999}),item('yard.buyGoodie',{goodieId:'leaf_pot',qty:2}),item('yard.configureCompanion',{}),{...item('yard.collectGifts',{}),accountId:'other'}])assert.equal(replay(i,s),false);
 s.yardRuntime.supportedBindings.goodies.leaf_pot.buy=false;assert.equal(replay(item('yard.buyGoodie',{goodieId:'leaf_pot'}),s),false);
});
