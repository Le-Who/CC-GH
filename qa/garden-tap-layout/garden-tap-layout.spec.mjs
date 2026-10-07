import { test, expect } from '@playwright/test';
import { createDefaultPlayer, createGardenEconomyState, getGardenXpRequired } from '../../game-logic.js';
import { migrateGardenR2 } from '../../game-logic/garden-r2/domain.js';
import { applyActionWithReceipt, buildSnapshot } from '../../routes/player.js';
const panel = (page, kind) => page.locator(`.gs2-dialog[data-garden-panel="${kind}"]`);
const id = () => `garden-r2-browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function player({ adopted = true, terminal = true, daisyId = 'saved-daisy', plantLevel = terminal ? 40 : 1 } = {}) {
  const now = Date.now(), p = createDefaultPlayer(id(), 'Garden R2', now);
  p.resources.gold = 10000;
  p.garden = { ...createGardenEconomyState(now), level: 30, xp: 0, xpRequired: getGardenXpRequired(30), levelReady: false, shelvesUnlocked: 2, plants: [
    { id: daisyId, type: 'daisy', level: plantLevel, phase: 3, phaseProgress: 0, shelfIndex: 0, spotIndex: 0, lastTapped: 0 },
    { id: 'saved-basil', type: 'basil', level: 1, phase: 3, phaseProgress: 0, shelfIndex: 1, spotIndex: 0, lastTapped: 0 },
  ] };
  return adopted ? migrateGardenR2(p, { now, legacyRevision: 0, acknowledgedTotal: 0 }) : p;
}
async function initialize(page, language = 'en') {
  await page.route('**/api/config', route => route.fulfill({ json: { devAuthEnabled: true } }));
  const user = id();
  await page.addInitScript(({ user, language }) => { localStorage.setItem('gh_dev_user_id', user); localStorage.setItem('garden_shelf_language', language); }, { user, language });
  return user;
}
async function fixture(page, initial, { loseFirstPurchase = false, loseFirstSale = false, delayPurchase = false } = {}) {
  const requests = [], receipts = [], state = { current: initial, serverNow: Date.now(), forcedError: null }; let lost = false;
  await page.route(/\/api\/player\/snapshot(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(buildSnapshot(state.current)) }));
  await page.route('**/api/player/mutate', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (delayPurchase && body.payload?.command === 'buyPlant') await new Promise(resolve => setTimeout(resolve, 350));
    const result = state.forcedError && body.payload?.command === 'tend' ? {status:409,body:{error:state.forcedError}} : await applyActionWithReceipt(state.current, body.action, body.payload || {}, { clientActionId: body.clientActionId, serverNow: state.serverNow });
    receipts.push({ command: body.payload?.command, result: result.body });
    if (((loseFirstPurchase && body.payload?.command === 'buyPlant') || (loseFirstSale && body.payload?.command === 'sellPlant')) && !lost && !result.body.error) { lost = true; await route.abort('failed'); return; }
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) });
  });
  return { requests, state, receipts };
}
async function boot(page) {
  await page.goto('/?tab=garden'); await expect(page.locator('.gs2-stage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Garden progress', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('game_hub_garden_r2_intents_v1:') && JSON.parse(localStorage.getItem(key)).nextSequence >= 2))).toBe(true);
}

for (const [width,height] of [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720]]) test.describe(`${width}x${height}`,()=>{
 test.use({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:width<1100,hasTouch:width<1100,serviceWorkers:'block'});
 test('confirmed reward paints over living plants and stays within its tap target',async({page},testInfo)=>{
  await initialize(page); await fixture(page,player()); await boot(page);
  const target=page.locator('[data-plant-id="saved-daisy"] .gs2-plant-target');
  await expect(page.locator('.gs2-live-surface')).toHaveCount(1);
  await expect.poll(()=>page.locator('[data-plant-id="saved-daisy"] .gs2-live-plant').getAttribute('data-living-mode')).toBe('animated');
  if(width===844){
   const geometry=await target.evaluate(button=>{
    const spot=button.parentElement,shelf=spot.closest('.gs2-shelf-viewport');
    const read=()=>({card:spot.getBoundingClientRect().height,target:button.getBoundingClientRect().height,shelf:shelf.getBoundingClientRect().height,overflow:getComputedStyle(spot).overflow});
    const actual=read();spot.style.overflow='visible';const uncontained=read();spot.style.removeProperty('overflow');return {actual,uncontained,restored:read()};
   });
   await testInfo.attach('landscape-containment',{body:JSON.stringify(geometry),contentType:'application/json'});
   expect(geometry.actual.overflow).toBe('hidden');expect(geometry.actual.card).toBeLessThanOrEqual(geometry.actual.shelf);
   expect(geometry.uncontained.card).toBeGreaterThan(geometry.actual.card);
  }

  if(width<1100) await target.tap(); else await target.click();
  const feedback=page.locator('.gs2-tap-feedback'); await feedback.waitFor();
  const evidence=await feedback.evaluate(node=>{
   for(const a of node.getAnimations()) {a.pause();a.currentTime=150;}
   const canvas=node.closest('.gs2-modal-layer,.gs2-stage').querySelector('.gs2-live-surface');
   node.style.pointerEvents='auto'; canvas.style.pointerEvents='auto';
   const rect=node.getBoundingClientRect(), x=rect.x+rect.width/2,y=rect.y+rect.height/2;
   const stack=document.elementsFromPoint(x,y); const top=stack.indexOf(node), plant=stack.indexOf(canvas);
   node.style.removeProperty('pointer-events');canvas.style.pointerEvents='none';
   return {top,plant,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},stack:stack.map(n=>n.className)};
  });
  await testInfo.attach('reward-layer-evidence',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  await testInfo.attach('confirmed-reward',{body:await page.screenshot(),contentType:'image/png'});
  expect(evidence.top).toBeGreaterThanOrEqual(0); expect(evidence.plant).toBeGreaterThan(evidence.top);
  const box=await target.boundingBox(); expect(evidence.rect.x).toBeGreaterThanOrEqual(box.x);expect(evidence.rect.x+24).toBeLessThanOrEqual(box.x+box.width);
  expect(evidence.rect.y).toBeGreaterThanOrEqual(box.y);expect(evidence.rect.y+24).toBeLessThanOrEqual(box.y+box.height);
 });
 test('compact resources, accessible controls and quiet server throttle preserve real rewards',async({page},testInfo)=>{
  const language=width===320||width===844?'ru':'en';
  await initialize(page,language);const p=player();const initialGold=p.resources.gold;const {state,receipts}=await fixture(page,p);
  // This boot checks the same live provider without an English-only locator.
  await page.goto('/?tab=garden');const target=page.locator('[data-plant-id="saved-daisy"] .gs2-plant-target');await expect(target).toBeEnabled();
  await expect.poll(()=>receipts.some(r=>r.command==='resume'&&r.result.receiptConfirmed)).toBe(true);
  await target.focus();await page.keyboard.press('Enter');
  await expect.poll(()=>receipts.filter(r=>r.command==='tend').length).toBe(1);
  await expect(target.locator('..')).toHaveAttribute('data-gs2-tapped','true');
  expect(state.current.resources.gold).toBe(initialGold+1);
  for(let count=2;count<=4;count++){
   await page.keyboard.press('Enter');await expect.poll(()=>receipts.filter(r=>r.command==='tend').length).toBe(count);
   expect(receipts.filter(r=>r.command==='tend').at(-1).result.error).toBe('GARDEN_R2_TAP_COOLDOWN');
   await expect(page.locator('body')).not.toContainText('GARDEN_R2_TAP_COOLDOWN');
   await expect(page.locator('.gs2-status')).toHaveAttribute('role','status');
  }
  expect(state.current.resources.gold).toBe(initialGold+1);
  state.serverNow+=500;await page.keyboard.press('Enter');await expect.poll(()=>state.current.resources.gold).toBe(initialGold+2);
  await expect(page.locator('[data-garden-gold]')).toContainText('10,002');
  await expect(page.locator('[data-garden-gold]')).toHaveAccessibleName(language==='ru'?'Золото: 10,002 · 8 золота/мин':'Gold: 10,002 · 8 gold/min');
  await expect(page.locator('[data-garden-gold] small')).toBeVisible();
  const layout=await page.evaluate(()=>{
   const failures=[];if(document.documentElement.scrollWidth>innerWidth+1)failures.push('viewport overflow');
   for(const button of document.querySelectorAll('.gs2-home,.gs2-settings,.gs2-details,.gs2-plant-target,.gs2-empty-target')){const r=button.getBoundingClientRect();if(r.width<44||r.height<44)failures.push('small target '+button.className);}
   const target=document.querySelector('[data-plant-id="saved-daisy"] .gs2-plant-target'),css=getComputedStyle(target),spot=target.parentElement;
   if(document.activeElement!==target||css.outlineStyle==='none')failures.push('keyboard focus lost');
   if(getComputedStyle(spot).borderTopWidth!=='0px')failures.push('heavy plant frame remains');
   const art=target.querySelector('.gs2-live-plant').getBoundingClientRect();if(art.width<spot.getBoundingClientRect().width-1)failures.push('plant slot still padded');
   return {failures,focused:document.activeElement.className};
  });
  await testInfo.attach('layout-and-throttle',{body:JSON.stringify({language,layout,receipts:receipts.map(r=>({command:r.command,error:r.result.error,confirmed:r.result.receiptConfirmed})),gold:state.current.resources.gold}),contentType:'application/json'});
  await testInfo.attach('clean-layout',{body:await page.screenshot(),contentType:'image/png'});expect(layout.failures).toEqual([]);
  state.forcedError='GARDEN_R2_PLANT_NOT_FOUND';await page.keyboard.press('Enter');
  await expect(page.locator('.gs2-status')).toHaveAttribute('role','alert');
  expect(state.current.resources.gold).toBe(initialGold+2);
 });

 if(width===320||width===844) test('detail reward stays above art and retires on actual scroll or dismissal',async({page},testInfo)=>{
  await initialize(page);const {state}=await fixture(page,player());await boot(page);
  await page.locator('[data-plant-id="saved-daisy"] [data-plant-details-button]').click();
  const dialog=page.locator('[data-garden-panel="plant-detail"]'),target=dialog.locator('.gs2-detail-tap');
  await expect(target).toBeVisible();await expect.poll(()=>target.locator('.gs2-live-plant').getAttribute('data-living-mode')).toBe('animated');
  await target.click();const feedback=page.locator('.gs2-modal-layer>.gs2-tap-feedback');await feedback.waitFor();
  const evidence=await feedback.evaluate(async node=>{
   const canvas=node.parentElement.querySelector('.gs2-live-surface'),rect=node.getBoundingClientRect();
   node.style.pointerEvents='auto';canvas.style.pointerEvents='auto';const stack=document.elementsFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);node.style.removeProperty('pointer-events');canvas.style.pointerEvents='none';
   const target=document.querySelector('.gs2-detail-tap').getBoundingClientRect(),scroll=document.querySelector('.gs2-dialog-scroll'),before=scroll.scrollTop;
   scroll.scrollTop=before+40;const after=scroll.scrollTop;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return {coin:stack.indexOf(node),canvas:stack.indexOf(canvas),withinTarget:rect.left>=target.left&&rect.right<=target.right&&rect.top>=target.top&&rect.bottom<=target.bottom,before,after,retired:!node.isConnected};
  });
  await testInfo.attach('detail-layer-scroll',{body:JSON.stringify(evidence),contentType:'application/json'});
  expect(evidence.coin).toBeGreaterThanOrEqual(0);expect(evidence.canvas).toBeGreaterThan(evidence.coin);expect(evidence.withinTarget).toBe(true);expect(evidence.after).toBeGreaterThan(evidence.before);expect(evidence.retired).toBe(true);
  state.serverNow+=500;await target.click();await feedback.waitFor();await dialog.locator('.gs2-close').click();await expect(dialog).toHaveCount(0);await expect(page.locator('.gs2-tap-feedback')).toHaveCount(0);
 });

});

test.afterEach(async({page},info)=>{
 if(info.status===info.expectedStatus)return;
 try{await info.attach('failure-state',{body:JSON.stringify(await page.evaluate(()=>({url:location.pathname,queryKeys:[...new URL(location.href).searchParams.keys()],visibleControls:[...document.querySelectorAll('button,[role="alert"],[role="status"]')].filter(n=>n.getBoundingClientRect().width>0).map(n=>({className:n.className,text:n.textContent,disabled:n.disabled,display:getComputedStyle(n).display})),canvases:document.querySelectorAll('.gs2-live-surface').length}))),contentType:'application/json'});}catch(error){console.error('Failure state capture gap:',String(error));}
});
