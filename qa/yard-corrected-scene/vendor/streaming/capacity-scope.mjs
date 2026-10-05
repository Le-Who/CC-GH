import {pageOwnerLedger} from '../vendor/r5/decoded-capacity.mjs';
export const LIMIT=64*1024*1024, PAGE_CAP=1572864;
export function externalOwners(ui,still,{currentCanvas,pendingCanvas=null,cottageRows,extraTarget=null}) {
 const rows=[...ui.ownerRows,...still.owners.filter(r=>r.resourceClass==='scene-still'),...cottageRows,
   {owner:'canvas:current',width:currentCanvas[0],height:currentCanvas[1]},
   ...(pendingCanvas?[{owner:'canvas:pending',width:pendingCanvas[0],height:pendingCanvas[1]}]:[]),
   ...(extraTarget?[extraTarget]:[])];
 const ledger=pageOwnerLedger(rows);
 return {owners:[...ledger.values()],bytes:[...ledger.values()].reduce((n,r)=>n+r.bytes,0)};
}
export function capacityScope(external,{pageSlots=16,pageCap=PAGE_CAP}={}) {
 const atlasBound=pageSlots*pageCap,total=atlasBound+external.bytes;
 return {externalBytes:external.bytes,pageSlots,pageCapBytes:pageCap,atlasBoundBytes:atlasBound,
   totalDecodedBoundBytes:total,budgetBytes:LIMIT,headroomBytes:LIMIT-total,fits:total<=LIMIT,
   scope:'Owned decoded RGBA plus external reservations. Not GPU, browser RSS, network or encoded-buffer memory.'};
}
