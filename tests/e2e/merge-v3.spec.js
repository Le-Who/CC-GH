import { test, expect } from '@playwright/test';
import { MERGE_LAB_CATALOG as catalog } from '../../game-logic/merge-lab-catalog.js';
import { bootMergeV3, expectMergeV3, mergeHeaders, mergeSnapshot, mergePanel, closeMergePanel, pauseMerge,
  exitMerge, expectMergeControlsReachable, expectMergeArt, confirmedMergeClick, confirmMergeQuote,
  researchMergePair, mergeAction, mergeRequest, sendMergeRequest, isMergeMutation } from './helpers/mergeV3.js';

const researchPath = ['cloud_ember_spark', 'glass_spark_lens', 'v3_lens_spark_light', 'v3_light_vial_glow_lantern',
  'v3_sprout_dew_herb', 'vial_herb_elixir', 'v3_glass_elixir_crystal'];
const craftPath = ['glass_spark_lens', 'v3_lens_spark_light', 'v3_light_vial_glow_lantern', 'vial_herb_elixir', 'v3_glass_elixir_crystal'];

// These browser tests intentionally require the final enabled/clean-start release source.
// No fake success replies, privileged state seeding, or alternate economic implementation.
// Playwright's configured test server is memory-backed; PostgreSQL durability is a separate CI gate.
test('V3 authentic first-project path grants one Moon Lamp in twenty confirmed UI actions', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await bootMergeV3(page, 'merge_v3_first_project');
  const before = await mergeSnapshot(page);
  expect(before.merge.projects.selectedId).toBe('night_beacon');
  expect(before.merge.stock).toEqual({});
  for (const id of researchPath) {
    const recipe = catalog.recipes.find(r => r.id === id);
    const { body } = await researchMergePair(page, ...recipe.ingredients);
    expect(body.mergeLab.result.outcome).toBe('new');
    expect(body.mergeLab.result.recipeId).toBe(id);
  }
  expect((await mergeSnapshot(page)).merge.alchemyEssence).toBe(28);
  await mergePanel(page, 'supplies');
  await page.getByTestId('ml-starter-kit').click();
  await confirmMergeQuote(page, 'claimStarterKit');
  expect((await mergeSnapshot(page)).merge.stock).toEqual(catalog.starterKit);
  await confirmedMergeClick(page, page.getByTestId('ml-claim-charges'), 'claimFreeCharges');
  for (const [itemId, quantity] of Object.entries({ glass: 2, vial: 1, spark: 2, herb: 1 })) {
    await page.getByTestId('ml-supply-material').selectOption(itemId);
    await page.getByTestId('ml-claim-material').click();
    await confirmMergeQuote(page, 'claimSupply', quantity);
  }
  await page.getByTestId('ml-distill-glass').click();
  await confirmMergeQuote(page, 'distillStock');
  expect((await mergeSnapshot(page)).merge.alchemyEssence).toBe(30);
  await closeMergePanel(page);
  await mergePanel(page, 'journal');
  for (const recipeId of craftPath) {
    const recipe = catalog.recipes.find(r => r.id === recipeId);
    await page.getByTestId('ml-journal').locator('select').selectOption(recipe.result);
    await page.getByTestId(`ml-recipe-quote-${recipeId}`).click();
    await confirmMergeQuote(page, 'craft');
  }
  await closeMergePanel(page);
  await mergePanel(page, 'projects');
  await page.getByTestId('ml-project-quote-night_beacon').click();
  const { request, body } = await confirmMergeQuote(page, 'craftProject');
  expect(body.mergeLab.replayed).toBe(false);
  expect(body.mergeLab.result.placementRequired).toBe(true);
  expect(body.mergeLab.result.visitorGranted).toBe(false);
  const after = await mergeSnapshot(page);
  expect(after.yard.goodieInventory.moon_lamp).toBe((before.yard.goodieInventory.moon_lamp || 0) + 1);
  expect(after.merge.projects.crafted.night_beacon).toBe(1);
  expect(after.merge.freeTapCharges).toBe(24); expect(after.merge.alchemyEssence).toBe(0);
  expect(after.merge.mergeRevision).toBe(before.merge.mergeRevision + 20);
  expect(after.resources.gold).toBe(before.resources.gold);
  expect(after.resources.gachaTokens).toBe(before.resources.gachaTokens);
  expect(after.yard.currencies).toEqual(before.yard.currencies);
  expect(after.yard.placedGoodies).toEqual(before.yard.placedGoodies);
  expect(after.yard.activeVisitors).toEqual(before.yard.activeVisitors);
  expect(after.farm.harvested).toEqual(before.farm.harvested);
  // The exact HTTP command must replay without a second debit or inventory grant.
  const replay = await sendMergeRequest(page, request);
  expect(replay.status).toBe(200); expect(replay.body.mergeLab.replayed).toBe(true);
  const replayed = await mergeSnapshot(page);
  expect(replayed.merge.stock).toEqual(after.merge.stock);
  expect(replayed.merge.projects.crafted).toEqual(after.merge.projects.crafted);
  expect(replayed.yard.goodieInventory).toEqual(after.yard.goodieInventory);
  await page.screenshot({ path: testInfo.outputPath('merge-v3-first-project-confirmed.png'), fullPage: false });
  expect(errors).toEqual([]);
});

