import { test, expect } from '@playwright/test';
import { selectHomeGame, openHome } from './helpers/home.js';

// Always retain the real interaction sequence. Screenshots cannot establish motion quality.
test.use({ video: 'on' });
const matrix = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],
  [768,1024],[1024,768],[1280,720],[393,873]];

async function start(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('gh_dev_user_id', `bubbo_motion_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('garden_shelf_language', 'en');
    window.__bubboPointerEvidence = [];
    window.__bubboVisibilityEvidence = [];
    document.addEventListener('visibilitychange', () => {
      window.__bubboVisibilityEvidence.push({ hidden: document.hidden, state: document.visibilityState });
    });
    for (const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']) {
      document.addEventListener(type, event => {
        if (!event.target.matches?.('.bb-field')) return;
        const bounds = event.target.getBoundingClientRect();
        window.__bubboPointerEvidence.push({ type, pointerType: event.pointerType, pointerId: event.pointerId,
          isTrusted: event.isTrusted, x: event.clientX, y: event.clientY,
          outside: event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom });
        if (window.__bubboPointerEvidence.length > 80) window.__bubboPointerEvidence.shift();
      }, true);
    }
  });
  await page.goto('/');
  await expect(page.locator('.status-dot.ready')).toBeVisible({ timeout: 15000 });
  await selectHomeGame(page, 'bubbo');
  await page.getByTestId('bb-start').click();
  const field = page.getByTestId('bb-field');
  await expect(field).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.bb-stage')).toHaveAttribute('data-bb-phase', 'playing');
  return { field, errors };
}
const fx = field => field.evaluate(node => JSON.parse(node.dataset.bubboFx));

async function beginGesture(page, field, kind) {
  const box = await field.boundingBox();
  const viewport = page.viewportSize();
  const inside = { x: box.x + box.width * .5, y: box.y + box.height * .48 };
  const outside = { x: Math.min(viewport.width - 1, box.x + box.width + 12), y: inside.y };
  expect(outside.x).toBeGreaterThan(box.x + box.width);
  if (kind === 'mouse') {
    await page.mouse.move(inside.x, inside.y);
    await page.mouse.down();
    await page.mouse.move(outside.x, outside.y, { steps: 12 });
    return { release: () => page.mouse.up(), cancel: async () => {
      await field.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
      await page.mouse.up();
    } };
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...inside, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...outside, id: 1 }] });
  return { release: async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }, cancel: async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await cdp.detach();
  } };
}

for (const [width,height] of matrix) test.describe(`Bubbo motion viewport ${width}x${height}`, () => {
  test.use({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 1100, hasTouch: true });
  test('marine idle, aimed field and reserved reward lane stay readable', async ({ page }, info) => {
    const { field, errors } = await start(page);
    await expect.poll(async () => (await fx(field)).gain).toBe(1);
    await expect.poll(async () => (await fx(field)).idle).toBe(1);
    await info.attach('idle-field', { body: await page.screenshot(), contentType: 'image/png' });
    const beforeGeometry = await field.getAttribute('data-bubbo-geometry');
    const gesture = await beginGesture(page, field, 'touch');
    await expect.poll(async () => (await fx(field)).gain).toBe(0);
    expect((await fx(field)).aiming).toBe(true);
    await info.attach('captured-aim-outside', { body: await page.screenshot(), contentType: 'image/png' });
    await gesture.release();
    await expect(field).toHaveAttribute('data-shots', '1');
    await expect(field).toHaveAttribute('data-flight', 'false');
    expect(await field.getAttribute('data-bubbo-geometry')).toBe(beforeGeometry);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    for (const selector of ['.bb-hud','.bb-powers','.bb-status']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    }
    await page.getByTestId('bb-pause').click();
    await expect.poll(async () => (await fx(field)).playing).toBe(false);
    await expect(page.getByTestId('bb-resume')).toBeVisible();
    await page.getByTestId('bb-resume').click();
    await expect.poll(async () => (await fx(field)).playing).toBe(true);
    await info.attach('live-pointer-events', { body: Buffer.from(JSON.stringify(await page.evaluate(() => window.__bubboPointerEvidence), null, 2)), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
});

for (const kind of ['mouse','touch']) test.describe(`Bubbo wide captured ${kind}`, () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, hasTouch: true });
  test('release beyond field fires once; cancelled gesture does not fire', async ({ page }, info) => {
    const { field, errors } = await start(page);
    const cancelled = await beginGesture(page, field, kind);
    await cancelled.cancel();
    expect(await field.getAttribute('data-shots')).toBe('0');
    await expect.poll(async () => (await fx(field)).aiming).toBe(false);
    // Bomb/lightning make the live video include real hit/pop/drop/reward feedback,
    // using normal controls and original production game resolution.
    for (const [index, power] of ['bomb','lightning'].entries()) {
      await page.getByTestId(`bb-${power}`).click();
      const gesture = await beginGesture(page, field, kind);
      await expect.poll(async () => (await fx(field)).gain).toBe(0);
      await gesture.release();
      await expect(field).toHaveAttribute('data-shots', String(index + 1));
      await expect.poll(async () => (await fx(field)).effects, { intervals: [16,32,50] }).toBeGreaterThan(0);
      expect((await fx(field)).effects).toBeLessThanOrEqual(32);
      await info.attach(`${power}-reaction`, { body: await page.screenshot(), contentType: 'image/png' });
      await expect(page.locator('.bb-reward-feedback')).toBeVisible();
      await expect.poll(async () => (await fx(field)).effects).toBe(0);
      expect(await field.getAttribute('data-shots')).toBe(String(index + 1));
    }
    const events = await page.evaluate(() => window.__bubboPointerEvidence);
    const releases = events.filter(event => event.type === 'pointerup' && event.outside && event.isTrusted && event.pointerType === kind);
    expect(releases).toHaveLength(2);
    await info.attach('captured-pointer-events', { body: Buffer.from(JSON.stringify(events, null, 2)), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
});

test.describe('Bubbo reduced motion and lifecycle', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test('live reduced motion, resize and explicit blur preserve the paused field under the catalogue', async ({ page }, info) => {
    const { field, errors } = await start(page);
    await expect.poll(async () => (await fx(field)).gain).toBe(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => (await fx(field)).reducedMotion).toBe(true);
    expect((await fx(field)).idle).toBe(0);
    expect((await fx(field)).gain).toBe(0);
    await page.getByTestId('bb-bomb').click();
    const shot = await beginGesture(page, field, 'touch');
    await shot.release();
    await expect(field).toHaveAttribute('data-shots','1');
    await expect(page.locator('.bb-reward-feedback')).toHaveCSS('animation-name', 'none');
    await info.attach('reduced-motion-feedback', { body: await page.screenshot(), contentType: 'image/png' });
    const resizing = await beginGesture(page, field, 'touch');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => (await fx(field)).aiming).toBe(false);
    await resizing.release();
    expect(await field.getAttribute('data-shots')).toBe('1');
    // Explicit event-handler coverage. This is not a native hidden-tab test.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('.bb-stage')).toHaveAttribute('data-bb-phase','paused');
    await expect.poll(async () => (await fx(field)).effects).toBe(0);
    expect(await field.getAttribute('data-shots')).toBe('1');
    await openHome(page);
    await expect(page.getByTestId('home-catalogue')).toBeVisible();
    expect(await field.getAttribute('data-shots')).toBe('1');
    // Home intentionally retains Bubbo paused/inert; this is not unmount coverage.
    await expect(page.locator('.bb-stage')).toHaveAttribute('data-bb-phase','paused');
    expect(errors).toEqual([]);
  });

  test('native background visibility cancels a captured touch when Chromium delivers hidden state', async ({ page }, info) => {
    const { field, errors } = await start(page);
    const hiding = await beginGesture(page, field, 'touch');
    await page.evaluate(() => { window.__bubboVisibilityEvidence = []; });
    const other = await page.context().newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    let delivered = false;
    try {
      await page.waitForFunction(() => window.__bubboVisibilityEvidence.some(event => event.hidden), null, { timeout: 2000, polling: 50 });
      delivered = true;
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
    }
    await page.bringToFront();
    await other.close();
    await info.attach('native-visibility-events', { body: Buffer.from(JSON.stringify(await page.evaluate(() => window.__bubboVisibilityEvidence), null, 2)), contentType: 'application/json' });
    test.skip(!delivered, 'This Chromium mode did not deliver native document.hidden; no browser hidden-state pass claimed. Native component-contract tests cover the handler.');
    await expect(page.locator('.bb-stage')).toHaveAttribute('data-bb-phase', 'paused');
    const ownsCapture = await field.evaluate(node => window.__bubboPointerEvidence
      .filter(event => event.type === 'pointerdown').some(event => node.hasPointerCapture(event.pointerId)));
    expect(ownsCapture).toBe(false);
    await hiding.release();
    expect(await field.getAttribute('data-shots')).toBe('0');
    await expect.poll(async () => (await fx(field)).aiming).toBe(false);
    expect(errors).toEqual([]);
  });
});
