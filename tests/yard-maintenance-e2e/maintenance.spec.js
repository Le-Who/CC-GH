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
import {ACTORS,PRODUCTION_PORTS,FIXTURE_BOT_TOKEN,DATABASE_URL} from '../helpers/yard-production-guard.mjs';
import {productionFixture,insertFixture,readFixture,SPECS} from '../helpers/yard-production-fixtures.mjs';
import {setProxyState} from '../helpers/yard-production-proxy.mjs';
import {installEightCanvasWitness} from '../helpers/yard-eight-canvas-witness.mjs';
import {actorAtlasPages,attributedDraw} from '../helpers/yard-eight-atlas-attribution.mjs';
import {MOCHI_RUNTIME_MEDIA_REVISION} from '../../game-logic/yard-v2/mochi-actor-profile.mjs';
import {PEBBLE_MEDIA_REVISION} from '../../game-logic/yard-v2/pebble-actor-profile.mjs';
import {loadMaintenanceInputs,outboxPresenceForPoll,assertMaintenanceDeliveredMedia} from '../helpers/yard-maintenance-guard.mjs';
const inputs=loadMaintenanceInputs(),runId=process.env.YARD_PRODUCTION_RUN_ID,out=resolve(process.env.YARD_PRODUCTION_EVIDENCE||'');
assert.match(runId||'',/^[a-f0-9-]{36}$/);
const statePath=resolve(process.env.YARD_PRODUCTION_STATE||''),faultPath=resolve(process.env.YARD_PRODUCTION_FAULT||'');
const containerB=process.env.YARD_PRODUCTION_CONTAINER_B;assert.match(containerB||'',/^ccgh-yard-prod-[a-f0-9]{8}-b$/);
const containerP=process.env.YARD_MAINTENANCE_CONTAINER_P;assert.equal(containerP,`ccgh-yard-prod-${runId.slice(0,8)}-a`);assert.equal(containerB,`ccgh-yard-prod-${runId.slice(0,8)}-b`);
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
test.beforeAll(async()=>{sql=postgres(DATABASE_URL,{max:2,prepare:false});const [db]=await sql`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;expect(db.name).toBe('ccgh_yard_production_ci');expect(db.version).toBeGreaterThanOrEqual(150000);expect(db.version).toBeLessThan(160000);
 metadata={A:JSON.parse(await readFile(resolve(out,'metadata-A.json'),'utf8')),B:JSON.parse(await readFile(resolve(out,'metadata-B.json'),'utf8'))};
});
test.afterAll(async()=>{await sql?.end({timeout:5});});
async function waitUpdated(page,build){await expect.poll(()=>page.evaluate(()=>window.__APP_BUILD_ID__).catch(()=>''),{timeout:85000,intervals:[500,1000]}).toBe(build);expect(new URL(page.url()).searchParams.get('build')).toBe(build);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('gh_build_reload_guard'))?.buildId)).toBe(build);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:30000}).toBe(true);}
const savedProgress=p=>({currencies:p.yard.currencies,foodInventory:p.yard.foodInventory,goodieInventory:p.yard.goodieInventory,placedGoodies:p.yard.placedGoodies,receipts:p._yardV2.runtime.commandReceipts,migration:p._yardV2.migration,resources:p.resources,garden:p.garden,farm:p.farm,merge:p.merge});
function assertSavedProgress(actual,expected,window){
 assertReplayWallet(actual.resources,expected.resources,window);
 assert.deepEqual(savedProgress(actual),{...savedProgress(expected),resources:actual.resources});
}
async function observedSaved(f){const startedAt=Date.now();return {value:await saved(f),startedAt};}
async function preservedProgress(f,prior,reply){
 const current=await observedSaved(f),window={startedAt:prior.startedAt,finishedAt:Date.now()};assertSavedProgress(current.value,prior.value,window);
 if(reply){assert.ok(Number.isSafeInteger(reply.serverTime)&&reply.serverTime>=window.startedAt&&reply.serverTime<=window.finishedAt);
  // buildSnapshot projects these two aliases from farm.harvested; persisted
  // resources remain compared above without removing or ignoring any key.
  assertReplayWallet(reply.resources,{...prior.value.resources,harvested:{...prior.value.farm?.harvested},harvestedCrops:{...prior.value.farm?.harvested}},window);
  expect(reply.resources.energy.lastRegenTimestamp).toBeLessThanOrEqual(reply.serverTime);expect(current.value.resources.energy.lastRegenTimestamp).toBeGreaterThanOrEqual(reply.resources.energy.lastRegenTimestamp);}
 return current;
}
const metadataUrls=[['mochi',MOCHI_RUNTIME_MEDIA_REVISION],['pebble',PEBBLE_MEDIA_REVISION]].map(([id,revision])=>`${actorPath(id)}runtime-media.json?v=${encodeURIComponent(revision)}`);
async function browserMetadata(page,mode){
 const actual=await page.evaluate(async urls=>Promise.all(urls.map(async url=>{const response=await fetch(url);return {url,status:response.status,text:await response.text()};})),metadataUrls);
 for(const row of actual){expect(row.status).toBe(200);const path=new URL(row.url,origin('origin')).pathname.slice(1);expect(row.text).toBe(metadata[mode][path]);}
 const rows=actual.map(row=>({url:row.url,sha256:sha(row.text),manifest:JSON.parse(row.text)}));
 for(const row of rows)expect(row.manifest.playbackReady).toBe(true);expect(rows[0].manifest.runtimeActivated).toBe(true);expect(rows[1].manifest.runtimeActivated).toBe(false);
 return rows;
}
async function inspectWarmPixels(page,request,info,actor,mode,phase){
 await expect(page.locator('.cy-app')).toBeVisible();
 const manifestText=metadata[mode][actorPath(actor).slice(1)+'runtime-media.json'],pages=actorAtlasPages(JSON.parse(manifestText),actorPath(actor));
 await expect.poll(async()=>{const rows=await page.evaluate(()=>window.__yardEightDrawWitness);return rows.some(row=>row.sceneCanvas&&attributedDraw(row,pages));},{timeout:30000}).toBe(true);
 const selected=(await page.evaluate(()=>window.__yardEightDrawWitness)).filter(row=>row.sceneCanvas&&attributedDraw(row,pages));expect(selected.length).toBeGreaterThan(0);
 await expect(page.locator('.cy-status')).not.toContainText('The courtyard could not load.');
 const manifestResponse=await request.get(origin(mode)+actorPath(actor)+'runtime-media.json');expect(manifestResponse.status()).toBe(200);expect(await manifestResponse.text()).toBe(manifestText);
 const media=[];
 for(const path of [...new Set(selected.map(row=>new URL(row.url).pathname))]){
  expect(path).toMatch(/^\/assets\/yard-[a-z0-9_/-]+\/[a-zA-Z0-9_.-]+\.webp$/);expect(path).not.toContain('..');
  const browser=await page.evaluate(async path=>{const response=await fetch(path),bytes=await response.arrayBuffer();return {path,status:response.status,contentType:response.headers.get('content-type')||'',bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('')};},path);
  const response=await request.get(origin(mode)+path),disk=execFileSync('docker',['exec',mode==='A'?containerP:containerB,'cat',`dist${path}`],{timeout:15000,maxBuffer:20*1024*1024});
  media.push(assertMaintenanceDeliveredMedia({browser,http:{status:response.status(),contentType:response.headers()['content-type']||'',bytes:await response.body()},disk,path}));
 }
 await info.attach(`${phase}-${actor}-delivered-media-and-pixels`,{body:Buffer.from(JSON.stringify({actor,mode,build:await page.evaluate(()=>window.__APP_BUILD_ID__),manifestSha256:sha(manifestText),draws:selected,media},null,2)),contentType:'application/json'});
 await info.attach(`${phase}-${actor}-ordinary-image`,{body:await page.screenshot(),contentType:'image/png'});
}

test('ACTIVE persistence P-C-P preserves progress and durable replay',async({request},info)=>{
 const f=await seed();const first=await snapshot(request,f,'A');expect(first.yardRuntime.mutable).toBe(true);const before=await saved(f);
 for(const mode of ['A','B'])for(const authorization of ['', 'dev synthetic', 'tma tampered'])expect((await request.get(origin(mode)+'/api/player/snapshot',{headers:{Authorization:authorization}})).status()).toBe(401);
 expect((await socketProof(f)).authenticated).toMatchObject({success:true,provider:'telegram',accountId:f.id});expect((await socketProof(f,true)).error).toBeTruthy();
 const foreign=await seed();for(const mode of ['A','B']){const rejected=await mutation(request,f,{accountId:foreign.id,action:'yard.collectGifts',payload:{},clientActionId:`yard-v2:foreign:${randomUUID()}`},mode);expect(rejected.status).toBe(409);expect(rejected.body.error).toBe('ACCOUNT_CHANGED');}
 const pCommand={accountId:f.id,action:'yard.collectGifts',payload:{},clientActionId:`yard-v2:maintenance-p:${randomUUID()}`};
 const p=await mutation(request,f,pCommand,'A');expect(p.status).toBe(200);expect(p.body.duplicate).toBe(false);const observedP=await observedSaved(f),afterP=observedP.value;expect(afterP.yard.currencies.treats).toBe(before.yard.currencies.treats+17);
 const loaded=await snapshot(request,f,'B');expect(loaded.yardRuntime.mutable).toBe(true);await preservedProgress(f,observedP,loaded);
 const cCommand={accountId:f.id,action:'yard.buyFood',payload:{foodId:'kibble',qty:1},clientActionId:`yard-v2:maintenance-c:${randomUUID()}`};
 const c=await mutation(request,f,cCommand,'B');expect(c.status).toBe(200);expect(c.body.duplicate).toBe(false);let progress=await observedSaved(f);const afterC=progress.value;expect(afterC.yard.currencies.treats).toBeLessThan(afterP.yard.currencies.treats);expect(afterC.yard.foodInventory.kibble).toBeGreaterThan(afterP.yard.foodInventory.kibble||0);
 execFileSync('docker',['restart',containerP],{timeout:30000});
 await expect.poll(async()=>{try{return await(await request.get(origin('A')+'/api/health')).json();}catch{return null;}},{timeout:60000}).toMatchObject({status:'ok',buildId:inputs.closedCommit,postgres:true});
 const restored=await snapshot(request,f,'A');expect(restored.yardRuntime.mutable).toBe(true);progress=await preservedProgress(f,progress,restored);
 for(const command of [pCommand,cCommand]){const replay=await mutation(request,f,command,'A');expect(replay.status).toBe(200);expect(replay.body.duplicate).toBe(true);progress=await preservedProgress(f,progress,replay.body.snapshot);}
 expect(afterC._yardV2.migration).toEqual(before._yardV2.migration);
 const again=await mutation(request,f,cCommand,'B');expect(again.status).toBe(200);expect(again.body.duplicate).toBe(true);await preservedProgress(f,progress,again.body.snapshot);
 await info.attach('P-C-P-durable-progress',{body:Buffer.from(JSON.stringify({builds:[inputs.closedCommit,inputs.activeCommit,inputs.closedCommit],commands:[pCommand,cCommand],after:savedProgress(afterC)})),contentType:'application/json'});
});

test('same-origin ACTIVE P-C-P preserves lost-reply intent and service-worker state',async({page,request},info)=>{
 test.setTimeout(300000);const f=await seed('mochi');await setProxyState(statePath,{target:'A'});await boot(page,f);await expect(page.locator('.cy-app')).toBeVisible();expect((await snapshot(request,f,'A')).yardRuntime.mutable).toBe(true);expect(await page.evaluate(()=>window.__APP_BUILD_ID__)).toBe(inputs.closedCommit);
 const history=[];page.on('response',response=>{if(new URL(response.url()).pathname==='/api/config')history.push(response.url());});
 const warmP=await browserMetadata(page,'A');await inspectWarmPixels(page,request,info,'mochi','A','initial-P');
 await page.evaluate(()=>localStorage.setItem('maintenance-retained','same-browser'));expect((await page.evaluate(()=>caches.keys())).length).toBeGreaterThan(0);
 await setProxyState(statePath,{target:'B'});await waitUpdated(page,inputs.activeCommit);await expect(page.locator('.cy-app')).toBeVisible();const warmC=await browserMetadata(page,'B');await inspectWarmPixels(page,request,info,'mochi','B','candidate-C');const before=await saved(f);
 await setProxyState(statePath,{target:'B',dropCollect:true});await page.locator('.cy-actions button').nth(2).click();await page.getByRole('button',{name:'Collect',exact:true}).click();
 await expect.poll(async()=>{try{return JSON.parse(await readFile(faultPath,'utf8')).status;}catch{return 0;}},{timeout:30000}).toBe(200);
 const lost=JSON.parse(await readFile(faultPath,'utf8'));expect(lost.captureError).toBeUndefined();expect(lost.body.duplicate).toBe(false);await expect.poll(()=>outboxPresenceForPoll(()=>outbox(page,f.id),lost.command.clientActionId)).toBe('pending');
 let progress=await observedSaved(f);const committed=progress.value;expect(committed.yard.currencies.treats).toBe(before.yard.currencies.treats+17);expect(Object.hasOwn(committed._yardV2.runtime.commandReceipts,lost.command.clientActionId)).toBe(true);
 const replayed=page.waitForResponse(async response=>new URL(response.url()).pathname==='/api/player/mutate'&&response.request().postDataJSON()?.clientActionId===lost.command.clientActionId&&response.status()===200&&(await response.json()).duplicate===true,{timeout:90000});
 await setProxyState(statePath,{target:'A'});const replayResponse=await replayed;expect(replayResponse.request().postDataJSON()).toMatchObject(lost.command);await waitUpdated(page,inputs.closedCommit);await expect(page.locator('.cy-app')).toBeVisible();
 await expect.poll(()=>outboxPresenceForPoll(()=>outbox(page,f.id),lost.command.clientActionId)).toBe('drained');
 const warmAgain=await browserMetadata(page,'A');expect(warmAgain.map(row=>row.sha256)).toEqual(warmP.map(row=>row.sha256));await inspectWarmPixels(page,request,info,'mochi','A','rollback-P');
 progress=await preservedProgress(f,progress,(await replayResponse.json()).snapshot);expect(await page.evaluate(()=>localStorage.getItem('maintenance-retained'))).toBe('same-browser');
 await setProxyState(statePath,{target:'B'});await waitUpdated(page,inputs.activeCommit);const warmFinal=await browserMetadata(page,'B');expect(warmFinal.map(row=>row.sha256)).toEqual(warmC.map(row=>row.sha256));await inspectWarmPixels(page,request,info,'mochi','B','restored-C');const again=await mutation(request,f,lost.command,'B');expect(again.status).toBe(200);expect(again.body.duplicate).toBe(true);await preservedProgress(f,progress,again.body.snapshot);
 expect(history.some(url=>url.includes('buildCheck='))).toBe(true);
 await info.attach('ACTIVE-P-C-P-delivered-metadata',{body:Buffer.from(JSON.stringify({builds:[inputs.closedCommit,inputs.activeCommit,inputs.closedCommit,inputs.activeCommit],metadata:[warmP,warmC,warmAgain,warmFinal].map(rows=>rows.map(({url,sha256})=>({url,sha256}))),configChecks:history,command:lost.command},null,2)),contentType:'application/json'});
 await info.attach('ACTIVE-P-C-P-warm-browser',{body:await page.screenshot(),contentType:'image/png'});
});

test('ACTIVE storage rejects invalid and future markers without mutation',async({request},info)=>{
 for(const mode of ['A','B'])for(const marker of [null,false,0,'future',[],{}, {format:'future',version:99}]){const f=await seed(null,marker),before=await saved(f),s=await snapshot(request,f,mode);expect(s.yardRuntime.mutable).toBe(false);const result=await mutation(request,f,{accountId:f.id,action:'yard.collectGifts',payload:{},clientActionId:`yard-v2:invalid:${randomUUID()}`},mode);expect(result.status).toBe(409);const after=await saved(f);expect(after.yard).toEqual(before.yard);expect(after._yardV2).toEqual(marker);}
 await info.attach('invalid-markers-preserved',{body:Buffer.from(JSON.stringify({images:[inputs.closedCommit,inputs.activeCommit],markerClasses:7})),contentType:'application/json'});
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
 await crossSelect(page,'garden');await expect(page.locator('.gs2-stage')).toBeVisible();await crossSelect(page,'room');await page.reload();
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

test('cross-game actual B: seven available routes survive rapid Home ownership and reload',async({page,request},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setProxyState(statePath,{target:'B'});const f=await seed();await boot(page,f);
 const roots={garden:'.gs2-stage',blox:'.bx-stage',match3:'.m3-stage',merge:'.ml-root',bubbo:'.bb-stage',trivia:'.trv2-root',room:'.cy-app',settlement:'.settlement-game-root'};
 for(const id of ['garden','blox','match3','merge','bubbo','trivia','room']){await crossSelect(page,id);await expect(page.locator(roots[id])).toBeVisible();expect((await snapshot(request,f)).player.id).toBe(f.id);}
 await page.reload();await expect(page.locator(roots.room)).toBeVisible();await crossHome(page);
 await expect(page.locator('[data-home-game="settlement"]')).toHaveCount(0);await expect(page.locator('[data-home-game]')).toHaveCount(7);
 // Synchronous clicks are an actual DOM event race, not a navigation/store hook.
 await page.locator('[data-home-game="merge"]').evaluate(node=>{node.click();document.querySelector('[data-home-game="room"]')?.click();document.querySelector('[data-home-game="garden"]')?.click();});
 await expect(page.getByTestId('home-catalogue')).toHaveCount(0);await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','merge');await expect(page.locator(roots.merge)).toBeVisible();
 await page.reload();await expect(page.locator(roots.merge)).toBeVisible();expect(new URL(page.url()).searchParams.get('tab')).toBe('merge');
 await crossSelect(page,'room');await expect(page.locator(roots.merge)).toHaveCount(0);await crossSelect(page,'garden');await expect(page.locator(roots.room)).toHaveCount(0);
 await info.attach('seven-available-real-routes',{body:await page.screenshot(),contentType:'image/png'});expect(errors).toEqual([]);
});


// The hide-only Home proof obtains an actual prior-image Town save once.
// Every later check is read-only; no init script can repair a missing save.
async function readTownSave(page){return page.evaluate(()=>localStorage.getItem('village-ascend-v11-state'));}
async function assertHiddenTownCatalogue(page){
 await crossHome(page);await expect(page.locator('[data-home-game="settlement"]')).toHaveCount(0);
 expect(await page.locator('[data-home-game]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeGame))).toEqual(['garden','blox','match3','merge','bubbo','trivia','room']);
 await expect(page.locator('.home-section-title span')).toHaveText('7');
}
for(const game of inputs.record.affectedGames)test(`changed game ${game}: actual image, viewport, navigation and reload`,async({page,request},info)=>{
 const f=await seed();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 if(game==='home'){
  test.setTimeout(300000);
  await setProxyState(statePath,{target:'A'});await boot(page,f);await crossSelect(page,'settlement');await expect(page.locator('.settlement-game-root')).toBeVisible();
  await expect.poll(()=>readTownSave(page)).toBeTruthy();await crossSelect(page,'room');const townSave=await readTownSave(page);expect(townSave).toBeTruthy();
  const walletObservedAt=Date.now(),before=structuredClone((await saved(f)).resources);
  await setProxyState(statePath,{target:'B'});await waitUpdated(page,inputs.activeCommit);expect(await readTownSave(page)).toBe(townSave);
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:568,height:320}]){
   await page.setViewportSize(viewport);await assertHiddenTownCatalogue(page);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   expect(await readTownSave(page)).toBe(townSave);await info.attach(`hidden-settlement-${viewport.width}x${viewport.height}`,{body:await page.screenshot(),contentType:'image/png'});
   await page.reload();await expect(page.locator('.cy-app')).toBeVisible();expect(await readTownSave(page)).toBe(townSave);
  }
  // Reproduce a stale saved tab without touching the Town save itself.
  await page.evaluate(()=>sessionStorage.setItem('game_hub_active_tab_v1','settlement'));await page.goto(origin('origin')+'/?tab=settlement');
  await expect(page.locator('.gs2-stage')).toBeVisible();await expect(page.locator('.settlement-game-root')).toHaveCount(0);expect(await readTownSave(page)).toBe(townSave);
  await crossSelect(page,'room');await setProxyState(statePath,{target:'A'});await waitUpdated(page,inputs.closedCommit);expect(await readTownSave(page)).toBe(townSave);
  await crossHome(page);await expect(page.locator('[data-home-game="settlement"]')).toHaveCount(1);await page.getByRole('button',{name:'Close Home',exact:true}).click();
  await setProxyState(statePath,{target:'B'});await waitUpdated(page,inputs.activeCommit);expect(await readTownSave(page)).toBe(townSave);await assertHiddenTownCatalogue(page);
  assertReplayWallet((await saved(f)).resources,before,{startedAt:walletObservedAt,finishedAt:Date.now()});
  await info.attach('retained-prior-image-town-save',{body:Buffer.from(JSON.stringify({bytes:Buffer.byteLength(townSave),sha256:sha(townSave),builds:[inputs.closedCommit,inputs.activeCommit,inputs.closedCommit,inputs.activeCommit],repairWrites:0})),contentType:'application/json'});
 }else{
  await setProxyState(statePath,{target:'B'});await boot(page,f);
  const id=game==='yard'?'room':game==='cross-game'?'garden':game,roots={settlement:'.settlement-game-root',blox:'.bx-stage',match3:'.m3-stage',merge:'.ml-root',room:'.cy-app',garden:'.gs2-stage'};
  for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
   await page.setViewportSize(viewport);await crossSelect(page,id);await expect(page.locator(roots[id])).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   if(id==='settlement'){const buttons=page.locator(roots[id]+' button:visible');expect(await buttons.count()).toBeGreaterThan(0);for(const button of (await buttons.all()).slice(0,8)){await button.scrollIntoViewIfNeeded();await button.click({trial:true});}}
   await page.reload();expect((await snapshot(request,f)).player.id).toBe(f.id);await expect(page.locator(roots[id])).toBeVisible();
   await info.attach(`${game}-${viewport.width}x${viewport.height}`,{body:await page.screenshot(),contentType:'image/png'});
  }
 }
 expect(errors).toEqual([]);
});
