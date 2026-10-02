import { test, expect } from '@playwright/test';
import { startTriviaSolo, pauseTrivia, resumeTrivia, exitTriviaToHub } from './helpers/triviaR3.js';
import { mergePanel, closeMergePanel } from './helpers/mergeV3.js';

// Full-game browser checks use the integrated application and configured test server.
// No synthetic rewards, fake successful requests, or alternate game implementation.
const FORBIDDEN_COPY = /A little curiosity|Любопытство ведёт|question bank|игровой базы|public duel results from the server|результаты дуэлей на сервере|VPS runtime|Loading game runtime|игрового рантайма|Игровые ассеты|runtime-слоями|Into the blue|В глубину|Две идеи\. Один опыт|Two ideas\. One experiment/;

for (const language of ['en', 'ru']) for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
  test(`${language} concise player copy and stable feedback at ${width}x${height}`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    await page.addInitScript(({ language }) => {
      localStorage.setItem('gh_dev_user_id', `copy_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem('garden_shelf_language', language);
    }, { language });
    const checkCopy = async name => {
      expect(await page.locator('body').innerText(), name).not.toMatch(FORBIDDEN_COPY);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} horizontal overflow`).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: false });
    };
    await page.goto('/?tab=garden');
    await expect(page.locator('.status-dot.ready')).toBeVisible({ timeout: 15000 });
    const before = await page.locator('.status-dot').boundingBox();
    // Hold a real refresh response while measuring; then let the real request complete.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const route = async request => { await gate; await request.continue(); };
    await page.route('**/api/player/snapshot', route);
    await page.locator('.status-dot').click();
    await expect(page.locator('.status-dot.syncing')).toHaveCount(1);
    expect(await page.locator('.status-dot').boundingBox()).toEqual(before);
    release();
    await expect(page.locator('.status-dot.ready')).toHaveCount(1);
    await page.unroute('**/api/player/snapshot', route);
    await checkCopy('garden-hub');

    await page.goto('/?tab=trivia');
    await expect(page.getByTestId('trv2-start')).toBeVisible({ timeout: 15000 });
    await checkCopy('trivia-setup');
    await startTriviaSolo(page);
    await checkCopy('trivia-question');
    const dialog = await pauseTrivia(page);
    await expect(dialog).toContainText(language === 'ru' ? 'Заработанные очки сохранятся' : 'Ending early keeps earned score');
    await checkCopy('trivia-pause');
    await resumeTrivia(page);
    await expect(page.getByTestId('trv2-pause')).toBeFocused();
    await pauseTrivia(page);
    await exitTriviaToHub(page);

    await page.goto('/?tab=merge');
    await expect(page.getByTestId('ml-laboratory')).toBeVisible({ timeout: 15000 });
    for (const panel of ['samples', 'journal', 'projects', 'supplies', 'pause']) {
      const drawer = await mergePanel(page, panel);
      expect(await drawer.innerText()).not.toMatch(/Catalog alchemy|Каталог alchemy|story[bB]ook workshop|связи сказочной мастерской/);
      await expect(drawer.locator('.ml-provenance,.ml-item-use')).toHaveCount(0);
      if (panel === 'projects') await expect(drawer).toContainText(language === 'ru' ? 'Создаёт Лунную лампу' : 'Makes a Moon Lamp');
      await checkCopy(`merge-${panel}`);
      await closeMergePanel(page);
      await expect(page.getByTestId(`ml-open-${panel}`)).toBeFocused();
    }
    for (const game of ['blox', 'match3', 'bubbo', 'room', 'settlement']) {
      await page.goto(`/?tab=${game}`);
      await expect(page.locator('.status-dot.ready')).toHaveCount(1, { timeout: 15000 });
      await expect(page.locator('.active-game-frame')).toBeVisible();
      await checkCopy(`${game}-menu`);
    }
  });
}

async function expectBoundedFeedback(locator, page) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox(), viewport = page.viewportSize();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await locator.evaluate(node => getComputedStyle(node).overflowY)).toBe('auto');
}

