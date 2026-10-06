/** Explicit, inactive item-placement capability. This registry admits no visitor,
 * food, wear, gift or photo behavior. Canonical units never enter the old 0..100 yard. */
import geometry from './canonical-location-geometry.json' with {type:'json'};
import protocol from './canonical-item-protocol.json' with {type:'json'};
import {addCount,clone,deepFreeze,integer,lookup} from './util.mjs';

deepFreeze(protocol);
export const CANONICAL_ITEM_PLACEMENT_ENABLED = false;
export const CANONICAL_LOCATION=protocol.location;
export const CANONICAL_ITEM=protocol.item;
export const CANONICAL_GEOMETRY=deepFreeze(geometry);
export const CANONICAL_ACTION_NONCE_PREFIX=protocol.noncePrefix;
export const CANONICAL_MAX_PLACEMENTS=protocol.maxPlacements;
const actions=protocol.actions;
export const isCanonicalItemAction=action=>actions.includes(action);
const fields=Object.keys(CANONICAL_LOCATION),own=(v,k)=>Object.hasOwn(v||{},k);
const slotPattern=/^canonical:[A-Za-z0-9_.:-]{1,80}$/;
const noncePattern=/^yard-v2:canonical-v1\/[A-Za-z0-9_.:-]{1,96}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const isCanonicalItemIntent=(payload,actionId)=>fields.some(k=>own(payload,k))
  ||String(actionId||'').startsWith(CANONICAL_ACTION_NONCE_PREFIX);
export const isCanonicalItemNonce=actionId=>typeof actionId==='string'&&noncePattern.test(actionId);
export function canonicalItemCapabilities({canonicalItemPlacementEnabled=CANONICAL_ITEM_PLACEMENT_ENABLED}={}) {
  const enabled=canonicalItemPlacementEnabled===true;
  return {...CANONICAL_LOCATION,enabled,readOnly:!enabled,maxPlacements:CANONICAL_MAX_PLACEMENTS,actions:enabled?[...actions]:[],slotPrefix:protocol.slotPrefix,
    actionNoncePrefix:CANONICAL_ACTION_NONCE_PREFIX,coordinateSpace:protocol.coordinateSpace,domain:clone(protocol.domain),
    items:{leaf_pot:{...clone(CANONICAL_ITEM),place:enabled,move:enabled,pickup:enabled}},
    visitAdmission:false,...(enabled?{}:{blockedReason:'CANONICAL_ITEM_PLACEMENT_DISABLED'})};
}
export function canonicalItemGate(action,payload,options={}) {
  if(!isCanonicalItemAction(action))return 'CANONICAL_ACTION_UNSUPPORTED';
  if(payload.locationId!==CANONICAL_LOCATION.locationId)return 'CANONICAL_LOCATION_UNKNOWN';
  if(payload.locationVersion!==CANONICAL_LOCATION.locationVersion)return 'CANONICAL_LOCATION_VERSION_MISMATCH';
  if(payload.geometryRevision!==CANONICAL_LOCATION.geometryRevision)return 'CANONICAL_GEOMETRY_REVISION_MISMATCH';
  if((options.canonicalItemPlacementEnabled??CANONICAL_ITEM_PLACEMENT_ENABLED)!==true)return 'CANONICAL_ITEM_PLACEMENT_DISABLED';
  return null;
}

const EPS=1e-9;
const edges=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]);
function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function inside(p,polygon){let found=false;for(const[a,b]of edges(polygon)){
  if(segmentDistance(p,a,b)<EPS)return true;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])found=!found;
}return found;}
/** Reference-camera composition is invariant under the UI's uniform fit/crop.
 * Match its conservative full-volume T2 box and fixed-shell AABB refusal. */
