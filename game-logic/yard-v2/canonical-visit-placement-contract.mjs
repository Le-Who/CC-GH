/** Explicit v3 presentation/storage validation. Never relax the v1/v2 uses:0
 * contract or admit a visitor by interpreting an unversioned visual snapshot. */
import {CANONICAL_LOCATION,CANONICAL_ITEM,CANONICAL_MAX_PLACEMENTS,canonicalFootprintValid} from './canonical-locations.mjs';
import {canonicalFoodOverlap} from './canonical-food-protocol.mjs';
import {YARD_GOODIES} from './catalog.mjs';
import {integer} from './util.mjs';
export const CANONICAL_VISIT_PRESENTATION_PROTOCOL='yard-canonical-authoritative/v1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function canonicalVisitPlacementRowsValid(rows,legacyRows=[]){
 if(!Array.isArray(rows)||rows.length>CANONICAL_MAX_PLACEMENTS||!Array.isArray(legacyRows)||legacyRows.length)return false;
 const ids=new Set();
 for(const row of rows){
  if(!object(row)||typeof row.slotId!=='string'||!/^canonical:[A-Za-z0-9_.:-]{1,80}$/.test(row.slotId)||ids.has(row.slotId)
   ||Object.entries(CANONICAL_LOCATION).some(([k,v])=>row[k]!==v)||row.goodieId!==CANONICAL_ITEM.goodieId
   ||row.itemGeometryRevision!==CANONICAL_ITEM.itemGeometryRevision||row.condition!=='new'||!integer(row.uses)
   ||row.uses>=YARD_GOODIES.leaf_pot.durability||!integer(row.placedAt)||![row.x,row.y].every(Number.isFinite))return false;
  ids.add(row.slotId);
 }
 return rows.every(row=>canonicalFootprintValid(row.x,row.y,rows,row.slotId)&&!canonicalFoodOverlap(row.x,row.y));
}
