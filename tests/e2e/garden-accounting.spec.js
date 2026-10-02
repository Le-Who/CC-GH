import {test,expect} from '@playwright/test';
import {createGardenEconomyState,getGardenXpRequired} from '../../game-logic/garden-economy.js';

// Real /api/player routes. Fault interception forwards the request to the
// running server and drops delivery only; it never fabricates a server result.
const uid=()=>`garden_accounting_http_${Date.now()}_${Math.random().toString(36).slice(2)}`;
async function setup(page,userId){await page.addInitScript(id=>{localStorage.setItem('gh_dev_user_id',id);localStorage.setItem('garden_shelf_language','en');},userId);}
async function boot(page){await page.goto('/');await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:15000});await expect(page.locator('.gs2-stage')).toBeVisible();}
async function serverSnapshot(page){return page.evaluate(async()=>{const response=await fetch('/api/player/snapshot',{headers:{Authorization:`dev ${localStorage.getItem('gh_dev_user_id')}`}});if(!response.ok)throw Error(`snapshot ${response.status}`);return response.json();});}
async function localGarden(page,accountId){return page.evaluate(id=>{const key=id?`game_hub_garden_state_v1:${encodeURIComponent(id)}`:Object.keys(localStorage).find(key=>key.startsWith('game_hub_garden_state_v1:'));return key?JSON.parse(localStorage.getItem(key)||'null')?.state:null;},accountId);}
async function waitLedgerSettled(page){await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('game_hub_garden_intents_v1:')&&!k.includes(':archive:')).every(k=>!JSON.parse(localStorage.getItem(k)).pending))).toBe(true);}
async function seed(page,state){await page.evaluate(async state=>{const response=await fetch('/api/player/mutate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`dev ${localStorage.getItem('gh_dev_user_id')}`},body:JSON.stringify({action:'garden.sync',payload:{state}})});if(!response.ok)throw Error(`seed ${response.status}`);},state);await page.reload();await expect(page.locator('.gs2-stage')).toBeVisible();}
async function buy(page){await page.locator('.gs2-empty-target').first().click();await page.locator('.gs2-catalog-row').filter({has:page.getByRole('heading',{name:'Daisy',exact:true})}).locator('button').click();}
async function loseOneResponse(page,action){
 let resolve,reject,captured=false;const applied=new Promise((a,b)=>{resolve=a;reject=b;});
 await page.route('**/api/player/mutate',async route=>{
  const body=route.request().postDataJSON();
  if(body.action!==action||captured){await route.continue();return;}
  captured=true;
  try{const response=await route.fetch();const server=await response.json();if(!response.ok())throw Error(`real action failed: ${response.status()} ${JSON.stringify(server)}`);resolve({request:body,server});await route.abort('failed');}catch(error){reject(error);await route.abort('failed').catch(()=>{});}
 });return {applied};
}

test('applied purchase with a lost response survives browser restart as one debit and one plant',async({browser})=>{
 const userId=uid();let first=await browser.newContext({baseURL:test.info().project.use.baseURL}),second;const page=await first.newPage();await setup(page,userId);
 try{
  await boot(page);const before=await serverSnapshot(page),{applied}=await loseOneResponse(page,'garden.buyPlant');await buy(page);const proof=await applied;
  expect(proof.request.clientActionId).toBeTruthy();expect(proof.server.receiptConfirmed).toBe(true);expect(proof.server.goldDelta).toBe(-25);
  const storageState=await first.storageState();await first.close();first=null;
  second=await browser.newContext({baseURL:test.info().project.use.baseURL,storageState});const restored=await second.newPage();await setup(restored,userId);const retries=[];restored.on('request',request=>{if(request.url().includes('/api/player/mutate')){const body=request.postDataJSON();if(body.action==='garden.buyPlant')retries.push(body);}});
  await boot(restored);await waitLedgerSettled(restored);const after=await serverSnapshot(restored);
  expect(after.resources.gold).toBe(before.resources.gold-25);expect(after.garden.plants).toHaveLength(1);expect(after.garden.plants[0].id).toBe(proof.server.plantId);
  expect(retries.every(request=>request.clientActionId===proof.request.clientActionId)).toBe(true);await expect(restored.locator(`[data-plant-id="${proof.server.plantId}"]`)).toBeVisible();
 }finally{await first?.close();await second?.close();}
});

test('lost earned-credit response restores the same batch and checkpoint without double gold',async({browser})=>{
 const userId=uid();let first=await browser.newContext({baseURL:test.info().project.use.baseURL}),second;const page=await first.newPage();await setup(page,userId);
 try{
  await boot(page);await seed(page,{...createGardenEconomyState(Date.now()),plants:[{id:'earned-daisy',type:'daisy',level:1,shelfIndex:0,spotIndex:0,phase:3,phaseProgress:0,lastTapped:0}],level:1,xp:0,xpRequired:getGardenXpRequired(1)});
  const before=await serverSnapshot(page),{applied}=await loseOneResponse(page,'garden.creditEarned');await page.locator('.gs2-plant-target').first().click();const proof=await applied;
  expect(proof.server.goldDelta).toBeGreaterThan(0);const storageState=await first.storageState();await first.close();first=null;
  second=await browser.newContext({baseURL:test.info().project.use.baseURL,storageState});const restored=await second.newPage();await setup(restored,userId);await boot(restored);await waitLedgerSettled(restored);
  const after=await serverSnapshot(restored);expect(after.resources.gold).toBe(before.resources.gold+proof.server.goldDelta);expect(after.garden.acknowledgedEarnedTotal).toBeGreaterThanOrEqual(proof.request.payload.throughTotal);expect(after.garden.plants[0].lastTapped).toBe(proof.request.payload.state.plants[0].lastTapped);
 }finally{await first?.close();await second?.close();}
});

test('failed earned credit before server application stays pending and recovers after reconnect',async({page})=>{
 await setup(page,uid());await boot(page);await seed(page,{...createGardenEconomyState(Date.now()),plants:[{id:'retry-daisy',type:'daisy',level:1,shelfIndex:0,spotIndex:0,phase:3,phaseProgress:0,lastTapped:0}]});const before=await serverSnapshot(page);
 let offline=true;const ids=[];await await page.route('**/api/player/mutate',async route=>{const body=route.request().postDataJSON();if(body.action==='garden.creditEarned'){ids.push(body.clientActionId);if(offline){await route.abort('failed');return;}}await route.continue();});
 await page.locator('.gs2-plant-target').first().click();await expect.poll(()=>ids.length).toBeGreaterThan(0);
 expect((await serverSnapshot(page)).resources.gold).toBe(before.resources.gold);
 expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('game_hub_garden_intents_v1:')&&JSON.parse(localStorage.getItem(k)).pending))).toBe(true);
 offline=false;await waitLedgerSettled(page);const after=await serverSnapshot(page);expect(after.resources.gold).toBeGreaterThan(before.resources.gold);expect(new Set(ids).size).toBe(1);
});

test('quest credit and claimed marker survive a lost response together',async({browser})=>{
 const userId=uid();let first=await browser.newContext({baseURL:test.info().project.use.baseURL}),second;const page=await first.newPage();await setup(page,userId);
 try{
  await boot(page);await seed(page,{...createGardenEconomyState(Date.now()),plants:[{id:'quest-seed',type:'daisy',level:1,shelfIndex:0,spotIndex:0,phase:0,phaseProgress:0}]});const before=await serverSnapshot(page);
  const {applied}=await loseOneResponse(page,'garden.claimQuest');await page.getByRole('button',{name:'Garden quests',exact:true}).click();await page.locator('[data-quest-id="first_plant"] button').click();const proof=await applied;
  const storageState=await first.storageState();await first.close();first=null;second=await browser.newContext({baseURL:test.info().project.use.baseURL,storageState});const restored=await second.newPage();await setup(restored,userId);await boot(restored);await waitLedgerSettled(restored);
  const after=await serverSnapshot(restored);expect(after.resources.gold).toBe(before.resources.gold+proof.server.goldDelta);expect(after.garden.claimedQuests.filter(id=>id==='first_plant')).toHaveLength(1);
  await restored.getByRole('button',{name:'Garden quests',exact:true}).click();await expect(restored.locator('[data-quest-id="first_plant"] button')).toBeDisabled();
 }finally{await first?.close();await second?.close();}
});

test('two real clients cannot both buy with one affordable balance or erase the winner',async({browser})=>{
 const userId=uid(),a=await browser.newContext({baseURL:test.info().project.use.baseURL}),b=await browser.newContext({baseURL:test.info().project.use.baseURL});
 try{
  const first=await a.newPage(),second=await b.newPage();await setup(first,userId);await setup(second,userId);await boot(first);
  await first.evaluate(async()=>{const response=await fetch('/api/player/mutate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`dev ${localStorage.getItem('gh_dev_user_id')}`},body:JSON.stringify({action:'garden.goldDelta',payload:{amount:-75,reason:'disposable-test-fixture'}})});if(!response.ok)throw Error('fixture debit failed');});
  await first.reload();await boot(second);await Promise.all([buy(first),buy(second)]);
  await expect.poll(async()=>(await serverSnapshot(first)).garden.plants.length).toBe(1);const saved=await serverSnapshot(first);expect(saved.resources.gold).toBe(0);expect(saved.garden.plants).toHaveLength(1);
  await Promise.all([first.reload(),second.reload()]);await expect(first.locator('[data-plant-id]')).toHaveCount(1);await expect(second.locator('[data-plant-id]')).toHaveCount(1);expect((await serverSnapshot(second)).resources.gold).toBe(0);
 }finally{await a.close();await b.close();}
});

test('missing Web Locks leaves growth and Care usable while economic buttons fail closed',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));await setup(page,uid());await boot(page);
 await seed(page,{...createGardenEconomyState(Date.now()),plants:[{id:'view-only-daisy',type:'daisy',level:1,shelfIndex:0,spotIndex:0,phase:0,phaseProgress:1000,lastTapped:0}]});
 await expect(page.locator('.gs2-status')).toContainText('Growth and viewing remain available');const before=await serverSnapshot(page);
 const progress=(await localGarden(page)).plants[0].phaseProgress;
 await page.locator('.gs2-plant-target').first().click();await expect.poll(async()=>(await localGarden(page)).plants[0].phaseProgress).toBeGreaterThan(progress);
 await page.locator('[data-plant-details-button]').first().click();await expect(page.locator('.gs2-dialog[data-garden-panel="plant-detail"]')).toBeVisible();
 await expect(page.getByRole('button',{name:'Sell',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Water',exact:true}).click();await expect.poll(async()=>(await localGarden(page)).plants[0].lastWatered).toBeGreaterThan(0);
 await page.locator('.gs2-close').click();expect((await serverSnapshot(page)).resources.gold).toBe(before.resources.gold);
});

test('ambiguous expired pending action can be explicitly archived against server state without a charge',async({page})=>{
 await setup(page,uid());await boot(page);const before=await serverSnapshot(page);
 await page.evaluate(({accountId,revision})=>{
  const streamId='expired_browser_stream_0123456',clientActionId=`garden:${streamId}:1`,intent={accountId,streamId,sequence:1,createdAt:Date.now()-74*3600000};
  localStorage.setItem(`game_hub_garden_intents_v1:${encodeURIComponent(accountId)}`,JSON.stringify({version:1,accountId,streamId,nextSequence:1,pending:{action:'garden.buyPlant',payload:{type:'daisy',shelfIndex:0,spotIndex:0,expectedRevision:revision,intent},clientActionId}}));
 },{accountId:before.player.id,revision:before.garden.economicRevision});
 await page.reload();await expect(page.locator('.gs2-status')).toContainText('Pending action needs review');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Review',exact:true}).click();
 expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('game_hub_garden_intents_v1:')&&!k.includes(':archive:')&&JSON.parse(localStorage.getItem(k)).pending))).toBe(true);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Review',exact:true}).click();await waitLedgerSettled(page);
 const after=await serverSnapshot(page);expect(after.resources.gold).toBe(before.resources.gold);expect(after.garden.plants).toEqual(before.garden.plants);
 expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes(':archive:garden:expired_browser_stream_0123456:1')))).toBe(true);
 await buy(page);await expect.poll(async()=>(await serverSnapshot(page)).garden.plants.length).toBe(1);expect((await serverSnapshot(page)).resources.gold).toBe(before.resources.gold-25);
});

