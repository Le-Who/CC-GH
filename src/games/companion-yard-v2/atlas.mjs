/** Three retained decoded pages. Targeted lookahead uses this same bounded cache. */
export function atlasPageFor(clip,index){index=Math.max(0,Math.min(clip.frameCount-1,index));const page=clip.pages.find(p=>index>=p.first&&index<p.first+p.count);if(!page)throw Error('No atlas page for frame');return{page,index};}
export class AtlasCache{
 constructor(base=new URL('./assets/',import.meta.url),limit=3,{now=()=>performance.now(),onEvent=()=>{}}={}){this.base=base;this.limit=limit;this.now=now;this.onEvent=onEvent;this.entries=new Map();this.pending=new Map();this.controllers=new Map();this.disposed=false;this.error=null;}
 async load(src,reason='demand'){
  if(this.disposed)throw Error('Atlas cache disposed');if(this.entries.has(src))return this.entries.get(src).image;if(this.pending.has(src))return this.pending.get(src);
  const begin=this.now();this.onEvent({type:'atlas-load-start',src,reason});
  const controller=new AbortController();this.controllers.set(src,controller);
  const promise=(async()=>{const r=await fetch(new URL(src,this.base),{signal:controller.signal});if(!r.ok)throw Error(`Media ${r.status}: ${src}`);const blob=await r.blob(),fetched=this.now();let image;
   if(globalThis.createImageBitmap)image=await createImageBitmap(blob);else image=await new Promise((resolve,reject)=>{const i=new Image(),u=URL.createObjectURL(blob);i.onload=()=>{URL.revokeObjectURL(u);resolve(i)};i.onerror=()=>{URL.revokeObjectURL(u);reject(Error(`Decode failed: ${src}`))};i.src=u;});
   const decoded=this.now();if(this.disposed){image.close?.();return null;}this.entries.set(src,{image,used:decoded});this.trim();this.onEvent({type:'atlas-ready',src,reason,fetchMs:fetched-begin,decodeMs:decoded-fetched,totalMs:decoded-begin,compressedBytes:blob.size,width:image.width??null,height:image.height??null,retainedPages:this.entries.size});return image;
  })().catch(e=>{if(!this.disposed){this.error=e;this.onEvent({type:'atlas-error',src,message:String(e)});}throw e}).finally(()=>{this.pending.delete(src);this.controllers.delete(src)});this.pending.set(src,promise);return promise;
 }
 trim(){while(this.entries.size>this.limit){const[key,value]=[...this.entries].sort((a,b)=>a[1].used-b[1].used)[0];value.image.close?.();this.entries.delete(key);this.onEvent({type:'atlas-evicted',src:key,closedExplicitly:typeof value.image.close==='function',retainedPages:this.entries.size});}}
 prefetch(clip,index,reason='route-lookahead'){const{page}=atlasPageFor(clip,index);if(!this.entries.has(page.src)&&!this.pending.has(page.src))this.load(page.src,reason).catch(()=>{});return page.src;}
 frame(clip,index){const found=atlasPageFor(clip,index),page=found.page;index=found.index;const e=this.entries.get(page.src);if(!e){this.load(page.src,'demand').catch(()=>{});return null;}e.used=this.now();const n=index-page.first+(page.offset||0),next=clip.pages[clip.pages.indexOf(page)+1];if(next&&index-page.first>page.count-10)this.load(next.src,'clip-page-lookahead').catch(()=>{});return{image:e.image,sx:(n%page.cols)*page.tileWidth,sy:Math.floor(n/page.cols)*page.tileHeight,sw:page.tileWidth,sh:page.tileHeight};}
 draw(ctx,clip,index,anchor,ppu){const f=this.frame(clip,index);if(!f)return false;const scale=ppu/clip.pixelsPerWorld;ctx.drawImage(f.image,f.sx,f.sy,f.sw,f.sh,anchor.x-clip.pivotPx[0]*scale,anchor.y-clip.pivotPx[1]*scale,f.sw*scale,f.sh*scale);return true;}
 dispose(){this.disposed=true;for(const c of this.controllers.values())c.abort();for(const e of this.entries.values())e.image.close?.();this.entries.clear();this.controllers.clear();}
}
