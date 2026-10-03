import { expect } from "@playwright/test";

export async function expectBloxCanvas(page) {
  const canvas = page.locator('[data-game-shell="blox"] .bx-canvas canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((node) => node.toDataURL("image/png").length)).toBeGreaterThan(2000);
  return canvas;
}

export async function readBloxLayout(page) {
  const canvas = await expectBloxCanvas(page);
  let layout;
  await expect.poll(async () => {
    layout = await canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const size = Number(node.dataset.bloxBoardSize);
      const left = Number(node.dataset.bloxBoardLeft);
      const top = Number(node.dataset.bloxBoardTop);
      const slots = JSON.parse(node.dataset.bloxTraySlots || "[]");
      if (!(size > 0) || !Number.isFinite(left) || !Number.isFinite(top) || slots.length !== 3) return null;
      return {
        canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        left: rect.x + left, top: rect.y + top, size, cell: size / 10,
        slots: slots.map((slot) => ({ ...slot, left: rect.x + slot.left, top: rect.y + slot.top })),
      };
    });
    return layout?.size || 0;
  }).toBeGreaterThan(120);
  return layout;
}

export async function expectBloxLayout(page) {
  const layout = await readBloxLayout(page);
  const hud = await page.locator('[data-game-shell="blox"] .bx-hud').boundingBox();
  expect(hud).not.toBeNull();
  // Portrait stacks the HUD; landscape puts it in the side rail.
  const separated = hud.y + hud.height <= layout.top + 1 || hud.x >= layout.left + layout.size - 1;
  expect(separated, "Blox HUD must not cover hittable board cells").toBe(true);
  for (const slot of layout.slots) {
    expect(slot.left).toBeGreaterThanOrEqual(0);
    expect(slot.top).toBeGreaterThanOrEqual(0);
    expect(slot.left + slot.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    expect(slot.top + slot.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
  }
  await expect(page.locator('.bx-actions button')).toHaveCount(2);
  const bad = await page.locator('.bx-actions button').evaluateAll((buttons) => buttons.filter((button) => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return rect.width < 44 || rect.height < 44 || !hit || !(hit === button || button.contains(hit));
  }).map((button) => button.getAttribute("aria-label")));
  expect(bad).toEqual([]);
  const unreadable = await page.locator('.bx-hud .bx-metric').evaluateAll((metrics) => metrics.filter((metric) => {
    const label = metric.querySelector("span"), value = metric.querySelector("strong");
    return !label || !value || !metric.getAttribute("aria-label") || metric.scrollWidth > metric.clientWidth + 1
      || [label, value].some((node) => getComputedStyle(node).visibility === "hidden" || node.getBoundingClientRect().height === 0 || node.scrollWidth > node.clientWidth + 1);
  }).map((metric) => metric.getAttribute("aria-label")));
  expect(unreadable).toEqual([]);
  return layout;
}

export async function expectBloxDialog(page) {
  const dialog = page.locator('[data-game-shell="blox"] .bx-dialog[role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const box = await dialog.boundingBox(), viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  // Compact landscape intentionally scrolls its dialog body. Every action must remain reachable.
  for (const button of await dialog.getByRole("button").all()) {
    // A trial click already waits for stability, scrolls, and verifies the hit target.
    // Avoid a second stability/scroll pass for every action on mobile renderers.
    await button.click({ trial: true });
    const rect = await button.boundingBox();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  return dialog;
}

export async function pauseBlox(page) {
  await page.locator('[data-game-shell="blox"] [data-game-pause="true"]').click();
  await expect(page.locator('[data-game-shell="blox"]')).toHaveAttribute("data-bx-phase", "paused");
  await expect(page.locator('.bottom-tabs')).toHaveCount(0);
  return expectBloxDialog(page);
}

export async function exitBlox(page) {
  await page.locator('.bx-dialog').getByRole("button", { name: /^(All games|Все игры)$/ }).click();
  await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await expect(page.locator(".telegram-app")).toHaveJSProperty('inert', true);
}

export async function expectBloxArtSurface(page, locator, label, testInfo) {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect(), computed = getComputedStyle(node);
    return { x: rect.x, width: rect.width, height: rect.height, source: computed.borderImageSource, color: computed.color, backgroundImage: computed.backgroundImage };
  });
  expect(style.x).toBeGreaterThanOrEqual(0);
  expect(style.x + style.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(style.height).toBeGreaterThan(42);
  expect(style.source).toContain("/games/blox-v2/panel.webp");
  expect(style.backgroundImage).not.toContain("linear-gradient");
  expect(style.color).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: testInfo.outputPath(`${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`), fullPage: false });
}