for (const language of ['en', 'ru']) for (const [width, height] of [[320, 568], [568, 320]]) {
  test(`${language} important failures overlay open dialogs without geometry or focus jumps at ${width}x${height}`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height });
    await page.addInitScript(({ language }) => {
      localStorage.setItem('gh_dev_user_id', `copy_error_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem('garden_shelf_language', language);
    }, { language });
    await page.goto('/?tab=blox');
    const start = page.locator('.bx-dialog').getByRole('button', { name: language === 'ru' ? 'Старт' : 'Start', exact: true });
    await expect(start).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const menu = page.locator('.bx-dialog');
    const beforeMenu = await menu.boundingBox(), beforeStart = await start.boundingBox();
    let release;
    let entered;
    const seen = new Promise(resolve => { entered = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    const failStart = async route => {
      if (route.request().postDataJSON()?.action !== 'blox.start') return route.continue();
      entered(); await pending; await route.abort('failed');
    };
    await page.route('**/api/player/mutate', failStart);
    await start.click(); await seen;
    await start.focus(); release();
    const shared = page.locator('.telegram-app > .notice');
    await expectBoundedFeedback(shared, page);
    expect(await menu.boundingBox()).toEqual(beforeMenu);
    expect(await start.boundingBox()).toEqual(beforeStart);
    await expect(start).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await menu.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('shared-error-over-dialog.png') });
    await shared.click();
    await expect(shared).toHaveCount(0);
    await page.unroute('**/api/player/mutate', failStart);

    await page.goto('/?tab=merge');
    await expect(page.getByTestId('ml-laboratory')).toBeVisible({ timeout: 15000 });
    const beforeLab = await page.getByTestId('ml-laboratory').boundingBox();
    await mergePanel(page, 'supplies');
    await page.getByTestId('ml-starter-kit').click();
    const confirm = page.getByTestId('ml-quote-confirm');
    await expect(confirm).toBeVisible();
    const drawer = page.getByTestId('ml-drawer');
    const beforeDrawer = await drawer.boundingBox(), beforeConfirm = await confirm.boundingBox();
    let releaseMerge, enterMerge;
    const seenMerge = new Promise(resolve => { enterMerge = resolve; });
    const pendingMerge = new Promise(resolve => { releaseMerge = resolve; });
    const failMerge = async route => {
      if (route.request().postDataJSON()?.action !== 'merge.lab') return route.continue();
      enterMerge(); await pendingMerge; await route.abort('failed');
    };
    await page.route('**/api/player/mutate', failMerge);
    await confirm.click(); await seenMerge;
    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(await confirm.boundingBox()).toEqual(beforeConfirm);
    const close = page.getByTestId('ml-drawer-close');
    await close.focus(); releaseMerge();
    const error = drawer.locator('.ml-notice-error');
    await expectBoundedFeedback(error, page);
    await expect(close).toBeFocused();
    expect(await drawer.boundingBox()).toEqual(beforeDrawer);
    expect(await confirm.boundingBox()).toEqual(beforeConfirm);
    await expect(error.getByRole('button', { name: language === 'ru' ? 'Проверить результат' : 'Check result', exact: true })).toBeEnabled();
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('merge-error-over-quote.png') });
    await close.click();
    const workspaceError = page.locator('.ml-workspace-notice');
    await expectBoundedFeedback(workspaceError, page);
    expect(await page.getByTestId('ml-laboratory').boundingBox()).toEqual(beforeLab);
    await page.screenshot({ path: testInfo.outputPath('merge-error-over-workspace.png') });
    await page.unroute('**/api/player/mutate', failMerge);
    await workspaceError.getByRole('button', { name: language === 'ru' ? 'Проверить результат' : 'Check result', exact: true }).click();
    await expect(page.locator('.ml-notice')).toHaveCount(0);
    expect(await page.getByTestId('ml-laboratory').boundingBox()).toEqual(beforeLab);
  });
}
