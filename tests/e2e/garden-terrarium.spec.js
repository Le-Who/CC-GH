import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import geometry from '../../src/games/garden-shelf/living/plant-geometry.json' with { type: 'json' };
import { createDefaultPlayer, createGardenEconomyState, getGardenXpRequired } from '../../game-logic.js';
import { PLANT_TYPES } from '../../game-logic/garden-shelf-plants.js';
import { migrateGardenR2, validateGardenR2Player } from '../../game-logic/garden-r2/domain.js';
import { applyActionWithReceipt, buildSnapshot } from '../../routes/player.js';
import { gardenDiagnostics } from './helpers/gardenDiagnostics.js';

const MATRIX = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
const MENU_SIZES = ['320x568', '390x844', '568x320'];
const panel = (page, kind) => page.locator(`.gs2-dialog[data-garden-panel="${kind}"]`);
const species = Object.keys(PLANT_TYPES);

function makePlayer({ shelves = 5, plants = 14, mature = false, level = 30, levelReady = false } = {}) {
  const now = Date.now();
  const player = createDefaultPlayer(`terrarium-${now}-${Math.random().toString(36).slice(2)}`, 'Terrarium', now);
  player.resources.gold = 100000;
  player.garden = {
    ...createGardenEconomyState(now),
    name: 'Winter Garden',
    level, xp: 0, xpRequired: getGardenXpRequired(level), levelReady,
    shelvesUnlocked: shelves,
    plants: Array.from({ length: plants }, (_, index) => ({
      id: `terrarium-${index}`, type: species[index % species.length], level: 12,
      shelfIndex: Math.floor(index / 3), spotIndex: index % 3,
      phase: mature || index === 0 ? 3 : index % 4, phaseProgress: 0,
      lastTapped: 0, lastWatered: now,
    })),
  };
  const adopted = migrateGardenR2(player, { now, legacyRevision: 0, acknowledgedTotal: 0 });
  validateGardenR2Player(adopted);
  return adopted;
}

async function mount(page, player, language = 'en', { rejectTend = false } = {}) {
  const requests = [], terrariumResponses = [], rejections = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/games/garden-v2/terrarium/')) {
      terrariumResponses.push({ url: response.url(), status: response.status() });
    }
  });
  await page.addInitScript(({ accountId, language }) => {
    localStorage.setItem('gh_dev_user_id', accountId);
    localStorage.setItem('garden_shelf_language', language);
  }, { accountId: player.id, language });
  await page.route(/\/api\/player\/snapshot(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(buildSnapshot(player)),
  }));
  await page.route('**/api/player/mutate', async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    // A server-derived negative fixture: the real domain rejects an absent plant.
    // The client still sends its ordinary R2 action and receives the real error.
    const payload = rejectTend && body.action === 'garden.r2' && body.payload?.command === 'tend'
      ? { ...body.payload, input: { ...body.payload.input, plantId: 'absent-error-fixture' } } : body.payload;
    const result = await applyActionWithReceipt(player, body.action, payload || {}, { clientActionId: body.clientActionId });
    if (payload !== body.payload) rejections.push({ status: result.status, body: result.body });
    await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) });
  });
  await page.goto('/');
  await expect(page.locator('.gs2-stage')).toBeVisible();
  await expect(page.locator('.gs2-terrarium')).toBeVisible();
  await expect(page.locator('.gs2-shelf-row')).toHaveCount(player.garden.shelvesUnlocked);
  await expect(page.locator('.gs2-spot[data-plant-id]')).toHaveCount(player.garden.plants.length);
  // The exact IDs prove the seeded server projection reached the real renderer.
  expect(await page.locator('.gs2-spot[data-plant-id]').evaluateAll(nodes => nodes.map(node => node.dataset.plantId)))
    .toEqual(player.garden.plants.map(plant => plant.id));
  await expect.poll(() => requests.some(request => request.action === 'garden.r2' && request.payload?.command === 'resume')).toBe(true);
  await expect(page.locator('.gs2-plant-target,.gs2-empty-target').first()).toBeEnabled();
  await expect(page.locator('.gs2-settings')).toBeEnabled();
  await page.locator('.active-game-frame').evaluate(async node => {
    await Promise.all(node.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => [...new Set(terrariumResponses.filter(response => response.status === 200)
    .map(response => new URL(response.url).pathname.split('/').pop()))].sort()).toEqual([
    'conservatory.webp', 'glass-frame.webp', 'hud-rail.webp', 'shelf.webp', 'sign.webp',
  ]);
  expect(terrariumResponses.filter(response => response.status >= 400)).toEqual([]);
  return { requests, terrariumResponses, rejections };
}

async function artReady(page, scope = page.locator('.gs2-stage')) {
  await expect.poll(() => scope.locator('img[src]').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 1))).toBe(true);
  // CSS skins count as real runtime art too; verify their actual referenced files decode.
  const failures = await scope.evaluate(async root => {
    const urls = new Set();
    for (const node of [root, ...root.querySelectorAll('*')]) {
      const style = getComputedStyle(node);
      for (const value of [style.backgroundImage, style.borderImageSource]) {
        for (const match of value.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(match[1]);
      }
    }
    return (await Promise.all([...urls].map(url => new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth > 1 ? null : url);
      image.onerror = () => resolve(url);
      image.src = url;
    })))).filter(Boolean);
  });
  expect(failures).toEqual([]);
}

