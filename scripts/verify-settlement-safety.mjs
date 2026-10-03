// Real built UI and two real tabs: no resource injection or server/API stubs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { translateSettlement } from '../src/games/settlement/settlementText.js';

const baseURL = process.env.SETTLEMENT_QA_URL || 'http://127.0.0.1:3287';
const output = 'output/playwright/settlement';
const key = 'village-ascend-v11-state', legacyKey = 'village-ascend-v2-state';
const browser = await chromium.launch({ headless: true });
const report = [];
await mkdir(output, { recursive: true });
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key);
const count = (page, field, value) => page.waitForFunction(([key, field, value]) => JSON.parse(localStorage.getItem(key))?.state.settlementCycle[field] === value, [key, field, value]);
async function boot(page, language = 'en') {
  await page.addInitScript(language => {
    localStorage.setItem('gh_dev_user_id', 'settlement_safety_only');
    localStorage.setItem('garden_shelf_language', language);
  }, language);
  await page.goto(`${baseURL}/?tab=settlement`);
  await page.locator('[data-save-ready="true"]').waitFor({ timeout: 30000 });
  await page.locator('.settlement-canvas').waitFor();
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const a = await context.newPage(), b = await context.newPage(), errors = [];
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
  await boot(a); await boot(b);
  await a.getByTestId('settlement-tab-orders').tap();
  await b.getByTestId('settlement-tab-orders').tap();
  const before = await read(a);
  // Hold the actual mutex until both UI handlers have queued the same order.
  // IndexedDB remains active through requests; no app state is modified.
  await a.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('ccgh-settlement-command-lock', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    window.settlementQaRelease = false;
    const transaction = db.transaction('commands', 'readwrite'), store = transaction.objectStore('commands');
    function hold() {
      const request = store.get('qa-hold');
      request.onsuccess = () => { window.settlementQaLocked = true; if (!window.settlementQaRelease) hold(); };
    }
    hold(); transaction.oncomplete = () => { db.close(); window.settlementQaDone = true; };
  });
  await a.waitForFunction(() => window.settlementQaLocked);
  await Promise.all([a, b].map(page => page.getByTestId('settlement-deliver').evaluate(button => button.click())));
  await a.evaluate(() => { window.settlementQaRelease = true; });
  await a.waitForFunction(() => window.settlementQaDone);
  await count(a, 'deliveries', 1);
  await b.waitForFunction(() => document.querySelector('.settlement-cycle-feedback').textContent.length > 0);
  const delivered = await read(a);
  assert.equal(delivered.settlementCycle.deliveries, 1);
  assert.equal(delivered.resources.food, before.resources.food - 70);
  assert.equal(delivered.resources.gold, before.resources.gold + 90);
  await b.getByTestId('settlement-tab-production').tap();
  await b.getByTestId('settlement-collect').tap();
  await count(b, 'collected', 1);
  assert.equal((await read(b)).settlementCycle.deliveries, 1);
  assert.equal((await read(b)).resources.gold, delivered.resources.gold);
  const { lastTick: ignoredBefore, ...protectedState } = await read(a);
  await b.evaluate(legacyKey => localStorage.setItem(legacyKey, JSON.stringify({ version: 10, state: { activeUpgrade: null, resources: { gold: 1 } } })), legacyKey);
  // Live app timers may update lastTick while the legacy client writes. Every
  // other persisted field must remain identical; the unit test also checks bytes.
  const { lastTick: ignoredAfter, ...afterLegacy } = await read(a);
  assert.deepEqual(afterLegacy, protectedState);
  await a.reload(); await b.reload();
  await a.locator('[data-save-ready="true"]').waitFor(); await b.locator('[data-save-ready="true"]').waitFor();
  assert.equal((await read(a)).settlementCycle.deliveries, 1);
  assert.equal((await read(b)).settlementCycle.collected, 1);
  await b.close();
  const committed = await read(a);
  await a.evaluate(key => {
    const original = Storage.prototype.setItem;
    window.restoreSettlementQaStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('QA quota', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await a.getByTestId('settlement-tab-orders').tap();
  await a.getByTestId('settlement-deliver').tap();
  await a.waitForFunction(() => document.querySelector('.settlement-cycle-feedback').textContent.includes('Could not save'));
  assert.deepEqual((await read(a)).resources, committed.resources);
  await a.screenshot({ path: `${output}/en-save-error.png` });
  await a.evaluate(() => window.restoreSettlementQaStorage());
  await a.reload(); await a.locator('[data-save-ready="true"]').waitFor();
  assert.deepEqual((await read(a)).resources, committed.resources);
  assert.deepEqual(errors, []);
  report.push({ scenario: 'real-tab-conflict-old-client-quota-reload', deliveries: 1, collected: 1, errors });
  console.log('PASS real tabs: conflicting delivery debited once, stale collect preserves progress, old key isolated, quota/reload safe');
  await context.close();

  const routes = [
    ['build', 'Building'], ['goals', 'Цели'], ['inventory', 'Инвентарь'], ['council', 'Совет'],
    ['research', 'Исследования'], ['store', 'Магазин'], ['inbox', 'Вести'], ['map', 'Карта'],
    ['rank', 'Ранг'], ['construction', 'Строить'], ['world', 'Карта мира'],
  ];
  for (const language of ['ru', 'en']) for (const [width, height] of [[320,568], [568,320]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page, language);
    for (const [route, label] of routes) {
      console.log(`CHECK ${language} ${width}x${height}: ${route}`);
      if (route === 'build') {
        await page.locator('.settlement-compact-detail-open').tap();
        await page.locator('.right-panel').waitFor();
      } else {
        const trigger = page.locator(`.settlement-game-root button[aria-label="${translateSettlement(language, label)}"]`).first();
        try { await trigger.tap(); }
        catch (error) { await page.screenshot({ path: `${output}/${language}-${width}x${height}-${route}-failure.png` }); throw error; }
      }
      await page.waitForFunction(route => document.querySelector('.settlement-game-root').dataset.activePanel === route && document.querySelector('.right-panel'), route);
      const visible = await page.locator('.settlement-game-root').evaluate(root => {
        const attributes = [...root.querySelectorAll('[aria-label], [title], [alt], [data-tooltip]')].filter(node => node.getBoundingClientRect().width).flatMap(node => ['aria-label','title','alt','data-tooltip'].map(name => node.getAttribute(name) || ''));
        return { text: root.innerText, attributes, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      assert.ok(visible.overflow <= 1, `${route} ${language} ${width} overflow`);
      assert.doesNotMatch(visible.text, /undefined|NaN|gameData|runtime|DEV/);
      if (language === 'en') assert.doesNotMatch(visible.text + visible.attributes.join(' '), /[А-Яа-яЁё]/, `${route} English`);
      const actionSelector = {
        world: '.world-expedition-action-v2', map: '.world-expedition-action-v2',
        construction: '.construction-card-v2', research: '.research-action-button-v2',
        inventory: '.inventory-action-button-v2',
      }[route];
      if (actionSelector) {
        const action = page.locator(actionSelector).first();
        await action.scrollIntoViewIfNeeded();
        const hit = await action.evaluate(button => {
          const r = button.getBoundingClientRect(), node = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { width: r.width, height: r.height, reachable: node === button || button.contains(node) };
        });
        assert.ok(hit.width >= 44 && hit.height >= 44 && hit.reachable, JSON.stringify(hit));
      }
      if (['build','construction','research','world'].includes(route)) await page.screenshot({ path: `${output}/${language}-${width}x${height}-${route}-menu.png` });
      await page.locator('.right-panel .panel-header-action').tap();
      await page.locator('.settlement-play-panel').waitFor();
    }
    assert.deepEqual(errors, []);
    report.push({ scenario: 'all-reachable-menus', language, width, height, menus: routes.map(([route]) => route), errors });
    console.log(`PASS ${language} ${width}x${height}: 11 menus, localized text/attributes, close/touch/no overflow`);
    await context.close();
  }
  await writeFile(`${output}/safety-report.json`, JSON.stringify(report, null, 2));
} finally { await browser.close(); }
