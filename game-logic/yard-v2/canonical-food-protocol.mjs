/** Inactive canonical source identity and a derived view of the existing economic bowl.
 * Data availability is not art qualification or permission to admit a visitor. */
import descriptor from './canonical-food-contract.json' with {type:'json'};
import itemProtocol from './canonical-item-protocol.json' with {type:'json'};
// This wire descriptor is imported by the boot outbox. util.mjs belongs to the
// lazy Yard runtime chunk, so importing it would pull historical media into boot.
export function canonicalCommandJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCommandJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalCommandJson(value[k])}`).join(',')}}`;
}
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
export const CANONICAL_FOOD_CONTRACT=deepFreeze(descriptor);
export const CANONICAL_FOOD_LOCATION_ENABLED=false;
export const CANONICAL_FOOD_LOCATION=deepFreeze(Object.fromEntries(['locationId','locationVersion','geometryRevision'].map(k=>[k,descriptor[k]])));
export const CANONICAL_FOOD_NONCE_PREFIX='yard-v2:canonical-v2/';
export const validateCanonicalFoodDescriptor=value=>!!value&&canonicalCommandJson(value)===canonicalCommandJson(descriptor);
const same=(value,scope)=>Object.entries(scope).every(([k,v])=>value?.[k]===v);
export function canonicalFoodCapabilities({canonicalFoodLocationEnabled=CANONICAL_FOOD_LOCATION_ENABLED}={}){
 const enabled=canonicalFoodLocationEnabled===true;
 return {...CANONICAL_FOOD_LOCATION,descriptorId:descriptor.id,enabled,coordinateSpace:descriptor.coordinateSpace,
  presentationReady:false,runtimeActivated:false,visitAdmission:false,storageLocation:{...itemProtocol.location}};
}
export const canonicalFoodOverlap=(x,y)=>Math.hypot(x-descriptor.anchorCanonicalXYZ[0],y-descriptor.anchorCanonicalXYZ[1])<=descriptor.unionRadiusCanonical+itemProtocol.item.footprintRadius+1e-9;