test('a real committed supply debit with a lost reply reloads and retries the identical command once', async ({ page }) => {
  await bootMergeV3(page, 'merge_v3_lost_reply');
  await mergePanel(page, 'supplies');
  await confirmedMergeClick(page, page.getByTestId('ml-claim-charges'), 'claimFreeCharges');
  const before = await mergeSnapshot(page);
  await page.getByTestId('ml-supply-material').selectOption('glass');
  await page.getByTestId('ml-claim-material').click();
  await expect(page.getByTestId('ml-quote-confirm')).toBeEnabled();
  const requests = []; let lost = false, committedResolve;
  const committed = new Promise(resolve => { committedResolve = resolve; });
  await page.route('**/api/player/mutate', async route => {
    const request = route.request().postDataJSON();
    if (request.action !== 'merge.lab' || request.payload.command.type !== 'claimSupply') return route.continue();
    requests.push(request);
    if (lost) return route.continue();
    lost = true;
    // Forward the real request and verify server success, then lose only its delivery to the browser.
    const reply = await route.fetch(); const body = await reply.json();
    expect(reply.ok()).toBe(true); expect(body.mergeLab.ok).toBe(true);
    committedResolve(body); await route.abort('failed');
  });
  await page.getByTestId('ml-quote-confirm').dblclick();
  await committed;
  await expect(page.getByRole('button', { name: 'Check result', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('game_hub_merge_pending_v1:')));
  expect(saved).toHaveLength(1);
  expect(JSON.parse(saved[0][1]).payload).toEqual(requests[0].payload);
  const once = await mergeSnapshot(page);
  expect(once.merge.stock.glass).toBe((before.merge.stock.glass || 0) + 1);
  expect(once.merge.freeTapCharges).toBe(before.merge.freeTapCharges - 1);
  expect(once.merge.mergeRevision).toBe(before.merge.mergeRevision + 1);
  expect(requests).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Check result', exact: true })).toBeVisible();
  await expect(page.getByTestId('ml-laboratory')).toHaveCount(0);
  const [reply] = await Promise.all([
    page.waitForResponse(r => isMergeMutation(r, 'claimSupply')),
    page.getByRole('button', { name: 'Check result', exact: true }).click(),
  ]);
  expect((await reply.json()).mergeLab.replayed).toBe(true);
  await expectMergeV3(page);
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  const after = await mergeSnapshot(page);
  expect(after.merge.stock).toEqual(once.merge.stock); expect(after.merge.freeTapCharges).toBe(once.merge.freeTapCharges);
  expect(after.merge.mergeRevision).toBe(once.merge.mergeRevision); expect(after.resources.gachaTokens).toBe(before.resources.gachaTokens);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('game_hub_merge_pending_v1:')))).toEqual([]);
});

