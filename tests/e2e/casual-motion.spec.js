import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readBloxLayout, pauseBlox, exitBlox } from './helpers/blox-v2.js';
import { bootMergeV3, researchMergePair, mergeSnapshot, pauseMerge, closeMergePanel, exitMerge } from './helpers/mergeV3.js';
import { startTriviaSolo, pauseTrivia, resumeTrivia, exitTriviaToHub } from './helpers/triviaR3.js';
import { selectHomeGame } from './helpers/home.js';

// Real integrated App + configured test backend. Videos are visual-review
// evidence; passing these assertions alone is not a visual-quality approval.
test.use({ video: 'on', serviceWorkers: 'block' });
const MATRIX = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
async function boot(page, tab) {
  const id=`casual_${tab}_${randomUUID()}`;
  await page.addInitScript(id=>{localStorage.setItem('gh_dev_user_id',id);localStorage.setItem('garden_shelf_language','en');},id);
  await page.goto(`/?tab=${tab}`);
  await expect(page.locator('.status-dot.ready')).toHaveCount(1,{timeout:15000});
}
async function capture(page,testInfo,name){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await testInfo.attach(name,{body:await page.screenshot(),contentType:'image/png'});
}
async function settleBlur(page,selector){
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(page.locator(selector)).toHaveAttribute('data-motion-suspended','true');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.locator(selector)).not.toHaveAttribute('data-motion-suspended','true');
}
async function reducedCss(page,selector){
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>page.locator(selector).evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).animationName==='none'))).toBe(true);
}
for(const [width,height] of MATRIX)test.describe(`casual response ${width}x${height}`,()=>{
  test.use({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:width<1100,hasTouch:width<1100});
  test('Blox placement, cancellation, pause and re-entry',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await boot(page,'blox');await page.getByRole('button',{name:'Start',exact:true}).click();
    let layout=await readBloxLayout(page);const slot=layout.slots[0];
    const placed=page.waitForResponse(r=>r.url().endsWith('/api/player/mutate')&&r.request().postDataJSON()?.action==='blox.place');
    await page.mouse.move(slot.left+slot.width/2,slot.top+slot.height/2);await page.mouse.down();
    await page.mouse.move(layout.left+layout.cell*5.5,layout.top+layout.cell*5.5,{steps:12});
    await capture(page,testInfo,'blox-valid-placement-preview');await page.mouse.up();expect((await placed).ok()).toBe(true);
    await capture(page,testInfo,'blox-placement-settled');
    // A second held piece must cancel on blur; it must never submit a place.
    const requests=[];const count=r=>{if(r.url().endsWith('/api/player/mutate')&&r.postDataJSON()?.action==='blox.place')requests.push(r);};page.on('request',count);
    layout=await readBloxLayout(page);const second=layout.slots[1];
    await page.mouse.move(second.left+second.width/2,second.top+second.height/2);await page.mouse.down();
    await page.mouse.move(layout.left+layout.cell*2.5,layout.top+layout.cell*2.5,{steps:4});
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await pauseBlox(page);expect(requests).toHaveLength(0);page.off('request',count);
    await page.locator('.bx-dialog').getByRole('button',{name:'Resume',exact:true}).click();
    await page.emulateMedia({reducedMotion:'reduce'});await pauseBlox(page);await exitBlox(page);
    await selectHomeGame(page,'blox');await expect(page.locator('.bx-stage')).toHaveAttribute('data-bx-phase','paused');
    await capture(page,testInfo,'blox-reduced-reentry');expect(errors).toEqual([]);
  });
  test('Merge Lab confirmed discovery, repeat pair, pause and reduced motion',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await bootMergeV3(page,'casual_merge');const before=await mergeSnapshot(page);
    await researchMergePair(page,'cloud','ember');await capture(page,testInfo,'merge-discovery');
    await pauseMerge(page);await closeMergePanel(page);await settleBlur(page,'.ml-root');
    await reducedCss(page,'.ml-root .ml-item-art');
    await researchMergePair(page,'cloud','ember');
    const after=await mergeSnapshot(page);expect(after.merge.stock).toEqual(before.merge.stock);expect(after.merge.mergeRevision).toBe(before.merge.mergeRevision+2);
    await capture(page,testInfo,'merge-known-reduced');await exitMerge(page);await selectHomeGame(page,'merge');
    await expect(page.getByTestId('ml-pause')).toBeVisible();expect(errors).toEqual([]);
  });
  test('Garden confirmed tap is bounded across rapid taps, care, blur and re-entry',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page,'garden');
    await expect(page.locator('.gs2-stage')).toBeVisible();await page.locator('.gs2-empty-target').first().click();
    await page.locator('.gs2-dialog .gs2-catalog-row').first().getByRole('button').click();
    await expect(page.locator('.gs2-dialog[data-garden-panel="plant-detail"]')).toBeVisible();await page.locator('.gs2-close').click();
    const target=page.locator('.gs2-plant-target').first();await expect(target).toBeEnabled();await target.dblclick();
    await expect(page.locator('.gs2-spot[data-gs2-tapped=true]')).toHaveCount(1);
    await expect.poll(()=>page.locator('.gs2-tap-feedback').count()).toBeLessThanOrEqual(1);
    await capture(page,testInfo,'garden-confirmed-tap');await settleBlur(page,'.gs2-stage');
    await expect(page.locator('.gs2-tap-feedback')).toHaveCount(0);
    await page.locator('[data-plant-details-button]').first().click();await capture(page,testInfo,'garden-care');await page.locator('.gs2-close').click();
    await reducedCss(page,'.gs2-button');await page.locator('.gs2-home').click();await selectHomeGame(page,'garden');
    await expect(page.locator('.gs2-plant-target')).toHaveCount(1);await capture(page,testInfo,'garden-reduced-reentry');expect(errors).toEqual([]);
  });
  test('Trivia rapid answer submits once, preserves feedback on pause and supports reduced next question',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page,'trivia');await startTriviaSolo(page);
    const answers=[];page.on('request',r=>{if(r.url().endsWith('/api/trivia/answer'))answers.push(r);});
    await page.locator('.trv2-answer').first().dblclick();await expect(page.getByTestId('trv2-next')).toBeVisible();expect(answers).toHaveLength(1);
    await capture(page,testInfo,'trivia-confirmed-answer');await pauseTrivia(page);await resumeTrivia(page);await settleBlur(page,'.trv2-root');
    // Blur pauses the actual Trivia controller as well as its presentation.
    if(await page.locator('.trv2-dialog').count())await resumeTrivia(page);
    await reducedCss(page,'.trv2-answer');await page.getByTestId('trv2-next').click();
    await expect(page.locator('.trv2-answer:not(:disabled)')).toHaveCount(4);await capture(page,testInfo,'trivia-next-reduced');
    await pauseTrivia(page);await exitTriviaToHub(page);expect(errors).toEqual([]);
  });
});
