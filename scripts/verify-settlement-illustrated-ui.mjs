// Capture actual integrated UI on a local test server; never a production URL.
// No resource injection, API stubs, economy mutations or asset generation.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const baseURL = process.env.SETTLEMENT_QA_URL || 'http://127.0.0.1:3287';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname), 'Use a local test server');
const output = process.env.SETTLEMENT_QA_OUTPUT || 'output/playwright/settlement-illustrated';
await mkdir(output, { recursive: true });
const sizes = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[375,812]];
const browser = await chromium.launch({ headless: true });
const report = [];
const assertionFailures = [];
try {
 for (const [width, height] of sizes) for (const language of ['ru', 'en']) {
  const touch = width !== 1280;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: touch, hasTouch: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(language => { localStorage.setItem('gh_dev_user_id', `settlement_visual_${Date.now()}_${Math.random()}`); localStorage.setItem('garden_shelf_language', language); }, language);
  await page.goto(`${baseURL}/?tab=settlement`);
  await page.locator('.settlement-play-panel').waitFor({ timeout: 30000 });
  await page.locator('.settlement-canvas').waitFor({ timeout: 30000 });
  await page.locator('.scene-host[data-settlement-scene-state="ready"]').waitFor({ timeout: 60000 });
  await page.locator('.active-game-frame').evaluate(async el => { await Promise.allSettled(el.getAnimations().map(animation => animation.finished)); });
  const click = async locator => touch ? locator.tap() : locator.click();
  async function capture(name) {
   await page.locator('.settlement-game-root img').evaluateAll(async images => { await Promise.all(images.filter(img => img.getBoundingClientRect().width).map(img => img.decode().catch(() => {}))); });
   const geometry = await page.evaluate(() => {
    const root = document.querySelector('.settlement-game-root');
    const broken = [...root.querySelectorAll('img')].filter(img => img.getBoundingClientRect().width && (!img.complete || !img.naturalWidth)).map(img => img.src);
    const panel = root.querySelector('.right-panel') || root.querySelector('.settlement-play-panel');
    const rect = panel.getBoundingClientRect();
    const controls = [...panel.querySelectorAll('button')].filter(button => { const r = button.getBoundingClientRect(); return r.width && r.height; }).map(button => {
     const r = button.getBoundingClientRect();
     const inView = r.top >= rect.top && r.bottom <= rect.bottom && r.left >= 0 && r.right <= innerWidth;
     const hit = inView ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
     return { text: button.getAttribute('aria-label') || button.textContent, rect: r.toJSON(), width: r.width, height: r.height, disabled: button.disabled, inView, covered: inView && hit !== button && !button.contains(hit), hit: hit ? { tag: hit.tagName, className: hit.className, text: hit.textContent?.slice(0,120) } : null };
    });
    const sections = [...panel.children].map(el => ({ className: el.className, rect: el.getBoundingClientRect().toJSON(), display: getComputedStyle(el).display, rows: getComputedStyle(el).gridTemplateRows, overflow: getComputedStyle(el).overflow, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    return { overflow: document.documentElement.scrollWidth - innerWidth, panel: rect.toJSON(), broken, controls, sections, sceneState: root.querySelector('.scene-host')?.dataset.settlementSceneState };
   });
   // Preserve failing-state evidence before enforcing the unchanged assertions.
   await page.screenshot({ path: `${output}/${language}-${width}x${height}-${name}.png` });
   report.push({ language, width, height, name, ...geometry });
   await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
   // Independent geometry/image assertions all run. A failure is retained,
   // never converted into a pass; setup/auth/browser errors still stop the run.
   const checks = [
    () => assert.ok(geometry.overflow <= 1, `Overflow: ${name}`),
    () => assert.ok(geometry.panel.x >= -1 && geometry.panel.right <= width + 1 && geometry.panel.y >= -1 && geometry.panel.bottom <= height + 1, `Panel clipped: ${name}`),
    () => assert.deepEqual(geometry.broken, [], `Broken image: ${name}`),
    () => assert.ok(!geometry.controls.some(control => control.covered), `Covered control: ${name}`),
    () => assert.ok(!geometry.controls.some(control => control.inView && (control.width < 43.5 || control.height < 43.5)), `Small control: ${name}`)
   ];
   for (const verify of checks) {
    try { verify(); }
    catch (error) {
     if (error.code !== 'ERR_ASSERTION') throw error;
     assertionFailures.push({ language, width, height, name, message: error.message });
    }
   }
   await writeFile(`${output}/assertion-failures.json`, JSON.stringify(assertionFailures, null, 2));
  }
  for (const tab of ['production','orders','growth']) { await click(page.getByTestId(`settlement-tab-${tab}`)); await capture(`city-${tab}`); }
  const panels = [
   ['building', () => page.locator('.settlement-compact-detail-open')],
   ['goals', () => page.locator('.left-dock').getByRole('button', { name: language === 'ru' ? 'Цели' : 'Goals', exact: true })],
   ['inventory', () => page.locator('.bottom-nav').getByRole('button', { name: language === 'ru' ? 'Инвентарь' : 'Inventory', exact: true })],
   ['council', () => page.locator('.left-dock').getByRole('button', { name: language === 'ru' ? 'Совет' : 'Council', exact: true })],
   ['construction', () => page.locator('.primary-build')],
   ['research', () => page.locator('.bottom-nav').getByRole('button', { name: language === 'ru' ? 'Исследования' : 'Research', exact: true })],
   ['world', () => page.locator('.bottom-nav').getByRole('button', { name: language === 'ru' ? 'Карта мира' : 'World map', exact: true })],
   ['shop', () => page.locator('.bottom-nav').getByRole('button', { name: language === 'ru' ? 'Магазин' : 'Shop', exact: true })],
   ['news', () => page.locator('.left-dock').getByRole('button', { name: language === 'ru' ? 'Вести' : 'News', exact: true })]
  ];
  for (const [name, control] of panels) {
   await click(control());
   await page.locator('.right-panel .panel-body-fancy').waitFor();
   await page.locator('.right-panel [aria-busy="true"]').waitFor({ state: 'hidden' });
   await capture(name);
   const body = page.locator('.right-panel .panel-body-fancy');
   if (await body.evaluate(el => el.scrollHeight > el.clientHeight + 1)) {
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await capture(`${name}-bottom`);
   }
   await click(page.locator('.right-panel .panel-header-action'));
   await page.locator('.settlement-play-panel').waitFor();
  }
  assert.deepEqual(errors, [], `${language} ${width}x${height} runtime errors`);
  await context.close();
 }
 if (assertionFailures.length) throw new AggregateError(assertionFailures.map(failure => Error(JSON.stringify(failure))), `${assertionFailures.length} Settlement visual assertion failures`);
} finally {
 await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
 await browser.close();
}
