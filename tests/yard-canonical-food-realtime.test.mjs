import './helpers/garden-r2-route-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{setTimeout as delay}from'node:timers/promises';
const {withPlayerLock}=await import('../playerManager.js');
const {fixture}=await import('./fixtures/canonical-reconciliation-fixture.mjs');
const {initializeReleasedPlayerYard,executeReleasedYardAction,releasedYardSnapshot}=await import('../game-logic/yard-v2/player-release.mjs');
const {closeCanonicalRuntime}=await import('../game-logic/yard-v2/canonical-runtime.mjs');
const {yardReleasePresentation}=await import('../src/games/companion-yard-v2/release-presentation.mjs');
test('committed food purchase realtime projection preserves the persistent Yard mount',async t=>{
 const previousNow=Date.now;Date.now=()=>1001;t.after(async()=>{delete globalThis.__gardenR2Socket;await closeCanonicalRuntime();Date.now=previousNow;});
 const id='food-realtime-owner';await withPlayerLock(id,p=>fixture(p));
 const end=performance.now()+35000;let ready=false;
 while(performance.now()<end&&!ready){await withPlayerLock(id,p=>{initializeReleasedPlayerYard(p,{now:1001,simulate:true});ready=releasedYardSnapshot(p,{now:1001}).yardRuntime.status==='ready';});if(!ready)await delay(20);}
 assert(ready);const emitted=[];globalThis.__gardenR2Socket={to:owner=>({emit(event,message){assert.equal(owner,id);assert.equal(event,'player_sync');emitted.push(JSON.parse(JSON.stringify(message.payload)));}})};
 await withPlayerLock(id,p=>{const r=executeReleasedYardAction(p,'yard.buyFood',{foodId:'bonito_bowl',qty:1},{now:1001,actionId:'yard-v2:realtime-buy'});assert.equal(r.status,200,JSON.stringify(r));});
 assert.equal(emitted.length,1);const snapshot={...emitted[0],player:{id}};
 const dir=new URL('../test-results/food-realtime/',import.meta.url);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(new URL('purchase-emission.json',dir),JSON.stringify(snapshot,null,2));
 assert.equal(snapshot.yard.currencies.shinyTreats,1);
 assert.equal(snapshot.yardRuntime.status,'ready','post-commit readiness must be rebound before realtime publication');
 assert.equal(yardReleasePresentation(snapshot,{canonicalSavedVisitsEnabled:true}),'persistent','a successful purchase must not quarantine and remount the Food dialog');
});

for(const storage of ['memory','occ-retry'])test(`committed projection hooks precede sync, ordinary hooks follow, and failed attempts do neither (${storage})`,async t=>{
 const {afterPlayerCommit}=await import('../playerManager.js');
 const {createDefaultPlayer}=await import('../game-logic/player.js');
 const id='projection-phase-'+storage,order=[];let attempt=0,updates=0;
 let row=createDefaultPlayer(id,'Projection test',Date.now());row._version='initial';
 t.after(()=>{delete globalThis.__gardenR2Socket;delete globalThis.__gardenR2TestDb;});
 globalThis.__gardenR2Socket={to:()=>({emit:()=>order.push('sync')})};
 if(storage==='occ-retry')globalThis.__gardenR2TestDb=async(strings,...values)=>{
  const query=strings.join('?');
  if(query.includes('INSERT INTO players'))return [];
  if(query.includes('SELECT data'))return [{data:structuredClone(row)}];
  if(query.includes('UPDATE players')){if(++updates===1){row._version='remote';return [];}row=structuredClone(values[0]);return [{id}];}
  throw Error('Unexpected SQL');
 };
 await withPlayerLock(id,p=>{
  const current=++attempt;
  afterPlayerCommit(p,()=>order.push(`ordinary-${current}`));
  afterPlayerCommit(p,()=>order.push(`projection-${current}`),{beforeSync:true});
  afterPlayerCommit(p,()=>{throw Error('expected hook isolation');},{beforeSync:true});
  afterPlayerCommit(p,()=>order.push(`projection-second-${current}`),{beforeSync:true});
 });
 assert.equal(attempt,storage==='memory'?1:2);
 assert.deepEqual(order,[`projection-${attempt}`,`projection-second-${attempt}`,'sync',`ordinary-${attempt}`]);
 assert.throws(()=>afterPlayerCommit({},()=>{},{beforeSync:'yes'}),/must be boolean/);
});