async function shellFits(page) {
  const problems = await page.evaluate(() => {
    const errors = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('page horizontal scroll');
    for (const selector of ['.gs2-stage', '.gs2-terrarium', '.gs2-shelf-viewport']) {
      const node = document.querySelector(selector), rect = node.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1) errors.push(`${selector} leaves viewport`);
      // The decorative glass wrapper permits a two-pixel optical overhang.
      // The page, stage and actual shelf scrollport still must contain content.
      if (selector !== '.gs2-terrarium' && node.scrollWidth > node.clientWidth + 1) errors.push(`${selector} horizontal overflow`);
    }
    for (const node of document.querySelectorAll('.gs2-home,.gs2-settings,.gs2-name button,.gs2-metrics button')) {
      const rect = node.getBoundingClientRect();
      if (rect.width < 43.9 || rect.height < 43.9) errors.push(`${node.className} small control`);
    }
    return errors;
  });
  expect(problems).toEqual([]);
  await expect(page.locator('.bottom-tabs')).toHaveCount(0);
  await expect(page.locator('.gs2-glass-crown,.gs2-glass-edge,.gs2-glass-foot')).toHaveCount(0);
  await expect(page.locator('.gs2-glass-surround')).toHaveCSS('border-image-source', /\/terrarium\/glass-frame\.webp/);
  await expect(page.locator('.gs2-stage .gs2-status[role="status"]')).toHaveText('');
  expect(await page.locator('.gs2-stage .gs2-status[role="status"]').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return rect.width <= 1 && rect.height <= 1 && getComputedStyle(node).clipPath !== 'none';
  })).toBe(true);
  const frame = await page.locator('.gs2-glass-surround').evaluate(node => ({
    rect: node.getBoundingClientRect().toJSON(), crown: parseFloat(getComputedStyle(node).borderTopWidth),
  }));
  const scroll = await page.locator('.gs2-shelf-viewport').boundingBox();
  // Source-reviewed roof fades out at y110, well before the decorative y180
  // nine-slice ends. Transparent frame pixels must not exclude gameplay.
  const opening = scroll.y - frame.rect.top;
  expect(opening).toBeGreaterThanOrEqual(frame.rect.width * 100 / 1024 - 1);
  expect(opening).toBeLessThanOrEqual(Math.max(34, frame.rect.width * 120 / 1024) + 1);
  const scrollNode = page.locator('.gs2-shelf-viewport');
  await expect(scrollNode).toHaveCSS('background-image', 'none');
  await expect(scrollNode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const rail = await page.locator('.gs2-metrics').boundingBox();
  if (await page.locator('.gs2-stage').getAttribute('data-gs2-arrangement') === 'stack') {
    expect(rail.height, 'mobile metrics share one compact rail').toBeLessThanOrEqual(64);
    const boxes = await page.locator('.gs2-metrics .gs2-metric').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
    expect(Math.max(...boxes.map(b => b.top)) - Math.min(...boxes.map(b => b.top))).toBeLessThan(1);
    const primaryCenters = await page.locator('[data-garden-gold] > strong,[data-garden-xp] > span:first-child,[data-garden-substrate] > span:first-child,.gs2-progression > span:first-child').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return rect.top + rect.height / 2;
    }));
    expect(primaryCenters).toHaveLength(4);
    expect(Math.max(...primaryCenters) - Math.min(...primaryCenters), 'primary HUD icon/value rows share one vertical alignment').toBeLessThan(1);
  }
  await expect(page.locator('[data-garden-substrate] .gs2-art')).toHaveAttribute('src', /\/pot\.webp$/);
  await expect(page.locator('[data-garden-substrate] strong')).toHaveText(/^\d+\/\d+$/);
  expect(await page.locator('.gs2-metric').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
  const signSource = await sharp(fileURLToPath(new URL('../../public/games/garden-v2/terrarium/sign.webp', import.meta.url))).metadata();
  const sign = await page.locator('.gs2-name-art').boundingBox();
  expect(sign.height, 'natural sign artwork must not be cropped by a short background box')
    .toBeGreaterThanOrEqual(sign.width * signSource.height / signSource.width - 1);
}

