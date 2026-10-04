import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {YARD_FOODS,YARD_GOODIES,YARD_REMODELS} from '../../game-logic/yard-v2/catalog.mjs';
import {createProjection} from '../../src/games/companion-yard-v2/projection.mjs';
import {setProxyState} from '../helpers/yard-production-proxy.mjs';
import {selectHomeGame} from '../e2e/helpers/home.js';
import {createUiQaHarness} from './fixtures.mjs';
import {dialog,openPanel,chooseItem,guestSection,foodCard,expectWallet,outbox,emptyOutbox,boot,sceneReady} from './controls.mjs';

let h,currentFixture,observed;
const scope='diagnostic-only-ordinary-C-ui-api-postgres';
const adjacent=p=>({merge:p.merge,fence:p._mergeLabFence,garden:p.garden});
function expectAdjacent(actual,expected){
  expect(adjacent(actual)).toEqual(adjacent(expected));
  const prior=expected.resources.energy.lastRegenTimestamp,next=actual.resources.energy.lastRegenTimestamp,window=h.readWindow(expected,actual);
  expect(Number.isSafeInteger(prior)&&Number.isSafeInteger(next)).toBe(true);
  expect(expected.resources.energy.current).toBe(expected.resources.energy.max);expect(expected.resources.energy.max).toBeGreaterThan(0);
  expect(next).toBeGreaterThanOrEqual(prior);
  expect(next===prior||(next>=window.startedAt&&next<=window.finishedAt)).toBe(true);
  expect(actual.resources).toEqual({...expected.resources,energy:{...expected.resources.energy,lastRegenTimestamp:next}});
}
async function fixture(kind){currentFixture=await h.seed(kind);return currentFixture;}
const data=(f,action,payload={})=>({accountId:f.id,action,payload,clientActionId:`yard-v2:ui-qa:${randomUUID()}`});
test.beforeAll(async()=>{h=await createUiQaHarness();});
test.afterAll(async()=>{await h?.close();});
test.beforeEach(async({page})=>{
  currentFixture=null;observed={mutations:[],pageErrors:[],consoleErrors:[],reads:[]};
  const recorder=observed;
  page.on('pageerror',e=>recorder.pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')recorder.consoleErrors.push({text:m.text(),url:m.location().url});});
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/player/mutate')recorder.mutations.push({command:r.postDataJSON(),request:r});});
  page.on('requestfailed',r=>{const row=recorder.mutations.find(row=>row.request===r);if(row)row.failure=r.failure()?.errorText;});
  page.on('response',r=>{const row=recorder.mutations.find(row=>row.request===r.request());if(row){row.status=r.status();recorder.reads.push(r.json().then(body=>{row.body=body;}).catch(error=>{row.bodyReadError=String(error.message);}));}});
  await setProxyState(process.env.YARD_UI_QA_PROXY_STATE,{target:'B'});
});
test.afterEach(async({},info)=>{
  await Promise.allSettled(observed.reads);
  let persisted,readError;
  if(currentFixture)try{const p=await h.saved(currentFixture);persisted={accountId:p.id,yard:p.yard,resources:p.resources,commandReceipts:p._yardV2?.runtime?.commandReceipts,giftLedger:p._yardV2?.runtime?.giftLedger,migrationReceipt:p._yardV2?.migration?.receipt};}catch(error){readError=String(error.message);}
  const consoleErrors=observed.consoleErrors.map(row=>({...row,expected:info.title==='lost-response-reload'&&new URL(row.url||h.origin,h.origin).pathname==='/api/player/mutate'&&/^Failed to load resource: net::ERR_(EMPTY_RESPONSE|FAILED|CONNECTION_RESET)$/.test(row.text)}));
  await writeFile(info.outputPath('ordinary-C-requests-and-ledger.json'),JSON.stringify({scope,commit:h.commit,runId:h.runId,mutations:observed.mutations.map(({request,...row})=>row),directApiMutations:currentFixture?h.requestsFor(currentFixture):[],pageErrors:observed.pageErrors,consoleErrors,persisted,readError},null,2));
  expect(readError).toBeUndefined();expect(observed.pageErrors).toEqual([]);expect(consoleErrors.filter(row=>!row.expected)).toEqual([]);
});

async function uiAction(page,f,action,click){
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.accountId===f.id&&r.request().postDataJSON()?.action===action);
  await click();const r=await response,body=await r.json(),command=r.request().postDataJSON();
  expect(r.status(),JSON.stringify(body)).toBe(200);expect(body.duplicate).toBe(false);
  expect(command.clientActionId).toMatch(/^yard-v2:/);expect(body.clientActionId).toBe(command.clientActionId);
  await emptyOutbox(page,f.id);
  const saved=await h.saved(f);expect(saved._yardV2.runtime.commandReceipts[command.clientActionId]).toMatchObject({action,status:200});
  return{body,command,saved};
}
async function evidence(page,info,name,value){
  await writeFile(info.outputPath(`${name}.json`),JSON.stringify({scope,commit:h.commit,runId:h.runId,...value},null,2));
  await page.screenshot({path:info.outputPath(`${name}.png`)});
}
async function replayUnchanged(f,command){
  const before=await h.saved(f),reply=await h.mutate(f,command);expect(reply.status).toBe(200);expect(reply.body.duplicate).toBe(true);
  const after=await h.saved(f);expect(after.yard).toEqual(before.yard);expect(after._yardV2).toEqual(before._yardV2);expectAdjacent(after,before);
}
async function confirmPlacement(page,f,action){
  const place=page.locator('.cy-placement').getByRole('button',{name:'Place',exact:true});await expect(place).toBeEnabled();
  return uiAction(page,f,action,()=>place.click());
}
async function pointAt(page,position){
  const canvas=page.locator('.cy-scene canvas'),box=await canvas.boundingBox();expect(box).not.toBeNull();
  const point=createProjection(box.width,box.height).project(position);
  expect(point.x).toBeGreaterThan(0);expect(point.x).toBeLessThan(box.width);expect(point.y).toBeGreaterThan(0);expect(point.y).toBeLessThan(box.height);
  await canvas.click({position:point});
}

