/** Owned decoded RGBA/backing-store bound, not browser RSS, font or GPU memory. */
export function pageOwnerLedger(...lists){
 const owners=new Map();
 for(const rows of lists)for(const row of rows){
  const {owner,width,height}=row,bytes=width*height*4;
  if(!owner||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(bytes))throw Error('Actual decoded-owner dimensions required');
  const previous=owners.get(owner);
  if(previous&&(previous.width!==width||previous.height!==height))throw Error('Conflicting owner dimensions');
  owners.set(owner,{owner,width,height,bytes});
 }
 return owners;
}
export function capacityGate({requiredPages,possibleFuturePages=[],nonAtlasPeakBytes,limitBytes=64*1024*1024,slotLimit=16}){
 if(!Number.isSafeInteger(nonAtlasPeakBytes)||nonAtlasPeakBytes<0)throw Error('Complete non-atlas reserve required');
 const owners=pageOwnerLedger(requiredPages,possibleFuturePages),current=new Set(requiredPages.map(p=>p.owner)),future=new Set(possibleFuturePages.map(p=>p.owner));
 const requiredBytes=[...current].reduce((n,id)=>n+owners.get(id).bytes,0),pendingBytes=Math.max(0,...[...future].filter(id=>!current.has(id)).map(id=>owners.get(id).bytes));
 const transitionBoundBytes=requiredBytes+pendingBytes+nonAtlasPeakBytes,slotBound=current.size+Number(pendingBytes>0);
 return{requiredBytes,pendingBytes,nonAtlasPeakBytes,transitionBoundBytes,slotBound,fitsRequired:requiredBytes+nonAtlasPeakBytes<=limitBytes&&current.size<=slotLimit,fitsOnePending:transitionBoundBytes<=limitBytes&&slotBound<=slotLimit,headroomBytes:limitBytes-transitionBoundBytes};
}
export function canvasResizePeakBytes(oldWidth,oldHeight,newWidth,newHeight){
 const rows=[{owner:'old-backing',width:oldWidth,height:oldHeight},{owner:'new-backing',width:newWidth,height:newHeight}];
 pageOwnerLedger(rows);
 return oldWidth===newWidth&&oldHeight===newHeight?oldWidth*oldHeight*4:oldWidth*oldHeight*4+newWidth*newHeight*4;
}
/** Sum each real actor's maximum current page and one largest future page.
 * This intentionally overcounts shared pages; it is a sufficient bound while
 * no smaller exhaustive joint-state proof has been accepted. */
export function fullActorCapacity(actorPages,nonAtlasPeakBytes,{limitBytes=64*1024*1024,slotLimit=16}={}){
 const expected=['mika','mochi','pebble','pip','willow','starlit','basil','sage'].sort();
 if(JSON.stringify(Object.keys(actorPages).sort())!==JSON.stringify(expected))throw Error('All eight actual actor page inventories required');
 const owners=pageOwnerLedger(...Object.values(actorPages));
 if(!Number.isSafeInteger(nonAtlasPeakBytes)||nonAtlasPeakBytes<0||Object.values(actorPages).some(rows=>!rows.length))throw Error('Complete actor and non-atlas capacity required');
 const currentBytes=Object.values(actorPages).reduce((n,rows)=>n+Math.max(...rows.map(r=>owners.get(r.owner).bytes)),0);
 const pendingBytes=Math.max(...[...owners.values()].map(r=>r.bytes)),totalBytes=currentBytes+pendingBytes+nonAtlasPeakBytes;
 return{currentBytes,pendingBytes,nonAtlasPeakBytes,totalBytes,slots:9,fits:totalBytes<=limitBytes&&slotLimit>=9,headroomBytes:limitBytes-totalBytes};
}
