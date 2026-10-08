import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {guard,ownerGuard,verify} from './helpers/canonical-visit-pg-guard.mjs';
import {fixture} from './fixtures/canonical-reconciliation-fixture.mjs';
guard();
const {initDb,ensureDbSchema,closeDb}=await import('../db.js');
const sql=initDb();await ensureDbSchema();const database=await verify(sql);
const {withPlayerLock}=await import('../playerManager.js');
const {ensureCanonicalPlayerYard,publicCanonicalPlayerYard,closeCanonicalRuntime}=await import('../game-logic/yard-v2/canonical-runtime.mjs');
async function until(fn,timeout=90000){const end=performance.now()+timeout;while(performance.now()<end){const value=await fn();if(value)return value;await delay(20);}throw Error('PICKUP_PG_TIMEOUT');}
function worker(){
 const messages=[],errors=[],child=fork(new URL('./helpers/canonical-pickup-pg-worker.mjs',import.meta.url),[],{execArgv:process.execArgv,env:{...process.env},stdio:['ignore','pipe','pipe','ipc']});
 child.on('message',message=>messages.push(message));child.stdout.on('data',()=>{});child.stderr.on('data',data=>errors.push(String(data)));let counter=0;
 return {child,messages,errors,ready:()=>until(()=>messages.find(m=>m.type==='ready'),20000),
  send(type,owner,now){const id=String(++counter);child.send({type,id,owner,now});return id;},
  async reply(id){const message=await until(()=>messages.find(m=>m.type==='reply'&&m.id===id));assert.equal(message.error,undefined,message.error);return message.value;},
  async close(){if(!child.connected)return;const id=String(++counter);child.send({type:'close',id});await until(()=>messages.find(m=>m.type==='reply'&&m.id===id),20000);await until(()=>child.exitCode!==null,20000);assert.equal(child.exitCode,0,errors.join(''));},
 };
}
test('actual PostgreSQL pickup loses one CAS, replays one nonce and preserves source visitor through process restart',{timeout:180000},async t=>{
 const owner='yard_visit_pg_'+randomUUID();ownerGuard(owner);const children=[];const originalNow=Date.now;let now=1001;Date.now=()=>now;
 t.after(async()=>{t.diagnostic(JSON.stringify({database,processMessages:children.map(w=>w.messages),errors:children.map(w=>w.errors)}));await Promise.all(children.map(w=>w.close().catch(()=>w.child.kill())));await closeCanonicalRuntime();await sql`DELETE FROM players WHERE id=${owner}`;await closeDb();Date.now=originalNow;});
 await withPlayerLock(owner,p=>fixture(p));
 const initial=await until(async()=>{let view;await withPlayerLock(owner,p=>{ensureCanonicalPlayerYard(p,{now,simulate:true});view=publicCanonicalPlayerYard(p,{now});});return view.status==='ready'&&view.canonicalVisits?.length?view:null;});
 const plan=initial.canonicalVisits[0].plan;now=plan.releaseAt;await closeCanonicalRuntime();
 const load=async()=>{const [row]=await sql`SELECT data FROM players WHERE id=${owner}`;return row.data;};
 const a=worker(),b=worker();children.push(a,b);await Promise.all([a.ready(),b.ready()]);
 // Preparation is not the race under test. Concurrent 20ms setup polls create
 // unrelated CAS writes before the controlled pickup barrier. Warm each proof
 // first, then deliberately collide both pickup transactions below.
 await a.reply(a.send('warm',owner,now));
 await b.reply(b.send('warm',owner,now));
 const before=await load(),ia=a.send('pickup',owner,now),ib=b.send('pickup',owner,now);
 const [ba,bb]=await Promise.all([until(()=>a.messages.find(m=>m.type==='barrier'&&m.id===ia)),until(()=>b.messages.find(m=>m.type==='barrier'&&m.id===ib))]);
 assert.equal(ba.version,bb.version,'separate processes reached the same actual PostgreSQL version');
 a.child.send({type:'release',id:ia});b.child.send({type:'release',id:ib});
 const results=await Promise.all([a.reply(ia),b.reply(ib)]);for(const result of results)assert.equal(result.status,200,result.error);
 assert.equal(results.filter(result=>result.replayed).length,1);
 assert.ok([...a.messages,...b.messages].some(m=>m.type==='occ-retry'),'real losing CAS must retry');
 const projections=[...a.messages,...b.messages].filter(m=>m.type==='winning-projection');assert.equal(projections.length,2);
 for(const projection of projections){assert.equal(projection.status,'ready',JSON.stringify(projection));assert.equal(projection.rows,0);assert.equal(projection.visitId,plan.visitId);}
 const after=await load();assert.deepEqual(after._yardV2.runtime.canonicalPlacements,[]);
 assert.equal(after.yard.goodieInventory.leaf_pot,(before.yard.goodieInventory.leaf_pot||0)+1);
 assert.deepEqual(after.yard.currencies,before.yard.currencies);assert.deepEqual(after.yard.bowls,before.yard.bowls);
 assert.deepEqual(after.yard.activeVisitors,before.yard.activeVisitors);
 assert.equal(Object.values(after._yardV2.runtime.commandReceipts).filter(r=>r.action==='yard.pickupGoodie'&&r.status===200).length,1);
 await Promise.all([a.close(),b.close()]);
 const c=worker();children.push(c);await c.ready();assert.equal((await c.reply(c.send('replay',owner,now))).replayed,true);
 const repeated=await load();assert.deepEqual(repeated.yard,after.yard);assert.deepEqual(repeated._yardV2,after._yardV2);
 const cold=await c.reply(c.send('warm',owner,now));assert.equal(cold.rows,0);assert.equal(cold.leavesAt,plan.leavesAt);
 await c.reply(c.send('tick',owner,plan.leavesAt));const done=await load();
 assert.equal(done.yard.activeVisitors.length,0);assert.equal(done.yard.pendingGifts.length,1);assert.equal(done.yard.pendingGifts[0].createdAt,plan.leavesAt);
 await c.reply(c.send('tick',owner,plan.leavesAt));assert.deepEqual((await load()).yard.pendingGifts,done.yard.pendingGifts);
});
