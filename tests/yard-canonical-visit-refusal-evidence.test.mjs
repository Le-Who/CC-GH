import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay,setImmediate as immediate} from 'node:timers/promises';
import {createCanonicalVisitWorker} from '../game-logic/yard-v2/canonical-visit-worker.mjs';
import {VISIT_JOB_SOURCE_HASH} from '../game-logic/yard-v2/canonical-visit-job-contract.mjs';
import {request} from './fixtures/canonical-visit-worker-input.mjs';

const input=(mode='refused',owner='refusal-owner')=>{const r=request(owner);r.input.candidate.visitId=mode;return r;};
function service(t,limits={}){const s=createCanonicalVisitWorker({enabled:true,limits});t.after(()=>s.close());return s;}
async function finished(s,r){const h=s.enqueue(r);return h.completion?await h.completion:h;}
const terminalCodes=['R1_SAVED_NO_NEUTRAL_REST_ANCHOR','R1_SAVED_REST_TIMING_UNAVAILABLE','R1_STAY_TOO_SHORT_FOR_REAL_ROUTES'];

test('exact terminal prepare refusal coalesces, stays inactive and is deeply frozen bounded evidence',async t=>{
 const s=service(t),r=input('refused-slow'),before=structuredClone(r),a=s.enqueue(r),b=s.enqueue(structuredClone(r));
 assert.equal(a,b);const result=await a.completion;
 assert.equal(result.state,'refused');assert.equal(result.prepared,false);assert.equal(result.ready,false);assert.equal(result.admission,false);assert.equal(result.retryable,false);
 assert.equal(result.sourceCode,terminalCodes[0]);assert.equal(result.key,a.key);assert.equal(result.execution.sourceHash,VISIT_JOB_SOURCE_HASH);assert.ok(result.execution.threadId>0);
 assert.equal(s.lookup(r,a.key),result);assert.equal(s.enqueue(r),result);assert.equal(s.stats().startedCount,1);assert.equal(s.stats().cacheEntries,1);
 const bytes=Buffer.byteLength(JSON.stringify({prepared:false,ready:false,admission:false,sourceCode:terminalCodes[0]}));
 assert.equal(s.stats().cacheBytes,bytes);assert.ok(Object.isFrozen(result.execution));assert.ok(Object.isFrozen(result));assert.equal(Object.hasOwn(result,'artifact'),false);assert.deepEqual(r,before);
});

test('refusal lookup fences changed stock, layout, lifetime, owner, source versions, cursor and reservations',async t=>{
 const s=service(t),r=input(),result=await finished(s,r);
 for(const alter of [x=>x.ownerId='other',x=>x.fence.yardRevision+='2',x=>x.fence.layoutRevision+='2',x=>x.fence.cursor+='2',x=>x.fence.reservationDigest='1'.repeat(64),x=>x.input.bowl.servings--,x=>x.input.bowl.expiresAt++,x=>x.input.rows[0].x++,x=>x.input.rows[0].placedAt++,x=>x.input.rows[0].locationVersion++,x=>x.input.rows[0].geometryRevision+='2',x=>x.input.rows[0].itemGeometryRevision+='2']){
  const fresh=structuredClone(r);alter(fresh);const before=structuredClone(fresh),lookup=s.lookup(fresh,result.key);
  assert.equal(lookup.code,'STATE_OBSOLETE');assert.equal(lookup.retryable,true);assert.equal(lookup.admission,false);assert.equal(s.lookup(fresh).state,'pending');assert.deepEqual(fresh,before);
 }
 assert.equal(s.lookup(r,result.key),result);
});

test('terminal evidence expires and same-key retry performs a new worker computation',async t=>{
 const s=service(t,{cacheTtlMs:20}),r=input(),first=await finished(s,r);assert.equal(first.state,'refused');
 await delay(30);assert.equal(s.lookup(r,first.key).state,'pending');assert.equal(s.stats().cacheEntries,0);assert.equal(s.stats().cacheBytes,0);
 const second=await finished(s,r);assert.equal(second.state,'refused');assert.equal(second.key,first.key);assert.notEqual(second,first);assert.equal(s.stats().startedCount,2);
});

