import {openHome,selectHomeGame} from '../e2e/helpers/home.js';
import {mergePanel,closeMergePanel,confirmedMergeClick,confirmMergeQuote} from '../e2e/helpers/mergeV3.js';
import {readBloxLayout} from '../e2e/helpers/blox-v2.js';
import {createBloxLineClearFixture} from '../e2e/helpers/bloxMotionFixture.js';
import {MERGE_LAB_CATALOG as catalog} from '../../game-logic/merge-lab-catalog.js';
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import postgres from 'postgres';
import {sign} from '@tma.js/init-data-node';
import {io} from 'socket.io-client';
import {assertProductionAcceptance,ACTORS,PRODUCTION_PORTS,FIXTURE_BOT_TOKEN,DATABASE_URL} from '../helpers/yard-production-guard.mjs';
import {productionFixture,insertFixture,readFixture,SPECS} from '../helpers/yard-production-fixtures.mjs';
import {setProxyState} from '../helpers/yard-production-proxy.mjs';
import {installEightCanvasWitness} from '../helpers/yard-eight-canvas-witness.mjs';
import {actorAtlasPages,attributedDraw} from '../helpers/yard-eight-atlas-attribution.mjs';
import {MOCHI_RUNTIME_MEDIA_REVISION} from '../../game-logic/yard-v2/mochi-actor-profile.mjs';
import {PEBBLE_MEDIA_REVISION} from '../../game-logic/yard-v2/pebble-actor-profile.mjs';
const inputs=assertProductionAcceptance(),runId=process.env.YARD_PRODUCTION_RUN_ID,out=resolve(process.env.YARD_PRODUCTION_EVIDENCE||''),fixtures=new Map();
assert.match(runId||'',/^[a-f0-9-]{36}$/);
const statePath=resolve(process.env.YARD_PRODUCTION_STATE||''),faultPath=resolve(process.env.YARD_PRODUCTION_FAULT||'');
const containerB=process.env.YARD_PRODUCTION_CONTAINER_B;assert.match(containerB||'',/^ccgh-yard-prod-[a-f0-9]{8}-b$/);
for(const path of [statePath,faultPath])assert.equal(path.startsWith(out+'/'),true,'Owned evidence paths required');
const origin=mode=>`http://127.0.0.1:${PRODUCTION_PORTS[mode]}`,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const actorPath=actor=>`/assets/${['mika','mochi','pebble','pip'].includes(actor)?`yard-${actor}`:`yard-family/${actor}`}/`;
let sql,metadata;
const auth=f=>sign({user:{id:Number(f.externalId),first_name:'Disposable fixture'}},FIXTURE_BOT_TOKEN,new Date());
const headers=f=>({Authorization:`tma ${auth(f)}`});
const saved=f=>readFixture(sql,f,runId);
async function seed(actor=null,marker){const f=productionFixture(actor);if(arguments.length===2)f.initial._yardV2=marker;await insertFixture(sql,f,runId);return f;}
async function snapshot(request,f,mode='B'){
 const before=Date.now(),response=await request.get(origin(mode)+'/api/player/snapshot',{headers:headers(f)}),after=Date.now();expect(response.status()).toBe(200);
 const body=await response.json();if(body.yardRuntime){expect(body.yardRuntime.serverNow).toBeGreaterThanOrEqual(before-2000);expect(body.yardRuntime.serverNow).toBeLessThanOrEqual(after+2000);}return body;
}
async function mutation(request,f,data,mode='B'){const response=await request.post(origin(mode)+'/api/player/mutate',{headers:headers(f),data});return {status:response.status(),body:await response.json()};}
async function boot(page,f){
 await page.addInitScript(installEightCanvasWitness);
 await page.addInitScript(({initData,user})=>{window.Telegram={WebApp:{initData,initDataUnsafe:{user}}};localStorage.setItem('garden_shelf_language','en');},{initData:auth(f),user:{id:Number(f.externalId),first_name:'Disposable fixture'}});
 await page.goto(origin('origin')+'/?tab=room');await expect(page.locator('.status-dot.ready')).toHaveCount(1,{timeout:30000});
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:30000}).toBe(true);
}
async function socketProof(f,invalid=false){
 const socket=io(origin('B'),{auth:{initData:invalid?'tampered':auth(f)},transports:['websocket'],forceNew:true,reconnection:false,timeout:10000});
 try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Socket authentication timed out')),12000);socket.once('authenticated',value=>{clearTimeout(timer);resolve({authenticated:value});});socket.once('connect_error',error=>{clearTimeout(timer);resolve({error:error.message});});});}finally{socket.disconnect();}
}
async function outbox(page,id){return page.evaluate(async accountId=>{
 const key=`game_hub_yard_outbox_v2:${encodeURIComponent(accountId)}`,local=localStorage.getItem(key);if(local)return JSON.parse(local);
 return new Promise((resolve,reject)=>{const r=indexedDB.open('keyval-store');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('keyval')){db.close();resolve(null);return;}const q=db.transaction('keyval','readonly').objectStore('keyval').get(key);q.onsuccess=()=>{db.close();resolve(q.result??null);};q.onerror=()=>{db.close();reject(q.error);};};});
},id);}
async function outboxForPoll(page,id){
 try{return await outbox(page,id);}catch(error){
  // The real updater may replace this document while IndexedDB is being read.
  // Let the existing bounded poll read the new document; other failures are real.
  if(/^(?:Error: )?page\.evaluate: Execution context was destroyed, most likely because of a navigation(?:\n|$)/.test(error?.message||''))return null;
  throw error;
 }
}
async function inspectPixels(page,request,info,actor){
 await expect(page.locator('.cy-app')).toBeVisible();
 const manifest=JSON.parse(metadata.B[actorPath(actor).slice(1)+'runtime-media.json']);
 const pages=actorAtlasPages(manifest,actorPath(actor));
 await expect.poll(async()=>{const rows=await page.evaluate(()=>window.__yardEightDrawWitness);return rows.some(row=>attributedDraw(row,pages));},{timeout:30000}).toBe(true);
 await expect(page.locator('.cy-status')).not.toContainText('The courtyard could not load.');
 const draws=await page.evaluate(()=>window.__yardEightDrawWitness),selected=draws.filter(row=>attributedDraw(row,pages));
 const manifestResponse=await request.get(origin('B')+actorPath(actor)+'runtime-media.json');expect(manifestResponse.status()).toBe(200);
 expect(await manifestResponse.text()).toBe(metadata.B[actorPath(actor).slice(1)+'runtime-media.json']);
 const media=[];
 for(const path of [...new Set(selected.map(row=>new URL(row.url).pathname))]){
  expect(path).toMatch(/^\/assets\/yard-[a-z0-9_/-]+\/[a-zA-Z0-9_.-]+\.webp$/);expect(path).not.toContain('..');
  const response=await request.get(origin('B')+path);expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('image/webp');
  const bytes=await response.body(),disk=execFileSync('docker',['exec',containerB,'cat',`dist${path}`],{timeout:15000,maxBuffer:20*1024*1024});expect(bytes.equals(disk)).toBe(true);
  media.push({path,bytes:bytes.length,sha256:sha(bytes)});
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await info.attach(`${actor}-actual-image-media-and-pixels`,{body:Buffer.from(JSON.stringify({actor,manifestSha256:sha(metadata.B[actorPath(actor).slice(1)+'runtime-media.json']),draws:selected,media},null,2)),contentType:'application/json'});
 await info.attach(`${actor}-ordinary-production`,{body:await page.screenshot(),contentType:'image/png'});
}
test.beforeAll(async()=>{
 sql=postgres(DATABASE_URL,{max:2,prepare:false});const [db]=await sql`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;
 expect(db.name).toBe('ccgh_yard_production_ci');expect(db.version).toBeGreaterThanOrEqual(150000);expect(db.version).toBeLessThan(160000);
 // The runner proves an empty owned database once, before the first worker.
 metadata={A:JSON.parse(await readFile(resolve(out,'metadata-A.json'),'utf8')),B:JSON.parse(await readFile(resolve(out,'metadata-B.json'),'utf8'))};
});
test.afterAll(async()=>{await sql?.end({timeout:5});});

test('ordinary production: eight current-time admissions, migration once, real auth/socket and fresh-process nonce durability',async({request},info)=>{
 const witnesses=[];
 for(const actor of ACTORS){
  const f=await seed(actor);fixtures.set(actor,f);expect((await saved(f))._yardV2).toBeUndefined();
  const s=await snapshot(request,f),p=await saved(f);expect(s.yardRuntime.mutable).toBe(true);expect(s.yardRuntime.actionProtocol).toBe('yard-v2:');expect(s.yardRuntime.visits).toHaveLength(1);
  const visit=s.yardRuntime.visits[0];expect(visit.visitorId).toBe(SPECS[actor].visitorId);expect(visit.source).toBe('yard-v2');expect(visit.arrivedAt).toBe(f.opportunity);expect(visit.leavesAt-Date.now()).toBeGreaterThan(25*60000);expect(visit.renderCompatible).toBe(true);
  expect(p._yardV2.migration.rawBackup.yard).toEqual(f.initial.yard);expect(p.yard.placedGoodies[0].uses).toBe(1);expect(p.yard.bowls[0].servings).toBe(0);expect(p.yard.pendingGifts).toEqual(f.initial.yard.pendingGifts);
  await snapshot(request,f);const again=await saved(f);expect(again._yardV2.migration).toEqual(p._yardV2.migration);expect(again._yardV2.runtime.visits).toEqual(p._yardV2.runtime.visits);
  witnesses.push({actor,accountId:f.id,serverNow:s.yardRuntime.serverNow,opportunity:f.opportunity,visit,migration:p._yardV2.migration.receipt});
 }
 const f=fixtures.get('mochi');
 expect((await socketProof(f)).authenticated).toMatchObject({success:true,provider:'telegram',accountId:f.id});expect((await socketProof(f,true)).error).toBeTruthy();
 for(const authorization of ['', 'dev synthetic', 'tma tampered', `tma ${sign({user:{id:Number(f.externalId),first_name:'Disposable fixture'}},'9000000001:different-disposable-bot',new Date())}`])expect((await request.get(origin('B')+'/api/player/snapshot',{headers:{Authorization:authorization}})).status()).toBe(401);
 const before=await saved(f),nonce=`yard-v2:production:${randomUUID()}`,data={accountId:f.id,action:'yard.collectGifts',payload:{},clientActionId:nonce};
 const foreign=await mutation(request,f,{...data,accountId:fixtures.get('pebble').id});expect(foreign.status).toBe(409);expect(foreign.body.error).toBe('ACCOUNT_CHANGED');
 expect((await saved(f)).yard).toEqual(before.yard);
 const first=await mutation(request,f,data);expect(first.status).toBe(200);expect(first.body.duplicate).toBe(false);
 const committed=await saved(f);expect(committed.yard.currencies.treats).toBe(before.yard.currencies.treats+17);expect(Object.keys(committed._yardV2.runtime.commandReceipts)).toEqual([nonce]);
 execFileSync('docker',['restart',containerB],{timeout:30000});
 await expect.poll(async()=>{try{return (await (await request.get(origin('B')+'/api/health')).json()).status;}catch{return ''; }},{timeout:60000}).toBe('ok');
 const replay=await mutation(request,f,data);expect(replay.status).toBe(200);expect(replay.body.duplicate).toBe(true);
 const after=await saved(f);expect(after.yard).toEqual(committed.yard);expect(after._yardV2).toEqual(committed._yardV2);
 const conflict=await mutation(request,f,{...data,payload:{unexpected:true}});expect(conflict.status).toBe(409);expect(conflict.body.error).toBe('ACTION_ID_PAYLOAD_CONFLICT');
 await info.attach('real-clock-admissions-and-durable-receipt',{body:Buffer.from(JSON.stringify({witnesses,nonce,receipt:after._yardV2.runtime.commandReceipts[nonce]},null,2)),contentType:'application/json'});
});

for(const actor of ['mochi','pebble','basil'])test(`ordinary production pixels and reload: ${actor}`,async({page,request},info)=>{
 await setProxyState(statePath,{target:'B'});const f=fixtures.get(actor);expect(f).toBeTruthy();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await boot(page,f);await inspectPixels(page,request,info,actor);const before=await saved(f);
 await page.reload();await expect(page.locator('.cy-app')).toBeVisible();await inspectPixels(page,request,info,actor);
 const after=await saved(f);expect(after._yardV2.migration).toEqual(before._yardV2.migration);expect(after._yardV2.runtime.visits).toEqual(before._yardV2.runtime.visits);expect(errors).toEqual([]);
});

const metadataUrls=[['mochi',MOCHI_RUNTIME_MEDIA_REVISION],['pebble',PEBBLE_MEDIA_REVISION]].map(([id,revision])=>`${actorPath(id)}runtime-media.json?v=${encodeURIComponent(revision)}`);
async function browserMetadata(page,mode){
 const actual=await page.evaluate(async urls=>Promise.all(urls.map(async url=>({url,text:await(await fetch(url)).text()}))),metadataUrls);
 for(const row of actual){const path=new URL(row.url,origin('origin')).pathname.slice(1);expect(row.text).toBe(metadata[mode][path]);}
 return actual.map(row=>({url:row.url,sha256:sha(row.text),manifest:JSON.parse(row.text)}));
}
async function waitUpdated(page,build){
 await expect.poll(()=>page.evaluate(()=>window.__APP_BUILD_ID__).catch(()=>''),{timeout:85000,intervals:[500,1000]}).toBe(build);
 expect(new URL(page.url()).searchParams.get('build')).toBe(build);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('gh_build_reload_guard'))?.buildId)).toBe(build);
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:30000}).toBe(true);
}
test('same-origin warm SW A to B to A: real updater, metadata, durable lost-reply outbox and quarantine',async({page,request},info)=>{
 test.setTimeout(240000);const f=await seed();await setProxyState(statePath,{target:'A'});await boot(page,f);
 await expect(page.locator('.companion-yard-stage')).toBeVisible();expect((await saved(f))._yardV2).toBeUndefined();
 await page.evaluate(()=>localStorage.setItem('yard-production-preserve','same-browser-storage'));
 const warmA=await browserMetadata(page,'A');for(const row of warmA)expect(row.manifest.playbackReady).toBe(false);
 expect((await page.evaluate(()=>caches.keys())).length).toBeGreaterThan(0);
 const history=[];page.on('response',response=>{if(new URL(response.url()).pathname==='/api/config')history.push(response.url());});
 await setProxyState(statePath,{target:'B'});await waitUpdated(page,inputs.activeCommit);await expect(page.locator('.cy-app')).toBeVisible();
 const warmB=await browserMetadata(page,'B');for(const row of warmB)expect(row.manifest.playbackReady).toBe(true);
 expect(warmB[0].manifest.runtimeActivated).toBe(true);expect(warmB[1].manifest.runtimeActivated).toBe(false);
 expect(warmA.map(row=>row.sha256)).not.toEqual(warmB.map(row=>row.sha256));
 const before=await saved(f);expect(before._yardV2.format).toBe('yard-persistent/v1');
 await setProxyState(statePath,{target:'B',dropCollect:true});
 await page.locator('.cy-actions button').nth(2).click();await page.getByRole('button',{name:'Collect',exact:true}).click();
 await expect.poll(async()=>{try{return JSON.parse(await readFile(faultPath,'utf8')).status;}catch{return 0;}},{timeout:30000}).toBe(200);
 const lost=JSON.parse(await readFile(faultPath,'utf8'));expect(lost.captureError).toBeUndefined();expect(lost.body.duplicate).toBe(false);expect(lost.command.clientActionId).toMatch(/^yard-v2:/);
 await expect.poll(async()=>(await outboxForPoll(page,f.id))?.items?.some(row=>row.clientActionId===lost.command.clientActionId)).toBe(true);
 const committed=await saved(f);expect(committed.yard.currencies.treats).toBe(before.yard.currencies.treats+17);
 expect(Object.hasOwn(committed._yardV2.runtime.commandReceipts,lost.command.clientActionId)).toBe(true);
 const browserPausedReply=page.waitForResponse(async response=>{
  if(new URL(response.url()).pathname!=='/api/player/mutate'||response.status()!==409)return false;
  const command=response.request().postDataJSON();if(command?.clientActionId!==lost.command.clientActionId)return false;
  return (await response.json()).error==='YARD_ROLLOUT_PAUSED';
 },{timeout:90000});
 // Restore ordinary A responses; its genuine 409 must retain the pending intent.
 await setProxyState(statePath,{target:'A'});const pausedResponse=await browserPausedReply;
 expect(pausedResponse.request().postDataJSON()).toMatchObject({accountId:f.id,clientActionId:lost.command.clientActionId,action:lost.command.action,payload:lost.command.payload});
 await expect.poll(async()=>(await outboxForPoll(page,f.id))?.items?.find(row=>row.clientActionId===lost.command.clientActionId)?.status,{timeout:15000}).toBe('rollout-paused');
 await waitUpdated(page,inputs.closedCommit);await expect(page.locator('[data-yard-read-only=true]')).toBeVisible();
 const warmAgain=await browserMetadata(page,'A');expect(warmAgain.map(row=>row.sha256)).toEqual(warmA.map(row=>row.sha256));
 await expect.poll(async()=>(await outboxForPoll(page,f.id))?.items?.find(row=>row.clientActionId===lost.command.clientActionId)?.status,{timeout:15000}).toBe('rollout-paused');
 const pending=await outbox(page,f.id),retained=pending?.items?.find(row=>row.clientActionId===lost.command.clientActionId);expect(retained).toMatchObject({accountId:f.id,clientActionId:lost.command.clientActionId,action:lost.command.action,payload:lost.command.payload});
 const paused=await mutation(request,f,lost.command,'A');expect(paused.status).toBe(409);expect(paused.body.error).toBe('YARD_ROLLOUT_PAUSED');
 const after=await saved(f);expect(after.yard).toEqual(committed.yard);expect(after._yardV2).toEqual(committed._yardV2);expect(after._yardV2.migration).toEqual(before._yardV2.migration);
 expect(await page.evaluate(()=>localStorage.getItem('yard-production-preserve'))).toBe('same-browser-storage');expect(history.some(url=>url.includes('buildCheck='))).toBe(true);
 await info.attach('same-origin-A-B-A',{body:Buffer.from(JSON.stringify({origin:origin('origin'),builds:[inputs.closedCommit,inputs.activeCommit,inputs.closedCommit],metadata:[warmA,warmB,warmAgain].map(rows=>rows.map(({url,sha256})=>({url,sha256}))),configChecks:history,browserPausedReply:{status:pausedResponse.status(),body:await pausedResponse.json()},retained,receipt:after._yardV2.runtime.commandReceipts[lost.command.clientActionId]},null,2)),contentType:'application/json'});
 await info.attach('rolled-back-read-only-shell',{body:await page.screenshot(),contentType:'image/png'});
});

test('frozen closed A quarantines every marker class and keeps untouched accounts legacy',async({request},info)=>{
 const rows=[];
 for(const marker of [null,false,0,'future',[],{}, {format:'future',version:99}, {format:'yard-persistent/v1',version:1}]){
  const f=await seed(null,marker),before=await saved(f),s=await snapshot(request,f,'A');expect(s.yardRuntime.mutable).toBe(false);expect(s.yardRuntime.error).toBe('YARD_ROLLOUT_PAUSED');
  const result=await mutation(request,f,{accountId:f.id,action:'yard.collectGifts',payload:{},clientActionId:`yard-v2:${randomUUID()}`},'A');expect(result.status).toBe(409);
  const after=await saved(f);expect(after.yard).toEqual(before.yard);expect(after._yardV2).toEqual(marker);rows.push({marker,status:result.status});
 }
 const legacy=await seed(),s=await snapshot(request,legacy,'A');expect(s.yardRuntime).toBeUndefined();expect((await saved(legacy))._yardV2).toBeUndefined();
 const result=await mutation(request,legacy,{accountId:legacy.id,action:'yard.buyFood',payload:{foodId:'kibble',qty:1},clientActionId:`legacy:${randomUUID()}`},'A');expect(result.status).toBe(200);expect((await saved(legacy))._yardV2).toBeUndefined();
 await info.attach('closed-all-marker-classes',{body:Buffer.from(JSON.stringify(rows,null,2)),contentType:'application/json'});
});

// Cross-game acceptance uses the same signed, owned PostgreSQL fixtures and
// ordinary B image as the production gate. No mocked HTTP replies or private-store writes.
async function crossSceneReady(page){
 await expect.poll(()=>page.locator('.cy-background').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 await expect.poll(()=>page.locator('.cy-scene canvas').evaluate(canvas=>{
  if(!canvas.width||!canvas.height)return false;const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>0&&++pixels>=32)return true;return false;
 })).toBe(true);
 await expect(page.locator('.cy-status')).not.toContainText('The courtyard could not load.');
}
async function crossHome(page){
 if(await page.getByTestId('home-catalogue').count())return;
 // Route ownership precedes lazy controller mount; choose the mounted route's Home control.
 await expect(page.locator('.game-entry-status')).toHaveCount(0);
 const route=await page.locator('.telegram-app').getAttribute('data-active-tab');
 if(route==='room')await page.getByRole('button',{name:'Back to games',exact:true}).click();
 else await openHome(page);
}
async function crossSelect(page,id){await crossHome(page);await selectHomeGame(page,id);}
// Successful receipt replay builds an ordinary snapshot. At full energy,
// calcRegen updates only this clock field even though no energy is awarded.
function assertReplayWallet(actual,expected,{startedAt,finishedAt}){
 const prior=expected.energy.lastRegenTimestamp,next=actual.energy.lastRegenTimestamp;
 assert.ok(Number.isSafeInteger(prior)&&Number.isSafeInteger(next),'Persisted regeneration clocks must be integers');
 assert.ok(expected.energy.max>0 && expected.energy.current===expected.energy.max,'This fixture must have full energy');
 assert.ok(next>=prior,'Regeneration clock must not move backwards');
 assert.ok(next===prior || (next>=startedAt && next<=finishedAt),'An advanced regeneration clock must match the real replay observation window');
 assert.deepEqual(actual,{...expected,energy:{...expected.energy,lastRegenTimestamp:next}});
}
const researchPath=['cloud_ember_spark','glass_spark_lens','v3_lens_spark_light','v3_light_vial_glow_lantern','v3_sprout_dew_herb','vial_herb_elixir','v3_glass_elixir_crystal'];
const craftPath=['glass_spark_lens','v3_lens_spark_light','v3_light_vial_glow_lantern','vial_herb_elixir','v3_glass_elixir_crystal'];

test('cross-game actual B: authentic Merge Moon Lamp enters Yard, places once and persists in PostgreSQL',async({page,request},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await setProxyState(statePath,{target:'B'});const f=await seed();await boot(page,f);await crossSelect(page,'merge');
 await expect(page.getByTestId('ml-laboratory')).toBeVisible();const before=await snapshot(request,f);
 expect(before.merge.stock).toEqual({});expect(before.yard.goodieInventory.moon_lamp||0).toBe(0);
 for(const id of researchPath){
  if(await page.getByTestId('ml-research-again').count())await page.getByTestId('ml-research-again').click();
  const recipe=catalog.recipes.find(r=>r.id===id);
  for(const [slot,item] of recipe.ingredients.entries()){await page.getByTestId(`ml-well-${slot}`).click();await page.getByTestId(`ml-sample-pick-${item}`).click();}
  const result=await confirmedMergeClick(page,page.getByTestId('ml-mix'),'researchPair');expect(result.body.mergeLab.result.recipeId).toBe(id);
 }
 await mergePanel(page,'supplies');await page.getByTestId('ml-starter-kit').click();await confirmMergeQuote(page,'claimStarterKit');
 await confirmedMergeClick(page,page.getByTestId('ml-claim-charges'),'claimFreeCharges');
 for(const [item,n] of Object.entries({glass:2,vial:1,spark:2,herb:1})){await page.getByTestId('ml-supply-material').selectOption(item);await page.getByTestId('ml-claim-material').click();await confirmMergeQuote(page,'claimSupply',n);}
 await page.getByTestId('ml-distill-glass').click();await confirmMergeQuote(page,'distillStock');await closeMergePanel(page);
 await mergePanel(page,'journal');
 for(const id of craftPath){const recipe=catalog.recipes.find(r=>r.id===id);await page.getByTestId('ml-journal').locator('select').selectOption(recipe.result);await page.getByTestId(`ml-recipe-quote-${id}`).click();await confirmMergeQuote(page,'craft');}
 await closeMergePanel(page);await mergePanel(page,'projects');await page.getByTestId('ml-project-quote-night_beacon').click();
 const craft=await confirmMergeQuote(page,'craftProject');expect(craft.body.mergeLab.replayed).toBe(false);
 const granted=await saved(f);expect(granted.yard.goodieInventory.moon_lamp).toBe(1);expect(granted.merge.projects.crafted.night_beacon).toBe(1);
 await closeMergePanel(page);await crossSelect(page,'room');await expect(page.locator('.cy-app')).toBeVisible();await crossSceneReady(page);
 await page.locator('.cy-actions button').nth(1).click();
 const lamp=page.locator('.cy-row').filter({has:page.locator('strong',{hasText:/^Moon Lamp × 1$/})});await expect(lamp).toBeVisible();
 await lamp.getByRole('button',{name:'Place',exact:true}).click();
 // Source-authored moon-lamp anchor from the same ordinary B production fixtures.
 const field=page.locator('.cy-scene canvas');await expect(field).toBeFocused();
 for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');for(let i=0;i<10;i++)await page.keyboard.press('ArrowDown');
 const place=page.locator('.cy-placement').getByRole('button',{name:'Place',exact:true});await expect(place).toBeEnabled();
 const placedReply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action==='yard.placeGoodie');
 await place.click();const reply=await placedReply;expect(reply.status()).toBe(200);const placeCommand=reply.request().postDataJSON();
 const placed=await saved(f);expect(placed.yard.goodieInventory.moon_lamp||0).toBe(0);expect(placed.yard.placedGoodies.filter(p=>p.goodieId==='moon_lamp')).toHaveLength(1);
 expect(placed.merge).toEqual(granted.merge);expect(placed.resources.gachaTokens).toBe(before.resources.gachaTokens);
 await crossSelect(page,'settlement');await expect(page.locator('.settlement-canvas')).toBeVisible();await crossSelect(page,'room');await page.reload();
 await expect(page.locator('.cy-app')).toBeVisible();await crossSceneReady(page);
 const reloaded=await saved(f);expect(reloaded.yard.placedGoodies).toEqual(placed.yard.placedGoodies);expect(reloaded.yard.goodieInventory).toEqual(placed.yard.goodieInventory);
 const craftReplay=await mutation(request,f,craft.request);expect(craftReplay.status).toBe(200);expect(craftReplay.body.mergeLab.replayed).toBe(true);
 const placeReplay=await mutation(request,f,placeCommand);expect(placeReplay.status).toBe(200);expect(placeReplay.body.duplicate).toBe(true);
 const final=await saved(f);expect(final.yard.goodieInventory).toEqual(placed.yard.goodieInventory);expect(final.yard.placedGoodies).toEqual(placed.yard.placedGoodies);expect(final.merge).toEqual(granted.merge);
 await info.attach('cross-game-moon-lamp',{body:Buffer.from(JSON.stringify({account:f.id,craft:craft.request,place:placeCommand,placed:final.yard.placedGoodies,source:'ordinary B signed API + PostgreSQL + real UI'})),contentType:'application/json'});
 await info.attach('cross-game-moon-lamp-reloaded',{body:await page.screenshot(),contentType:'image/png'});expect(errors).toEqual([]);
});

test('cross-game actual B: three fixture-assisted real Blox finishes fund one Merge pack exactly once',async({page,request},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setProxyState(statePath,{target:'B'});const f=await seed();await boot(page,f);
 expect((await snapshot(request,f)).resources.gachaTokens).toBe(0);const earns=[];
 for(let run=0;run<3;run++){
  await crossSelect(page,'blox');const started=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action==='blox.start');
  await page.getByRole('button',{name:'Start',exact:true}).click();expect((await started).status()).toBe(200);
  expect((await saved(f)).blox.activeGame).toBe(true);
  // Setup is explicitly a near-threshold saved-run fixture, never a token grant.
  // The final row clear and finish are actual UI/controller/server actions.
  const fixture=createBloxLineClearFixture();fixture.savedState.score=3498;
  const setup=await mutation(request,f,{accountId:f.id,action:'blox.sync',payload:{savedState:fixture.savedState},clientActionId:`cross-setup:${randomUUID()}`});expect(setup.status).toBe(200);
  await page.reload();await expect(page.locator('.bx-stage')).toHaveAttribute('data-bx-phase','playing');const layout=await readBloxLayout(page),slot=layout.slots[2];
  await page.touchscreen.tap(slot.left+slot.width/2,slot.top+slot.height/2);
  const clear=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action==='blox.place');
  await page.touchscreen.tap(layout.left+8.5*layout.cell,layout.top+4.5*layout.cell);const response=await clear;expect(response.status()).toBe(200);
  const result=await response.json();expect(result.clear.cleared).toBe(1);expect(result.savedState.score).toBe(3510);
  const finish=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action==='blox.end');await crossSelect(page,'merge');
  const finished=await finish;expect(finished.status()).toBe(200);const earned=await finished.json();expect(earned.tokenReward).toBe(4);
  const walletObservedAt=Date.now(),savedOnce=await saved(f);expect(savedOnce.resources.gachaTokens).toBe(4*(run+1));
  // The ordinary Blox UI does not assign an action ID to finish. Its repeat must
  // hit the terminal-session fence, not claim a nonexistent same-ID receipt.
  const finishCommand=finished.request().postDataJSON();expect(finishCommand.clientActionId).toBeUndefined();
  expect(savedOnce.blox.activeGame).toBe(false);
  const replay=await mutation(request,f,finishCommand);expect(replay.status).toBe(403);expect(replay.body.error).toBe('No active Blox session');
  const afterReplay=await saved(f);assertReplayWallet(afterReplay.resources,savedOnce.resources,{startedAt:walletObservedAt,finishedAt:Date.now()});expect(afterReplay.blox).toEqual(savedOnce.blox);
  const clearCommand=response.request().postDataJSON();expect(clearCommand.clientActionId).toEqual(expect.any(String));
  const clearReplay=await mutation(request,f,clearCommand);expect(clearReplay.status).toBe(200);expect(clearReplay.body.duplicate).toBe(true);
  const savedAfterClearReplay=await saved(f);
  assertReplayWallet(savedAfterClearReplay.resources,savedOnce.resources,{startedAt:walletObservedAt,finishedAt:Date.now()});
  expect(clearReplay.body.snapshot.resources.energy.lastRegenTimestamp).toBeLessThanOrEqual(clearReplay.body.snapshot.serverTime);
  expect(savedAfterClearReplay.resources.energy.lastRegenTimestamp).toBeGreaterThanOrEqual(clearReplay.body.snapshot.resources.energy.lastRegenTimestamp);
  expect(savedAfterClearReplay.blox).toEqual(savedOnce.blox);
  earns.push({seededScore:3498,realFinalScore:3510,tokenReward:earned.tokenReward,command:finished.request().postDataJSON()});
 }
 const funded=await saved(f);expect(funded.resources.gachaTokens).toBe(12);await mergePanel(page,'supplies');
 await page.getByTestId('ml-pack-workshop').click();const purchase=await confirmMergeQuote(page,'buySupply');expect(purchase.body.mergeLab.replayed).toBe(false);
 const bought=await saved(f),pack=catalog.tokenPacks.find(p=>p.id==='workshop');expect(bought.resources.gachaTokens).toBe(12-pack.cost);
 for(const [id,n] of Object.entries(pack.items))expect(bought.merge.stock[id]).toBe((funded.merge.stock[id]||0)+n);
 expect(bought.resources.gold).toBe(funded.resources.gold);expect(bought.yard.goodieInventory).toEqual(funded.yard.goodieInventory);
 await page.reload();await expect(page.getByTestId('ml-laboratory')).toBeVisible();
 const repeated=await mutation(request,f,purchase.request);expect(repeated.status).toBe(200);expect(repeated.body.mergeLab.replayed).toBe(true);
 const final=await saved(f);expect(final.resources.gachaTokens).toBe(bought.resources.gachaTokens);expect(final.merge.stock).toEqual(bought.merge.stock);expect(final.merge.actionLedger).toEqual(bought.merge.actionLedger);
 await info.attach('cross-game-earned-token-pack',{body:Buffer.from(JSON.stringify({account:f.id,fixtureAssisted:true,earns,purchase:purchase.request,tokensBefore:12,tokensAfter:final.resources.gachaTokens,stock:final.merge.stock})),contentType:'application/json'});expect(errors).toEqual([]);
});

test('cross-game actual B: all eight real routes survive rapid Home ownership and reload',async({page,request},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setProxyState(statePath,{target:'B'});const f=await seed();await boot(page,f);
 const roots={garden:'.gs2-stage',blox:'.bx-stage',match3:'.m3-stage',merge:'.ml-root',bubbo:'.bb-stage',trivia:'.trv2-root',room:'.cy-app',settlement:'.settlement-game-root'};
 for(const id of ['garden','blox','match3','merge','bubbo','trivia','room','settlement']){await crossSelect(page,id);await expect(page.locator(roots[id])).toBeVisible();expect((await snapshot(request,f)).player.id).toBe(f.id);}
 await page.reload();await expect(page.locator(roots.settlement)).toBeVisible();await crossHome(page);
 // Synchronous clicks are an actual DOM event race, not a navigation/store hook.
 await page.locator('[data-home-game="merge"]').evaluate(node=>{node.click();document.querySelector('[data-home-game="room"]')?.click();document.querySelector('[data-home-game="settlement"]')?.click();});
 await expect(page.getByTestId('home-catalogue')).toHaveCount(0);await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','merge');await expect(page.locator(roots.merge)).toBeVisible();
 await page.reload();await expect(page.locator(roots.merge)).toBeVisible();expect(new URL(page.url()).searchParams.get('tab')).toBe('merge');
 await crossSelect(page,'room');await expect(page.locator(roots.merge)).toHaveCount(0);await crossSelect(page,'settlement');await expect(page.locator(roots.room)).toHaveCount(0);
 await info.attach('all-eight-real-routes',{body:await page.screenshot(),contentType:'image/png'});expect(errors).toEqual([]);
});
