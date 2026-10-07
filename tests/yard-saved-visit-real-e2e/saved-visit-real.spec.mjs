/** Actual app/server/PG commands. No request interception, fake response, store
 * setter, browser clock manipulation, preview URL, or handwritten saved plan. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {selectHomeGame} from '../e2e/helpers/home.js';
import {YARD_FOODS} from '../../game-logic/yard-v2/catalog.mjs';
import {TEST_REFILL_FOOD_ID as foodId} from '../../scripts/yard-real-backend-contract.mjs';
const run=promisify(execFile),OUT=path.resolve('test-results/saved-visit-real');
const read=page=>page.evaluate(()=>window.__yardPipIntegration?.snapshot());
async function seedProcess(args,log){
 try{const result=await run(process.execPath,['--import','./tests/fixtures/register-real-backend-runtime.mjs','scripts/yard-real-backend-seed.mjs',...args],
  {env:{...process.env,NODE_ENV:'test',DEV_AUTH_ENABLED:'true',YARD_SAVED_VISIT_PG:'1',REDIS_URL:'',NODE_OPTIONS:''},timeout:85000,maxBuffer:1024*1024});
  await fs.writeFile(log,result.stdout+'\n'+result.stderr);
 }catch(error){await fs.writeFile(log,String(error.stdout||'')+'\n'+String(error.stderr||'')+'\n'+String(error));throw error;}
}
async function ready(page,visitId){
 await expect.poll(async()=>{const d=await read(page);return d?.mode==='canonical-saved-visits'&&d.scene?.ready===true
  &&d.scene.canonicalFood?.render?.available===true&&d.scene.lastFrame?.visitId===visitId&&d.scene.lastFrame?.visibility==='both';},{timeout:30000}).toBe(true);
 await expect(page.locator('.cy-pip-direct-layer canvas')).toHaveCount(1);
 await expect(page.locator('.cy-pip-viewport-note')).toHaveCount(0);
}
for(const viewport of [{width:320,height:568,dpr:1},{width:390,height:844,dpr:2},{width:844,height:390,dpr:1}])
test(`real saved Yard buy/fill/reload ${viewport.width}x${viewport.height}`,async({browser},info)=>{
 const id=`${viewport.width}x${viewport.height}-dpr${viewport.dpr}`,externalId='saved-pip-real-'+randomUUID().replaceAll('-',''),
  metadata=path.join(OUT,id+'-account.json'),commandsFile=path.join(OUT,id+'-commands.json');
 await fs.mkdir(OUT,{recursive:true});
 await seedProcess(['--base-url',info.project.use.baseURL,'--external-id',externalId,'--output',metadata],path.join(OUT,id+'-seed.log'));
 const account=JSON.parse(await fs.readFile(metadata,'utf8'));
 const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.dpr,isMobile:true,hasTouch:true,serviceWorkers:'block'}),
  page=await context.newPage(),errors=[],network=[],reads=[],pendingReads=[],checkpoints=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('response',response=>{
  const url=new URL(response.url());if(!url.pathname.startsWith('/api/'))return;
  const req=response.request(),row={path:url.pathname,status:response.status(),method:req.method(),body:req.method()==='POST'?req.postDataJSON():null};network.push(row);
  if(url.pathname==='/api/player/snapshot'||url.pathname==='/api/player/mutate')pendingReads.push(response.json().then(body=>{
   row.error=body.error||null;if(body.player||body.snapshot?.player)reads.push(body.snapshot||body);
  }).catch(error=>{row.decodeError=String(error);}));
 });
 await page.addInitScript(({externalId})=>{localStorage.setItem('gh_dev_user_id',externalId);localStorage.setItem('garden_shelf_language','en');},{externalId});
 const capture=async name=>{const diagnostics=await read(page);checkpoints.push({name,diagnostics});await page.screenshot({path:path.join(OUT,id+'-'+name+'.png'),scale:'device'});return diagnostics;};
 const successfulAction=action=>page.waitForResponse(response=>response.url().endsWith('/api/player/mutate')&&response.request().method()==='POST'
  &&response.request().postDataJSON()?.action===action&&response.status()===200,{timeout:30000});
 let buy,fill,replayProof;
 try{
  await page.goto(info.project.use.baseURL+'/');await expect(page.locator('.gs2-stage')).toBeVisible({timeout:30000});
  await selectHomeGame(page,'room');await ready(page,account.candidate.visitId);const first=await capture('normal-entry');
  assert.equal(first.scene.plannerWorkerActive,false);assert.equal(first.scene.inspectionCount,0);assert.equal(first.scene.canonicalRecords[0].uses,1);
  assert.equal(new URL(page.url()).searchParams.size,0);
  await page.locator('[data-nav-item="food"]').click();
  assert.equal(account.testFoodId,foodId);
  const buyButton=page.locator(`[data-yard-action="buy-food"][data-food-id="${foodId}"]`);await expect(buyButton).toBeEnabled({timeout:20000});
  const buyResponse=successfulAction('yard.buyFood');await buyButton.click();const boughtResponse=await buyResponse,bought=await boughtResponse.json();buy=boughtResponse.request().postDataJSON();
  assert.equal(buy.accountId,account.accountId);assert.equal(bought.success,true);assert.equal(bought.snapshot.player.id,account.accountId);
  assert.equal(buy.payload.foodId,foodId);assert.equal(buy.payload.qty,1);
  assert.equal(bought.snapshot.yard.foodInventory[foodId],(account.admitted.foodInventory[foodId]||0)+1);
  for(const currency of ['treats','shinyTreats'])assert.equal(bought.snapshot.yard.currencies[currency],account.admitted.currencies[currency]-(YARD_FOODS[foodId].cost[currency]||0));
  await page.locator('.cy-food-select').first().selectOption(foodId);
  const fillButton=page.locator('[data-yard-action="set-food"][data-bowl-id="bowl-1"]');await expect(fillButton).toBeEnabled({timeout:20000});
  const fillResponse=successfulAction('yard.setFood');await fillButton.click();const filledResponse=await fillResponse,filled=await filledResponse.json();fill=filledResponse.request().postDataJSON();
  assert.equal(fill.accountId,account.accountId);assert.equal(fill.payload.foodId,foodId);assert.equal(filled.success,true);assert.equal(filled.snapshot.yard.bowls[0].foodId,foodId);
  assert.equal(filled.snapshot.yard.foodInventory[foodId]||0,account.admitted.foodInventory[foodId]||0);
  await page.getByRole('button',{name:'Close courtyard panel',exact:true}).click();
  await expect.poll(async()=>(await read(page))?.scene?.canonicalFood?.render?.state,{timeout:20000}).toBe(foodId);
  await ready(page,account.candidate.visitId);await capture('real-buy-and-fill');
  // Lost-response retry uses the exact real command and nonce through the same
  // existing endpoint. This must report duplicate and debit nothing again.
  const replayResponse=await page.request.post('/api/player/mutate',{headers:{authorization:'dev '+externalId},data:fill});
  assert.equal(replayResponse.status(),200);const replay=await replayResponse.json();assert.equal(replay.duplicate,true);
  assert.deepEqual(replay.snapshot.yard.foodInventory,filled.snapshot.yard.foodInventory);assert.deepEqual(replay.snapshot.yard.currencies,filled.snapshot.yard.currencies);
  replayProof={status:replayResponse.status(),duplicate:replay.duplicate,clientActionId:fill.clientActionId,inventoryUnchanged:true,currenciesUnchanged:true};
  await page.locator('.cy-home').click();await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await page.locator('[data-home-game="garden"]').click();await expect(page.locator('.gs2-stage')).toBeVisible();
  await selectHomeGame(page,'room');await ready(page,account.candidate.visitId);await capture('genuine-garden-return');
  await page.reload();await expect(page.locator('.cy-app')).toBeVisible({timeout:25000});await ready(page,account.candidate.visitId);
  await expect.poll(async()=>(await read(page))?.scene?.canonicalFood?.render?.state).toBe(foodId);await capture('durable-reload');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await fs.writeFile(commandsFile,JSON.stringify([buy,fill],null,2)+'\n');
  await seedProcess(['--base-url',info.project.use.baseURL,'--verify',metadata,'--receipts',commandsFile,'--output',path.join(OUT,id+'-durable.json')],path.join(OUT,id+'-verify.log'));
  await Promise.all(pendingReads);assert.deepEqual(errors,[]);
  assert.ok(reads.length>0);assert.ok(reads.every(snapshot=>snapshot.player.id===account.accountId));
  assert.ok(network.some(row=>row.path==='/api/player/mutate'&&row.body?.action==='garden.r2'&&row.status===200),'Real Garden lifecycle must succeed, not be blocked');
  assert.equal(network.some(row=>row.status>=500),false);
 }finally{
  await Promise.allSettled(pendingReads);
  await fs.writeFile(path.join(OUT,id+'-proof.json'),JSON.stringify({scope:'Actual application build, real dev-auth API, disposable PostgreSQL, source-created saved Pip, UI food commands, exact-nonce replay, navigation and reload. No interception or clock controls.',
   accountId:account.accountId,visitId:account.candidate.visitId,leavesAt:account.candidate.leavesAt,viewport,checkpoints,network,errors,buy,fill,replayProof},null,2)+'\n');
  await context.close();
 }
});
