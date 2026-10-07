import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay,setImmediate as immediate} from 'node:timers/promises';
import {createCanonicalVisitWorker,CANONICAL_VISIT_WORKER_ENABLED} from '../game-logic/yard-v2/canonical-visit-worker.mjs';
import {snapshotRequest,VISIT_JOB_SOURCE_HASH} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {request} from './fixtures/canonical-visit-worker-input.mjs';

const input=(mode='ok',owner='owner')=>{const r=request(owner);r.input.candidate.visitId=mode;return r;};
function service(t,limits={}){const s=createCanonicalVisitWorker({enabled:true,limits});t.after(()=>s.close());return s;}
async function finished(s,r){const h=s.enqueue(r);return h.completion?await h.completion:h;}

test('default off does not enqueue, compile, grant admission or allocate workers',async()=>{
 const s=createCanonicalVisitWorker();assert.equal(CANONICAL_VISIT_WORKER_ENABLED,false);
 assert.equal(s.enqueue(input()).code,'WORKER_DISABLED');assert.equal(s.lookup(input()).code,'WORKER_DISABLED');
 assert.equal(s.stats().startedCount,0);assert.equal(s.stats().jobs,0);await s.close();
});

test('full exact key covers account, candidate/timing/seed input, rows, lifetime, wear, bowl, layout, cursor and reservations',()=>{
 const original=input(),key=snapshotRequest(original,262144).key;
 const variants=[r=>r.ownerId='other',r=>r.input.candidate.visitId+='b',r=>r.input.candidate.arrivedAt++,r=>r.input.candidate.leavesAt++,r=>r.input.candidate.slotId+='b',r=>r.input.rows[0].uses++,r=>r.input.rows[0].placedAt++,r=>r.input.rows[0].x++,r=>r.input.rows[0].condition='worn',r=>r.input.bowl.servings++,r=>r.input.bowl.foodId='berry_plate',r=>r.input.bowl.expiresAt++,r=>r.fence.yardRevision+='b',r=>r.fence.layoutRevision+='b',r=>r.fence.cursor+='b',r=>r.fence.reservationDigest='1'.repeat(64)];
 for(const alter of variants){const changed=structuredClone(original);alter(changed);assert.notEqual(snapshotRequest(changed,262144).key,key);}
 const reordered={input:original.input,operation:original.operation,fence:original.fence,ownerId:original.ownerId};assert.equal(snapshotRequest(reordered,262144).key,key);assert.match(VISIT_JOB_SOURCE_HASH,/^[a-f0-9]{64}$/);
 const restore={...original,operation:'restore',input:{record:{recordHash:'untrusted',unknown:{bytes:1}},rows:[],serverNow:0}},old=snapshotRequest(restore,262144).key;
 restore.input.record.unknown.bytes++;assert.notEqual(snapshotRequest(restore,262144).key,old);
});

test('bounded snapshot rejects oversized, cyclic, deep, accessor and non-JSON input before workers',t=>{
 const s=service(t),mutations=[r=>r.input.extra='x'.repeat(300000),r=>r.input.self=r,r=>r.input.bad=NaN,r=>r.input.bad=undefined,r=>r.input.bad=()=>{},r=>r.fence.yardRevision=''];
 for(const alter of mutations){const r=input();alter(r);assert.equal(s.enqueue(r).state,'unavailable');}
 let invoked=false;const getter=input();Object.defineProperty(getter.input,'extra',{enumerable:true,get(){invoked=true;return 1;}});assert.equal(s.enqueue(getter).code,'INPUT_NOT_JSON');assert.equal(invoked,false);
 const deep=input();let ptr=deep.input;for(let i=0;i<60;i++){ptr.next={};ptr=ptr.next;}assert.equal(s.enqueue(deep).code,'INPUT_TOO_COMPLEX');
 assert.equal(s.stats().startedCount,0);
});

test('coalesced handles share one job, results are frozen and expiry is bounded',async t=>{
 const s=service(t,{cacheTtlMs:30}),r=input('slow');const a=s.enqueue(r),b=s.enqueue(structuredClone(r));assert.equal(a,b);
 r.input.bowl.servings=999;
 const result=await a.completion;assert.equal(result.state,'prepared');assert.equal(s.stats().startedCount,1);
 assert.equal(s.lookup(input('slow'),a.key),result);assert.equal(Object.isFrozen(result.artifact.record),true);assert.equal(result.admission,false);
 await delay(40);assert.equal(s.lookup(input('slow')).state,'pending');assert.equal(s.stats().cacheEntries,0);
});

test('owner mismatch and every changed authoritative state fence refuse a late artifact at the commit lookup',async t=>{
 const s=service(t),r=input();const result=await finished(s,r);
 for(const alter of [x=>x.ownerId='other',x=>x.fence.yardRevision+='2',x=>x.input.bowl.servings--,x=>x.input.rows[0].placedAt++,x=>x.fence.reservationDigest='1'.repeat(64)]){
  const fresh=structuredClone(r);alter(fresh);const before=structuredClone(fresh),lookup=s.lookup(fresh,result.key);
  assert.equal(lookup.code,'STATE_OBSOLETE');assert.equal(lookup.prepared,false);assert.equal(lookup.admission,false);assert.deepEqual(fresh,before);
 }
 assert.equal(s.lookup({...r,ownerId:'other'}).state,'pending');
});

