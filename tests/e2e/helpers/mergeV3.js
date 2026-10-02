import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { MERGE_LAB_CATALOG as catalog } from '../../../game-logic/merge-lab-catalog.js';
import { createMergeLabAction } from '../../../game-logic/merge-lab-domain.js';

// Integrated UI + authenticated configured test server only. No preview host, response fixture,
// optimistic economic model, dev save endpoint, or test-only release policy override.
export async function mergeHeaders(page) {
  const id = await page.evaluate(() => localStorage.getItem('gh_dev_user_id'));
  expect(id).toBeTruthy();
  return { Authorization: `dev ${id}` };
}
export async function mergeSnapshot(page) {
  const response = await page.request.get('/api/player/snapshot', { headers: await mergeHeaders(page) });
  expect(response.ok()).toBe(true);
  const snapshot = await response.json();
  expect(snapshot.merge.schemaVersion, 'V3 must be enabled in the final server source').toBe(3);
  expect(snapshot.merge.serverEpoch).toMatch(/^[a-zA-Z0-9_-]{16,120}$/);
  expect(snapshot.merge.releasePolicy.yardV3ProjectsEnabled).toBe(false);
  expect(snapshot.merge.actionLedger).toBeUndefined();
  return snapshot;
}
export async function bootMergeV3(page, prefix = 'merge_v3', language = 'en') {
  const id = `${prefix}_${randomUUID()}`;
  await page.addInitScript(({ id, language }) => {
    localStorage.setItem('gh_dev_user_id', id);
    localStorage.setItem('garden_shelf_language', language);
  }, { id, language });
  await page.goto('/?tab=merge');
  // Ready remains mounted when the immersive shell intentionally hides the Hub header.
  await expect(page.locator('.status-dot.ready')).toHaveCount(1, { timeout: 15000 });
  await expectMergeV3(page);
  return id;
}
export async function expectMergeV3(page) {
  await expect(page.getByTestId('ml-laboratory')).toBeVisible();
  await expect(page.locator('[data-game-shell="merge"]')).toBeVisible();
  await expect(page.locator('.telegram-app.immersive-mode')).toBeVisible();
  await expect(page.locator('.bottom-tabs')).toBeHidden();
  await expect(page.locator('[data-game-shell="merge"] canvas')).toHaveCount(0);
  await mergeSnapshot(page);
}
export async function mergePanel(page, panel) {
  await page.getByTestId(`ml-open-${panel}`).click();
  const dialog = page.getByTestId('ml-drawer');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.ml-workspace')).toHaveJSProperty('inert', true);
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  return dialog;
}
export async function closeMergePanel(page, method = 'button') {
  if (method === 'escape') await page.keyboard.press('Escape');
  else await page.getByTestId('ml-drawer-close').click();
  await expect(page.getByTestId('ml-drawer')).toHaveCount(0);
  await expect(page.locator('.ml-workspace')).toHaveJSProperty('inert', false);
}
export async function pauseMerge(page) {
  const dialog = await mergePanel(page, 'pause');
  await expect(page.getByTestId('ml-pause')).toBeVisible();
  return dialog;
}
export async function exitMerge(page) {
  if (!await page.getByTestId('ml-pause').count()) await pauseMerge(page);
  await page.getByTestId('ml-exit').click();
  await expect(page.getByTestId('ml-laboratory')).toHaveCount(0);
  await expect(page.locator('.bottom-tabs')).toBeVisible();
  await expect(page.locator('.telegram-app.immersive-mode')).toBeHidden();
}
export async function expectMergeControlsReachable(page, controls) {
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    const m = await control.evaluate(node => {
      const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        vw: innerWidth, vh: innerHeight, hit: hit === node || node.contains(hit),
        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) };
    });
    expect(m.width).toBeGreaterThanOrEqual(44); expect(m.height).toBeGreaterThanOrEqual(44);
    expect(m.left).toBeGreaterThanOrEqual(-1); expect(m.right).toBeLessThanOrEqual(m.vw + 1);
    expect(m.top).toBeGreaterThanOrEqual(-1); expect(m.bottom).toBeLessThanOrEqual(m.vh + 1);
    expect(m.documentWidth).toBeLessThanOrEqual(m.vw + 1); expect(m.hit).toBe(true);
  }
}
export async function expectMergeArt(page, testInfo, label = 'merge-v3') {
  await expectMergeV3(page);
  await expect(page.locator('.ml-background')).toHaveCSS('background-image', /\/games\/merge-lab-v3\/background\.webp/);
  await expect(page.getByTestId('ml-laboratory')).toHaveCSS('border-image-source', /\/games\/merge-lab-v3\/lab-panel\.webp/);
  const art = page.locator('.ml-root img');
  expect(await art.count()).toBeGreaterThan(0);
  await expect.poll(() => art.evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  if (testInfo) await page.screenshot({ path: testInfo.outputPath(`${label}.png`), fullPage: false });
}
export function isMergeMutation(response, type) {
  if (!response.url().endsWith('/api/player/mutate') || response.request().method() !== 'POST') return false;
  try { const body = response.request().postDataJSON(); return body.action === 'merge.lab' && body.payload.command.type === type; } catch { return false; }
}
export async function confirmedMergeClick(page, locator, type) {
  const [response] = await Promise.all([page.waitForResponse(r => isMergeMutation(r, type)), locator.click()]);
  expect(response.ok(), `${type}: ${await response.text()}`).toBe(true);
  const body = await response.json(); expect(body.mergeLab.ok).toBe(true); expect(body.snapshot.merge.schemaVersion).toBe(3);
  return { body, request: response.request().postDataJSON() };
}
export async function confirmMergeQuote(page, type, quantity = 1) {
  await expect(page.getByTestId('ml-quote')).toBeVisible();
  if (quantity !== 1) {
    await page.getByTestId('ml-quote-quantity').fill(String(quantity));
    await page.getByTestId('ml-quote-refresh').click();
  }
  await expect(page.getByTestId('ml-quote-confirm')).toBeEnabled();
  return confirmedMergeClick(page, page.getByTestId('ml-quote-confirm'), type);
}
export async function researchMergePair(page, left, right) {
  const before = await mergeSnapshot(page);
  if (await page.getByTestId('ml-research-again').count()) await page.getByTestId('ml-research-again').click();
  for (const [slot, id] of [left, right].entries()) {
    await page.getByTestId(`ml-well-${slot}`).click();
    await page.getByTestId(`ml-sample-pick-${id}`).click();
  }
  const response = await confirmedMergeClick(page, page.getByTestId('ml-mix'), 'researchPair');
  const after = await mergeSnapshot(page);
  expect(after.merge.stock).toEqual(before.merge.stock);
  expect(after.resources.gachaTokens).toBe(before.resources.gachaTokens);
  expect(after.merge.mergeRevision).toBe(before.merge.mergeRevision + 1);
  await expect(page.getByTestId('ml-research-result')).toContainText(catalog.items.find(item => item.id === response.body.mergeLab.result.itemId)?.name || /./);
  return response;
}
export async function mergeRequest(page, type, parameters = {}, { quoted = false, nonce = randomUUID() } = {}) {
  const snapshot = await mergeSnapshot(page);
  if (quoted) {
    const response = await page.request.post('/api/merge/lab/quote', { headers: await mergeHeaders(page), data: { type, parameters, expectedMergeEpoch: snapshot.merge.serverEpoch } });
    expect(response.ok()).toBe(true); const { quote } = await response.json();
    parameters = { ...parameters, quote: { quoteId: quote.quoteId, expiresAt: quote.expiresAt } };
  }
  return { action: 'merge.lab', payload: { command: createMergeLabAction(snapshot, type, parameters, catalog, { actionId: nonce }), expectedMergeEpoch: snapshot.merge.serverEpoch } };
}
export async function sendMergeRequest(page, request) {
  const response = await page.request.post('/api/player/mutate', { headers: await mergeHeaders(page), data: request });
  return { status: response.status(), body: await response.json() };
}
export async function mergeAction(page, type, parameters = {}, options = {}) {
  const request = await mergeRequest(page, type, parameters, options); const result = await sendMergeRequest(page, request);
  expect(result.status).toBe(200); expect(result.body.mergeLab.ok).toBe(true);
  return { ...result, request };
}
export async function exerciseMergePanels(page) {
  await expectMergeV3(page);
  for (const [panel, id] of [['samples', 'ml-sample-list'], ['journal', 'ml-journal'], ['projects', 'ml-projects'], ['supplies', 'ml-supplies']]) {
    await mergePanel(page, panel); await expect(page.getByTestId(id)).toBeVisible();
    await closeMergePanel(page); await expect(page.getByTestId(`ml-open-${panel}`)).toBeFocused();
  }
}
export async function exerciseMergePointerCleanup(page) {
  await expectMergeV3(page);
  const before = await mergeSnapshot(page), sample = page.locator('.ml-recent-sample').first();
  const originalWells = await page.locator('.ml-well-button').allTextContents();
  for (const event of ['pointercancel', 'blur', 'visibilitychange', 'resize', 'orientationchange']) {
    await sample.scrollIntoViewIfNeeded(); const box = await sample.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 + 18, { steps: 3 });
    await expect(page.locator('.ml-drag-ghost')).toBeVisible();
    if (event === 'pointercancel') await sample.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true });
    else await page.evaluate(event => (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event)), event);
    await expect(page.locator('.ml-drag-ghost')).toHaveCount(0);
    await page.mouse.move(1, 1); await page.mouse.up();
  }
  expect(await page.locator('.ml-well-button').allTextContents()).toEqual(originalWells);
  const after = await mergeSnapshot(page); expect(after.merge.mergeRevision).toBe(before.merge.mergeRevision); expect(after.merge.stock).toEqual(before.merge.stock);
  // A real subsequent input must work after cleanup (not only disappearance of a ghost).
  await researchMergePair(page, 'cloud', 'ember');
}
