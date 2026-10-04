import { expect } from '@playwright/test';

// Check painted bounds as well as click centers: a higher z-index or disabled
// pointer events must not disguise a currency/toolbar layout collision.
export async function expectLegacyYardToolbarReachable(page) {
  await page.evaluate(() => document.fonts.ready);
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