test('same browser A → fresh B → A preserves ownership, earned credit and the legacy recovery copy',async({page})=>{
 const userA=uid(),userB=uid();
 // One persistent browser context; change only the development authentication
 // identity between reloads. No snapshot/mutate endpoint is routed or mocked.
 await page.addInitScript(()=>{localStorage.setItem('garden_shelf_language','en');});
 await page.goto('/');
 await page.evaluate(id=>localStorage.setItem('gh_dev_user_id',id),userA);
 await boot(page);
 const firstA=await serverSnapshot(page);
 const aGarden={...createGardenEconomyState(Date.now()),name:'Account A garden',plants:[{id:'account-a-owned-daisy',type:'daisy',level:1,shelfIndex:0,spotIndex:0,phase:0,phaseProgress:0,lastTapped:0}],totalGoldEarned:10000};
 const aApplied=await page.evaluate(async({garden,accountId,revision})=>{
  const streamId='account_cache_fixture_a_stream',clientActionId=`garden:${streamId}:1`;
  const response=await fetch('/api/player/mutate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`dev ${localStorage.getItem('gh_dev_user_id')}`},body:JSON.stringify({action:'garden.creditEarned',clientActionId,payload:{state:garden,throughTotal:10000,expectedRevision:revision,intent:{accountId,streamId,sequence:1,createdAt:Date.now()}}})});
  const result=await response.json();if(!response.ok)throw Error(JSON.stringify(result));return result;
 },{garden:aGarden,accountId:firstA.player.id,revision:firstA.garden.economicRevision});
 expect(aApplied.goldDelta).toBe(10000);
 await page.reload();await expect(page.locator('[data-plant-id="account-a-owned-daisy"]')).toBeVisible();
 await expect.poll(async()=>(await localGarden(page,firstA.player.id))?.totalGoldEarned).toBe(10000);
 const aBeforeSwitch=await serverSnapshot(page);
 const legacyBytes=JSON.stringify(aBeforeSwitch.garden);
 await page.evaluate(({legacy,id})=>{localStorage.setItem('terrarium_save',legacy);localStorage.setItem('gh_dev_user_id',id);},{legacy:legacyBytes,id:userB});
 const bRequests=[];const observe=request=>{if(request.url().includes('/api/player/mutate'))bRequests.push(request.postDataJSON());};page.on('request',observe);
 await page.reload();await expect(page.locator('.status-dot.ready')).toBeVisible();await expect(page.locator('.gs2-stage')).toBeVisible();
 const firstB=await serverSnapshot(page);
 expect(firstB.player.id).not.toBe(firstA.player.id);
 await expect.poll(async()=>(await localGarden(page,firstB.player.id))?.totalGoldEarned).toBe(0);
 await expect(page.locator('[data-plant-id]')).toHaveCount(0);
 // Observe multiple normal ticks and the delayed sync window. There must be no
 // credit request or foreign entity upload from the retained legacy history.
 await page.waitForTimeout(3500);
 const freshB=await serverSnapshot(page);
 expect(freshB.garden.plants).toEqual([]);expect(freshB.garden.totalGoldEarned).toBe(0);expect(freshB.garden.acknowledgedEarnedTotal).toBe(0);expect(freshB.resources.gold).toBe(firstB.resources.gold);
 expect(bRequests.filter(request=>request.action==='garden.creditEarned')).toEqual([]);
 expect(bRequests.filter(request=>request.payload?.state).every(request=>!request.payload.state.plants.some(plant=>plant.id==='account-a-owned-daisy'))).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem('terrarium_save'))).toBe(legacyBytes);
 expect((await localGarden(page,firstA.player.id)).plants[0].id).toBe('account-a-owned-daisy');
 // The first real tap for B must credit only B's one-gold reward, not 10001.
 await buy(page);await expect.poll(async()=>(await serverSnapshot(page)).garden.plants.length).toBe(1);
 const boughtB=await serverSnapshot(page);await seed(page,{...boughtB.garden,plants:boughtB.garden.plants.map(plant=>({...plant,phase:3,phaseProgress:0,lastTapped:0})),lastTick:Date.now(),passiveGoldBuffer:0});
 const earnedResponse=page.waitForResponse(response=>{if(!response.url().includes('/api/player/mutate'))return false;try{return response.request().postDataJSON()?.action==='garden.creditEarned';}catch{return false;}});
 await page.locator('.gs2-plant-target').first().click();const earned=await (await earnedResponse).json();
 expect(earned.goldDelta).toBe(1);expect(earned.snapshot.garden.acknowledgedEarnedTotal).toBe(1);expect(earned.snapshot.resources.gold).toBe(firstB.resources.gold-25+1);
 page.off('request',observe);
 await page.evaluate(id=>localStorage.setItem('gh_dev_user_id',id),userA);await page.reload();
 await expect(page.locator('[data-plant-id="account-a-owned-daisy"]')).toBeVisible();
 const returnedA=await serverSnapshot(page);
 expect(returnedA.player.id).toBe(firstA.player.id);expect(returnedA.resources.gold).toBe(aBeforeSwitch.resources.gold);expect(returnedA.garden.totalGoldEarned).toBe(10000);expect(returnedA.garden.acknowledgedEarnedTotal).toBe(10000);expect(returnedA.garden.name).toBe('Account A garden');
 expect(await page.evaluate(()=>localStorage.getItem('terrarium_save'))).toBe(legacyBytes);
 expect((await localGarden(page,firstA.player.id)).plants[0].id).toBe('account-a-owned-daisy');
 expect((await localGarden(page,firstB.player.id)).plants[0].id).not.toBe('account-a-owned-daisy');
});
