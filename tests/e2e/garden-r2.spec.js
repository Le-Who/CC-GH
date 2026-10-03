import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { measurePlantTranslation } from './helpers/plantPixelMotion.js';
import { fitArtwork } from '../../src/games/garden-shelf/living/plant-presentation-contract.mjs';
import { PLANT_TYPES } from '../../game-logic/garden-shelf-plants.js';
import { createDefaultPlayer, createGardenEconomyState, getGardenXpRequired } from '../../game-logic.js';
import { migrateGardenR2 } from '../../game-logic/garden-r2/domain.js';
import { applyActionWithReceipt, buildSnapshot } from '../../routes/player.js';
const MATRIX = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
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
  const user = id();
  await page.addInitScript(({ user, language }) => { localStorage.setItem('gh_dev_user_id', user); localStorage.setItem('garden_shelf_language', language); }, { user, language });
  return user;
}
async function fixture(page, initial, { loseFirstPurchase = false, loseFirstSale = false, delayPurchase = false } = {}) {
  const requests = [], state = { current: initial }; let lost = false;
  await page.route('**/api/player/snapshot', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(buildSnapshot(state.current)) }));
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
  await page.goto('/'); await expect(page.locator('.gs2-stage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Garden progress', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('game_hub_garden_r2_intents_v1:') && JSON.parse(localStorage.getItem(key)).nextSequence >= 2))).toBe(true);
}
async function close(page) { await page.locator('.gs2-dialog .gs2-close').click(); await expect(page.locator('.gs2-dialog')).toHaveCount(0); }
async function fit(page, dialog = null) {
  if (dialog) {
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    // useDialogFocus transfers focus on the next animation frame. A successful
    // opener click does not imply that this frame has run; wait for ownership,
    // without moving focus ourselves or relaxing any layout/inert assertion.
    await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement)), {
      message: 'The opened Garden dialog must receive focus',
    }).toBe(true);
  }
  const errors = await page.evaluate(() => {
    const errors = [], width = innerWidth, height = innerHeight;
    if (document.documentElement.scrollWidth > width + 1) errors.push('horizontal page overflow');
    for (const node of document.querySelectorAll('.gs2-stage,.gs2-dialog,.gs2-dialog .gs2-close')) {
      const r = node.getBoundingClientRect();
      if (r.left < -1 || r.right > width + 1 || r.top < -1 || r.bottom > height + 1) errors.push(`${node.className}: viewport overflow`);
    }
    const stage = document.querySelector('.gs2-stage')?.getBoundingClientRect(), dock = document.querySelector('.bottom-tabs')?.getBoundingClientRect();
    if (!stage || !dock || stage.bottom > dock.top + 1) errors.push('stage overlaps bottom dock');
    for (const button of document.querySelectorAll('.bottom-tabs button')) {
      const r = button.getBoundingClientRect();
      if (r.width < 43.9 || r.height < 43.9 || button.scrollWidth > button.clientWidth + 1) errors.push('dock target or label does not fit');
    }
    const dialog = document.querySelector('.gs2-dialog');
    if (dialog) {
      if (!dialog.contains(document.activeElement)) errors.push('focus left dialog');
      if (!document.querySelector('.telegram-app').closest('[inert]')) errors.push('background remains interactive');
      for (const button of dialog.querySelectorAll('button')) { const r = button.getBoundingClientRect(); if (r.width < 43.9 || r.height < 43.9) errors.push('small dialog touch target'); }
      for (const row of dialog.querySelectorAll('.gs2-r2-card,.gs2-catalog-row')) { if (row.scrollWidth > row.clientWidth + 1) errors.push('row overflow'); }
    }
    return errors;
  });
  expect(errors).toEqual([]);
  if (dialog) { await dialog.locator('.gs2-dialog-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; }); await expect(dialog.locator('.gs2-close')).toBeInViewport(); }
}
for (const [width, height] of MATRIX) test.describe(`Garden R2 ${width}x${height}`, () => {
  test.use({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: width < 1100, hasTouch: width < 1100 });
  test('finite ranks, truthful prices, permanent mastery and reachable sheets', async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const p = player(); await initialize(page); const { requests } = await fixture(page, p); await boot(page);
    await page.locator('.active-game-frame').evaluate(async node => { await Promise.all(node.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
    await fit(page); await expect(page.locator('[data-garden-gold]')).toContainText('10,000');
    await expect(page.locator('[data-garden-gold]')).toContainText('8 gold/min');
    await expect(page.locator('.gs2-stage')).not.toContainText(/migration|migrated|переход на|миграц/i);
    await page.locator('[data-plant-id="saved-daisy"] [data-plant-details-button]').click();
    const detail = panel(page, 'plant-detail'); await fit(page, detail); await expect(detail).toContainText('5/5'); await expect(detail).toContainText('Species mastery 3/3');
    await expect(detail.getByRole('button', { name: /Increase income/ })).toHaveCount(0); await expect(detail).toContainText('5.52 gold/min');
    await testInfo.attach('r2-terminal-detail', { body: await page.screenshot(), contentType: 'image/png' }); await close(page);
    await page.locator('[data-plant-id="saved-daisy"] [data-plant-details-button]').click(); await page.keyboard.press('Escape'); await expect(detail).toHaveCount(0);
    await page.getByRole('button', { name: 'Garden progress', exact: true }).click(); const progress = panel(page, 'progression');
    await fit(page, progress); await expect(progress.locator('[data-r2-research]')).toHaveCount(9); await expect(progress.locator('[data-r2-project]')).toHaveCount(5);
    await expect(progress).toContainText('150 gold + 6 substrate'); await expect(progress).toContainText('Substrate 0/60');
    await testInfo.attach('r2-progress-sheet', { body: await page.screenshot(), contentType: 'image/png' }); await close(page);
    await page.locator('.gs2-empty-target').first().click(); const shop = panel(page, 'seed-shop-inventory');
    await fit(page, shop); await expect(shop.locator('.gs2-catalog-row').first().getByRole('button')).toHaveText('25');
    await testInfo.attach('r2-shop', { body: await page.screenshot(), contentType: 'image/png' }); await close(page);
    expect(requests.some(r => /creditEarned|resetEconomy|garden\.sync/.test(r.action))).toBe(false); expect(errors).toEqual([]);
  });
});
test.describe('Garden R2 receipt and account flows', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test('real enabled HTTP path adopts without reset and persists one purchase despite a lost reply', async ({ page }) => {
    const user = await initialize(page), headers = { Authorization: `dev ${user}` };
    const beforeResponse = await page.request.get('/api/player/snapshot', { headers });
    expect(beforeResponse.ok()).toBe(true); const before = await beforeResponse.json();
    expect(before.gardenR2Available).toBe(true); expect(before.gardenR2).toBeNull();
    await boot(page);
    const snapshot = async () => { const response = await page.request.get('/api/player/snapshot', { headers }); expect(response.ok()).toBe(true); return response.json(); };
    const adopted = await snapshot();
    expect(adopted.gardenR2.version).toBe(1); expect(adopted.resources.gold).toBe(before.resources.gold);
    expect(adopted.garden.plants).toEqual(before.garden.plants); expect(adopted.garden.economyVersion).toBe(before.garden.economyVersion);
    const reset = await page.request.post('/api/player/mutate', { headers, data: { action: 'garden.resetEconomy', payload: {}, gardenR2Enabled: false } });
    expect(reset.status()).toBe(409); expect((await reset.json()).error).toBe('CLIENT_UPDATE_REQUIRED');
    const ids = []; let lost = false;
    await page.route('**/api/player/mutate', async route => {
      const body = route.request().postDataJSON();
      if (body.action !== 'garden.r2' || body.payload?.command !== 'buyPlant') return route.continue();
      ids.push(body.clientActionId);
      if (lost) return route.continue();
      lost = true;
      const response = await route.fetch(); expect(response.ok()).toBe(true);
      expect((await response.json()).receiptConfirmed).toBe(true); await route.abort('failed');
    });
    await page.locator('.gs2-empty-target').first().click();
    await panel(page, 'seed-shop-inventory').locator('.gs2-catalog-row').first().getByRole('button').click();
    await expect.poll(() => ids.length).toBeGreaterThanOrEqual(2); expect(new Set(ids).size).toBe(1);
    await expect(panel(page, 'plant-detail')).toBeVisible();
    const purchased = await snapshot(); expect(purchased.resources.gold).toBe(before.resources.gold - 25); expect(purchased.garden.plants).toHaveLength(1);
    await page.reload(); await boot(page);
    const reloaded = await snapshot(); expect(reloaded.resources.gold).toBe(purchased.resources.gold);
    expect(reloaded.garden.plants.map(plant => plant.id)).toEqual(purchased.garden.plants.map(plant => plant.id));
    expect(await page.locator('.gs2-stage').textContent()).not.toMatch(/migration|миграц/i);
  });
  test('one purchase survives repeated clicks, a lost reply and reload', async ({ page }) => {
    const p = player({ terminal: false }); await initialize(page); const { requests } = await fixture(page, p, { loseFirstPurchase: true, delayPurchase: true }); await boot(page);
    await page.locator('.gs2-empty-target').first().click();
    await panel(page, 'seed-shop-inventory').locator('.gs2-catalog-row').first().getByRole('button').evaluate(button => { button.click(); button.click(); });
    await expect.poll(() => p.garden.plants.length).toBe(3);
    await expect.poll(() => requests.filter(r => r.payload?.command === 'buyPlant').length).toBeGreaterThanOrEqual(2);
    const buys = requests.filter(r => r.payload?.command === 'buyPlant'); expect(new Set(buys.map(r => r.clientActionId)).size).toBe(1); expect(p.garden.plants).toHaveLength(3);
    await page.reload(); await expect(page.locator('.gs2-stage')).toBeVisible(); await expect(page.locator('[data-plant-id]')).toHaveCount(3); expect(p.garden.plants).toHaveLength(3);
  });
  test('four exact purchases end gold ranks and one mastery step persists on the species', async ({ page }) => {
    const p = player({ terminal: false }); p._gardenProgression.substrate = 60; p._gardenProgression.researchIds = ['care_1'];
    await initialize(page); const { requests } = await fixture(page, p); await boot(page);
    await page.locator('[data-plant-id="saved-daisy"] [data-plant-details-button]').click();
    const detail = panel(page, 'plant-detail');
    for (const [index, price] of [13, 19, 25, 32].entries()) {
      const upgrade = detail.getByRole('button', { name: /Increase income/ }); await expect(upgrade).toContainText(String(price)); await expect(upgrade).toContainText('+0.6 gold/min');
      await upgrade.click(); await expect(page.getByTestId('garden-care-level')).toContainText(`${index + 2}/5`);
    }
    await expect(detail.getByRole('button', { name: /Increase income/ })).toHaveCount(0);
    const mastery = detail.getByRole('button', { name: 'Mastery 1 · 3 substrate', exact: true }); await expect(mastery).toBeEnabled(); await mastery.click();
    await expect(detail).toContainText('Species mastery 1/3'); expect(p._gardenProgression.masteryByType.daisy).toBe(1);
    expect(p._gardenProgression.substrate).toBe(57); expect(requests.filter(r => r.payload?.command === 'upgradePlant')).toHaveLength(4);
  });
  test('sale cancel is inert and confirmed lost-reply sale refunds exactly once', async ({ page }) => {
    const p = player(); await initialize(page); const { requests } = await fixture(page, p, { loseFirstSale: true }); await boot(page);
    await page.locator('[data-plant-id="saved-daisy"] [data-plant-details-button]').click();
    const sale = panel(page, 'plant-detail').getByRole('button', { name: /Sell/ });
    page.once('dialog', async dialog => { expect(dialog.message()).toContain('12 gold'); await dialog.dismiss(); });
    await sale.click(); expect(p.garden.plants).toHaveLength(2); expect(requests.filter(r => r.payload?.command === 'sellPlant')).toHaveLength(0);
    page.once('dialog', dialog => dialog.accept()); await sale.click();
    await expect.poll(() => p.garden.plants.length).toBe(1);
    await expect.poll(() => requests.filter(r => r.payload?.command === 'sellPlant').length).toBeGreaterThanOrEqual(2);
    const sales = requests.filter(r => r.payload?.command === 'sellPlant'); expect(new Set(sales.map(r => r.clientActionId)).size).toBe(1);
    expect(p.resources.gold).toBeGreaterThanOrEqual(10012); expect(p.resources.gold).toBeLessThan(10014);
    expect(p._gardenProgression.masteryByType.daisy).toBe(3);
  });
  test('server-eligible adoption preserves IDs and wallet without a migration surface', async ({ page }) => {
    const p = player({ adopted: false }); const original = p.garden.plants.map(plant => plant.id); await initialize(page); const { requests } = await fixture(page, p); await boot(page);
    expect(p._gardenProgression.version).toBe(1); expect(p.garden.plants.map(plant => plant.id)).toEqual(original); expect(p.resources.gold).toBe(10000);
    expect(requests.filter(r => r.payload?.command === 'adopt')).toHaveLength(1); await expect(page.locator('.gs2-stage')).not.toContainText(/migration|миграц/i); expect(requests.some(r => r.action === 'garden.resetEconomy')).toBe(false);
  });
  test('A to B to A reload keeps distinct durable journals and ownership', async ({ page }) => {
    const a = player(), b = player({ terminal: false, daisyId: 'account-b-daisy' });
    await initialize(page); const { state, requests } = await fixture(page, a); await boot(page);
    state.current = b; await page.reload(); await expect(page.locator('[data-plant-id="account-b-daisy"]')).toBeVisible(); await expect(page.locator('[data-plant-id="saved-daisy"]')).toHaveCount(0);
    await expect.poll(() => requests.some(r => r.payload?.accountId === b.id && r.payload.command === 'resume')).toBe(true);
    state.current = a; await page.reload(); await expect(page.locator('[data-plant-id="saved-daisy"]')).toBeVisible();
    const journals = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('game_hub_garden_r2_intents_v1:')).map(key => JSON.parse(localStorage.getItem(key))));
    expect(new Set(journals.map(journal => journal.accountId))).toEqual(new Set([a.id, b.id]));
  });
  test('Russian rates and progression copy use actual gold units', async ({ page }) => {
    await initialize(page, 'ru'); const p = player(); await fixture(page, p); await page.goto('/');
    await expect(page.getByRole('button', { name: 'Развитие сада', exact: true })).toBeVisible(); await expect(page.locator('[data-garden-gold]')).toContainText('8 золота/мин');
    await page.getByRole('button', { name: 'Развитие сада', exact: true }).click(); await expect(panel(page, 'progression')).toContainText('150 золота + 6 субстрата'); await fit(page, panel(page, 'progression'));
  });
});


