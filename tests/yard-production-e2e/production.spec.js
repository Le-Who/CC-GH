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
 const [count]=await sql`SELECT count(*)::int AS n FROM players`;expect(count.n).toBe(0);
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
 const lost=JSON.parse(await readFile(faultPath,'utf8'));expect(lost.body.duplicate).toBe(false);expect(lost.command.clientActionId).toMatch(/^yard-v2:/);
 await expect.poll(async()=>(await outbox(page,f.id))?.items?.some(row=>row.clientActionId===lost.command.clientActionId)).toBe(true);
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
 await expect.poll(async()=>(await outbox(page,f.id))?.items?.find(row=>row.clientActionId===lost.command.clientActionId)?.status,{timeout:15000}).toBe('rollout-paused');
 await waitUpdated(page,inputs.closedCommit);await expect(page.locator('[data-yard-read-only=true]')).toBeVisible();
 const warmAgain=await browserMetadata(page,'A');expect(warmAgain.map(row=>row.sha256)).toEqual(warmA.map(row=>row.sha256));
 await expect.poll(async()=>(await outbox(page,f.id))?.items?.find(row=>row.clientActionId===lost.command.clientActionId)?.status,{timeout:15000}).toBe('rollout-paused');
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
