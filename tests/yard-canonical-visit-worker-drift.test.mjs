import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalVisitWorker} from '../game-logic/yard-v2/canonical-visit-worker.mjs';
import {request} from './fixtures/canonical-visit-worker-input.mjs';

test('actual worker refuses source-byte drift before loading the planner and never caches the result',async t=>{
 const service=createCanonicalVisitWorker({enabled:true});t.after(()=>service.close());
 const r=request(),before=structuredClone(r),result=await service.enqueue(r).completion;
 assert.equal(result.state,'unavailable');assert.equal(result.workerCode,'SOURCE_MISMATCH');assert.equal(result.retryable,true);
 assert.equal(service.stats().cacheEntries,0);assert.equal(service.lookup(r).state,'pending');assert.deepEqual(r,before);
});