test('only audited prepare geometry/timing codes qualify; restore and input/source failures never qualify',async t=>{
 const s=service(t);
 for(const sourceCode of terminalCodes){const r=input();r.input.candidate.sourceCode=sourceCode;assert.equal((await finished(s,r)).state,'refused',sourceCode);s.invalidateOwner(r.ownerId);}
 for(const sourceCode of ['CANONICAL_AUTHORITATIVE_FOOD_UNAVAILABLE','CANONICAL_AUTHORITATIVE_ROWS_INVALID','CANONICAL_SAVED_VISIT_INPUT_INVALID','CANONICAL_SAVED_VISIT_SOURCE_REPLAY_MISMATCH','R1_STAY_SOURCE_REVISION_MISMATCH','R1_SAVED_MOTION_PROFILE_UNAVAILABLE','R1_STAY_ROUTE_BLOCKED','WORKER_TIMEOUT','SOURCE_MISMATCH','UNKNOWN','R1_SAVED_NO_NEUTRAL_REST_ANCHOR_extra']){
  const r=input();r.input.candidate.sourceCode=sourceCode;const result=await finished(s,r);assert.equal(result.state,'unavailable',sourceCode);assert.equal(result.retryable,true);assert.equal(s.stats().cacheEntries,0);
 }
 const restore={...input(),operation:'restore',input:{record:{transportMode:'refused'},rows:[],serverNow:0}};
 const result=await finished(s,restore);assert.equal(result.state,'unavailable');assert.equal(result.retryable,true);assert.equal(s.stats().cacheEntries,0);
 const legacy=await finished(s,input('refusal'));assert.equal(legacy.state,'unavailable');assert.equal(legacy.retryable,true);assert.equal(s.stats().cacheEntries,0);
});

test('malformed refusal transport, identity, version, authority and resource bytes are never terminal',async t=>{
 const s=service(t);
 for(const mode of ['refused-permission','refused-prepared','refused-extra','refused-json','refused-hash','refused-bytes','refused-source','refused-protocol','refused-thread','refused-key','refused-job','refused-elapsed']){
  const r=input(mode),result=await finished(s,r);assert.equal(result.state,'unavailable',mode);assert.equal(result.retryable,true);assert.equal(s.stats().cacheEntries,0);assert.equal(s.stats().cacheBytes,0);
 }
});

test('refusal evidence uses the existing shared LRU count and byte budgets',async t=>{
 const s=service(t,{maxCacheEntries:2,maxResultBytes:1024,maxCacheBytes:1024}),a=input('refused','a'),b=input('refused','b'),c=input('ok','c');
 await finished(s,a);await finished(s,b);assert.equal(s.stats().cacheEntries,2);assert.equal(s.lookup(a).state,'refused');
 await finished(s,c);assert.equal(s.stats().cacheEntries,2);assert.equal(s.lookup(b).state,'pending');assert.equal(s.lookup(a).state,'refused');assert.equal(s.lookup(c).state,'prepared');assert.ok(s.stats().cacheBytes<=1024);
 const tiny=service(t,{maxResultBytes:64});const rejected=await finished(tiny,input());assert.equal(rejected.state,'unavailable');assert.equal(rejected.retryable,true);assert.equal(tiny.stats().cacheEntries,0);
});

test('cancelled and superseded refusal jobs cannot populate or overwrite replacement evidence',async t=>{
 const s=service(t),r=input('refused-slow'),first=s.enqueue(r);await immediate();s.cancel(r.ownerId,first.key);
 assert.equal((await first.completion).code,'WORKER_CANCELLED');const second=s.enqueue(r);assert.notEqual(second,first);
 const result=await second.completion;assert.equal(result.state,'refused');await delay(200);assert.equal(s.lookup(r,second.key),result);assert.equal(s.stats().highWaterWorkers,1);
 s.invalidateOwner(r.ownerId);assert.equal(s.stats().cacheEntries,0);
 const third=s.enqueue(r),fresh=structuredClone(r);fresh.fence.yardRevision+='2';const fourth=s.enqueue(fresh);
 assert.equal((await third.completion).code,'STATE_OBSOLETE');assert.equal((await fourth.completion).state,'refused');assert.equal(s.lookup(r).state,'pending');
});