test('catalogue-actions',async({page},info)=>{
  const f=await fixture('actions'),errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page,h,f);await sceneReady(page);
  const initial=await h.saved(f),seen=[];
  expect(initial.yard.dailyLetter.stamps).toBe(4);
  const act=async(action,click)=>{const result=await uiAction(page,f,action,click);seen.push(result);return result;};
  await expectWallet(page,initial.yard.currencies);
  await openPanel(page,'Food');
  await act('yard.buyFood',()=>foodCard(page,'Garden Kibble').getByRole('button',{name:'Take',exact:true}).click());
  await expect(page.getByRole('combobox',{name:'Food: Second bowl',exact:true})).toBeDisabled();
  const bowl=dialog(page).locator('.cy-row').filter({has:page.getByRole('combobox',{name:'Food: Bowl',exact:true})});
  await act('yard.setFood',()=>bowl.getByRole('button',{name:'Fill',exact:true}).click());
  await openPanel(page,'Items');await chooseItem(page,'In the yard','Moon Lamp');
  await act('yard.fixGoodie',()=>dialog(page).getByRole('button',{name:/^Repair ·/}).click());
  await act('yard.pickupGoodie',()=>dialog(page).getByRole('button',{name:'Store',exact:true}).click());
  await chooseItem(page,'Shop','Moon Lamp');
  const beforeBuy=await h.saved(f),buy=await act('yard.buyGoodie',()=>dialog(page).getByRole('button',{name:'Buy',exact:true}).click());
  for(const key of ['treats','shinyTreats'])expect(buy.saved.yard.currencies[key]).toBe(beforeBuy.yard.currencies[key]-(YARD_GOODIES.moon_lamp.cost[key]||0));
  expect(buy.saved.yard.goodieInventory.moon_lamp).toBe(beforeBuy.yard.goodieInventory.moon_lamp+1);await replayUnchanged(f,buy.command);
  const conflict=await h.mutate(f,{...buy.command,payload:{goodieId:'sun_cushion'}});expect(conflict.status).toBe(409);expect(conflict.body.error).toBe('ACTION_ID_PAYLOAD_CONFLICT');
  expect((await h.saved(f)).yard).toEqual(buy.saved.yard);
  await chooseItem(page,'Inventory','Moon Lamp');await dialog(page).getByRole('button',{name:'Place',exact:true}).click();
  await pointAt(page,{x:60,y:40});const moon=await confirmPlacement(page,f,'yard.placeGoodie');seen.push(moon);
  expect(moon.saved.yard.goodieInventory.moon_lamp).toBe(buy.saved.yard.goodieInventory.moon_lamp-1);
  await replayUnchanged(f,moon.command);
  await openPanel(page,'Items');await chooseItem(page,'Shop','Sun Cushion');
  await act('yard.buyGoodie',()=>dialog(page).getByRole('button',{name:'Buy',exact:true}).click());
  await chooseItem(page,'Inventory','Sun Cushion');await dialog(page).getByRole('button',{name:'Place',exact:true}).click();
  const placed=await confirmPlacement(page,f,'yard.placeGoodie');seen.push(placed);
  const beforeMove=placed.saved.yard.placedGoodies.find(p=>p.goodieId==='sun_cushion');
  await openPanel(page,'Items');await chooseItem(page,'In the yard','Sun Cushion');await dialog(page).getByRole('button',{name:'Move',exact:true}).click();
  const canvas=page.locator('.cy-scene canvas');await expect(canvas).toBeFocused();const box=await canvas.boundingBox();
  const projection=createProjection(box.width,box.height),screenBefore=projection.project(beforeMove);
  await canvas.press('ArrowLeft');
  const moved=await act('yard.moveGoodie',()=>canvas.press('Enter'));
  const screenAfter=projection.project(moved.command.payload);
  expect(screenAfter.x-screenBefore.x).toBeCloseTo(-8,6);expect(screenAfter.y-screenBefore.y).toBeCloseTo(0,6);
  const movedProp=moved.saved.yard.placedGoodies.find(p=>p.slotId===beforeMove.slotId);
  expect(movedProp.x).toBe(moved.command.payload.x);expect(movedProp.y).toBe(moved.command.payload.y);
  await openPanel(page,'Items');await chooseItem(page,'In the yard','Sun Cushion');await dialog(page).getByRole('button',{name:'Move',exact:true}).click();
  await canvas.dispatchEvent('pointercancel',{pointerId:1});await expect(page.locator('.cy-placement')).toHaveCount(0);
  expect((await h.saved(f)).yard.placedGoodies).toEqual(moved.saved.yard.placedGoodies);
  await openPanel(page,'Items');await chooseItem(page,'Shop','Moon Lamp');
  await expect(dialog(page).getByRole('button',{name:'Expand',exact:true})).toBeDisabled();
  const styles=dialog(page).getByRole('button',{name:'Select',exact:true});expect(await styles.count()).toBe(Object.keys(YARD_REMODELS).length);
  for(const button of await styles.all())await expect(button).toBeDisabled();
  const unavailable=[];
  for(const [action,payload]of [['yard.buyExpansion',{}],['yard.setRemodel',{remodelId:Object.keys(YARD_REMODELS).find(id=>id!=='meadow')}]]){
    const before=await h.saved(f),command=data(f,action,payload),reply=await h.mutate(f,command);expect(reply.status).toBe(409);expect(reply.body.error).toBe('YARD_BINDING_REQUIRED');
    const after=await h.saved(f);expect(after.yard).toEqual(before.yard);expectAdjacent(after,before);
    expect(after._yardV2.runtime.commandReceipts[command.clientActionId]).toMatchObject({action,status:409,error:'YARD_BINDING_REQUIRED'});unavailable.push(action);
  }
  await openPanel(page,'Guests');await guestSection(page,'Guests');
  const collect=await act('yard.collectGifts',()=>dialog(page).getByRole('button',{name:'Collect',exact:true}).click());await replayUnchanged(f,collect.command);
  await act('yard.claimDailyLetter',()=>dialog(page).getByRole('button',{name:'Open',exact:true}).click());
  await act('yard.capturePhoto',()=>dialog(page).getByRole('button',{name:'Portrait',exact:true}).click());
  await guestSection(page,'Photo album');await act('yard.favoritePhoto',()=>dialog(page).getByRole('button',{name:'Favorite',exact:true}).click());
  await guestSection(page,'Helper');await page.getByRole('textbox',{name:'Name',exact:true}).fill('Source buddy');
  await act('yard.configureCompanion',()=>dialog(page).getByRole('button',{name:'Save name',exact:true}).click());
  await act('yard.configureCompanion',()=>page.getByRole('combobox',{name:'Helper food',exact:true}).selectOption('berry_plate'));
  await act('yard.configureCompanion',()=>dialog(page).getByRole('button',{name:/^Auto-feed:/}).click());
  const after=await h.saved(f);
  expect(new Set([...seen.map(r=>r.command.action),...unavailable]).size).toBe(14);
  expect(new Set(seen.map(r=>r.command.clientActionId)).size).toBe(seen.length);
  expect(Object.keys(after._yardV2.runtime.commandReceipts)).toHaveLength(seen.length+unavailable.length);
  expect(Object.values(after._yardV2.runtime.giftLedger).filter(g=>g.status==='claimed')).toHaveLength(1);
  expect(after.yard.companion.name).toBe('Source buddy');expect(after.yard.helper).toMatchObject({preferredFoodId:'berry_plate',autoRefill:true});
  expect(after.yard.album.photos).toHaveLength(1);expect(after.yard.album.photos[0].favorite).toBe(true);
  expect(after.yard.goodieInventory.moon_lamp).toBe(1);expect(after.yard.goodieInventory.sun_cushion||0).toBe(0);
  expect(after.yard.placedGoodies.map(p=>p.goodieId).sort()).toEqual(['moon_lamp','sun_cushion']);
  for(const key of ['treats','shinyTreats']){
    const spent=[YARD_FOODS.kibble.cost,YARD_GOODIES.moon_lamp.fixCost,YARD_GOODIES.moon_lamp.cost,YARD_GOODIES.sun_cushion.cost].reduce((n,cost)=>n+(cost[key]||0),0);
    expect(after.yard.currencies[key]).toBe(initial.yard.currencies[key]-spent+(key==='treats'?12+35:1+1));
  }
  expect(after.yard.uiDiagnosticUnknown).toEqual(initial.yard.uiDiagnosticUnknown);expectAdjacent(after,initial);
  await page.keyboard.press('Escape');await expect(dialog(page)).not.toBeVisible();await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
  await expectWallet(page,after.yard.currencies);
  await page.getByRole('button',{name:'Back to games',exact:true}).click();await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await selectHomeGame(page,'garden');await expect(page.locator('.gs2-stage')).toBeVisible();await selectHomeGame(page,'room');await expect(page.locator('.cy-app')).toBeVisible();
  await page.reload();await sceneReady(page);await expectWallet(page,after.yard.currencies);
  const reloaded=await h.saved(f);expect(reloaded.yard.placedGoodies).toEqual(after.yard.placedGoodies);expect(reloaded.yard.goodieInventory).toEqual(after.yard.goodieInventory);expect(reloaded.yard.currencies).toEqual(after.yard.currencies);expectAdjacent(reloaded,after);
  await evidence(page,info,'catalogue-actions',{positive:seen.map(r=>r.command),unavailable,currencies:reloaded.yard.currencies,placements:reloaded.yard.placedGoodies,keyboard:{before:screenBefore,after:screenAfter}});expect(errors).toEqual([]);
});

