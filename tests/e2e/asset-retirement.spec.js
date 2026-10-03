import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { isRetiredAssetPath } from '../../scripts/asset-retirement-policy.mjs';

test('current game entry screens load retained art with a real service worker', async ({ page }) => {
  test.setTimeout(120_000);
  const failures = [];
  const requests = new Set();
  const id = `retirement_${randomUUID()}`;
  await page.addInitScript(id => localStorage.setItem('gh_dev_user_id', id), id);
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^\/(?:games|assets-runtime)\//.test(url.pathname)) requests.add(url.pathname);
    if (isRetiredAssetPath(url.pathname)) failures.push(`retired request: ${url.pathname}`);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.status() === 404 && /^\/(?:games|assets-runtime|assets)\//.test(url.pathname)) failures.push(`missing art: ${url.pathname}`);
  });
  const screens = {
    garden: '.gs2-stage', blox: '.bx-stage', bubbo: '[data-testid="bb-field"]',
    match3: '[data-game-shell="match3"] canvas', merge: '[data-testid="ml-laboratory"]',
    trivia: '[data-testid="trv2-root"]', room: '.companion-yard-layout', settlement: '.settlement-game-root',
  };
  for (const [tab, selector] of Object.entries(screens)) {
    await page.goto(`/?tab=${tab}`);
    await expect(page.locator('.status-dot.ready')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(selector).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect.poll(() => page.locator('img:visible').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  }
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('service worker did not activate')), 20_000)),
  ]));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(failures).toEqual([]);
  for (const prefix of ['/games/garden-v2/', '/games/blox-v2/', '/games/bubbo-v2/', '/games/match3-v2/', '/assets-runtime/companion-yard/']) {
    expect([...requests].some(path => path.startsWith(prefix)), prefix).toBe(true);
  }
  for (const path of ['/games/trivia/panel-menu.png', '/games/blox/cell_empty.png', '/games/farm/plot-empty.png', '/games/bubbo-bubbo/assets_bubbo_balls.png', '/games/garden-shelf/assets_shelf.png', '/games/puzzling-potions/images/piece-dragon.png']) {
    const response = await page.evaluate(async path => {
      const response = await fetch(path, { cache: 'no-store' });
      return { status: response.status, contentType: response.headers.get('content-type') };
    }, path);
    expect(response.status, path).toBe(404);
    expect(response.contentType, path).not.toContain('text/html');
  }
});
