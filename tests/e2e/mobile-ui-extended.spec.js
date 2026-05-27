import { test, expect } from "@playwright/test";

const EXTENDED_PHONE_VIEWPORTS = [
  { width: 375, height: 812, label: "iphone-x" },
  { width: 384, height: 832, label: "android-tall" },
  { width: 393, height: 873, label: "pixel-tall", deviceScaleFactor: 2 },
  { width: 412, height: 915, label: "large-android" },
  { width: 430, height: 932, label: "large-iphone" },
];

async function bootPage(browser, baseURL, viewport) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((label) => {
    window.localStorage.setItem("garden_shelf_language", "en");
    window.localStorage.setItem("gh_dev_user_id", `extended_matrix_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    window.localStorage.removeItem("terrarium_save");
  }, viewport.label);
  await page.goto("/");
  await expect(page.locator(".status-dot.ready")).toBeVisible({ timeout: 15000 });
  return { context, page, pageErrors };
}

async function expectNoHorizontalScroll(page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
  }));
  expect(metrics.docWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

async function expectVisibleButtonsReachable(page, selector, minSide = 44) {
  const badButtons = await page.locator(selector).evaluateAll((buttons, side) => buttons
    .filter((button) => {
      const styles = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return styles.display !== "none" && styles.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width < side || rect.height < side || rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1;
    })
    .map((button) => button.getAttribute("aria-label") || button.textContent.trim()), minSide);
  expect(badButtons).toEqual([]);
}

async function expectCanvasNonBlank(page, shellSelector) {
  const canvas = page.locator(`${shellSelector} .pixi-host canvas`).first();
  await expect(canvas).toBeVisible();
  const length = await canvas.evaluate((node) => node.toDataURL("image/png").length);
  expect(length).toBeGreaterThan(2000);
}

async function expectMatch3HudClearOfBoard(page) {
  const shell = page.locator('[data-game-shell="match3"]');
  const hud = shell.locator(".game-play-hud");
  const canvas = shell.locator(".pixi-host canvas");
  await expect(hud).toBeVisible();
  await expect(canvas).toBeVisible();

  let layout = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    layout = await canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const boardTop = Number(node.dataset.match3BoardTop);
      const boardSize = Number(node.dataset.match3BoardSize);
      if (!Number.isFinite(boardTop) || !Number.isFinite(boardSize)) return null;
      return {
        boardTop: rect.y + boardTop,
        boardSize,
      };
    });
    if (layout?.boardSize > 160) break;
    await page.waitForTimeout(50);
  }

  const hudBox = await hud.boundingBox();
  expect(hudBox).not.toBeNull();
  expect(layout?.boardSize ?? 0).toBeGreaterThan(160);
  expect(layout.boardTop).toBeGreaterThanOrEqual(hudBox.y + hudBox.height + 4);
}

test.describe.configure({ mode: "serial" });

test.describe("extended phone HUD matrix", () => {
  for (const viewport of EXTENDED_PHONE_VIEWPORTS) {
    test(`${viewport.label} keeps HUD, dock, and canvases reachable`, async ({ browser, baseURL }) => {
      test.setTimeout(90_000);

      const { context, page, pageErrors } = await bootPage(browser, baseURL, viewport);
      try {
        await expectNoHorizontalScroll(page);
        await expectVisibleButtonsReachable(page, ".bottom-tabs button");

        await page.getByRole("button", { name: /Blox/ }).click();
        await page.getByRole("button", { name: /^Start$/ }).click();
        await expectCanvasNonBlank(page, '[data-game-shell="blox"]');
        await expectNoHorizontalScroll(page);
        await page.getByRole("button", { name: /Pause/ }).click();
        await page.locator(".game-menu-overlay:visible").getByRole("button", { name: /^Exit$/ }).click();

        await page.getByRole("button", { name: /Gems/ }).click();
        await page.getByRole("button", { name: /^Start$/ }).click();
        await expect(page.locator('[data-game-shell="match3"] .game-play-event-log')).toHaveCount(0);
        await expectCanvasNonBlank(page, '[data-game-shell="match3"]');
        await expectMatch3HudClearOfBoard(page);
        await expectNoHorizontalScroll(page);
        await page.getByRole("button", { name: /Pause/ }).click();
        await expectVisibleButtonsReachable(page, ".match3-pause-compact:visible button");

        expect(pageErrors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