test('unaffordable-shiny',async({page},info)=>{
  const f=await fixture('unaffordable');await boot(page,h,f);const before=await h.saved(f),requests=[];
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/player/mutate')requests.push(r.postDataJSON());});
  await openPanel(page,'Items');await chooseItem(page,'Shop','Moon Lamp');await expect(dialog(page).getByRole('button',{name:'Buy',exact:true})).toBeDisabled();
  await expect(dialog(page)).toContainText('Not enough treats');await chooseItem(page,'Shop','Sun Cushion');await expect(dialog(page).getByRole('button',{name:'Buy',exact:true})).toBeEnabled();
  expect(requests).toEqual([]);
  const reply=await h.mutate(f,data(f,'yard.buyGoodie',{goodieId:'moon_lamp'}));expect(reply.status).toBe(400);expect(reply.body.error).toBe('not enough yard currency');
  const after=await h.saved(f);expect(after.yard.currencies).toEqual(before.yard.currencies);expect(after.yard.goodieInventory).toEqual(before.yard.goodieInventory);expectAdjacent(after,before);
  await expectWallet(page,after.yard.currencies);await evidence(page,info,'unaffordable-shiny',{requests,currencies:after.yard.currencies,denied:reply});
});

test('reserved-placement',async({page},info)=>{
  const f=await fixture('reserved');await boot(page,h,f);const snapshot=await h.snapshot(f);await sceneReady(page);
  expect(snapshot.yardRuntime.visits).toHaveLength(1);expect(snapshot.yardRuntime.visits[0]).toMatchObject({visitorId:'mika_cat',source:'yard-v2',renderCompatible:true});
  expect(snapshot.yardRuntime.visits[0].leavesAt-Date.now()).toBeGreaterThan(25*60000);
  const before=await h.saved(f),visited=[];await openPanel(page,'Items');
  for(const [index,raw]of snapshot.yard.placedGoodies.entries()){
    const reserved=snapshot.yardRuntime.visits.some(v=>v.slotId===raw.slotId&&v.reserved);
    const sameKindIndex=snapshot.yard.placedGoodies.slice(0,index).filter(p=>p.goodieId===raw.goodieId).length;
    expect(reserved).toBe(true);await chooseItem(page,'In the yard',YARD_GOODIES[raw.goodieId].name,sameKindIndex);
    await expect(dialog(page).getByRole('button',{name:'Move',exact:true})).toBeDisabled();await expect(dialog(page).getByRole('button',{name:'Store',exact:true})).toBeDisabled();visited.push(raw.slotId);
    const reply=await h.mutate(f,data(f,'yard.pickupGoodie',{slotId:raw.slotId}));expect(reply.status).toBe(400);expect(reply.body.error).toBe('visitor is using this goodie');
  }
  expect(visited).toEqual(snapshot.yard.placedGoodies.map(p=>p.slotId));
  const after=await h.saved(f);expect(after.yard.placedGoodies).toEqual(before.yard.placedGoodies);expect(after.yard.currencies).toEqual(before.yard.currencies);expectAdjacent(after,before);
  await evidence(page,info,'reserved-placement',{visited,visits:snapshot.yardRuntime.visits.map(({visitId,slotId,visitorId})=>({visitId,slotId,visitorId}))});
});

