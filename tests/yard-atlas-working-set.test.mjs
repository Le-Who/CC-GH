import test from 'node:test';
import assert from 'node:assert/strict';
import {AtlasCache} from '../src/games/companion-yard-v2/atlas.mjs';
const step=()=>new Promise(resolve=>setImmediate(resolve));
const clip=(src,base='http://localhost/mika/',size=1024)=>({assetBaseURL:base,frameCount:1,pixelsPerWorld:50,pivotPx:[0,0],
 pages:[{src,first:0,count:1,width:size,height:size,cols:1,tileWidth:size,tileHeight:size}]});
const request=clip=>({clip,index:0});
function harness(){
 const originalFetch=globalThis.fetch,originalDecode=globalThis.createImageBitmap;
 const fetched=[],waiting=[],images=[],events=[];
 globalThis.fetch=async(url)=>{fetched.push(String(url));const blob=new Blob(['test']);blob.testSource=String(url);return{ok:true,blob:async()=>blob};};
 globalThis.createImageBitmap=blob=>new Promise(resolve=>waiting.push({src:blob.testSource,resolve}));
 return{fetched,waiting,images,events,
  async complete(size=1024){await step();const job=waiting.shift();assert.ok(job,'expected exactly one in-flight decode');const image={src:job.src,width:size,height:size,closed:false,close(){this.closed=true;}};images.push(image);job.resolve(image);await step();return image;},
  async flush(){for(let i=0;i<20;i++){await step();if(!waiting.length)return;await this.complete();}throw Error('decode queue did not drain');},
  restore(){globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalDecode;},
 };
}
test('two actors pin visible pages and choose stable lookahead without an eviction/decode loop',async()=>{
 const h=harness(),cache=new AtlasCache(new URL('http://localhost/'),3,{onEvent:e=>h.events.push(e)});
 try{
  const a=clip('a.webp'),b=clip('b.webp','http://localhost/mochi/'),c=clip('c.webp'),d=clip('d.webp','http://localhost/mochi/');
  cache.prepare([request(a),request(b)],[request(c),request(d)]);await h.flush();
  assert.deepEqual(h.fetched,['http://localhost/mika/a.webp','http://localhost/mochi/b.webp','http://localhost/mika/c.webp']);
  const first=cache.frame(a,0).image,second=cache.frame(b,0).image;
  for(let i=0;i<120;i++){cache.prepare([request(a),request(b)],[request(c),request(d)]);assert.equal(cache.frame(a,0).image,first);assert.equal(cache.frame(b,0).image,second);}
  await step();assert.equal(h.fetched.length,3);assert.equal(first.closed,false);assert.equal(second.closed,false);assert.equal(h.events.filter(e=>e.type==='atlas-evicted').length,0);
  cache.prepare([request(c),request(b)],[request(d)]);await h.flush();
  assert.equal(cache.frame(c,0).image.closed,false);assert.equal(cache.frame(b,0).image,second);assert.equal(first.closed,true);
  assert.equal(cache.entries.size,3);assert.equal(h.fetched.length,4);
 }finally{cache.dispose();h.restore();}
});
test('absolute actor asset identity prevents identical relative filenames sharing the wrong decoded animal',async()=>{
 const h=harness(),cache=new AtlasCache(new URL('http://localhost/'));
 try{
  const a=clip('walk.webp','http://localhost/mika/r1/'),b=clip('walk.webp','http://localhost/mochi/r1/');
  cache.prepare([request(a),request(b)]);await h.flush();
  assert.notEqual(cache.frame(a,0).image,cache.frame(b,0).image);
  assert.equal(cache.frame(a,0).image.src,'http://localhost/mika/r1/walk.webp');
  assert.equal(cache.frame(b,0).image.src,'http://localhost/mochi/r1/walk.webp');
 }finally{cache.dispose();h.restore();}
});
test('new demand is decoded before queued lookahead and only one image is in flight',async()=>{
 const h=harness(),cache=new AtlasCache(new URL('http://localhost/'),3);
 try{
  const a=clip('a'),b=clip('b'),c=clip('c');cache.prepare([request(a)],[request(c)]);await step();
  assert.equal(cache.active,1);assert.equal(h.waiting.length,1);
  cache.prepare([request(a),request(b)],[request(c)]);await h.complete();
  assert.equal(h.waiting[0].src,'http://localhost/mika/b');assert.equal(cache.active,1);
  await h.flush();assert.deepEqual(h.fetched.map(s=>s.split('/').at(-1)),['a','b','c']);
  assert.equal(cache.active,0);assert.equal(cache.reservedBytes,0);
 }finally{cache.dispose();h.restore();}
});
test('retained plus pending declared RGBA estimate stays bounded, and lookahead cannot use required capacity',async()=>{
 const h=harness(),budget=2*1024*1024*4,cache=new AtlasCache(new URL('http://localhost/'),3,{maxDecodedBytes:budget});
 try{
  cache.prepare([request(clip('a')),request(clip('b'))],[request(clip('c'))]);
  await step();assert.ok(cache.decodedBytes+cache.reservedBytes<=budget);
  await h.complete();assert.ok(cache.decodedBytes+cache.reservedBytes<=budget);
  await h.complete();assert.equal(cache.decodedBytes,budget);assert.equal(cache.reservedBytes,0);assert.equal(h.fetched.length,2);
  assert.throws(()=>cache.prepare([request(clip('a')),request(clip('b')),request(clip('c'))]),/working set exceeds/);
  assert.equal(cache.entries.size,2);assert.ok(h.images.every(i=>!i.closed));
 }finally{cache.dispose();h.restore();}
});
test('obsolete in-flight lookahead is closed instead of displacing the next demanded page',async()=>{
 const h=harness(),cache=new AtlasCache(new URL('http://localhost/'),3);
 try{
  const a=clip('a'),b=clip('b'),c=clip('c');cache.prepare([request(a)],[request(c)]);await h.complete();
  assert.equal(h.waiting[0].src,'http://localhost/mika/c');
  cache.prepare([request(a),request(b)]);const obsolete=await h.complete();assert.equal(obsolete.closed,true);
  await h.complete();assert.equal(cache.entries.size,2);assert.ok(cache.frame(a,0));assert.ok(cache.frame(b,0));assert.equal(cache.error,null);
  assert.equal(cache.frame(c,0),null);await step();assert.equal(h.fetched.length,3,'an old held frame must not re-request an obsolete page');
 }finally{cache.dispose();h.restore();}
});
test('wrong decoded dimensions fail explicitly and release their image',async()=>{
 const h=harness(),cache=new AtlasCache(new URL('http://localhost/'),3);
 try{
  cache.prepare([request(clip('wrong'))]);const im=await h.complete(2048);
  assert.equal(im.closed,true);assert.equal(cache.entries.size,0);assert.match(cache.error.message,/dimensions differ/);
  assert.equal(cache.pending.size,0);assert.equal(cache.active,0);assert.equal(cache.reservedBytes,0);
 }finally{cache.dispose();h.restore();}
});
test('dispose cancels queued work and closes a late active decode without reviving the working set',async()=>{
 const h=harness(),cache=new AtlasCache(new URL('http://localhost/'),3);
 try{
  cache.prepare([request(clip('a')),request(clip('b'))],[request(clip('c'))]);await step();
  assert.equal(cache.pending.size,3);cache.dispose();assert.equal(cache.queue.length,0);assert.equal(cache.pinned.size,0);
  const im=await h.complete();assert.equal(im.closed,true);assert.equal(cache.entries.size,0);assert.equal(cache.pending.size,0);assert.equal(cache.jobs.size,0);assert.equal(cache.active,0);assert.equal(cache.reservedBytes,0);assert.equal(h.fetched.length,1);
 }finally{cache.dispose();h.restore();}
});

test('revised media at the same path gets a distinct fetch and decoded cache identity',async()=>{
 const h=harness(),cache=new AtlasCache(new URL('http://localhost/'),3);
 try{
  const a={...clip('walk.webp'),assetRevision:'first'},b={...clip('walk.webp'),assetRevision:'second'};
  cache.prepare([request(a),request(b)]);await h.flush();
  assert.notEqual(cache.frame(a,0).image,cache.frame(b,0).image);
  assert.equal(new URL(h.fetched[0]).searchParams.get('yard-media'),'first');
  assert.equal(new URL(h.fetched[1]).searchParams.get('yard-media'),'second');
 }finally{cache.dispose();h.restore();}
});