async function expectWholeLabelWords(scope) {
  const splitWords = await scope.locator('.gs2-plant-name').evaluateAll(names => names.flatMap(name => {
    const node = name.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return [];
    return [...node.textContent.matchAll(/\S+/gu)].flatMap(match => {
      const range = document.createRange();
      range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
      const lines = new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top * 2) / 2));
      return lines.size > 1 ? [match[0]] : [];
    });
  }));
  expect(splitWords, 'essential plant names may wrap between words; a word must not leave orphaned letters on another line').toEqual([]);
}

async function revealPlantTapArea(target, scroller) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox(), view = await scroller.boundingBox();
  const left = Math.max(box.x, view.x), right = Math.min(box.x + box.width, view.x + view.width);
  const top = Math.max(box.y, view.y), bottom = Math.min(box.y + box.height, view.y + view.height);
  expect(right - left).toBeGreaterThanOrEqual(43.9);
  expect(bottom - top).toBeGreaterThanOrEqual(43.9);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

async function expectPotOnShelf(page, testInfo, plant) {
  const image = plant.locator('.gs2-live-plant img');
  const imageRect = await image.boundingBox();
  const source = await image.getAttribute('src');
  const asset = geometry.assets[new URL(source, page.url()).pathname.split('/').pop()];
  // Source-reviewed support UV excludes hanging foliage and transparent margins.
  // Observe the actual DOM consumer, without calling the fitting helper.
  const footY = imageRect.y + asset.pot.baseY * imageRect.height;
  const slot = await plant.locator('.gs2-live-plant').boundingBox();
  expect(Math.abs(imageRect.x + asset.pot.centerX * imageRect.width - (slot.x + slot.width / 2))).toBeLessThan(.1);
  expect(Math.abs(footY - (slot.y + slot.height))).toBeLessThan(.1);
  const shelf = await plant.locator('xpath=ancestor::section[contains(@class,"gs2-shelf-row")][1]').locator('.gs2-shelf-art').boundingBox();
  const shelfSourceY = (footY - shelf.y) / shelf.height * 251;
  await testInfo.attach('source-pixel-pot-baseline', { body: JSON.stringify({ source, support: asset.pot, footY, shelf, shelfSourceY }), contentType: 'application/json' });
  // Latest optical contract raises the support to 30% of the 251px plank,
  // source y75.3 on the top wood plane, above its rounded front edge.
  // Desktop scrollbars change rendered plank width by ten CSS pixels; this
  // optical region allows that projection while rejecting the old y105 plane.
  expect(Math.abs(shelfSourceY - 75.3)).toBeLessThan(3);
}

async function reachable(locator, scroller, target = false) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport();
  const inner = await locator.boundingBox(), outer = await scroller.boundingBox();
  expect(inner).not.toBeNull(); expect(outer).not.toBeNull();
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
  if (target) { expect(inner.width).toBeGreaterThanOrEqual(43.9); expect(inner.height).toBeGreaterThanOrEqual(43.9); }
}

async function dialogFits(page, dialog) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('border-image-source', /\/terrarium\/menu-panel\.webp/);
  for (const primary of await dialog.locator('.gs2-button.gs2-primary:not(:disabled):visible').all()) {
    await expect(primary).toHaveCSS('border-image-source', /\/terrarium\/menu-button\.webp/);
  }
  await artReady(page, dialog);
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  expect(await dialog.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1;
  })).toBe(true);
  await expect.poll(() => page.locator('.telegram-app').evaluate(node => !!node.closest('[inert]'))).toBe(true);
  const close = dialog.locator('.gs2-close');
  await expect(close).toBeInViewport();
  const box = await close.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(43.9); expect(box.height).toBeGreaterThanOrEqual(43.9);
  await dialog.locator('.gs2-dialog-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(close).toBeInViewport();
  await dialog.locator('.gs2-dialog-scroll').evaluate(node => { node.scrollTop = 0; });
}

