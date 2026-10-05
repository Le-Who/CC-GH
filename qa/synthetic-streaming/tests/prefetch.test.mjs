import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EncodedPrefetch} from '../src/encoded-prefetch.mjs';
const bytes=new Uint8Array([1,2,3,4]),sha=createHash('sha256').update(bytes).digest('hex');
const row=(src='https://fixture.invalid/a')=>({src,sha256:sha,encodedBytes:4});
const tick=()=>new Promise(r=>setImmediate(r));
async function settle(p){for(let i=0;i<100&&p.active;i++)await tick();}
test('aliases share URL owner and leased buffer until explicit release',async()=>{
 let count=0;const p=new EncodedPrefetch({fetcher:async()=>{count++;return new Response(bytes);}});
 p.prepare([row(),row()]);const a=await p.acquire(row());const b=await p.acquire(row());
 assert.equal(count,1);assert.equal(a.buffer,b.buffer);assert.equal(p.reservedBytes,4);
 p.dispose();assert.equal(p.reservedBytes,4);a.release();assert.equal(p.reservedBytes,4);b.release();
 assert.equal(p.reservedBytes,0);await settle(p);
});
test('exact byte and hash identity fail closed',async()=>{
 for(const body of [new Uint8Array([1,2,3,4,5]),new Uint8Array([4,3,2,1]),new Uint8Array([1])]) {
  const p=new EncodedPrefetch({fetcher:async()=>new Response(body)});
  await assert.rejects(p.acquire(row()),/bound|identity|shorter/);await settle(p);p.dispose();assert.equal(p.reservedBytes,0);
 }
});
test('bounded entries, bytes and conflicting URL identity',async()=>{
 const p=new EncodedPrefetch({maxBytes:8,maxEntries:2,fetcher:async()=>new Response(bytes)});
 p.prepare([row('https://x/a'),row('https://x/b'),row('https://x/c')]);assert.equal(p.entries.size,2);assert.equal(p.reservedBytes,8);
 assert.throws(()=>p.prepare([row(),{...row(),sha256:'f'.repeat(64)}]),/Conflicting/);
 await settle(p);p.dispose();assert.equal(p.reservedBytes,0);
});
test('aborted fetch keeps reservation until transport settles',async()=>{
 let resolve;const p=new EncodedPrefetch({fetcher:()=>new Promise(r=>{resolve=r;})});
 p.prepare([row()]);p.dispose();assert.equal(p.reservedBytes,4);
 resolve(new Response(bytes));await settle(p);assert.equal(p.reservedBytes,0);assert.equal(p.active,0);
});
test('four fetches maximum with queued reservations and bounded cancellation',async()=>{
 const releases=[];let active=0,peak=0;
 const p=new EncodedPrefetch({maxBytes:40,maxEntries:10,maxConcurrentFetches:4,fetcher:async()=>{
  active++;peak=Math.max(peak,active);await new Promise(r=>releases.push(r));active--;return new Response(bytes);
 }});
 p.prepare(Array.from({length:8},(_,i)=>row(`https://fixture.invalid/${i}`)));
 assert.equal(p.active,4);assert.equal(p.reservedBytes,32);
 for(let i=0;i<8;i++){while(!releases.length)await tick();releases.shift()();await tick();}
 await settle(p);assert.equal(peak,4);assert.equal(p.retainedBytes,32);p.dispose();assert.equal(p.reservedBytes,0);
});
