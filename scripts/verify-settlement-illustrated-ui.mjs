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
const ACTION_TIMEOUT = 8000;
const PROFILE_BUDGET = 70000;
async function bounded(promise, ms, label) {
 let timer;
 try {
  return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => { const error = Error(label); error.name = 'TimeoutError'; reject(error); }, ms); })]);
 } finally { clearTimeout(timer); }
}
try {
 for (const [width, height] of sizes) for (const language of ['ru', 'en']) {
  const touch = width !== 1280;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: touch, hasTouch: touch });
  context.setDefaultTimeout(ACTION_TIMEOUT);
  context.setDefaultNavigationTimeout(20000);
  const page = await context.newPage();
  let stateId = 'setup';
  let crashed = false;
  let authFailure = false;
  const errors = [];
  let budgetExpired = false;
  const visited = new Set();
  const expectedStates = ['city-production','city-orders','city-growth','building','goals','inventory','council','construction','research','world','shop','news'];
  page.on('crash', () => { crashed = true; });
  page.on('response', response => {
   const url = new URL(response.url());
   if (url.origin === new URL(baseURL).origin && url.pathname.startsWith('/api/') && [401, 403].includes(response.status())) authFailure = true;
  });
  const budget = setTimeout(() => { budgetExpired = true; void context.close().catch(() => {}); }, PROFILE_BUDGET);
  console.log(JSON.stringify({ event: 'profile-start', language, width, height }));
  try {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(language => { performance.setResourceTimingBufferSize(2000); localStorage.setItem('gh_dev_user_id', `settlement_visual_${Date.now()}_${Math.random()}`); localStorage.setItem('garden_shelf_language', language); }, language);
  await page.goto(`${baseURL}/?tab=settlement`);
  await page.locator('.settlement-play-panel').waitFor({ timeout: 30000 });
  await page.locator('.settlement-canvas').waitFor({ timeout: 30000 });
  await page.locator('.scene-host[data-settlement-scene-state="ready"]').waitFor({ timeout: 60000 });
  await bounded(page.locator('.active-game-frame').evaluate(async el => { await Promise.allSettled(el.getAnimations().map(animation => animation.finished)); }), 5000, 'Entry animation did not settle');
  const click = async locator => touch ? locator.tap() : locator.click();
  async function capture(name) {
   console.log(JSON.stringify({ event: 'capture-start', language, width, height, state: name }));
   await bounded(page.locator('.settlement-game-root img').evaluateAll(async images => { await Promise.all(images.filter(img => { const r = img.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }).map(img => img.decode().catch(() => {}))); }), ACTION_TIMEOUT, `Image decode timed out: ${name}`);
   const artDelivery = await bounded(page.evaluate(async () => {
    const paths = new Set();
    for (const el of document.querySelectorAll('.settlement-game-root *')) {
     const rect = el.getBoundingClientRect();
     if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
     if (el instanceof HTMLImageElement && el.currentSrc.includes('/ui/illustrated-v2/')) paths.add(el.currentSrc);
     const background = getComputedStyle(el).backgroundImage;
     for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) if (match[1].includes('/ui/illustrated-v2/')) paths.add(new URL(match[1], location.href).href);
    }
    const decoded = await Promise.all([...paths].map(async url => {
     const image = new Image();
     const start = performance.now();
     image.src = url;
     await image.decode();
     return { path: new URL(url).pathname, width: image.naturalWidth, height: image.naturalHeight, estimatedRgbaBytes: image.naturalWidth * image.naturalHeight * 4, decodeProbeMs: performance.now() - start };
    }));
    const resources = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/ui/illustrated-v2/')).map(entry => ({ path: new URL(entry.name).pathname, encodedBodySize: entry.encodedBodySize, transferSize: entry.transferSize, durationMs: entry.duration }));
    const uniqueEncodedSizes = new Map();
    for (const entry of resources) uniqueEncodedSizes.set(entry.path, Math.max(uniqueEncodedSizes.get(entry.path) || 0, entry.encodedBodySize));
    return { measurementNotes: 'decodeProbeMs is a separate cached Image.decode probe, not first-paint decode duration; estimatedRgbaBytes is width*height*4, not GPU allocation; screenshots require independent review', decoded, resources, encodedBytes: [...uniqueEncodedSizes.values()].reduce((sum, bytes) => sum + bytes, 0), transferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0), estimatedDecodedRgbaBytes: decoded.reduce((sum, image) => sum + image.estimatedRgbaBytes, 0) };
   }), ACTION_TIMEOUT, `Illustrated source decode failed: ${name}`);
   const geometry = await page.evaluate(() => {
    const root = document.querySelector('.settlement-game-root');
    const broken = [...root.querySelectorAll('img')].filter(img => { const r = img.getBoundingClientRect(); return r.width && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && (!img.complete || !img.naturalWidth); }).map(img => img.src);
    const panel = root.querySelector('.right-panel') || root.querySelector('.settlement-play-panel');
    const rect = panel.getBoundingClientRect();
    const controls = [...panel.querySelectorAll('button')].filter(button => { const r = button.getBoundingClientRect(); return r.width && r.height; }).map(button => {
     const r = button.getBoundingClientRect();
     let visible = { top: 0, left: 0, right: innerWidth, bottom: innerHeight };
     const clips = [];
     for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const a = ancestor.getBoundingClientRect();
      const clipX = /hidden|clip|scroll|auto/.test(style.overflowX);
      const clipY = /hidden|clip|scroll|auto/.test(style.overflowY);
      if (clipX) { visible.left = Math.max(visible.left, a.left + ancestor.clientLeft); visible.right = Math.min(visible.right, a.left + ancestor.clientLeft + ancestor.clientWidth); }
      if (clipY) { visible.top = Math.max(visible.top, a.top + ancestor.clientTop); visible.bottom = Math.min(visible.bottom, a.top + ancestor.clientTop + ancestor.clientHeight); }
      if (clipX || clipY) clips.push({ className: ancestor.className, clipX, clipY });
     }
     const inView = r.top >= visible.top - 0.5 && r.bottom <= visible.bottom + 0.5 && r.left >= visible.left - 0.5 && r.right <= visible.right + 0.5;
     const hit = inView ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
     return { text: button.getAttribute('aria-label') || button.textContent, rect: r.toJSON(), width: r.width, height: r.height, disabled: button.disabled, inView, visible, clips, covered: inView && hit !== button && !button.contains(hit), hit: hit ? { tag: hit.tagName, className: hit.className, text: hit.textContent?.slice(0,120) } : null };
    });
    const sections = [...panel.children].map(el => ({ className: el.className, rect: el.getBoundingClientRect().toJSON(), display: getComputedStyle(el).display, rows: getComputedStyle(el).gridTemplateRows, overflow: getComputedStyle(el).overflow, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    return { overflow: document.documentElement.scrollWidth - innerWidth, panel: rect.toJSON(), broken, controls, sections, sceneState: root.querySelector('.scene-host')?.dataset.settlementSceneState };
   });
   // Preserve failing-state evidence before enforcing the unchanged assertions.
   const screenshotBase = `${output}/${language}-${width}x${height}-${name}`;
   await page.screenshot({ path: `${screenshotBase}.jpg`, type: 'jpeg', quality: 90 });
   if (width === 390 && language === 'ru' && ['city-production','building','world'].includes(name)) await page.screenshot({ path: `${screenshotBase}.png` });
   const failuresBefore = assertionFailures.length;
   report.push({ language, width, height, name, artDelivery, ...geometry });
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
   if (name === 'city-production') {
    checks.push(() => assert.ok(artDelivery.resources.every(item => !/world-map-|expedition-thumb-/.test(item.path)), 'World art eagerly requested on City entry'));
    checks.push(() => assert.ok(['compact-parchment-card.webp', 'navigation-tile.webp'].every(file => artDelivery.resources.some(entry => entry.path.endsWith(file) && entry.encodedBodySize > 0)), 'City transfer measurements unavailable or zero'));
    checks.push(() => assert.ok(artDelivery.encodedBytes <= 64000, 'Illustrated City entry exceeds 64KB'));
    checks.push(() => assert.ok(['compact-parchment-card.webp', 'navigation-tile.webp'].every(file => artDelivery.decoded.some(image => image.path.endsWith(file))), 'City material is not actually rendered'));
   }
   checks.push(() => assert.ok(artDelivery.encodedBytes <= 400000, 'Illustrated delivery exceeds 400KB'));
   for (const verify of checks) {
    try { verify(); }
    catch (error) {
     if (error.code !== 'ERR_ASSERTION') throw error;
     assertionFailures.push({ language, width, height, name, message: error.message });
    }
   }
   if (assertionFailures.length > failuresBefore) await page.screenshot({ path: `${screenshotBase}-failure.png`, timeout: 3000 });
   visited.add(name);
   await writeFile(`${output}/assertion-failures.json`, JSON.stringify(assertionFailures, null, 2));
   console.log(JSON.stringify({ event: 'capture-complete', language, width, height, state: name, failures: assertionFailures.length }));
  }
  for (const tab of ['production','orders','growth']) { stateId = `city-${tab}`; await click(page.getByTestId(`settlement-tab-${tab}`)); await capture(`city-${tab}`); }
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
   stateId = name;
   console.log(JSON.stringify({ event: 'open-screen', language, width, height, state: name }));
   await click(control());
   await page.locator('.right-panel .panel-body-fancy').waitFor();
   await page.locator('.right-panel [aria-busy="true"]').waitFor({ state: 'hidden' });
   const screenSelectors = { building: '.building-screen', goals: '.goals-screen', inventory: '.inventory-screen', council: '.council-screen', construction: '.construction-screen', research: '.research-screen', world: '.world-screen', shop: '.settlement-store-unavailable', news: '.message-list' };
   await page.locator(`.right-panel ${screenSelectors[name]}`).waitFor();
   await bounded(page.locator('.right-panel').evaluate(async panel => {
    await document.fonts.ready;
    await Promise.allSettled(panel.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
   }), ACTION_TIMEOUT, `Screen layout did not settle: ${name}`);
   await capture(name);
   const body = page.locator('.right-panel .panel-body-fancy');
   if (await body.evaluate(el => el.scrollHeight > el.clientHeight + 1)) {
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    stateId = `${name}-bottom`;
    await capture(`${name}-bottom`);
   }
   // Exercise normal scrolling for every enabled control without activating
   // economy actions. Hidden/clipped-at-this-offset controls are still checked.
   const unreachable = await page.locator('.right-panel').evaluate(panel => {
    const scrolls = [...panel.querySelectorAll('*'), panel].filter(el => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth).map(el => [el, el.scrollTop, el.scrollLeft]);
    const failures = [];
    let firstFailedButton;
    for (const button of panel.querySelectorAll('button:not(:disabled)')) {
     const initial = button.getBoundingClientRect();
     if (!initial.width || !initial.height) continue;
     button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
     const r = button.getBoundingClientRect();
     const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
     let bounds = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
     for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor), a = ancestor.getBoundingClientRect();
      if (/hidden|clip|scroll|auto/.test(style.overflowX)) { bounds.left = Math.max(bounds.left, a.left + ancestor.clientLeft); bounds.right = Math.min(bounds.right, a.left + ancestor.clientLeft + ancestor.clientWidth); }
      if (/hidden|clip|scroll|auto/.test(style.overflowY)) { bounds.top = Math.max(bounds.top, a.top + ancestor.clientTop); bounds.bottom = Math.min(bounds.bottom, a.top + ancestor.clientTop + ancestor.clientHeight); }
     }
     const clipped = r.left < bounds.left - 0.5 || r.right > bounds.right + 0.5 || r.top < bounds.top - 0.5 || r.bottom > bounds.bottom + 0.5;
     const small = r.width < 43.5 || r.height < 43.5;
     if (small || clipped || (hit !== button && !button.contains(hit))) {
      firstFailedButton ||= button;
      failures.push({ text: button.getAttribute('aria-label') || button.textContent, rect: r.toJSON(), bounds, small, clipped, hit: hit?.className });
     }
    }
    for (const [el, top, left] of scrolls) { el.scrollTop = top; el.scrollLeft = left; }
    // Leave the first failed target at its attempted position for lossless proof.
    firstFailedButton?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    return failures;
   });
   if (unreachable.length) {
    assertionFailures.push({ language, width, height, name, message: 'Controls fail size or reachability after normal scrolling', controls: unreachable });
    await writeFile(`${output}/assertion-failures.json`, JSON.stringify(assertionFailures, null, 2));
    await page.screenshot({ path: `${output}/${language}-${width}x${height}-${name}-reachability-failure.png`, timeout: 3000 });
   }
   stateId = `${name}-close`;
   await click(page.locator('.right-panel .panel-header-action'));
   await page.locator('.settlement-play-panel').waitFor();
  }
  assert.equal(authFailure, false, `${language} ${width}x${height} authentication failed`);
  assert.deepEqual(errors, [], `${language} ${width}x${height} runtime errors`);
  } catch (error) {
   const ownBudgetClosure = budgetExpired && /Target (?:page|context|browser).*closed|(?:Page|Context|Browser context) (?:has been |is )?closed/i.test(error.message);
   const recoverable = stateId !== 'setup' && browser.isConnected() && !crashed && !authFailure && errors.length === 0 && (error.name === 'TimeoutError' || ownBudgetClosure);
   const failure = { kind: recoverable ? 'blocked-interaction' : 'fatal', language, width, height, name: stateId, message: error.message, runtimeErrors: [...errors], authFailure, crashed, budgetExpired, browserConnected: browser.isConnected(), skippedStates: expectedStates.filter(name => !visited.has(name)) };
   assertionFailures.push(failure);
   console.error(JSON.stringify(failure));
   if (!page.isClosed()) {
    try { await page.screenshot({ path: `${output}/${language}-${width}x${height}-${stateId}-failure.png`, timeout: 3000 }); }
    catch (diagnosticError) { failure.diagnosticError = diagnosticError.message; }
   }
   await writeFile(`${output}/assertion-failures.json`, JSON.stringify(assertionFailures, null, 2));
   // A fresh context is the next independent profile; never force a covered
   // control or pretend skipped dependent states passed.
   if (!recoverable) throw error;
  } finally {
   clearTimeout(budget);
   await context.close();
  }
 }
 if (assertionFailures.length) throw new AggregateError(assertionFailures.map(failure => Error(JSON.stringify(failure))), `${assertionFailures.length} Settlement visual assertion failures`);
} finally {
 await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
 await browser.close();
}