// These visual fixtures use the production default policy, with no legacy bridge.
function visualPlant(id, index = 0, extra = {}) {
  return { id, type: index % 2 ? 'basil' : 'daisy', level: 12, shelfIndex: Math.floor(index / 2), spotIndex: index % 2, phase: 3, phaseProgress: 0, lastTapped: 0, lastWatered: 0, ...extra };
}
function visualPlayer(overrides = {}) {
  const p = player({ adopted: false }); Object.assign(p.garden, overrides);
  return migrateGardenR2(p, { now: Date.now(), legacyRevision: 0, acknowledgedTotal: 0 });
}
async function readR2Garden(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/player/snapshot');
    if (!response.ok) throw Error(`R2 visual fixture snapshot failed: ${response.status}`);
    const snapshot = await response.json();
    if (!snapshot.gardenR2 || snapshot.gardenR2.blocked || !snapshot.gardenR2Available) throw Error('Visual checks require the enabled R2 contract');
    return snapshot.garden;
  });
}
async function settledFit(page) {
  await page.locator('.active-game-frame').evaluate(async node => {
    await Promise.all(node.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  await fit(page);
}

test.describe('Garden R2 enabled-default visible motion',()=>{
  test.use({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const state = page => readR2Garden(page);
  async function seedMotion(page,{fallback=false,reduced=false}={}) {
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    if(fallback)await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...options){
        if(type==='webgl'&&this.classList.contains('gs2-live-surface'))return null;
        return original.call(this,type,...options);
      };
    });
    await initialize(page);
    await fixture(page, visualPlayer({ plants: [visualPlant('motion-daisy', 0, { level: 2 })], shelvesUnlocked: 1 }));
    await boot(page);await settledFit(page);
    const art=page.locator('.gs2-spot .gs2-live-plant').first();
    await expect.poll(()=>art.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(art).toHaveAttribute('data-living-mode',fallback?'static-fallback':reduced?'reduced':'animated');
    // In compact landscape, the shelf initially clips the bottom of the target.
    // Establish the same visible target position before baseline and tap samples;
    // otherwise locator.tap scrolls it after the baseline and invalidates crops.
    await page.locator('.gs2-plant-target').first().scrollIntoViewIfNeeded();
    if(!fallback)await expect.poll(()=>page.evaluate(()=>{
      const node=document.querySelector('[data-plant-id="motion-daisy"] .gs2-live-plant');
      const entry=window.__GARDEN_LIVING_QA__.snapshot().surfaces.find(surface=>surface.rootKind==='shelf')?.plants.find(plant=>plant.id==='motion-daisy');
      return !!entry?.slot&&Math.abs(entry.slot.top-node.getBoundingClientRect().top)<.01;
    })).toBe(true);
    return art;
  }
  async function regions(page,art){
    const box=await art.boundingBox(),aspect=await art.locator('img').evaluate(img=>img.naturalWidth/img.naturalHeight);
    const fit=fitArtwork({left:box.x,top:box.y,right:box.x+box.width,bottom:box.y+box.height,width:box.width,height:box.height},aspect);
    const rect=(x,y,w,h)=>({x:fit.left+fit.width*x,y:fit.top+fit.height*y,width:fit.width*w,height:fit.height*h});
    const crops={blossom:rect(.34,0,.4,.32),foliage:rect(.12,.05,.76,.55),pot:rect(.43,.78,.14,.08),control:await page.getByRole('button',{name:'Garden settings',exact:true}).boundingBox()};
    const shelf=await page.locator('.gs2-shelf-viewport').boundingBox(),viewport=page.viewportSize();
    for(const [name,crop] of Object.entries(crops)){
      const bounds=name==='control'?{x:0,y:0,width:viewport.width,height:viewport.height}:shelf;
      expect(crop.x,`${name} crop left`).toBeGreaterThanOrEqual(bounds.x);
      expect(crop.y,`${name} crop top`).toBeGreaterThanOrEqual(bounds.y);
      expect(crop.x+crop.width,`${name} crop right`).toBeLessThanOrEqual(bounds.x+bounds.width);
      expect(crop.y+crop.height,`${name} crop bottom`).toBeLessThanOrEqual(bounds.y+bounds.height);
    }
    return crops;
  }
  async function capture(page,testInfo,label,crops){
    const png=await page.screenshot({path:testInfo.outputPath(`${label}.png`),animations:'allow'});
    const {width}=await sharp(png).metadata(),scale=width/page.viewportSize().width,result={sizes:{}};
    for(const [name,r] of Object.entries(crops)){
      const crop={left:Math.round(r.x*scale),top:Math.round(r.y*scale),width:Math.floor(r.width*scale),height:Math.floor(r.height*scale)};
      result[name]=await sharp(png).extract(crop).removeAlpha().raw().toBuffer();result.sizes[name]={width:crop.width,height:crop.height,scale};
    }
    return result;
  }
  function changedPixels(a,b){
    expect(a.length).toBe(b.length);let count=0;
    for(let i=0;i<a.length;i+=3)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)count++;
    return count;
  }
  function stableReference(a,b){expect(changedPixels(a.pot,b.pot),'opaque pot remains fixed').toBe(0);expect(changedPixels(a.control,b.control),'visible Settings control remains fixed').toBe(0);}
  const diagnostics=page=>page.evaluate(()=>window.__GARDEN_LIVING_QA__.snapshot());
  for(const [width,height] of [[320,568],[390,844],[568,320],[1280,720]])test.describe(`visible idle ${width}x${height}`,()=>{
   test.use({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:width<1100,hasTouch:width<1100});
   test('normal motion changes real foliage pixels at idle and after a tap while pot and UI stay fixed',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));const art=await seedMotion(page),crops=await regions(page,art);
    const initialScroll=await page.locator('.gs2-shelf-viewport').evaluate(node=>node.scrollTop);
    const initial=await capture(page,testInfo,'normal-idle-before',crops),started=(await diagnostics(page)).surfaces[0].presentationSeconds;
    const shifts=[0],measurements=[];let idle=initial,maxChanged=0;
    // Sample more than one primary5.8s cycle in actual presentation time. Wall
    // time and frame-count flags alone cannot prove visible plant movement.
    for(let sample=1;sample<=7;sample++){
      await expect.poll(async()=>(await diagnostics(page)).surfaces[0].presentationSeconds,{timeout:5000}).toBeGreaterThanOrEqual(started+sample*.9);
      idle=await capture(page,testInfo,`normal-idle-${sample}`,crops);stableReference(initial,idle);
      const shift=measurePlantTranslation(initial.blossom,idle.blossom,initial.sizes.blossom);shifts.push(shift.x);measurements.push(shift);
      maxChanged=Math.max(maxChanged,changedPixels(initial.foliage,idle.foliage));
    }
    const excursion=Math.max(...shifts)-Math.min(...shifts);
    await testInfo.attach('idle-pixel-measurements',{body:Buffer.from(JSON.stringify({width,height,excursion,measurements},null,2)),contentType:'application/json'});
    expect(excursion,'visible flower excursion in CSS pixels').toBeGreaterThanOrEqual(2);
    expect(excursion,'bounded flower excursion in CSS pixels').toBeLessThanOrEqual(5);
    expect(maxChanged,'idle foliage has visible pixel movement').toBeGreaterThan(20);
    const touches=(await diagnostics(page)).surfaces[0].touches,lastTapped=(await state(page)).plants[0].lastTapped;
    await (width < 1100 ? page.locator('.gs2-plant-target').first().tap() : page.locator('.gs2-plant-target').first().click());
    await expect(page.locator('.gs2-spot').first()).toHaveAttribute('data-gs2-tapped','true');
    await expect.poll(async()=>(await diagnostics(page)).surfaces[0].touches).toBe(touches+1);
    await expect.poll(async()=>(await state(page)).plants[0].lastTapped).toBeGreaterThan(lastTapped);
    // Let the stationary acknowledgement disappear before comparing motion pixels.
    await expect(page.locator('.gs2-spot').first()).not.toHaveAttribute('data-gs2-tapped','true');
    expect(await page.locator('.gs2-shelf-viewport').evaluate(node=>node.scrollTop),'tap must not move the sampling viewport').toBe(initialScroll);
    expect(await regions(page,art),'tap must not move the plant or UI sampling rectangles').toEqual(crops);
    const tapped=await capture(page,testInfo,'normal-after-tap',crops);
    expect(changedPixels(idle.foliage,tapped.foliage),'foliage still moves after the actual plant tap').toBeGreaterThan(5);stableReference(idle,tapped);expect(errors).toEqual([]);
    await page.getByRole('button',{name:'Garden settings',exact:true}).click();await expect(page.locator('[data-garden-motion="on"]')).toContainText('device settings');
   });
  });
  for(const fallback of [false,true])test(`${fallback?'failed WebGL initialization':'device reduced motion'} keeps art still, explains it in Settings and acknowledges working taps`,async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));const art=await seedMotion(page,{fallback,reduced:!fallback}),crops=await regions(page,art);
    const before=await capture(page,testInfo,fallback?'fallback-before':'reduced-before',crops);
    await page.waitForTimeout(750);const idle=await capture(page,testInfo,fallback?'fallback-idle':'reduced-idle',crops);
    expect(changedPixels(before.foliage,idle.foliage)).toBe(0);stableReference(before,idle);
    const lastTapped=(await state(page)).plants[0].lastTapped;await page.locator('.gs2-plant-target').first().tap();
    await expect(page.locator('.gs2-spot').first()).toHaveAttribute('data-gs2-tapped','true');
    await expect.poll(async()=>(await state(page)).plants[0].lastTapped).toBeGreaterThan(lastTapped);
    await expect(page.locator('.gs2-spot').first()).not.toHaveAttribute('data-gs2-tapped','true');
    const after=await capture(page,testInfo,fallback?'fallback-after-tap':'reduced-after-tap',crops);
    expect(changedPixels(before.foliage,after.foliage)).toBe(0);stableReference(before,after);
    await page.getByRole('button',{name:'Garden settings',exact:true}).click();
    await expect(page.locator(`[data-garden-motion="${fallback?'fallback':'reduced'}"]`)).toContainText(fallback?'this view':'reduced motion');
    expect(errors).toEqual([]);
  });
  test('context loss restores visible fallback and a working non-motion tap response',async({page})=>{
    const art=await seedMotion(page);await page.locator('.gs2-stage canvas.gs2-live-surface').evaluate(canvas=>{
      const extension=canvas.getContext('webgl').getExtension('WEBGL_lose_context');if(!extension)throw Error('Context-loss test requires WEBGL_lose_context');extension.loseContext();
    });
    await expect(art).toHaveAttribute('data-living-mode','static-fallback');await expect(art.locator('img')).toHaveCSS('visibility','visible');
    await page.locator('.gs2-plant-target').first().tap();await expect(page.locator('.gs2-spot').first()).toHaveAttribute('data-gs2-tapped','true');
    await page.getByRole('button',{name:'Garden settings',exact:true}).click();await expect(page.locator('[data-garden-motion="fallback"]')).toBeVisible();
  });
});

