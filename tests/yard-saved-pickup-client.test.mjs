import test from 'node:test';import assert from 'node:assert/strict';
import {pickupSnapshot,pickupScene,RELEASE,LEAVES} from './fixtures/saved-pickup-client-snapshot.mjs';
import {canonicalSavedPickupCapability as capability,canonicalSavedPickupNewIntentAllowed as allowed,canonicalSavedPickupReplayAllowed as replay} from '../src/game-state/canonicalSavedPickupProtocol.mjs';
import {canonicalCapability,canonicalCommandScope,canonicalNoncePrefix,canonicalReplayCapability} from '../src/game-state/canonicalYardProtocol.mjs';
import {canonicalSavedActionCapability,canonicalSavedActionResumeWitness,canonicalSavedActionReplayAllowed} from '../src/game-state/canonicalSavedActionProtocol.mjs';
import {canonicalSavedPickupCommandAllowed} from '../src/games/companion-yard-v2/canonical-saved-pickup-actions.mjs';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from '../game-logic/yard-v2/canonical-food-protocol.mjs';
const payload={...CANONICAL_FOOD_LOCATION,slotId:'canonical:a'},ACTION='yard.pickupGoodie';
const item={accountId:'pickup-owner',action:ACTION,clientActionId:CANONICAL_FOOD_NONCE_PREFIX+'exact-pickup',payload};
test('saved support grants only released pickup and preserves the existing exact v2 command scope',()=>{
 const s=pickupSnapshot();assert(capability(s));assert(canonicalCapability(s,ACTION));assert.equal(s.yardRuntime.mutable,false);
 assert(allowed(s,ACTION,payload));assert.deepEqual(canonicalCommandScope(s),CANONICAL_FOOD_LOCATION);assert.equal(canonicalNoncePrefix(s),CANONICAL_FOOD_NONCE_PREFIX);
 for(const action of ['yard.placeGoodie','yard.moveGoodie','yard.fixGoodie']){assert.equal(canonicalCapability(s,action),null);assert.equal(allowed(s,action,payload),false);}
 assert(canonicalReplayCapability(s,ACTION,item.clientActionId));assert.equal(canonicalReplayCapability(s,ACTION,'yard-v2:canonical-v1/old'),false);
});
test('new intents require the authoritative release window and target, while exact retries survive removal and departure',()=>{
 for(const s of [pickupSnapshot({now:RELEASE-1}),pickupSnapshot({removed:true}),pickupSnapshot({now:LEAVES,removed:true,departed:true})]){
  assert(capability(s));assert.equal(allowed(s,ACTION,payload),false);assert(replay(item,s));
 }
 assert.equal(replay({...item,accountId:'other'},pickupSnapshot()),false);
 assert.equal(replay({...item,clientActionId:'yard-v2:canonical-v1/old'},pickupSnapshot()),false);
 assert.equal(replay({...item,payload:{...payload,amount:2}},pickupSnapshot()),false);
 assert.equal(allowed(pickupSnapshot(),ACTION,{...payload,slotId:'canonical:foreign'}),false);
});
test('expanded or malformed grants never become broad editable Yard authority',()=>{
 for(const mutate of [s=>s.yardRuntime.mutable=true,s=>s.yardRuntime.status='reconciliation-pending',s=>s.yardRuntime.error='x',
  s=>s.yardRuntime.canonicalPickupActions.actions.push('yard.placeGoodie'),s=>s.yardRuntime.canonicalPickupActions.extra=true,
  s=>s.yardRuntime.supportedActions.push('yard.configureCompanion'),s=>s.yardRuntime.supportedBindings.goodies.leaf_pot.move=true,
  s=>s.yardRuntime.supportedActions.pop(),s=>s.yardRuntime.supportedBindings.goodies.leaf_pot.pickup=false,
  s=>s.yardRuntime.itemPlacementCapabilities.items.other={pickup:true},s=>s.yardRuntime.supportedBindings.goodies.other={place:false,move:true,fix:false,pickup:false},
  s=>s.yardRuntime.itemPlacementCapabilities.items.leaf_pot.move=true,s=>s.yardRuntime.itemPlacementCapabilities.enabled=false,
  s=>s.yardRuntime.itemPlacementCapabilities.geometryRevision='unknown',s=>s.yardRuntime.itemPlacementCapabilities.replayNoncePrefixes.push('yard-v2:canonical-v1/'),
  s=>s.yardRuntime.canonicalPlacements[0].uses=8,s=>s.yardRuntime.canonicalVisits[0].plan.releaseAt--,
  s=>s.yardRuntime.canonicalVisits[0].plan.format='unknown',s=>s.yardRuntime.canonicalVisits[0].plan.profile='other-actor',
  s=>s.yardRuntime.targetReserved=true,s=>s.yardRuntime.itemPlacementCapabilities.pickupReadySlotIds=['canonical:foreign']]){
  const s=pickupSnapshot();mutate(s);assert.equal(capability(s),null);assert.equal(canonicalCapability(s,ACTION),null);
 }
});
test('pickup advertisement keeps existing food/inventory capabilities and their replay witnesses intact',()=>{
 const s=pickupSnapshot();assert(canonicalSavedActionCapability(s));const witness=canonicalSavedActionResumeWitness(s);
 for(const action of ['yard.collectGifts','yard.claimDailyLetter'])assert(canonicalSavedActionReplayAllowed({accountId:s.player.id,clientActionId:'yard-v2:old-inventory',action,payload:{}},witness));
 assert(canonicalSavedActionReplayAllowed({accountId:s.player.id,clientActionId:'yard-v2:old-food',action:'yard.buyFood',payload:{foodId:'kibble',qty:1}},witness));
 s.yardRuntime.canonicalPickupActions.protocol='unknown';assert.equal(canonicalSavedActionCapability(s),false);
});
test('selected saved-scene pickup stays disabled during stale, hidden or unready scene state',()=>{
 const s=pickupSnapshot(),current=pickupScene(s);assert(canonicalSavedPickupCommandAllowed(s,current,ACTION,payload));
 for(const mutate of [c=>c.itemMutable=true,c=>c.mediaReady=false,c=>c.visualPrototype.viewportBlocked=true,c=>c.visualPrototype.itemActionPending=true,c=>c.visualPrototype.pauseReasons=['hidden'],c=>c.runtime.serverNow--]){
  const c=structuredClone(current);mutate(c);assert.equal(canonicalSavedPickupCommandAllowed(s,c,ACTION,payload),false);
 }
 assert.equal(canonicalSavedPickupCommandAllowed(s,current,'yard.moveGoodie',payload),false);
 const before=pickupSnapshot({now:RELEASE-1});assert.equal(canonicalSavedPickupCommandAllowed(before,pickupScene(before),ACTION,payload),false);
});
