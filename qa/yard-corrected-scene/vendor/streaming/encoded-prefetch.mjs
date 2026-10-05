/** Isolated candidate. One URL owns one bounded encoded buffer; this is NOT a
 * decoded-image cache. Browser network/GPU/RSS internals are outside this ledger. */
export class EncodedPrefetch {
  constructor({fetcher = globalThis.fetch, maxBytes = 2 * 1024 * 1024,
    maxEntries = 24, maxConcurrentFetches = 4, maxPageBytes = 256 * 1024,
    onEvent = () => {}} = {}) {
    for (const n of [maxBytes, maxEntries, maxConcurrentFetches, maxPageBytes])
      if (!Number.isSafeInteger(n) || n < 1) throw Error('Positive encoded bounds required');
    Object.assign(this, {fetcher, maxBytes, maxEntries, maxConcurrentFetches, maxPageBytes, onEvent});
    this.entries = new Map(); this.desired = new Set(); this.queue = [];
    this.active = 0; this.disposed = false; this.reservedBytes = 0;
  }
  get retainedBytes() { return [...this.entries.values()].reduce((n,e)=>n+(e.buffer?.byteLength || 0),0); }
  event(type, extra = {}) { this.onEvent({type, encodedReservedBytes:this.reservedBytes,
    encodedRetainedBytes:this.retainedBytes, encodedOwners:this.entries.size,
    networkActive:this.active, ...extra}); }
  validate(r) {
    if (!r || typeof r.src !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256)
      || !Number.isSafeInteger(r.encodedBytes) || r.encodedBytes < 1 || r.encodedBytes > this.maxPageBytes)
      throw Error('Exact bounded encoded identity required');
  }
  prepare(rows) {
    if (this.disposed) return;
    rows.forEach(r=>this.validate(r));
    const unique = new Map();
    for (const r of rows) {
      const old=unique.get(r.src);
      if(old && (old.sha256!==r.sha256 || old.encodedBytes!==r.encodedBytes)) throw Error('Conflicting encoded URL identity');
      unique.set(r.src,r);
    }
    const selected=[]; let bytes=0;
    for(const r of unique.values()) {
      if(selected.length>=this.maxEntries || bytes+r.encodedBytes>this.maxBytes) break;
      selected.push(r); bytes+=r.encodedBytes;
    }
    this.desired=new Set(selected.map(r=>r.src));
    for(const e of [...this.entries.values()]) if(!this.desired.has(e.src) && !e.leases) this.remove(e);
    for(const r of selected) this.enqueue(r);
    this.pump();
  }
  enqueue(r) {
    this.validate(r);
    const old=this.entries.get(r.src);
    if(old) {
      if(old.sha256!==r.sha256 || old.encodedBytes!==r.encodedBytes) throw Error('Conflicting encoded URL identity');
      return old;
    }
    if(this.disposed) throw Error('Encoded prefetch disposed');
    if(this.entries.size>=this.maxEntries || this.reservedBytes+r.encodedBytes>this.maxBytes) return null;
    let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    promise.catch(()=>{});
    const e={...r,promise,resolve,reject,leases:0,buffer:null,state:'queued',controller:new AbortController()};
    this.entries.set(r.src,e);this.queue.push(e);this.reservedBytes+=r.encodedBytes;
    this.event('encoded-reserved',{src:r.src});return e;
  }
  async acquire(r, signal) {
    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
    let e=this.enqueue(r);
    if(!e) {
      for(const x of [...this.entries.values()]) if(!x.leases && !this.desired.has(x.src))this.remove(x);
      e=this.enqueue(r);
    }
    if(!e) throw Error('Encoded capacity unavailable; no implicit unbounded fallback');
    e.leases++; this.pump();
    let released=false;
    const release=()=>{if(released)return;released=true;e.leases--;if(!e.leases&&(this.disposed||e.discard||!this.desired.has(e.src)))this.remove(e);};
    let abort;
    const interrupted = new Promise((_,reject)=>{abort=()=>reject(new DOMException('Aborted','AbortError'));signal?.addEventListener('abort',abort,{once:true});});
    try {
      const buffer=await Promise.race([e.promise,interrupted]);
      return {buffer,release};
    }catch(error){release();throw error;}
    finally{signal?.removeEventListener('abort',abort);}
  }
  pump() {
    while(!this.disposed && this.active<this.maxConcurrentFetches && this.queue.length) {
      const e=this.queue.shift();if(this.entries.get(e.src)!==e)continue;
      this.active++;e.state='fetching';this.fetchOne(e);
    }
  }
  async fetchOne(e) {
    this.event('encoded-fetch-start',{src:e.src});
    try {
      const response=await this.fetcher(e.src,{signal:e.controller.signal});
      if(!response.ok)throw Error(`Encoded fetch HTTP ${response.status}`);
      const declared=response.headers.get('content-length');
      if(declared!==null && Number(declared)!==e.encodedBytes)throw Error('Encoded content length mismatch');
      if(!response.body?.getReader)throw Error('Bounded streaming response required');
      const reader=response.body.getReader(); const buffer=new Uint8Array(e.encodedBytes);let used=0;
      try {
        while(true) {
          const {value,done}=await reader.read();if(done)break;
          if(value.byteLength>this.maxPageBytes || used+value.byteLength>e.encodedBytes)throw Error('Encoded response exceeded published byte bound');
          buffer.set(value,used);used+=value.byteLength;
        }
      }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      if(used!==e.encodedBytes)throw Error('Encoded response shorter than descriptor');
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(hash!==e.sha256)throw Error('Encoded source identity mismatch');
      if(this.entries.get(e.src)!==e || this.disposed || e.discard)throw new DOMException('Aborted','AbortError');
      e.buffer=buffer;e.state='ready';e.resolve(buffer);this.event('encoded-ready',{src:e.src});
    }catch(error){
      e.reject(error);e.state='failed';this.remove(e,error);
      this.event('encoded-error',{src:e.src,message:String(error)});
    }finally{this.active--;this.pump();this.event('encoded-fetch-end',{src:e.src});}
  }
  remove(e,error=new DOMException('Aborted','AbortError')) {
    if(this.entries.get(e.src)!==e)return;
    // Leased bytes and in-flight allocations remain reserved until released.
    if(e.leases && e.state!=='fetching') {e.discard=true;return;}
    if(e.state==='fetching') {e.controller.abort();e.discard=true;return;}
    this.entries.delete(e.src);this.queue=this.queue.filter(x=>x!==e);
    this.reservedBytes-=e.encodedBytes;e.buffer=null;e.reject(error);this.event('encoded-removed',{src:e.src});
  }
  dispose() {this.disposed=true;this.desired.clear();for(const e of [...this.entries.values()])this.remove(e);}
}
