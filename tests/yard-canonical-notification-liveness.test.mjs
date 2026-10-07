import test from 'node:test';
import assert from 'node:assert/strict';
import {withPlayerLock} from '../playerManager.js';
import {fixture} from './fixtures/canonical-reconciliation-fixture.mjs';
import {stageCanonicalVisitPreparation,createCanonicalVisitReconciler} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';
test('a stale notification cannot bump the durable version and invalidate another process current work',async t=>{
 const service=createCanonicalVisitReconciler();t.after(()=>service.close());
 const player=await withPlayerLock('notification-no-write',p=>{fixture(p);stageCanonicalVisitPreparation(p,{slotId:'canonical:a',at:1000});});
 const version=player._version,seq=player._syncSeq,stable=JSON.stringify({yard:player.yard,runtime:player._yardV2.runtime});
 const result=await service.notify(player.id,'0'.repeat(64));
 assert.equal(result.state,'pending');assert.equal(result.reason,'STATE_OBSOLETE');
 assert.equal(player._version,version,'a no-op stale notification must leave another worker current fence valid');
 assert.equal(player._syncSeq,seq);assert.equal(JSON.stringify({yard:player.yard,runtime:player._yardV2.runtime}),stable);
});
for(const operation of ['notify','recover'])test('close waits for an already-running '+operation+' transaction before returning',async()=>{
 const service=createCanonicalVisitReconciler(),owner='notification-close-drain-'+operation;
 await withPlayerLock(owner,p=>{fixture(p);stageCanonicalVisitPreparation(p,{slotId:'canonical:a',at:1000});});
 let release,entered;const gate=new Promise(r=>{release=r;}),ready=new Promise(r=>{entered=r;});
 const holding=withPlayerLock(owner,async()=>{entered();await gate;});await ready;
 let notified=false,closed=false;
 const notification=(operation==='notify'?service.notify(owner,'0'.repeat(64)):service.recover(owner)).then(()=>{notified=true;});
 const closing=service.close().then(()=>{closed=true;});
 try{await new Promise(r=>setTimeout(r,10));assert.equal(closed,false,'close must drain queued/in-flight manager work');}
 finally{release();await holding;await notification;await closing;}
 assert.equal(notified,true);
});