test.describe('Garden R2 enabled-default image demand loading',()=>{
  for(const mode of ['animated','reduced','static-fallback'])test(`keeps first shelf eager and loads distant art on scroll in ${mode} mode`,async({page},testInfo)=>{
    await page.setViewportSize({width:390,height:844});
    if(mode==='reduced')await page.emulateMedia({reducedMotion:'reduce'});
    if(mode==='static-fallback')await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^(webgl|experimental-webgl|webgl2)$/.test(kind)?null:original.call(this,kind,...args);};
    });
    const paths=new Set();page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/games/garden-living/'))paths.add(path);});
    const species=Object.keys(PLANT_TYPES);
    const plants=Array.from({length:15},(_,i)=>visualPlant(`load-${i}`,i,{type:species[i%species.length],shelfIndex:Math.floor(i/3),spotIndex:i%3,phase:i===14?0:3}));
    await initialize(page);await fixture(page,visualPlayer({shelvesUnlocked:5,plants}));await boot(page);
    const first=page.locator('[data-plant-id="load-0"] .gs2-live-plant'),last=page.locator('[data-plant-id="load-14"] .gs2-live-plant');
    await expect(first).toHaveAttribute('data-art-requested','true');
    await expect.poll(()=>first.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(last).toHaveAttribute('data-art-requested','false');
    expect(await last.locator('img').getAttribute('src')).toBeNull();
    const lastPath='/games/garden-living/daisy-seedling-r1.webp';
    expect(paths.has(lastPath)).toBe(false);
    const before=[...paths];
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute('data-art-requested','true');
    await expect(last.locator('img')).toHaveAttribute('src',lastPath);
    await expect.poll(()=>last.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(last).toHaveAttribute('data-living-mode',mode);
    expect(paths.has(lastPath)).toBe(true);
    await page.context().setOffline(true);
    await first.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute('data-art-requested','true');
    await last.scrollIntoViewIfNeeded();
    await expect.poll(()=>last.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await page.context().setOffline(false);
    await testInfo.attach('garden-image-loading-diagnostics',{body:JSON.stringify({mode,before,after:[...paths],firstShelfEager:true,lastShelfDeferred:true}),contentType:'application/json'});
  });
});
