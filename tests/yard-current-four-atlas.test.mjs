import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {AtlasCache,atlasPageFor} from '../src/games/companion-yard-v2/atlas.mjs';
import {CURRENT_FOUR_ATLAS_POLICY as policy} from '../src/games/companion-yard-v2/atlas-policy.mjs';
import {entries,allClips,restRows} from './fixtures/yard-current-four/media.mjs';
const M=1024*1024,step=()=>new Promise(r=>setImmediate(r));
const source=(clip,page)=>{const url=new URL(page.src,clip.assetBaseURL);if(clip.assetRevision)url.searchParams.set('yard-media',clip.assetRevision);return url.href;};
const descriptors=new Map();for(const e of Object.values(entries))for(const c of allClips(e))for(const p of c.pages)descriptors.set(source(c,p),p);
function harness(limit=policy.maxPages,overrides={}){
 const oldFetch=globalThis.fetch,oldDecode=globalThis.createImageBitmap,fetched=[],waiting=[],images=[],events=[],ledger=[];let cache;
 globalThis.fetch=async url=>{const blob=new Blob(['synthetic']);blob.src=String(url);fetched.push(blob.src);return{ok:true,blob:async()=>blob};};
 globalThis.createImageBitmap=blob=>new Promise(resolve=>waiting.push({src:blob.src,resolve}));
 cache=new AtlasCache('https://yard.fixture/',limit,{...policy,...overrides,onEvent:e=>{events.push(e);ledger.push({type:e.type,pages:cache.entries.size+cache.active,bytes:cache.decodedBytes+cache.reservedBytes,retained:cache.entries.size,active:cache.active,reserved:cache.reservedBytes});}});
 return{cache,fetched,waiting,images,events,ledger,
  async complete(dimensions){await step();const job=waiting.shift();assert.ok(job,'one declared decode must be pending');const page=descriptors.get(job.src),image={src:job.src,width:page.width,height:page.height,closed:0,close(){this.closed++;},...dimensions};images.push(image);job.resolve(image);await step();return image;},
  async flush(){while(cache.pending.size){await step();assert.ok(waiting.length,'budget must allow forward progress');await this.complete();}},
  restore(){cache.dispose();globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldDecode;},
 };
}
function requiredURLs(cache,rows){return new Set(rows.map(r=>cache.request(r.clip,r.index).src));}
function prepare(cache,rows){cache.prepare(rows,rows.flatMap(r=>r.lookahead?[r.lookahead]:[]));assert.deepEqual(cache.pinned,requiredURLs(cache,rows));}
function assertBounded(h){assert.ok(h.ledger.every(v=>v.pages<=h.cache.limit));assert.ok(h.ledger.every(v=>v.bytes<=h.cache.maxDecodedBytes));assert.ok(h.ledger.every(v=>v.active<=1));}
test('CURRENT-FOUR slot policy is grounded in exact published dimensions, not an eight-actor acceptance claim',()=>{
 assert.deepEqual(policy.actorIds,Object.keys(entries));assert.equal(policy.maxPages,7);assert.equal(policy.maxDecodedBytes,64*M);assert.equal(policy.maxConcurrentDecodes,1);
 const maxima=Object.values(entries).map(e=>Math.max(...allClips(e).flatMap(c=>c.pages.map(p=>p.width*p.height*4)))/M);assert.deepEqual(maxima,[15,7,5.5,6.75]);assert.equal(maxima.reduce((a,b)=>a+b),34.25);
 for(const [groundMika,expected]of[[false,50.29345703125],[true,46]]){
  const union=new Map();for(let ms=0;ms<38400;ms+=40)for(const r of restRows(ms,{groundMika})){const p=atlasPageFor(r.clip,r.index).page;union.set(source(r.clip,p),p.width*p.height*4);}
  assert.equal(union.size,7);assert.equal([...union.values()].reduce((a,b)=>a+b)/M,expected);
 }
});
test('four actual maximum pages decode serially into 34.25 MiB with no transient double accounting',async()=>{
 const h=harness();try{
  const rows=Object.values(entries).map(e=>allClips(e).flatMap(clip=>clip.pages.map(page=>({clip,page,index:page.first})))
   .sort((a,b)=>b.page.width*b.page.height-a.page.width*a.page.height)[0]);
  h.cache.prepare(rows);await step();assert.equal(h.waiting.length,1);assert.equal(h.cache.reservedBytes,15*M);
  await h.flush();assert.equal(h.cache.entries.size,4);assert.equal(h.cache.decodedBytes,34.25*M);assert.equal(h.cache.reservedBytes,0);
  assert.ok(rows.every(r=>h.cache.frame(r.clip,r.index)));assert.deepEqual(h.cache.pinned,requiredURLs(h.cache,rows));assertBounded(h);
  assert.equal(Math.max(...h.ledger.map(r=>r.bytes)),34.25*M);
 }finally{h.restore();}
});
for(const groundMika of[false,true])test(`exact four-actor ${groundMika?'ground':'cushion'} rest trace warms seven pages and never redecodes through another 38.4s cycle`,async()=>{
 const h=harness();try{
  for(let ms=0;ms<38400;ms+=40){const rows=restRows(ms,{groundMika});prepare(h.cache,rows);await h.flush();assert.ok(rows.every(r=>h.cache.frame(r.clip,r.index)));}
  assert.equal(h.fetched.length,7);const warm=h.fetched.length;
  for(let ms=38400;ms<76800;ms+=40){const rows=restRows(ms,{groundMika});prepare(h.cache,rows);assert.ok(rows.every(r=>h.cache.frame(r.clip,r.index)),'all four exact visible frames stay resident');}
  await step();assert.equal(h.fetched.length,warm);assert.equal(h.cache.entries.size,7);assert.equal(h.cache.error,null);assertBounded(h);
  console.log('CURRENT_FOUR_WARM',JSON.stringify({groundMika,distinctPages:warm,warmRedecodes:h.fetched.length-warm,retainedMiB:h.cache.decodedBytes/M,peakLedgerMiB:Math.max(...h.ledger.map(r=>r.bytes))/M,traceMs:76800}));
 }finally{h.restore();}
});
test('3 slots reject four real required pages explicitly; 4/5 slots keep actors but demonstrably churn',async()=>{
 const small=harness(3);try{assert.throws(()=>prepare(small.cache,restRows(0)),/working set exceeds/);assert.equal(small.fetched.length,0);}finally{small.restore();}
 for(const limit of[4,5]){const h=harness(limit);try{
  for(let ms=0;ms<38400;ms+=40){const rows=restRows(ms);prepare(h.cache,rows);await h.flush();assert.ok(rows.every(r=>h.cache.frame(r.clip,r.index)));}
  assert.ok(h.fetched.length>7);assertBounded(h);console.log('CURRENT_FOUR_LOW_SLOTS',JSON.stringify({limit,decodes:h.fetched.length,traceMs:38400}));
 }finally{h.restore();}}
});
test('delayed decodes and simultaneous four-page switches pin exactly the demanded pages, with truthful ready accounting',async()=>{
 const h=harness();try{
  const first=restRows(0),second=restRows(800);prepare(h.cache,first);await step();assert.equal(h.cache.active,1);assert.equal(h.waiting.length,1);
  while(h.cache.pending.size){await h.complete();assertBounded(h);}const held=first.map(r=>h.cache.frame(r.clip,r.index).image);
  prepare(h.cache,second);assert.deepEqual(h.cache.pinned,requiredURLs(h.cache,second));assert.ok(second.every(r=>h.cache.frame(r.clip,r.index)),'warm lookahead already covers this simultaneous switch');
  const obsolete=allClips(entries.pip).find(c=>c===entries.pip.manifest.walk.facings[0]);const demand={clip:obsolete,index:0};h.cache.prepare(second,[demand]);await step();assert.equal(h.cache.active,1);
  h.cache.prepare(first);assert.deepEqual(h.cache.pinned,requiredURLs(h.cache,first));const dead=await h.complete();assert.equal(dead.closed,1);assert.equal(h.cache.error,null);assert.ok(first.every((r,i)=>h.cache.frame(r.clip,r.index).image===held[i]));
  for(const l of h.ledger.filter(r=>r.type==='atlas-ready')){assert.equal(l.active,0);assert.equal(l.reserved,0);}
  assertBounded(h);
 }finally{h.restore();}
});
test('pixel budget failure and wrong dimensions never insert an invalid image or weaken required pinning',async()=>{
 const tooSmall=harness(7,{maxDecodedBytes:16*M});try{assert.throws(()=>prepare(tooSmall.cache,restRows(0)),/working set exceeds/);assert.equal(tooSmall.fetched.length,0);}finally{tooSmall.restore();}
 const h=harness();try{prepare(h.cache,[restRows(0)[0]]);const invalid=await h.complete({width:1});assert.equal(invalid.closed,1);assert.match(h.cache.error.message,/dimensions differ/);assert.equal(h.cache.entries.size,0);assert.equal(h.cache.reservedBytes,0);assert.equal(h.cache.active,0);assert.equal(h.cache.pending.size,0);}finally{h.restore();}
});
test('dispose closes all retained pages and a late decode, reload has no stale identity or reservation',async()=>{
 const h=harness();try{prepare(h.cache,restRows(0));await h.complete();await step();assert.equal(h.cache.active,1);h.cache.dispose();const late=await h.complete();assert.equal(late.closed,1);assert.ok(h.images.every(i=>i.closed===1));assert.equal(h.cache.pending.size,0);assert.equal(h.cache.entries.size,0);assert.equal(h.cache.active,0);assert.equal(h.cache.reservedBytes,0);}finally{h.restore();}
 const loaded=harness();try{prepare(loaded.cache,restRows(0));await loaded.flush();assert.ok(restRows(0).every(r=>loaded.cache.frame(r.clip,r.index)));assert.equal(loaded.cache.error,null);assertBounded(loaded);}finally{loaded.restore();}
});
