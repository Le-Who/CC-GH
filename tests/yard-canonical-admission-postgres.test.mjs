import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {guard,ownerGuard,verify} from './helpers/canonical-visit-pg-guard.mjs';
import {fixture} from './fixtures/canonical-reconciliation-fixture.mjs';
guard();
const {initDb,ensureDbSchema,closeDb}=await import('../db.js');
const sql=initDb();await ensureDbSchema();const database=await verify(sql);
const {withPlayerLock}=await import('../playerManager.js');
const {stageCanonicalVisitPreparation,createCanonicalVisitReconciler}=await import('../game-logic/yard-v2/canonical-visit-reconciliation.mjs');
async function until(fn,timeout=90000){const end=performance.now()+timeout;while(performance.now()<end){const v=await fn();if(v)return v;await delay(20);}throw Error('PG_ASSERTION_TIMEOUT');}
function worker(){
 const messages=[],errors=[];const child=fork(new URL('./helpers/canonical-visit-pg-worker.mjs',import.meta.url),[],{execArgv:process.execArgv,env:{...process.env},stdio:['ignore','pipe','pipe','ipc']});
 child.on('message',m=>messages.push(m));child.stderr.on('data',x=>errors.push(String(x)));child.stdout.on('data',()=>{});
 let counter=0;
 return {child,messages,errors,async ready(){await until(()=>messages.find(m=>m.type==='ready'),20000);},
  send(type,owner,now){const id=String(++counter);child.send({type,id,owner,now});return id;},
  async reply(id){const r=await until(()=>messages.find(m=>m.type==='reply'&&m.id===id));assert.equal(r.error,undefined,r.error);return r.value;},
  async close(){if(!child.connected)return;const id=String(++counter);child.send({type:'close',id});await until(()=>messages.find(m=>m.type==='reply'&&m.id===id),15000);await until(()=>child.exitCode!==null,15000);assert.equal(child.exitCode,0,errors.join(''));},
 };
}

test('actual PostgreSQL OCC loses one staging attempt; one visit/economy survives process restart and exact departure gift is durable', {timeout:150000},async t=>{
 const owner='yard_visit_pg_'+randomUUID();ownerGuard(owner);let a,b,c;
 t.after(async()=>{t.diagnostic(JSON.stringify({processMessages:[a,b,c].filter(Boolean).map(w=>w.messages),processErrors:[a,b,c].filter(Boolean).map(w=>w.errors)}));await Promise.all([a,b,c].filter(Boolean).map(w=>w.close().catch(()=>w.child.kill())));await sql`DELETE FROM players WHERE id=${owner}`;await closeDb();});
 const originalNow=Date.now;Date.now=()=>1001;t.after(()=>{Date.now=originalNow;});
 await withPlayerLock(owner,p=>{fixture(p);stageCanonicalVisitPreparation(p,{slotId:'canonical:a',at:1000});});
 const load=async()=>{const [row]=await sql`SELECT data FROM players WHERE id=${owner}`;return row.data;};
 const original=await load(),probe=createCanonicalVisitReconciler();
 assert.equal((await probe.notify(owner,'0'.repeat(64))).reason,'STATE_OBSOLETE');await probe.close();
 const afterProbe=await load();assert.equal(afterProbe._version,original._version,'A stale notification must not invalidate concurrent PostgreSQL work');assert.equal(afterProbe._syncSeq,original._syncSeq);assert.deepEqual(afterProbe._yardV2,original._yardV2);
 a=worker();b=worker();await Promise.all([a.ready(),b.ready()]);
 const ia=a.send('stage',owner,1001),ib=b.send('stage',owner,1001);
 const ba=await until(()=>a.messages.find(m=>m.type==='barrier')),bb=await until(()=>b.messages.find(m=>m.type==='barrier'));
 assert.equal(ba.version,bb.version,'both OS processes observed actual same PostgreSQL version');
 a.child.send({type:'release',id:ia});b.child.send({type:'release',id:ib});
 await Promise.all([a.reply(ia),b.reply(ib)]);
 assert.equal(a.messages.filter(m=>m.type==='winning-hook').length+b.messages.filter(m=>m.type==='winning-hook').length,2);
 assert.ok(a.messages.some(m=>m.type==='occ-retry')||b.messages.some(m=>m.type==='occ-retry'),'actual manager logged losing CAS retry');
 const admitted=await until(async()=>{const p=await load();return Object.values(p._yardV2.runtime.canonicalVisits).length===1?p:null;});
 const record=Object.values(admitted._yardV2.runtime.canonicalVisits)[0];
 assert.equal(admitted.yard.bowls[0].servings,3);assert.equal(admitted._yardV2.runtime.canonicalPlacements[0].uses,1);
 assert.equal(admitted.yard.petbook.pip_hamster.visits,(original.yard.petbook.pip_hamster?.visits??0)+1);
 assert.equal(Object.keys(admitted._yardV2.runtime.canonicalVisitReceipts).length,1);assert.equal(record.status,'active');assert.equal(admitted.yard.pendingGifts.length,original.yard.pendingGifts.length);
 await Promise.all([a.close(),b.close()]);
 assert.ok(![...a.errors,...b.errors].some(e=>/CONNECTION_ENDED|ERR_IPC_CHANNEL_CLOSED/.test(e)),'shutdown must drain worker notifications before closing DB/IPC');
 c=worker();await c.ready();assert.equal((await c.reply(c.send('recover',owner,record.leavesAt))).state,'pending');
 const completed=await until(async()=>{const p=await load();return p._yardV2.runtime.canonicalVisits[record.visitId].status==='completed'?p:null;});
 assert.equal(completed.yard.pendingGifts.length,original.yard.pendingGifts.length+1);
 assert.equal(completed.yard.pendingGifts.at(-1).createdAt,record.leavesAt);assert.equal(completed.yard.activeVisitors.length,0);
 assert.equal(completed.yard.bowls[0].servings,3);assert.equal(completed._yardV2.runtime.canonicalPlacements[0].uses,1);
 assert.equal(completed._yardV2.runtime.giftLedger[record.giftId].status,'earned');
 assert.equal((await c.reply(c.send('recover',owner,record.leavesAt+1))).code,'NO_UNRESOLVED_VISIT');
 const repeated=await load();assert.deepEqual(repeated.yard,completed.yard);assert.deepEqual(repeated._yardV2,completed._yardV2);
 t.diagnostic(JSON.stringify({database,owner,visitId:record.visitId,occRetries:[...a.messages,...b.messages].filter(m=>m.type==='occ-retry').length,
  winningHooks:[...a.messages,...b.messages].filter(m=>m.type==='winning-hook'),observations:[...a.messages,...b.messages,...c.messages].filter(m=>m.type==='observation').map(m=>m.value.state)}));
});
