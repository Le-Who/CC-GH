import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import {createCanonicalVisitWorker} from '../game-logic/yard-v2/canonical-visit-worker.mjs';
import {request} from './fixtures/canonical-visit-worker-input.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {digest} from '../game-logic/yard-v2/util.mjs';

const sample=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/canonical-visit-record-45m.json',import.meta.url),'utf8'));

test('actual pinned planner runs off-thread, coalesces and yields an immutable inactive artifact',async t=>{
 const service=createCanonicalVisitWorker({enabled:true});t.after(()=>service.close());
 const input=request(),before=structuredClone(input),started=performance.now();
 const handle=service.enqueue(input),enqueueMs=performance.now()-started;
 assert.equal(handle.state,'pending');assert.equal(handle.then,undefined);
 assert.equal(service.enqueue(structuredClone(input)),handle);
 let beats=0;const timer=setInterval(()=>beats++,10);t.after(()=>clearInterval(timer));
 const result=await handle.completion;
 assert.equal(result.state,'prepared',JSON.stringify(result));
 assert.equal(result.admission,false);assert.equal(result.ready,false);assert.ok(result.execution.threadId>0);
 assert.ok(beats>=10,`only ${beats} main-thread heartbeats`);assert.ok(enqueueMs<150,`enqueue ${enqueueMs} ms`);
 assert.equal(service.stats().startedCount,1);assert.deepEqual(input,before);
 const expected=sample();
 assert.deepEqual(result.artifact.record,expected);assert.equal(digest(result.artifact.plan),expected.presentationHash);
 assert.equal(Object.isFrozen(result.artifact.plan.inspectionPlan),true);
 assert.throws(()=>{result.artifact.record.after.bowl.servings=99;},TypeError);
 const lookupStart=performance.now();assert.equal(service.lookup(input,handle.key),result);const lookupMs=performance.now()-lookupStart;
 assert.ok(lookupMs<150);assert.equal(result.artifact.record.economicIntent.committed,false);
 t.diagnostic(JSON.stringify({enqueueMs,lookupMs,plannerMs:result.execution.elapsedMs,beats,cacheBytes:service.stats().cacheBytes,threadId:result.execution.threadId}));
 const depleted=structuredClone(input);depleted.input.bowl.servings=0;depleted.fence.yardRevision='stock-changed';
 assert.equal(service.lookup(depleted,result.key).code,'STATE_OBSOLETE');
 const refusal=await service.enqueue(depleted).completion;assert.equal(refusal.sourceCode,'CANONICAL_AUTHORITATIVE_FOOD_UNAVAILABLE');assert.equal(service.stats().cacheEntries,0);assert.equal(depleted.input.bowl.servings,0);
});

test('cold reload replays the full actual saved record in a worker and ignores persisted hashes as authority',async t=>{
 const service=createCanonicalVisitWorker({enabled:true});t.after(()=>service.close());
 const record=sample(),r={...request(),operation:'restore',input:{record,rows:record.after.rows,serverNow:record.releaseAt+1}},before=structuredClone(r);
 assert.equal(service.lookup(r).state,'pending');const result=await service.enqueue(r).completion;
 assert.equal(result.state,'prepared',JSON.stringify(result));assert.equal(digest(result.artifact.plan),record.presentationHash);assert.deepEqual(r,before);assert.equal(Object.hasOwn(result.artifact,'sample'),false);
 const changed=structuredClone(r);changed.input.record.reservations.spatial[0].bodyEnvelope.width=.01;
 delete changed.input.record.recordHash;changed.input.record.recordHash=digest(changed.input.record);
 assert.equal(service.lookup(changed,result.key).code,'STATE_OBSOLETE');
 const forged=await service.enqueue(changed).completion;
 assert.equal(forged.state,'unavailable');assert.equal(forged.sourceCode,'CANONICAL_SAVED_VISIT_SOURCE_REPLAY_MISMATCH');assert.equal(service.stats().cacheEntries,0);
 t.diagnostic(JSON.stringify({reloadPlannerMs:result.execution.elapsedMs,reloadThreadId:result.execution.threadId}));
});