async function closeDialog(page) {
  await page.locator('.gs2-dialog .gs2-close').click();
  await expect(page.locator('.gs2-dialog')).toHaveCount(0);
}

async function capture(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

async function withEvidence(page, testInfo, work) {
  const diagnostics = gardenDiagnostics(page, testInfo, 'terrarium');
  try {
    await work(diagnostics);
    expect(diagnostics.errors).toEqual([]);
    diagnostics.complete();
  } catch (error) {
    diagnostics.fail(error);
    try {
      await testInfo.attach('terrarium-failure-state', { body: JSON.stringify(await page.evaluate(() => ({
        url: location.href, stage: !!document.querySelector('.gs2-stage'),
        dialog: document.querySelector('.gs2-dialog')?.getAttribute('data-garden-panel'),
        overflow: (() => {
          const root = document.querySelector('.gs2-shelf-viewport');
          if (!root) return null;
          const bounds = root.getBoundingClientRect();
          const record = node => ({
            node: node.className, text: node.querySelector('h3')?.textContent,
            rect: node.getBoundingClientRect().toJSON(),
            clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
            overflowX: getComputedStyle(node).overflowX,
          });
          return { root: record(root), children: [...root.querySelectorAll('*')].filter(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || node.scrollWidth > node.clientWidth + 1);
          }).map(record) };
        })(),
        controls: [...document.querySelectorAll('.gs2-stage button,.gs2-dialog button')].filter(node => node.getClientRects().length)
          .map(node => ({ name: node.getAttribute('aria-label') || node.textContent, disabled: node.disabled })),
      }))), contentType: 'application/json' });
      await capture(page, testInfo, 'failure');
    } catch (captureError) {
      await testInfo.attach('failure-capture-error', { body: String(captureError), contentType: 'text/plain' });
    }
    throw error;
  } finally { diagnostics.dispose(); }
}

