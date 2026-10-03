import { expect } from '@playwright/test';

/** These helpers drive the integrated App and its real configured test backend.
 * They never install the standalone preview transport or synthesize rewards. */
export async function startTriviaSolo(page) {
  await expect(page.getByTestId('trv2-root')).toHaveAttribute('data-trivia-view', 'menu');
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/trivia/start') && r.request().method() === 'POST'),
    page.getByTestId('trv2-start').click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(page.getByTestId('trv2-question')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.trv2-answer')).toHaveCount(4);
  await expect(page.getByTestId('trv2-simulation')).toHaveCount(0);
  await expect(page.getByTestId('trv2-error')).toHaveCount(0);
}

export async function pauseTrivia(page) {
  await page.getByTestId('trv2-pause').click();
  const dialog = page.locator('.trv2-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('trv2-root')).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('.trv2-scroll')).toHaveJSProperty('inert', true);
  await expect(page.locator('.trv2-answer:not(:disabled)')).toHaveCount(0);
  await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  const box = await dialog.boundingBox(), viewport = page.viewportSize();
  expect(box).not.toBeNull(); expect(viewport).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  return dialog;
}

export async function resumeTrivia(page, method = 'button') {
  if (method === 'escape') await page.keyboard.press('Escape');
  else if (method === 'close') await page.locator('.trv2-dialog .trv2-row button').click();
  else await page.getByTestId('trv2-resume').click();
  await expect(page.locator('.trv2-dialog')).toHaveCount(0);
  await expect(page.locator('.trv2-scroll')).toHaveJSProperty('inert', false);
  await expect(page.getByTestId('trv2-root')).toHaveAttribute('data-paused', 'false');
}

export async function exitTriviaToHub(page) {
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/trivia/forfeit') && r.request().method() === 'POST'),
    page.getByTestId('trv2-pause-exit').click(),
  ]);
  expect(response.ok()).toBe(true);
  expect((await response.json()).success).toBe(true);
  await expect(page.getByTestId('trv2-root')).toHaveAttribute('data-trivia-view','menu');
  await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',true);
}

export async function expectTriviaControlsReachable(page, controls) {
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    const metrics = await control.evaluate(node => {
      const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, hit: hit === node || node.contains(hit), overflowX: node.scrollWidth > node.clientWidth + 1, overflowY: node.scrollHeight > node.clientHeight + 1 };
    });
    expect(metrics.width).toBeGreaterThanOrEqual(44); expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.left).toBeGreaterThanOrEqual(-1); expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.top).toBeGreaterThanOrEqual(-1); expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    expect(metrics.hit).toBe(true); expect(metrics.overflowX).toBe(false); expect(metrics.overflowY).toBe(false);
  }
}

export async function expectTriviaGeneratedSurface(page, locator, asset, label, testInfo) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const style = await locator.evaluate(node => { const s = getComputedStyle(node), r = node.getBoundingClientRect(); return { art: s.borderImageSource, background: s.backgroundImage, color: s.color, width: r.width, height: r.height, x: r.x }; });
  expect(style.art).toContain(`/games/trivia-v2/${asset}.webp`);
  expect(style.background).not.toContain('linear-gradient'); expect(style.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.height).toBeGreaterThan(42); expect(style.x).toBeGreaterThanOrEqual(0);
  expect(style.x + style.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  await page.screenshot({ path: testInfo.outputPath(`${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), fullPage: false });
}
