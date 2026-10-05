/** One bounded decoded-image cache. Visible pages are pinned before lookahead;
 * pending decodes share the same page/estimated-pixel budget. No canvas copies. */
import {pageOwnerLedger} from './decoded-capacity.mjs';
import {runtimeCellDrawArguments} from './runtime-cells.mjs';
export function atlasPageFor(clip,index){index=Math.max(0,Math.min(clip.frameCount-1,index));const cell=clip.runtimeCells?.frames[index],page=cell?clip.pages[cell.pageIndex]:clip.pages.find(p=>index>=p.first&&index<p.first+p.count);if(!page)throw Error('No atlas page for frame');return{page,index,cell};}
const pixelBytes=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0?width*height*4:0;
export class AtlasCache {
 constructor(base=new URL('./assets/',import.meta.url),limit=3,{now=()=>performance.now(),onEvent=()=>{},maxDecodedBytes=64*1024*1024,maxConcurrentDecodes=1,externalBytes=()=>0}={}) {
  if(!Number.isInteger(limit)||limit<1||!Number.isInteger(maxConcurrentDecodes)||maxConcurrentDecodes<1||!Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<1)throw Error('Invalid atlas budget');
  Object.assign(this,{base,limit,now,onEvent,maxDecodedBytes,maxConcurrentDecodes,externalBytes});
  this.entries=new Map();this.pending=new Map();this.controllers=new Map();this.jobs=new Map();this.queue=[];this.ownerDimensions=new Map();
  this.pinned=new Set();this.desired=new Set();this.managed=false;this.active=0;this.reservedBytes=0;this.disposed=false;this.error=null;
 }
 key(src,base=this.base){return new URL(src,base).href;}
 sourceFor(clip,page){const url=new URL(page.src,clip.assetBaseURL||this.base);if(clip.assetRevision)url.searchParams.set('yard-media',clip.assetRevision);return url.href;}
 get decodedBytes(){return [...this.entries.values()].reduce((n,e)=>n+e.bytes,0);}
 get outsideBytes(){const n=this.externalBytes();if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid external decoded-image ledger');return n;}
 /** Reserve a larger canvas/still allocation before creating it. Existing
  * visible pages and in-flight decode reservations retain priority. */
 reserveExternal(bytes){
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>this.maxDecodedBytes)throw Error('Invalid external decoded-image allocation');
  const candidates=[...this.entries].filter(([key])=>!this.pinned.has(key)).sort((a,b)=>Number(this.desired.has(a[0]))-Number(this.desired.has(b[0]))||a[1].used-b[1].used);
  while(this.decodedBytes+this.reservedBytes+bytes>this.maxDecodedBytes){const next=candidates.shift();if(!next)return false;this.evict(next[0],'external-allocation');}return true;
 }
 request(clip,index){const {page}=atlasPageFor(clip,index);return{src:this.sourceFor(clip,page),width:page.width,height:page.height,...(clip.verifySourceBytes?{sha256:page.sha256,encodedBytes:page.encodedBytes}:{})};}
 /** Explicit complete working set for this presentation. Lookahead priority is
  * caller order; selecting only spare slots prevents alternating prefetch eviction. */
 prepare(required,lookahead=[]) {
  if(this.disposed)return;
  const requested=required.map(r=>this.request(r.clip,r.index)),anticipated=lookahead.map(r=>this.request(r.clip,r.index));
  this.registerDimensions([...requested,...anticipated]);
  const current=new Map(requested.map(r=>[r.src,r])),future=new Map(anticipated.map(r=>[r.src,r]));
  let expected=0;
  for(const r of current.values()){
   const bytes=pixelBytes(r.width,r.height);if(!bytes)throw Error('Visible atlas dimensions are required');expected+=bytes;
  }
  const outside=this.outsideBytes;
  if(current.size>this.limit||expected+outside>this.maxDecodedBytes)throw Error('Visible atlas working set exceeds the configured budget');
  this.managed=true;this.pinned=new Set(current.keys());const selected=new Map(current);
  for(const [key,r]of future){
   if(selected.has(key))continue;const bytes=pixelBytes(r.width,r.height);
   if(!bytes||selected.size>=this.limit||expected+bytes+outside>this.maxDecodedBytes)continue;
   selected.set(key,r);expected+=bytes;
  }
  this.desired=new Set(selected.keys());
  for(const job of [...this.queue])if(!this.desired.has(job.key))this.cancelQueued(job);
  for(const [key,r]of selected)this.load(key,current.has(key)?'demand':'stay-lookahead',r).catch(()=>{});
  this.pump();
 }
 cancelQueued(job){this.queue=this.queue.filter(j=>j!==job);this.jobs.delete(job.key);this.pending.delete(job.key);job.resolve(null);}
 registerDimensions(rows){
  const actual=rows.map(r=>({owner:this.key(r.src),width:r.width,height:r.height}));
  const checked=pageOwnerLedger([...this.ownerDimensions.values()],actual);
  this.ownerDimensions=checked;
 }
 load(src,reason='demand',dimensions={}) {
  if(this.disposed)return Promise.reject(Error('Atlas cache disposed'));
  if(dimensions.width!=null||dimensions.height!=null)this.registerDimensions([{src,...dimensions}]);
  const key=this.key(src),entry=this.entries.get(key);
  if(entry){entry.used=this.now();return Promise.resolve(entry.image);}
  const existing=this.jobs.get(key);
  if(existing){if(reason==='demand')existing.reason='demand';return this.pending.get(key);}
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const job={key,reason,expectedBytes:pixelBytes(dimensions.width,dimensions.height),width:dimensions.width,height:dimensions.height,sha256:dimensions.sha256,encodedBytes:dimensions.encodedBytes,resolve,reject};
  this.jobs.set(key,job);this.pending.set(key,promise);this.queue.push(job);this.pump();return promise;
 }
 evict(key,reason='budget') {
  const e=this.entries.get(key);if(!e)return;this.entries.delete(key);e.image.close?.();
  this.onEvent({type:'atlas-evicted',src:key,reason,closedExplicitly:typeof e.image.close==='function',retainedPages:this.entries.size,decodedBytes:this.decodedBytes});
 }
 makeRoom(bytes) {
  const candidates=[...this.entries].filter(([key])=>!this.pinned.has(key)).sort((a,b)=>Number(this.desired.has(a[0]))-Number(this.desired.has(b[0]))||a[1].used-b[1].used);
  while(this.entries.size+this.active>=this.limit||this.decodedBytes+this.reservedBytes+bytes+this.outsideBytes>this.maxDecodedBytes){
   const next=candidates.shift();if(!next)return false;this.evict(next[0]);
  }
  return true;
 }
 pump() {
  if(this.disposed)return;
  this.queue.sort((a,b)=>Number(b.reason==='demand')-Number(a.reason==='demand'));
  while(this.active<this.maxConcurrentDecodes&&this.queue.length){
   const job=this.queue[0];
   if(this.managed&&!this.desired.has(job.key)){this.cancelQueued(job);continue;}
   if(job.expectedBytes>this.maxDecodedBytes){this.queue.shift();this.fail(job,Error('Atlas page exceeds decoded pixel budget'));continue;}
   if(!this.makeRoom(job.expectedBytes))break;
   this.queue.shift();this.active++;this.reservedBytes+=job.expectedBytes;job.budgetReserved=true;this.decode(job);
  }
 }
 fail(job,error){this.jobs.delete(job.key);this.pending.delete(job.key);if(!this.disposed){this.error=error;this.onEvent({type:'atlas-error',src:job.key,message:String(error)});}job.reject(error);}
 releaseDecodeBudget(job){if(job.budgetReserved){job.budgetReserved=false;this.active--;this.reservedBytes-=job.expectedBytes;}}
 async decode(job) {
  const begin=this.now(),controller=new AbortController();this.controllers.set(job.key,controller);
  this.onEvent({type:'atlas-load-start',src:job.key,reason:job.reason,pendingDecodes:this.active,estimatedReservedBytes:this.reservedBytes});
  let image;
  try {
   const response=await fetch(job.key,{signal:controller.signal});if(!response.ok)throw Error(`Media ${response.status}: ${job.key}`);
   const blob=await response.blob(),fetched=this.now();
   if(job.sha256){const bytes=await blob.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==job.sha256||bytes.byteLength!==job.encodedBytes)throw Error('Atlas visual source byte identity mismatch');}
   if(globalThis.createImageBitmap)image=await createImageBitmap(blob);
   else image=await new Promise((resolve,reject)=>{const im=new Image(),url=URL.createObjectURL(blob);im.onload=()=>{URL.revokeObjectURL(url);resolve(im);};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error(`Decode failed: ${job.key}`));};im.src=url;});
   const decoded=this.now(),bytes=pixelBytes(image.width,image.height);
   if(this.disposed||this.managed&&!this.desired.has(job.key)){image.close?.();job.resolve(null);return;}
   if(job.expectedBytes&&(image.width!==job.width||image.height!==job.height))throw Error('Atlas dimensions differ from the published descriptor');
   if(!bytes||bytes>this.maxDecodedBytes)throw Error('Decoded atlas dimensions exceed the configured budget');
   // Unknown dimensions are permitted only for direct callers. Runtime prepare()
   // always reserves the declared image dimensions before a decode begins.
   const extra=Math.max(0,bytes-job.expectedBytes);
   if(this.decodedBytes+this.reservedBytes+extra+this.outsideBytes>this.maxDecodedBytes)throw Error('Decoded atlas exceeds the reserved pixel budget');
   // Transfer the reservation to the retained image atomically, before observers
   // sample the ledger. The same decoded pixels must never be counted twice.
   this.releaseDecodeBudget(job);
   this.entries.set(job.key,{image,bytes,used:decoded});
   this.onEvent({type:'atlas-ready',src:job.key,reason:job.reason,fetchMs:fetched-begin,decodeMs:decoded-fetched,totalMs:decoded-begin,
    compressedBytes:blob.size,width:image.width,height:image.height,retainedPages:this.entries.size,decodedBytes:this.decodedBytes,
    pendingDecodes:this.active,estimatedReservedBytes:this.reservedBytes});
   job.resolve(image);
  }catch(error){image?.close?.();if(this.disposed)job.resolve(null);else this.fail(job,error);}
  finally{this.controllers.delete(job.key);this.jobs.delete(job.key);this.pending.delete(job.key);this.releaseDecodeBudget(job);this.pump();}
 }
 /** Legacy single-request prefetch API. Managed scenes use prepare() exclusively. */
 prefetch(clip,index,reason='route-lookahead') {
  const r=this.request(clip,index);if(!this.managed||this.desired.has(r.src))this.load(r.src,reason,r).catch(()=>{});return r.src;
 }
 frame(clip,index) {
  const found=atlasPageFor(clip,index),page=found.page,key=this.sourceFor(clip,page),entry=this.entries.get(key);
  if(!entry){if(!this.managed||this.desired.has(key))this.load(key,'demand',this.request(clip,found.index)).catch(()=>{});return null;}
  entry.used=this.now();if(found.cell){const [sx,sy,sw,sh]=found.cell.atlasRect;return{image:entry.image,sx,sy,sw,sh,cell:found.cell};}const n=found.index-page.first+(page.offset||0);
  return{image:entry.image,sx:(n%page.cols)*page.tileWidth,sy:Math.floor(n/page.cols)*page.tileHeight,sw:page.tileWidth,sh:page.tileHeight};
 }
 draw(ctx,clip,index,anchor,ppu){const f=this.frame(clip,index);if(!f)return false;if(f.cell){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';ctx.drawImage(...runtimeCellDrawArguments(f.cell,f.image,anchor,ppu,clip.pixelsPerWorld));}else{const scale=ppu/clip.pixelsPerWorld;ctx.drawImage(f.image,f.sx,f.sy,f.sw,f.sh,anchor.x-clip.pivotPx[0]*scale,anchor.y-clip.pivotPx[1]*scale,f.sw*scale,f.sh*scale);}return true;}
 dispose(){this.disposed=true;for(const job of [...this.queue])this.cancelQueued(job);for(const c of this.controllers.values())c.abort();for(const key of [...this.entries.keys()])this.evict(key,'dispose');this.pinned.clear();this.desired.clear();this.controllers.clear();this.ownerDimensions.clear();}
}