test('authenticated V3 routes enforce replay, stale revisions, account epochs, and future Yard gates', async ({ page }) => {
  await bootMergeV3(page, 'merge_v3_http');
  const headers = await mergeHeaders(page);
  const unauthorized = await page.request.post('/api/merge/lab/quote', { data: { type: 'claimStarterKit' } });
  expect(unauthorized.status()).toBe(401);
  const unauthorizedMutation = await page.request.post('/api/player/mutate', { data: { action: 'merge.lab', payload: {} } });
  expect(unauthorizedMutation.status()).toBe(401);
  await mergeAction(page, 'claimFreeCharges');
  const before = await mergeSnapshot(page);
  const one = await mergeRequest(page, 'claimSupply', { itemId: 'glass', quantity: 1 }, { quoted: true });
  const duplicate = await Promise.all([sendMergeRequest(page, one), sendMergeRequest(page, one)]);
  expect(duplicate.every(r => r.status === 200)).toBe(true);
  expect(duplicate.filter(r => r.body.mergeLab.replayed === false)).toHaveLength(1);
  expect(duplicate.filter(r => r.body.mergeLab.replayed === true)).toHaveLength(1);
  const same = await mergeSnapshot(page);
  expect(same.merge.freeTapCharges).toBe(before.merge.freeTapCharges - 1);
  expect(same.merge.stock.glass).toBe((before.merge.stock.glass || 0) + 1);
  const staleOne = await mergeRequest(page, 'claimSupply', { itemId: 'glass', quantity: 1 }, { quoted: true });
  const staleTwo = await mergeRequest(page, 'claimSupply', { itemId: 'glass', quantity: 1 }, { quoted: true });
  const competing = await Promise.all([sendMergeRequest(page, staleOne), sendMergeRequest(page, staleTwo)]);
  expect(competing.filter(r => r.body.mergeLab.ok)).toHaveLength(1);
  expect(competing.find(r => !r.body.mergeLab.ok).body.code).toBe('REVISION_CONFLICT');
  const afterRace = await mergeSnapshot(page);
  expect(afterRace.merge.freeTapCharges).toBe(same.merge.freeTapCharges - 1);
  expect(afterRace.merge.stock.glass).toBe(same.merge.stock.glass + 1);
  const otherResponse = await page.request.get('/api/player/snapshot', { headers: { Authorization: `${headers.Authorization}_other` } });
  expect(otherResponse.ok()).toBe(true);
  const crossAccount = await page.request.post('/api/player/mutate', { headers: { Authorization: `${headers.Authorization}_other` }, data: one });
  expect(crossAccount.status()).toBe(409); expect((await crossAccount.json()).code).toBe('MERGE_EPOCH_CONFLICT');
  const legacy = await page.request.post('/api/player/mutate', { headers, data: { action: 'merge.tap', payload: {} } });
  expect(legacy.status()).toBe(410);
  for (const projectId of ['living_arbor', 'echo_chimes']) {
    const quote = await page.request.post('/api/merge/lab/quote', { headers, data: { type: 'craftProject', parameters: { projectId, quantity: 1 }, expectedMergeEpoch: afterRace.merge.serverEpoch } });
    expect(quote.status()).toBe(409); expect((await quote.json()).code).toBe('YARD_UPDATE_REQUIRED');
    const blocked = await sendMergeRequest(page, await mergeRequest(page, 'craftProject', { projectId, quantity: 1 }));
    expect(blocked.status).toBe(409); expect(blocked.body.code).toBe('YARD_UPDATE_REQUIRED');
  }
  const locked = await mergeSnapshot(page);
  expect(locked.merge.stock).toEqual(afterRace.merge.stock); expect(locked.merge.alchemyEssence).toBe(afterRace.merge.alchemyEssence);
  expect(locked.yard.goodieInventory).toEqual(afterRace.yard.goodieInventory);
  // Saved goal is intentionally kept, with an actionable lock instead of silently rewriting it.
  await mergeAction(page, 'selectProject', { projectId: 'echo_chimes' });
  await page.reload(); await expectMergeV3(page);
  await expect(page.locator('.ml-goal')).toContainText('Needs the Yard update');
  await page.locator('.ml-goal').click();
  for (const id of ['living_arbor', 'echo_chimes']) await expect(page.getByTestId(`ml-project-quote-${id}`)).toBeDisabled();
  await confirmedMergeClick(page, page.getByTestId('ml-project-select-night_beacon'), 'selectProject');
  expect((await mergeSnapshot(page)).merge.projects.selectedId).toBe('night_beacon');
});

