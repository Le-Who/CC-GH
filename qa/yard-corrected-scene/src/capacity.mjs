/** Exact application-owned RGBA/backing bound, never a process/GPU claim. */
export const DECODED_LIMIT = 64 * 1024 * 1024;
export const PAGE_LIMIT = 1572864;
export function completeCapacity({uiBytes, stillBytes, environmentBytes, cottageBytes = 448*448*4,
 currentCanvasBytes, pendingCanvasBytes = 0, buildMaskBytes = 0, activePages = 8, pendingPages = 1,
 maxPageBytes = PAGE_LIMIT, targetExtraBytes = 0}) {
 const rows = {uiBytes, stillBytes, environmentBytes, cottageBytes, currentCanvasBytes,
  pendingCanvasBytes, buildMaskBytes, targetExtraBytes};
 for(const [id,n] of Object.entries(rows))if(!Number.isSafeInteger(n)||n<0)throw Error(`Exact owner bytes required: ${id}`);
 if(!Number.isSafeInteger(activePages)||activePages<0||pendingPages!==1||maxPageBytes>PAGE_LIMIT)throw Error('Bounded actor working set required');
 const externalBytes=Object.values(rows).reduce((a,b)=>a+b,0),workingBytes=(activePages+pendingPages)*maxPageBytes;
 const byteLimitedSlots=Math.floor((DECODED_LIMIT-externalBytes)/maxPageBytes);
 return {...rows,externalBytes,workingBytes,totalBytes:externalBytes+workingBytes,limitBytes:DECODED_LIMIT,
   headroomBytes:DECODED_LIMIT-externalBytes-workingBytes,byteLimitedSlots,slotCap:16,
   fits:externalBytes+workingBytes<=DECODED_LIMIT && activePages+pendingPages<=16};
}
export class OwnerLedger {
 constructor(ui){if(!ui.complete||ui.bytes!==17647352||ui.owners!==61)throw Error('Verified complete UI lifetime inventory required');this.ui=ui;this.owners=new Map();this.peak=0;this.rows=[];}
 reserve(id,kind,bytes){if(this.owners.has(id)||!Number.isSafeInteger(bytes)||bytes<0)throw Error('Unique exact owner required');this.owners.set(id,{id,kind,bytes});this.sample('reserve:'+id);}
 release(id){if(!this.owners.delete(id))throw Error('Unknown owner');}
 get externalBytes(){return this.ui.bytes+[...this.owners.values()].reduce((n,r)=>n+r.bytes,0);}
 sample(reason,atlas=null){const row={reason,uiLifetimeBytes:this.ui.bytes,uiLifetimeOwners:this.ui.owners,uiActuallyDecoded:false,
   directOwners:[...this.owners.values()],externalBytes:this.externalBytes,atlasDecodedBytes:atlas?.decodedBytes||0,
   atlasPendingBytes:atlas?.reservedBytes||0,atlasSlots:(atlas?.entries.size||0)+(atlas?.active||0)};
  row.totalBytes=row.externalBytes+row.atlasDecodedBytes+row.atlasPendingBytes;
  if(row.totalBytes>DECODED_LIMIT||row.atlasSlots>16||(atlas?.active||0)>1)throw Error('64 MiB/slot/decode owner budget exceeded');
  this.peak=Math.max(this.peak,row.totalBytes);this.rows.push(row);return row;}
}
