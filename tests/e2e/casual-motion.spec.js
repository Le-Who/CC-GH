import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readBloxLayout, pauseBlox, exitBlox } from './helpers/blox-v2.js';
import { createBloxLineClearFixture } from './helpers/bloxMotionFixture.js';
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
async function expectGardenExpansionReachable(page,testInfo) {
  const expansion=page.locator('.gs2-expansion');
  await expansion.scrollIntoViewIfNeeded();
  const button=expansion.locator('button');
  const geometry=await button.evaluate(node=>{
    const r=node.getBoundingClientRect(),pane=node.closest('.gs2-shelf-viewport').getBoundingClientRect();
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {width:r.width,height:r.height,insidePane:r.left>=pane.left-1&&r.right<=pane.right+1&&r.top>=pane.top-1&&r.bottom<=pane.bottom+1,hit:hit===node||node.contains(hit),overflow:node.scrollWidth>node.clientWidth+1};
  });
  expect(geometry.width).toBeGreaterThanOrEqual(44);expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.insidePane).toBe(true);expect(geometry.hit).toBe(true);expect(geometry.overflow).toBe(false);
  await capture(page,testInfo,'garden-expansion-scrolled-fully-reachable');
  await page.locator('.gs2-empty-target').first().scrollIntoViewIfNeeded();
}
async function expectTriviaWordsIntact(page,selector) {
  const broken=await page.locator(selector).evaluateAll(nodes=>nodes.flatMap(node=>{
    const errors=[],walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const text=walker.currentNode;
      for(const match of text.textContent.matchAll(/[\p{L}\p{N}]+/gu)){
        const range=document.createRange();range.setStart(text,match.index);range.setEnd(text,match.index+match[0].length);
        const rows=new Set([...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>Math.round(r.top)));
        if(rows.size>1)errors.push(match[0]);
      }
    }
    return errors;
  }));
  expect(broken).toEqual([]);
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
    await expect(page.locator('.gs2-stage')).toBeVisible();await expectGardenExpansionReachable(page,testInfo);await page.locator('.gs2-empty-target').first().click();
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
    await page.getByTestId('trv2-audience').scrollIntoViewIfNeeded();
    await expectTriviaWordsIntact(page,'.trv2-lifeline > span');
    await capture(page,testInfo,'trivia-lifelines-readable');
    await expectTriviaWordsIntact(page,'.trv2-answer-label');
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