test('lost-response-reload',async({page},info)=>{
  const f=await fixture('lost');await boot(page,h,f);const before=await h.saved(f),requests=[];
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/player/mutate'&&r.postDataJSON()?.action==='yard.collectGifts')requests.push(r.postDataJSON());});
  try{
    await setProxyState(process.env.YARD_UI_QA_PROXY_STATE,{target:'B',dropCollect:true});
    await openPanel(page,'Guests');await guestSection(page,'Guests');await dialog(page).getByRole('button',{name:'Collect',exact:true}).click();
    await expect.poll(async()=>{try{return JSON.parse(await readFile(process.env.YARD_UI_QA_FAULT,'utf8')).status;}catch(error){if(error.code==='ENOENT')return 0;throw error;}},{timeout:30000}).toBe(200);
    const lost=JSON.parse(await readFile(process.env.YARD_UI_QA_FAULT,'utf8'));expect(lost.captureError).toBeUndefined();expect(lost.command.accountId).toBe(f.id);expect(lost.body.duplicate).toBe(false);
    await expect.poll(async()=>(await outbox(page,f.id))?.items?.some(p=>p.clientActionId===lost.command.clientActionId)).toBe(true);
    const committed=await h.saved(f);expect(committed.yard.currencies).toEqual({...before.yard.currencies,treats:before.yard.currencies.treats+17});expect(committed.yard.album).toEqual(before.yard.album);
    await page.reload();await expect(page.locator('.cy-app')).toBeVisible();
    const retained=(await outbox(page,f.id)).items.find(p=>p.clientActionId===lost.command.clientActionId);expect(retained).toMatchObject({accountId:f.id,action:lost.command.action,payload:lost.command.payload,clientActionId:lost.command.clientActionId});
    const replay=page.waitForResponse(async r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.clientActionId===lost.command.clientActionId&&r.status()===200&&(await r.json()).duplicate===true);
    await setProxyState(process.env.YARD_UI_QA_PROXY_STATE,{target:'B'});const replayBody=await(await replay).json();await emptyOutbox(page,f.id);
    expect(new Set(requests.map(r=>r.clientActionId))).toEqual(new Set([lost.command.clientActionId]));expect(requests.length).toBeGreaterThanOrEqual(2);
    const after=await h.saved(f);expect(after.yard).toEqual(committed.yard);expect(after._yardV2).toEqual(committed._yardV2);expectAdjacent(after,before);
    expect(Object.keys(after._yardV2.runtime.commandReceipts)).toEqual([lost.command.clientActionId]);expect(Object.values(after._yardV2.runtime.giftLedger).filter(g=>g.status==='claimed')).toHaveLength(1);
    await expectWallet(page,after.yard.currencies);await evidence(page,info,'lost-response-reload',{requests,retained,replayBody,currencies:after.yard.currencies});
  }finally{await setProxyState(process.env.YARD_UI_QA_PROXY_STATE,{target:'B'});}
});

