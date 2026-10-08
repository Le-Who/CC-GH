import test from 'node:test';
import assert from 'node:assert/strict';
import {CANONICAL_SAVED_ITEM_ACTIONS_ENABLED,probeCanonicalSavedItemAction,applyCanonicalSavedPickupAtCursor} from '../game-logic/yard-v2/canonical-saved-item-actions.mjs';
test('saved item actions remain default-off without enabling client or storage capabilities',()=>{
 assert.equal(CANONICAL_SAVED_ITEM_ACTIONS_ENABLED,false);
 const player={sentinel:{keep:true}},before=JSON.stringify(player);
 assert.equal(probeCanonicalSavedItemAction(player,'yard.pickupGoodie',{},{}).error,'CANONICAL_SAVED_ITEM_ACTIONS_DISABLED');
 assert.equal(applyCanonicalSavedPickupAtCursor(player,{},{}).error,'CANONICAL_SAVED_ITEM_ACTIONS_DISABLED');
 assert.equal(JSON.stringify(player),before);
});