for (const [index, [width, height]] of MATRIX.entries()) test.describe(`Terrarium ${width}x${height}`, () => {
  const language = index % 2 ? 'ru' : 'en';
  test.use({ viewport: { width, height }, deviceScaleFactor: width < 1100 ? 2 : 1, isMobile: width < 1100, hasTouch: width < 1100, serviceWorkers: 'block' });
  test(`${language} mixed maximum shelves and composable menus`, async ({ page }, testInfo) => withEvidence(page, testInfo, async diagnostics => {
    const player = makePlayer();
    diagnostics.mark('boot');
    const { requests } = await mount(page, player, language);
    await shellFits(page); await artReady(page);
    const scroller = page.locator('.gs2-shelf-viewport');
    const first = page.locator('[data-plant-id="terrarium-0"]');
    await expect(first.locator('.gs2-plant-target')).toHaveAccessibleName(language === 'ru' ? /Маргаритка/ : /Daisy/);
    await revealPlantTapArea(first.locator('.gs2-plant-target'), scroller);
    await expectPotOnShelf(page, testInfo, first);
    await capture(page, testInfo, 'first-shelf');
    diagnostics.mark('each-shelf');
    for (const row of await page.locator('.gs2-shelf-row').all()) {
      await reachable(row.locator('.gs2-shelf-art'), scroller);
      const detail = row.locator('[data-plant-details-button]').last();
      await reachable(detail, scroller, true);
      await artReady(page, row);
      expect(await row.locator('.gs2-plant-name').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1))).toBe(true);
      await expectWholeLabelWords(row);
      for (const spot of await row.locator('[data-plant-id]').all()) {
        const name = await spot.locator('[data-plant-details-button]').boundingBox();
        const slot = await spot.locator('.gs2-live-plant').boundingBox();
        const image = await spot.locator('.gs2-live-plant img').boundingBox();
        const source = await spot.locator('.gs2-live-plant img').getAttribute('src');
        const asset = geometry.assets[new URL(source, page.url()).pathname.split('/').pop()];
        const paintedTop = image.y + asset.paintedBounds.y * image.height;
        expect(Math.abs(name.y + name.height - Math.max(slot.y, paintedTop - 6)), 'plant name sits six pixels above actual painted canopy when space permits').toBeLessThan(.2);
      }
      await expect(row.locator('h3')).toHaveCount(0);
    }
    await capture(page, testInfo, 'last-shelf');
    await shellFits(page);
    const tapPoint = await revealPlantTapArea(first.locator('.gs2-plant-target'), scroller);
    if (width < 1100) await page.touchscreen.tap(tapPoint.x, tapPoint.y);
    else await page.mouse.click(tapPoint.x, tapPoint.y);
    await expect.poll(() => player.garden.plants[0].lastTapped).toBeGreaterThan(0);
    await expect(first).toHaveAttribute('data-gs2-tapped', 'true');
    await expect(first.locator('.gs2-plant-target')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(first.locator('.gs2-plant-target')).toHaveCSS('box-shadow', 'none');
    if (MENU_SIZES.includes(`${width}x${height}`)) {
      diagnostics.mark('care');
      const opener = first.locator('[data-plant-details-button]');
      await opener.scrollIntoViewIfNeeded(); await opener.click();
      await dialogFits(page, panel(page, 'plant-detail'));
      await expect(panel(page, 'plant-detail').locator('[data-mastery-substrate]')).toContainText(/^\d+\/\d+$/);
      await capture(page, testInfo, 'care'); await closeDialog(page); await expect(opener).toBeFocused();
      diagnostics.mark('shop');
      await page.locator('.gs2-empty-target').click();
      const shop = panel(page, 'seed-shop-inventory'); await dialogFits(page, shop);
      await expect(shop.locator('.gs2-catalog-row')).toHaveCount(14);
      await capture(page, testInfo, 'shop');
      await shop.locator('.gs2-catalog-row').last().scrollIntoViewIfNeeded();
      await expect(shop.locator('.gs2-catalog-row').last().getByRole('button')).toBeInViewport();
      await closeDialog(page);
      diagnostics.mark('quests');
      await page.getByRole('button', { name: language === 'ru' ? 'Развитие сада' : 'Garden progress', exact: true }).click();
      const progression = panel(page, 'progression');
      for (const value of ['overview', 'research', 'collections']) {
        await progression.locator(`[data-menu-tab="${value}"]`).click();
        await expect(progression.locator(`#garden-progress-${value}`)).toBeVisible();
        await dialogFits(page, progression); await capture(page, testInfo, `progress-${value}`);
      }
      await progression.locator('[data-menu-tab="overview"]').click();
      await panel(page, 'progression').getByRole('button', { name: language === 'ru' ? 'Квесты сада' : 'Garden quests', exact: true }).click();
      await dialogFits(page, panel(page, 'quests'));
      await expect(panel(page, 'quests').locator('#garden-quests-tabs-daily')).toHaveAttribute('aria-selected', 'true');
      await capture(page, testInfo, 'quests-today');
      await panel(page, 'quests').locator('#garden-quests-tabs-story').click();
      await expect(panel(page, 'quests').locator('#garden-quests-tabs-story')).toHaveAttribute('aria-selected', 'true');
      await dialogFits(page, panel(page, 'quests')); await capture(page, testInfo, 'quests-milestones'); await closeDialog(page);
    }
    expect(requests.some(request => /garden\.sync|resetEconomy|creditEarned/.test(request.action))).toBe(false);
    validateGardenR2Player(player);
  }));
});