test('storage-write-no-send',async({page},info)=>{
  const f=await fixture('storage');await boot(page,h,f);const before=await h.saved(f),requests=[];
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/player/mutate')requests.push(r.postDataJSON());});
  await page.evaluate(()=>{
    const put=IDBObjectStore.prototype.put,setItem=Storage.prototype.setItem;
    IDBObjectStore.prototype.put=function(value,key){if(String(key).startsWith('game_hub_yard_outbox_v2:'))throw new DOMException('Owned QA storage fault','QuotaExceededError');return put.call(this,value,key);};
    Storage.prototype.setItem=function(key,value){if(String(key).startsWith('game_hub_yard_outbox_v2:'))throw new DOMException('Owned QA storage fault','QuotaExceededError');return setItem.call(this,key,value);};
  });
  // The per-test page/context is closed in finally; failed-storage overrides and
  // the unsaved in-memory intent cannot leak into another test or later retry.
  try{
    await openPanel(page,'Items');await chooseItem(page,'Inventory','Sun Cushion');await dialog(page).getByRole('button',{name:'Place',exact:true}).click();
    const place=page.locator('.cy-placement').getByRole('button',{name:'Place',exact:true});await expect(place).toBeEnabled();await place.click();
    await expect(page.locator('.cy-status')).toContainText('OUTBOX_STORAGE_UNAVAILABLE');
    const after=await h.saved(f);expect(requests).toEqual([]);expect(after.yard).toEqual(before.yard);expect(after._yardV2.runtime.commandReceipts).toEqual(before._yardV2.runtime.commandReceipts);expectAdjacent(after,before);
    const stored=await outbox(page,f.id);expect(stored?.items||[]).toEqual([]);
    await evidence(page,info,'storage-write-no-send',{requests,currencies:after.yard.currencies,inventory:after.yard.goodieInventory,ghostStillVisible:await page.locator('.cy-placement').count(),visibleError:await page.locator('.cy-status').innerText()});
  }finally{await page.close();}
});
