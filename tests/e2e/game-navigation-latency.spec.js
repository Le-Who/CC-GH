import {test, expect} from '@playwright/test';
import {startSwFixture} from './helpers/swFixture.mjs';
import {openHome, selectHomeGame} from './helpers/home.js';
import {installGameLatencyProbe, saveGameLatency} from './helpers/gameLatencyProbe.js';

test.use({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
async function initialize(page) {
  await page.addInitScript(installGameLatencyProbe);
  await page.addInitScript(() => { localStorage.setItem('gh_dev_user_id', 'fixture-a'); localStorage.setItem('garden_shelf_language', 'en'); });
}
// Diagnostic observation window only: the earlier throttled run exceeded the
// default5s wait. Preserve its timing evidence; this is not a performance budget.
async function ready(page) {
  await expect(page.locator('[data-plant-id="split-saved-daisy"] .gs2-plant-target')).toBeEnabled({timeout:30000});
}
async function details(page) {
  await page.locator('[data-plant-id="split-saved-daisy"] [data-plant-details-button]').click();
  await expect(page.locator('[data-garden-panel="plant-detail"]')).toBeVisible();
}

for (const throttled of [false, true]) test(`timing only: Garden cold, sheets, selected game and return (${throttled ? 'mobile throttle' : 'unthrottled'})`, async ({page, browserName}, testInfo) => {
  test.setTimeout(90000);
  test.skip(browserName !== 'chromium', 'Documented CDP network/CPU throttle diagnostic');
  const fixture = await startSwFixture({gameActions: true, gardenMode: 'r2'});
  const profile = throttled ? {latencyMs: 150, downloadBytesPerSecond: 200000, uploadBytesPerSecond: 90000, cpuRate: 4} : null;
  try {
    await initialize(page);
    if (profile) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: profile.latencyMs, downloadThroughput: profile.downloadBytesPerSecond, uploadThroughput: profile.uploadBytesPerSecond, connectionType: 'cellular4g'});
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: profile.cpuRate});
    }
    await page.goto(fixture.origin + '/?tab=garden');
    await ready(page);
    await page.evaluate(() => window.__gameLatency.mark('garden-enabled-observed'));
    await details(page);
    await page.evaluate(() => window.__gameLatency.mark('details-visible-observed'));
    const water = page.locator('.gs2-detail .gs2-button').filter({has: page.locator('img[src="/games/garden-v2/water.webp"]')});
    await expect(water).toBeEnabled();
    await water.click();
    await expect.poll(() => fixture.requests.filter(r => r.body?.payload?.command === 'water').length).toBe(1);
    await expect.poll(() => fixture.player('account-a').garden.plants.find(p => p.id === 'split-saved-daisy')?.lastWatered || 0).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__gameLatency.snapshot().events.some(e => e.name === 'api-body-observed' && e.command === 'water' && e.receiptConfirmed))).toBe(true);
    await expect(water).toBeDisabled();
    await page.locator('.gs2-dialog .gs2-close').click();
    await openHome(page); await selectHomeGame(page, 'blox');
    await expect(page.locator('[data-active-tab="blox"]')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await page.evaluate(() => window.__gameLatency.mark('blox-canvas-visible-observed'));
    await openHome(page); await selectHomeGame(page, 'garden');
    await ready(page);
    await page.evaluate(() => window.__gameLatency.mark('garden-return-enabled-observed'));
  } finally {
    await saveGameLatency(page, testInfo, 'game-navigation-latency.json', {sourceBaseline: 'ec815065f6adb7c36d81f97b41d47ad16e614b07', actualCiRevision: process.env.GITHUB_SHA || null, profile,
      scope: 'Synthetic local HTTP and real production client. Fixture serves no-store static responses; in-session module reuse is measured. Not live server or production cache latency. Resource end is not import evaluation completion. DOM enabled is an accounting-readiness proxy.'});
    await page.screenshot({path: testInfo.outputPath('latency-final.png')}).catch(() => {});
    await fixture.close();
  }
});

test.describe('Garden foreground priority diagnostic', () => {
  test.use({serviceWorkers: 'block'});
  test('one water during delayed heartbeat remains an explicit intent', async ({page}, testInfo) => {
    test.setTimeout(30000);
    const fixture = await startSwFixture({gameActions: true, gardenMode: 'r2'});
    let release; const gate = new Promise(resolve => {release = resolve;});
    let heartbeatHeld = false;
    try {
      await initialize(page); await page.goto(fixture.origin + '/?tab=garden'); await ready(page); await details(page);
      await page.route('**/api/player/mutate', async route => {
        const body = route.request().postDataJSON();
        if (body.payload?.command !== 'heartbeat' || heartbeatHeld) return route.continue();
        heartbeatHeld = true;
        // Hold the real response, not a fake success. The original nonce and
        // receipt survive; only this fixture's transport timing is controlled.
        const response = await route.fetch();
        await gate;
        await route.fulfill({response});
      });
      // Exercise the real visibility-resume heartbeat listener without a 15 s
      // wall-clock wait. No visibility property or game state is overwritten.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect.poll(() => heartbeatHeld).toBe(true);
      const water = page.locator('.gs2-detail .gs2-button').filter({has: page.locator('img[src="/games/garden-v2/water.webp"]')});
      await expect(water).toBeEnabled(); await water.click();
      release();
      // Acceptance assertion is intentionally red on ec815. Do not soften it
      // into a successful no-error claim or dispatch a second player click.
      await expect.poll(() => fixture.requests.filter(r => r.body?.payload?.command === 'water').length,
        {timeout: 2500, message: 'One explicit water must survive a pending background heartbeat'}).toBe(1);
      await expect.poll(() => fixture.player('account-a').garden.plants.find(p => p.id === 'split-saved-daisy')?.lastWatered || 0).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__gameLatency.snapshot().events.some(e => e.name === 'api-body-observed' && e.command === 'water' && e.receiptConfirmed))).toBe(true);
    await expect(water).toBeDisabled();
    } finally {
      release();
      await saveGameLatency(page, testInfo, 'garden-heartbeat-water.json', {heartbeatHeld, commands: fixture.requests.filter(r => r.body?.action === 'garden.r2').map(r => r.body.payload.command)});
      await page.screenshot({path: testInfo.outputPath('heartbeat-water.png')}).catch(() => {});
      await fixture.close();
    }
  });
});
