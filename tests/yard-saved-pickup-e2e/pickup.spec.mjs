/** Actual saved pickup UI, durable browser journal, delayed winning HTTP and PostgreSQL readback. */
import {test,expect} from '@playwright/test';
import {savedPipScreenshotPixels} from '../fixtures/saved-pip-pixels.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {selectHomeGame} from '../e2e/helpers/home.js';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from '../../game-logic/yard-v2/canonical-food-protocol.mjs';
const run=promisify(execFile),BASE_OUT=path.resolve('test-results/saved-pickup-browser');
for(const [width,height] of [[320,568],[390,844],[844,390]])test(`actual UI released pickup keeps visible status and journal until HTTP settles (${width}x${height})`,async({browser},info)=>{
 const OUT=path.join(BASE_OUT,`${width}x${height}`);
 await fs.mkdir(OUT,{recursive:true});
 const externalId='saved-pip-real-'+randomUUID().replaceAll('-',''),metadataFile=path.join(OUT,'account.json'),commandFile=path.join(OUT,'command.json');
 const env={...process.env,NODE_ENV:'test',DEV_AUTH_ENABLED:'true',YARD_SAVED_VISIT_PG:'1',REDIS_URL:'',NODE_OPTIONS:''};
 const seed=await run(process.execPath,['--import','./tests/fixtures/register-real-backend-runtime.mjs','scripts/yard-real-backend-seed.mjs','--released','--base-url',info.project.use.baseURL,'--external-id',externalId,'--output',metadataFile],{env,timeout:90000,maxBuffer:1024*1024});
 await fs.writeFile(path.join(OUT,'seed.log'),seed.stdout+'\n'+seed.stderr);
 const metadata=JSON.parse(await fs.readFile(metadataFile,'utf8')),initial=JSON.parse(await fs.readFile(metadataFile+'.snapshot.json','utf8'));
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 const read=()=>page.evaluate(()=>window.__yardPipIntegration?.snapshot());
 const ready=async empty=>expect.poll(async()=>{
  const d=await read(),s=d?.scene,f=s?.canonicalFood,c=s?.renderer?.canonicalFood,paint=s?.renderer?.lastFrame?.canonicalFood;
  return d?.mode==='canonical-saved-visits'&&s?.ready===true&&s.lastFrame?.visitId===metadata.candidate.visitId&&s.lastFrame?.visibility==='both'&&s.canonicalRecords?.length===(empty?0:1)
   &&f?.loading===false&&f.render?.available===true&&f.render.state===f.state&&c?.pending===0&&c.binding?.visible===true
   &&paint?.available===true&&paint.visible===true&&paint.state===f.state&&paint.request===c.request&&paint.ownerEpoch===c.ownerEpoch;
 },{timeout:30000}).toBe(true);
 const pixelEvidence=[];
 const visibleActor=async label=>{
  let lastImage,lastProof;
  try{await expect.poll(async()=>{
   const s=(await read()).scene,bounds=s.lastFrame?.viewportBounds||[],actor=bounds.find(b=>b.id==='saved-Pip'),food=bounds.find(b=>b.id==='canonical-food');
   if(!actor||!food||actor.portalClipped)return false;
   const stage=s.projection;
   for(const bound of [actor,food])assert.ok(bound.x>=bound.padding-.05&&bound.y>=bound.padding-.05&&bound.right<=stage.width-bound.padding+.05&&bound.bottom<=stage.height-bound.padding+.05,bound.id+' whole source volume fits stage clear of HUD');
   lastImage=await page.locator('.cy-scene').screenshot({scale:'css'});
   const box=b=>({left:b.x,top:b.y,right:b.right,bottom:b.bottom}),pixels=await savedPipScreenshotPixels(lastImage,box(actor),box(food));
   assert.equal(pixels.imageWidth,Math.round(stage.width),'screenshot CSS width matches projection');assert.equal(pixels.imageHeight,Math.round(stage.height),'screenshot CSS height matches projection');
   lastProof={label,frame:s.frameCount,actor,food,pixels,foodRender:s.renderer.lastFrame.canonicalFood};
   return pixels.count>=100&&pixels.width>=10&&pixels.height>=20&&pixels.food.count>=15&&pixels.food.width>=5&&pixels.food.height>=3;
  },{timeout:15000,message:'Actual actor-body and bowl pixels must be present inside the source-owned viewport volumes'}).toBe(true);
  }finally{if(lastProof)pixelEvidence.push(lastProof);if(lastImage)await fs.writeFile(path.join(OUT,label+'-stage-pixels.png'),lastImage);}
 };

 try{
  await page.addInitScript(({externalId})=>{localStorage.setItem('gh_dev_user_id',externalId);localStorage.setItem('garden_shelf_language','en');},{externalId});
  await page.goto(info.project.use.baseURL+'/');await expect(page.locator('.gs2-stage')).toBeVisible({timeout:30000});await selectHomeGame(page,'room');await ready(false);await visibleActor('before-pickup');
  await page.screenshot({path:path.join(OUT,'before-pickup.png'),scale:'device'});
  const journal=()=>page.evaluate(async accountId=>{
    const key='game_hub_yard_outbox_v2:'+encodeURIComponent(accountId),fallback=localStorage.getItem(key);
    if(fallback!==null)throw Error('Expected actual IndexedDB journal, found localStorage fallback');
    return await new Promise((resolve,reject)=>{const open=indexedDB.open('keyval-store');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,request=db.transaction('keyval','readonly').objectStore('keyval').get(key);request.onsuccess=()=>{resolve(request.result);db.close();};request.onerror=()=>{reject(request.error);db.close();};};});
  },metadata.accountId);
  let command,body,response,send,deliver;
  const beforeSend=new Promise(resolve=>{send=resolve;}),beforeDeliver=new Promise(resolve=>{deliver=resolve;});
  await page.route('**/api/player/mutate',async route=>{
    const candidate=route.request().postDataJSON();
    if(candidate.action!=='yard.pickupGoodie')return route.continue();
    assert.equal(command,undefined,'one UI intent sends one initial command');command=candidate;
    await beforeSend;response=await route.fetch();body=await response.json();await beforeDeliver;await route.fulfill({response});
  });
  await page.locator('[data-nav-item="decor"]').click();
  await page.locator('[data-decor-tab="placed"]').click();
  await page.locator('.cy-catalog-choice[data-slot-id="canonical:a"]').click();
  const pickup=page.locator('[data-yard-action="pickup"]');
  await expect(page.locator('[data-yard-action="move"]')).toBeDisabled();
  await expect(pickup).toBeEnabled();await pickup.click();
  await expect.poll(()=>command?.action).toBe('yard.pickupGoodie');
  assert.equal(command.accountId,metadata.accountId);assert(command.clientActionId.startsWith(CANONICAL_FOOD_NONCE_PREFIX));
  assert.deepEqual(command.payload,{...CANONICAL_FOOD_LOCATION,slotId:'canonical:a'});
  await expect.poll(async()=> (await journal())?.items?.length).toBe(1);
  const commandFields=item=>({accountId:item.accountId,action:item.action,payload:item.payload,clientActionId:item.clientActionId});
  const held=await journal();assert.deepEqual(commandFields(held.items[0]),commandFields(command));
  await expect(pickup).toBeDisabled();await expect(page.locator('.cy-status')).toContainText(/saving/i);
  const inDialog=page.locator('.cy-dialog [data-saved-pickup-pending]');
  await expect(inDialog).toBeVisible();await expect(inDialog).toContainText(/saving/i);
  const statusBox=await inDialog.boundingBox(),dialogBox=await page.locator('.cy-dialog').boundingBox();
  assert.ok(statusBox&&dialogBox&&statusBox.x>=Math.max(0,dialogBox.x)&&statusBox.y>=Math.max(0,dialogBox.y)&&statusBox.x+statusBox.width<=Math.min(width,dialogBox.x+dialogBox.width)&&statusBox.y+statusBox.height<=Math.min(height,dialogBox.y+dialogBox.height),'visible status fits viewport and dialog');

  await ready(false);await page.screenshot({path:path.join(OUT,'pending-before-server.png'),scale:'device'});
  send();await expect.poll(()=>body?.success,{timeout:30000}).toBe(true);
  assert.deepEqual(commandFields((await journal()).items[0]),commandFields(command),'winning HTTP held: exact durable command remains until acknowledgement');
  await expect(inDialog).toBeVisible();await expect(inDialog).toContainText(/saving/i);
  await page.screenshot({path:path.join(OUT,'pending-winning-http.png'),scale:'device'});
  await fs.writeFile(commandFile,JSON.stringify(command,null,2)+'\n');
  deliver();await expect.poll(async()=> (await journal())?.items?.length).toBe(0);await expect(inDialog).toHaveCount(0);
  assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.success,true);assert.equal(body.snapshot.yardRuntime.status,'ready');
  assert.deepEqual(body.snapshot.yardRuntime.canonicalPlacements,[]);assert.equal(body.snapshot.yardRuntime.canonicalVisits[0].visitId,metadata.candidate.visitId);
  assert.equal(body.snapshot.yardRuntime.canonicalVisits[0].plan.leavesAt,metadata.candidate.leavesAt);
  assert.equal(body.snapshot.yard.goodieInventory.leaf_pot,(initial.yard.goodieInventory.leaf_pot||0)+1);
  assert.deepEqual(body.snapshot.yard.currencies,initial.yard.currencies);
  const replayResponse=await page.request.post('/api/player/mutate',{headers:{authorization:'dev '+externalId},data:command}),replay=await replayResponse.json();
  assert.equal(replayResponse.status(),200);assert.equal(replay.duplicate,true);assert.deepEqual(replay.snapshot.yard.goodieInventory,body.snapshot.yard.goodieInventory);
  await page.locator('.cy-dialog header button').click();await ready(true);await visibleActor('after-pickup');await page.screenshot({path:path.join(OUT,'after-pickup.png'),scale:'device'});
  await page.reload();await expect(page.locator('.cy-app')).toBeVisible({timeout:25000});await ready(true);await visibleActor('after-reload');
  await page.screenshot({path:path.join(OUT,'after-reload.png'),scale:'device'});assert.deepEqual(errors,[]);
  const durable=await run(process.execPath,['scripts/yard-pickup-backend-readback.mjs',metadataFile,commandFile,path.join(OUT,'durable.json')],{env,timeout:30000,maxBuffer:1024*1024});
  await fs.writeFile(path.join(OUT,'readback.log'),durable.stdout+'\n'+durable.stderr);
  await fs.writeFile(path.join(OUT,'proof.json'),JSON.stringify({scope:'Actual pickup button, IDB journal before send and while committed HTTP is delayed, receipt settlement, API duplicate, ordinary renderer and reload; not a verified realtime-delivery assertion, full-stay or all-device qualification',passed:true,visitId:metadata.candidate.visitId,leavesAt:metadata.candidate.leavesAt,commandId:command.clientActionId,pixelEvidence,diagnostics:await read()},null,2)+'\n');
 }catch(error){await page.screenshot({path:path.join(OUT,'failure.png'),scale:'device'}).catch(()=>{});await fs.writeFile(path.join(OUT,'failure.json'),JSON.stringify({error:String(error.stack),errors,pixelEvidence,diagnostics:await read().catch(()=>null)},null,2)+'\n');throw error;
 }finally{await context.close();}
});