test('supersession, cancellation and invalidation never populate stale cache or advance state',async t=>{
 const s=service(t),r=input('slow'),before=structuredClone(r),first=s.enqueue(r);
 const fresh=structuredClone(r);fresh.fence.yardRevision='new';const second=s.enqueue(fresh);
 assert.equal((await first.completion).code,'STATE_OBSOLETE');assert.equal((await second.completion).state,'prepared');
 assert.equal(s.lookup(r).state,'pending');assert.deepEqual(r,before);
 s.invalidateOwner(r.ownerId);assert.equal(s.stats().cacheEntries,0);
 const cancelled=s.enqueue(r);s.cancel('different-owner',cancelled.key);assert.equal(s.stats().jobs,1);
 s.cancel(r.ownerId,cancelled.key);assert.equal((await cancelled.completion).code,'WORKER_CANCELLED');
 await delay(230);assert.equal(s.lookup(r).state,'pending');assert.equal(s.stats().cacheEntries,0);
});

test('honest worker timeout stays retryable pending work and replacement waits for worker exit',async t=>{
 const s=service(t,{jobTimeoutMs:120,totalTimeoutMs:1000}),r=input('hang'),before=structuredClone(r);
 const result=await finished(s,r);assert.equal(result.code,'WORKER_TIMEOUT');assert.equal(result.retryable,true);assert.equal(result.admission,false);assert.deepEqual(r,before);
 assert.equal(s.stats().cacheEntries,0);assert.equal(s.lookup(r).state,'pending');
 assert.equal((await finished(s,input('ok','next-owner'))).state,'prepared');assert.equal(s.stats().highWaterWorkers,1);
});

test('queue count and total deadline are bounded; duplicate requests cannot grow the queue',async t=>{
 const s=service(t,{maxJobs:2,jobTimeoutMs:200,totalTimeoutMs:200}),a=s.enqueue(input('hang','a')),b=s.enqueue(input('hang','b'));
 for(let i=0;i<100;i++)assert.equal(s.enqueue(input('hang','a')),a);
 assert.equal(s.enqueue(input('hang','c')).code,'QUEUE_FULL');assert.equal(s.stats().jobs,2);
 const results=await Promise.all([a.completion,b.completion]);assert.ok(results.every(r=>['WORKER_TIMEOUT','QUEUE_TIMEOUT'].includes(r.code)));assert.equal(s.stats().cacheEntries,0);assert.equal(s.stats().jobs,0);
});

test('a result delivered after its deadline is unavailable even when the parent timer was delayed',async t=>{
 const s=service(t,{jobTimeoutMs:150,totalTimeoutMs:500}),r=input(),job=s.enqueue(r);
 await immediate(); // Let the scheduler create the real fixture worker first.
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);
 const result=await job.completion;assert.equal(result.code,'WORKER_TIMEOUT');assert.equal(s.stats().cacheEntries,0);
});

test('input memory and output cache memory have independent finite bounds and LRU eviction',async t=>{
 const sample=input('slow','a'),size=Buffer.byteLength(JSON.stringify(sample));
 const s=service(t,{maxInputBytes:size+20,maxPendingBytes:size+20,maxResultBytes:1024,maxCacheBytes:1024,maxCacheEntries:2});
 const a=s.enqueue(sample);assert.equal(s.enqueue(input('slow','b')).code,'QUEUE_FULL');assert.ok(s.stats().pendingBytes<=size+20);
 await a.completion;
 await finished(s,input('padding','b'));assert.ok(s.stats().cacheBytes<=1024);assert.equal(s.lookup(sample).state,'pending');assert.equal(s.stats().cacheEntries,1);
});

test('mismatched identity/source, malformed authority, corrupt bytes and oversize output cannot become cached evidence',async t=>{
 const s=service(t);
 for(const mode of ['wrong-key','wrong-job','wrong-source','wrong-thread','wrong-hash','permission','oversize']){
  const r=input(mode),before=structuredClone(r),result=await finished(s,r);
  assert.equal(result.state,'unavailable',mode);assert.equal(result.admission,false);assert.deepEqual(r,before);assert.equal(s.stats().cacheEntries,0);
 }
});

test('a source refusal, worker crash or clean empty exit is not cached as an economic rejection',async t=>{
 const s=service(t);
 for(const mode of ['refusal','crash','exit']){
  const result=await finished(s,input(mode));assert.equal(result.state,'unavailable');assert.equal(result.retryable,true);assert.equal(s.stats().cacheEntries,0);assert.equal(s.lookup(input(mode)).state,'pending');
 }
});

test('late duplicate output cannot overwrite a completed immutable result',async t=>{
 const s=service(t),r=input('duplicate');const result=await finished(s,r);await delay(40);
 assert.equal(s.lookup(r,result.key),result);assert.equal(s.stats().cacheEntries,1);
});

test('restart/disable loses only transient work; saved input and opportunity remain unchanged',async t=>{
 const r=input('hang'),before=structuredClone(r),old=service(t),cached=input('ok','cached-owner');
 await finished(old,cached);const job=old.enqueue(r);await immediate();
 assert.ok(old.stats().workers>0);await old.close();assert.equal((await job.completion).code,'WORKER_CLOSED');
 const restarted=service(t);assert.equal(restarted.lookup(r).state,'pending');assert.equal(restarted.lookup(cached).state,'pending');assert.deepEqual(r,before);
 const disabled=createCanonicalVisitWorker();assert.equal(disabled.lookup(r,job.key).code,'WORKER_DISABLED');await disabled.close();
});

test('limits cannot request unbounded workers, memory or time',()=>{
 for(const limits of [{workers:3},{maxJobs:999},{maxInputBytes:Infinity},{jobTimeoutMs:60001},{totalTimeoutMs:120001},{unknown:1},{maxCacheBytes:1}])assert.throws(()=>createCanonicalVisitWorker({enabled:true,limits}),RangeError);
});
