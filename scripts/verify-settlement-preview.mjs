// Runs the integrated built application. Start its test server separately.
// No API stubs, reward injection, production credentials or user browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.SETTLEMENT_QA_URL || 'http://127.0.0.1:3287';
const output = 'output/playwright/settlement';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const sizes = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[375,812]];
const report = [];
async function saved(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('village-ascend-v11-state'))?.state); }
async function waitCount(page, field, value) {
  await page.waitForFunction(([field, value]) => JSON.parse(localStorage.getItem('village-ascend-v11-state'))?.state.settlementCycle[field] === value, [field, value]);
}
async function geometry(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.settlement-play-panel');
    const rect = panel.getBoundingClientRect();
    const dock = document.querySelector('.settlement-game-root .bottom-nav').getBoundingClientRect();
    const topHud = document.querySelector('.settlement-game-root .top-hud-final').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - innerWidth, panel: rect.toJSON(), dock: dock.toJSON(), topHud: topHud.toJSON(), controls: [...panel.querySelectorAll('button')].map(button => {
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { label: button.textContent, rect: r.toJSON(), reachable: hit === button || button.contains(hit) };
    }) };
  });
}
try {
  for (const language of ['ru', 'en']) for (const [width, height] of sizes) {
    const touch = width < 1100;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(language => { localStorage.setItem('gh_dev_user_id', `settlement_qa_${Date.now()}_${Math.random()}`); localStorage.setItem('garden_shelf_language', language); }, language);
    await page.goto(`${baseURL}/?tab=settlement`);
    await page.locator('.settlement-play-panel').waitFor({ timeout: 30000 });
    await page.locator('.settlement-canvas').waitFor({ timeout: 30000 });
    await page.locator('.active-game-frame').evaluate(async frame => {
      await Promise.allSettled(frame.getAnimations().map(animation => animation.finished));
    });
    await page.waitForFunction(() => Boolean(localStorage.getItem('village-ascend-v11-state')) && document.querySelector('[data-save-ready="true"]'));
    const click = async locator => touch ? locator.tap() : locator.click();
    for (const tab of ['production', 'orders', 'growth']) {
      await click(page.getByTestId(`settlement-tab-${tab}`));
      const metrics = await geometry(page);
      assert.ok(metrics.overflow <= 1, `horizontal overflow ${language} ${width}x${height}`);
      assert.ok(metrics.panel.x >= 0 && metrics.panel.right <= width + 1 && metrics.panel.y >= 0 && metrics.panel.bottom <= height + 1, JSON.stringify(metrics));
      assert.ok(metrics.panel.bottom <= metrics.dock.top + 1, `panel/dock overlap ${JSON.stringify(metrics)}`);
      assert.ok(metrics.panel.top >= metrics.topHud.bottom - 1, `panel/top HUD overlap ${JSON.stringify(metrics)}`);
      for (const control of metrics.controls) {
        assert.ok(control.rect.width >= 44 && control.rect.height >= 44, `small target ${JSON.stringify(control)}`);
        assert.ok(control.reachable, `covered control ${JSON.stringify(control)}`);
      }
      assert.doesNotMatch(await page.locator('.settlement-play-panel').innerText(), /DEV|runtime|gameData|undefined|NaN/);
      await page.screenshot({ path: `${output}/${language}-${width}x${height}-${tab}.png` });
    }
    await click(page.getByTestId('settlement-tab-production'));
    const before = await saved(page);
    await page.getByTestId('settlement-collect').evaluate(button => { for (let i = 0; i < 5; i++) button.click(); });
    await waitCount(page, 'collected', before.settlementCycle.collected + 1);
    const collected = await saved(page);
    // Screenshot capture can take longer than a production period on a cold
    // software renderer. Multiple legitimately ready batches may be consumed.
    assert.equal(collected.settlementCycle.collected, before.settlementCycle.collected + 1);
    assert.equal(collected.settlementCycle.ready, before.settlementCycle.ready - 1);
    assert.ok(collected.resources.food > before.resources.food);
    while ((await saved(page)).settlementCycle.ready > 0) {
      const count = (await saved(page)).settlementCycle.collected;
      await click(page.getByTestId('settlement-collect'));
      await waitCount(page, 'collected', count + 1);
    }
    await page.waitForFunction(() => document.querySelector('[data-testid="settlement-collect"]').disabled);
    assert.equal(await page.getByTestId('settlement-collect').isDisabled(), true);
    await click(page.getByTestId('settlement-tab-orders'));
    for (let i = 0; i < 3; i++) {
      await click(page.getByTestId('settlement-deliver'));
      await waitCount(page, 'deliveries', i + 1);
    }
    assert.equal((await saved(page)).settlementCycle.deliveries, 3);
    await click(page.getByTestId('settlement-tab-growth'));
    await click(page.getByTestId('settlement-develop'));
    await waitCount(page, 'development', 1);
    const developed = await saved(page);
    assert.equal(developed.settlementCycle.development, 1);
    assert.equal(developed.levels['cottage-ring'], 4);
    assert.ok(developed.population > before.population);
    await page.screenshot({ path: `${output}/${language}-${width}x${height}-developed.png` });
    await page.reload();
    await page.locator('.settlement-play-panel').waitFor();
    const restored = await saved(page);
    assert.equal(restored.settlementCycle.development, 1);
    assert.equal(restored.settlementCycle.deliveries, 3);
    assert.deepEqual(restored.resources, developed.resources);
    await click(page.locator('.settlement-compact-detail-open'));
    await page.locator('.settlement-game-root .right-panel').waitFor();
    const close = page.locator('.settlement-game-root .panel-header-action');
    await close.waitFor();
    await click(close);
    await page.locator('.settlement-play-panel').waitFor();
    // Resize the actual live Pixi host, then exercise and cancel a touch drag.
    await page.setViewportSize({ width: height, height: width });
    await page.waitForFunction(() => { const host = document.querySelector('.scene-host'), canvas = document.querySelector('.settlement-canvas'); return canvas && Math.abs(canvas.getBoundingClientRect().width - host.clientWidth) <= 1; });
    await page.setViewportSize({ width, height });
    const touchPoint = await page.evaluate(() => {
      const canvas = document.querySelector('.settlement-canvas');
      for (let y = 90; y < innerHeight - 80; y += 20) for (let x = 20; x < innerWidth - 20; x += 20) if (document.elementFromPoint(x, y) === canvas) return { x, y };
      return null;
    });
    assert.ok(touchPoint, 'map has a hittable area');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...touchPoint, id: 7 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchPoint.x + 12, y: touchPoint.y + 10, id: 7 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await cdp.detach();
    assert.deepEqual(errors, [], `${language} ${width}x${height}`);
    report.push({ language, width, height, touch, deviceScaleFactor: 2, deliveries: 3, development: 1, errors });
    console.log(`PASS ${language} ${width}x${height}: touch, cycle, save/reload, menu, resize`);
    await context.close();
  }
  // Finish the complete preview, then exhaust real stock and recover through
  // a naturally timed batch. This exercises the empty/disabled path in-browser.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => { localStorage.setItem('gh_dev_user_id', `settlement_long_${Date.now()}`); localStorage.setItem('garden_shelf_language', 'en'); });
  await page.goto(`${baseURL}/?tab=settlement`);
  await page.getByTestId('settlement-collect').waitFor();
  await page.getByTestId('settlement-collect').tap();
  await waitCount(page, 'collected', 1);
  await page.getByTestId('settlement-tab-orders').tap();
  for (let i = 0; i < 12; i++) {
    await page.getByTestId('settlement-deliver').tap();
    await waitCount(page, 'deliveries', i + 1);
    if ([2,6,11].includes(i)) {
      await page.getByTestId('settlement-tab-growth').tap();
      await page.getByTestId('settlement-develop').tap();
      await waitCount(page, 'development', [2,6,11].indexOf(i) + 1);
      await page.getByTestId('settlement-tab-orders').tap();
    }
  }
  assert.equal((await saved(page)).settlementCycle.development, 3);
  for (let i = 0; i < 80 && await page.getByTestId('settlement-deliver').isEnabled(); i++) {
    const count = (await saved(page)).settlementCycle.deliveries;
    await page.getByTestId('settlement-deliver').tap();
    await waitCount(page, 'deliveries', count + 1);
    await page.waitForFunction(() => document.querySelector('[data-testid="settlement-deliver"]').disabled || document.querySelector('.settlement-cycle-feedback').textContent.includes('Order delivered'));
  }
  assert.equal(await page.getByTestId('settlement-deliver').isDisabled(), true);
  const exhausted = await saved(page);
  await page.getByTestId('settlement-deliver').evaluate(button => { button.click(); button.click(); });
  assert.deepEqual((await saved(page)).resources, exhausted.resources);
  await page.screenshot({ path: `${output}/en-empty-stock.png` });
  await page.getByTestId('settlement-tab-production').tap();
  await page.waitForFunction(() => !document.querySelector('[data-testid="settlement-collect"]').disabled, null, { timeout: 25000 });
  await page.getByTestId('settlement-collect').tap();
  await waitCount(page, 'collected', exhausted.settlementCycle.collected + 1);
  await page.getByTestId('settlement-tab-orders').tap();
  assert.equal(await page.getByTestId('settlement-deliver').isEnabled(), true);
  await page.getByTestId('settlement-deliver').tap();
  await waitCount(page, 'deliveries', exhausted.settlementCycle.deliveries + 1);
  await page.getByTestId('settlement-tab-growth').tap();
  assert.match(await page.locator('.settlement-play-panel').innerText(), /A thriving village/);
  await page.screenshot({ path: `${output}/en-complete-preview.png` });
  report.push({ scenario: 'complete-preview-and-stock-recovery', development: 3, deliveries: (await saved(page)).settlementCycle.deliveries });
  console.log('PASS full preview: three developments, empty stock, timed production recovery');
  await context.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
} finally { await browser.close(); }
