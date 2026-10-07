import {CANONICAL_VISIT_PRESENTATION_PROTOCOL,canonicalVisitPlacementRowsValid} from '../../game-logic/yard-v2/canonical-visit-placement-contract.mjs';
import {canonicalFootprintValid,canonicalStorageValid} from '../../game-logic/yard-v2/canonical-locations.mjs';
import {CANONICAL_LOCATION,CANONICAL_ITEM,CANONICAL_MAX_PLACEMENTS,canonicalCapability,canonicalPresentationScope,canonicalCommandScope} from './canonicalYardProtocol.mjs';
export {CANONICAL_LOCATION,CANONICAL_ITEM,CANONICAL_MAX_PLACEMENTS,CANONICAL_ACTION_NONCE_PREFIX,canonicalCapability,canonicalCommandScope,canonicalNoncePrefix,isCanonicalItemIntent,isCanonicalItemNonce} from './canonicalYardProtocol.mjs';
import {CANONICAL_FOOD_LOCATION,canonicalFoodOverlap} from '../../game-logic/yard-v2/canonical-food-contract.mjs';
const identity=value=>Object.entries(CANONICAL_LOCATION).every(([key,v])=>value?.[key]===v);
/** Only authoritative known records are rendered; absent/unknown arrays stay empty. */
export function canonicalItemState(snapshot){
 const runtime=snapshot?.yardRuntime,cap=runtime?.itemPlacementCapabilities,rows=runtime?.canonicalPlacements;
 const saved=runtime?.storageVersion===3&&runtime.canonicalVisitProtocol===CANONICAL_VISIT_PRESENTATION_PROTOCOL;
 const knownVersion=saved||(runtime?.canonicalVisitProtocol===undefined&&(runtime?.storageVersion===undefined||[1,2].includes(runtime.storageVersion)));
 const available=knownVersion&&runtime?.version===1&&runtime.status==='ready'&&!runtime.error&&!!canonicalPresentationScope(snapshot)
  &&cap.coordinateSpace==='canonical-ground'&&cap.maxPlacements===CANONICAL_MAX_PLACEMENTS
  &&cap.items?.leaf_pot?.itemGeometryRevision===CANONICAL_ITEM.itemGeometryRevision&&cap.items.leaf_pot.assetSha256===CANONICAL_ITEM.assetSha256
  &&Array.isArray(rows)&&rows.length<=CANONICAL_MAX_PLACEMENTS&&(saved?canonicalVisitPlacementRowsValid(rows,snapshot?.yard?.placedGoodies||[]):canonicalStorageValid(rows));
 return available?{available:true,records:rows,status:!saved&&canonicalCapability(snapshot)?'ready':'read-only'}:{available:false,records:null,status:'unavailable'};
}
export function canonicalPlacements(snapshot){return canonicalItemState(snapshot).records||[];}
export function checkCanonicalPlacement(snapshot,ghost){
 const action=ghost.placing?'yard.placeGoodie':'yard.moveGoodie',rows=canonicalPlacements(snapshot);
 let error=!canonicalCapability(snapshot,action)?'CANONICAL_ITEM_PLACEMENT_DISABLED':null;
 if(!error&&(!Object.entries(canonicalCommandScope(snapshot)||{}).every(([k,v])=>ghost[k]===v)||ghost.goodieId!=='leaf_pot'))error='CANONICAL_GEOMETRY_REVISION_MISMATCH';
 if(!error&&ghost.placing&&(!(snapshot.yard?.goodieInventory?.leaf_pot>0)||rows.length>=CANONICAL_MAX_PLACEMENTS))error=rows.length>=CANONICAL_MAX_PLACEMENTS?'CANONICAL_LOCATION_CAPACITY_REACHED':'CANONICAL_GOODIE_NOT_OWNED';
 if(!error&&!ghost.placing&&!rows.some(row=>row.slotId===ghost.slotId))error='CANONICAL_SLOT_NOT_FOUND';
 if(!error&&!canonicalFootprintValid(ghost.x,ghost.y,rows,ghost.placing?null:ghost.slotId))error='CANONICAL_PLACEMENT_INVALID';
 if(!error&&canonicalCommandScope(snapshot)===CANONICAL_FOOD_LOCATION&&canonicalFoodOverlap(ghost.x,ghost.y))error='CANONICAL_FOOD_REGION_RESERVED';
 return {ok:!error,errors:error?[{code:error}]:[]};
}
