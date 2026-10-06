import test from 'node:test';
import assert from 'node:assert/strict';
import {ownsPlacement,pendingPlacement,retryablePlacement,placementCommand,recoverPlacement,LOCAL_PLACEMENT_ERRORS} from '../../src/games/companion-yard-v2/placement-recovery.mjs';

function fixture(){
  const session={},ghost={ownerAccountId:'owned',ownerSession:session,placing:true,slotId:'slot',goodieId:'sun_cushion',x:54,y:66,recoveryNonce:'yard-v2:owned'};
  const {action,payload}=placementCommand(ghost),item={accountId:'owned',clientActionId:ghost.recoveryNonce,action,payload,status:'pending',attempts:0};
  return{ghost,item,state:{accountSession:session,snapshot:{player:{id:'owned'}},pendingActions:[item],outboxStorageError:'OUTBOX_STORAGE_UNAVAILABLE'}};
}
test('local recovery uses the existing item and excludes UI ownership metadata from commands',()=>{
  const {state,ghost,item}=fixture();assert.equal(retryablePlacement(state,ghost),item);
  assert.deepEqual(placementCommand(ghost),{action:'yard.placeGoodie',payload:{slotId:'slot',goodieId:'sun_cushion',x:54,y:66}});
  ghost.placing=false;assert.equal(retryablePlacement(state,ghost),null);
});
test('retry rejects a changed ghost or signed payload without replacing either',()=>{
  for(const changed of [{x:53},{y:67},{slotId:'other'},{goodieId:'moon_lamp'}]){
    const {state,ghost}=fixture(),before=structuredClone(state.pendingActions);assert.equal(retryablePlacement(state,{...ghost,...changed}),null);assert.deepEqual(state.pendingActions,before);
  }
  const {state,ghost,item}=fixture();item.payload.extra=true;assert.equal(retryablePlacement(state,ghost),null);
});
test('account identity and A to B to A session changes reject retry',()=>{
  const {state,ghost}=fixture();assert.equal(ownsPlacement(state,ghost),true);
  state.snapshot.player.id='foreign';assert.equal(pendingPlacement(state,ghost),null);
  state.snapshot.player.id='owned';state.accountSession={};assert.equal(retryablePlacement(state,ghost),null);
});
test('only one matching outbox item may be explicitly resumed',()=>{
  const {state,ghost,item}=fixture();state.pendingActions.push({...item,clientActionId:'yard-v2:other',action:'garden.sync'});assert.equal(retryablePlacement(state,ghost),null);
  state.pendingActions[1].status='failed';assert.equal(retryablePlacement(state,ghost),item);
  ghost.recoveryNonce='yard-v2:stale';assert.equal(retryablePlacement(state,ghost),null);
});
test('already persisted, paused, failed and unknown-state commands do not expose storage retry',()=>{
  for(const status of ['rollout-paused','failed','unknown']){const {state,ghost,item}=fixture();item.status=status;assert.equal(retryablePlacement(state,ghost),null);}
  const {state,ghost,item}=fixture();state.outboxStorageError=null;assert.equal(retryablePlacement(state,ghost),null);
  state.outboxStorageError='OUTBOX_STORAGE_UNAVAILABLE';item.requiresYardResume=true;assert.equal(retryablePlacement(state,ghost),null);
});
test('a failed pre-send journal write can leave sending status without permitting a new nonce',()=>{
  const {state,ghost,item}=fixture();item.status='sending';item.attempts=1;assert.equal(retryablePlacement(state,ghost),item);
  assert.equal(item.clientActionId,'yard-v2:owned');assert.deepEqual([...LOCAL_PLACEMENT_ERRORS].sort(),['ACCOUNT_CHANGED','ACCOUNT_REQUIRED','OUTBOX_STORAGE_INVALID','OUTBOX_STORAGE_UNAVAILABLE']);
});
test('pure helper reconstructs only the owned pending placement, without writing the store',()=>{
  const {state,ghost,item}=fixture(),before=structuredClone(state.pendingActions);
  assert.deepEqual(recoverPlacement(state),ghost);assert.equal(retryablePlacement(state,recoverPlacement(state)),item);assert.deepEqual(state.pendingActions,before);
  state.snapshot.player.id='foreign';assert.equal(recoverPlacement(state),null);
  state.snapshot.player.id='owned';item.payload.x=NaN;assert.equal(recoverPlacement(state),null);
});

const location={locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1'};
function canonicalFixture(placing=true){
 const value=fixture();Object.assign(value.ghost,location,{slotId:'canonical:owned',goodieId:'leaf_pot',x:98,y:118,placing,recoveryNonce:'yard-v2:canonical-v1/owned'});
 Object.assign(value.item,placementCommand(value.ghost),{clientActionId:value.ghost.recoveryNonce});return value;
}
test('canonical recovery keeps all three versioned identity fields and exact action shape',()=>{
 for(const placing of[true,false]){
  const {state,ghost,item}=canonicalFixture(placing);assert.equal(pendingPlacement(state,ghost),item);assert.deepEqual(recoverPlacement(state),ghost);
  assert.deepEqual(placementCommand(ghost),{action:placing?'yard.placeGoodie':'yard.moveGoodie',payload:{slotId:'canonical:owned',...(placing?{goodieId:'leaf_pot'}:{}),x:98,y:118,...location}});
  for(const changed of[{locationId:'elsewhere'},{locationVersion:2},{geometryRevision:'future'},{x:99},{slotId:'canonical:other'}])assert.equal(pendingPlacement(state,{...ghost,...changed}),null);
  item.payload.extra=1;assert.equal(recoverPlacement(state),null);
 }
});
test('canonical blocked and paused intents are immutable and never expose a new submission',()=>{
 for(const status of['canonical-blocked','rollout-paused']){
  const {state,ghost,item}=canonicalFixture();item.status=status;item.requiresYardResume=true;
  const original=structuredClone(item);assert.equal(pendingPlacement(state,ghost),item);assert.equal(retryablePlacement(state,ghost),null);assert.equal(recoverPlacement(state),null);assert.deepEqual(item,original);
 }
});
