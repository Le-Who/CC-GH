import {CANONICAL_FOOD_CONTRACT,selectCanonicalFoodState} from '../../../../game-logic/yard-v2/canonical-food-contract.mjs';

// A fixed gameplay socket, not an editor/HUD anchor. The authoritative union
// stays reserved for navigation even when an old saved item occupies it.
export const CANONICAL_FOOD_EXCLUSION=Object.freeze({
 id:CANONICAL_FOOD_CONTRACT.socketId,
 kind:'canonical-food-union-r2',
 heightCanonical:CANONICAL_FOOD_CONTRACT.unionHeightCanonical,
 radiusCanonical:CANONICAL_FOOD_CONTRACT.unionRadiusCanonical,
 polygon:Object.freeze(Array.from({length:24},(_,i)=>Object.freeze([
  CANONICAL_FOOD_CONTRACT.anchorCanonicalXYZ[0]+CANONICAL_FOOD_CONTRACT.unionRadiusCanonical/Math.cos(Math.PI/24)*Math.cos(i*Math.PI/12),
  CANONICAL_FOOD_CONTRACT.anchorCanonicalXYZ[1]+CANONICAL_FOOD_CONTRACT.unionRadiusCanonical/Math.cos(Math.PI/24)*Math.sin(i*Math.PI/12),
 ]))),
});
export function canonicalFoodSceneState(snapshot,{enabled=false}={}) {
 if(enabled!==true)return {available:false,state:null,reason:'CANONICAL_FOOD_PREVIEW_DISABLED',reserved:false};
 const selection=selectCanonicalFoodState(snapshot);
 return {...selection,reserved:selection.reason!=='CANONICAL_FOOD_LOCATION_DISABLED'};
}
export function canonicalFoodNavigationGeometry(geometry,{reserved=false}={}) {
 if(!reserved)return geometry;
 if(geometry.exclusions?.some(row=>row.id===CANONICAL_FOOD_EXCLUSION.id))throw Error('Duplicate canonical food socket');
 return {...geometry,exclusions:[...(geometry.exclusions||[]),CANONICAL_FOOD_EXCLUSION]};
}