test.describe('Terrarium actionable error in short landscape', () => {
  test.use({ viewport: { width: 568, height: 320 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  test('server rejection stays inside glass, preserves geometry and leaves the final action reachable', async ({ page }, testInfo) => withEvidence(page, testInfo, async diagnostics => {
    const player = makePlayer({ plants: 15, mature: true });
    const { rejections } = await mount(page, player, 'en', { rejectTend: true });
    await shellFits(page);
    const scroller = page.locator('.gs2-shelf-viewport');
    const geometry = () => page.evaluate(() => Object.fromEntries(['.gs2-shelf-viewport', '.gs2-header', '.gs2-terrarium'].map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
    })));
    const before = await geometry();
    diagnostics.mark('reject-tend');
    const point = await revealPlantTapArea(page.locator('[data-plant-id="terrarium-0"] .gs2-plant-target'), scroller);
    await page.touchscreen.tap(point.x, point.y);
    const alert = page.locator('.gs2-stage .gs2-status[role="alert"]');
    await expect(alert).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => document.body.innerText.match(/\bGARDEN_[A-Z0-9_]+\b/g) || []), 'server error codes must not leak through a duplicate global notification').toEqual([]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].status).toBe(400);
    expect(rejections[0].body.error).toBe('GARDEN_R2_PLANT_MISSING');
    expect(player.garden.plants[0].lastTapped).toBe(0);
    expect(await geometry()).toEqual(before);
    const rect = await alert.boundingBox(), opening = await scroller.boundingBox(), header = await page.locator('.gs2-header').boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(opening.x - 1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(opening.x + opening.width + 1);
    expect(rect.y).toBeGreaterThanOrEqual(opening.y - 1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(opening.y + opening.height + 1);
    const overlap = Math.max(0, Math.min(rect.x + rect.width, header.x + header.width) - Math.max(rect.x, header.x))
      * Math.max(0, Math.min(rect.y + rect.height, header.y + header.height) - Math.max(rect.y, header.y));
    expect(overlap).toBe(0);
    for (const action of await alert.getByRole('button').all()) {
      const box = await action.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(43.9); expect(box.height).toBeGreaterThanOrEqual(43.9);
      await expect(action).toBeInViewport();
    }
    diagnostics.mark('last-action-above-notice');
    const last = page.locator('[data-plant-details-button]').last();
    await reachable(last, scroller, true);
    const lastBox = await last.boundingBox(), alertBox = await alert.boundingBox();
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(alertBox.y - 1);
    await capture(page, testInfo, 'error-last-action');
    await alert.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(page.locator('.gs2-stage .gs2-status[role="alert"]')).toHaveCount(0);
    expect(await geometry()).toEqual(before);
    await last.tap();
    await dialogFits(page, panel(page, 'plant-detail'));
    await closeDialog(page);
    validateGardenR2Player(player);
  }));
});

