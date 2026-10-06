import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../../game-logic/player.js';
import {ensurePersistentPlayerYard} from '../../game-logic/yard-v2/service.mjs';
import {CANONICAL_LOCATION} from '../../game-logic/yard-v2/canonical-locations.mjs';
export const NOW=Date.UTC(2026,9,6,12);
export const canonicalPayload=(extra={})=>({...CANONICAL_LOCATION,slotId:'canonical:owned-leaf',goodieId:'leaf_pot',x:98,y:118,...extra});
export function canonicalFixture(){
  const p=createDefaultPlayer('canonical-item-fixture','Canonical fixture',NOW);
  p.yard.placedGoodies=[{slotId:'old-cushion',goodieId:'sun_cushion',x:54,y:66,uses:2,condition:'new',placedAt:NOW-10000,opaque:{old:true}}];
  p.yard.goodieInventory.leaf_pot=2;
  p.yard.activeVisitors=[{visitId:'old-mika-visit',visitorId:'mika_cat',goodieId:'sun_cushion',slotId:'old-cushion',activityId:'nap',arrivedAt:NOW-1000,leavesAt:NOW+3600000,opaque:'old-visit'}];
  p.yard.pendingGifts=[{id:'old-gift',visitorId:'mika_cat',treats:7,shinyTreats:1,createdAt:NOW-5000,opaque:'gift'}];
  p.yard.album.photos=[{id:'old-photo',visitorId:'mika_cat',capturedAt:NOW-5000,opaque:'photo'}];
  p.yard.bowls[0]={...p.yard.bowls[0],foodId:'kibble',servings:3,placedAt:NOW-1000,expiresAt:NOW+7200000};
  p.yard.opaque={oldCoordinates:[97,3]};p.resources.futureCurrency=17;p.retainedFixture={otherGame:'untouched'};
  assert.equal(ensurePersistentPlayerYard(p,{now:NOW}).status,200);
  return p;
}
export function assertCanonicalIsolation(before,after){
  const withoutItems=p=>{const copy=structuredClone(p);delete copy.yard.goodieInventory.leaf_pot;
    delete copy._yardV2.runtime.canonicalPlacements;delete copy._yardV2.runtime.commandReceipts;
    delete copy._yardV2.version;delete copy._onboarded;return copy;};
  assert.deepEqual(withoutItems(after),withoutItems(before),'Only canonical rows, shared leaf inventory, durable receipts and storage marker may change');
}
