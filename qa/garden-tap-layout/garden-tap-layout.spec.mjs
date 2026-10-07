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
  const requests = [], state = { current: initial }; let lost = false;
  await page.route(/\/api\/player\/snapshot(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(buildSnapshot(state.current)) }));
  await page.route('**/api/player/mutate', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (delayPurchase && body.payload?.command === 'buyPlant') await new Promise(resolve => setTimeout(resolve, 350));
    const result = await applyActionWithReceipt(state.current, body.action, body.payload || {}, { clientActionId: body.clientActionId });
    if (((loseFirstPurchase && body.payload?.command === 'buyPlant') || (loseFirstSale && body.payload?.command === 'sellPlant')) && !lost && !result.body.error) { lost = true; await route.abort('failed'); return; }
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) });
  });
  return { requests, state };
}
async function boot(page) {
  await page.goto('/?tab=garden'); await expect(page.locator('.gs2-stage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Garden progress', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('game_hub_garden_r2_intents_v1:') && JSON.parse(localStorage.getItem(key)).nextSequence >= 2))).toBe(true);
}

for (const [width,height] of [[320,568],[390,844],[844,390]]) test.describe(`${width}x${height}`,()=>{
 test.use({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 test('confirmed reward paints over living plants and stays within its tap target',async({page},testInfo)=>{
  await initialize(page); await fixture(page,player()); await boot(page);
  const target=page.locator('[data-plant-id="saved-daisy"] .gs2-plant-target');
  await expect(page.locator('.gs2-live-surface')).toHaveCount(1);
  await expect.poll(()=>page.locator('[data-plant-id="saved-daisy"] .gs2-live-plant').getAttribute('data-living-mode')).toBe('animated');
  await target.tap();
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
 });
});
