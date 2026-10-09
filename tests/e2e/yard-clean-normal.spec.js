/** Normal route, current clean art and real canonical item records. Ephemeral
 * source-action fixture only; this does not certify PostgreSQL/auth or live. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startSwFixture} from './helpers/swFixture.mjs';
import {buildSnapshot,applyActionWithReceipt} from '../../routes/player.js';
import {canonicalCommandScope,canonicalNoncePrefix} from '../../src/game-state/canonicalYardProtocol.mjs';

const base='57e0117ee05e2e6cc1b15e91615875c9919c33fa';
const backgroundSha='c159eb042e282930b02c5f84002aa8dfd18ba377ea830985b6a1847b86d2ff79';
const retired=/\/(?:games\/companion-yard\/|assets-runtime\/companion-yard\/|assets\/yard-(?:mika|mochi|pebble|pip|family|fox|turtles)\/)/;
const read=page=>page.evaluate(()=>window.__yardPipIntegration?.snapshot());
async function ready(page){
 await expect(page.locator('.cy-app[data-yard-version="canonical-clean-r1"]')).toBeVisible();
 await expect.poll(async()=>{const d=await read(page);if(d?.mode==='unavailable')throw Error(JSON.stringify(d));return d?.mode==='canonical-items'&&d.scene?.ready&&d.scene?.frameCount>0;},{timeout:30000}).toBe(true);
 const d=await read(page);assert.equal(d.scene.domain,'pip-clean-garden-prototype-v1');assert.equal(d.scene.actorUnitsPerSource,16);
 assert.equal(d.scene.canonicalSavedVisits,false);assert.equal(d.scene.viewportBlocked,false);
 assert.equal(d.scene.canonicalRecords.length,1);assert.equal(d.scene.canonicalRecords[0].slotId,'canonical:clean-entry');
 assert.equal(d.scene.canonicalRecords[0].x,98);assert.equal(d.scene.canonicalRecords[0].y,118);
 await expect(page.locator('.cy-pip-direct-layer canvas')).toBeVisible();
 await expect(page.getByRole('button',{name:/^(New yard|Новый двор)$/})).toHaveCount(0);
 return d;
}

test('Clean Yard normal entry: canonical item, cancelled move and reload without old scene',async({page},info)=>{
 test.setTimeout(90000);
 const fixture=await startSwFixture({gameActions:true,gardenMode:'r2'});
 const receipts=[],errors=[],consoleErrors=[],requests=[],commands=[],responses=[],states=[];
 let failure,initial,final;
 try{
  const player=fixture.player('account-a');buildSnapshot(player);
  // Explicit non-production fixture wallet; the real purchase still debits its
  // published price and the placement uses the server's canonical protocol.
  player.yard.currencies.treats=200;
  const buy=await applyActionWithReceipt(player,'yard.buyGoodie',{goodieId:'leaf_pot'},{clientActionId:'yard-v2:clean-entry-buy',gardenR2Enabled:true});
  receipts.push({action:'yard.buyGoodie',result:buy});assert.equal(buy.status,200);assert.equal(buy.body.error,undefined);assert.equal(player.yard.currencies.treats,60);
  const snapshot=buildSnapshot(player),scope=canonicalCommandScope(snapshot);assert(scope);assert.equal(scope.geometryRevision,'pip-garden-t2-food-r2');
  const payload={slotId:'canonical:clean-entry',goodieId:'leaf_pot',x:98,y:118,...scope};
  const placed=await applyActionWithReceipt(player,'yard.placeGoodie',payload,{clientActionId:canonicalNoncePrefix(snapshot)+'clean-entry-place',gardenR2Enabled:true});
  receipts.push({action:'yard.placeGoodie',payload,result:placed});assert.equal(placed.status,200);assert.equal(placed.body.error,undefined);
  initial=structuredClone(player.yard);
  page.on('pageerror',error=>errors.push(String(error.stack||error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('request',request=>{const path=new URL(request.url()).pathname;requests.push(path);if(path==='/api/player/mutate'&&request.postDataJSON()?.action?.startsWith('yard.'))commands.push(request.postDataJSON());});
  page.on('response',response=>{if(/\/clean-garden-[^/]+\.png$/.test(new URL(response.url()).pathname))responses.push(response);});
  await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','ru');});
  await page.goto(fixture.origin+'/?tab=room');states.push(await ready(page));
  await page.screenshot({path:info.outputPath('clean-normal-initial.png')});
  await page.locator('[data-nav-item="decor"]').click();
  const card=page.locator('.cy-catalog-choice[data-slot-id="canonical:clean-entry"]');await expect(card).toBeVisible();await card.click();
  await expect(page.locator('[data-yard-action="move"]')).toBeEnabled();
  await page.screenshot({path:info.outputPath('clean-normal-current-item.png')});
  await page.locator('[data-yard-action="move"]').click();
  const cancel=page.locator('[data-yard-action="cancel-placement"]');await expect(cancel).toBeVisible();
  await page.locator('.cy-scene canvas').press('ArrowRight');
  await page.screenshot({path:info.outputPath('clean-normal-move-preview.png')});
  await cancel.click();await expect(cancel).toHaveCount(0);
  assert.deepEqual(commands,[],'Cancelling a ghost must not write a placement');
  await page.reload();states.push(await ready(page));
  await page.waitForTimeout(2000); // bounded continuous recording after reload
  await page.screenshot({path:info.outputPath('clean-normal-reloaded.png')});
  final=structuredClone(player.yard);
  assert.deepEqual(final.canonicalLocations,initial.canonicalLocations);assert.deepEqual(final.placedGoodies,initial.placedGoodies);
  assert.deepEqual(final.goodieInventory,initial.goodieInventory);assert.deepEqual(final.currencies,initial.currencies);
  assert.deepEqual(errors,[]);assert.deepEqual(commands,[]);assert.equal(requests.some(path=>retired.test(path)),false);
  assert(responses.length>0,'Actual approved clean background must load');
  for(const response of responses){assert.equal(response.status(),200);assert.equal(createHash('sha256').update(await response.body()).digest('hex'),backgroundSha);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }catch(error){failure=error;throw error;}
 finally{
  let cleanupError;
  try{await info.attach('clean-normal-evidence.json',{contentType:'application/json',body:Buffer.from(JSON.stringify({base,ciRevision:process.env.GITHUB_SHA??null,scope:'One normal clean scene with real canonical placement; move preview cancellation and reload. No native Mika adapter, saved visit admission, production authentication or full responsive acceptance.',error:failure?String(failure.stack||failure):null,errors,consoleErrors,requests,commands,receipts,initial,final,states,last:await read(page).catch(()=>null)},null,2))});if(failure)await page.screenshot({path:info.outputPath('clean-normal-failure.png')});}catch(error){cleanupError=error;}
  try{await page.close();}catch(error){cleanupError??=error;}
  try{await fixture.close();}catch(error){cleanupError??=error;}
  if(!failure&&cleanupError)throw cleanupError;
 }
});
