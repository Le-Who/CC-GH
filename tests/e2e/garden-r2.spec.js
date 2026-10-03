import { test, expect } from '@playwright/test';
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
  await page.addInitScript(({ user, language }) => { localStorage.setItem('gh_dev_user_id', user); localStorage.setItem('garden_shelf_language', language); }, { user: id(), language });
}
async function fixture(page, initial, { loseFirstPurchase = false, loseFirstSale = false, delayPurchase = false } = {}) {
  const requests = [], state = { current: initial }; let lost = false;
  await page.route('**/api/player/snapshot', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...buildSnapshot(state.current), gardenR2Available: true }) }));
  await page.route('**/api/player/mutate', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (delayPurchase && body.payload?.command === 'buyPlant') await new Promise(resolve => setTimeout(resolve, 350));
    const result = await applyActionWithReceipt(state.current, body.action, body.payload || {}, { clientActionId: body.clientActionId, gardenR2Enabled: true });
    if (result.body.snapshot) result.body.snapshot.gardenR2Available = true;
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
  const errors = await page.evaluate(() => {
    const errors = [], width = innerWidth, height = innerHeight;
    if (document.documentElement.scrollWidth > width + 1) errors.push('horizontal page overflow');
    for (const node of document.querySelectorAll('.gs2-stage,.gs2-dialog,.gs2-dialog .gs2-close')) {
      const r = node.getBoundingClientRect();
      if (r.left < -1 || r.right > width + 1 || r.top < -1 || r.bottom > height + 1) errors.push(`${node.className}: viewport overflow`);
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
  if (dialog) { await expect(dialog).toHaveAttribute('aria-modal', 'true'); await dialog.locator('.gs2-dialog-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; }); await expect(dialog.locator('.gs2-close')).toBeInViewport(); }
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
