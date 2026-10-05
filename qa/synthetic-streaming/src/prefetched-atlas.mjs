import {AtlasCache} from '../vendor/r5/atlas.mjs';

/** Candidate transport override only. Inherits actual R5 selection, ownership,
 * reservation, eviction, frame and draw code. No decoded concurrency increase. */
export class PrefetchedAtlasCache extends AtlasCache {
  constructor(base,limit,{encoded,...options}) {
    if(options.maxConcurrentDecodes!==1)throw Error('Exactly one decoded reservation required');
    super(base,limit,options);this.encoded=encoded;
  }
  async decode(job) {
    const begin=this.now(),controller=new AbortController();this.controllers.set(job.key,controller);
    this.onEvent({type:'atlas-load-start',src:job.key,reason:job.reason,pendingDecodes:this.active,estimatedReservedBytes:this.reservedBytes});
    let image,lease,blob;
    try {
      lease=await this.encoded.acquire({src:job.key,sha256:job.sha256,encodedBytes:job.encodedBytes},controller.signal);
      blob=new Blob([lease.buffer],{type:'image/webp'}); // Bounded extra encoded copy, retained through decode.
      const fetched=this.now();
      if(typeof globalThis.createImageBitmap!=='function')throw Error('createImageBitmap required for this isolated candidate');
      image=await createImageBitmap(blob);
      const decoded=this.now(),bytes=image.width*image.height*4;
      if(this.disposed||this.managed&&!this.desired.has(job.key)){image.close?.();job.resolve(null);return;}
      if(image.width!==job.width||image.height!==job.height)throw Error('Atlas dimensions differ from descriptor');
      if(!Number.isSafeInteger(bytes)||bytes<=0||this.decodedBytes+this.reservedBytes+this.outsideBytes>this.maxDecodedBytes)throw Error('Decoded atlas exceeds reserved pixel budget');
      this.releaseDecodeBudget(job);this.entries.set(job.key,{image,bytes,used:decoded});
      this.onEvent({type:'atlas-ready',src:job.key,reason:job.reason,fetchMs:fetched-begin,decodeMs:decoded-fetched,totalMs:decoded-begin,compressedBytes:blob.size,width:image.width,height:image.height,retainedPages:this.entries.size,decodedBytes:this.decodedBytes,pendingDecodes:this.active,estimatedReservedBytes:this.reservedBytes});
      job.resolve(image);
    }catch(error){image?.close?.();if(this.disposed)job.resolve(null);else this.fail(job,error);}
    finally{blob=null;lease?.release();this.controllers.delete(job.key);this.jobs.delete(job.key);this.pending.delete(job.key);this.releaseDecodeBudget(job);this.pump();}
  }
}
