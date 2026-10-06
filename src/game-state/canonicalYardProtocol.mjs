import protocol from '../../game-logic/yard-v2/canonical-item-protocol.json' with {type:'json'};
export const CANONICAL_LOCATION=Object.freeze(protocol.location);
export const CANONICAL_ITEM=Object.freeze(protocol.item);
export const CANONICAL_MAX_PLACEMENTS=protocol.maxPlacements;
export const CANONICAL_ACTION_NONCE_PREFIX=protocol.noncePrefix;
const actions=protocol.actions;
const identity=value=>Object.entries(CANONICAL_LOCATION).every(([key,v])=>value?.[key]===v);
export const isCanonicalItemIntent=(payload,nonce)=>Object.keys(CANONICAL_LOCATION).some(key=>Object.hasOwn(payload||{},key))
 ||String(nonce||'').startsWith(CANONICAL_ACTION_NONCE_PREFIX);
export const isCanonicalItemNonce=nonce=>typeof nonce==='string'&&nonce.startsWith(CANONICAL_ACTION_NONCE_PREFIX)&&/^[A-Za-z0-9_.:-]{1,96}$/.test(nonce.slice(CANONICAL_ACTION_NONCE_PREFIX.length));
export const CANONICAL_PENDING_ERRORS=new Set(['LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT','UNSUPPORTED_YARD_STORAGE_VERSION','CANONICAL_LOCATION_UNKNOWN','CANONICAL_LOCATION_VERSION_MISMATCH','CANONICAL_GEOMETRY_REVISION_MISMATCH','CANONICAL_ITEM_PLACEMENT_DISABLED','CANONICAL_ACTION_UNSUPPORTED','CANONICAL_NONCE_REQUIRED','CANONICAL_LOCATION_REQUIRED']);
/** Startup-safe capability check. Geometry remains in the lazy Yard module. */
export function canonicalCapability(snapshot,action=null){
 const runtime=snapshot?.yardRuntime,cap=runtime?.itemPlacementCapabilities,item=cap?.items?.leaf_pot,rows=runtime?.canonicalPlacements;
 if(runtime?.version!==1||runtime.status!=='ready'||runtime.mutable!==true||runtime.actionProtocol!=='yard-v2:'||runtime.error
  ||!identity(cap)||cap.enabled!==true||cap.readOnly!==false||cap.visitAdmission!==false||cap.coordinateSpace!==protocol.coordinateSpace
  ||cap.slotPrefix!==protocol.slotPrefix||cap.actionNoncePrefix!==CANONICAL_ACTION_NONCE_PREFIX||cap.maxPlacements!==protocol.maxPlacements
  ||!Array.isArray(cap.actions)||cap.actions.length!==actions.length||!actions.every(value=>cap.actions.includes(value))
  ||JSON.stringify(cap.domain)!==JSON.stringify(protocol.domain)||!Array.isArray(rows)||rows.length>protocol.maxPlacements
  ||!rows.every(row=>identity(row)&&row.goodieId===CANONICAL_ITEM.goodieId&&row.itemGeometryRevision===CANONICAL_ITEM.itemGeometryRevision
   &&/^canonical:[A-Za-z0-9_.:-]{1,80}$/.test(row.slotId)&&typeof row.slotId==='string'&&[row.x,row.y].every(Number.isFinite)
   &&row.condition==='new'&&row.uses===0&&Number.isSafeInteger(row.placedAt)&&row.placedAt>=0)
  ||item?.goodieId!==CANONICAL_ITEM.goodieId||item.itemGeometryRevision!==CANONICAL_ITEM.itemGeometryRevision||item.assetSha256!==CANONICAL_ITEM.assetSha256
  ||item.footprintRadius!==CANONICAL_ITEM.footprintRadius||item.conditions?.length!==1||item.conditions[0]!=='new'
  ||!['place','move','pickup'].every(key=>item[key]===true)||action&&!actions.includes(action))return null;
 return cap;
}
