import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startSwFixture } from './helpers/swFixture.mjs';
import { installEntryFrameProbe } from './helpers/entryFrames.js';
import { selectHomeGame, openHome } from './helpers/home.js';

const screens = {
  garden: '.gs2-stage', blox: '.bx-stage', match3: '.m3-stage', bubbo: '.bb-stage',
  merge: '.ml-root, [data-game-shell="merge"]', trivia: '.trv2-root',
  room: '.companion-yard-layout, .cy-app', settlement: '.settlement-game-root',
};
// Delay a real current backdrop, not manifests, hidden Hub icons or all images.
// The fixture additionally admits at most one held image response globally.
const backdrops = {
  garden: ['/games/garden-v2/background.webp'],
  blox: ['/games/blox-v2/background.webp'],
  match3: ['/games/match3-v2/library-background-portrait.webp', '/games/match3-v2/library-background-landscape.webp'],
  bubbo: ['/games/bubbo-v2/background-portrait.webp', '/games/bubbo-v2/background.webp'],
  merge: ['/games/merge-lab-v3/background.webp'],
  trivia: ['/games/trivia-v2/background.webp'],
  room: ['/games/companion-yard/backgrounds/meadow.png', '/assets-runtime/companion-yard/backgrounds/meadow.'],
  settlement: ['/games/settlement/map-region-settlement-playable.webp'],
};
const matrix = [
  ['garden', 320, 568], ['blox', 360, 800], ['match3', 390, 844],
  ['bubbo', 414, 896], ['trivia', 568, 320], ['merge', 844, 390],
  ['room', 768, 1024], ['settlement', 1024, 768], ['garden', 1280, 720],
  ['bubbo', 393, 873],
];
const afterPaint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function installProbe(page) {
  await page.addInitScript(installEntryFrameProbe);
  await page.addInitScript(() => {
    localStorage.setItem('gh_dev_user_id', 'fixture-a');
    localStorage.setItem('garden_shelf_language', 'en');
  });
}
async function record(page, testInfo, phase) {
  await afterPaint(page);
  const frames = await page.evaluate(() => window.__entryFrames.read());
  await testInfo.attach(`${phase}-entry-frames.json`, { body: Buffer.from(JSON.stringify(frames, null, 2)), contentType: 'application/json' });
  await testInfo.attach(`${phase}-screen`, { body: await page.screenshot(), contentType: 'image/png' });
  expect(frames.frames, 'sample actual browser frames, not only a settled DOM').toBeGreaterThan(0);
  expect(frames.violations, 'no previous Hub chrome, old background or outgoing game may paint').toEqual([]);
}
async function expectArtSettled(page, game) {
  await expect(page.locator(screens[game]).first()).toBeVisible({ timeout: 25_000 });
  await expect.poll(() => page.locator('img:visible').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await page.waitForLoadState('networkidle');
}

// The full HUD/WebView viewport matrix is distributed across the current games;
// existing mobile-ui-matrix continues checking every completed game layout.
for (const [game, width, height] of matrix) test.describe(`entry ${game} ${width}x${height}`, () => {
  test.use({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: width < 1024, hasTouch: width < 1024 });
  test('cold entry, delayed real artwork and warm service-worker reload never show the previous shell', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const fixture = await startSwFixture({ gameActions: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await installProbe(page);
      fixture.holdResources(['/api/player/snapshot']);
      fixture.holdArtResources(backdrops[game]);
      await page.goto(`${fixture.origin}/?tab=${game}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.game-entry-status')).toBeVisible();
      await record(page, testInfo, 'cold-snapshot-pending');
      fixture.releaseResources(['/api/player/snapshot']);
      await expect(page.locator(screens[game]).first()).toBeVisible({ timeout: 25_000 });
      await expect.poll(() => fixture.pendingResources().filter(path => backdrops[game].some(prefix => path.startsWith(prefix))).length).toBe(1);
      await testInfo.attach('held-backdrop.json', { body: Buffer.from(JSON.stringify({ game, pendingPaths: fixture.pendingResources() }, null, 2)), contentType: 'application/json' });
      await record(page, testInfo, 'cold-art-pending');
      fixture.releaseResources();
      await expectArtSettled(page, game);
      await record(page, testInfo, 'cold-ready');
      await page.evaluate(() => navigator.serviceWorker.ready);

      // A first visit may load its images before the worker claims the page.
      // Reload once under the real worker to populate its production art cache.
      await page.reload();
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await expectArtSettled(page, game);
      const savedIds = fixture.player('account-a').garden.plants.map(plant => plant.id);
      await page.evaluate(async () => {
        localStorage.setItem('entry-save-sentinel', 'preserve-me');
        const cache = await caches.open('entry-unrelated-cache');
        await cache.put('/entry-unrelated-sentinel', new Response('preserve-me'));
      });
      const cachedArt = await page.evaluate(async () => {
        const keys = await caches.keys();
        const name = keys.find(key => key === 'runtime-art-v1');
        return name ? (await (await caches.open(name)).keys()).map(request => request.url) : [];
      });
      expect(cachedArt.length, 'exercise a genuinely populated production art cache').toBeGreaterThan(0);
      const beforeWarmRequests = fixture.artRequests.length;
      fixture.holdResources(['/api/player/snapshot']);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.game-entry-status')).toBeVisible();
      await record(page, testInfo, 'warm-snapshot-pending');
      fixture.releaseResources();
      await expectArtSettled(page, game);
      await record(page, testInfo, 'warm-ready');
      await testInfo.attach('warm-art-cache.json', { body: Buffer.from(JSON.stringify({ cachedArt, warmNetworkArtRequests: fixture.artRequests.slice(beforeWarmRequests) }, null, 2)), contentType: 'application/json' });
      expect(await page.evaluate(async () => ({
        save: localStorage.getItem('entry-save-sentinel'),
        unrelated: await (await (await caches.open('entry-unrelated-cache')).match('/entry-unrelated-sentinel')).text(),
      }))).toEqual({ save: 'preserve-me', unrelated: 'preserve-me' });
      expect(fixture.player('account-a').garden.plants.map(plant => plant.id)).toEqual(savedIds);
      expect(errors).toEqual([]);
    } finally { fixture.releaseResources(); await fixture.close(); }
  });
});

test.describe('rapid entry changes', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('old image completion and repeated Home navigation cannot repaint an outgoing game', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const fixture = await startSwFixture({ gameActions: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await installProbe(page);
      await page.goto(`${fixture.origin}/?tab=garden`);
      await expectArtSettled(page, 'garden');
      // Hold only presentation art, not game code/API/controller readiness.
      // Then leave using real controls while those HTTP responses are pending.
      const graph = JSON.parse(await readFile(resolve(fixture.dist, 'game-loading-graph.json'), 'utf8'));
      const bloxChunk = graph.chunks.find(chunk => chunk.gameModules.includes('src/games/blox/BloxGame.jsx'));
      expect(bloxChunk).toBeTruthy();
      const chunkPath = `/${bloxChunk.file}`;
      fixture.holdResources([chunkPath]);
      fixture.holdArtResources([...backdrops.blox, ...backdrops.bubbo, ...backdrops.match3]);
      await selectHomeGame(page, 'blox');
      await expect(page.locator('.game-entry-status')).toBeVisible();
      await expect(page.locator('.bx-stage')).toHaveCount(0);
      await record(page, testInfo, 'lazy-controller-pending');
      await page.locator('.game-entry-status').getByRole('button', { name: 'All games', exact: true }).click();
      await expect(page.getByTestId('home-catalogue')).toBeVisible();
      await expect(page.locator('[data-home-game="garden"]')).toBeDisabled();
      await page.getByRole('button', { name: 'Close Home', exact: true }).click();
      fixture.releaseResources([chunkPath]);
      await expect(page.locator('.bx-stage')).toBeVisible();
      await expect.poll(() => fixture.pendingResources().filter(path => backdrops.blox.some(prefix => path.startsWith(prefix))).length).toBe(1);
      await record(page, testInfo, 'rapid-blox');
      for (const game of ['bubbo', 'match3', 'garden']) {
        await selectHomeGame(page, game);
        await expect(page.locator(screens[game]).first()).toBeVisible();
        await record(page, testInfo, `rapid-${game}`);
      }
      expect(fixture.pendingResources()).toHaveLength(1);
      expect(backdrops.blox.some(prefix => fixture.pendingResources()[0].startsWith(prefix))).toBe(true);
      fixture.releaseResources();
      await expectArtSettled(page, 'garden');
      await record(page, testInfo, 'late-outgoing-art-completed');
      await openHome(page);
      await page.getByRole('button', { name: 'Close Home', exact: true }).click();
      await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
      await openHome(page);
      await page.goBack();
      await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
      await page.goForward();
      await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab', 'garden');
      await record(page, testInfo, 'history-stable');
      expect(errors).toEqual([]);
    } finally { fixture.releaseResources(); await fixture.close(); }
  });
});