test.describe('Trivia compact landscape known-name typography',()=>{
  test.use({viewport:{width:568,height:320},isMobile:true,hasTouch:true});
  test('Tim Berners-Lee wraps only at a word or hyphen boundary',async({page},testInfo)=>{
    await boot(page,'trivia');await startTriviaSolo(page);
    // Layout-only content fixture: replace one DOM label without touching the
    // controller/server, then leave without answering this altered text.
    const label=page.locator('.trv2-answer-label').first();
    await label.evaluate(node=>{const text=[...node.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(!text)throw Error('Missing answer text');text.textContent='Tim Berners-Lee';});
    await label.scrollIntoViewIfNeeded();
    await expect(label).toHaveText('Tim Berners-Lee');
    await expectTriviaWordsIntact(page,'.trv2-answer-label');
    const button=label.locator('..');
    await expect(button).toBeInViewport({ratio:1});
    expect(await button.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
    await capture(page,testInfo,'trivia-tim-berners-lee-typography-fixture');
    await pauseTrivia(page);await exitTriviaToHub(page);
  });
});


for (const [width,height] of [[390,844],[568,320]]) test.describe(`Blox real line-clear acceptance ${width}x${height}`,()=>{
  test.use({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    reducedMotion:'no-preference'});
  test('legal two-cell placement clears a complete row through the production controller at 1x',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await boot(page,'blox');
    const startReply=page.waitForResponse(response=>response.url().endsWith('/api/player/mutate')&&response.request().postDataJSON()?.action==='blox.start');
    await page.getByRole('button',{name:'Start',exact:true}).click();
    expect((await startReply).ok()).toBe(true);
    const id=await page.evaluate(()=>localStorage.getItem('gh_dev_user_id'));
    expect(id).toBeTruthy();const headers={Authorization:`dev ${id}`};
    const fixture=createBloxLineClearFixture();
    expect(fixture.savedState.score).toBe(8);expect(fixture.savedState.linesCleared).toBe(0);
    // Use the existing authenticated save route on the configured test backend.
    // There is no route.fulfill, private state injection or fabricated receipt.
    const seeded=await page.request.post('/api/player/mutate',{headers,data:{action:'blox.sync',payload:{savedState:fixture.savedState}}});
    expect(seeded.ok()).toBe(true);const seedBody=await seeded.json();expect(seedBody.success).toBe(true);
    expect(seedBody.savedState.board).toEqual(fixture.savedState.board);
    await page.reload();await expect(page.locator('.status-dot.ready')).toHaveCount(1);
    await expect(page.locator('.bx-stage')).toHaveAttribute('data-bx-phase','playing');
    const layout=await readBloxLayout(page),slot=layout.slots[2];
    const snapshot=async()=>{const response=await page.request.get('/api/player/snapshot',{headers});expect(response.ok()).toBe(true);return response.json();};
    const before=await snapshot();
    expect(before.blox.savedState.board[4].filter(Boolean)).toHaveLength(8);
    expect(before.blox.savedState.score).toBe(8);
    const png=async name=>testInfo.attach(name,{body:await page.screenshot({animations:'allow',scale:'device'}),contentType:'image/png'});
    await png('blox-line-clear-before-native');
    // Ordinary pointer taps take the exact production selected-cell path. The
    // fixture's legal last h2 piece is selected; no callback is invoked directly.
    await page.touchscreen.tap(slot.left+slot.width/2,slot.top+slot.height/2);
    const requests=[];const observe=request=>{if(request.url().endsWith('/api/player/mutate')&&request.postDataJSON()?.action==='blox.place')requests.push(request.postDataJSON());};
    page.on('request',observe);
    const placed=page.waitForResponse(response=>response.url().endsWith('/api/player/mutate')&&response.request().postDataJSON()?.action==='blox.place');
    await page.touchscreen.tap(layout.left+8.5*layout.cell,layout.top+4.5*layout.cell);
    const reply=await placed;expect(reply.ok()).toBe(true);const receipt=await reply.json();
    // Keep the response-to-feedback interval free of screenshot-induced rendering stalls.
    expect(receipt.success).toBe(true);
    expect(receipt.clear).toEqual({rows:[4],cols:[],cleared:1,points:10});
    expect(receipt.savedState.score).toBe(20);expect(receipt.savedState.linesCleared).toBe(1);
    expect(receipt.savedState.board.flat().filter(Boolean)).toHaveLength(0);
    expect(receipt.savedState.gameActive).toBe(true);
    // This is a bounded real-time viewing window, not an accelerated test clock.
    // Keep the whole feedback interval free of screenshot/readback interference.
    // This viewing window does not change the production effect duration or clock.
    await page.waitForTimeout(1500);
    const after=await snapshot();
    expect(after.blox.savedState.score).toBe(20);expect(after.blox.savedState.linesCleared).toBe(1);
    expect(after.blox.savedState.board.flat().filter(Boolean)).toHaveLength(0);
    expect(after.blox.savedState.tray).toHaveLength(3);
    expect(after.blox.savedState.tray.every(item=>!item.placed)).toBe(true);
    expect(after.resources.gold).toBe(before.resources.gold);
    expect(after.resources.gachaTokens).toBe(before.resources.gachaTokens);
    await expect(page.locator('.bx-hud .bx-metric').filter({has:page.locator('strong', {hasText:/^20$/})})).toHaveCount(1);
    expect(requests).toHaveLength(1);expect(requests[0].payload).toMatchObject(fixture.placement);
    await png('blox-line-clear-settled-native');
    await testInfo.attach('blox-line-clear-production-proof.json',{body:Buffer.from(JSON.stringify({
      setupRoute:'blox.sync',setupPlacements:fixture.setupPlacements,remainingCatalogPiece:'h2',placement:requests[0].payload,
      before:{score:before.blox.savedState.score,lines:before.blox.savedState.linesCleared,occupied:8},
      clear:receipt.clear,after:{score:after.blox.savedState.score,lines:after.blox.savedState.linesCleared,occupied:0},
      economyUnchanged:true,clock:'ordinary wall time',playbackRate:1,
    },null,2)),contentType:'application/json'});
    page.off('request',observe);expect(errors).toEqual([]);
  });
});
