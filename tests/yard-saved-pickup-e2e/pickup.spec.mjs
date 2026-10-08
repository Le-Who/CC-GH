/** Real dev-auth API and PostgreSQL, then the ordinary saved visitor renderer.
 * Item controls intentionally remain disabled; this does not claim UI pickup. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {selectHomeGame} from '../e2e/helpers/home.js';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from '../../game-logic/yard-v2/canonical-food-protocol.mjs';
const run=promisify(execFile),OUT=path.resolve('test-results/saved-pickup-browser');
test('actual API released pickup keeps Pip visible through duplicate and browser reload',async({browser},info)=>{
 await fs.mkdir(OUT,{recursive:true});
 const externalId='saved-pip-real-'+randomUUID().replaceAll('-',''),metadataFile=path.join(OUT,'account.json'),commandFile=path.join(OUT,'command.json');
 const env={...process.env,NODE_ENV:'test',DEV_AUTH_ENABLED:'true',YARD_SAVED_VISIT_PG:'1',REDIS_URL:'',NODE_OPTIONS:''};
 const seed=await run(process.execPath,['--import','./tests/fixtures/register-real-backend-runtime.mjs','scripts/yard-real-backend-seed.mjs','--released','--base-url',info.project.use.baseURL,'--external-id',externalId,'--output',metadataFile],{env,timeout:90000,maxBuffer:1024*1024});
 await fs.writeFile(path.join(OUT,'seed.log'),seed.stdout+'\n'+seed.stderr);
 const metadata=JSON.parse(await fs.readFile(metadataFile,'utf8')),initial=JSON.parse(await fs.readFile(metadataFile+'.snapshot.json','utf8'));
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 const read=()=>page.evaluate(()=>window.__yardPipIntegration?.snapshot());
 const ready=async empty=>expect.poll(async()=>{const d=await read();return d?.mode==='canonical-saved-visits'&&d.scene?.ready===true&&d.scene.lastFrame?.visitId===metadata.candidate.visitId&&d.scene.lastFrame?.visibility==='both'&&d.scene.canonicalRecords?.length===(empty?0:1);},{timeout:30000}).toBe(true);
 try{
  await page.addInitScript(({externalId})=>{localStorage.setItem('gh_dev_user_id',externalId);localStorage.setItem('garden_shelf_language','en');},{externalId});
  await page.goto(info.project.use.baseURL+'/');await expect(page.locator('.gs2-stage')).toBeVisible({timeout:30000});await selectHomeGame(page,'room');await ready(false);
  await page.screenshot({path:path.join(OUT,'before-pickup.png'),scale:'device'});
  const command={accountId:metadata.accountId,action:'yard.pickupGoodie',clientActionId:CANONICAL_FOOD_NONCE_PREFIX+'browser-'+randomUUID(),payload:{...CANONICAL_FOOD_LOCATION,slotId:'canonical:a'}};
  await fs.writeFile(commandFile,JSON.stringify(command,null,2)+'\n');
  const response=await page.request.post('/api/player/mutate',{headers:{authorization:'dev '+externalId},data:command});const body=await response.json();
  assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.success,true);assert.equal(body.snapshot.yardRuntime.status,'ready');
  assert.deepEqual(body.snapshot.yardRuntime.canonicalPlacements,[]);assert.equal(body.snapshot.yardRuntime.canonicalVisits[0].visitId,metadata.candidate.visitId);
  assert.equal(body.snapshot.yardRuntime.canonicalVisits[0].plan.leavesAt,metadata.candidate.leavesAt);
  assert.equal(body.snapshot.yard.goodieInventory.leaf_pot,(initial.yard.goodieInventory.leaf_pot||0)+1);
  assert.deepEqual(body.snapshot.yard.currencies,initial.yard.currencies);
  const replayResponse=await page.request.post('/api/player/mutate',{headers:{authorization:'dev '+externalId},data:command}),replay=await replayResponse.json();
  assert.equal(replayResponse.status(),200);assert.equal(replay.duplicate,true);assert.deepEqual(replay.snapshot.yard.goodieInventory,body.snapshot.yard.goodieInventory);
  await ready(true);await page.screenshot({path:path.join(OUT,'after-pickup.png'),scale:'device'});
  await page.reload();await expect(page.locator('.cy-app')).toBeVisible({timeout:25000});await ready(true);
  await page.screenshot({path:path.join(OUT,'after-reload.png'),scale:'device'});assert.deepEqual(errors,[]);
  const durable=await run(process.execPath,['scripts/yard-pickup-backend-readback.mjs',metadataFile,commandFile,path.join(OUT,'durable.json')],{env,timeout:30000,maxBuffer:1024*1024});
  await fs.writeFile(path.join(OUT,'readback.log'),durable.stdout+'\n'+durable.stderr);
  await fs.writeFile(path.join(OUT,'proof.json'),JSON.stringify({scope:'Actual API command, atomic response, duplicate, ordinary renderer and reload; not UI button or full-stay qualification',passed:true,visitId:metadata.candidate.visitId,leavesAt:metadata.candidate.leavesAt,commandId:command.clientActionId,diagnostics:await read()},null,2)+'\n');
 }catch(error){await page.screenshot({path:path.join(OUT,'failure.png'),scale:'device'}).catch(()=>{});await fs.writeFile(path.join(OUT,'failure.json'),JSON.stringify({error:String(error.stack),errors,diagnostics:await read().catch(()=>null)},null,2)+'\n');throw error;
 }finally{await context.close();}
});
