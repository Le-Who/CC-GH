import { expect } from '@playwright/test';

// Check painted bounds as well as click centers: a higher z-index or disabled
// pointer events must not disguise a currency/toolbar layout collision.
export async function expectLegacyYardToolbarReachable(page) {
  await page.evaluate(() => document.fonts.ready);
  await expectYardMetricChipsAligned(page);
  const toolbar = page.locator('.yard-corner-actions');
  await expect(toolbar.locator('button')).toHaveCount(3);
  await expect(page.locator('.yard-currency-stack .yard-currency-chip')).toHaveCount(2);
  await expect.poll(() => toolbar.evaluate(node => {
    const chips = [...document.querySelectorAll('.yard-currency-stack .yard-currency-chip')];
    const buttons = [...node.querySelectorAll('button')];
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const problems = [];
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const name = button.getAttribute('aria-label');
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (rect.width < 48 || rect.height < 48) problems.push(`${name}:small`);
      if (rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight) problems.push(`${name}:clipped`);
      if (hit !== button && !button.contains(hit)) problems.push(`${name}:covered`);
      if (chips.some(chip => overlaps(rect, chip.getBoundingClientRect()))) problems.push(`${name}:currency-overlap`);
    }
    const regions = [...document.querySelectorAll('.yard-currency-stack, .yard-corner-actions, .yard-bowls, .yard-activity-pill, .yard-side-tools, .yard-bottom-dock')]
      .filter(region => { const rect = region.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(region).display !== 'none'; });
    for (let left = 0; left < regions.length; left++) for (let right = left + 1; right < regions.length; right++) {
      if (overlaps(regions[left].getBoundingClientRect(), regions[right].getBoundingClientRect())) {
        problems.push(`${regions[left].dataset.hudRegion}:${regions[right].dataset.hudRegion}:region-overlap`);
      }
    }
    for (const chip of chips) {
      const value = chip.querySelector('strong');
      const rect = chip.getBoundingClientRect();
      if (rect.left < 0 || rect.right > innerWidth) problems.push('currency:clipped');
      if (value.scrollWidth > value.clientWidth + 1) problems.push('currency:value-clipped');
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page:horizontal-scroll');
    return problems;
  })).toEqual([]);
  for (const button of await toolbar.locator('button').all()) await button.click({ trial: true });
}

export async function expectYardMetricChipsAligned(page) {
  const chips = await page.locator(".yard-currency-chip").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const icon = node.querySelector(".yard-hud-icon")?.getBoundingClientRect();
    const value = node.querySelector("strong")?.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      text: node.textContent.trim(),
      ratio: rect.width / Math.max(1, rect.height),
      backgroundImage: style.backgroundImage,
      backgroundColor: style.backgroundColor,
      imageLayerCount: (style.backgroundImage.match(/url\(/g) || []).length,
      iconVisible: !!icon && icon.width >= 24 && icon.height >= 24,
      valueInside:
        !!value
        && value.left >= rect.left + 34
        && value.right <= rect.right - 6
        && value.top >= rect.top + 6
        && value.bottom <= rect.bottom - 6,
    };
  }));

  expect(chips.length).toBeGreaterThanOrEqual(2);
  for (const chip of chips) {
    expect(chip.backgroundImage, `${chip.text} must use generated metric-chip art`).toContain("/games/hud-redesign/room/metric-chip.webp");
    expect(chip.backgroundColor, `${chip.text} must not paint a CSS fallback color behind transparent metric art`).toBe("rgba(0, 0, 0, 0)");
    expect(chip.imageLayerCount, `${chip.text} should use one generated metric art layer`).toBe(1);
    expect(chip.ratio, `${chip.text} metric chip art is visually squeezed`).toBeGreaterThanOrEqual(1.75);
    expect(chip.iconVisible, `${chip.text} metric icon should remain visible on small mobile`).toBe(true);
    expect(chip.valueInside, `${chip.text} metric value should sit inside the generated frame content area`).toBe(true);
  }
}


// Scroll the actual flyout, keeping its full-size controls above the dock.
// Normal actionability must hold for the final item, not only the top toolbar.
export async function expectLegacyYardToolsReachable(page) {
  const tools = page.locator('.yard-side-tools');
  await expect(tools).toBeVisible();
  await expect(tools.locator('button')).toHaveCount(6);
  for (const button of await tools.locator('button').all()) {
    await button.scrollIntoViewIfNeeded();
    await expect.poll(() => button.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const surface = node.closest('.yard-side-tools').getBoundingClientRect();
      const dock = document.querySelector('.yard-bottom-dock').getBoundingClientRect();
      const stage = document.querySelector('.companion-yard-stage').getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        fullSize: rect.width >= 48 && rect.height >= 48,
        insideScrollSurface: rect.left >= surface.left && rect.right <= surface.right && rect.top >= surface.top && rect.bottom <= surface.bottom,
        insideStage: surface.top >= stage.top && surface.bottom <= stage.bottom,
        aboveDock: surface.bottom <= dock.top && rect.bottom <= dock.top,
        hit: hit === node || node.contains(hit),
      };
    })).toEqual({ fullSize: true, insideScrollSurface: true, insideStage: true, aboveDock: true, hit: true });
    if (await button.isEnabled()) await button.click({ trial: true });
  }
}

export async function expectLegacyYardDialogInsideStage(page) {
  await expect.poll(() => page.locator('.yard-game-screen').evaluate(node => {
    const rect = node.getBoundingClientRect();
    const stage = node.closest('.companion-yard-stage').getBoundingClientRect();
    const close = node.querySelector('.yard-screen-header > button');
    const target = close.getBoundingClientRect();
    const hit = document.elementFromPoint(target.x + target.width / 2, target.y + target.height / 2);
    return rect.left >= stage.left - 1 && rect.right <= stage.right + 1
      && rect.top >= stage.top - 1 && rect.bottom <= stage.bottom + 1
      && target.width >= 44 && target.height >= 44
      && target.left >= stage.left && target.right <= stage.right
      && target.top >= stage.top && target.bottom <= stage.bottom
      && (hit === close || close.contains(hit));
  })).toBe(true);
}