export function canonicalCompositionValid(x,y) {
  if(![x,y].every(Number.isFinite))return false;
  const {camera:c,canonicalPerSceneUnit:units,art,foregroundExclusions,itemEnvelope}=geometry.composition;
  const points=[];
  for(const dx of [-itemEnvelope.radius,itemEnvelope.radius])for(const dy of [-itemEnvelope.radius,itemEnvelope.radius])for(const z of [0,itemEnvelope.height]){
    const q=[x+dx-c.projectionOriginCanonical[0],y+dy-c.projectionOriginCanonical[1],z].map(v=>v/units);
    points.push({x:c.projectionOriginCss[0]+q.reduce((n,v,i)=>n+v*c.right[i],0)*c.pixelsPerSceneUnitCss,
      y:c.projectionOriginCss[1]+q.reduce((n,v,i)=>n+v*c.down[i],0)*c.pixelsPerSceneUnitCss});
  }
  const box={x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
  if(box.x<0||box.y<0||box.right>art.width||box.bottom>art.height)return false;
  return !foregroundExclusions.some(({sourceScreenCss:p})=>box.x<Math.max(...p.map(v=>v[0]))&&box.right>Math.min(...p.map(v=>v[0]))
    &&box.y<Math.max(...p.map(v=>v[1]))&&box.bottom>Math.min(...p.map(v=>v[1])));
}
/** The full-height circular envelope exceeds every measured T2 XY vertex.
 * Checking every edge distance covers concavities and exclusions, not just the pivot. */
export function canonicalFootprintValid(x,y,placements=[],ignoreSlotId=null) {
  if(![x,y].every(Number.isFinite)||!canonicalCompositionValid(x,y))return false;
  const r=CANONICAL_ITEM.footprintRadius,p=[x,y],{min,max}=geometry.domain;
  if(x-r<min[0]||y-r<min[1]||x+r>max[0]||y+r>max[1]||!inside(p,geometry.ground))return false;
  if(edges(geometry.ground).some(([a,b])=>segmentDistance(p,a,b)<=r+EPS))return false;
  if(geometry.exclusions.some(e=>inside(p,e.polygon)||edges(e.polygon).some(([a,b])=>segmentDistance(p,a,b)<=r+EPS)))return false;
  return !placements.some(row=>row.slotId!==ignoreSlotId&&Math.hypot(x-row.x,y-row.y)<=2*r+EPS);
}
export function canonicalStorageValid(rows,legacyRows=[]) {
  if(!Array.isArray(rows)||rows.length>CANONICAL_MAX_PLACEMENTS||!rows.every(object)||!Array.isArray(legacyRows)||!legacyRows.every(object))return false;
  const slots=new Set(legacyRows.map(p=>p.slotId));
  for(const row of rows){
    if(!object(row)||fields.some(k=>row[k]!==CANONICAL_LOCATION[k])||typeof row.slotId!=='string'||!slotPattern.test(row.slotId)
      ||slots.has(row.slotId)||row.goodieId!==CANONICAL_ITEM.goodieId||row.itemGeometryRevision!==CANONICAL_ITEM.itemGeometryRevision
      ||row.condition!=='new'||row.uses!==0||!integer(row.placedAt)||![row.x,row.y].every(Number.isFinite))return false;
    slots.add(row.slotId);
  }
  // Validate every scalar first: collision checks traverse the other rows and
  // must never coerce an unvalidated persisted coordinate into arithmetic.
  return rows.every(row=>canonicalFootprintValid(row.x,row.y,rows,row.slotId));
}
/** Mutates only a private working copy after all command and geometry guards. */
export function applyCanonicalItemAction(state,action,payload,{now}={}) {
  const fail=error=>({status:400,error}),yard=state.player.yard,rows=state.runtime.canonicalPlacements||[];
  const {slotId}=payload;
  if(typeof slotId!=='string'||!slotPattern.test(slotId))return fail('CANONICAL_SLOT_ID_REQUIRED');
  if(own(payload,'condition')&&payload.condition!=='new'||own(payload,'uses')&&payload.uses!==0)return fail('CANONICAL_CONDITION_UNSUPPORTED');
  if(['z','rotation','rotationZ'].some(key=>own(payload,key)&&payload[key]!==0))return fail('CANONICAL_TRANSFORM_UNSUPPORTED');
  const row=rows.find(p=>p.slotId===slotId);
  if(action==='yard.placeGoodie'){
    if(payload.goodieId!==CANONICAL_ITEM.goodieId)return fail('CANONICAL_GOODIE_UNSUPPORTED');
    if(row||yard.placedGoodies.some(p=>p.slotId===slotId))return fail('CANONICAL_SLOT_ID_CONFLICT');
    if(rows.length>=CANONICAL_MAX_PLACEMENTS)return fail('CANONICAL_LOCATION_CAPACITY_REACHED');
  }else{
    if(!row)return fail('CANONICAL_SLOT_NOT_FOUND');
    if(own(payload,'goodieId')&&payload.goodieId!==row.goodieId)return fail('CANONICAL_SLOT_GOODIE_MISMATCH');
  }
  if(action!=='yard.pickupGoodie'&&!canonicalFootprintValid(payload.x,payload.y,rows,action==='yard.moveGoodie'?slotId:null))return fail('CANONICAL_PLACEMENT_INVALID');
  const goodieId=CANONICAL_ITEM.goodieId,count=lookup(yard.goodieInventory,goodieId)??0;
  if(!integer(count)||action==='yard.pickupGoodie'&&!integer(count+1))return fail('CANONICAL_INVENTORY_REQUIRES_REVIEW');
  if(action==='yard.placeGoodie'){
    if(count<1)return fail('CANONICAL_GOODIE_NOT_OWNED');
    const placement={...CANONICAL_LOCATION,slotId,goodieId,x:payload.x,y:payload.y,
      itemGeometryRevision:CANONICAL_ITEM.itemGeometryRevision,condition:'new',uses:0,placedAt:now};
    addCount(yard.goodieInventory,goodieId,-1);state.runtime.canonicalPlacements=[...rows,placement];
    return {status:200,extras:{...CANONICAL_LOCATION,goodieId,slotId,x:placement.x,y:placement.y,placement:clone(placement)}};
  }
  if(action==='yard.pickupGoodie'){
    addCount(yard.goodieInventory,goodieId,1);state.runtime.canonicalPlacements=rows.filter(p=>p.slotId!==slotId);
    return {status:200,extras:{...CANONICAL_LOCATION,goodieId,slotId}};
  }
  row.x=payload.x;row.y=payload.y;
  return {status:200,extras:{...CANONICAL_LOCATION,goodieId,slotId,x:row.x,y:row.y,placement:clone(row)}};
}