test.describe('Terrarium sparse states and interactions', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  for (const mode of ['reduced', 'fallback']) test(`${mode} tap keeps the artwork transparent and acknowledges success`, async ({ page }, testInfo) => withEvidence(page, testInfo, async () => {
    await page.emulateMedia({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    if (mode === 'fallback') await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return type === 'webgl' && this.classList.contains('gs2-live-surface') ? null : original.call(this, type, ...args);
      };
    });
    const player = makePlayer({ shelves: 1, plants: 1 });
    await mount(page, player);
    const target = page.locator('.gs2-plant-target').first();
    await target.scrollIntoViewIfNeeded(); await target.tap();
    await expect(page.locator('[data-plant-id="terrarium-0"]')).toHaveAttribute('data-gs2-tapped', 'true');
    await expect(target).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(target).toHaveCSS('box-shadow', 'none');
    await expect(page.locator('.gs2-tap-feedback')).toBeVisible();
    if (mode === 'reduced') await expect(page.locator('.gs2-tap-feedback')).toHaveCSS('animation-name', 'none');
    expect(player.garden.plants[0].lastTapped).toBeGreaterThan(0);
  }));

  test('pending legacy level reward fits the compact HUD and remains claimable', async ({ page }, testInfo) => withEvidence(page, testInfo, async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    const player = makePlayer({ shelves: 1, plants: 1, level: 14, levelReady: true });
    const { requests } = await mount(page, player);
    await shellFits(page);
    const claim = page.locator('.gs2-metrics [data-garden-xp]');
    await expect(claim).toBeEnabled();
    await expect(claim.locator('strong')).toHaveText('15');
    await capture(page, testInfo, 'pending-level-reward');
    await claim.tap();
    await expect.poll(() => requests.some(request => request.payload?.command === 'claimLegacyLevelReward')).toBe(true);
    await expect(panel(page, 'reward')).toBeVisible();
  }));

  for (const language of ['en', 'ru']) for (const plants of [0, 1]) {
    test(`${language} empty and single shelf state: ${plants} plants`, async ({ page }, testInfo) => withEvidence(page, testInfo, async diagnostics => {
      const player = makePlayer({ shelves: 1, plants });
      await mount(page, player, language);
      for (const [width, height] of [[320,568],[390,844],[568,320]]) {
        diagnostics.mark(`sparse-${width}x${height}`);
        await page.setViewportSize({ width, height });
        await expect.poll(() => page.locator('.gs2-stage').getAttribute('data-gs2-arrangement')).toBe(width > height ? 'side' : 'stack');
        await shellFits(page);
        await expectWholeLabelWords(page.locator('.gs2-shelf-viewport'));
        const scroller = page.locator('.gs2-shelf-viewport'), expansion = page.locator('.gs2-expansion');
        await reachable(expansion.locator('h3'), scroller);
        if (await expansion.locator('p').count()) await reachable(expansion.locator('p').first(), scroller);
        await capture(page, testInfo, `sparse-heading-${width}x${height}`);
        await reachable(expansion.getByRole('button'), scroller, true);
        await expect(expansion.getByRole('button')).toBeEnabled();
        await expect(expansion.locator('h3')).toHaveText(language === 'ru' ? 'Добавить полку' : 'Add a shelf');
        expect(await expansion.evaluate(node => [...node.querySelectorAll('h3,p,button')].every(text => text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= text.clientHeight + 1))).toBe(true);
        await capture(page, testInfo, `sparse-${width}x${height}`);
        const empty = page.locator('.gs2-empty-target').first();
        await expect(empty).toBeEnabled();
        await reachable(empty.locator('.gs2-empty-name'), scroller, true);
        await empty.locator('.gs2-empty-name').tap();
        await expect(panel(page, 'seed-shop-inventory')).toBeVisible();
        await closeDialog(page);
      }
      await page.locator('.gs2-expansion button').click();
      await expect(page.locator('.gs2-shelf-row')).toHaveCount(2);
      expect(player.garden.shelvesUnlocked).toBe(2);
      validateGardenR2Player(player);
    }));
  }

  test('maximum mature plants preserve tap, hold and interrupted-scroll behavior', async ({ page }, testInfo) => withEvidence(page, testInfo, async diagnostics => {
    const player = makePlayer({ plants: 15, mature: true });
    const { requests } = await mount(page, player);
    const target = page.locator('[data-plant-id="terrarium-0"] .gs2-plant-target');
    const tendCount = () => requests.filter(request => request.action === 'garden.r2' && request.payload?.command === 'tend').length;
    await target.scrollIntoViewIfNeeded(); await expect(target).toBeEnabled();
    for (const abort of ['pointercancel', 'pointerleave', 'blur', 'visibilitychange']) {
      diagnostics.mark(`cancel-${abort}`);
      await target.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', button: 0, isPrimary: true, clientX: 20, clientY: 20 });
      // React synthesizes onPointerLeave from native pointerout/over. Dispatching
      // native pointerleave bypasses that production listener path entirely.
      if (abort.startsWith('pointer')) await target.dispatchEvent(abort === 'pointerleave' ? 'pointerout' : abort, { pointerId: 7, pointerType: 'touch', button: 0, isPrimary: true, relatedTarget: null });
      else await page.evaluate(event => event === 'blur' ? window.dispatchEvent(new Event(event)) : document.dispatchEvent(new Event(event)), abort);
      await target.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', button: 0, isPrimary: true });
      await page.waitForTimeout(1550);
      expect(tendCount(), `${abort} must never send a tend command`).toBe(0);
      await expect(page.locator('.gs2-dialog')).toHaveCount(0);
      expect(player.garden.plants[0].lastTapped).toBe(0);
    }
    diagnostics.mark('touch-scroll');
    const scroller = page.locator('.gs2-shelf-viewport');
    await scroller.evaluate(node => { node.scrollTop = 0; });
    const box = await target.boundingBox(), client = await page.context().newCDPSession(page);
    try {
      const from = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
      for (let step = 1; step <= 10; step++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y - step * 15, id: 1 }] });
        await page.waitForTimeout(16);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await client.detach(); }
    await expect.poll(() => scroller.evaluate(node => node.scrollTop)).toBeGreaterThan(40);
    expect(tendCount()).toBe(0); await expect(page.locator('.gs2-dialog')).toHaveCount(0);
    diagnostics.mark('long-hold');
    await target.scrollIntoViewIfNeeded();
    await target.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', button: 0, isPrimary: true, clientX: 20, clientY: 20 });
    await expect(panel(page, 'plant-detail')).toBeVisible();
    await target.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', button: 0, isPrimary: true });
    expect(tendCount()).toBe(0); await closeDialog(page);
    diagnostics.mark('keyboard-tap');
    await target.focus(); await page.keyboard.press('Enter');
    await expect.poll(tendCount).toBe(1);
    await expect.poll(() => player.garden.plants[0].lastTapped).toBeGreaterThan(0);
    validateGardenR2Player(player);
  }));
});
