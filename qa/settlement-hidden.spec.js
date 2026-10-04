import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {openHome} from './helpers/home.js';
import {mountHomePlayerFixture} from './helpers/homePlayerFixture.js';

// Copy into the exact candidate's tests/e2e for the isolated QA invocation.
// This uses the existing deterministic player boundary, not a live account.
const ids=['garden','blox','match3','merge','bubbo','trivia','room'];
const savedTown='{"version":11,"state":{"gold":123,"buildings":[{"id":"townhall"}]}}';
for(const [width,height] of [[320,568],[390,844],[568,320]]) test(`Settlement stays hidden and its save survives ${width}x${height}`,async({browser},testInfo)=>{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 try{
  const page=await context.newPage(),player=await mountHomePlayerFixture(page),actions=[];
  const before=structuredClone(player.resources),startedAt=Date.now();
  await page.addInitScript(()=>{
   localStorage.setItem('gh_dev_user_id','hidden_settlement_fixture');
   localStorage.setItem('garden_shelf_language','en');
  });
  page.on('request',request=>{if(request.url().endsWith('/api/player/mutate'))actions.push(request.postDataJSON()?.action);});
  await page.goto('/');await expect(page.locator('.gs2-stage')).toBeVisible();
  expect(await page.evaluate(()=>window.__APP_BUILD_ID__)).toBe(process.env.CANDIDATE_COMMIT);
  await page.evaluate(saved=>{localStorage.setItem('village-ascend-v11-state',saved);sessionStorage.setItem('game_hub_active_tab_v1','settlement');},savedTown);
  expect(await page.evaluate(()=>localStorage.getItem('village-ascend-v11-state'))).toBe(savedTown);
  await page.goto('/?tab=settlement');
  expect(await page.evaluate(()=>localStorage.getItem('village-ascend-v11-state'))).toBe(savedTown);
  await expect(page.locator('.gs2-stage')).toBeVisible();
  await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','garden');
  await expect(page.locator('.settlement-game-root')).toHaveCount(0);
  await openHome(page);
  await expect(page.locator('[data-home-game]')).toHaveCount(7);
  expect(await page.locator('[data-home-game]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeGame))).toEqual(ids);
  await expect(page.locator('[data-home-game="settlement"]')).toHaveCount(0);
  await expect(page.locator('.home-section-title span')).toHaveText('7');
  await page.locator('[data-home-game="room"]').focus();await page.keyboard.press('Tab');
  await expect(page.locator('.home-profile summary')).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await testInfo.attach(`hidden-settlement-${width}x${height}`,{body:await page.screenshot(),contentType:'image/png'});
  await page.getByRole('button',{name:'Close Home',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('village-ascend-v11-state'))).toBe(savedTown);
  await page.reload();await expect(page.locator('.gs2-stage')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('village-ascend-v11-state'))).toBe(savedTown);
  expect(actions.filter(action=>action?.startsWith('settlement.'))).toEqual([]);
  const after=structuredClone(player.resources),prior=before.energy.lastRegenTimestamp,next=after.energy.lastRegenTimestamp;
  assert.ok(Number.isSafeInteger(prior)&&Number.isSafeInteger(next));assert.ok(before.energy.current===before.energy.max&&before.energy.max>0);assert.ok(next>=prior);assert.ok(next===prior||(next>=startedAt&&next<=Date.now()));
  assert.deepEqual(after,{...before,energy:{...before.energy,lastRegenTimestamp:next}});
 }finally{await context.close();}
});
