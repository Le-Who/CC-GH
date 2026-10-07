import test from 'node:test';
import assert from 'node:assert/strict';
import {CANONICAL_RECONCILIATION_ENABLED,stageCanonicalVisitPreparation,createCanonicalVisitReconciler} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
test('default-off preparation has no worker, transaction, mutation or runtime admission',async()=>{
 assert.equal(CANONICAL_RECONCILIATION_ENABLED,false);
 const p={id:'untouched'},before=structuredClone(p),service=createCanonicalVisitReconciler();
 assert.equal(stageCanonicalVisitPreparation(p,{slotId:'canonical:a',at:1000}).code,'RECONCILIATION_DISABLED');
 assert.equal(service.register(p).code,'RECONCILIATION_DISABLED');
 assert.equal((await service.recover('uncreated-account')).code,'RECONCILIATION_DISABLED');
 assert.equal((await service.notify('uncreated-account','a'.repeat(64))).code,'RECONCILIATION_DISABLED');
 assert.equal(service.stats().startedCount,0);assert.deepEqual(p,before);await service.close();
});