test('actual slow geometry refusal leaves the real afterPlayerCommit mutex and another account snapshot responsive',async t=>{
 process.env.NODE_ENV='test';
 // Read-only imports from the coordinator checkout. No server/DB is started.
 const {getDb}=await import('../db.js');assert.equal(getDb(),null);
 const {withPlayerLock,afterPlayerCommit}=await import('../playerManager.js');
 const {buildSnapshot}=await import('../routes/player.js');
 const {YARD_DEVELOPMENT_RELEASE_POLICY}=await import('../game-logic/yard-v2/development-release-policy.mjs');
 assert.equal(YARD_DEVELOPMENT_RELEASE_POLICY.canonicalVisitAdmission,false);
 const service=createCanonicalVisitWorker({enabled:true});t.after(()=>service.close());
 const r=request('worker-real-lock-owner'),before=structuredClone(r);r.input.rows[0].x=108;r.input.rows[0].y=126;Object.assign(before,structuredClone(r));
 const economic=p=>structuredClone({yard:p.yard,gold:p.resources.gold,gachaTokens:p.resources.gachaTokens,energy:p.resources.energy.current,runtime:p._yardV2?.runtime});
 // Existing cold player/media initialization is independent of the new worker.
 // Warm both accounts, then measure the additional seam on existing players.
 const warmStart=performance.now();
 for(const owner of [r.ownerId,'worker-other-account'])await withPlayerLock(owner,p=>{buildSnapshot(p);});
 const baselineWarmupMs=performance.now()-warmStart;
 let job,originalEconomy;const hookStart=performance.now();
 await withPlayerLock(r.ownerId,p=>{
  originalEconomy=economic(p);
  afterPlayerCommit(p,()=>{job=service.enqueue(r);return job;});
 });
 const hookLockMs=performance.now()-hookStart;assert.ok(hookLockMs<500,`hook lock ${hookLockMs}ms`);assert.equal(job.state,'pending');
 let done=false;job.completion.then(()=>{done=true;});await delay(150);
 assert.equal(service.stats().workers,1);assert.equal(done,false);
 const sameStart=performance.now();
 await withPlayerLock(r.ownerId,p=>{assert.deepEqual(economic(p),originalEconomy);assert.ok(buildSnapshot(p).player);});
 const sameAccountSnapshotMs=performance.now()-sameStart,otherStart=performance.now();
 await withPlayerLock('worker-other-account',p=>{assert.ok(buildSnapshot(p).player);});
 const otherAccountSnapshotMs=performance.now()-otherStart;
 assert.ok(sameAccountSnapshotMs<500);assert.ok(otherAccountSnapshotMs<500);assert.equal(done,false);
 let beats=0;const timer=setInterval(()=>beats++,20);t.after(()=>clearInterval(timer));
 const result=await job.completion;
 assert.equal(result.state,'unavailable');assert.equal(result.sourceCode,'R1_SAVED_NO_NEUTRAL_REST_ANCHOR',JSON.stringify(result));
 assert.equal(result.retryable,true);assert.equal(result.admission,false);assert.equal(service.stats().cacheEntries,0);assert.deepEqual(r,before);
 await withPlayerLock(r.ownerId,p=>assert.deepEqual(economic(p),originalEconomy));
 assert.ok(beats>100);t.diagnostic(JSON.stringify({baselineWarmupMs,hookLockMs,sameAccountSnapshotMs,otherAccountSnapshotMs,beats,refusalWallMs:performance.now()-hookStart}));
});

test('actual worker deadline and cancellation preserve unresolved cursor, food, uses and gifts',async t=>{
 const service=createCanonicalVisitWorker({enabled:true,limits:{jobTimeoutMs:250,totalTimeoutMs:500}});t.after(()=>service.close());
 const r=request();r.input.rows[0].x=108;r.input.rows[0].y=126;const before=structuredClone(r);
 const timeout=await service.enqueue(r).completion;assert.equal(timeout.code,'WORKER_TIMEOUT');assert.equal(timeout.retryable,true);
 assert.deepEqual(r,before);assert.equal(service.lookup(r).state,'pending');assert.equal(service.stats().cacheEntries,0);
 const job=service.enqueue(r);await delay(120);service.cancel(r.ownerId,job.key);assert.equal((await job.completion).code,'WORKER_CANCELLED');
 await delay(100);assert.deepEqual(r,before);assert.equal(service.stats().cacheEntries,0);assert.equal(service.stats().highWaterWorkers,1);
});
