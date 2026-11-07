/** Focused remaining cases on ordinary immutable images; no source loader or store setter. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {sign} from '@tma.js/init-data-node';
import geometry from '../../game-logic/yard-v2/canonical-location-geometry.json' with {type:'json'};
import {YARD_FOODS,YARD_GOODIES} from '../../game-logic/yard-catalog.js';
import {CAPS,assertDevelopmentEnvironment,assertCurrentCapabilities,fixture,insertFixture,saved,auth,headers,origin,DATABASE_URL,createLedger,step,checkpoint,sha,projectedTargetMatches,assertStoredPlacement,assertNativeFoodPresentation,createWorkerLifecycle,pausedActorWorld,immutableIntent,assertIntentCommand,postExactCommand,compatibleReplayState} from '../helpers/yard-development-acceptance.mjs';
import {setProxyState} from '../helpers/yard-development-proxy.mjs';
import {auditForegroundControls} from '../helpers/yard-development-control-audit.mjs';
assertDevelopmentEnvironment();
const OUT=path.resolve(process.env.YARD_DEVELOPMENT_EVIDENCE),runtime=JSON.parse(await fs.readFile(path.join(OUT,'runtime.json'),'utf8')),runId=process.env.YARD_DEVELOPMENT_RUN_ID;
assert.equal(runId,runtime.runId);const worker=process.env.TEST_WORKER_INDEX??'loader';assert(/^(?:loader|[0-9]+)$/.test(worker));const lifecycle=createWorkerLifecycle(path.join(OUT,'worker-'+worker+'-lifecycle.jsonl'),{runId,worker,head:process.env.GITHUB_SHA});lifecycle('module-loaded');process.once('exit',code=>lifecycle('process-exit',{code}));const URL=origin('origin')+'/?tab=room&yardPipPreview=1&yardCanonicalFood=1&yardPipGrounding=pip-garden-grounding-v1';
let sql;const rows=p=>p._yardV2?.runtime?.canonicalPlacements||[],scene=p=>p.evaluate(()=>window.__yardPipIntegration?.snapshot()?.scene);
const read=f=>saved(sql,f,runId),write=async(name,value)=>fs.writeFile(path.join(OUT,name),JSON.stringify(value,null,2)+'\n');
async function seed(options){const f=fixture(options);await insertFixture(sql,f,runId);return f;}
async function snap(request,f,mode='B'){const r=await request.get(origin(mode)+'/api/player/snapshot',{headers:await headers(f),timeout:CAPS.replyMs});expect(r.status()).toBe(200);return r.json();}
async function mutate(request,f,action,payload={},mode='B',clientActionId='yard-v2:'+randomUUID()){const command={accountId:f.id,action,payload,clientActionId},r=await request.post(origin(mode)+'/api/player/mutate',{headers:await headers(f),data:command,timeout:CAPS.replyMs});return {status:r.status(),body:await r.json(),command};}
async function proof(name,row){let p=await fs.readFile(path.join(OUT,name),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {head:process.env.GITHUB_SHA,cases:[],captures:[]};throw e;});assert.equal(p.head,process.env.GITHUB_SHA);p.cases.push(row);p.captures.push(...row.captures||[]);p.status=p.cases.every(r=>r.status==='passed')?'passed':'failed';await write(name,p);}
async function pageFor(context,f){const p=await context.newPage();await p.addInitScript(({initData,user})=>{window.Telegram={WebApp:{initData,initDataUnsafe:{user}}};if(!localStorage.getItem('garden_shelf_language'))localStorage.setItem('garden_shelf_language','ru');},{initData:await auth(f),user:{id:Number(f.externalId),first_name:'Disposable development fixture'}});return p;}
async function boot(p,f,{canonical=true,internal=false,verifyLifecycle=false}={}){
 const response=p.waitForResponse(async r=>new globalThis.URL(r.url()).pathname==='/api/player/snapshot'&&r.status()===200&&(await r.json()).player?.id===f.id,{timeout:CAPS.replyMs});response.catch(()=>{});
 // Ordinary Telegram-like launch, with no search query. Existing Home
 // navigation opens Yard; the new entry itself never edits URL or history.
 await p.goto(internal?origin('origin')+'/#tgWebAppPlatform=android&tgWebAppVersion=8.0':URL,{waitUntil:'domcontentloaded',timeout:CAPS.replyMs});
 assertCurrentCapabilities(await(await response).json());
 if(!internal){await expect(p.locator('[data-pip-control="canonical-items"]')).toBeEnabled();if(canonical){await click(p,'[data-pip-control="canonical-items"]');await ready(p);}return{entry:'explicit-query'};}
 await expect(p.locator('main[data-active-tab]')).toBeVisible();
 if(await p.locator('main[data-active-tab]').getAttribute('data-active-tab')!=='room'){
  await p.keyboard.press('Escape');await expect(p.locator('[data-testid="home-catalogue"]')).toBeVisible();await click(p,'[data-home-game="room"]');
 }
 const entry=p.locator('[data-yard-action="open-canonical-yard"]');await expect(entry).toBeEnabled();
 const language=await p.evaluate(()=>localStorage.getItem('garden_shelf_language'));
 await expect(entry).toHaveAccessibleName(language==='ru'?'Новый двор':'New Yard');
 const box=await entry.boundingBox();assert(box&&box.width>=44&&box.height>=44,'Internal entry must have a 44px tap target');
 await entry.click({trial:true,timeout:CAPS.actionMs});
 const identity=()=>p.evaluate(()=>({href:location.href,hash:location.hash,initData:window.Telegram.WebApp.initData,userId:window.Telegram.WebApp.initDataUnsafe.user.id,timeOrigin:performance.timeOrigin}));
 const before=await identity(),kept=((await outbox(p,f.id))?.items||[]).map(immutableIntent);
 const idle=await p.evaluate(()=>({mode:window.__yardPipIntegration.snapshot().mode,enabled:window.__yardPipIntegration.snapshot().enabled,directSurfaces:document.querySelectorAll('.cy-pip-direct-layer canvas').length,optionalMedia:performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\.glb(?:$|\?)|clean-garden/.test(n))}));
 assert.equal(idle.mode,'legacy');assert.equal(idle.enabled,false);assert.equal(idle.directSurfaces,0);assert.deepEqual(idle.optionalMedia,[]);
 await expect(p.locator('[data-pip-control="canonical-items"],[data-pip-control="toggle"],[data-pip-control="inspect-again"]')).toHaveCount(0);
 await entry.click({timeout:CAPS.actionMs});await ready(p);
 assert.equal((await scene(p)).groundingRecipe,'pip-garden-grounding-v1');assert.equal((await scene(p)).canonicalFood.reserved,true);
 assert.deepEqual(await identity(),before,'Internal entry must preserve the live Telegram document/session and URL');
 expect(((await outbox(p,f.id))?.items||[]).map(immutableIntent)).toEqual(kept);
 if(verifyLifecycle){
  await click(p,'[data-pip-control="toggle"]');await expect(entry).toBeEnabled();
  await expect.poll(()=>p.evaluate(()=>window.__yardPipIntegration.snapshot().mode)).toBe('legacy');
  await expect(p.locator('.cy-pip-direct-layer canvas')).toHaveCount(0);
  assert.deepEqual(await identity(),before,'Return must keep the existing document and Telegram session');
  expect(((await outbox(p,f.id))?.items||[]).map(immutableIntent)).toEqual(kept);
  await entry.click({timeout:CAPS.actionMs});await ready(p);await p.reload({waitUntil:'domcontentloaded',timeout:CAPS.replyMs});await expect(entry).toBeEnabled();
  assert.equal(await p.evaluate(()=>window.__yardPipIntegration.snapshot().mode),'legacy','Reload must require a fresh visual opt-in');
  const reloaded=await identity();assert.equal(reloaded.href,before.href);assert.equal(reloaded.hash,before.hash);assert.equal(reloaded.initData,before.initData);assert.equal(reloaded.userId,before.userId);
  expect(((await outbox(p,f.id))?.items||[]).map(immutableIntent)).toEqual(kept);
  await entry.click({timeout:CAPS.actionMs});await ready(p);
 }
 return{entry:'authenticated-internal',launchSearch:'',name:language==='ru'?'Новый двор':'New Yard',tapTarget:{width:box.width,height:box.height},idle,initialDocumentPreserved:true,telegramSessionPreserved:true,hashPreserved:true,pendingIntentsPreserved:true,pendingCount:kept.length,returnAndReloadChecked:verifyLifecycle,recipe:(await scene(p)).groundingRecipe};
}
async function ready(p){await expect.poll(async()=>{const s=await scene(p);return s?.ready===true&&!s.viewportBlocked&&s.lastFrame?.canonicalState==='ready'&&s.canonicalFood?.loading===false&&s.renderer?.canonicalFood?.pending===0;},{timeout:CAPS.replyMs}).toBe(true);return assertNativeFoodPresentation(await scene(p));}
async function click(p,selector){await p.locator(selector).click({timeout:CAPS.actionMs});}
async function close(p){await click(p,'.cy-dialog > header button');await expect(p.locator('.cy-dialog')).not.toBeVisible();}
async function placed(p){await click(p,'[data-nav-item="decor"]');await click(p,'[data-decor-tab="placed"]');await click(p,'.cy-catalog-choice[data-goodie-id="leaf_pot"]');}
function project(s,x,y,z=0){const c=geometry.composition.camera,a=s.projection.art,q=[x-c.projectionOriginCanonical[0],y-c.projectionOriginCanonical[1],z].map(v=>v/geometry.composition.canonicalPerSceneUnit);return {x:a.x+s.projection.scale*(c.projectionOriginCss[0]+q.reduce((n,v,i)=>n+v*c.right[i],0)*c.pixelsPerSceneUnitCss),y:a.y+s.projection.scale*(c.projectionOriginCss[1]+q.reduce((n,v,i)=>n+v*c.down[i],0)*c.pixelsPerSceneUnitCss)};}
async function target(p,x,y){await expect.poll(async()=>(await scene(p))?.itemEditing===true).toBe(true);const s=await scene(p),box=await p.locator('.cy-scene > canvas').boundingBox(),point=project(s,x,y);assert(box&&point.x>=0&&point.y>=0&&point.x<=box.width&&point.y<=box.height,'Target outside actual stage');await p.mouse.click(box.x+point.x,box.y+point.y);await expect.poll(async()=>{const g=(await scene(p))?.lastFrame?.ghost;return projectedTargetMatches(g,{x,y});}).toBe(true);}
async function commit(p,action){const s=await scene(p);assert.equal(s.lastFrame.ghost.valid,true,'Commit precondition: actual scene ghost must be valid');const button=p.locator('[data-yard-action="commit-placement"]');await expect(button).toBeEnabled({timeout:CAPS.actionMs});return transact(p,action,()=>button.click({timeout:CAPS.actionMs}));}
async function transact(p,action,gesture){const waiting=p.waitForResponse(r=>new globalThis.URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action===action,{timeout:CAPS.replyMs});waiting.catch(()=>{});await gesture();const response=await waiting;expect(response.status()).toBe(200);const body=await response.json();expect(body.success).toBe(true);return {command:response.request().postDataJSON(),status:response.status(),duplicate:body.duplicate,responseSha256:sha(await response.body())};}
async function layout(p){const stage=await p.locator('.cy-scene').boundingBox();assert(stage&&stage.width>=280&&stage.height>=192);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);return {stage,...await auditForegroundControls(p)};}
async function editorLayout(p){
 const value=await p.evaluate(()=>{const status=document.querySelector('.cy-status'),canvas=document.querySelector('.cy-scene > canvas'),copy=status.querySelector('span:not(.cy-placement-status-reserve)'),reserve=status.querySelector('.cy-placement-status-reserve'),range=document.createRange();range.selectNodeContents(copy);const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return{stage:rect(canvas),status:rect(status),text:copy.textContent,textBounds:rect(range),reserveHidden:reserve?.getAttribute('aria-hidden')==='true'&&getComputedStyle(reserve).visibility==='hidden',projection:window.__yardPipIntegration.snapshot().scene.projection};});
 assert(value.reserveHidden,'Placement reserve must be invisible and excluded from accessibility');
 assert(value.stage.width>=280&&value.stage.height>=192,'Editor must retain the admitted stage floor');
 assert(Math.abs(value.stage.width-value.projection.width)<.02&&Math.abs(value.stage.height-value.projection.height)<.02,'Rendered editor projection must match its actual stage');
 assert(value.textBounds.x>=value.status.x&&value.textBounds.right<=value.status.right&&value.textBounds.y>=value.status.y&&value.textBounds.bottom<=value.status.bottom,'Localized editor feedback must fit without clipping');
 return value;
}
async function capture(p,label,list){const file=label+'.png';await p.screenshot({path:path.join(OUT,file),scale:'device',timeout:CAPS.actionMs});list.push(file);}
async function outbox(p,id){return p.evaluate(async account=>{const k='game_hub_yard_outbox_v2:'+encodeURIComponent(account),v=localStorage.getItem(k);if(v)return JSON.parse(v);return new Promise((resolve,reject)=>{const r=indexedDB.open('keyval-store');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result;if(!d.objectStoreNames.contains('keyval')){d.close();return resolve(null);}const q=d.transaction('keyval','readonly').objectStore('keyval').get(k);q.onsuccess=()=>{d.close();resolve(q.result??null);};q.onerror=()=>{d.close();reject(q.error);};};});},id);}

async function finishCase(p,context,ledger,result,file){
 await checkpoint(p,ledger,'case end',result.status);
 if(result.status!=='passed'){const failure=result.name+'-failure.png';try{await p.screenshot({path:path.join(OUT,failure),scale:'device',timeout:2500});result.failureCapture=failure;}catch(error){result.failureCaptureError=String(error);await ledger.record({step:'failure screenshot',phase:'unavailable',error:String(error)});}}
 await proof(file,result);lifecycle('context-close-start',{case:result.name,status:result.status});try{await context.close();lifecycle('context-close-done',{case:result.name});}catch(error){lifecycle('context-close-error',{case:result.name,error:String(error).slice(0,800)});throw error;}
}

test.beforeAll(async()=>{lifecycle('beforeAll-sql-start');sql=postgres(DATABASE_URL,{max:2,prepare:false,connect_timeout:5,statement_timeout:5000});const[d]=await sql`SELECT current_database() AS name`;assert.equal(d.name,'ccgh_yard_production_ci');lifecycle('beforeAll-sql-ready');});
test.beforeEach(async({},info)=>lifecycle('test-hook-start',{test:info.title}));
test.afterEach(async({},info)=>lifecycle('test-hook-end',{test:info.title,status:info.status}));
test.afterAll(async()=>{lifecycle('afterAll-sql-close-start');await sql?.end({timeout:5});lifecycle('afterAll-sql-close-done');});

test('normal image identity, signed authority and warm same-origin client',async({browser,request})=>{
 test.setTimeout(45000);const f=await seed(),other=await seed(),ledger=createLedger(path.join(OUT,'api-checkpoints.json'),runtime.inputs),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'}),p=await pageFor(context,f);const result={name:'api-and-warm',status:'failed',checks:[],captures:[]};
 try{
  await step(null,ledger,'normal signed authority',async()=>{const s=assertCurrentCapabilities(await snap(request,f));const config=await(await request.get(origin('B')+'/api/config',{timeout:CAPS.replyMs})).json();assert.equal(config.buildId,runtime.inputs.candidate.commit);assert.equal(config.telegramAuthRequired,true);assert.equal(config.devAuthEnabled,false);for(const authorization of ['', 'dev synthetic','tma tampered','tma '+sign({user:{id:Number(f.externalId)}},'9000000001:different-disposable-bot',new Date())])expect((await request.get(origin('B')+'/api/player/snapshot',{headers:{Authorization:authorization},timeout:CAPS.replyMs})).status()).toBe(401);const before=await read(f),foreign=await request.post(origin('B')+'/api/player/mutate',{headers:await headers(f),data:{accountId:other.id,action:'yard.buyGoodie',payload:{goodieId:'leaf_pot'},clientActionId:'yard-v2:'+randomUUID()},timeout:CAPS.replyMs});expect(foreign.status()).toBe(409);expect((await foreign.json()).error).toBe('ACCOUNT_CHANGED');expect((await read(f)).yard).toEqual(before.yard);result.capability=s.yardRuntime;result.checks.push('authenticated-capability-policy');});
  await step(p,ledger,'warm predecessor to candidate on same origin',async()=>{await setProxyState(runtime.statePath,{target:'A'});await p.goto(origin('origin')+'/?tab=room',{waitUntil:'domcontentloaded',timeout:CAPS.replyMs});await expect.poll(()=>p.evaluate(()=>window.__APP_BUILD_ID__),{timeout:CAPS.replyMs}).toBe(runtime.inputs.predecessor.commit);await expect.poll(()=>p.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:CAPS.replyMs}).toBe(true);const priorCaches=await p.evaluate(()=>caches.keys());assert(priorCaches.length);await p.evaluate(()=>localStorage.setItem('yard-development-warm-preserve','same-origin-storage'));await setProxyState(runtime.statePath,{target:'B'});await p.reload({waitUntil:'domcontentloaded',timeout:CAPS.replyMs});await expect.poll(()=>p.evaluate(()=>window.__APP_BUILD_ID__).catch(()=>null),{timeout:15000}).toBe(runtime.inputs.candidate.commit);expect(await p.evaluate(()=>localStorage.getItem('yard-development-warm-preserve'))).toBe('same-origin-storage');const snapshot=await p.evaluate(async()=>{const r=await fetch('/api/player/snapshot',{headers:{Authorization:'tma '+window.Telegram.WebApp.initData}});return {status:r.status,cacheControl:r.headers.get('cache-control'),body:await r.json()};});expect(snapshot.status).toBe(200);assertCurrentCapabilities(snapshot.body);assert.equal(snapshot.body.player.id,f.id);result.warm={predecessor:runtime.inputs.predecessor.commit,candidate:runtime.inputs.candidate.commit,priorCaches,sameOrigin:true,storagePreserved:true,trigger:'ordinary reload with existing SW and cache'};result.checks.push('warm-client-update');});
  result.status='passed';
 }finally{await finishCase(p,context,ledger,result,'api-proof.json');await setProxyState(runtime.statePath,{target:'B'});}
});

for(const [width,height,escape] of [[320,568,'move'],[390,844,'pickup'],[568,320,'move']])test(`occupied bowl escape and collision refusal ${width}x${height}`,async({browser})=>{
 test.setTimeout(35000);const f=await seed({occupied:true,ownedPots:1}),context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:true,hasTouch:true,serviceWorkers:'allow'}),p=await pageFor(context,f),name=`occupied-${width}x${height}`,ledger=createLedger(path.join(OUT,name+'-checkpoints.json'),runtime.inputs),result={name,status:'failed',checks:[],captures:[],fixture:f.setup,viewport:{width,height,dpr:width===390?2:1}},before=await read(f);
 try{
  await step(p,ledger,'enter normal image',async()=>{result.entry=await boot(p,f,{internal:width===390,verifyLifecycle:width===390});});
  await step(p,ledger,'occupied row and visible explanation',async()=>{expect(rows(await read(f))).toEqual(rows(before));await expect(p.locator('[data-hud-region="yardVisitStatus"][role="status"]')).toHaveText('Место миски занято');result.layout=await layout(p);await click(p,'[data-nav-item="food"]');await expect(p.locator('[data-canonical-food-status="true"]')).toContainText('Горшок с листьями · 1');await expect(p.locator('[data-canonical-food-status="true"]')).not.toContainText('canonical:');await expect(p.locator('[data-yard-action="set-food"]')).toBeDisabled();await capture(p,name+'-food',result.captures);result.foodControls=await layout(p);await close(p);await placed(p);await expect(p.locator('[data-canonical-food-conflict="true"]')).toContainText('Горшок с листьями · 1');await expect(p.locator('[data-canonical-food-conflict="true"]')).not.toContainText('canonical:');await expect(p.locator('[data-yard-action="move"]')).toBeEnabled();await expect(p.locator('[data-yard-action="pickup"]')).toBeEnabled();await capture(p,name+'-decor',result.captures);result.decorControls=await layout(p);});
  await step(p,ledger,'explicit '+escape+' escape',async()=>{if(escape==='move'){await click(p,'[data-yard-action="move"]');await target(p,98,118);result.escape=await commit(p,'yard.moveGoodie');}else{result.escape=await transact(p,'yard.pickupGoodie',()=>click(p,'[data-yard-action="pickup"]'));await close(p);}await expect.poll(async()=>{const r=rows(await read(f));return escape==='move'?r.length===1&&r[0].x===result.escape.command.payload.x&&r[0].y===result.escape.command.payload.y:r.length===0;}).toBe(true);if(escape==='move')assertStoredPlacement(rows(await read(f))[0],result.escape.command,{x:98,y:118});await expect.poll(async()=>(await scene(p))?.canonicalFood?.state).toBe('empty');result.foodAfterEscape=await ready(p);result.afterEscapeLayout=await layout(p);expect((await read(f)).yard.currencies).toEqual(before.yard.currencies);if(escape==='move')expect((await read(f)).yard.goodieInventory).toEqual(before.yard.goodieInventory);else expect((await read(f)).yard.goodieInventory.leaf_pot).toBe((before.yard.goodieInventory.leaf_pot||0)+1);});
  await step(p,ledger,'food and actor collision refuse new commit',async()=>{
   const stable=await read(f);result.editorLocales=[];
   for(const language of['ru','en']){
    if(language==='en'){await p.evaluate(()=>localStorage.setItem('garden_shelf_language','en'));await boot(p,f);}
    if(escape==='move'){await placed(p);await click(p,'[data-yard-action="move"]');}
    else{await click(p,'[data-pip-control="inventory"]');await click(p,'.cy-catalog-choice[data-goodie-id="leaf_pot"]');await click(p,'[data-yard-action="place"]');}
    await expect.poll(async()=>{const s=await scene(p);return s?.itemEditing===true&&s.pauseReasons?.includes('item-editor')&&s.renderer?.paused===true&&!!s.lastFrame?.ghost&&s.lastFrame.ghost.placing===(escape==='pickup')&&(escape==='pickup'||s.lastFrame.ghost.slotId===rows(stable)[0].slotId)&&['x','y','z'].every(k=>s.lastFrame.root?.[k]===s.dynamicSample?.world?.root?.[k]);}).toBe(true);
    const actor=pausedActorWorld(await scene(p)),initial=await editorLayout(p),locale={language,initial,refusals:[],captures:[]};result.editorLocales.push(locale);
    assert.equal(initial.text,language==='ru'?'Место свободно':'This spot is clear');
    for(const[x,y,expected]of[[80,82,'CANONICAL_FOOD_REGION_RESERVED'],[actor.root.x,actor.root.y,'CANONICAL_ACTOR_OCCUPIED']]){
     await target(p,x,y);await expect(p.locator('[data-yard-action="commit-placement"]')).toBeDisabled();
     const observed=await scene(p),g=observed.lastFrame.ghost,after=await editorLayout(p);
     assert.deepEqual(pausedActorWorld(observed),actor,'Editor gesture changed the paused actor pose');assert.equal(g.valid,false);assert.equal(g.placementError,expected);
     assert.equal(after.text,language==='ru'?'Здесь нельзя поставить предмет. Выберите другое место.':'This spot is unavailable. Choose another spot.');
     assert.equal(after.status.height,initial.status.height,'Collision feedback resized the registered status row');
     assert.deepEqual(after.stage,initial.stage,'Collision feedback changed the active pointer stage');
     locale.refusals.push({x,y,ghost:g,layout:after});
     if(expected==='CANONICAL_FOOD_REGION_RESERVED')await capture(p,name+'-collision-'+language,locale.captures);
    }
    locale.pausedActor=actor;await click(p,'[data-yard-action="cancel-placement"]');expect(rows(await read(f))).toEqual(rows(stable));
    if(language==='ru'){result.pausedActor=actor;result.refusals=locale.refusals;}
   }
   await capture(p,name+'-escaped',result.captures);
  });
  result.status='passed';result.checks=['occupied-food-socket','mobile-functional'];
 }finally{await finishCase(p,context,ledger,result,'native-proof.json');}
});

test('current v2 purchase, committed response loss, account fence and exact replay after reload',async({browser,request})=>{
 test.setTimeout(65000);const f=await seed(),other=await seed(),context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'allow'});let p=await pageFor(context,f);const ledger=createLedger(path.join(OUT,'pending-checkpoints.json'),runtime.inputs),result={name:'current-v2-pending',status:'failed',checks:[],captures:[],transactions:[]};
 try{
  await step(p,ledger,'enter and genuine purchases',async()=>{await boot(p,f);await click(p,'[data-nav-item="decor"]');await click(p,'[data-decor-tab="shop"]');await click(p,'.cy-catalog-choice[data-goodie-id="leaf_pot"]');result.transactions.push(await transact(p,'yard.buyGoodie',()=>click(p,'[data-yard-action="buy-goodie"]')));await close(p);let wallet={...f.initial.yard.currencies};for(const k of ['treats','shinyTreats'])wallet[k]-=YARD_GOODIES.leaf_pot.cost[k]||0;for(const id of ['kibble','berry_plate','bonito_bowl']){await click(p,'[data-nav-item="food"]');result.transactions.push(await transact(p,'yard.buyFood',()=>click(p,`[data-yard-action="buy-food"][data-food-id="${id}"]`)));await p.locator('.cy-dialog select').selectOption(id,{timeout:CAPS.actionMs});result.transactions.push(await transact(p,'yard.setFood',()=>click(p,'[data-yard-action="set-food"][data-bowl-id="bowl-1"]')));await close(p);for(const k of ['treats','shinyTreats'])wallet[k]-=YARD_FOODS[id].cost[k]||0;const s=await read(f);expect(s.yard.currencies).toEqual(wallet);expect(s.yard.foodInventory[id]||0).toBe(0);expect(s.yard.bowls).toHaveLength(1);expect(s.yard.bowls[0]).toMatchObject({id:'bowl-1',foodId:id,servings:YARD_FOODS[id].servings});}result.economy={wallet,pricesFromCatalog:true,paidPotAcquired:true};expect(rows(await read(f))).toHaveLength(0);expect((await read(f))._yardV2.version).toBe(1);});
  let lost,committed,pending;
  await step(p,ledger,'commit genuine v2 command then lose its real reply',async()=>{await click(p,'[data-pip-control="inventory"]');await click(p,'.cy-catalog-choice[data-goodie-id="leaf_pot"]');await click(p,'[data-yard-action="place"]');await target(p,98,118);assert.equal((await scene(p)).lastFrame.ghost.valid,true);await expect(p.locator('[data-yard-action="commit-placement"]')).toBeEnabled();await setProxyState(runtime.statePath,{target:'B',dropPlacement:true});await click(p,'[data-yard-action="commit-placement"]');await expect.poll(async()=>fs.readFile(runtime.faultPath,'utf8').then(JSON.parse).then(v=>v.status).catch(()=>0),{timeout:CAPS.replyMs}).toBe(200);lost=JSON.parse(await fs.readFile(runtime.faultPath,'utf8'));expect(lost.captureError).toBeUndefined();expect(lost.body.duplicate).toBe(false);expect(lost.command.clientActionId).toMatch(/^yard-v2:canonical-v2\//);await expect.poll(async()=>(await outbox(p,f.id))?.items?.some(r=>r.clientActionId===lost.command.clientActionId),{timeout:CAPS.replyMs}).toBe(true);pending=(await outbox(p,f.id)).items.find(r=>r.clientActionId===lost.command.clientActionId);assertIntentCommand(pending,lost.command);result.originalIntent=immutableIntent(pending);result.initialRetryState={status:pending.status,attempts:pending.attempts,nextAttemptAt:pending.nextAttemptAt};committed=await read(f);expect(committed._yardV2.version).toBe(2);expect(rows(committed)).toHaveLength(1);assertStoredPlacement(rows(committed)[0],lost.command,{x:98,y:118});expect(lost.body.placement).toEqual(rows(committed)[0]);expect(committed._yardV2.runtime.commandReceipts[lost.command.clientActionId]).toBeTruthy();});
  await step(p,ledger,'same-browser account fence',async()=>{await p.close();p=await pageFor(context,other);await p.goto(origin('origin')+'/api/health',{waitUntil:'domcontentloaded',timeout:CAPS.replyMs});const closedBaseline=await outbox(p,f.id),closedIntent=closedBaseline.items.find(r=>r.clientActionId===lost.command.clientActionId);assertIntentCommand(closedIntent,lost.command);expect(immutableIntent(closedIntent)).toEqual(result.originalIntent);await boot(p,other);expect((await scene(p)).canonicalRecords).toEqual([]);const retainedEnvelope=await outbox(p,f.id),retained=retainedEnvelope.items.find(r=>r.clientActionId===lost.command.clientActionId);expect(retainedEnvelope).toEqual(closedBaseline);assertIntentCommand(retained,lost.command);expect(immutableIntent(retained)).toEqual(result.originalIntent);result.closedAccountBaseline={envelopeSha256:sha(JSON.stringify(closedBaseline)),retryState:{status:closedIntent.status,attempts:closedIntent.attempts,nextAttemptAt:closedIntent.nextAttemptAt},unchangedAfterBReady:true};expect(rows(await read(other))).toHaveLength(0);expect((await read(other)).yard.currencies).toEqual(other.initial.yard.currencies);expect(rows(await read(f))).toEqual(rows(committed));result.accountFence={pendingAccount:f.id,activeAccount:other.id,originalRetained:true};});
  await step(p,ledger,'exact recovery through real reload',async()=>{await p.close();p=await pageFor(context,f);await setProxyState(runtime.statePath,{target:'B'});const duplicate=p.waitForResponse(async r=>new globalThis.URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.clientActionId===lost.command.clientActionId&&(await r.json()).duplicate===true,{timeout:CAPS.replyMs});duplicate.catch(()=>{});await boot(p,f);const replay=await duplicate;expect(replay.request().postDataJSON()).toEqual(lost.command);await expect.poll(async()=>(await outbox(p,f.id))?.items?.length||0,{timeout:CAPS.replyMs}).toBe(0);const after=await read(f);expect(after.yard.currencies).toEqual(committed.yard.currencies);expect(after.yard.goodieInventory).toEqual(committed.yard.goodieInventory);expect(rows(after)).toEqual(rows(committed));expect(after._yardV2.runtime.commandReceipts[lost.command.clientActionId]).toEqual(committed._yardV2.runtime.commandReceipts[lost.command.clientActionId]);result.replay={command:lost.command,requestSha256:sha(replay.request().postData()),responseSha256:sha(await replay.body()),duplicate:true};await p.reload({waitUntil:'domcontentloaded',timeout:CAPS.replyMs});await expect(p.locator('[data-pip-control="canonical-items"]')).toBeEnabled();await click(p,'[data-pip-control="canonical-items"]');await ready(p);expect(rows(await read(f))).toEqual(rows(committed));await capture(p,'current-v2-recovered-390x844',result.captures);});
  await step(null,ledger,'receipt payload binding and exact predecessor compatible replay',async()=>{
   const protectedState=compatibleReplayState;
   // Close the browser so no unrelated polling/action can race the exact HTTP replay.
   await p.close();p=null;const baseline=protectedState(await read(f)),baselineSha256=sha(JSON.stringify(baseline));
   const compatibility={predecessor:runtime.inputs.predecessor.commit,candidate:runtime.inputs.candidate.commit,command:lost.command,scope:Object.keys(baseline),baselineSha256,compatibilityRequired:true,ignoredClockFields:['resources.energy.lastRegenTimestamp']};
   const preserved=async()=>{const after=protectedState(await read(f));expect(after).toEqual(baseline);return sha(JSON.stringify(after));};
   const conflict=await postExactCommand(request,f,{...structuredClone(lost.command),payload:{...structuredClone(lost.command.payload),x:100}},'B');expect(conflict.status).toBe(409);expect(conflict.body.error).toBe('ACTION_ID_PAYLOAD_CONFLICT');
   compatibility.candidateConflict={status:conflict.status,error:conflict.body.error,stateSha256:await preserved()};result.receiptSecurity={conflictStatus:409,error:conflict.body.error};
   assertCurrentCapabilities(await snap(request,f,'A'));compatibility.predecessorReady=true;await preserved();
   const prior=await postExactCommand(request,f,lost.command,'A');expect(prior.command).toEqual(lost.command);expect(prior.status).toBe(200);expect(prior.body.duplicate).toBe(true);expect(prior.body.placement).toEqual(lost.body.placement);
   compatibility.predecessorReplay={status:prior.status,duplicate:prior.body.duplicate,command:prior.command,stateSha256:await preserved()};
   const priorConflict=await postExactCommand(request,f,{...structuredClone(lost.command),payload:{...structuredClone(lost.command.payload),x:100}},'A');expect(priorConflict.status).toBe(409);expect(priorConflict.body.error).toBe('ACTION_ID_PAYLOAD_CONFLICT');
   compatibility.predecessorConflict={status:priorConflict.status,error:priorConflict.body.error,stateSha256:await preserved()};
   const again=await postExactCommand(request,f,lost.command,'B');expect(again.command).toEqual(lost.command);expect(again.status).toBe(200);expect(again.body.duplicate).toBe(true);expect(again.body.placement).toEqual(lost.body.placement);
   compatibility.candidateReplay={status:again.status,duplicate:again.body.duplicate,command:again.command,stateSha256:await preserved()};result.compatibility=compatibility;
  });
  result.status='passed';result.checks=['canonical-placement-storage-v2','economy-inventory','lost-response-exactly-once','pending-intent-account-fences','receipt-security','prior-image-v2-compatible-replay-preserves-state'];
 }finally{await finishCase(p,context,ledger,result,'native-proof.json');await setProxyState(runtime.statePath,{target:'B'});}
});
