import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 568, label: "small-mobile" },
  { width: 360, height: 800, label: "common-android" },
  { width: 390, height: 844, label: "common-mobile", deviceScaleFactor: 2 },
  { width: 414, height: 896, label: "large-mobile" },
  { width: 568, height: 320, label: "phone-landscape-compact" },
  { width: 844, height: 390, label: "phone-landscape" },
  { width: 768, height: 1024, label: "tablet-portrait" },
  { width: 1024, height: 768, label: "tablet-landscape" },
  { width: 1280, height: 720, label: "desktop-smoke", isMobile: false, hasTouch: false },
];

async function bootMatrixPage(browser, baseURL, viewport) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    isMobile: viewport.isMobile ?? viewport.width <= 1024,
    hasTouch: viewport.hasTouch ?? true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((label) => {
    window.localStorage.setItem("garden_shelf_language", "en");
    window.localStorage.setItem("gh_dev_user_id", `mobile_matrix_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
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
  const smallButtons = await page.locator(selector).evaluateAll((buttons, side) => buttons
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
  expect(smallButtons).toEqual([]);
}

async function expectCanvasNonBlank(page, shellSelector) {
  const canvas = page.locator(`${shellSelector} .pixi-host canvas`).first();
  await expect(canvas).toBeVisible();
  const length = await canvas.evaluate((node) => node.toDataURL("image/png").length);
  expect(length).toBeGreaterThan(2000);
}

async function expectMatch3BoardBelowHud(page) {
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

test.describe("mobile UI viewport matrix", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.label} fits without horizontal scroll or clipped primary controls`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);

      const { context, page, pageErrors } = await bootMatrixPage(browser, baseURL, viewport);
      try {
        await expectNoHorizontalScroll(page);
        await expect(page.getByText("My Garden")).toBeVisible();
        await expectVisibleButtonsReachable(page, ".bottom-tabs button");

        await page.getByRole("button", { name: /Blox/ }).click();
        await page.getByRole("button", { name: /^Start$/ }).click();
        await expectCanvasNonBlank(page, '[data-game-shell="blox"]');
        await expectNoHorizontalScroll(page);
        await page.getByRole("button", { name: /Pause/ }).click();
        await expect(page.locator(".game-menu-overlay:visible")).toBeVisible();
        await expectVisibleButtonsReachable(page, ".game-menu-overlay:visible button");
        await page.locator(".game-menu-overlay:visible").getByRole("button", { name: /^Exit$/ }).click();
        await expect(page.locator(".bottom-tabs")).toBeVisible();

        await page.getByRole("button", { name: /Gems/ }).click();
        await page.getByRole("button", { name: /^Start$/ }).click();
        await expect(page.locator('[data-game-shell="match3"] .game-play-event-log')).toHaveCount(0);
        await expectCanvasNonBlank(page, '[data-game-shell="match3"]');
        await expectMatch3BoardBelowHud(page);
        await expectNoHorizontalScroll(page);
        await page.getByRole("button", { name: /Pause/ }).click();
        await expect(page.locator(".match3-pause-compact:visible")).toBeVisible();
        await expectVisibleButtonsReachable(page, ".match3-pause-compact:visible button");
        await page.locator(".game-menu-overlay:visible").getByRole("button", { name: /^Exit$/ }).click();
        await expect(page.locator(".bottom-tabs")).toBeVisible();

        await page.getByRole("button", { name: /Merge/ }).click();
        await expectCanvasNonBlank(page, '[data-game-shell="merge"]');
        await expect(page.locator(".merge-action-dock")).toBeVisible();
        await expectVisibleButtonsReachable(page, ".merge-action-dock button");
        await expectNoHorizontalScroll(page);
        await page.getByRole("button", { name: /Pause/ }).click();
        await page.locator(".game-menu-overlay:visible").getByRole("button", { name: /^Exit$/ }).click();
        await expect(page.locator(".bottom-tabs")).toBeVisible();

        await page.getByRole("button", { name: /Bubbo/ }).click();
        await page.getByRole("button", { name: /^Start$/ }).click();
        await expectCanvasNonBlank(page, '[data-game-shell="bubbo"]');
        await expectNoHorizontalScroll(page);
        await page.getByRole("button", { name: /Pause/ }).click();
        await expectVisibleButtonsReachable(page, ".game-menu-overlay:visible button");
        await page.locator(".game-menu-overlay:visible").getByRole("button", { name: /^Exit$/ }).click();
        await expect(page.locator(".bottom-tabs")).toBeVisible();

        await page.getByRole("button", { name: /Trivia/ }).click();
        await page.getByRole("button", { name: "Solo" }).click();
        await expect(page.locator(".question-panel")).toBeVisible({ timeout: 10000 });
        await expectNoHorizontalScroll(page);
        await page.getByRole("button", { name: /Pause/ }).click();
        await expectVisibleButtonsReachable(page, ".game-menu-overlay:visible button");
        await page.locator(".game-menu-overlay:visible").getByRole("button", { name: /^Exit$/ }).click();
        await expect(page.locator(".bottom-tabs")).toBeVisible();

        await page.getByRole("button", { name: /Yard/ }).click();
        await expect(page.locator(".companion-yard-stage")).toBeVisible();
        await expectVisibleButtonsReachable(page, ".yard-bottom-dock button");
        await expectNoHorizontalScroll(page);

        expect(pageErrors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