test('V3 dialogs trap/restore focus, quote Back preserves state, and remount does not duplicate commands', async ({ page }) => {
  await bootMergeV3(page, 'merge_v3_focus');
  const before = await mergeSnapshot(page);
  const dialog = await mergePanel(page, 'supplies');
  const tabbable = dialog.locator('button:enabled, input:enabled, select:enabled');
  await tabbable.last().focus(); await page.keyboard.press('Tab');
  await expect(tabbable.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(tabbable.last()).toBeFocused();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('ml-starter-kit').click();
    await expect(page.getByTestId('ml-quote')).toBeVisible();
    await page.getByTestId('ml-drawer').getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('ml-supplies')).toBeVisible();
    await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    expect((await mergeSnapshot(page)).merge.mergeRevision).toBe(before.merge.mergeRevision);
  }
  await closeMergePanel(page, 'escape');
  await expect(page.getByTestId('ml-open-supplies')).toBeFocused();
  for (let i = 0; i < 3; i++) {
    await pauseMerge(page); await page.getByTestId('ml-resume').click();
    await expect(page.getByTestId('ml-open-pause')).toBeFocused();
  }
  await exitMerge(page);
  await page.getByRole('button', { name: /Merge/ }).click();
  await expectMergeV3(page);
  expect((await mergeSnapshot(page)).merge.mergeRevision).toBe(before.merge.mergeRevision);
  // Real browser history navigation creates/unmounts a document; no synthetic app state.
  await pauseMerge(page);
  await page.goto('/?tab=garden');
  await expect(page.locator('.bottom-tabs')).toBeVisible();
  await page.goBack(); await expectMergeV3(page);
  await expect(page.getByTestId('ml-drawer')).toHaveCount(0);
  await page.goForward(); await expect(page.locator('.bottom-tabs')).toBeVisible();
  await page.getByRole('button', { name: /Merge/ }).click(); await expectMergeV3(page);
  await researchMergePair(page, 'cloud', 'ember');
  expect((await mergeSnapshot(page)).merge.mergeRevision).toBe(before.merge.mergeRevision + 1);
});

test('extended phone touch, DPR2 and live portrait/landscape rotation keep V3 controls reachable', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 393, height: 873 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await bootMergeV3(page, 'merge_v3_rotate', 'ru');
    for (const [width, height] of [[393, 873], [873, 393], [393, 873]]) {
      await page.setViewportSize({ width, height });
      await expect(page.locator('.ml-root')).toHaveAttribute('data-orientation', width > height ? 'landscape' : 'portrait');
      await expectMergeArt(page, testInfo, `merge-v3-touch-${width}x${height}`);
      await expectMergeControlsReachable(page, page.locator('.ml-hud button, .ml-nav button, .ml-well-button, .ml-lab-action button'));
      await page.getByTestId('ml-open-samples').tap();
      await expect(page.getByTestId('ml-drawer')).toBeVisible();
      await page.getByTestId('ml-sample-pick-cloud').tap();
      await expect(page.getByTestId('ml-well-0')).not.toHaveText(/Выберите образец/);
      await page.getByTestId('ml-open-pause').tap();
      await expectMergeControlsReachable(page, page.getByTestId('ml-drawer').getByRole('button'));
      await page.getByTestId('ml-resume').tap();
      // Clear the selected sample before the next rotation.
      for (const clear of await page.locator('[data-testid^="ml-clear-"]').all()) await clear.tap();
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
